import { ignition, quietLight } from './cinema.js';
import { clamp, hash, easeInOut } from './math.js';

/** Choreography lives outside the immutable geometry. All progress is in seconds. */
export const TIMING = Object.freeze({ arrival: 3.1, hover: .18, hoverNote: .48, mood: 1.05, echo: 1.55 });
export const smoothstep = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export function revealAt(progress, index=0) { return ignition(index,progress); }
export function moodAt(progress,x) { return smoothstep(0,1,(progress-clamp((x+1400)/2800,0,1)*.38)/.62); }
export function inkLight(node, options={}) { return quietLight(node,options); }
/** First step is an actual, short, generously sized comment, never synthesized text. */
export function firstMoment(nodes,seen=new Set()) {
  if(!nodes.length)return null;
  const score=n=>(seen.has(n.comment.id)?0:3)+(n.lines.length<=4?3:0)+Math.min(n.font,12)*.3-
    Math.abs(n.x)/950-Math.abs(n.y)/500+(hash(n.comment.id+'first-step')%100)/500;
  return [...nodes].sort((a,b)=>score(b)-score(a)||a.index-b.index)[0];
}
export class Experience {
  constructor(){this.reset();}
  reset({immediate=false}={}){
    this.reveal=immediate?1:0;this.revealElapsed=0;this.arriving=!immediate;
    this.moodFrom=0;this.mood=0;this.moodBlend=1;this.zoomed=false;
    this.hover=-1;this.hoverTime=0;this.hoverSounded=false;this.reads=0;
  }
  skip(){this.reveal=1;this.arriving=false;}
  setMood(bit,immediate=false){this.moodFrom=this.mood;this.mood=bit;this.moodBlend=immediate?1:0;}
  setHover(id){if(id===this.hover)return;this.hover=id;this.hoverTime=0;this.hoverSounded=false;}
  tick(dt,{immediate=false}={}){
    dt=clamp(dt,0,.1);
    if(immediate){this.skip();this.moodBlend=1;}
    if(this.arriving){this.revealElapsed+=dt;this.reveal=clamp(this.revealElapsed/TIMING.arrival,0,1);if(this.reveal===1)this.arriving=false;}
    this.moodBlend=Math.min(1,this.moodBlend+dt/TIMING.mood);
    if(this.hover>=0)this.hoverTime+=dt;
    return this.arriving||this.moodBlend<1||this.hover>=0&&this.hoverTime<TIMING.hoverNote+.1;
  }
  get hoverReady(){return this.hover>=0&&this.hoverTime>=TIMING.hover;}
  takeHoverNote(){if(this.hover<0||this.hoverSounded||this.hoverTime<TIMING.hoverNote)return false;this.hoverSounded=true;return true;}
  lighting(){return {reveal:this.reveal,mood:this.mood,moodFrom:this.moodFrom,moodBlend:this.moodBlend};}
}
/** Store only a camera & layout checksum. Reject invalid, stale, or hostile state. */
export function validView(record,fingerprint,homeZ){
  if(!record||record.fingerprint!==fingerprint||!record.camera)return null;
  const {x,y,z}=record.camera;
  if(![x,y,z].every(Number.isFinite)||Math.abs(x)>1320||Math.abs(y)>470||z<78||z>homeZ*1.3)return null;
  if(z>homeZ*.85)return null;
  return {x,y,z};
}

/** Choose whitespace for a callout; never move words to make room for the UI. */
export function calloutPosition(target,rects,{width,height,labelWidth=250,labelHeight=76,reserved=[],previous=null}={}){
  const gutter=22;
  labelWidth=Math.min(labelWidth,width-gutter*2);
  const top=Math.min(height*.29,height<650?105:150);
  const bottom=Math.max(top+labelHeight,height-(width<620?175:112));
  const tx=target.x,ty=target.y,tw=target.w,th=target.h;
  const points=[];
  // Search both immediate whitespace and progressively wider rings. The label
  // moves, never the words. Reserved controls count much more than decoration.
  for(const gap of [24,52,94,148]){
    for(const offset of [0,-.55,.55]){
      points.push({x:tx+offset*labelWidth,y:ty+th/2+labelHeight/2+gap},
        {x:tx+offset*labelWidth,y:ty-th/2-labelHeight/2-gap},
        {x:tx+tw/2+labelWidth/2+gap,y:ty+offset*labelHeight},
        {x:tx-tw/2-labelWidth/2-gap,y:ty+offset*labelHeight});
    }
  }
  const area=(a,b)=>Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2))*Math.max(0,Math.min(a.y+a.h/2,b.y+b.h/2)-Math.max(a.y-a.h/2,b.y-b.h/2));
  const bounded=p=>({x:clamp(p.x,gutter+labelWidth/2,width-gutter-labelWidth/2),y:clamp(p.y,top+labelHeight/2,bottom-labelHeight/2),w:labelWidth,h:labelHeight});
  const score=r=>rects.reduce((s,q)=>s+area(r,q)*(q.id===target.id?25:1),0)+reserved.reduce((s,q)=>s+area(r,q)*50,0)+Math.hypot(r.x-tx,r.y-ty)*1.2;
  const best=points.map(bounded).sort((a,b)=>score(a)-score(b))[0];
  if(previous){const old=bounded(previous);if(score(old)<=score(best)*1.08+35)return old;}
  return best;
}

/** Words do not migrate during formation. Only surrounding dust moves. */
export function arrivalPose(node) {return {x:node.x,y:node.y,z:node.z,scale:1};}
