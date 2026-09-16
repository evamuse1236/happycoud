import { Accretion, between } from './cinema.js';
import { project, clamp } from './math.js';

/** Dust belongs to the same world coordinates as the comment it surrounds. */
export class CondensationField {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.system=null;this.resize();this.makeGlow();}
  resize(){this.dpr=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.round(innerWidth*this.dpr);this.canvas.height=Math.round(innerHeight*this.dpr);}
  makeGlow(){
    this.sprite=document.createElement('canvas');this.sprite.width=this.sprite.height=64;const ctx=this.sprite.getContext('2d');
    const g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,241,208,.7)');g.addColorStop(.13,'rgba(227,202,153,.32)');g.addColorStop(.5,'rgba(163,173,205,.055)');g.addColorStop(1,'rgba(110,151,202,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  }
  setLayout(layout){this.system=new Accretion(layout.nodes);this.nodes=layout.nodes;}
  clear(){this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);}
  render(camera,progress,dt,{reduced=false}={}){
    if(!this.ctx||!this.system)return;
    this.clear();if(progress<=0||progress>=1||reduced)return;
    this.system.advance(dt);
    const ctx=this.ctx,w=innerWidth,h=innerHeight;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalCompositeOperation='lighter';
    const visibility=between(0,.13,progress)*(1-between(.57,1,progress));
    // A brief, low-frequency veil records the local condensation, never a flash.
    for(let i=0;i<this.nodes.length;i+=3){
      const n=this.nodes[i],p=project(n,camera,w,h);if(!p)continue;
      const size=clamp((75*(1-progress)+18)*p.scale,2,130);
      ctx.globalAlpha=visibility*.17;ctx.drawImage(this.sprite,p.x-size/2,p.y-size/2,size,size);
    }
    for(const p of this.system.particles){
      const point=project({x:p.anchor.x+p.x,y:p.anchor.y+p.y,z:p.anchor.z+p.z},camera,w,h);if(!point||point.x< -10||point.x>w+10||point.y< -10||point.y>h+10)continue;
      const size=clamp(p.size*point.scale*2,.6,2.6);
      ctx.globalAlpha=p.opacity*visibility;
      ctx.fillStyle='#d7d8db';ctx.beginPath();ctx.arc(point.x,point.y,size,0,Math.PI*2);ctx.fill();
      // Very short physically aligned tails, never hyperspace streaks.
      if(Math.hypot(p.vx,p.vy)>20){ctx.globalAlpha*=.24;ctx.lineWidth=.5;ctx.strokeStyle='#d1cbb9';ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(point.x-p.vx*.025*point.scale,point.y+p.vy*.025*point.scale);ctx.stroke();}
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
}
