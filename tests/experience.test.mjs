import test from 'node:test';
import assert from 'node:assert/strict';
import {Experience,revealAt,moodAt,inkLight,firstMoment,validView,calloutPosition,TIMING} from '../src/experience.js';
import {audioMix,noteFor,SCALE,ObservatorySound} from '../src/sound.js';
const node=(id,x=0,mask=1)=>Object.freeze({index:Number(id)||0,comment:Object.freeze({id:String(id),author:'a',text:'A whole comment.'}),x,y:0,z:-20,w:100,h:25,font:10,lines:['A whole comment.'],mask});
test('arrival changes only ink, never requires another geometry or a camera',()=>{
 const n=node(1,500);const before=JSON.stringify(n);
 for(let i=0;i<=100;i++)inkLight(n,{reveal:i/100});assert.equal(JSON.stringify(n),before);
});
test('arrival is bounded and ends fully lit at every position',()=>{
 for(const x of [-2500,-1400,-900,0,900,1400,2500]){assert.equal(revealAt(1,x),1);assert.equal(revealAt(0,x),.045);}
});
test('each complete comment illuminates monotonically',()=>{
 for(const x of [-1100,-400,0,500,1100]){let last=0;for(let i=0;i<=200;i++){const a=revealAt(i/200,x);assert.ok(a>=last);last=a;}}
});
test('the opening travels through the fixed field rather than teleporting text',()=>assert.ok(revealAt(.4,-1000)>revealAt(.4,1000)));
test('the arrival can be skipped without a delayed timer undoing it',()=>{const e=new Experience();e.tick(.05);e.skip();for(let i=0;i<100;i++)e.tick(.05);assert.equal(e.reveal,1);assert.equal(e.arriving,false);});
test('reduced motion completes both the arrival and mood transitions immediately',()=>{const e=new Experience();e.setMood(2);e.tick(.016,{immediate:true});assert.equal(e.reveal,1);assert.equal(e.moodBlend,1);});
test('every completed filter wave has exact, predictable visibility',()=>{
 assert.equal(inkLight(node(1),{mood:1}),1);assert.ok(Math.abs(inkLight(node(1),{mood:2})-.14)<1e-12);
 assert.equal(inkLight(node(1),{mood:0,author:'someone-else'}),.14);
});
test('mood wave reaches every comment rather than leaving the edge dark',()=>{for(const x of [-1500,0,1500]){assert.equal(moodAt(1,x),1);assert.equal(moodAt(0,x),0);}});
test('hover waits before adding a label',()=>{const e=new Experience();e.setHover(2);e.tick(.1);assert.equal(e.hoverReady,false);e.tick(.1);assert.equal(e.hoverReady,true);});
test('brief pointer passes cannot produce a note',()=>{const e=new Experience();for(let i=0;i<20;i++){e.setHover(i);e.tick(.09);assert.equal(e.takeHoverNote(),false);}});
test('lingering over a word creates only one hover event',()=>{const e=new Experience();e.setHover(2);for(let i=0;i<6;i++)e.tick(.1);assert.equal(e.takeHoverNote(),true);assert.equal(e.takeHoverNote(),false);e.tick(.1);assert.equal(e.takeHoverNote(),false);});
test('leaving resets the hover dwell',()=>{const e=new Experience();e.setHover(2);for(let i=0;i<5;i++)e.tick(.1);e.setHover(-1);e.setHover(2);assert.equal(e.hoverReady,false);assert.equal(e.takeHoverNote(),false);});
test('the first approach chooses a real object with its original text',()=>{const ns=[node(1,-900),node(2,20),node(3,800)];const n=firstMoment(ns);assert.ok(ns.includes(n));assert.equal(n.comment.text,'A whole comment.');});
test('the same collection selects the same first word regardless of array order',()=>{const ns=[node(1,-900),node(2,20),node(3,800)];assert.equal(firstMoment(ns),firstMoment([...ns].reverse()));});
test('an empty collection never creates a fake first moment',()=>assert.equal(firstMoment([]),null));
test('restoring a view requires exactly the same geometry checksum',()=>{const r={fingerprint:'a',camera:{x:0,y:0,z:300}};assert.deepEqual(validView(r,'a',3000),r.camera);assert.equal(validView(r,'b',3000),null);});
test('view memory refuses invalid and out-of-world coordinates',()=>{
 for(const camera of [{x:NaN,y:0,z:100},{x:0,y:0,z:0},{x:Infinity,y:0,z:100},{x:20000,y:0,z:100},{x:0,y:900,z:100},{x:0,y:0,z:300000}])assert.equal(validView({fingerprint:'a',camera},'a',3000),null);
});
test('a home view does not misleadingly offer a close-up resume button',()=>assert.equal(validView({fingerprint:'a',camera:{x:0,y:0,z:3000}},'a',3000),null));
test('callouts use empty space instead of covering the selected comment',()=>{
 const target={id:1,x:500,y:380,w:300,h:100},under={id:2,x:500,y:520,w:500,h:120};
 const p=calloutPosition(target,[target,under],{width:1200,height:850});
 const overlap=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.y-b.y)<(a.h+b.h)/2;
 assert.equal(overlap(p,target),false);assert.equal(overlap(p,under),false);
});
test('mobile callouts stay inside safe horizontal bounds',()=>{
 const t={id:1,x:195,y:422,w:210,h:100};const p=calloutPosition(t,[t],{width:390,height:844,labelWidth:240,labelHeight:76});assert.ok(p.x-p.w/2>=20&&p.x+p.w/2<=370);
});
test('new sound system is lazy and silent at construction',()=>{const s=new ObservatorySound();assert.equal(s.context,null);assert.equal(s.enabled,false);assert.equal(s.pluck('a'),false);});
test('every event pitch belongs to the fixed palette',()=>{for(let i=0;i<1000;i++)assert.ok(SCALE.includes(noteFor('word-'+i)));});
test('Unicode IDs map to stable pitches',()=>assert.equal(noteFor('तुम👩🏽‍🚀'),noteFor('तुम👩🏽‍🚀')));
test('disabled sound always has zero output even at full volume',()=>assert.equal(audioMix({volume:1,enabled:false}).master,0));
test('hidden documents always have zero output',()=>assert.equal(audioMix({volume:1,enabled:true,visible:false}).master,0));
test('volume is clamped and independent of motion',()=>{assert.equal(audioMix({volume:5,enabled:true}).master,.48);assert.equal(audioMix({volume:-1,enabled:true}).master,0);assert.equal(audioMix({volume:.4,enabled:true,motion:1}).master,audioMix({volume:.4,enabled:true,motion:0}).master);});
test('reading ducks the ambient bed and removes motion noise',()=>{
 const a=audioMix({zoom:7,reading:false,enabled:true,motion:1}),b=audioMix({zoom:7,reading:true,enabled:true,motion:1});assert.ok(Math.abs(b.bed-a.bed*.18)<1e-12);assert.equal(b.air,0);
});
test('notes-only mode removes all sustained ambience, not just most of it',()=>{const m=audioMix({mode:'notes',enabled:true,motion:1});assert.equal(m.bed,0);assert.equal(m.air,0);});
test('approaching changes sound texture continuously without exceeding its range',()=>{
 let prior=0;for(let z=1;z<100;z+=.25){const m=audioMix({zoom:z});assert.ok(m.cutoff>=prior&&m.cutoff<=1730);prior=m.cutoff;}
});
test('motion air has a strict gain ceiling',()=>assert.ok(audioMix({motion:1000}).air<=.0671));
test('disabling uncreated audio remains safe and does not create a context',()=>{const s=new ObservatorySound();s.disable();clearTimeout(s.suspendTimer);assert.equal(s.context,null);assert.equal(s.enabled,false);});

// Annotations are a separate canvas: settled UI must not repaint it forever.
import { Annotations } from '../src/annotations.js';
function annotationFixture(run){
  const globals=['innerWidth','innerHeight','devicePixelRatio'],old=globals.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
  globals.forEach((k,i)=>Object.defineProperty(globalThis,k,{value:[1000,700,1][i],writable:true,configurable:true}));
  let clears=0;const c=new Proxy({clearRect(){clears++;}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  const canvas={getContext:()=>c};const a=new Annotations(canvas);const nodes=[{x:0,y:0,z:0,w:50,h:18,font:10,comment:{id:'real-comment'}}];
  try{run(a,nodes,()=>clears);}finally{globals.forEach((k,i)=>old[i]?Object.defineProperty(globalThis,k,old[i]):delete globalThis[k]);}
}
test('settled annotation canvas is not repainted on every animation frame',()=>annotationFixture((a,nodes,clears)=>{
  const camera={x:0,y:0,z:500};a.render(camera,nodes);a.render(camera,nodes,{time:10});assert.equal(clears(),1);
}));
test('a camera or kept-marker change invalidates only the annotation cache',()=>annotationFixture((a,nodes,clears)=>{
  const camera={x:0,y:0,z:500};a.render(camera,nodes);a.render({...camera,x:1},nodes);a.render({...camera,x:1},nodes,{kept:new Set(['real-comment'])});assert.equal(clears(),3);
}));
test('a transient echo redraws then clears itself without leaving a stale ring',()=>annotationFixture((a,nodes,clears)=>{
  const camera={x:0,y:0,z:500};a.render(camera,nodes);a.echo(nodes[0],0);a.render(camera,nodes,{time:.2});a.render(camera,nodes,{time:2});a.render(camera,nodes,{time:3});assert.equal(clears(),3);assert.equal(a.echoes.length,0);
}));
test('reduced-motion annotation echoes require no animation repaint',()=>annotationFixture((a,nodes,clears)=>{
  const camera={x:0,y:0,z:500};a.render(camera,nodes,{reduced:true});a.echo(nodes[0],0);a.render(camera,nodes,{time:.2,reduced:true});a.render(camera,nodes,{time:2,reduced:true});assert.equal(clears(),1);
}));
