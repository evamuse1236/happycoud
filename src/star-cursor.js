/** A point of light follows the pointer exactly; only its dust lingers behind. */
export function installStarCursor({reduced=()=>false}={}) {
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  if(!fine.matches)return;
  const canvas=document.createElement('canvas');canvas.className='star-cursor';canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const topLayer=typeof canvas.showPopover==='function';
  if(topLayer)canvas.setAttribute('popover','manual');
  document.body.append(canvas);
  const lift=()=>{if(topLayer){if(canvas.matches(':popover-open'))canvas.hidePopover();canvas.showPopover();}};
  lift();
  // Keep the light above a reader or settings dialog without intercepting input.
  const observer=new MutationObserver(lift);
  document.querySelectorAll('dialog').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['open']}));
  let x=0,y=0,visible=false,raf=0,lastMove=0,points=[],lastX=null,lastY=null;
  const resize=()=>{const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
  resize();window.addEventListener('resize',resize);
  const hide=()=>{visible=false;points=[];lastX=lastY=null;document.documentElement.removeAttribute('data-star-cursor');canvas.style.opacity='0';cancelAnimationFrame(raf);raf=0;};
  const light=(px,py,r,alpha)=>{
    const glow=ctx.createRadialGradient(px,py,0,px,py,r);
    glow.addColorStop(0,`rgba(255,252,230,${alpha})`);
    glow.addColorStop(.12,`rgba(255,233,186,${alpha*.9})`);
    glow.addColorStop(.36,`rgba(224,192,135,${alpha*.32})`);
    glow.addColorStop(1,'rgba(139,184,232,0)');
    ctx.fillStyle=glow;ctx.fillRect(px-r,py-r,r*2,r*2);
  };
  function paint(now){
    raf=0;if(!visible)return;
    const target=document.elementFromPoint(x,y);
    const clickable=!!target?.closest('button:not(:disabled),a[href],summary,select,input[type="checkbox"],input[type="range"],#universe.pointing');
    const text=!clickable&&!!target?.closest('input,textarea,[contenteditable="true"],#reader-quote,article.context-comment');
    canvas.dataset.state=text?'text':clickable?'clickable':'sky';
    if(text){document.documentElement.removeAttribute('data-star-cursor');canvas.style.opacity='0';points=[];return;}
    document.documentElement.dataset.starCursor='on';canvas.style.opacity='1';
    ctx.clearRect(0,0,innerWidth,innerHeight);
    const still=reduced();points=still?[]:points.filter(p=>now-p.time<520);
    ctx.globalCompositeOperation='lighter';
    for(const p of points){const life=1-(now-p.time)/520;light(p.x,p.y,3+p.size*life,life*life*.48);}
    const pulse=clickable&&!still?.5+.5*Math.sin(now*.0055):0;
    light(x,y,clickable?16+pulse*7:14,clickable?.85+pulse*.15:.84);
    // A tiny white-hot core and faint diffraction rays, not a drawn star icon.
    ctx.strokeStyle=`rgba(255,239,204,${clickable?.30+pulse*.22:.23})`;ctx.lineWidth=.65;
    const ray=clickable?7+pulse*3:5;
    ctx.beginPath();ctx.moveTo(x-ray,y);ctx.lineTo(x+ray,y);ctx.moveTo(x,y-ray);ctx.lineTo(x,y+ray);ctx.stroke();
    ctx.fillStyle='#fffbed';ctx.beginPath();ctx.arc(x,y,clickable?1.5+pulse*.35:1.2,0,Math.PI*2);ctx.fill();
    ctx.globalCompositeOperation='source-over';
    if(points.length||(clickable&&!still)||now-lastMove<150)raf=requestAnimationFrame(paint);
  }
  document.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'||!fine.matches){hide();return;}
    const now=performance.now();x=e.clientX;y=e.clientY;
    if(lastX!==null&&!reduced()){
      const dx=x-lastX,dy=y-lastY,steps=Math.min(20,Math.ceil(Math.hypot(dx,dy)/5));
      for(let i=1;i<=steps;i++)points.push({x:lastX+dx*i/steps,y:lastY+dy*i/steps,time:now,size:2+Math.random()*3});
      if(points.length>100)points=points.slice(-100);
    }
    lastX=x;lastY=y;lastMove=now;visible=true;
    if(!raf)raf=requestAnimationFrame(paint);
  },{passive:true});
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});
  window.addEventListener('blur',hide);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Tab')hide();});
  fine.addEventListener('change',()=>{if(!fine.matches)hide();});
}
