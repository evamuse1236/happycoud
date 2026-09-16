import { TAN, project } from './math.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
/** The camera makes room for context BEFORE arrival. There is no sideways panel push. */
export function memoryDestination(node,width,height,homeZ,readingScale=1){
  const wide=width>=960;
  const desired=28*readingScale;
  const distance=Math.max(height*node.font/(2*TAN*desired),node.w/(2*TAN*(width/height)*(wide?.46:.82)),node.h/(2*TAN*(wide?.46:.36)));
  const z=Math.max(78,node.z+distance),scale=height/(2*TAN*(z-node.z));
  const x=width*(wide?.34:.5),y=height*(wide?.45:.34);
  return {x:node.x-(x-width/2)/scale,y:node.y+(y-height/2)/scale,z};
}
export class MemoryScene {
  constructor(){
    this.dialog=document.querySelector('#reader');
    this.lines=document.createElementNS('http://www.w3.org/2000/svg','svg');this.lines.classList.add('memory-filaments');this.lines.setAttribute('aria-hidden','true');
    this.dialog.prepend(this.lines);this.id=null;
    this.dialog.querySelector('.reader-stage').addEventListener('scroll',()=>this.drawConnections(),{passive:true});
    document.querySelector('#reader-context').addEventListener('scroll',()=>this.drawConnections(),{passive:true});
    this.observer=new ResizeObserver(()=>this.drawConnections());this.observer.observe(this.dialog);
  }
  place(node,camera,readingScale=1){
    const p=project(node,camera,innerWidth,innerHeight);if(!p)return;
    const quote=document.querySelector('#reader-quote'),stage=this.dialog.querySelector('.reader-stage'),main=this.dialog.querySelector('.reader-main');
    const font=node.font*p.scale,wide=innerWidth>=960;
    this.dialog.style.setProperty('--memory-font',font+'px');
    this.dialog.style.setProperty('--memory-x',(p.x-node.w*p.scale/2)+'px');
    this.dialog.style.setProperty('--memory-y',(p.y-node.h*p.scale/2+font*.25)+'px');
    this.dialog.style.setProperty('--memory-width',(node.w*p.scale)+'px');
    this.dialog.style.setProperty('--memory-context-top',clamp(p.y-120,130,innerHeight-310)+'px');
    this.dialog.style.setProperty('--memory-mobile-top',Math.max(0,p.y-node.h*p.scale/2+font*.25-100)+'px');
    this.dialog.dataset.length=node.lines.length>10||font<18?'long':'normal';
    if(this.id!==node.comment.id||!quote.querySelector('.memory-original')){
      this.id=node.comment.id;
      const original=document.createElement('span');original.className='memory-original sr-only';original.textContent=node.comment.text;
      const ink=document.createElement('span');ink.className='memory-ink';ink.setAttribute('aria-hidden','true');
      for(const line of node.lines){const span=document.createElement('span');span.className='memory-line';span.textContent=line||'\u00a0';ink.append(span);}
      quote.replaceChildren(original,ink);quote.setAttribute('aria-label',node.comment.text);
    }
    const items=[...this.dialog.querySelectorAll('.context-comment')];
    items.forEach((item,i)=>{item.style.setProperty('--memory-order',Math.min(i,8));item.classList.toggle('memory-reply',item.tagName==='ARTICLE');});
    // Visible typography remains selectable; clipboard actions in main use untouched source text.
    main.style.setProperty('--reading-scale',readingScale);
    this.dialog.dataset.context=items.length?'recorded':'none';
    if(!wide)stage.scrollTop=0;
    requestAnimationFrame(()=>this.drawConnections());
  }
  drawConnections(){
    if(!this.dialog.open)return;
    const first=this.dialog.querySelector('#inline-thread .context-comment, #nearby-list .context-comment');
    this.lines.replaceChildren();if(!first||innerWidth<960)return;
    const q=document.querySelector('#reader-byline').getBoundingClientRect(),r=first.getBoundingClientRect();
    if(!r.width||r.bottom<80||r.top>innerHeight-90)return;
    this.lines.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    const x1=q.left+q.width*.78,y1=q.top+q.height/2,x2=r.left-20,y2=r.top+15;
    const path=document.createElementNS(this.lines.namespaceURI,'path');path.setAttribute('d',`M${x1} ${y1} C${x1+85} ${y1},${x2-85} ${y2},${x2} ${y2}`);
    this.lines.append(path);
    for(const [cx,cy] of [[x1,y1],[x2,y2]]){const dot=document.createElementNS(this.lines.namespaceURI,'circle');dot.setAttribute('cx',cx);dot.setAttribute('cy',cy);dot.setAttribute('r','1.7');this.lines.append(dot);}
  }
}
