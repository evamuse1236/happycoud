import { hash, random, clamp } from './math.js';

/** One visual world per comment, chosen only from its existing mood labels. */
export function commentTheme(comment) {
  if (comment.moods.includes('poetry')) return 'poetry';
  if (comment.moods.includes('laugh')) return 'laughter';
  if (comment.moods.includes('love')) return 'love';
  return 'starlight';
}
export function relatedComments(comment, comments, limit = 3) {
  const thread = new Set([comment.id, ...comment.conversation.map(c => String(c.id))]);
  return comments.filter(c => !thread.has(c.id) && (
    (comment.postUrl && c.postUrl === comment.postUrl) || (comment.author && c.author === comment.author)
  )).sort((a,b) => Number(b.postUrl === comment.postUrl) - Number(a.postUrl === comment.postUrl)).slice(0,limit);
}
/** Preserve whitespace and exact wording while giving each word its own trajectory. */
export const wordTokens = text => text.match(/\s+|\S+/gu) || [];

export class ImmersiveReader {
  constructor(dialog, quote, canvas) {
    this.dialog = dialog;
    this.quote = quote;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.animations = [];
    this.frame = 0;
    this.current = null;
    this.resize = () => {
      if (!this.dialog.open || !this.current) return;
      this.cancel();
      this.draw(1, this.current.origin, this.current.seed);
    };
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
      else this.resize();
    });
  }
  cancel() {
    cancelAnimationFrame(this.frame);
    this.animations.forEach(a => a.cancel());
    this.animations = [];
  }
  setComment(comment) {
    this.cancel();
    this.dialog.dataset.theme = commentTheme(comment);
    this.quote.replaceChildren(...wordTokens(comment.text).map(token => {
      if (/^\s+$/u.test(token)) return document.createTextNode(token);
      const word = document.createElement('span');
      word.className = 'reader-word';
      word.textContent = token;
      return word;
    }));
  }
  enter(comment, origin, reduced) {
    this.cancel();
    const start = origin || {x: innerWidth/2, y: innerHeight/2, scale: .1, width: 100, height: 20};
    start.x = clamp(start.x, 0, innerWidth);
    start.y = clamp(start.y, 0, innerHeight);
    this.current = {origin: start, seed: hash(comment.id)};
    this.draw(1, start, this.current.seed);
    if (reduced) return;
    const words = [...this.quote.querySelectorAll('.reader-word')];
    // Bound motion work for very long comments. Every word remains in the HTML.
    const animated = words.filter(word => {
      const r = word.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    }).slice(0,90);
    const quoteRect = this.quote.getBoundingClientRect();
    const scale = clamp(start.scale || .08, .025, .7);
    for (const [i,word] of animated.entries()) {
      const r = word.getBoundingClientRect();
      const sourceX = start.x + (r.left + r.width/2 - quoteRect.left - quoteRect.width/2)*scale;
      const sourceY = start.y + (r.top + r.height/2 - quoteRect.top - quoteRect.height/2)*scale;
      const dx = sourceX - (r.left+r.width/2), dy = sourceY - (r.top+r.height/2);
      this.animations.push(word.animate([
        {transform:`translate(${dx}px, ${dy}px) scale(${scale})`, opacity:.65, textShadow:'0 0 10px currentColor'},
        {opacity:1, offset:.6},
        {transform:'none', opacity:1, textShadow:'0 0 0 transparent'},
      ], {duration:820, delay:Math.min(i*13,150), easing:'cubic-bezier(.16,1,.3,1)', fill:'backwards'}));
    }
    const begun = performance.now();
    const tick = now => {
      const progress = Math.min(1,(now-begun)/1050);
      this.draw(progress,start,this.current.seed);
      if (progress < 1 && this.dialog.open && !document.hidden) this.frame=requestAnimationFrame(tick);
    };
    this.frame=requestAnimationFrame(tick);
  }
  draw(progress, origin, seed) {
    const ctx = this.context;
    if (!ctx) return;
    const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)) {
      this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const rng=random(seed), ink=getComputedStyle(this.dialog).getPropertyValue('--star-rgb').trim() || '230,209,173';
    const expansion=1-Math.pow(1-progress,3);
    // A finite burst settles into a quiet star field; there is no idle render loop.
    for(let i=0;i<112;i++) {
      const tx=rng()*w,ty=rng()*h,r=.55+rng()*1.4;
      const x=origin.x+(tx-origin.x)*expansion,y=origin.y+(ty-origin.y)*expansion;
      const alpha=(.12+rng()*.48)*(progress<1?.5+progress*.5:1);
      ctx.strokeStyle=`rgba(${ink},${alpha})`;ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      if(i%13===0){ctx.beginPath();ctx.moveTo(x-r*4,y);ctx.lineTo(x+r*4,y);ctx.moveTo(x,y-r*4);ctx.lineTo(x,y+r*4);ctx.stroke();}
      if(progress<.88){
        const tail=(1-expansion)*.16;
        ctx.globalAlpha=1-progress;ctx.beginPath();ctx.moveTo(x,y);
        ctx.lineTo(x-(tx-origin.x)*tail,y-(ty-origin.y)*tail);ctx.stroke();ctx.globalAlpha=1;
      }
    }
  }
  close() { this.cancel(); this.current=null; }
}
