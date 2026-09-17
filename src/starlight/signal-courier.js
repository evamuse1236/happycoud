import { cuePosition, landing, clamp, phase } from './signal-motion.js';
const NS = 'http://www.w3.org/2000/svg';
let nextId=0;
/** A soft carrier pulse, not a star sprite. Runs in the host sky's render loop. */
export class SignalCourier {
  constructor(host) {
    this.layer = document.createElementNS(NS, 'svg'); this.layer.classList.add('ls-pulse-layer');
    this.layer.setAttribute('aria-hidden','true');
    const glowId=`ls-light-${++nextId}`;
    this.layer.innerHTML=`<defs><radialGradient id="${glowId}"><stop offset="0" stop-color="#fffce6" stop-opacity=".95"/><stop offset=".12" stop-color="#ffe9ba" stop-opacity=".86"/><stop offset=".36" stop-color="#e0c087" stop-opacity=".3"/><stop offset="1" stop-color="#8bb8e8" stop-opacity="0"/></radialGradient></defs><path class="ls-pulse-tail"/><g class="ls-pulse"><circle class="ls-pulse-halo" r="20" fill="url(#${glowId})"/><path class="ls-pulse-rays" d="M-6 0H6M0-6V6"/><circle class="ls-pulse-core" r="2"/></g>`;
    this.tail=this.layer.querySelector('path'); this.dot=this.layer.querySelector('g'); host.append(this.layer); this.hide();
  }
  draw(cue, {reduced=false,visible=true}={}) {
    if(!cue||!visible){this.hide();return;}
    this.layer.removeAttribute('hidden');
    const p=reduced?cue.to:cuePosition(cue); if(!p){this.hide();return;}
    const squash=!reduced&&cue.phase==='rest'?landing(cue.contact):{x:1,y:1};
    let opacity=1;
    if(!reduced&&cue.dissolve) opacity=cue.u<.5?1-phase(cue.u,0,.38):phase(cue.u,.62,1);
    this.dot.style.opacity=String(clamp(opacity));
    this.dot.setAttribute('transform',`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${squash.x.toFixed(3)} ${squash.y.toFixed(3)})`);
    const samples=[];
    if(!reduced&&cue.phase==='flight'&&!cue.dissolve)for(let i=5;i>=0;i--){
      const u=Math.max(0,cue.u-i*.012),q=cuePosition({...cue,u});samples.push(`${i===5?'M':'L'}${q.x.toFixed(2)},${q.y.toFixed(2)}`);
    }
    this.tail.setAttribute('d',samples.join(' ')); this.position={x:p.x,y:p.y};
  }
  hide(){this.layer.setAttribute('hidden','');this.tail?.setAttribute('d','');this.position=null;}
  dispose(){this.layer.remove();}
}
