import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalAction, locateSource, lyricSegments, sourceSegments, prepareSong, cueAt, bounceCue, phraseIndex, project, mediaDuration } from '../src/starlight/core.js';
import { SourceBridge } from '../src/starlight/bridge.js';
const source = { id: 's', text: 'A little light stays. 🌙\nYou are safe here.', author: 'sample' };
const map = new Map([[source.id, source]]);
const word = (text, start = 0, end = 1) => ({ text, start, end, source: 'comment', matches: [{ commentId: 's', sourceStart: source.text.indexOf(text), sourceEnd: source.text.indexOf(text) + text.length }] });
const manifest = { duration: 8, commentsById: { s: { text: source.text } }, phrases: [{ text: 'little light', start: 0, words: [word('little', 0, .5), word('light', .5, 1)] }] };

test('a normal first-click arrival stops at focused; explicit second click opens', () => { assert.equal(arrivalAction({}), 'focused'); assert.equal(arrivalAction({ openOnArrival: true }), 'read'); });
test('valid original range keeps exact text and author', () => { const r = locateSource(word('little'), map); assert.equal(r.text, 'little'); assert.equal(r.comment, source); });
test('invalid range never becomes a fuzzy match', () => { assert.equal(locateSource({ ...word('little'), matches: [{ commentId: 's', sourceStart: 1000, sourceEnd: 1006 }] }, map), null); });
test('missing and added words never invent a source', () => { assert.equal(locateSource({ ...word('little'), source: 'added' }, map), null); assert.equal(locateSource({ ...word('little'), matches: [{ commentId: 'missing', sourceStart: 2, sourceEnd: 8 }] }, map), null); });
test('UTF-16 surrogate pairs cannot be cut in half', () => { const i = source.text.indexOf('🌙'); assert.equal(locateSource({ ...word('🌙'), matches: [{ commentId: 's', sourceStart: i, sourceEnd: i + 1 }] }, map), null); assert.equal(locateSource(word('🌙'), map).text, '🌙'); });
test('an adapted spelling retains its real original', () => { const r = locateSource({ ...word('little'), text: 'chhoti' }, map); assert.equal(r.text, 'little'); assert.equal(r.adapted, true); });
test('lyric layout preserves its own spaces and punctuation exactly', () => { const row = { text: '“little,”  light!', records: [{ word: { text: 'little' } }, { word: { text: 'light' } }] }; assert.equal(lyricSegments(row).map(s => s.text).join(''), row.text); });
test('an unmappable timing token leaves a whole readable phrase', () => { const row = { text: 'one two', records: [{ word: { text: 'missing' } }] }; assert.deepEqual(lyricSegments(row), [{ text: 'one two', record: null }]); });
test('repeated words are located sequentially', () => { const records = Array.from({ length: 3 }, () => ({ word: { text: 'stay' } })); assert.equal(lyricSegments({ text: 'stay, stay, stay.', records }).filter(s => s.record).length, 3); });
test('source highlighting is a lossless partition, including Unicode and line breaks', () => { const parts = sourceSegments(source.text, [{ start: 2, end: 8 }, { start: 5, end: 14 }]); assert.equal(parts.map(s => s.text).join(''), source.text); assert.equal(parts.filter(s => s.kept).map(s => s.text).join(''), source.text.slice(2, 14)); });
test('a manifest belongs only to an exact collection', () => { assert.equal(prepareSong(manifest, [source]).valid, true); assert.equal(prepareSong(manifest, [{ ...source, text: source.text + ' changed' }]).valid, false); });
test('compilation does not mutate the collection or manifest', () => { const before = JSON.stringify({ source, manifest }); prepareSong(manifest, [source]); assert.equal(JSON.stringify({ source, manifest }), before); });
test('out-of-order timings fail before playback', () => { const bad = structuredClone(manifest); bad.phrases[0].words[1].start = -1; assert.equal(prepareSong(bad, [source]).valid, false); });
test('unlocated comment words stay readable and produce an explicit warning', () => { const bad = structuredClone(manifest); bad.phrases[0].words[0].matches = []; const result = prepareSong(bad, [source]); assert.equal(result.valid, true); assert.equal(result.warnings.length, 1); assert.equal(result.records[0].origin, null); });
test('contiguous timestamps still give the star a collection flight', () => { const records = prepareSong(manifest, [source]).records; const cue = cueAt(records, .35); assert.equal(cue.phase, 'flight'); assert.equal(cue.record.word.text, 'light'); assert.ok(cue.progress > 0 && cue.progress < 1); });
test('seeking is stateless and deterministic', () => { const records = prepareSong(manifest, [source]).records; const a = cueAt(records, .7); cueAt(records, .1); assert.deepEqual(cueAt(records, .7), a); assert.equal(cueAt(records, 7), null); });
test('phrase selection supports backward seeks and intro gaps', () => { const p = [{ start: 2 }, { start: 6 }, { start: 12 }]; assert.equal(phraseIndex(p, 1), -1); assert.equal(phraseIndex(p, 12), 2); assert.equal(phraseIndex(p, 6), 1); });
test('missing media metadata falls back to manifest timing', () => { assert.equal(mediaDuration({ duration: NaN }, prepareSong(manifest, [source]), manifest), 8); });
test('projection never changes the original world node', () => { const n = Object.freeze({ x: 12, y: 3, z: 0 }); const p = project(n, { x: 0, y: 0, z: 1000 }, 1440, 900); assert.ok(p.x > 720); assert.equal(project(n, { x: 0, y: 0, z: 0 }, 1440, 900), null); });
test('Canvas bridge reuses whole original comment tiles and releases temporary references', () => {
  globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
  let draws = 0; const tileCanvas = {}, node = Object.freeze({ ...source, comment: source, index: 1, x: 0, y: 0, z: 0, w: 100, h: 30, luminosity: 1 });
  const ctx = { save() {}, restore() {}, setTransform() {}, drawImage(c) { assert.equal(c, tileCanvas); draws++; } };
  const renderer = { ctx, dpr: 1, tiles: [{ node, canvas: tileCanvas }] }, bridge = new SourceBridge();
  bridge.prepare(renderer, [node], 's'); bridge.render({ x: 0, y: 0, z: 1000 }, { fade: 1, gather: 1, destination: { x: 720, y: 450, width: 300, height: 90 } });
  assert.equal(draws, 1); assert.equal(node.x, 0); bridge.dispose(); assert.equal(bridge.items.length, 0); assert.equal(renderer.tiles[0].canvas, tileCanvas);
});
test('WebGL bridge releases its buffers, never the constellation atlas texture', () => {
  globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
  const calls = []; const gl = new Proxy({}, { get: (_, name) => name.toUpperCase() === name ? 1 : (...args) => calls.push([name, ...args]) });
  const node = { comment: source, index: 0, x: 0, y: 0, z: 0, w: 100, h: 30, luminosity: 1 };
  const texture = {}, page = { nodes: [node], array: new Float32Array(16), texture, width: 100, height: 30 };
  const renderer = { gl, pages: [page], createQuadBatch(array) { return { array, buffer: {}, vao: {}, count: 1 }; }, use() {}, loc(_, n) { return n; }, drawCalls: 0 };
  const bridge = new SourceBridge(); bridge.prepare(renderer, [node], 's'); bridge.render({ x: 0, y: 0, z: 1000 }, { fade: 1 }); bridge.dispose();
  assert.equal(renderer.drawCalls, 1); assert.ok(calls.some(c => c[0] === 'deleteBuffer')); assert.ok(calls.some(c => c[0] === 'deleteVertexArray')); assert.ok(!calls.some(c => c[0] === 'deleteTexture'));
});


test('lyric bounce holds the last word through a silence instead of disappearing', () => {
  const records=prepareSong(manifest,[source]).records;
  const cue=bounceCue(records,6);
  assert.equal(cue.record,records.at(-1)); assert.equal(cue.phase,'rest');
  assert.deepEqual(bounceCue(records,6),cue);
});
test('lyric hops land on their word timestamp and never target an earlier word', () => {
  const records=prepareSong(manifest,[source]).records; let previous=-1;
  for(let t=0;t<2;t+=.005){const cue=bounceCue(records,t);assert.ok(cue.record.wordIndex>=previous);previous=cue.record.wordIndex;}
  const landing=bounceCue(records,records[1].word.start);
  assert.equal(landing.record,records[1]);assert.equal(landing.progress,0);assert.equal(landing.phase,'rest');
});

test('wrapped hops stay out of both rows of lyric glyphs', async () => {
  const { bouncePoint } = await import('../src/starlight/courier.js');
  const upper={top:200,bottom:256,left:100,right:800,ceiling:140};
  const lower={top:298,bottom:354,left:330,right:520,ceiling:267};
  const from={x:770,y:192,row:upper},to={x:370,y:290,row:lower};
  for(let p=0;p<=1;p+=.002) {
    const at=bouncePoint(from,to,p,.42);
    for(const row of [upper,lower]) assert.ok(at.x+7<=row.left || at.x-7>=row.right || at.y+7<=row.top || at.y-7>=row.bottom, `star crosses a lyric at ${p}: ${JSON.stringify(at)}`);
  }
  // The next lower-row bounce must not jump back into the upper sentence.
  for(let p=0;p<=1;p+=.005) assert.ok(bouncePoint(to,{x:490,y:290,row:lower},p,.48).y-7>=upper.bottom);
  assert.deepEqual(bouncePoint(from,to,0,.42),{x:from.x,y:from.y});
  assert.deepEqual(bouncePoint(from,to,1,.42),{x:to.x,y:to.y});
});


test('the star returns above a new phrase without rising through its letters', async () => {
  const { bouncePoint } = await import('../src/starlight/courier.js');
  const row={top:310,bottom:367,left:780,right:1225,edge:1225,ceiling:245};
  const from={x:1180,y:397},to={x:820,y:302,row};
  for(let p=0;p<=1;p+=.002) {
    const at=bouncePoint(from,to,p,.42);
    assert.ok(at.x+7<=row.left || at.x-7>=row.right || at.y+7<=row.top || at.y-7>=row.bottom, `phrase handoff crosses letters at ${p}`);
  }
});

test('word hops have constant downward acceleration and exact contact times', async () => {
  const { makeBouncePath, STAR_GRAVITY }=await import('../src/starlight/courier.js');
  const from={x:100,y:200},to={x:200,y:200},duration=.4,path=makeBouncePath(from,to,duration),dt=.001;
  assert.deepEqual(path(0),from);assert.deepEqual(path(1),to);
  for(const time of [.05,.1,.2,.3]) {
    const a=path((time-dt)/duration),b=path(time/duration),c=path((time+dt)/duration);
    assert.ok(Math.abs((c.y-2*b.y+a.y)/(dt*dt)-STAR_GRAVITY)<.001);
  }
});
test('row returns carry speed through curve boundaries without intermediate stops', async () => {
  const { makeBouncePath }=await import('../src/starlight/courier.js');
  const row={top:200,bottom:256,left:100,right:800,ceiling:140};
  const next={top:298,bottom:354,left:330,right:520,ceiling:267};
  const path=makeBouncePath({x:770,y:192,row},{x:370,y:290,row:next},.6);
  const speeds=[];
  for(let i=101;i<900;i++){const a=path((i-1)/1000),b=path(i/1000);speeds.push(Math.hypot(b.x-a.x,b.y-a.y));}
  const max=Math.max(...speeds);
  for(let i=1;i<speeds.length;i++)assert.ok(Math.abs(speeds[i]-speeds[i-1])<max*.08);
  assert.ok(Math.min(...speeds)>max*.08);
});
test('the gathered original persists through the intro until source lyrics begin', async () => {
  const { phraseSource }=await import('../src/starlight/core.js');
  const phrases=[{sourceIds:[]},{sourceIds:[]},{sourceIds:[]},{sourceIds:[]},{sourceIds:['opening']},{sourceIds:['next']},{sourceIds:[]}];
  for(let i=0;i<4;i++)assert.deepEqual(phraseSource(phrases,i,'opening'),{id:'opening',opening:true});
  assert.deepEqual(phraseSource(phrases,4,'opening'),{id:'opening',opening:false});
  assert.deepEqual(phraseSource(phrases,5,'opening'),{id:'next',opening:false});
  assert.equal(phraseSource(phrases,6,'opening').id,null);
});
