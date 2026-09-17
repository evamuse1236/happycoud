import {radioState} from '../src/starlight/signal-radio.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENTRY,entryState,carrierPath,ballistic,landing,pulseCue,cuePosition,wrapFlight,displayPhrase,sourceLead,ease,drift} from '../src/starlight/signal-motion.js';
import {prepareSong,lyricSegments,locateSource,lyricBeats} from '../src/starlight/core.js';
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const a={x:20,y:90,width:30,height:26,row:{top:98,bottom:126,left:4,right:280,ceiling:36}},b={...a,x:140};
const records=[{key:'a',word:{text:'hello',start:1,end:1.5}},{key:'b',word:{text:'again',start:2,end:3}}],rects=new Map([['a',a],['b',b]]);
test('entry order is bounded, monotonic, deterministic',()=>{let last={};for(let t=-1;t<10;t+=.013){const s=entryState(t);for(const k of ['lock','hush','approach','ink','recognition','weave','dock','controls']){assert.ok(s[k]>=0&&s[k]<=1);assert.ok(s[k]>=(last[k]||0));}last=s;assert.deepEqual(s,entryState(t));}assert.equal(entryState(ENTRY.end).done,true);});
test('reduced motion resolves the entry without intermediate movement',()=>assert.deepEqual(entryState(0,true),entryState(ENTRY.end)));
test('broken carrier joins rather than remaining a disconnected icon',()=>{assert.equal((carrierPath(0,0).match(/M/g)||[]).length,2);assert.equal((carrierPath(0,1).match(/M/g)||[]).length,1);});
test('carrier remains finite at both coherences over long sessions',()=>{for(let t=0;t<5000;t+=19)for(const c of [0,.3,1])assert.doesNotMatch(carrierPath(t,c),/NaN|Infinity/);});
test('contact flight starts and lands at exact measured coordinates',()=>{for(const u of [0,1]){const p=ballistic(a,b,u);near(p.x,u?b.x:a.x);near(p.y,u?b.y:a.y);}});
test('flight has constant horizontal speed, not easing through every hop',()=>{const ps=[0,.25,.5,.75,1].map(u=>ballistic(a,b,u,.5));ps.forEach(p=>near(p.vx,240));for(let i=1;i<ps.length;i++)near(ps[i].x-ps[i-1].x,30);});
test('flight has constant acceleration and a real apex',()=>{const ps=[0,.25,.5,.75,1].map(u=>ballistic(a,b,u,.5));assert.ok(ps[2].y<ps[1].y);near(ps[2].vy,0);near(ps[1].vy-ps[0].vy,ps[3].vy-ps[2].vy);});
test('lift is bounded by measured available space',()=>{for(const T of [.08,.4,10])assert.ok(ballistic(a,b,.5,T,12).lift<=12);});
test('contact compression settles rather than endlessly bobbing',()=>{assert.ok(landing(.04).x>1);assert.ok(landing(.04).y<1);for(const t of [.13,1,20]){near(landing(t).x,1);near(landing(t).y,1);}});
test('source motion and endpoints are continuous',()=>{assert.deepEqual(drift(a,b,0),{x:a.x,y:a.y});assert.deepEqual(drift(a,b,1),{x:b.x,y:b.y});near(ease(0),0);near(ease(1),1);});
test('pulse lands precisely on the recorded word start',()=>{const cue=pulseCue(records,rects,2);assert.equal(cue.key,'b');assert.equal(cue.phase,'rest');assert.equal(cue.contact,0);near(cuePosition(cue).x,b.x);});
test('pulse holds without slow oscillation on long notes',()=>{assert.deepEqual(cuePosition(pulseCue(records,rects,2.3)),cuePosition(pulseCue(records,rects,2.7)));});
test('timing lookup is seek-independent',()=>{const expected=pulseCue(records,rects,1.86);pulseCue(records,rects,0);pulseCue(records,rects,50);assert.deepEqual(pulseCue(records,rects,1.86),expected);});
test('missing glyphs never manufacture a cursor position',()=>assert.equal(pulseCue(records,new Map(),1),null));
test('rapid words receive bounded real-time travel',()=>{const r=records.map((x,i)=>({...x,word:{...x.word,start:1+i*.1}}));const c=pulseCue(r,rects,1.07);assert.equal(c.phase,'flight');assert.ok(c.duration>0&&c.duration<.1);});
test('multi-line return uses the measured interline gap',()=>{const c={...b,x:45,y:180,row:{top:188,bottom:215,left:20,right:260}};const middle=wrapFlight(a,c,.5);assert.ok(middle.y>a.row.bottom&&middle.y<c.row.top);assert.deepEqual(wrapFlight(a,c,0),{x:a.x,y:a.y});near(wrapFlight(a,c,1).x,c.x);near(wrapFlight(a,c,1).y,c.y);});
test('line-wrap path remains continuous across its three segments',()=>{const c={...b,x:40,y:180,row:{top:188,bottom:216,left:20,right:260}};for(const u of [.26,.79]){const p=wrapFlight(a,c,u-1e-6),q=wrapFlight(a,c,u+1e-6);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<.02);}});
test('impossibly fast wraps dissolve instead of racing through glyphs',()=>{const r=[records[0],{...records[1],word:{...records[1].word,start:1.15}}],m=new Map(rects);m.set('b',{...b,y:180});assert.equal(pulseCue(r,m,1.08).dissolve,true);});
test('held lyric is not removed early',()=>{const ps=[{start:0,end:4.9},{start:5,end:9}];assert.equal(displayPhrase(ps,4.7),0);assert.equal(displayPhrase(ps,4.95),1);});
test('source lead obeys supplied timestamps',()=>{const r=records[1];near(sourceLead(r).start,1.32);near(sourceLead(r).duration,.68);});
test('lyric punctuation and spaces remain exactly canonical',()=>{const text='You,  here — always.',phrase={text,records:[{word:{text:'You,'}},{word:{text:'here'}},{word:{text:'always.'}}]};assert.equal(lyricSegments(phrase).map(s=>s.text).join(''),text);});
test('a name is not given invented per-letter timing',()=>{const p={text:'KHUSHI',records:[{word:{text:'KHUSHI',start:1,end:3}}]};assert.equal(lyricSegments(p).length,1);});
test('unmatched timing tokens preserve the full line',()=>{const p={text:'We are still here.',records:[{word:{text:'not in the line'}}]};assert.deepEqual(lyricSegments(p),[{text:p.text,record:null}]);});
test('source ranges preserve original Unicode and adapted spelling',()=>{const text='तुम हो तो घर है।',comments=new Map([['h',{id:'h',text}]]),word={text:'tum',source:'comment',matches:[{commentId:'h',sourceStart:0,sourceEnd:3}]};const source=locateSource(word,comments);assert.equal(source.text,'तुम');assert.equal(source.adapted,true);assert.equal(comments.get('h').text,text);});
test('source ranges cannot split surrogate-pair characters',()=>{const comments=new Map([['h',{text:'A💛B'}]]);assert.equal(locateSource({source:'comment',text:'?',matches:[{commentId:'h',sourceStart:2,sourceEnd:3}]},comments),null);});
test('a different private collection cannot activate this song',()=>{const song={commentsById:{a:{text:'original'}},phrases:[{text:'original',start:0,words:[{text:'original',start:0,end:1,source:'added'}]}]};assert.equal(prepareSong(song,[{id:'a',text:'different'}]).valid,false);});

test('the first mobile word enters on a hop, not a false full-row wrap',()=>{const point={x:100,y:150,width:34,height:26,row:{top:158,bottom:184,left:60,right:240,ceiling:100}};const c=pulseCue([records[0]],new Map([['a',point]]),.8);assert.equal(c.phase,'flight');assert.equal(c.wrap,false);});

test('KHUSHI display beats traverse each letter inside the supplied interval',()=>{
  const original={key:'name',word:{text:'K H U S H I',start:6.64,end:9.319}};
  const beats=lyricBeats([original]),points=new Map(beats.map((b,i)=>[b.key,{...a,x:80+i*26}]));
  assert.equal(beats.map(b=>b.word.text).join(''),'KHUSHI');
  assert.equal(beats.length,6);assert.equal(beats[0].word.start,original.word.start);near(beats.at(-1).word.end,original.word.end);
  beats.forEach((b,i)=>{const cue=pulseCue(beats,points,b.word.start);assert.equal(cue.key,b.key);near(cue.to.x,80+i*26);});
  assert.deepEqual(original.word,{text:'K H U S H I',start:6.64,end:9.319});
});

test('radio never visually locks before actual playback confirms connection',()=>{
  for(let t=0;t<=ENTRY.end;t+=.02){const s=radioState(t);assert.ok(s.coherence<1);assert.equal((carrierPath(t,s.coherence).match(/M/g)||[]).length,2);assert.ok(s.noise>=0&&s.noise<.06);assert.ok(s.tone<=.031+1e-9);}
  assert.ok(radioState(ENTRY.end).noise<radioState(0).noise);
  assert.ok(radioState(ENTRY.end).detune<radioState(0).detune);
});

test('every row break fades between stationary endpoints, including slow wraps',()=>{
  const to={...b,x:45,y:180,row:{top:188,bottom:215,left:20,right:260}},points=new Map([['a',a],['b',to]]);
  const cue=pulseCue(records,points,1.5);
  assert.equal(cue.wrap,true);assert.equal(cue.dissolve,true);
  for(const u of [0,.25,.49,.5,.75,1]){
    const p=cuePosition({...cue,u});const endpoint=u<.5?a:to;
    near(p.x,endpoint.x);near(p.y,endpoint.y);
  }
});


test('gathering finishes early and leaves a separate wordless interval before connection',()=>{
  assert.equal(entryState(5).weave,1);assert.equal(entryState(6).dock,1);
  for(const t of [6.4,7,8]){const s=entryState(t);assert.equal(s.clear,1);assert.equal(s.phase,'quiet');assert.equal(s.done,false);}
  assert.ok(ENTRY.end-ENTRY.clearEnd>=1.6);assert.equal(entryState(ENTRY.end).done,true);
});
