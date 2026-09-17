import { clamp } from './math.js';
/** Pointer capture + a single gesture state, so pinch-end cannot become a click. */
export class NavigationControls {
  constructor(canvas,rig,{onSelect,onHover,onInteract,onCancelFocus,isBlocked,getPlane=()=>0,canCoast=()=>true,onNavigate=()=>{}}) {
    this.canvas=canvas;this.rig=rig;this.pointers=new Map();this.gesture=null;this.suppress=false;
    this.plane=0;this.lastWheel=-Infinity;this.wheelPlane=0;
    this.controller=new AbortController();const signal=this.controller.signal;
    const before=()=>{onCancelFocus();onInteract();};
    const position=e=>({x:e.clientX,y:e.clientY});
    const pinch=()=>{const [a,b]=[...this.pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
    canvas.addEventListener('wheel',e=>{
      if(isBlocked())return;e.preventDefault();
      const now=performance.now();
      if(now-this.lastWheel>260){onNavigate({...rig.current});this.wheelPlane=getPlane(position(e));}
      this.lastWheel=now;before();onHover(null);
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
      rig.zoom(Math.exp(clamp(delta,-160,160)*(e.ctrlKey?.007:.0026)),e.clientX,e.clientY,this.wheelPlane);
    },{passive:false,signal});
    canvas.addEventListener('pointerdown',e=>{
      if(isBlocked()||e.button>0)return;
      // Mouse gestures cannot contain multiple pointers. Recover a missed release
      // after focus changes instead of treating the next drag as a pinch.
      if(e.pointerType==='mouse'){this.pointers.clear();this.gesture=null;this.suppress=false;}
      if(this.pointers.size>=2)return;
      if(!this.pointers.size){this.origin={...rig.current};this.recorded=false;this.plane=getPlane(position(e));}
      onInteract();canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId,position(e));this.lastSample=performance.now();this.speed={x:0,y:0};onHover(null);
      if(this.pointers.size===1){this.gesture={...position(e),startX:e.clientX,startY:e.clientY,moved:0};this.suppress=false;}
      else {onCancelFocus();this.suppress=true;this.gesture=pinch();this.plane=getPlane(this.gesture);}
      canvas.classList.add('dragging');
    },{signal});
    canvas.addEventListener('pointermove',e=>{
      if(isBlocked())return;
      if(!this.pointers.has(e.pointerId)){if(e.pointerType!=='touch')onHover(position(e));return;}
      if(e.pointerType==='mouse'&&e.buttons===0){end(e,true);return;}
      const prev=this.pointers.get(e.pointerId);this.pointers.set(e.pointerId,position(e));
      if(this.pointers.size>=2){
        const next=pinch(),old=this.gesture;
        if(old?.d>0&&next.d>0){
          if(!this.recorded){onNavigate(this.origin);this.recorded=true;}
          rig.pan(next.x-old.x,next.y-old.y,this.plane);rig.zoom(old.d/next.d,next.x,next.y,this.plane);}
        this.gesture=next;this.suppress=true;
      } else {
        const dx=e.clientX-prev.x,dy=e.clientY-prev.y;
        const now=performance.now(),dt=Math.max(.008,(now-this.lastSample)/1000);
        this.speed={x:dx/dt,y:dy/dt};this.lastSample=now;
        this.gesture.moved=(this.gesture.moved||0)+Math.hypot(dx,dy);
        if(this.gesture.moved>5||this.suppress){if(!this.recorded){onCancelFocus();onNavigate(this.origin);this.recorded=true;}rig.pan(dx,dy,this.plane);}
      }
    },{signal});
    const end=(e,cancelled)=>{
      if(!this.pointers.has(e.pointerId))return;
      const wasPinch=this.suppress;
      const shouldSelect=!cancelled&&!wasPinch&&this.pointers.size===1&&(this.gesture?.moved||0)<6;
      if(!cancelled&&!wasPinch&&this.pointers.size===1&&!shouldSelect&&canCoast()&&performance.now()-this.lastSample<80)rig.coast(this.speed.x,this.speed.y,this.plane);
      this.pointers.delete(e.pointerId);
      if(this.pointers.size===1){const p=[...this.pointers.values()][0];this.gesture={...p,moved:100};this.suppress=true;}
      if(!this.pointers.size){canvas.classList.remove('dragging');this.gesture=null;}
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(shouldSelect)onSelect(position(e));
    };
    canvas.addEventListener('pointerup',e=>end(e,false),{signal});
    canvas.addEventListener('pointercancel',e=>end(e,true),{signal});
    canvas.addEventListener('lostpointercapture',e=>end(e,true),{signal});
    globalThis.addEventListener?.('blur',()=>{this.pointers.clear();this.gesture=null;this.suppress=false;canvas.classList.remove('dragging');rig.interrupt();},{signal});
    canvas.addEventListener('pointerleave',()=>{if(!this.pointers.size)onHover(null);},{signal});
    // Single-tap selection is already the approach gesture. A second click must
    // not race the reader by starting an unrelated dolly.
  }
  dispose(){this.controller.abort();}
}
