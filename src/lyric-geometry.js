/** Source indices are UTF-16, just like String.slice and the existing song manifest. */
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
export const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
export const mix=(a,b,t)=>a+(b-a)*t;
export function validateSong(song){
  if(!song||!Array.isArray(song.phrases)||!song.phrases.length)return false;
  let previous=-Infinity;
  return song.phrases.every(phrase=>{
    if(!Array.isArray(phrase.words)||!phrase.words.length||typeof phrase.text!=='string')return false;
    const start=Number(phrase.start??phrase.words[0].start);
    if(!Number.isFinite(start)||start<0||start<previous)return false;previous=start;
    return phrase.words.every(w=>typeof w.text==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>=w.start);
  });
}
export function lineRanges(node){
  const result=[];let cursor=0;
  for(const [lineIndex,line] of node.lines.entries()){
    if(!line){result.push({text:'',start:cursor,end:cursor,lineIndex});continue;}
    const start=node.comment.text.indexOf(line,cursor);
    // Never manufacture a source position for a rewritten or incompatible line.
    if(start<0)return [];
    result.push({text:line,start,end:start+line.length,lineIndex});cursor=start+line.length;
  }
  return result;
}
export function exactSource(word,nodesById){
  if(word.source!=='comment')return null;
  for(const m of word.matches||[]){
    const node=nodesById.get(m.commentId);
    if(!node||!Number.isInteger(m.sourceStart)||!Number.isInteger(m.sourceEnd)||m.sourceStart<0||m.sourceEnd<=m.sourceStart||m.sourceEnd>node.comment.text.length)continue;
    const splitsPair=at=>at>0&&at<node.comment.text.length&&/[\uD800-\uDBFF]/u.test(node.comment.text[at-1])&&/[\uDC00-\uDFFF]/u.test(node.comment.text[at]);
    if(splitsPair(m.sourceStart)||splitsPair(m.sourceEnd))continue;
    const text=node.comment.text.slice(m.sourceStart,m.sourceEnd);
    const segments=lineRanges(node).flatMap(line=>{
      const start=Math.max(m.sourceStart,line.start),end=Math.min(m.sourceEnd,line.end);
      return end>start?[{line,start:start-line.start,end:end-line.start,text:node.comment.text.slice(start,end)}]:[];
    });
    if(!segments.length||segments.map(s=>s.text).join('').replace(/\s/g,'')!==text.replace(/\s/g,''))continue;
    return {node,match:m,text,segments,key:`${node.comment.id}:${m.sourceStart}:${m.sourceEnd}`};
  }
  return null;
}
/** Measured slices of the ORIGINAL texture. Nothing is retyped for the GPU. */
export function sourceCrops(source,measure,lineHeight=1.32){
  const n=source.node,f=n.font;
  return source.segments.map(segment=>{
    const line=segment.line.text;
    const prefix=measure(line.slice(0,segment.start),f),end=measure(line.slice(0,segment.end),f);
    const left=n.w/2-measure(line,f)/2+prefix-f*.035;
    const top=f*(.18+segment.line.lineIndex*lineHeight);
    const width=Math.min(n.w-left,end-prefix+f*.07),height=Math.min(n.h-top,f*lineHeight);
    return {source,left:Math.max(0,left),top,width:Math.max(.01,width),height:Math.max(.01,height),text:segment.text,
      x:n.x-n.w/2+left+width/2,y:n.y+n.h/2-top-height/2,z:n.z,font:f};
  });
}
/** Minimum-jerk endpoints; a modest shared tide, not a particle explosion. */
export function flight(origin,target,t,seed=0,reduced=false){
  const e=reduced?1:smooth(t),arc=reduced?0:Math.sin(Math.PI*e)**2;
  const distance=Math.hypot(target.x-origin.x,target.y-origin.y);
  const bend=Math.min(120,distance*.09)*(seed%2?1:-1);
  return {x:mix(origin.x,target.x,e)+bend*arc,y:mix(origin.y,target.y,e)-Math.min(75,distance*.06)*arc,
    width:mix(origin.width,target.width,e),height:mix(origin.height,target.height,e)};
}
export function phraseIndex(phrases,time){
  let lo=0,hi=phrases.length-1,answer=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;const start=phrases[mid].start??phrases[mid].words[0]?.start??Infinity;
    if(start<=time){answer=mid;lo=mid+1;}else hi=mid-1;}
  return answer;
}
export function timeLabel(t){t=Number.isFinite(t)?Math.max(0,t):0;return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
