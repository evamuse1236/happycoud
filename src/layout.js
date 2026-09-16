import { hash, random, rectanglesOverlap, clamp } from './math.js';
import { moodMask } from './data.js';
export const WORLD = { width: 2400, height: 760 };
export const WORD_FONT = 'Georgia, "Times New Roman", serif';
export const LINE_HEIGHT = 1.32;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export const graphemes = text => segmenter ? Array.from(segmenter.segment(text), x => x.segment) : Array.from(text);
/** Lossless wrapping: source remains untouched; no ellipsis, maxWidth squeeze or slicing. */
export function wrapText(text, measure, maxWidth) {
  const result = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    // Retain spaces with the token they separate. Never insert spaces into long tokens.
    const tokens = paragraph.match(/\s+|\S+/gu) || [''];
    for (const token of tokens) {
      if (measure(line + token) <= maxWidth) { line += token; continue; }
      if (/^\s+$/u.test(token)) { result.push(line); line = ''; continue; }
      if (line.trim()) { result.push(line.trimEnd()); line = ''; }
      if (measure(token) <= maxWidth) { line = token; continue; }
      for (const glyph of graphemes(token)) {
        if (line && measure(line + glyph) > maxWidth) { result.push(line); line = ''; }
        line += glyph;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}
export function buildMask() {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width; canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = '900 600px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
  const m = ctx.measureText('KHUSHI');
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  ctx.save(); ctx.translate(WORLD.width/2, WORLD.height/2);
  ctx.scale(2240 / m.width, 614 / h);
  ctx.lineWidth=17;ctx.strokeStyle='#fff';ctx.lineJoin='round';
  ctx.strokeText('KHUSHI',0,(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);
  ctx.fillText('KHUSHI', 0, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent)/2);
  ctx.restore();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = canvas.width + 1;
  const integral = new Uint32Array(stride * (canvas.height + 1));
  const candidates = []; let area = 0;
  for (let y=0; y<canvas.height; y++) {
    let row=0;
    for (let x=0; x<canvas.width; x++) {
      const value = pixels[(y*canvas.width+x)*4+3] > 190 ? 1 : 0;
      row += value; area += value;
      integral[(y+1)*stride+x+1] = integral[y*stride+x+1] + row;
      if (value && x%7===0 && y%7===0) candidates.push({ x, y });
    }
  }
  function coverage(x, y, w, h) {
    const x0=Math.floor(x-w/2), y0=Math.floor(y-h/2), x1=Math.ceil(x+w/2), y1=Math.ceil(y+h/2);
    if(x0<0 || y0<0 || x1>canvas.width || y1>canvas.height) return 0;
    const count=integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0];
    return count/((x1-x0)*(y1-y0));
  }
  return { canvas, area, candidates, coverage };
}
class SpatialGrid {
  constructor() { this.cells = new Map(); this.size=32; }
  keys(p, pad=0) {
    const keys=[];
    for(let y=Math.floor((p.y-p.h/2-pad)/this.size); y<=Math.floor((p.y+p.h/2+pad)/this.size); y++)
      for(let x=Math.floor((p.x-p.w/2-pad)/this.size); x<=Math.floor((p.x+p.w/2+pad)/this.size); x++) keys.push(`${x},${y}`);
    return keys;
  }
  intersects(p,pad) {
    for(const key of this.keys(p,pad)) for(const other of this.cells.get(key)||[]) if(rectanglesOverlap(p,other,pad))return true;
    return false;
  }
  add(p) { for(const key of this.keys(p)) { if(!this.cells.has(key))this.cells.set(key,[]); this.cells.get(key).push(p); } }
}
/** ONE immutable layout. This function is never called by zoom, mood, hover or resize. */
export async function createLayout(comments, onProgress = () => {}) {
  if (!comments.length) return { nodes: [], mask: null, fingerprint: 'empty' };
  const mask = buildMask();
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `40px ${WORD_FONT}`;
  const measured = [...comments].sort((a,b)=>a.id.localeCompare(b.id)).map((comment, index) => {
    const rng = random(hash(comment.id));
    const length = graphemes(comment.text).length;
    const emWidth = length > 240 ? 20 : length > 100 ? 15+rng()*4 : 9+rng()*8;
    const lines = wrapText(comment.text, t=>measure.measureText(t).width, emWidth*40);
    const emW = Math.max(1, ...lines.map(l=>measure.measureText(l).width/40)) + .8;
    const emH = lines.length*LINE_HEIGHT + .65;
    // Log-normal scale distribution creates bright anchors and quiet interstices.
    // Hierarchy is visual, not a claim about likes or a person's importance.
    const hero = rng() > .84 && length < 145;
    const baseFont = clamp(21 - Math.log2(Math.max(10,length)), 7, 17) * (hero ? 1.75 : .65 + rng()*.75);
    return { comment, index, lines, emW, emH, baseFont, seed: hash(comment.id), mask: moodMask(comment.moods) };
  });
  const estimate = measured.reduce((s,n)=>s+n.emW*n.emH*n.baseFont*n.baseFont,0);
  let globalScale = Math.min(1.45, Math.sqrt(mask.area*.55/estimate));
  let placed = [];
  for(let pass=0;pass<18;pass++) {
    const grid = new SpatialGrid(); placed=[];
    const order = [...measured].sort((a,b)=>b.emW*b.emH*b.baseFont*b.baseFont-a.emW*a.emH*a.baseFont*a.baseFont || a.seed-b.seed);
    for(let j=0;j<order.length;j++) {
      const item = order[j];
      let font = item.baseFont*globalScale;
      // Especially long comments must fit a letter stroke, without dropping text.
      font = Math.min(font, 215/item.emW, 250/item.emH);
      const w=item.emW*font, h=item.emH*font, gap=Math.max(2.0,font*.31);
      const rng=random(item.seed+pass*113);
      let found=null;
      for(let k=0;k<3200;k++) {
        const base=mask.candidates[Math.floor(rng()*mask.candidates.length)];
        const p={x:base.x+(rng()-.5)*6, y:base.y+(rng()-.5)*6, w, h};
        if(mask.coverage(p.x,p.y,w+gap*2,h+gap*2)<.999)continue;
        if(grid.intersects(p,gap))continue;
        found=p;break;
      }
      if(!found)break;
      grid.add(found); placed.push({...item,...found,font});
      if(j%70===0) { onProgress((j/order.length)*.8); await new Promise(r=>setTimeout(r,0)); }
    }
    if(placed.length===comments.length)break;
    globalScale*=.87;
  }
  if(placed.length!==comments.length)throw new Error('This collection could not be packed safely. Use the reading list, or try a smaller collection.');
  const nodes=placed.sort((a,b)=>a.index-b.index).map(p=>{
    const rng=random(p.seed ^ 0x5f3759df);
    // Smooth depth field plus small jitter: neighbours share a billowing sheet.
    // This limits close-range overlap while providing real differential parallax.
    const z = -54 + 48*Math.sin(p.x*.0052) + 34*Math.cos(p.y*.009+p.x*.003) + (rng()-.5)*18;
    const color = p.mask&1 ? [.98,.85,.71] : p.mask&2 ? [1.,.91,.69] : p.mask&4 ? [.69,.85,1.] : [.94,.93,.87];
    // Packing plane is the reference projection at Z=3200. Position is set ONCE.
    const compensation=(3200-z)/3200;
    return Object.freeze({...p, layoutX:p.x-WORLD.width/2, layoutY:WORLD.height/2-p.y,
      x:(p.x-WORLD.width/2)*compensation, y:(WORLD.height/2-p.y)*compensation, z,
      w:p.w*compensation,h:p.h*compensation,font:p.font*compensation,
      color, luminosity:.8+rng()*.2});
  });
  const bounds=Object.freeze({minZ:Math.min(...nodes.map(n=>n.z)),maxZ:Math.max(...nodes.map(n=>n.z))});
  const fingerprint=String(hash(nodes.map(n=>[n.comment.id,n.x,n.y,n.z,n.w,n.h].join(',')).join('|')));
  onProgress(1);
  return { nodes: Object.freeze(nodes), mask, fingerprint, bounds };
}
