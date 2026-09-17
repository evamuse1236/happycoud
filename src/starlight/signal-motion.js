/** Lost Signal. Pure, deterministic motion; seconds and CSS pixels throughout.
 * No timers, randomness, synthetic word timings, or mutations of archive nodes. */
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
export const mix = (a, b, p) => a + (b - a) * p;
export const ease = p => { p = clamp(p); return p ** 3 * (10 + p * (-15 + 6 * p)); };
export const phase = (time, start, end) => ease((time - start) / Math.max(.001, end - start));
export const ENTRY = Object.freeze({ lock: 1.5, hush: 2.7, witness: 4.1, recognize: 4.9, weave: 6.2, dock: 7.65, clearStart: 5.8, clearEnd: 6.4, end: 8.1 });
export function entryState(time, reduced = false) {
  const t = reduced ? ENTRY.end : Math.max(0, time), v=t*1.3;
  return { time: t, storyTime:v, clear:phase(t,ENTRY.clearStart,ENTRY.clearEnd),
    phase: t>=ENTRY.clearEnd?'quiet':v < 1.5 ? 'tuning' : v < 2.7 ? 'listening' : v < 4.9 ? 'remembering' : v < 6.2 ? 'weaving' : v < 7.65 ? 'settling' : 'connected',
    lock: phase(v, .15, 1.5), hush: phase(v, 1.35, 2.7), approach: phase(v, 2.6, 4.1),
    ink: phase(v, 3.85, 4.25), recognition: phase(v, 4.05, 4.85), weave: phase(v, 4.9, 6.2),
    dock: phase(v, 6.25, 7.65), controls: phase(t, 7.35, 8.1), done: t >= ENTRY.end };
}
/** A carrier finding coherence. Not a fake audio waveform or a network indicator. */
export function carrierPath(time, coherence = 0, width = 160, height = 44) {
  const c = clamp(coherence), mid = height / 2, points = [];
  for (let x = 0; x <= width; x += 2) {
    const u = x / width, envelope = Math.sin(Math.PI * u) ** 2;
    const carrier = Math.sin(u * Math.PI * 5 - time * 1.9) * 5;
    const interference = Math.sin(u * 34 + time * 2.3) * 3.8 + Math.sin(u * 63 - time * .8) * 1.7;
    const y = mid + envelope * (carrier * (.5 + c * .5) + interference * (1 - c));
    // The two halves join gradually; there is no rapid opacity flashing.
    if (Math.abs(u - .5) < .065 * (1 - c)) { points.push(null); continue; }
    points.push({ x, y });
  }
  let pen = false;
  return points.map(p => { if (!p) { pen = false; return ''; } const s = `${pen ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`; pen = true; return s; }).join(' ');
}
export function rectMix(a, b, p) {
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, mix(a[k], b[k], p)]));
}
export function drift(from, to, progress, lift = 35) {
  const p = ease(progress), arc = 16 * p * p * (1 - p) * (1 - p);
  return { x: mix(from.x, to.x, p), y: mix(from.y, to.y, p) - lift * arc };
}
/** Contact-to-contact flight. Constant horizontal velocity, constant gravity.
 * Applying an ease to this parabola would destroy the perceived weight. */
export function ballistic(from, to, u, duration = .42, maxLift = 46) {
  u = clamp(u); const T = Math.max(.04, duration), distance = Math.abs(to.x - from.x);
  const lift = Math.min(Math.max(0, maxLift), Math.max(9, Math.min(46, 600 * T * T / 8 + distance * .035)));
  const vx = (to.x - from.x) / T, vy = ((to.y - from.y) - 4 * lift + 8 * lift * u) / T;
  return { x: mix(from.x, to.x, u), y: mix(from.y, to.y, u) - 4 * lift * u * (1 - u), vx, vy, lift };
}
const bezier = (a, b, c, d, t) => ({
  x: (1-t)**3*a.x + 3*(1-t)**2*t*b.x + 3*(1-t)*t*t*c.x + t**3*d.x,
  y: (1-t)**3*a.y + 3*(1-t)**2*t*b.y + 3*(1-t)*t*t*c.y + t**3*d.y });
/** A line wrap goes AROUND the previous row, through the interline airspace.
 * The row geometry is measured, not guessed from the string length. */
export function wrapFlight(from, to, u) {
  u = clamp(u);
  const right = Math.max(from.row?.right ?? from.x, to.row?.right ?? to.x) + 20;
  const left = Math.min(from.row?.left ?? from.x, to.row?.left ?? to.x) - 15;
  const gap = ((from.row?.bottom ?? from.y + 26) + (to.row?.top ?? to.y + 8)) / 2;
  if (u < .26) return bezier(from, {x:right,y:from.y-12}, {x:right+8,y:gap}, {x:right,y:gap}, ease(u/.26));
  if (u < .79) return {x:mix(right,left,ease((u-.26)/.53)),y:gap};
  return bezier({x:left,y:gap}, {x:left-5,y:to.y-5}, {x:to.x-12,y:to.y-10}, to, ease((u-.79)/.21));
}
export function landing(seconds) {
  const t = Math.max(0, seconds), compression = Math.max(0, Math.sin(Math.PI * Math.min(1, t / .12))) * Math.exp(-t * 8);
  return { x: 1 + compression * .4, y: 1 - compression * .3 };
}
export function sameRow(a, b) { return Math.abs(a.y - b.y) < Math.max(12, Math.min(a.height || 24, b.height || 24) * .6); }
export function hopLead(a, b) {
  if (!a || !b) return .36;
  return sameRow(a,b) ? clamp(.18 + Math.sqrt(Math.abs(a.x-b.x)) * .023, .2, .56) : .72;
}
/** Resolve directly from recording.currentTime. A seek is not an animated journey. */
export function pulseCue(records, rects, time) {
  const visible = records.filter(r => rects.has(r.key)); if (!visible.length) return null;
  let i = -1; for (let j=0;j<visible.length;j++) { if(visible[j].word.start <= time) i=j; else break; }
  const prev = visible[i], next = visible[i+1];
  if (next) {
    const to = rects.get(next.key), from = prev ? rects.get(prev.key) : { ...to, x:to.x-16, y:to.y-26 };
    const start = prev ? Math.max(prev.word.start + Math.min(.065,(next.word.start-prev.word.start)*.18), next.word.start-hopLead(from,to)) : next.word.start-.38;
    if(time >= start && next.word.start > start) {
      const duration=next.word.start-start, wrap=!!prev&&!sameRow(from,to);
      return {key:next.key, from, to, u:clamp((time-start)/duration), duration, phase:'flight', wrap, dissolve:wrap};
    }
  }
  if (prev) return {key:prev.key,from:rects.get(prev.key),to:rects.get(prev.key),phase:'rest',contact:Math.max(0,time-prev.word.start),u:1};
  return null;
}
export function cuePosition(cue) {
  if (!cue) return null;
  if (cue.phase !== 'flight') return {...cue.to,vx:0,vy:0};
  // At a row break, change rows only while invisible; never traverse the text.
  if (cue.wrap) return {...(cue.u<.5?cue.from:cue.to),vx:0,vy:0};
  const ceiling = cue.to.row?.ceiling ?? cue.to.y-50;
  return ballistic(cue.from,cue.to,cue.u,cue.duration,Math.max(7,Math.min(cue.from.y,cue.to.y)-ceiling));
}
export function displayPhrase(phrases, time) {
  if (!phrases.length) return -1;
  let i=0; for(let j=1;j<phrases.length;j++){if(phrases[j].start<=time)i=j;else break;}
  const p=phrases[i], next=phrases[i+1];
  // Never remove a held word while it is still being sung.
  if(next && time>=Math.max(p.end,next.start-.62)) return i+1;
  return i;
}
export function sourceLead(record, previous = null) {
  const start = Math.max(record.word.start-.68, previous?.word.start ?? -Infinity);
  return {start,end:record.word.start, duration:Math.max(.08,record.word.start-start)};
}
