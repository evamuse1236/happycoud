import test from 'node:test';
import assert from 'node:assert/strict';
import { hash,random,project,unproject,dollyAt,CameraRig,rectanglesOverlap,safeURL } from '../src/math.js';
import { normalizeData,conversationFor,moodMask } from '../src/data.js';
import { wrapText,graphemes } from '../src/layout.js';
import { sampleData } from '../src/demo.js';
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('deterministic seeds',()=>{assert.equal(hash('a'),hash('a'));const a=random(100),b=random(100);for(let i=0;i<50;i++)assert.equal(a(),b());});
test('perspective projection and unprojection are inverses at every depth',()=>{
 const cam={x:512,y:-21,z:900};
 for(const p of [{x:23,y:-4,z:20},{x:-30,y:58,z:-250},{x:100,y:-88,z:300}]){
  const screen=project(p,cam,1440,900),back=unproject(screen.x,screen.y,p.z,cam,1440,900);near(p.x,back.x);near(p.y,back.y);
 }
});
test('real dolly magnifies nearer objects more',()=>{const cam={x:0,y:0,z:300};assert.ok(project({x:1,y:0,z:25},cam,1440,900).scale>project({x:1,y:0,z:-25},cam,1440,900).scale);});
test('objects behind the camera are not pickable',()=>assert.equal(project({x:0,y:0,z:301},{x:0,y:0,z:300},1440,900),null));
test('pointer-anchored zoom conserves the world point under the cursor',()=>{
 let cam={x:105,y:-22,z:1400};const px=1033,py=353,plane=12;
 const anchor=unproject(px,py,plane,cam,1440,900);
 for(let i=0;i<10;i++)cam=dollyAt(cam,cam.z*.85,px,py,1440,900,plane);
 const after=project(anchor,cam,1440,900);near(after.x,px);near(after.y,py);
});
test('camera interpolation never changes world geometry',()=>{
 const n=Object.freeze({x:20,y:5,z:-4});const original=JSON.stringify(n);const rig=new CameraRig(1440,900);
 rig.zoom(.2,750,410);for(let i=0;i<250;i++){rig.tick(1/60);project(n,rig.current,1440,900);}assert.equal(JSON.stringify(n),original);
});
test('camera zoom is bounded and finite even for extreme input',()=>{const rig=new CameraRig(1440,900);rig.zoom(.000001);assert.equal(rig.target.z,78);rig.zoom(1e20);assert.ok(rig.target.z<=rig.homeZ*1.18);assert.ok(Number.isFinite(rig.target.x));});
test('camera resize preserves an exploration position',()=>{const rig=new CameraRig(1440,900);rig.zoom(.25,300,250);const target={...rig.target};rig.resize(390,844);assert.deepEqual(rig.target,target);});
test('the home view refits when the viewport changes',()=>{const rig=new CameraRig(1440,900);const before=rig.homeZ;rig.resize(390,844);assert.ok(rig.homeZ>before);assert.equal(rig.target.z,rig.homeZ);});
test('reading focus accounts for the complete rectangle',()=>{const rig=new CameraRig(400,800);const n={x:33,y:-14,z:4,font:6,w:200,h:300};rig.focus(n);rig.tick(0,true);const p=project(n,rig.current,400,800);assert.ok(n.w*p.scale<=400*.68);assert.ok(n.h*p.scale<=800*.54);});
test('rectangle collision includes clearance',()=>{assert.equal(rectanglesOverlap({x:0,y:0,w:10,h:10},{x:12,y:0,w:10,h:10}),false);assert.equal(rectanglesOverlap({x:0,y:0,w:10,h:10},{x:12,y:0,w:10,h:10},3),true);});
test('normalization retains original text and Unicode exactly',()=>{const text='  Hello\n👩🏽‍🚀 e\u0301\nतुम्हारी हँसी\n';const c=normalizeData([{id:'01',author:'A',text}]).comments[0];assert.equal(c.text,text);assert.equal(c.author,'A');assert.equal(c.id,'01');});
test('no invented authors, dates, source links or tags',()=>{const c=normalizeData([{text:'One original comment.'}]).comments[0];assert.equal(c.author,'');assert.equal(c.postDate,undefined);assert.equal(c.commentUrl,null);assert.deepEqual(c.moods,[]);});
test('only duplicate IDs are removed; repeated wording from different people survives',()=>{const c=normalizeData([{id:'1',text:'Hello',author:'A'},{id:'2',text:'Hello',author:'B'},{id:'1',text:'Hello',author:'A'}]).comments;assert.equal(c.length,2);});
test('received count excludes explicitly flagged owner replies',()=>{assert.equal(normalizeData([{id:'1',text:'A'},{id:'2',text:'B',isOwner:true}]).comments.length,1);});
test('dangerous URL protocols do not survive validation',()=>{for(const url of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','/relative'])assert.equal(safeURL(url),null);assert.equal(safeURL('https://example.com/a'),'https://example.com/a');});
test('malicious text remains literal data, not sanitized into different words',()=>{const text='<img src=x onerror=alert(1)>';assert.equal(normalizeData([{text}]).comments[0].text,text);});
test('orphan replies are never assigned to another conversation',()=>{assert.deepEqual(conversationFor({id:'r',isReply:true,parentId:null,conversation:[{id:'other',text:'unrelated'}]}),[]);});
test('only explicit root or sibling reply relationships are shown',()=>{const comment={id:'a',parentId:null,isReply:false,conversation:[{id:'a',text:'self'},{id:'b',parentId:'a',text:'reply'},{id:'x',parentId:'z',text:'unrelated'}]};assert.deepEqual(conversationFor(comment).map(r=>r.id),['b']);});
test('conversation duplicates are suppressed',()=>{const r={id:'b',parentId:'a',text:'reply'};assert.equal(conversationFor({id:'a',conversation:[r,r]}).length,1);});
test('unknown moods remain unclassified, not guessed',()=>{assert.equal(moodMask([]),0);assert.equal(moodMask(['love','poetry']),5);assert.deepEqual(normalizeData([{text:'Love?',moods:['unknown']}]).comments[0].moods,[]);});
test('invalid files fail clearly',()=>{assert.throws(()=>normalizeData({posts:[]}),/comments array/);assert.throws(()=>normalizeData(null),/comments array/);});
test('sample archive is explicit, distinct and 360 comments long',()=>{const d=sampleData();assert.equal(d.sample,true);assert.equal(d.comments.length,360);assert.equal(new Set(d.comments.map(c=>c.id)).size,360);assert.equal(new Set(d.comments.map(c=>c.text)).size,360);assert.ok(d.comments.every(c=>!c.commentUrl));});
test('extended grapheme clusters stay intact',()=>{assert.equal(graphemes('👩🏽‍🚀').length,1);assert.equal(graphemes('e\u0301').length,1);});
test('long tokens wrap without invented spaces or chopped characters',()=>{const text='abcdefghijklmnopqrstuvwxy';const lines=wrapText(text,s=>s.length,5);assert.equal(lines.join(''),text);assert.ok(lines.every(s=>s.length<=5));});
test('paragraph boundaries and empty lines are retained',()=>{assert.deepEqual(wrapText('First\n\nLast',s=>s.length,20),['First','','Last']);});
test('grapheme wrapping never splits a joined emoji',()=>{const lines=wrapText('👩🏽‍🚀👩🏽‍🚀👩🏽‍🚀',s=>graphemes(s).length,1);assert.deepEqual(lines,['👩🏽‍🚀','👩🏽‍🚀','👩🏽‍🚀']);});
