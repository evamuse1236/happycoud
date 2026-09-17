import {clamp,drift,ease,mix} from './signal-motion.js';
/** Temporary original-text presentations. They never reflow the actual lyric.
 * Original-script fragments dissolve into the sung spelling in its natural slot.
 * Missing/offscreen origins are intentionally NOT animated from invented points. */
export class SignalInk {
  constructor(host){this.layer=document.createElement('div');this.layer.className='ls-ink-layer';this.layer.setAttribute('aria-hidden','true');host.append(this.layer);this.items=new Map();}
  paint(flights,reduced=false){
    const seen=new Set();
    for(const f of flights){
      if(!f.origin||!f.target||f.progress<=0||f.progress>=1||reduced)continue;
      seen.add(f.key); let el=this.items.get(f.key);
      if(!el){el=document.createElement('span');el.className='ls-cargo';el.textContent=f.text;el.dir='auto';this.layer.append(el);this.items.set(f.key,el);}
      const p=clamp(f.progress),horizontal=Math.abs(f.origin.x-f.target.x)>130&&Math.abs(f.origin.y-f.target.y)<100;
      // Cross above already-sung glyphs, never through their reading baseline.
      const lift=f.kind!=='entry'&&horizontal?Math.max(65,(f.target.font||34)*2.55):Math.min(30,Math.hypot(f.origin.x-f.target.x,f.origin.y-f.target.y)*.05);
      const q=drift(f.origin,f.target,p,lift);
      const font=mix(f.origin.font||22,f.target.font||34,ease(p));
      el.style.fontSize=font+'px';el.style.opacity=String(ease(p/.13)*(1-ease((p-.78)/.22)));
      el.style.transform=`translate(${q.x.toFixed(2)}px,${q.y.toFixed(2)}px) translate(-50%,-50%)`;
      el.style.maxWidth=Math.max(130,Math.min(innerWidth*.8,540))+'px';
    }
    for(const [key,el] of this.items)if(!seen.has(key)){el.remove();this.items.delete(key);}
  }
  clear(){for(const el of this.items.values())el.remove();this.items.clear();}
  dispose(){this.clear();this.layer.remove();}
}
/** Locate exact UTF-16 source indices across adjacent highlighted spans. */
export function sourceRangeRect(host,origin){
  if(!host||!origin)return null;
  const spans=[...host.querySelectorAll('[data-start][data-end]')];
  const first=spans.find(s=>+s.dataset.start<=origin.start&&+s.dataset.end>origin.start);
  const last=spans.find(s=>+s.dataset.start<origin.end&&+s.dataset.end>=origin.end);
  if(!first?.firstChild||!last?.firstChild)return null;
  const range=document.createRange();
  try{range.setStart(first.firstChild,origin.start-Number(first.dataset.start));range.setEnd(last.firstChild,origin.end-Number(last.dataset.start));}catch{return null;}
  const bounds=host.getBoundingClientRect();
  const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
  // Do not pretend a scrolled-out or multi-line range came from a single glyph.
  if(!rects.length||rects.some(r=>r.top<Math.max(0,bounds.top)-2||r.bottom>Math.min(innerHeight,bounds.bottom)+2))return null;
  const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
  if(rects.some(r=>Math.abs(r.top-top)>5))return null;
  const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right));
  return {x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top,font:parseFloat(getComputedStyle(first).fontSize)||22};
}
export function wordRect(element){
  if(!element)return null;
  const range=document.createRange();range.selectNodeContents(element);const r=range.getBoundingClientRect();
  return r.width>0&&r.height>0?{x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,font:parseFloat(getComputedStyle(element).fontSize)||34}:null;
}
