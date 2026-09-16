import { inkLight } from './experience.js';
import { project, random, hash, clamp } from './math.js';
import { WORD_FONT, LINE_HEIGHT } from './layout.js';
import { atmosphereFor, nebulaSlices } from './atmosphere.js';
const cssColor=c=>`rgb(${c.map(v=>Math.round(v*255)).join(',')})`;
/** Compatibility renderer: the SAME fixed 3D geometry and perspective projection.
 * Canvas is just the rasterizer. There is no CSS scaling, layout morph, or near cloud.
 */
export class CanvasConstellationRenderer {
  constructor(canvas) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('Graphics are unavailable. Browse still contains every comment.');
    this.kind='canvas2d';this.nodes=[];this.pages=[];this.tiles=[];this.mood=0;this.hover=-1;this.selected=-1;
    this.author=null;this.atmosphere=true;this.exposure=.78;this.reveal=1;this.moodFrom=0;this.moodBlend=1;this.lost=false;this.textureBytes=0;this.drawCalls=0;
    this.backdrop=document.createElement('canvas');this.bgCamera=null;this.bgTick=-1;this.bgAtmosphere=null;this.resize();this.createGlowSprites();
  }
  resize(){this.dpr=Math.min(devicePixelRatio||1,1.75);this.canvas.width=Math.round(innerWidth*this.dpr);this.canvas.height=Math.round(innerHeight*this.dpr);this.backdrop.width=Math.ceil(innerWidth*.7);this.backdrop.height=Math.ceil(innerHeight*.7);this.bgCamera=null;}
  createGlowSprites(){
    this.glows=[[.9,.82,.66],[.65,.77,.93],[.92,.72,.62]].map(color=>{
      const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
      const grad=ctx.createRadialGradient(32,32,0,32,32,32);const rgb=color.map(n=>Math.round(n*255)).join(',');
      grad.addColorStop(0,`rgba(255,248,225,.95)`);grad.addColorStop(.065,`rgba(${rgb},.9)`);grad.addColorStop(.25,`rgba(${rgb},.28)`);grad.addColorStop(1,`rgba(${rgb},0)`);
      ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);return c;
    });
    this.cloudImages=nebulaSlices();
  }
  clearWorld(){this.nodes=[];this.tiles=[];this.pages=[];this.stars=[];this.clouds=[];this.textureBytes=0;this.bgCamera=null;}
  async setLayout(layout,onProgress=()=>{}){
    this.clearWorld();this.nodes=layout.nodes;
    const estimate=this.nodes.reduce((s,n)=>s+n.w*n.h*(44/n.font)**2,0);
    const fontSize=44*Math.min(1,Math.sqrt(8_000_000/estimate));
    for(let i=0;i<this.nodes.length;i++){
      const n=this.nodes[i],factor=Math.min(Math.max(4,fontSize)/n.font,2048/n.w,2048/n.h);
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(n.w*factor);canvas.height=Math.ceil(n.h*factor);
      const ctx=canvas.getContext('2d');const font=n.font*factor;
      ctx.font=`${font}px ${WORD_FONT}`;ctx.fillStyle=cssColor(n.color);ctx.textAlign='center';ctx.textBaseline='top';
      n.lines.forEach((line,j)=>ctx.fillText(line,canvas.width/2,font*(.3+j*LINE_HEIGHT)));
      // Alpha gain is emissive ink, not a different distant object.
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let a=3;a<pixels.data.length;a+=4)pixels.data[a]=Math.min(255,pixels.data[a]*1.7);
      ctx.putImageData(pixels,0,0);
      const levels=[canvas];
      while(levels.at(-1).width>4&&levels.at(-1).height>4){
        const prev=levels.at(-1),mip=document.createElement('canvas');mip.width=Math.max(1,Math.floor(prev.width/2));mip.height=Math.max(1,Math.floor(prev.height/2));
        const mc=mip.getContext('2d');mc.imageSmoothingQuality='high';mc.drawImage(prev,0,0,mip.width,mip.height);levels.push(mip);
      }
      this.tiles.push({node:n,canvas,levels});this.textureBytes+=levels.reduce((total,c)=>total+c.width*c.height*4,0);
      if(i%45===0){onProgress(i/this.nodes.length);await new Promise(r=>setTimeout(r,0));}
    }
    this.tiles.sort((a,b)=>a.node.z-b.node.z);this.createAtmosphere();onProgress(1);
  }
  createAtmosphere(){Object.assign(this,atmosphereFor(this.nodes));}

  setAuthor(author){this.author=author;}
  setHover(index){this.hover=index;}
  paintBackground(camera,time,w,h){
    const ctx=this.backdrop.getContext('2d',{alpha:false});
    ctx.setTransform(this.backdrop.width/w,0,0,this.backdrop.height/h,0,0);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#03070e';ctx.fillRect(0,0,w,h);ctx.imageSmoothingQuality='low';
    if(!this.atmosphere)return;
    for(const cloud of this.clouds||[]){
      const p=project(cloud,camera,w,h);if(!p)continue;
      const width=cloud.w*p.scale,height=cloud.h*p.scale;
      if(p.x+width/2<0||p.x-width/2>w||p.y+height/2<0||p.y-height/2>h)continue;
      ctx.globalAlpha=cloud.alpha*this.exposure;ctx.drawImage(this.cloudImages[cloud.image],p.x-width/2,p.y-height/2,width,height);this.drawCalls++;
    }
    ctx.globalCompositeOperation='lighter';
    for(const star of this.stars||[]){
      const p=project(star,camera,w,h);if(!p||p.x< -25||p.y< -25||p.x>w+25||p.y>h+25)continue;
      const diameter=clamp(star.size*p.scale,.8,27);
      ctx.globalAlpha=star.alpha*(.9+.1*Math.sin(time*.45+star.phase));
      if(diameter<1.4){ctx.fillStyle=star.color===1?'#9bbde8':star.color===2?'#deb299':'#dcc797';ctx.fillRect(p.x,p.y,diameter,diameter);}
      else{
        ctx.drawImage(this.glows[star.color],p.x-diameter/2,p.y-diameter/2,diameter,diameter);
        if(star.bright&&diameter>3.5){ctx.strokeStyle='#e7dfc0';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(p.x-diameter*.45,p.y);ctx.lineTo(p.x+diameter*.45,p.y);ctx.moveTo(p.x,p.y-diameter*.45);ctx.lineTo(p.x,p.y+diameter*.45);ctx.stroke();}
      }
      this.drawCalls++;
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  render(camera,time){
    const ctx=this.ctx,w=this.canvas.width/this.dpr,h=this.canvas.height/this.dpr;this.drawCalls=0;
    const cameraMoved=!this.bgCamera||Math.hypot(camera.x-this.bgCamera.x,camera.y-this.bgCamera.y,camera.z-this.bgCamera.z)>.012;
    const tick=Math.floor(time*8);
    if(cameraMoved||this.bgTick!==tick||this.bgAtmosphere!==this.atmosphere||this.bgExposure!==this.exposure){
      this.paintBackground(camera,time,w,h);this.bgCamera={...camera};this.bgTick=tick;this.bgAtmosphere=this.atmosphere;this.bgExposure=this.exposure;
    }
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(this.backdrop,0,0,w,h);this.drawCalls++;
    if(this.hover>=0||this.selected>=0){
      const source=this.nodes[this.hover>=0?this.hover:this.selected];
      if(source?.comment.author){
        const p=project(source,camera,w,h);
        if(p){
          const matches=this.nodes.filter(n=>n.index!==source.index&&n.comment.author===source.comment.author).sort((a,b)=>Math.hypot(a.x-source.x,a.y-source.y)-Math.hypot(b.x-source.x,b.y-source.y)).slice(0,3);
          ctx.globalAlpha=.19;ctx.strokeStyle='#acb9ce';ctx.lineWidth=.65;ctx.setLineDash([2,6]);ctx.beginPath();
          for(const n of matches){const q=project(n,camera,w,h);if(q){ctx.moveTo(p.x,p.y+source.h*p.scale/2+4);ctx.lineTo(q.x,q.y+n.h*q.scale/2+4);}}
          ctx.stroke();ctx.setLineDash([]);
        }
      }
    }
    for(const tile of this.tiles){
      const n=tile.node,p=project(n,camera,w,h);if(!p)continue;
      const width=n.w*p.scale,height=n.h*p.scale;
      if(p.x+width/2<0||p.x-width/2>w||p.y+height/2<0||p.y-height/2>h)continue;
      const match=(!this.mood||(n.mask&this.mood))&&(!this.author||n.comment.author===this.author);
      const highlighted=n.index===this.hover||n.index===this.selected;
      const light=inkLight(n,this);ctx.globalAlpha=light*(highlighted?1:n.luminosity);
      if(highlighted){ctx.shadowColor='rgba(238,209,156,.32)';ctx.shadowBlur=7;}
      const lod=clamp(Math.floor(Math.log2(Math.max(1,tile.canvas.width/(width*this.dpr)))),0,tile.levels.length-1);
      if(n.font*p.scale>=9){
        // Repaint the SAME lines at their projected native resolution. No content LOD.
        const f=n.font*p.scale;ctx.font=`${f}px ${WORD_FONT}`;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle=cssColor(n.color);
        n.lines.forEach((line,j)=>ctx.fillText(line,p.x,p.y-height/2+f*(.3+j*LINE_HEIGHT)));this.drawCalls+=n.lines.length;
      }else{ctx.drawImage(tile.levels[lod],p.x-width/2,p.y-height/2,width,height);this.drawCalls++;}
      // Subpixel glyphs emit a little more light, from precisely the same pixels.
      if(n.font*p.scale<5&&match){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.8*light;ctx.drawImage(tile.levels[lod],p.x-width/2,p.y-height/2,width,height);ctx.globalCompositeOperation='source-over';this.drawCalls++;}
      ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
  }
  dispose(){this.clearWorld();}
}
