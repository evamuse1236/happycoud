import { random, hash, clamp } from './math.js';
/** The two renderers share this exact world-space atmosphere. Nothing follows the screen. */
export function atmosphereFor(nodes) {
  const rng=random(721933),stars=[],clouds=[];
  for(let i=0;i<2400;i++){
    const bright=rng()>.975;
    stars.push({x:(rng()-.5)*11200,y:(rng()-.5)*6800,z:-400-rng()*9200,
      size:bright?17+rng()*28:2+rng()*8,alpha:.22+rng()*.56,phase:rng()*9,color:i%3,bright});
  }
  for(const n of nodes){
    const r=random(hash(n.comment.id+'dust-v2')),count=clamp(Math.round(n.w*n.h/65),12,48);
    for(let i=0;i<count;i++){
      const bright=r()>.991;
      stars.push({x:n.x+(r()-.5)*n.w*1.8,y:n.y+(r()-.5)*n.h*1.9,z:n.z-25+(r()-.5)*115,
        size:bright?6+r()*7:.7+r()*2,alpha:.12+r()*.56,phase:r()*9,color:n.mask&4?1:0,bright});
    }
  }
  // Overlapping, correlated billows: a volume, not unrelated screen-space spots.
  for(let i=0;i<42;i++){
    const x=-2900+i*145+(rng()-.5)*260;
    const y=Math.sin(x*.0019+.4)*440+(rng()-.5)*650;
    clouds.push({x,y,z:-1500+rng()*1100,w:760+rng()*1100,h:500+rng()*720,alpha:.26+rng()*.24,image:i%6,
      color:i%6===5?[.29,.23,.15,.22]:i%3===1?[.13,.23,.34,.48]:[.08,.19,.30,.40]});
  }
  clouds.sort((a,b)=>a.z-b.z);
  return {stars,clouds};
}
// Smooth value noise with seeded lattice. No random values are generated per frame.
export function makeNoise(seed){
  const r=random(seed),table=Float32Array.from({length:4096},()=>r());
  return (x,y)=>{const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const at=(a,b)=>table[((b&63)<<6)+(a&63)];const a=at(ix,iy)*(1-fx)+at(ix+1,iy)*fx,b=at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx;return a*(1-fy)+b*fy;};
}
/** Procedural fallback volume slices. Generated locally, no photographic assets or downloads. */
export function nebulaSlices(){
  return Array.from({length:6},(_,k)=>{
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),image=ctx.createImageData(256,256),noise=makeNoise(773+k*149);
    const fbm=(x,y)=>noise(x,y)*.54+noise(x*2.07+9,y*2.07)*.27+noise(x*4.23,y*4.23+3)*.13+noise(x*8.51,y*8.51)*.06;
    const color=k===5?[146,110,68]:k%2?[65,110,164]:[35,87,141];
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const u=(x-128)/128,v=(y-128)/128,r2=u*u+v*v;
      if(r2>1)continue;
      const px=u*3.3+k*13,py=v*3.3-k*7;
      const wx=fbm(px+3,py+7),wy=fbm(px+19,py-5);
      const n=fbm(px+wx*2.4,py+wy*2.4);
      const veil=Math.exp(-r2*2.8)*Math.max(0,1-r2);
      const filament=Math.pow(Math.max(0,n-.24)*1.85,1.75);
      const density=Math.min(1,veil*filament*1.65),i=(y*256+x)*4;
      image.data[i]=color[0]*(.55+n*.65);image.data[i+1]=color[1]*(.55+n*.65);image.data[i+2]=color[2]*(.65+n*.7);image.data[i+3]=density*245;
    }
    ctx.putImageData(image,0,0);return c;
  });
}
