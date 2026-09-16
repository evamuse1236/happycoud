/** The recording's media clock is the only playback clock. Seconds retain provider precision. */
export function phraseAt(phrases, time) {
  let lo=0,hi=phrases.length-1,found=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(phrases[mid].start<=time){found=mid;lo=mid+1;}else hi=mid-1;}
  return found;
}

export function wordState(word,time){
  if(time<word.start)return 'waiting';
  return time<word.end?'singing':'sung';
}

export function clockLabel(seconds){
  const n=Math.max(0,Math.floor(Number(seconds)||0));
  return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}

/** Reject mismatched imports: source words must belong to this actual constellation. */
export function belongsToCollection(song,comments){
  if(!song?.phrases?.length||!song.commentsById)return false;
  const byId=new Map(comments.map(c=>[c.id,c]));
  const sources=Object.entries(song.commentsById);
  return sources.length>0&&sources.every(([id,c])=>byId.get(id)?.text===c.text);
}
