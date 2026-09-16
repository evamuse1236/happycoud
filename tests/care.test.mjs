import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewTrail,ReadingTrail,paintInterval,atmosphereExposure,snippetAround} from '../src/care.js';
import {CameraRig,project} from '../src/math.js';
import {calloutPosition} from '../src/experience.js';
import {ObservatorySound} from '../src/sound.js';

const view=(x=0,z=900)=>({x,y:0,z});
test('view history copies a camera rather than retaining its mutable reference',()=>{const h=new ViewTrail(),v=view();h.record(v);v.x=55;assert.equal(h.back(view(200)).x,0);});
test('near-identical view samples do not flood the route',()=>{const h=new ViewTrail();h.record(view());h.record(view(.01));assert.equal(h.size,1);});
test('retracing skips the current view and returns the previous meaningful view',()=>{const h=new ViewTrail();h.record(view());h.record(view(100));assert.deepEqual(h.back(view(100)),view());});
test('view history refuses invalid state and has a hard storage bound',()=>{const h=new ViewTrail(3);assert.equal(h.record({x:NaN,y:0,z:3}),false);for(let i=0;i<10;i++)h.record(view(i*100));assert.equal(h.size,3);});
test('reading back and forward restore separate scroll positions',()=>{const h=new ReadingTrail();h.push('a');h.rememberScroll(240);h.push('b');assert.deepEqual(h.step(-1),{id:'a',scroll:240});assert.equal(h.previous,false);assert.equal(h.next,true);assert.equal(h.step(1).id,'b');});
test('a new reading branch discards stale forward entries, not the earlier trail',()=>{const h=new ReadingTrail();h.push('a');h.push('b');h.push('c');h.step(-1);h.push('d');assert.deepEqual(h.items.map(x=>x.id),['a','b','d']);assert.equal(h.next,false);});
test('reopening the same reading item does not create duplicate history steps',()=>{const h=new ReadingTrail();h.push('a');h.push('a');assert.equal(h.items.length,1);});
test('reading history is bounded and resettable without retaining comment wording',()=>{const h=new ReadingTrail(3);for(let i=0;i<9;i++)h.push(String(i));assert.deepEqual(h.items.map(x=>x.id),['6','7','8']);h.clear();assert.equal(h.index,-1);assert.equal(h.previous,false);});
test('paused still scenes request no scheduled paint',()=>assert.equal(paintInterval({ambient:false}),Infinity));
test('interaction remains 60Hz even when the ambient energy saver is on',()=>assert.equal(paintInterval({moving:true,saving:true}),1000/60));
test('quiet sky and energy-saving sky use bounded frame cadences',()=>{assert.equal(paintInterval({ambient:true}),1000/24);assert.equal(paintInterval({ambient:true,saving:true}),1000/15);assert.equal(paintInterval({ambient:true,reading:true}),Infinity);});
test('atmosphere softens continuously without altering the words',()=>{let prior=1;for(let z=3000;z>=78;z-=3){const a=atmosphereExposure(z,3000);assert.ok(a<=prior&&a>=.35&&a<=.8);prior=a;}});
test('search snippets reveal a match near the end instead of an unrelated beginning',()=>{const text='quiet '.repeat(100)+'the silver teacup';const s=snippetAround(text,'silver',90);assert.ok(s.includes('silver teacup'));assert.ok(s.startsWith('…'));});
test('search windows find accents without rewriting source spelling',()=>{const text='x '.repeat(150)+'The cafe\u0301 keeps a little light.';const s=snippetAround(text,'cafe',80);assert.ok(s.includes('cafe\u0301'));assert.ok(!s.includes('café'));});
test('search cropping does not cut through a joined emoji',()=>{const family='👩🏽‍🚀';const s=snippetAround(family.repeat(300),'',20);assert.equal(s,family.repeat(20)+'…');});
test('short search snippets preserve every original space and line break',()=>{const text='  Hello\n\nतुम्हारी हँसी  ';assert.equal(snippetAround(text,'hello'),text);});
test('depth-locked dragging retains the grabbed world plane',()=>{const rig=new CameraRig(1000,800);rig.current={x:0,y:0,z:450};rig.target={...rig.current};const n={x:20,y:30,z:-130};const a=project(n,rig.current,1000,800);rig.pan(85,-42,n.z);rig.tick(0,true);const b=project(n,rig.current,1000,800);assert.ok(Math.abs(b.x-a.x-85)<1e-8);assert.ok(Math.abs(b.y-a.y+42)<1e-8);});
test('callouts avoid reserved controls as well as the selected text',()=>{const t={id:1,x:600,y:380,w:240,h:100},q={x:600,y:530,w:480,h:130};const p=calloutPosition(t,[t],{width:1200,height:850,reserved:[q]});const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.y-b.y)<(a.h+b.h)/2;assert.equal(overlaps(p,t),false);assert.equal(overlaps(p,q),false);});
test('callout placement is stable when the previously chosen space remains good',()=>{const t={id:1,x:600,y:380,w:240,h:100},opts={width:1200,height:850};const p=calloutPosition(t,[t],opts);assert.deepEqual(calloutPosition(t,[t],{...opts,previous:p}),p);});
test('callout dimensions stay inside narrow phone widths',()=>{const t={id:1,x:140,y:250,w:200,h:90};const p=calloutPosition(t,[t],{width:280,height:600,labelWidth:280});assert.ok(p.x-p.w/2>=22&&p.x+p.w/2<=258);});
// The continuous v5 score has no navigation voices to hush.
// Consent races and reading mix are exercised against the new engine in sound.test.mjs.
