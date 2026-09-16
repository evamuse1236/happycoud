import { clamp, hash, random, TAN, project } from './math.js';

export const DURATION = Object.freeze({ birth: 9.2, dissolve: .62, settle: .9, return: 1.25 });
export const smoother = t => { t=clamp(t,0,1); return t*t*t*(t*(t*6-15)+10); };
export const between = (a,b,t) => smoother((t-a)/(b-a));

/** Same arithmetic is repeated in the vertex shader. Identity, not X position,
 * controls ignition; there is no left-to-right wipe and no displaced word. */
export function ignition(index, progress) {
  const phase = ((index * 73 + 19) % 101) / 101;
  const start = .08 + phase * .36;
  return between(start, start + .47, progress);
}
export function quietLight(node, {reveal=1,mood=0,moodFrom=mood,moodBlend=1,author=null}={}) {
  const match=bit=>(!bit||!!(node.mask&bit))&&(!author||node.comment.author===author);
  const from=match(moodFrom)?1:.09, to=match(mood)?1:.09;
  return (from+(to-from)*smoother(moodBlend))*ignition(node.index,reveal);
}
export function readDestination(node, width, height, maxZ=Infinity) {
  // The near plane stays outside the word sheet. Long originals get a scrollable
  // reader rather than a camera flying through the scene to enlarge every line.
  const px=clamp(Math.min(32,(width-72)/Math.max(1,node.emW)),19,32);
  const d=Math.max(height*node.font/(2*TAN*px),node.w/(2*TAN*(width/height)*.79));
  return {x:node.x, y:node.y, z:clamp(node.z+d,78,maxZ)};
}
export function hitTest(nodes, camera, width, height, point, eligible=()=>true) {
  let best=null,score=Infinity;
  for(const n of nodes){
    if(!eligible(n.comment))continue;
    const p=project(n,camera,width,height);if(!p)continue;
    const w=Math.max(12,n.w*p.scale),h=Math.max(12,n.h*p.scale);
    if(Math.abs(point.x-p.x)>w/2+4||Math.abs(point.y-p.y)>h/2+4)continue;
    const d=Math.hypot((point.x-p.x)/w,(point.y-p.y)/h);
    if(d<score){best=n;score=d;}
  }
  return best;
}
export function chooseMoment(nodes,seen=new Set(),active=null){
  const pool=nodes.filter(n=>n.comment.id!==active);
  if(!pool.length)return nodes[0]||null;
  return [...pool].sort((a,b)=>{
    const score=n=>(seen.has(n.comment.id)?0:10)+(n.lines.length<6?3:0)+Math.min(n.font,16)/8-Math.abs(n.x)/2200+(hash(n.comment.id+'next')%100)/100;
    return score(b)-score(a);
  })[0];
}

/** Gas-drag / softened-gravity particle model, deliberately art-directed.
 * These particles are dust, never substitute quote sprites. Anchors are immutable.
 * Semi-implicit Euler at a fixed timestep makes trajectories independent of FPS. */
export class Accretion {
  constructor(nodes, maximum=1500){
    this.time=0; this.remainder=0; this.step=1/120;
    const per=Math.max(2,Math.min(6,Math.floor(maximum/Math.max(1,nodes.length))));
    this.particles=[];
    const stride=Math.max(1,Math.ceil(nodes.length*per/maximum));
    for(let j=0;j<nodes.length;j+=stride){
      const n=nodes[j],r=random(hash(n.comment.id+'nursery-v5'));
      for(let i=0;i<per;i++){
        const angle=r()*Math.PI*2,radius=32+r()*115,hand=r()>.5?1:-1;
        const speed=10+r()*22;
        this.particles.push({anchor:n,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.66,z:(r()-.5)*75,
          vx:-Math.sin(angle)*speed*hand,vy:Math.cos(angle)*speed*hand*.66,
          size:.55+r()*1.05,opacity:.11+r()*.33,phase:r()*6.28,delay:r()*.7});
      }
    }
  }
  advance(dt){
    this.remainder+=clamp(dt,0,.1);
    while(this.remainder>=this.step){this.integrate(this.step);this.remainder-=this.step;this.time+=this.step;}
  }
  integrate(dt){
    for(const p of this.particles){
      if(this.time<p.delay)continue;
      const r2=p.x*p.x+p.y*p.y, soft=24;
      const strength=58000/Math.pow(r2+soft*soft,1.5);
      const drag=.33+.16*between(1,6,this.time);
      p.vx+=(-strength*p.x-drag*p.vx)*dt;p.vy+=(-strength*p.y-drag*p.vy)*dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z*=Math.exp(-.28*dt);
    }
  }
}

/** A tiny explicit controller keeps interrupted transitions from completing late. */
export class TransitionToken {
  constructor(){this.value=0;}
  next(){return ++this.value;}
  valid(token){return token===this.value;}
  cancel(){this.value++;}
}
