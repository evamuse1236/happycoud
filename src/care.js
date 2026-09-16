import { clamp } from './math.js';

/** Session-only navigation memory. Never stores wording, authors, or geometry edits. */
export class ViewTrail {
  constructor(limit = 24) { this.limit = limit; this.items = []; }
  record(view) {
    if (!view || !['x','y','z'].every(k => Number.isFinite(view[k])) || view.z <= 0) return false;
    const last = this.items.at(-1);
    if (last && viewDistance(last, view) < .015) return false;
    this.items.push({x:view.x, y:view.y, z:view.z});
    if (this.items.length > this.limit) this.items.shift();
    return true;
  }
  back(current) {
    while (this.items.length) {
      const view = this.items.pop();
      if (viewDistance(view, current) >= .003) return view;
    }
    return null;
  }
  clear() { this.items = []; }
  get size() { return this.items.length; }
}
export function viewDistance(a,b) {
  return Math.abs(Math.log(a.z/b.z)) + Math.hypot(a.x-b.x,a.y-b.y)/Math.max(78,a.z,b.z);
}

/** A reversible reading sequence, independent of the camera's return position. */
export class ReadingTrail {
  constructor(limit = 60) { this.limit = limit; this.clear(); }
  clear() { this.items = []; this.index = -1; }
  rememberScroll(scroll = 0) { if (this.index >= 0) this.items[this.index].scroll = Math.max(0,Number(scroll)||0); }
  push(id) {
    if (this.items[this.index]?.id === id) return;
    this.items.splice(this.index+1);
    this.items.push({id,scroll:0});
    if (this.items.length > this.limit) this.items.shift();
    this.index = this.items.length-1;
  }
  step(delta) {
    const next = this.index + Math.sign(delta);
    if (next < 0 || next >= this.items.length) return null;
    this.index = next; return {...this.items[this.index]};
  }
  get previous() { return this.index > 0; }
  get next() { return this.index >= 0 && this.index < this.items.length-1; }
}

/** Spend frames on interaction, not on repeatedly drawing a motionless sky. */
export function paintInterval({moving=false,effects=false,ambient=false,saving=false,reading=false}={}) {
  if (moving || effects) return 1000/60;
  if (ambient && !reading) return 1000/(saving ? 15 : 24);
  return Infinity;
}
export function atmosphereExposure(cameraZ, homeZ) {
  const proximity = clamp(Math.log2(Math.max(1,homeZ/cameraZ))/3.5,0,1);
  return .78 - .42*proximity;
}

/** Real people may type combining marks, mixed scripts, emoji and several spaces. */
export function searchKey(value) { return String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase(); }
export function snippetAround(text, query, limit=170) {
  const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(x=>x.segment) : Array.from(text);
  if (segments.length <= limit) return text;
  // Search the folded graphemes but keep a map back to their exact original spelling.
  const folded=segments.map(searchKey), needle=searchKey(query.trim());
  const at=needle?folded.join('').indexOf(needle):-1;
  let hit=0,offset=0;
  if(at>=0){for(let i=0;i<folded.length;i++){if(offset+folded[i].length>at){hit=i;break;}offset+=folded[i].length;}}
  const start=at<0?0:clamp(hit-Math.floor(limit*.3),0,Math.max(0,segments.length-limit));
  const end=Math.min(segments.length,start+limit);
  return (start?'…':'')+segments.slice(start,end).join('')+(end<segments.length?'…':'');
}

/** Never hijack the browser's zoom, history, find, or native text-entry shortcuts. */
export const isTextEntry = target => !!target?.closest?.('input,textarea,select,[contenteditable=true]');
