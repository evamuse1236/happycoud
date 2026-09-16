import { project, clamp } from './math.js';
/** Transient ink around actual nodes. This overlay never draws comment text. */
export class Annotations {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.echoes=[];this.resize();}
  resize(){this.cache=null;this.dpr=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.round(innerWidth*this.dpr);this.canvas.height=Math.round(innerHeight*this.dpr);}
  echo(node,time,kind='return'){if(node)this.echoes.push({node,time,kind});if(this.echoes.length>8)this.echoes.shift();}
  render(camera,nodes,{hover=-1,selected=-1,hoverReady=false,kept=new Set(),time=0,reduced=false,reading=false,reveal=1,callout=null}={}){
    this.echoes=this.echoes.filter(e=>time-e.time<1.6);
    const animated=!reading&&!reduced&&this.echoes.some(e=>time>=e.time);
    const key=[nodes,camera.x,camera.y,camera.z,hover,selected,hoverReady,JSON.stringify([...kept]),reduced,reading,reveal,innerWidth,innerHeight,animated,callout?.from.x,callout?.from.y,callout?.from.w,callout?.from.h,callout?.to.x,callout?.to.y,callout?.to.w,callout?.to.h];
    // Static marks need no new canvas work, including when the atmosphere is paused.
    if(!animated&&this.cache&&key.every((v,i)=>v===this.cache[i]))return;
    this.cache=key;
    const c=this.ctx,w=innerWidth,h=innerHeight;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,w,h);
    if(reading)return;
    c.lineWidth=.85;c.strokeStyle='#edcf99';c.fillStyle='#edcf99';
    for(const n of nodes){
      if(!kept.has(n.comment.id))continue;const p=project(n,camera,w,h);
      if(!p||n.font*p.scale<7||p.x<-20||p.x>w+20||p.y<0||p.y>h)continue;
      c.globalAlpha=.65*reveal;const x=p.x+n.w*p.scale/2+7,y=p.y-n.h*p.scale/2+3;
      c.beginPath();c.moveTo(x,y-3);c.lineTo(x+2.6,y);c.lineTo(x,y+3);c.lineTo(x-2.6,y);c.closePath();c.fill();
    }
    const n=nodes[selected>=0?selected:hoverReady?hover:-1];
    if(n){const p=project(n,camera,w,h);if(p){
      c.globalAlpha=.7;const pw=n.w*p.scale,ph=n.h*p.scale;
      if(pw>7){const x=p.x-pw/2-9,y=p.y-ph/2-7,r=p.x+pw/2+9,b=p.y+ph/2+7,len=clamp(pw*.14,5,13);
        c.beginPath();c.moveTo(x,y+len);c.lineTo(x,y);c.lineTo(x+len,y);c.moveTo(r-len,b);c.lineTo(r,b);c.lineTo(r,b-len);c.stroke();}
    }}
    if(callout){
      const {from:a,to:b}=callout,dx=b.x-a.x,dy=b.y-a.y;
      const startScale=Math.min(Math.abs(dx)>0?a.w/2/Math.abs(dx):Infinity,Math.abs(dy)>0?a.h/2/Math.abs(dy):Infinity);
      const endScale=Math.min(Math.abs(dx)>0?b.w/2/Math.abs(dx):Infinity,Math.abs(dy)>0?b.h/2/Math.abs(dy):Infinity);
      if(Number.isFinite(startScale)&&Number.isFinite(endScale)&&startScale+endScale<1){
        c.globalAlpha=.22;c.lineWidth=.65;c.beginPath();c.moveTo(a.x+dx*startScale,a.y+dy*startScale);c.lineTo(b.x-dx*endScale,b.y-dy*endScale);c.stroke();
      }
    }
    if(!reduced)for(const e of this.echoes){
      const p=project(e.node,camera,w,h);if(!p)continue;const t=clamp((time-e.time)/1.6,0,1);
      c.globalAlpha=Math.sin(Math.PI*t)*.44;c.lineWidth=.8;
      const r=8+22*t;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.stroke();
      if(e.kind==='keep'){c.globalAlpha=(1-t)*.65;c.beginPath();c.moveTo(p.x,p.y-8-r);c.lineTo(p.x,p.y-3-r);c.stroke();}
    }
    c.globalAlpha=1;
  }
}
