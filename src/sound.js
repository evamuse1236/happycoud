import { clamp, hash, random } from './math.js';

// Original, locally synthesized D-major pentatonic palette. No recordings or downloads.
export const SCALE = Object.freeze([146.8324,164.8138,184.9972,220,246.9417,293.6648,329.6276,369.9944]);
export function noteFor(id){return SCALE[hash(id)%SCALE.length];}
export function audioMix({zoom=1,motion=0,reading=false,mode='full',enabled=false,visible=true,volume=.32}={}){
  const depth=clamp(Math.log2(Math.max(1,zoom))/5,0,1);
  return { master:enabled&&visible?clamp(volume,0,1)*.48:0,
    bed:mode==='notes'?0:(reading?.18:1)*(.15+.055*depth),
    air:mode==='notes'||reading?0:.012+clamp(motion,0,1)*.055,
    cutoff:480+depth*1250,depth };
}
function glide(param,target,ctx,seconds=.3){
  const t=ctx.currentTime;
  if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(t);
  else{const v=param.value;param.cancelScheduledValues(t);param.setValueAtTime(v,t);}
  param.setTargetAtTime(target,t,Math.max(.012,seconds));
}
/** All audio originates after explicit consent. Silence is an equal first-class entry. */
export class ObservatorySound {
  constructor({contextFactory}={}){
    this.context=null;this.contextFactory=contextFactory;this.enabled=false;this.wanted=false;this.visible=true;
    this.volume=.32;this.mode='full';this.reading=false;this.zoom=1;this.motion=0;
    this.voices=new Set();this.noteHistory=new Map();this.lastNote=-Infinity;this.lastUpdate=-Infinity;
    this.stats={notes:0,dropped:0,cancelled:0};this.suspendTimer=null;this.epoch=0;
  }
  build(){
    const Context=this.contextFactory||globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Context)throw new Error('Sound isn’t available in this browser. Your sky is still here in silence.');
    const ctx=this.context=new Context();
    const gain=(value=0)=>{const node=ctx.createGain();node.gain.value=value;return node;};
    this.master=gain();this.limiter=ctx.createDynamicsCompressor();
    this.limiter.threshold.value=-16;this.limiter.knee.value=16;this.limiter.ratio.value=6;this.limiter.attack.value=.006;this.limiter.release.value=.35;
    this.master.connect(this.limiter);this.limiter.connect(ctx.destination);
    this.bed=gain(.15);this.notes=gain(1);this.air=gain(.012);
    this.bed.connect(this.master);this.notes.connect(this.master);this.air.connect(this.master);
    const reverb=ctx.createConvolver(),tail=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*2.7),ctx.sampleRate);
    for(let channel=0;channel<2;channel++){
      const r=random(371+channel),arr=tail.getChannelData(channel);let low=0;
      for(let i=0;i<arr.length;i++){low=low*.72+(r()*2-1)*.28;arr[i]=low*Math.pow(1-i/arr.length,3.1)*.35;}
    }
    reverb.buffer=tail;const wet=gain(.22);reverb.connect(wet);wet.connect(this.master);this.reverb=reverb;
    this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=480;this.filter.Q.value=.4;this.filter.connect(this.bed);
    this.drones=[];
    [73.4162,110,146.8324,184.9972].forEach((freq,i)=>{
      const osc=ctx.createOscillator(),g=gain([.28,.13,.08,.055][i]);osc.type='sine';osc.frequency.value=freq;osc.detune.value=[-2,1,2,-1][i];osc.connect(g);g.connect(this.filter);osc.start();this.drones.push(osc);
    });
    // A periodic, seam-free low-level air buffer. The attack/release is envelope-driven.
    const noise=ctx.createBuffer(2,ctx.sampleRate*5,ctx.sampleRate);
    for(let c=0;c<2;c++){
      const arr=noise.getChannelData(c),r=random(529+c);let s=0;
      for(let i=0;i<arr.length;i++){s=s*.88+(r()*2-1)*.12;arr[i]=s*Math.sin(Math.PI*i/(arr.length-1))**2;}
    }
    this.wind=ctx.createBufferSource();this.wind.buffer=noise;this.wind.loop=true;
    const band=ctx.createBiquadFilter();band.type='bandpass';band.frequency.value=920;band.Q.value=.45;
    this.wind.connect(band);band.connect(this.air);this.wind.start();
    this.applyMix();
  }
  async enable(){
    this.wanted=true;const epoch=++this.epoch;clearTimeout(this.suspendTimer);
    try{
      if(!this.context)this.build();
      await this.context.resume();
      if(epoch!==this.epoch)return this.enabled;
      this.enabled=true;this.applyMix();return true;
    }catch(error){if(epoch===this.epoch){this.wanted=false;this.enabled=false;this.applyMix();}throw error;}
  }
  disable(){++this.epoch;this.wanted=false;this.enabled=false;this.hush();this.applyMix();this.scheduleSuspend();return false;}
  async toggle(){return this.wanted||this.enabled?this.disable():this.enable();}
  setVolume(value){this.volume=clamp(Number(value)||0,0,1);this.applyMix();}
  setMode(mode){this.mode=mode==='notes'?'notes':'full';this.applyMix();}
  setReading(value){this.reading=!!value;if(this.reading)this.hush(new Set(['arrival','approach','hover','return']));this.applyMix();}
  setAudible(value){
    this.visible=!!value;clearTimeout(this.suspendTimer);this.applyMix();
    if(!this.visible){this.hush();this.scheduleSuspend();}
    else if(this.enabled&&this.context?.state==='suspended')this.context.resume().catch(()=>{this.enabled=false;this.wanted=false;this.applyMix();});
  }
  scheduleSuspend(){
    clearTimeout(this.suspendTimer);this.suspendTimer=setTimeout(()=>{
      if((!this.visible||!this.enabled)&&this.context?.state==='running')this.context.suspend().catch(()=>{});
    },1500);
  }
  update(zoom,motion){
    this.zoom=zoom;this.motion=motion;
    if(!this.context||this.context.currentTime-this.lastUpdate<.095)return;
    this.lastUpdate=this.context.currentTime;this.applyMix();
  }
  applyMix(){
    this.mix=audioMix({...this,enabled:this.enabled,visible:this.visible});
    if(!this.context)return;
    glide(this.master.gain,this.mix.master,this.context,.20);
    glide(this.bed.gain,this.mix.bed,this.context,.65);glide(this.air.gain,this.mix.air,this.context,.3);
    glide(this.filter.frequency,this.mix.cutoff,this.context,.6);
  }
  pluck(id,{pan=0,kind='hover',delay=0,transpose=1}={}){
    if(!this.enabled||!this.visible||!this.context||this.context.state!=='running')return false;
    const now=this.context.currentTime;
    if(this.voices.size>=12||kind==='hover'&&(this.reading||now-this.lastNote<.6||now-(this.noteHistory.get(id)??-100)<7)){
      this.stats.dropped++;return false;
    }
    const frequency=noteFor(id)*transpose;
    const when=now+Math.max(0,delay),duration=kind==='hover'?1.6:2.3;
    const amplitudes=kind==='hover'?[.07,.012]:kind==='keep'?[.12,.024]:[.105,.019];
    const ctx=this.context,envelope=ctx.createGain();envelope.gain.value=0;
    envelope.gain.setValueAtTime(0,when);envelope.gain.linearRampToValueAtTime(1,when+.018);
    envelope.gain.exponentialRampToValueAtTime(.0001,when+duration);
    const panner=ctx.createStereoPanner?.();
    if(panner){panner.pan.value=clamp(pan,-.65,.65);envelope.connect(panner);panner.connect(this.notes);}else envelope.connect(this.notes);
    envelope.connect(this.reverb);
    const oscillators=[1,2.003].map((multiple,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=frequency*multiple;g.gain.value=amplitudes[i];o.connect(g);g.connect(envelope);o.start(when);o.stop(when+duration+.08);return {o,g};
    });
    const voice={envelope,panner,oscillators,kind,when,cancelled:false};this.voices.add(voice);
    oscillators[0].o.onended=()=>{for(const {o,g} of oscillators){o.disconnect();g.disconnect();}envelope.disconnect();panner?.disconnect();this.voices.delete(voice);};
    this.lastNote=now;this.noteHistory.set(id,now);if(this.noteHistory.size>256)this.noteHistory.delete(this.noteHistory.keys().next().value);
    this.stats.notes++;return true;
  }
  hush(kinds=null){
    if(!this.context)return;
    const now=this.context.currentTime;
    for(const voice of this.voices){
      if(voice.cancelled||(kinds&&!kinds.has(voice.kind)))continue;
      voice.cancelled=true;this.stats.cancelled++;
      // Cancel future notes and current navigation tails with a short release.
      // Nothing stale should resume after a tab has been hidden.
      glide(voice.envelope.gain,0,this.context,.012);
      for(const {o} of voice.oscillators){try{o.stop(now+.065);}catch{}}
    }
  }
  event(kind,id='sky',pan=0){
    if(!this.enabled||!this.visible||this.reading&&!['open','keep'].includes(kind))return;
    if(kind==='arrival'){
      // Three widely spaced opening notes, never a loop or automatic soundtrack.
      this.pluck('arrival-3',{kind,pan:-.25});this.pluck('arrival-1',{kind,pan:.1,delay:.7});this.pluck('arrival-8',{kind,pan:.3,delay:1.4});
    }else if(kind==='keep'){
      this.pluck(id,{kind,pan});this.pluck(id,{kind,pan,delay:.2,transpose:1.5});
    }else this.pluck(id,{kind,pan,transpose:kind==='return'?.5:1});
  }
  snapshot(){return {enabled:this.enabled,wanted:this.wanted,cancelled:this.stats.cancelled,context:this.context?.state||'not-created',mode:this.mode,volume:this.volume,reading:this.reading,voices:this.voices.size,notes:this.stats.notes,dropped:this.stats.dropped,mix:this.mix||audioMix()};}
  async dispose(){clearTimeout(this.suspendTimer);++this.epoch;this.enabled=false;this.wanted=false;if(this.context&&this.context.state!=='closed')await this.context.close();this.voices.clear();}
}
