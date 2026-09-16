import { hash } from './math.js';
/** A short, deterministic path through ACTUAL nodes. No generated praise or invented links. */
export function planJourney(nodes, { mood=0, author=null, seen=new Set(), limit=7 }={}) {
  const pool=nodes.filter(n=>(!mood||(n.mask&mood))&&(!author||n.comment.author===author));
  if(!pool.length)return [];
  // Evenly spaced x bands avoid repetitive stops and long, disorienting cross-sky jumps.
  const sorted=[...pool].sort((a,b)=>a.x-b.x || a.seed-b.seed);
  const count=Math.min(limit,sorted.length),route=[],usedAuthors=new Set();
  for(let i=0;i<count;i++){
    const slice=sorted.slice(Math.floor(i*sorted.length/count),Math.floor((i+1)*sorted.length/count));
    const score=n=>(seen.has(n.comment.id)?0:5)+(usedAuthors.has(n.comment.author)?0:2)+(n.comment.text.length<190?2:0)+(hash(n.comment.id+'trail')%997)/997;
    slice.sort((a,b)=>score(b)-score(a));const next=slice[0];route.push(next);usedAuthors.add(next.comment.author);
  }
  return Object.freeze(route);
}
/** Content-free browser memory: IDs and view preferences, never private wording. */
export class LocalMemory {
  constructor(storage, namespace='khushi-observatory-v2') { this.storage=storage;this.namespace=namespace;this.key=null;this.visited=new Set();this.kept=new Set();this.available=!!storage; }
  read(key,fallback) {try{return JSON.parse(this.storage?.getItem(key)||'null')??fallback;}catch{this.available=false;return fallback;} }
  write(key,value){if(!this.storage){this.available=false;return false;}try{this.storage?.setItem(key,JSON.stringify(value));return true;}catch{this.available=false;return false;} }
  useCollection(data){
    // IDs determine identity; metadata changes need not erase one's personal trail.
    this.key=this.namespace+':'+hash((data.account||'local')+'|'+data.comments.map(c=>c.id).sort().join('|'));
    const record=this.read(this.key,{}),valid=new Set(data.comments.map(c=>c.id));
    this.visited=new Set((Array.isArray(record.visited)?record.visited:[]).filter(id=>valid.has(id)));
    this.kept=new Set((Array.isArray(record.kept)?record.kept:[]).filter(id=>valid.has(id)));
  }
  save(){if(this.key)return this.write(this.key,{visited:[...this.visited],kept:[...this.kept]});return false;}
  visit(id){this.visited.add(id);this.save();}
  toggleKeep(id){if(this.kept.has(id))this.kept.delete(id);else this.kept.add(id);this.save();return this.kept.has(id);}
  forget(){this.visited.clear();this.kept.clear();this.save();}
}
