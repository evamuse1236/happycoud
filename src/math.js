/** World units are independent of screen pixels. Positive Z is toward the viewer. */
export const FOV = 36 * Math.PI / 180;
export const TAN = Math.tan(FOV / 2);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function project(point, camera, width, height) {
  const distance = camera.z - point.z;
  if (distance <= 1) return null;
  const scale = height / (2 * TAN * distance);
  return { x: width / 2 + (point.x - camera.x) * scale,
    y: height / 2 - (point.y - camera.y) * scale, scale, distance };
}
export function unproject(x, y, planeZ, camera, width, height) {
  const scale = 2 * TAN * (camera.z - planeZ) / height;
  return { x: camera.x + (x - width / 2) * scale,
    y: camera.y - (y - height / 2) * scale, z: planeZ };
}
/** Dolly, don't change FOV. The same world point remains under the cursor. */
export function dollyAt(camera, nextZ, px, py, width, height, planeZ = 0) {
  const anchor = unproject(px, py, planeZ, camera, width, height);
  const scale = 2 * TAN * (nextZ - planeZ) / height;
  return { x: anchor.x - (px - width / 2) * scale,
    y: anchor.y + (py - height / 2) * scale, z: nextZ };
}
export function homeDistance(width, height, worldWidth = 2320, worldHeight = 520) {
  return Math.max(worldWidth / (2 * TAN * width / height * .86),
    worldHeight / (2 * TAN * .60));
}
export function rectanglesOverlap(a, b, padding = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + padding &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + padding;
}
export function safeURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}
export const easeInOut = t => t*t*t*(t*(t*6-15)+10);
export class CameraRig {
  constructor(width, height) {
    this.width=width;this.height=height;this.homeZ=homeDistance(width,height,2320,670);
    this.current={x:0,y:0,z:this.homeZ};this.target={...this.current};this.minZ=78;
    this.flight=null;this.velocity={x:0,y:0};
  }
  resize(width,height){
    const atHome=Math.abs(this.target.z-this.homeZ)<1&&Math.hypot(this.target.x,this.target.y)<1;
    this.width=width;this.height=height;this.homeZ=homeDistance(width,height,2320,670);
    this.flight=null;if(atHome)this.home();
  }
  bounds(){
    this.target.x=clamp(this.target.x,-1320,1320);this.target.y=clamp(this.target.y,-470,470);
    this.target.z=clamp(this.target.z,this.minZ,this.homeZ*1.18);
  }
  interrupt(){if(this.flight){this.target={...this.current};this.flight=null;}this.velocity={x:0,y:0};}
  zoom(factor,px=this.width/2,py=this.height/2,planeZ=0){
    this.interrupt();const z=clamp(planeZ+(this.target.z-planeZ)*factor,this.minZ,this.homeZ*1.18);
    this.target=dollyAt(this.target,z,px,py,this.width,this.height,planeZ);this.bounds();
  }
  pan(dx,dy,planeZ=0){
    this.interrupt();const factor=2*TAN*(this.target.z-planeZ)/this.height;
    this.target.x-=dx*factor;this.target.y+=dy*factor;this.bounds();
  }
  coast(vx,vy,planeZ=0){const scale=2*TAN*(this.target.z-planeZ)/this.height;this.velocity={x:clamp(-vx*scale,-1700,1700),y:clamp(vy*scale,-900,900)};}
  home(){this.interrupt();this.target={x:0,y:0,z:this.homeZ};}
  focus(node){
    const readable=this.height*node.font/(2*TAN*28);
    const fitX=node.w/(2*TAN*(this.width/this.height)*.67),fitY=node.h/(2*TAN*.53);
    this.interrupt();this.target={x:node.x,y:node.y,z:Math.max(this.minZ,node.z+Math.max(readable,fitX,fitY))};
  }
  flyTo(destination,{duration,arc=true}={}){
    this.interrupt();const from={...this.current},to={...destination};
    this.target=to;
    const lateral=Math.hypot(to.x-from.x,to.y-from.y);
    const distance=Math.abs(Math.log(to.z/from.z));
    const seconds=duration??clamp(.75+distance*.23+lateral/2600,.8,1.9);
    // A restrained pull-back clears intervening words during a lateral flight.
    const lift=arc?Math.min(this.homeZ*.32,lateral*.46):0;
    this.flight={from,to,elapsed:0,duration:seconds,lift};
  }
  tick(dt,immediate=false){
    dt=Math.min(Math.max(dt,0),.1);
    if(immediate){this.current={...this.target};this.flight=null;this.velocity={x:0,y:0};return 0;}
    if(this.flight){
      const f=this.flight;f.elapsed+=dt;const t=clamp(f.elapsed/f.duration,0,1),e=easeInOut(t);
      this.current={x:lerp(f.from.x,f.to.x,e),y:lerp(f.from.y,f.to.y,e),z:Math.exp(lerp(Math.log(f.from.z),Math.log(f.to.z),e))+Math.sin(Math.PI*e)**2*f.lift};
      if(t===1){this.current={...f.to};this.flight=null;}
    }else{
      if(Math.hypot(this.velocity.x,this.velocity.y)>.1){
        this.target.x+=this.velocity.x*dt;this.target.y+=this.velocity.y*dt;this.bounds();
        const decay=Math.exp(-6.5*dt);this.velocity.x*=decay;this.velocity.y*=decay;
      }
      const a=1-Math.exp(-10*dt);
      for(const k of ['x','y','z'])this.current[k]=lerp(this.current[k],this.target[k],a);
    }
    return Math.hypot(this.current.x-this.target.x,this.current.y-this.target.y,this.current.z-this.target.z);
  }
}
