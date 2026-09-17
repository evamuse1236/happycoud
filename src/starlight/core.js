/** Starlight's pure model. Original comments and camera nodes are never mutated. */
export const TAN = Math.tan(Math.PI / 10);
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = n => { const t = clamp(n); return t * t * t * (t * (t * 6 - 15) + 10); };
export const arrivalAction = pending => pending?.openOnArrival ? 'read' : 'focused';
export const timeLabel = t => `${Math.floor(Math.max(0, t || 0) / 60)}:${String(Math.floor(Math.max(0, t || 0) % 60)).padStart(2, '0')}`;
export function project(node, camera, width, height) {
  const distance = camera.z - node.z;
  if (distance < 1) return null;
  const scale = height / (2 * TAN * distance);
  return { x: width / 2 + (node.x - camera.x) * scale, y: height / 2 - (node.y - camera.y) * scale, scale };
}
export function arc(from, to, progress, lift = 64) {
  const t = smooth(progress);
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) - Math.sin(Math.PI * t) * lift };
}
export function phraseIndex(phrases, time) {
  let lo = 0, hi = phrases.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (phrases[mid].start <= time) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
}
function boundary(text, at) {
  return !(at > 0 && at < text.length && /[\uD800-\uDBFF]/u.test(text[at - 1]) && /[\uDC00-\uDFFF]/u.test(text[at]));
}
/** A manifest range is evidence. Similar-looking text is not evidence. */
export function locateSource(word, comments) {
  if (word.source !== 'comment') return null;
  for (const match of word.matches || []) {
    const comment = comments.get(match.commentId), start = match.sourceStart, end = match.sourceEnd;
    if (!comment || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > comment.text.length) continue;
    if (!boundary(comment.text, start) || !boundary(comment.text, end)) continue;
    const text = comment.text.slice(start, end);
    if (!text.trim()) continue;
    return { comment, commentId: comment.id, start, end, text, key: `${comment.id}:${start}:${end}`,
      adapted: text.normalize('NFC').replace(/\s+/gu, ' ').trim() !== word.text.normalize('NFC').replace(/\s+/gu, ' ').trim() };
  }
  return null;
}
/** Preserve the lyric's own punctuation and whitespace. Never reserve source-word widths. */
export function lyricSegments(phrase) {
  const segments = []; let cursor = 0;
  for (const record of phrase.records) {
    const at = phrase.text.indexOf(record.word.text, cursor);
    if (at < 0) return [{ text: phrase.text, record: null }];
    if (at > cursor) segments.push({ text: phrase.text.slice(cursor, at), record: null });
    segments.push({ text: record.word.text, record }); cursor = at + record.word.text.length;
  }
  if (cursor < phrase.text.length) segments.push({ text: phrase.text.slice(cursor), record: null });
  return segments;
}
export function sourceSegments(text, ranges) {
  const valid = ranges.filter(r => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end <= text.length && r.end > r.start);
  const edges = [...new Set([0, text.length, ...valid.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
  return edges.slice(0, -1).map((start, i) => {
    const end = edges[i + 1];
    return { start, end, text: text.slice(start, end), kept: valid.some(r => start >= r.start && end <= r.end) };
  });
}
export function prepareSong(song, collection) {
  const errors = [], warnings = [], comments = new Map(collection.map(c => [c.id, c]));
  if (!song || !Array.isArray(song.phrases) || !song.phrases.length) return { valid: false, errors: ['No timed phrases.'], warnings, phrases: [], records: [], sources: [] };
  const entries = Object.entries(song.commentsById || {});
  if (!entries.length || entries.some(([id, c]) => !c || comments.get(id)?.text !== c.text)) errors.push('This recording does not belong to the loaded comment collection.');
  let lastStart = -1, sequence = 0;
  const records = [], used = new Map();
  const phrases = song.phrases.map((p, index) => {
    const start = Number(p.start ?? p.words?.[0]?.start);
    if (typeof p.text !== 'string' || !Array.isArray(p.words) || !p.words.length || !Number.isFinite(start) || start < 0 || start < lastStart) errors.push(`Invalid phrase ${index + 1}.`);
    lastStart = start;
    let lastWord = -1;
    const row = { ...p, index, start, text: typeof p.text === 'string' ? p.text : '', records: [] };
    for (const [wordIndex, word] of (Array.isArray(p.words) ? p.words : []).entries()) {
      if (!word || typeof word.text !== 'string' || !word.text.length || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start || word.start < lastWord) { errors.push(`Invalid word timing in phrase ${index + 1}.`); continue; }
      lastWord = word.start;
      const origin = locateSource(word, comments);
      const record = { key: `p${index}-w${wordIndex}`, sequence: sequence++, wordIndex, phraseIndex: index, word, origin };
      if (word.source === 'comment' && !origin) warnings.push(`${record.key}: no valid source range; no source flight will be shown.`);
      if (origin) used.set(origin.commentId, origin.comment);
      row.records.push(record); records.push(record);
    }
    row.end = Math.max(start || 0, ...row.records.map(r => r.word.end));
    row.sourceIds = [...new Set(row.records.flatMap(r => r.origin ? [r.origin.commentId] : []))];
    const segments = lyricSegments(row);
    if (row.records.length && !segments.some(s => s.record)) warnings.push(`Phrase ${index + 1}: timing tokens do not match lyric text; displaying the intact lyric without token animation.`);
    return row;
  });
  return { valid: errors.length === 0, errors, warnings, phrases, records, sources: [...used.values()], comments };
}
/** Pause, seek and resize are safe: every visual is derived from this clock, not timers. */
export function cueAt(records, time) {
  // The courier can collect the NEXT word while the current word remains sung.
  // This matters for contiguous timestamps: singing must not starve every flight.
  const index = records.findIndex(r => r.word.start > time);
  if (index >= 0) {
    const next = records[index], previous = records[index - 1];
    const afterLanding = previous ? previous.word.start + Math.max(.04, (previous.word.end - previous.word.start) * .43) : -Infinity;
    const start = Math.min(next.word.start - .04, Math.max(next.word.start - .62, afterLanding));
    if (time >= start) return { record: next, previous, phase: 'flight', progress: clamp((time - start) / (next.word.start - start)) };
  }
  const singing = records.find(r => time >= r.word.start && time < Math.max(r.word.start + .04, r.word.end));
  if (singing) return { record: singing, phase: 'singing', progress: clamp((time - singing.word.start) / Math.max(.12, singing.word.end - singing.word.start)) };
  return null;
}
export function mediaDuration(recording, model, manifest) {
  if (Number.isFinite(recording.duration) && recording.duration > 0) return recording.duration;
  return Math.max(Number(manifest?.duration) || 0, ...model.records.map(r => r.word.end), 1);
}

/** One forward-only sequence of hops. Held words remain a visible landing. */
export function bounceCue(records, time, entryTime = -Infinity) {
  if (!records.length) return null;
  let landed = -1;
  for (let i=0;i<records.length;i++) { if(records[i].word.start<=time)landed=i; else break; }
  const next=records[landed+1], previous=records[landed];
  if(next) {
    const start=previous ? Math.max(previous.word.start+.045,next.word.start-.48) : Math.max(entryTime,next.word.start-.48);
    if(time>=start && next.word.start>start) return {record:next,previous,phase:'flight',duration:next.word.start-start,progress:clamp((time-start)/(next.word.start-start))};
  }
  if(!previous)return {record:records[0],previous:null,phase:'flight',progress:0};
  const record=previous||records[0];
  return {record,previous:records[Math.max(0,landed)-1],phase:'rest',progress:clamp((time-record.word.start)/.22)};
}

/** Display-only subdivisions; the recording supplies one interval for the name. */
export function lyricBeats(records) {
  return records.flatMap(r=>{
    if(r.word.text.replace(/\s/g,'').toUpperCase()!=='KHUSHI')return [r];
    const letters=[...r.word.text].filter(c=>! /\s/.test(c)),span=r.word.end-r.word.start;
    return letters.map((letter,i)=>({...r,key:r.key+'-letter'+i,parentKey:r.key,
      word:{...r.word,text:letter,start:r.word.start+span*i/letters.length,end:r.word.start+span*(i+1)/letters.length}}));
  });
}
export function lyricDisplayIndex(phrases,time) {
  const current=Math.max(0,phraseIndex(phrases,time)),next=phrases[current+1];
  if(next && time>=Math.max(phrases[current].end+.02,next.start-.42))return current+1;
  return current;
}
