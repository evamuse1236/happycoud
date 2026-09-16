import { clamp, hash, random } from './math.js';

/** An original, adaptive chamber-ambient score. No UI bleeps, pitch-sweep
 * navigation, hover notes, downloaded recordings, or automatic playback.
 * Sources: MDN Web Audio best practices / AudioParam automation (see docs). */
export const MAX_VOICES=24;
export const MOOD_INSTRUMENTS=Object.freeze({
  love:Object.freeze({name:'cello',partials:[1,.36,.14,.055],octave:-12,attack:1.7,hold:1.8,release:3.2,level:.075,interval:7.2}),
  laugh:Object.freeze({name:'marimba',partials:[1,0,.12,0,.025],octave:12,attack:.025,hold:.04,release:1.8,level:.085,interval:4.2}),
  poetry:Object.freeze({name:'flute',partials:[1,.065,.018],octave:12,attack:.65,hold:1.1,release:2.6,level:.055,interval:6.1}),
});
export const PROGRESSION=Object.freeze([
  Object.freeze([50,57,61,64]), // D major ninth, open voicing
  Object.freeze([47,54,57,62]), // B minor seventh
  Object.freeze([43,50,57,59]), // G major ninth
  Object.freeze([45,52,59,62]), // A suspended fourth/ninth
]);
export const midiHz = midi => 440*2**((midi-69)/12);
export const noteFor = id => midiHz(PROGRESSION[0][hash(id)%4]);
export function audioMix({zoom=1,motion=0,reading=false,mode='full',enabled=false,visible=true,volume=.42}={}){
  const depth=clamp(Math.log2(Math.max(1,zoom))/5,0,1);
  return {
    master:enabled&&visible?clamp(volume,0,1)*.7:0,
    bed:mode==='notes'?0:(reading?.34:1)*(.72-.18*depth),
    air:mode==='notes'||reading?0:.018*clamp(motion,0,1)**1.35,
    cutoff:reading?1150:1200+depth*800,
    wet:reading?.16:.29+.13*(1-depth),depth,
  };
}
export function glide(param,target,ctx,tau=.22){
  const now=ctx.currentTime;
  if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
  else{const value=param.value;param.cancelScheduledValues(now);param.setValueAtTime(value,now);}
  param.setTargetAtTime(target,now,Math.max(.008,tau));
}

export function feltBuffer(ctx,midi){
  const sampleRate=24000,duration=6.2,length=Math.ceil(duration*sampleRate);
  const buffer=ctx.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
  const rng=random(midi*711),f=midiHz(midi),partials=[];
  for(let h=1;h<=10;h++)partials.push({f:f*h*Math.sqrt(1+.00008*h*h),a:1/h**1.85,phase:rng()*.08,decay:3.0/h**.66});
  let noise=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate,attack=(1-Math.exp(-t/0.027))**2;
    let s=0;
    for(const p of partials)s+=Math.sin(2*Math.PI*p.f*t+p.phase)*p.a*Math.exp(-t/p.decay);
    noise=.93*noise+.07*(rng()*2-1);
    // Soft hammer body, not a bright metallic transient.
    data[i]=(s*.28*attack+noise*.025*Math.exp(-t/.06))*Math.min(1,(duration-t)/.22);
  }
  return buffer;
}
function impulse(ctx){
  const rate=ctx.sampleRate,duration=4.6,length=Math.ceil(rate*duration),buffer=ctx.createBuffer(2,length,rate);
  for(let c=0;c<2;c++){
    const r=random(8273+c*917),data=buffer.getChannelData(c);let smooth=0;
    for(let i=0;i<length;i++){
      const t=i/rate;smooth=.82*smooth+.18*(r()*2-1);
      data[i]=smooth*Math.exp(-t/1.10)*Math.min(1,t/.08)*Math.min(1,(duration-t)/.25);
    }
    for(const [t,gain] of [[.071,.22],[.113,.13],[.193,.07]])data[Math.floor((t+c*.006)*rate)]+=gain;
  }
  return buffer;
}
function envelope(param,when,level,attack,hold,release){
  param.setValueAtTime(0,when);
  param.linearRampToValueAtTime(level,when+attack);
  param.setValueAtTime(level,when+attack+hold);
  param.linearRampToValueAtTime(0,when+attack+hold+release);
  return when+attack+hold+release;
}

export class ObservatorySound {
  constructor({contextFactory}={}){
    this.contextFactory=contextFactory;this.context=null;this.enabled=false;this.wanted=false;this.visible=true;
    this.mood='all';this.moodBuses={};this.moodTargets={};this.moodWaves={};this.nextMood=Infinity;this.moodStep=0;
    this.volume=.42;this.mode='full';this.zoom=1;this.motion=0;this.reading=false;
    this.voices=new Set();this.buffers=new Map();this.generation=0;this.chordIndex=0;
    this.nextChord=0;this.nextFelt=0;this.lastFocus=-Infinity;this.pendingFocus=null;this.interval=null;this.sampleWorker=null;
    this.stats={moodNotes:0,voices:0,peakVoices:0,notes:0,dropped:0,cancelled:0};
  }
  create(){
    const Ctor=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!this.contextFactory&&!Ctor)throw new Error('This browser does not support the score. The sky still works in silence.');
    const ctx=this.contextFactory?this.contextFactory():new Ctor({latencyHint:'playback'});this.context=ctx;
    this.sum=ctx.createGain();this.sum.gain.value=1;
    this.highpass=ctx.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=35;
    this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-8;this.limiter.knee.value=12;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.3;
    this.master=ctx.createGain();this.master.gain.value=0;
    this.sum.connect(this.highpass).connect(this.limiter).connect(this.master).connect(ctx.destination);
    this.bed=ctx.createGain();this.bed.gain.value=0;
    this.bedFilter=ctx.createBiquadFilter();this.bedFilter.frequency.value=1600;this.bedFilter.Q.value=.2;
    this.bed.connect(this.bedFilter).connect(this.sum);
    this.felt=ctx.createGain();this.felt.gain.value=.8;this.felt.connect(this.sum);
    this.reverb=ctx.createConvolver();this.reverb.buffer=impulse(ctx);
    this.predelay=ctx.createDelay(.5);this.predelay.delayTime.value=.037;
    this.reverbFilter=ctx.createBiquadFilter();this.reverbFilter.frequency.value=2400;this.reverbFilter.Q.value=.1;
    this.wet=ctx.createGain();this.wet.gain.value=.34;
    this.predelay.connect(this.reverb).connect(this.reverbFilter).connect(this.wet).connect(this.sum);
    this.bedFilter.connect(this.predelay);this.felt.connect(this.predelay);
    for(const [id,instrument] of Object.entries(MOOD_INSTRUMENTS)){
      const bus=ctx.createGain();bus.gain.value=0;bus.connect(this.sum);bus.connect(this.predelay);this.moodBuses[id]=bus;this.moodTargets[id]=0;
      const real=new Float32Array(instrument.partials.length+1),imag=new Float32Array(real.length);
      instrument.partials.forEach((value,i)=>imag[i+1]=value);
      this.moodWaves[id]=ctx.createPeriodicWave(real,imag);
    }
    const real=new Float32Array(14),imag=new Float32Array(14);
    [0,1,.31,.17,.082,.04,.022,.013,.007,.004].forEach((v,i)=>imag[i]=v);
    this.bowedWave=ctx.createPeriodicWave(real,imag,{disableNormalization:false});
    const noise=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),n=noise.getChannelData(0),r=random(7359);let value=0;
    for(let i=0;i<n.length;i++){value=.97*value+.03*(r()*2-1);n[i]=value*3;}
    this.airSource=ctx.createBufferSource();this.airSource.buffer=noise;this.airSource.loop=true;
    this.airFilter=ctx.createBiquadFilter();this.airFilter.type='bandpass';this.airFilter.frequency.value=380;this.airFilter.Q.value=.5;
    this.air=ctx.createGain();this.air.gain.value=0;this.airSource.connect(this.airFilter).connect(this.air).connect(this.sum);this.airSource.start();
    this.warmPiano();
    return ctx;
  }
  warmPiano(){
    // Prepare future notes off the rendering thread. The offline renderer uses
    // the identical synchronous function; restricted browsers retain that fallback.
    if(this.contextFactory||typeof Worker==='undefined'||this.sampleWorker)return;
    const notes=[...new Set(PROGRESSION.flatMap(chord=>chord.slice(1).flatMap(m=>[m,m+12])))].filter(m=>!this.buffers.has(m));
    if(!notes.length)return;
    const code=`${random.toString()}; const midiHz=${midiHz.toString()}; ${feltBuffer.toString()};
      onmessage=event=>{const factory={createBuffer:(_channels,length,rate)=>{const samples=new Float32Array(length);return {getChannelData:()=>samples};}};
        for(const midi of event.data){const samples=feltBuffer(factory,midi).getChannelData(0);postMessage({midi,samples},[samples.buffer]);}postMessage({done:true});};`;
    let url,worker;const ctx=this.context;
    const finish=()=>{worker?.terminate();if(url)URL.revokeObjectURL(url);if(this.sampleWorker===worker)this.sampleWorker=null;};
    try{
      url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));worker=new Worker(url);this.sampleWorker=worker;this.finishSamples=finish;
      worker.onmessage=({data})=>{
        if(data.done||this.context!==ctx||ctx.state==='closed'){finish();return;}
        if(!this.buffers.has(data.midi)){const b=ctx.createBuffer(1,data.samples.length,24000);b.copyToChannel(data.samples,0);this.buffers.set(data.midi,b);}
      };
      worker.onerror=event=>{event.preventDefault();finish();};worker.postMessage(notes);
    }catch{finish();}
  }
  async enable(){
    this.wanted=true;const token=++this.generation;
    try{
      if(this.context?.state==='closed')this.context=null;
      const ctx=this.context||this.create();
      await ctx.resume?.();
      if(token!==this.generation||!this.wanted)return false;
      this.enabled=true;this.nextChord=ctx.currentTime+.06;this.nextFelt=ctx.currentTime+2.7;this.nextMood=this.mood==='all'?Infinity:ctx.currentTime+1.2;
      this.tick();clearInterval(this.interval);this.interval=setInterval(()=>this.tick(),100);this.applyMix();
      return true;
    }catch(error){if(token===this.generation){this.enabled=false;this.wanted=false;}throw error;}
  }
  disable(){
    this.wanted=false;this.enabled=false;this.pendingFocus=null;const token=++this.generation;
    clearInterval(this.interval);this.interval=null;
    if(!this.context)return;
    this.applyMix(.035);this.cancelVoices();
    // Token-guarded: a late suspend cannot mute a rapid off/on gesture.
    setTimeout(()=>{if(this.generation===token&&!this.enabled&&this.context?.state==='running')this.context.suspend?.().catch(()=>{});},160);
  }
  async setVisible(visible){
    this.visible=visible;
    if(!this.context)return;
    if(!visible){this.generation++;this.enabled=false;clearInterval(this.interval);this.interval=null;this.pendingFocus=null;this.applyMix(.025);this.cancelVoices();await this.context.suspend?.().catch(()=>{});}
    else if(this.wanted){await this.enable().catch(()=>{});}
  }
  setMood(mood){
    const next=MOOD_INSTRUMENTS[mood]?mood:'all';if(next===this.mood)return;
    this.mood=next;this.moodStep=0;
    // A phrase joins the ongoing harmony after the selection; never a button cue.
    this.nextMood=next==='all'?Infinity:(this.context?.currentTime||0)+1.2;this.applyMix();
  }
  setVolume(volume){this.volume=clamp(Number(volume)||0,0,1);this.applyMix();}
  setMode(mode){this.mode=mode==='notes'?'notes':'full';this.applyMix();}
  update({zoom=this.zoom,motion=this.motion,reading=this.reading}={}){
    this.zoom=zoom;this.motion=motion;this.reading=reading;this.applyMix();
  }
  applyMix(tau=.35){
    if(!this.context||!this.master)return;
    const mix=audioMix(this),ctx=this.context;
    for(const [id,bus] of Object.entries(this.moodBuses)){
      const target=id===this.mood&&this.mode!=='notes'?(this.reading?.28:.7):0;
      // Schedule one continuous crossfade per target change, instead of
      // rebuilding the automation timeline on every camera update.
      if(this.moodTargets[id]!==target){this.moodTargets[id]=target;glide(bus.gain,target,ctx,.9);}
    }
    glide(this.master.gain,mix.master,ctx,tau);glide(this.bed.gain,mix.bed,ctx,.65);
    glide(this.bedFilter.frequency,mix.cutoff,ctx,.9);glide(this.wet.gain,mix.wet,ctx,.8);glide(this.air.gain,mix.air,ctx,.4);
  }
  track(sources,nodes,gain,end){
    if(this.voices.size>=MAX_VOICES){this.stats.dropped++;sources.forEach(s=>{try{s.stop();}catch{}});nodes.forEach(n=>n.disconnect());return null;}
    const v={sources,nodes,gain,end};this.voices.add(v);this.stats.voices=this.voices.size;this.stats.peakVoices=Math.max(this.stats.peakVoices,this.voices.size);
    let remaining=sources.length;
    for(const source of sources)source.onended=()=>{if(--remaining<=0){this.voices.delete(v);nodes.forEach(n=>{try{n.disconnect();}catch{}});this.stats.voices=this.voices.size;}};
    return v;
  }
  bow(midi,when,pan,level=.034){
    const ctx=this.context,gain=ctx.createGain(),panner=ctx.createStereoPanner();panner.pan.value=pan;gain.connect(panner).connect(this.bed);
    const end=envelope(gain.gain,when,level,3.8,8,5.6),sources=[];
    for(const cents of [-3.1,3.1]){
      const osc=ctx.createOscillator();osc.setPeriodicWave(this.bowedWave);osc.frequency.value=midiHz(midi);osc.detune.value=cents;osc.connect(gain);osc.start(when);osc.stop(end+.04);sources.push(osc);
    }
    this.track(sources,[...sources,gain,panner],gain,end);
  }
  piano(midi,when,pan=0,level=.2){
    const ctx=this.context;
    if(!this.buffers.has(midi))this.buffers.set(midi,feltBuffer(ctx,midi));
    const source=ctx.createBufferSource();source.buffer=this.buffers.get(midi);
    const gain=ctx.createGain();gain.gain.setValueAtTime(level,when);
    const panner=ctx.createStereoPanner();panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(this.felt);source.start(when);source.stop(when+source.buffer.duration+.02);
    this.track([source],[source,gain,panner],gain,when+source.buffer.duration);this.stats.notes++;
  }
  moodNote(midi,when){
    const instrument=MOOD_INSTRUMENTS[this.mood],ctx=this.context;
    if(!instrument||this.mode==='notes')return;
    const osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createStereoPanner();
    osc.setPeriodicWave(this.moodWaves[this.mood]);osc.frequency.value=midiHz(midi+instrument.octave);
    panner.pan.value=Math.sin(this.moodStep*.9)*.24;
    osc.connect(gain).connect(panner).connect(this.moodBuses[this.mood]);
    const end=envelope(gain.gain,when,instrument.level,instrument.attack,instrument.hold,instrument.release);
    osc.start(when);osc.stop(end+.04);
    const voice=this.track([osc],[osc,gain,panner],gain,end);
    if(voice){voice.mood=this.mood;this.stats.moodNotes++;}
  }
  tick(){
    if(!this.enabled||!this.visible||!this.context||this.context.state!=='running')return;
    const ctx=this.context,now=ctx.currentTime,horizon=now+.16;
    // After a stalled/hidden tab, do not play missed cues in a burst.
    if(this.nextChord<now-1)this.nextChord=now+.05;
    if(this.nextFelt<now-1)this.nextFelt=now+2.5;
    if(this.nextMood<now-1)this.nextMood=now+1.2;
    if(this.nextChord<=horizon){
      const chord=PROGRESSION[this.chordIndex%PROGRESSION.length];this.currentChord=chord;
      chord.forEach((m,i)=>this.bow(m,this.nextChord+i*.017,(i-1.5)*.28,i===0?.044:.030));
      this.chordIndex++;this.nextChord+=13.8;
    }
    if(this.nextMood<=horizon&&MOOD_INSTRUMENTS[this.mood]){
      const chord=this.currentChord||PROGRESSION[0];
      this.moodNote(chord[1+(this.moodStep++%3)],this.nextMood);
      this.nextMood+=MOOD_INSTRUMENTS[this.mood].interval;
    }
    if(this.pendingFocus&&now>=this.pendingFocus.at){
      const {id,pan}=this.pendingFocus;this.pendingFocus=null;
      if(now-this.lastFocus>=3){const chord=this.currentChord||PROGRESSION[0];this.piano(chord[1+hash(id)%3]+12,now+.035,pan,.16);this.lastFocus=now;this.nextFelt=Math.max(this.nextFelt,now+5.5);}
    }
    if(this.nextFelt<=horizon){
      const r=random(this.chordIndex*971+Math.floor(this.nextFelt)*317),chord=this.currentChord||PROGRESSION[0];
      if(!this.reading)this.piano(chord[1+Math.floor(r()*3)]+(r()>.6?12:0),this.nextFelt,(r()-.5)*.65,.17);
      this.nextFelt+=4.8+r()*3.5;
    }
  }
  focus(id,pan=0){if(this.enabled&&this.visible)this.pendingFocus={id,pan:clamp(pan,-.55,.55),at:this.context.currentTime+.28};}
  // Compatibility callers are deliberately silent except a selected memory.
  event(name,id='',pan=0){if(['reader-open','open','keep'].includes(name))this.focus(id,pan);}
  note(){/* Hover is visual. The score is allowed to breathe. */}
  cancelVoices(){
    if(!this.context)return;const now=this.context.currentTime;
    for(const v of this.voices){
      try{glide(v.gain.gain,0,this.context,.018);}catch{}
      for(const s of v.sources){try{s.stop(now+.08);}catch{}}
      this.stats.cancelled++;
    }
  }
  dispose(){this.disable();this.generation++;this.finishSamples?.();try{this.airSource?.stop();}catch{}this.context?.close?.().catch(()=>{});}
}
