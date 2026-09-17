import { clamp, mix } from './core.js';
const NS = 'http://www.w3.org/2000/svg';
const cubic = (a,b,c,d,p) => {
  const q=1-p;
  return {x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,
    y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};
};

// CSS pixels per second squared. Ordinary hops use y = y0 + v0*t + g*t²/2.
export const STAR_GRAVITY = 1200;
const clearance = (from,to) => Math.max(2,Math.min(from.y,to.y)-(to.row?.ceiling ?? to.y-48));
export function hopDuration(from,to) {
  if(!from.row && Math.abs(from.x-to.x)<8 && to.y>from.y)return Math.sqrt(2*(to.y-from.y)/STAR_GRAVITY);
  return Math.abs(to.y-from.y)>12 ? .72 : Math.min(.46,Math.sqrt(8*Math.min(32,clearance(from,to))/STAR_GRAVITY));
}

// Reparameterize joined curves by distance, rather than allocating arbitrary
// percentages to each leg. This carries velocity through both rounded turns.
function distancePath(curves) {
  const samples=[{...curves[0][0],distance:0}];
  for(const curve of curves)for(let i=1;i<=40;i++) {
    const at=cubic(...curve,i/40),last=samples.at(-1);
    samples.push({...at,distance:last.distance+Math.hypot(at.x-last.x,at.y-last.y)});
  }
  const length=samples.at(-1).distance;
  return p=>{
    // Minimum-jerk acceleration/deceleration gives the turn inertia, with no
    // stop at a curve boundary. The word itself remains the landing target.
    const eased=p*p*p*(10+p*(-15+6*p)),distance=length*eased;
    let lo=0,hi=samples.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].distance<distance)lo=mid;else hi=mid;}
    const a=samples[lo],b=samples[hi],t=(distance-a.distance)/(b.distance-a.distance||1);
    return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)};
  };
}

/** Gravity for a hop; one uninterrupted, collision-safe return between rows. */
export function makeBouncePath(from,to,duration=.4) {
  const dy=to.y-from.y;
  if(Math.abs(dy)<=12 || !to.row || (!from.row && dy>0 && Math.abs(from.x-to.x)<8)) {
    const gravity=Math.min(STAR_GRAVITY,8*clearance(from,to)/(duration*duration));
    const vy=dy/duration-gravity*duration/2;
    return p=>{const t=clamp(p)*duration;return {x:mix(from.x,to.x,clamp(p)),y:from.y+vy*t+.5*gravity*t*t};};
  }
  const descending=dy>0,obstacle=descending?(from.row||to.row):to.row;
  const left=Math.min(obstacle.left,descending?obstacle.left:to.row.edgeLeft??to.row.left)-22;
  const right=Math.max(obstacle.right,descending?obstacle.right:to.row.edge??obstacle.right)+22;
  const edge=Math.abs(from.x-left)+Math.abs(to.x-left)<Math.abs(from.x-right)+Math.abs(to.x-right)?left:right;
  const outward=edge<from.x?-1:1, inward=to.x>edge?1:-1;
  const top=descending?from.y-Math.min(24,clearance(from,from)):to.y-24;
  const lane=descending?Math.max(to.row.ceiling,to.y-14):top;
  // Both ends of each join share a tangent. All descent/ascent stays outside
  // the obstructing row; the last arc only enters the destination's clear gap.
  let curves;
  if(descending) {
    const a={x:edge,y:from.y},b={x:edge+inward*12,y:lane};
    curves=[
      [from,{x:from.x+outward*18,y:top},{x:edge,y:top},a],
      [a,{x:edge,y:mix(from.y,lane,.55)},{x:edge,y:lane},b],
      [b,{x:mix(b.x,to.x,.4),y:lane},{x:to.x,y:lane},to],
    ];
  } else {
    const a={x:edge,y:from.y-8},b={x:edge+inward*12,y:lane};
    curves=[
      [from,{x:mix(from.x,edge,.5),y:from.y},{x:edge,y:from.y},a],
      [a,{x:edge,y:mix(from.y,lane,.5)},{x:edge,y:lane},b],
      [b,{x:mix(b.x,to.x,.4),y:lane},{x:to.x,y:lane},to],
    ];
  }
  const path=distancePath(curves);
  return p=>p<=0?{x:from.x,y:from.y}:p>=1?{x:to.x,y:to.y}:path(p);
}
export const bouncePoint=(from,to,progress,duration=.4)=>makeBouncePath(from,to,duration)(clamp(progress));

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
  hide(){this.layer.hidden=true;this.path.setAttribute('d','');this.flight=null;}
  idle(time,reduced=false){
    if(!this.lastPosition)return;
    this.draw({from:this.lastPosition,to:this.lastPosition,phase:'rest',progress:1,time,reduced});
  }
  draw({key,from,to,progress,phase,reduced=false,time=0,duration=.4}) {
    if(!from||!to||!Number.isFinite(to.x+to.y+from.x+from.y))return;
    this.layer.hidden=false;
    const p=clamp(progress),flying=phase==='flight';
    const signature=[key,from.x,from.y,to.x,to.y,duration,to.row?.ceiling].join(':');
    if(this.flight?.signature!==signature)this.flight={signature,point:makeBouncePath(from,to,duration)};
    const point=this.flight.point;
    const at=reduced||!flying?{x:to.x,y:to.y}:point(p);
    this.lastPosition={...at,row:to.row};
    // Brief compression on contact followed by one small elastic recovery.
    // Keep the bottom tip planted while the star compresses.
    const age=p*.22;
    const impact=reduced||flying?0:.12*Math.exp(-age*30)*Math.sin(age*60);
    const stretch=reduced||!flying?0:.025*Math.abs(2*p-1);
    const sx=1+impact-stretch,sy=1-impact+stretch;
    this.star.style.transform=`translate3d(${at.x-10}px,${at.y-10+impact*8}px,0) scale(${sx},${sy})`;
    this.star.style.opacity=String(.94+Math.max(0,impact)*.6);
    const tail=[];
    if(flying&&!reduced)for(let i=0;i<6;i++){const trail=point(clamp(p-i*.005/duration));if(Math.hypot(at.x-trail.x,at.y-trail.y)<28)tail.push(trail);}
    this.path.setAttribute('d',tail.length?'M'+tail.map(t=>`${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' L'):'');
    this.trail.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    this.motes.forEach((m,i)=>{
      m.hidden=reduced||flying||p>=1;
      if(m.hidden)return;
      const angle=Math.PI+i*Math.PI/4,vx=Math.cos(angle)*(15+i*3),vy=-18-i*4;
      m.style.transform=`translate3d(${to.x+vx*age}px,${to.y+7+vy*age+40*age*age}px,0) scale(${.65-p*.4})`;
      m.style.opacity=String(Math.sin(Math.PI*p)*(1-p)*.4);
    });
  }
  dispose(){this.layer.remove();}
}
