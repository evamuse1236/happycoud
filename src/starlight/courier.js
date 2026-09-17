import { clamp, mix } from './core.js';
const NS = 'http://www.w3.org/2000/svg';
const cubic = (a,b,c,d,p) => {
  const q=1-p;
  return {x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,
    y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};
};

/** A ballistic hop in one row; a clear, rounded return around a wrapped row.
 * Rows use glyph bounds. The star has a seven-pixel visible radius.
 */
export function bouncePoint(from,to,progress,duration=.4) {
  const p=clamp(progress);
  if(p===0)return {x:from.x,y:from.y};
  if(p===1)return {x:to.x,y:to.y};
  const height=Math.min(34,Math.max(8,1100*duration*duration/8));
  const ceiling=to.row?.ceiling ?? Math.min(from.y,to.y)-65;
  const lift=Math.max(0,Math.min(height,Math.min(from.y,to.y)-ceiling));
  if(from.row && to.row && from.row!==to.row && to.y>from.y+10) {
    // Never cut diagonally through the first sentence. Clear its right edge,
    // descend outside the letters, then return through the gap between rows.
    const right=Math.max(from.row.right,to.row.edge ?? to.row.right)+20;
    const lane=Math.max(ceiling,to.y-Math.min(height,18));
    const shoulder={x:right,y:from.y},turn={x:right,y:lane};
    if(p<.24)return cubic(from,{x:from.x,y:from.y-height},{x:right,y:from.y-height},shoulder,p/.24);
    if(p<.46)return cubic(shoulder,{x:right,y:mix(from.y,lane,.3)},{x:right,y:lane},turn,(p-.24)/.22);
    return cubic(turn,{x:mix(right,to.x,.35),y:lane},{x:to.x,y:lane},to,(p-.46)/.54);
  }
  if(to.row && to.y<from.y-10) {
    // At a phrase change the old final word may be below the incoming line.
    // Rise beside its right edge before returning above it; never sweep up
    // through the new sentence while that sentence is dissolving in.
    const right=Math.max(from.x,from.row?.right ?? from.x,to.row.edge ?? to.row.right)+20;
    const shoulder={x:right,y:from.y},turn={x:right,y:to.y-height};
    if(p<.25)return cubic(from,{x:mix(from.x,right,.35),y:from.y},{x:right,y:from.y},shoulder,p/.25);
    if(p<.55)return cubic(shoulder,{x:right,y:mix(from.y,turn.y,.3)},{x:right,y:turn.y},turn,(p-.25)/.3);
    return cubic(turn,{x:mix(right,to.x,.35),y:turn.y},{x:to.x,y:turn.y},to,(p-.55)/.45);
  }
  // Constant horizontal velocity and constant downward acceleration: a real
  // takeoff, a slower apex, and a definite contact at the audio timestamp.
  return {x:mix(from.x,to.x,p),y:mix(from.y,to.y,p)-4*lift*p*(1-p)};
}

/** A single audio-clock-driven star; no queued flights or detached words. */
export class Courier {
  constructor(host) {
    this.layer=document.createElement('div');this.layer.className='sl-courier-layer';this.layer.setAttribute('aria-hidden','true');
    this.trail=document.createElementNS(NS,'svg');this.trail.classList.add('sl-trail');
    this.path=document.createElementNS(NS,'path');this.trail.append(this.path);
    this.star=document.createElement('i');this.star.className='sl-courier';
    this.star.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 1C12 9 9 12 1 12c8 0 11 3 11 11 0-8 3-11 11-11C15 12 12 9 12 1Z"/></svg><b></b>';
    this.motes=Array.from({length:5},()=>{const m=document.createElement('i');m.className='sl-mote';return m;});
    this.layer.append(this.trail,...this.motes,this.star);host.append(this.layer);this.hide();
  }
  hide(){this.layer.hidden=true;this.path.setAttribute('d','');}
  idle(time,reduced=false){
    if(!this.lastPosition)return;
    this.draw({from:this.lastPosition,to:this.lastPosition,phase:'rest',progress:1,time,reduced});
  }
  draw({from,to,progress,phase,reduced=false,time=0,duration=.4}) {
    if(!from||!to||!Number.isFinite(to.x+to.y+from.x+from.y))return;
    this.layer.hidden=false;
    const p=clamp(progress),flying=phase==='flight';
    const point=q=>bouncePoint(from,to,q,duration);
    const at=reduced||!flying?{x:to.x,y:to.y}:point(p);
    this.lastPosition={...at,row:to.row};
    // Brief compression on contact followed by one small elastic recovery.
    // Keep the bottom tip planted while the star compresses.
    const impact=reduced||flying?0:.23*Math.cos(p*Math.PI*2.5)*Math.exp(-p*7);
    const stretch=reduced||!flying?0:.055*Math.abs(2*p-1);
    const sx=1+impact-stretch,sy=1-impact+stretch;
    this.star.style.transform=`translate3d(${at.x-10}px,${at.y-10+impact*8}px,0) scale(${sx},${sy})`;
    this.star.style.opacity=String(flying?.96:.94+Math.sin(time*2)*.035);
    const tail=[];
    if(flying&&!reduced)for(let i=0;i<5;i++)tail.push(point(clamp(p-i*.009)));
    this.path.setAttribute('d',tail.length?'M'+tail.map(t=>`${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' L'):'');
    this.trail.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    this.motes.forEach((m,i)=>{
      m.hidden=reduced||flying||p>=1;
      if(m.hidden)return;
      const radius=2+p*(8+i),angle=Math.PI+i*Math.PI/4;
      m.style.transform=`translate3d(${to.x+Math.cos(angle)*radius}px,${to.y+8+Math.sin(angle)*radius}px,0) scale(${.65-p*.4})`;
      m.style.opacity=String(Math.sin(Math.PI*p)*(1-p)*.4);
    });
  }
  dispose(){this.layer.remove();}
}
