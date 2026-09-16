import { SCORE_PROFILES, scoreMix, eventsForBar, nextBoundary, midiHz } from './score-plan.js';
export { midiHz } from './score-plan.js';
export const MAX_VOICES=32;
export const MOOD_INSTRUMENTS=Object.freeze({love:{name:'warm chamber ensemble'},poetry:{name:'nocturne'},laugh:{name:'light chamber ostinato'}});
export const PROGRESSION=SCORE_PROFILES.all.chords;
export const audioMix=scoreMix;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function hash(s){let n=2166136261;for(const c of String(s))n=Math.imul(n^c.codePointAt(0),16777619);return n>>>0;}
export const noteFor=id=>midiHz(PROGRESSION[0][hash(id)%4]);
export function glide(param,target,ctx,tau=.25){
  const now=ctx.currentTime;
  if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
  else{const value=param.value;param.cancelScheduledValues(now);param.setValueAtTime(value,now);}
  param.setTargetAtTime(target,now,Math.max(.008,tau));
}
/** Deterministic, dark piano-like synthesis; deliberately not advertised as a real piano recording. */
export function feltBuffer(ctx,midi){
  const rate=22050,duration=4.4,length=Math.ceil(rate*duration),buffer=ctx.createBuffer(1,length,rate),data=buffer.getChannelData(0);
  const frequency=440*2**((midi-69)/12);let seed=(midi*92821)|0,noise=0;
  for(let i=0;i<length;i++){
    const t=i/rate,attack=(1-Math.exp(-t/.025))**2;let sample=0;
    for(let h=1;h<=7;h++)sample+=Math.sin(2*Math.PI*frequency*h*Math.sqrt(1+.00005*h*h)*t)*Math.exp(-t/(2.8/h**.7))/h**1.95;
    seed=(Math.imul(seed,1664525)+1013904223)|0;noise=.92*noise+.08*((seed>>>0)/4294967296*2-1);
    data[i]=(sample*.29*attack+noise*.008*Math.exp(-t/.045))*Math.min(1,(duration-t)/.25);
  }
  return buffer;
}
function impulse(ctx){
  const rate=ctx.sampleRate,duration=3.7,b=ctx.createBuffer(2,Math.ceil(rate*duration),rate);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);let seed=917+c*839,s=0;
    for(let i=0;i<d.length;i++){const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)|0;s=.78*s+.22*((seed>>>0)/4294967296*2-1);d[i]=s*Math.exp(-t/1.05)*Math.min(1,t/.065)*Math.min(1,(duration-t)/.25);}
  }return b;
}
function env(p,t,v,attack,hold,release){p.setValueAtTime(0,t);p.linearRampToValueAtTime(v,t+attack);p.setValueAtTime(v,t+attack+hold);p.exponentialRampToValueAtTime(.00001,t+attack+hold+release);p.linearRampToValueAtTime(0,t+attack+hold+release+.06);return t+attack+hold+release+.07;}

/** One musical clock, distinct arrangements, shared acoustic space, separate recording bus. */
export class ObservatorySound {
  constructor({contextFactory}={}){
    Object.assign(this,{contextFactory,context:null,enabled:false,wanted:false,visible:true,volume:.42,mode:'full',mood:'all',currentMood:'all',zoom:1,motion:0,reading:false,performance:0,mediaActive:false});
    this.voices=new Set();this.buffers=new Map();this.banks={};this.moodBuses={};this.moodTargets={};this.params=new WeakMap();this.generation=0;this.queue=[];this.chordIndex=0;this.bar=0;this.nextBar=0;
    this.stats={notes:0,moodNotes:0,voices:0,peakVoices:0,dropped:0,cancelled:0};
  }
  create(){
    const C=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!this.contextFactory&&!C)throw new Error('The sky works in silence. This browser cannot play its score.');
    const ctx=this.contextFactory?this.contextFactory():new C({latencyHint:'playback'});this.context=ctx;
    this.sum=ctx.createGain();this.master=ctx.createGain();this.master.gain.value=0;
    this.filter=ctx.createBiquadFilter();this.filter.frequency.value=1900;this.filter.Q.value=.25;
    this.highpass=ctx.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=35;
    this.limiter=ctx.createDynamicsCompressor();Object.assign(this.limiter.threshold,{value:-9});this.limiter.knee.value=15;this.limiter.ratio.value=8;this.limiter.attack.value=.008;this.limiter.release.value=.35;
    this.sum.connect(this.filter).connect(this.highpass).connect(this.master).connect(this.limiter).connect(ctx.destination);
    this.reverb=ctx.createConvolver();this.reverb.buffer=impulse(ctx);
    this.wet=ctx.createGain();this.wet.gain.value=.3;this.reverb.connect(this.wet).connect(this.sum);
    for(const [id,p] of Object.entries(SCORE_PROFILES)){
      const bus=ctx.createGain(),pad=ctx.createGain(),piano=ctx.createGain(),send=ctx.createGain();
      bus.gain.value=0;send.gain.value=.45;pad.connect(bus);piano.connect(bus);bus.connect(this.sum);bus.connect(send).connect(this.reverb);
      const real=new Float32Array(p.bow.length+1),imag=new Float32Array(p.bow.length+1);p.bow.forEach((v,i)=>imag[i+1]=v);
      this.banks[id]={bus,pad,piano,send,wave:ctx.createPeriodicWave(real,imag)};this.moodBuses[id]=bus;this.moodTargets[id]=0;
    }
    this.warmPiano();return ctx;
  }
  automate(param,value,tau=.3,epsilon=.001){if(this.params.has(param)&&Math.abs(this.params.get(param)-value)<epsilon)return;this.params.set(param,value);glide(param,value,this.context,tau);}
  warmPiano(){
    if(this.contextFactory||typeof Worker==='undefined')return;
    const notes=[...new Set(Object.values(SCORE_PROFILES).flatMap(p=>p.chords.flatMap(c=>c.slice(1).flatMap(m=>[m,m+p.register]))))];
    const source=`${feltBuffer.toString()}; onmessage=e=>{const factory={createBuffer:(_c,n)=>{const d=new Float32Array(n);return{getChannelData:()=>d}}};for(const midi of e.data){const samples=feltBuffer(factory,midi).getChannelData(0);postMessage({midi,samples},[samples.buffer]);}postMessage({done:true});}`;
    let url;
    try{
      url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const worker=new Worker(url);this.worker=worker;
      const finish=()=>{worker.terminate();URL.revokeObjectURL(url);if(this.worker===worker)this.worker=null;};this.stopWorker=finish;
      worker.onmessage=({data})=>{if(data.done||!this.context||this.context.state==='closed'){finish();return;}if(!this.buffers.has(data.midi)){const b=this.context.createBuffer(1,data.samples.length,22050);b.copyToChannel(data.samples,0);this.buffers.set(data.midi,b);}};
      worker.onerror=e=>{e.preventDefault();finish();};worker.postMessage(notes);
    }catch{if(url)URL.revokeObjectURL(url);}
  }
  async enable(){
    this.wanted=true;const token=++this.generation;
    try{const ctx=this.context||this.create();await ctx.resume?.();if(token!==this.generation||!this.wanted)return false;
      this.enabled=true;this.currentMood=this.mood;this.pendingMood=null;this.queue=[];this.nextBar=ctx.currentTime+.08;this.bar=0;
      clearInterval(this.interval);this.interval=setInterval(()=>this.tick(),80);this.tick();this.applyMix();return true;
    }catch(error){if(token===this.generation){this.wanted=false;this.enabled=false;}throw error;}
  }
  disable(){
    this.wanted=false;this.enabled=false;const token=++this.generation;clearInterval(this.interval);this.interval=null;this.queue=[];this.applyMix(.045);this.cancelVoices();
    setTimeout(()=>{if(token===this.generation&&!this.wanted&&!this.mediaActive)this.context?.suspend?.().catch(()=>{});},220);
  }
  async setVisible(visible){
    this.visible=visible;if(!this.context)return;
    if(!visible){this.generation++;this.enabled=false;clearInterval(this.interval);this.queue=[];this.cancelVoices();this.applyMix(.025);await this.context.suspend?.().catch(()=>{});}
    else {if(this.mediaActive)await this.context.resume?.().catch(()=>{});if(this.wanted)await this.enable().catch(()=>{});}
  }
  setMood(value){
    const next=SCORE_PROFILES[value]?value:'all';if(next===this.mood)return;this.mood=next;
    if(!this.enabled){this.currentMood=next;this.pendingMood=null;return;}
    this.pendingMood={id:next,when:nextBoundary(this.context.currentTime,0,SCORE_PROFILES[this.currentMood].bpm)};
  }
  setMode(mode){this.mode=mode==='notes'?'notes':'full';this.applyMix();}
  setVolume(volume){this.volume=clamp(volume,0,1);this.applyMix();}
  setPerformance(value){this.performance=clamp(value,0,1);this.applyMix(.7);}
  update({zoom=this.zoom,motion=this.motion,reading=this.reading}={}){Object.assign(this,{zoom,motion,reading});this.applyMix();}
  applyMix(tau=.45){
    if(!this.context||!this.master)return;
    const m=scoreMix({...this,mood:this.currentMood});this.mix=m;
    this.automate(this.master.gain,m.master,tau);this.automate(this.filter.frequency,m.cutoff,.7,4);this.automate(this.wet.gain,m.wet,.8);
    for(const [id,b] of Object.entries(this.banks)){
      const target=id===this.currentMood?1:0;this.moodTargets[id]=target;this.automate(b.bus.gain,target,.8);
      this.automate(b.pad.gain,m.pad,.65);this.automate(b.piano.gain,m.piano,.4);
    }
    for(const voice of this.voices)if(voice.pan)this.automate(voice.pan.pan,voice.basePan*m.width,.55);
  }
  tick(){
    if(!this.enabled||!this.visible||!this.context)return;
    const now=this.context.currentTime;
    if(this.pendingMood&&this.pendingMood.when<=now+.12){this.currentMood=this.pendingMood.id;this.pendingMood=null;this.queue=[];this.bar=0;this.nextBar=now+.13;this.applyMix();}
    if(this.performance>.98){this.queue=[];this.nextBar=now+.2;return;}
    if(this.nextBar<now-.5){this.nextBar=now+.04;this.queue=[];}
    if(this.nextBar<=now+.18){
      const plan=eventsForBar(this.currentMood,this.bar,this.nextBar,this.reading),p=plan.profile;
      this.chordIndex=this.bar%p.chords.length;
      this.queue.push({kind:'chord',mood:this.currentMood,when:this.nextBar,plan},...plan.notes.map(n=>({...n,mood:this.currentMood})));
      this.nextBar+=plan.duration;this.bar++;
    }
    this.queue.sort((a,b)=>a.when-b.when);
    while(this.queue.length&&this.queue[0].when<=now+.16){
      const e=this.queue.shift();if(e.when<now-.2)continue;
      if(e.kind==='chord'){
        if(this.mode!=='notes'){
          const p=e.plan.profile;this.bow(e.plan.chord[0],e.when,0,p.bass,e.plan.duration,e.mood,true);
          e.plan.chord.slice(1,4).forEach((m,i)=>this.bow(m,e.when+i*.04,(i-1)*.38,p.pad*.62,e.plan.duration,e.mood));
        }
      }else this.piano(e.midi,e.when,e.pan,e.velocity,e.mood);
    }
  }
  track(sources,nodes,gain,end,mood,pan,basePan=0){
    if(this.voices.size>=MAX_VOICES){this.stats.dropped++;sources.forEach(s=>{try{s.stop();}catch{}});nodes.forEach(n=>{try{n.disconnect();}catch{}});return;}
    const voice={sources,nodes,gain,end,mood,pan,basePan};this.voices.add(voice);this.stats.voices=this.voices.size;this.stats.peakVoices=Math.max(this.stats.peakVoices,this.voices.size);
    let left=sources.length;for(const s of sources)s.onended=()=>{if(--left<=0){this.voices.delete(voice);for(const n of nodes)try{n.disconnect();}catch{}this.stats.voices=this.voices.size;}};
  }
  bow(midi,when,basePan,level,duration,mood,bass=false){
    if(this.voices.size>=MAX_VOICES){this.stats.dropped++;return;}
    const ctx=this.context,gain=ctx.createGain(),pan=ctx.createStereoPanner(),osc=ctx.createOscillator(),bank=this.banks[mood];
    pan.pan.value=basePan*(this.mix?.width??.6);gain.connect(pan).connect(bank.pad);
    if(bass)osc.type='sine';else osc.setPeriodicWave(bank.wave);osc.frequency.value=midiHz(midi);
    const end=env(gain.gain,when,level,bass?.75:1.7,Math.max(.1,duration-2.5),2.4);
    osc.connect(gain);osc.start(when);osc.stop(end+.02);this.track([osc],[osc,gain,pan],gain,end,mood,pan,basePan);
  }
  piano(midi,when,basePan,level,mood=this.currentMood){
    if(this.voices.size>=MAX_VOICES){this.stats.dropped++;return;}
    const ctx=this.context;if(!this.buffers.has(midi))this.buffers.set(midi,feltBuffer(ctx,midi));
    const s=ctx.createBufferSource(),g=ctx.createGain(),pan=ctx.createStereoPanner();s.buffer=this.buffers.get(midi);pan.pan.value=basePan*(this.mix?.width??.6);
    g.gain.value=level;s.connect(g).connect(pan).connect(this.banks[mood].piano);s.start(when);
    this.track([s],[s,g,pan],g,when+s.buffer.duration,mood,pan,basePan);this.stats.notes++;if(mood!=='all')this.stats.moodNotes++;
  }
  focus(id,pan=0){this.focusId=id;this.focusPan=pan;/* Listening makes room; it does not chime at a click. */}
  cancelVoices(){
    const now=this.context?.currentTime||0;
    for(const v of this.voices){try{glide(v.gain.gain,0,this.context,.025);}catch{}for(const s of v.sources)try{s.stop(now+.13);}catch{}this.stats.cancelled++;}
  }
  /** Created once per audio element, in a deliberate user gesture. Not connected to the score mute. */
  attachMedia(element){
    const ctx=this.context||this.create();this.mediaActive=true;ctx.resume?.().catch(()=>{});
    if(this.media?.element===element)return this.media;
    if(this.media)throw new Error('Only one recording can occupy the sky at a time.');
    const source=ctx.createMediaElementSource(element),gain=ctx.createGain(),analyser=ctx.createAnalyser();
    analyser.fftSize=512;analyser.smoothingTimeConstant=.8;gain.gain.value=0;
    source.connect(gain).connect(analyser).connect(ctx.destination);
    this.media={element,source,gain,analyser,samples:new Float32Array(analyser.fftSize)};return this.media;
  }
  setMediaLevel(level,tau=.2){if(this.media)this.automate(this.media.gain.gain,clamp(level,0,1),tau);}
  mediaEnergy(){if(!this.media||this.context.state!=='running')return 0;const {analyser,samples}=this.media;analyser.getFloatTimeDomainData(samples);let sum=0;for(const x of samples)sum+=x*x;return clamp(Math.sqrt(sum/samples.length)*3,0,1);}
  releaseMedia(){this.mediaActive=false;this.setMediaLevel(0,.08);if(!this.wanted)this.context?.suspend?.().catch(()=>{});}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.generation++;clearInterval(this.interval);this.stopWorker?.();this.queue=[];this.cancelVoices();
    try{this.media?.source.disconnect();}catch{}this.context?.close?.().catch(()=>{});this.enabled=false;
  }
}
