import {phase, ENTRY} from './signal-motion.js';

/** Quiet radio interference that follows the same clock as the gathering scene. */
export function radioState(time) {
  const settle=phase(time, .3, ENTRY.end), near=phase(time, 5.5, ENTRY.end);
  const flutter=.45+.55*(.5+.5*Math.sin(time*19+Math.sin(time*7)*3));
  return {
    coherence:.82*settle,
    noise:(.048*(1-settle)+.003)*flutter,
    frequency:440+(1-settle)*(150*Math.sin(time*3.1)+75*Math.sin(time*7.3)),
    detune:mixDetune(settle),
    tone:.008+.023*near,
    cutoff:900+1400*settle,
  };
}
const mixDetune=settle=>4+110*(1-settle);

/** Uses the song's AudioContext, with its own mute and bounded node lifetime. */
export class SignalRadio {
  start(context, muted=false) {
    this.stop();
    if(!context||context.state==='closed')return;
    this.context=context;this.muted=muted;this.active=true;
    const output=context.createGain(),hiss=context.createGain(),tone=context.createGain(),filter=context.createBiquadFilter();
    output.gain.value=muted?0:1;hiss.gain.value=0;tone.gain.value=0;
    filter.type='bandpass';filter.frequency.value=1100;filter.Q.value=.8;
    const noise=context.createBufferSource(),a=context.createOscillator(),b=context.createOscillator();
    const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
    let seed=4271;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed>>>0)/4294967296*2-1;}
    noise.buffer=buffer;noise.loop=true;a.type=b.type='sine';a.frequency.value=350;b.frequency.value=570;
    noise.connect(filter).connect(hiss).connect(output);a.connect(tone);b.connect(tone);tone.connect(output);output.connect(context.destination);
    this.nodes=[noise,a,b,filter,hiss,tone,output];this.sources=[noise,a,b];
    Object.assign(this,{output,hiss,tone,filter,a,b});
    let remaining=this.sources.length;const nodes=this.nodes;
    for(const source of this.sources){source.onended=()=>{if(--remaining===0)nodes.forEach(n=>n.disconnect());};source.start();}
    this.update(0);
  }
  update(time) {
    if(!this.active)return;
    const s=radioState(time),now=this.context.currentTime;
    this.hiss.gain.setTargetAtTime(s.noise,now,.025);this.tone.gain.setTargetAtTime(s.tone,now,.035);
    this.filter.frequency.setTargetAtTime(s.cutoff,now,.04);
    this.a.frequency.setTargetAtTime(s.frequency,now,.035);this.b.frequency.setTargetAtTime(s.frequency+s.detune,now,.035);
  }
  mute(muted) {
    this.muted=muted;
    if(this.active)this.output.gain.setTargetAtTime(muted?0:1,this.context.currentTime,.01);
  }
  connect() {
    if(!this.active)return;
    const now=this.context.currentTime;
    // The two pitches meet as the actual recording emits its first playing event.
    this.a.frequency.setTargetAtTime(440,now,.008);this.b.frequency.setTargetAtTime(440,now,.008);
    this.hiss.gain.setTargetAtTime(0,now,.004);
    this.stop(.12);
  }
  stop(release=.025) {
    if(!this.active)return;
    this.active=false;
    const now=this.context.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value,now);
    this.output.gain.linearRampToValueAtTime(0,now+release);
    for(const source of this.sources)try{source.stop(now+release+.015);}catch{}
    this.sources=[];this.nodes=[];
  }
}
