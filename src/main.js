import { CameraRig, project, unproject, clamp } from './math.js';
import { normalizeData, loadData, fetchData, conversationFor, MOODS } from './data.js';
import { createLayout } from './layout.js';
import { ConstellationRenderer } from './renderer.js';
import { CanvasConstellationRenderer } from './canvas-renderer.js';
import { NavigationControls } from './controls.js';
import { ObservatorySound, MOOD_INSTRUMENTS } from './sound.js';
import { CondensationField } from './condensation.js';
import { DURATION, smoother, readDestination, hitTest, chooseMoment } from './cinema.js';
import { LocalMemory } from './journey.js';
import { relatedComments } from './reader-context.js';
import { installStarCursor } from './star-cursor.js';
import { sampleData } from './demo.js';
import { SongExperience } from './starlight/song.js';
import { arrivalAction } from './starlight/core.js';
import { MemoryScene, memoryDestination } from './starlight/memory-scene.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const body=document.body,root=document.documentElement;
const memoryScene=new MemoryScene();
let storage;try{storage=localStorage;}catch{}
const memory=new LocalMemory(storage),rig=new CameraRig(innerWidth,innerHeight),audio=new ObservatorySound();
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let manualReduced=memory.read('observatory-reduced-motion',false)===true;
let paused=memory.read('cinema-paused',false)===true;
let readingScale=clamp(Number(memory.read('observatory-reading-scale',1))||1,.9,1.5);
let canvas=$('#universe'),renderer=null,controls=null;
const dust=new CondensationField($('#condensation'));
const state={phase:'loading',birth:0,birthSpeed:1,mood:0,moodFrom:0,moodBlend:1,readingMix:0,transition:null,ready:false};
let data=normalizeData([]),layout={nodes:[],fingerprint:'empty'},collectionEpoch=0,previousData=null,sourceURL=null;
let selected=null,pending=null,readingOrigin=null,history=[],historyIndex=-1,libraryOrigin=null;
let frameTime=0,simulationTime=0,lastPaint=0,lastMap=0,lastAudio=0,lastCamera={...rig.current},motion=0,frameCount=0,frameCost=0;
let hover=null,hoverAt=0,hoverPoint=null,noticeTimer=0,whisperTimer=0,entered=false,operation=0,building=false;
let graphicsFallbackReason=null;
let shelf='all',resultLimit=80,searchTimer=0,wasZoomed=false,noticeText='';
const reduced=()=>manualReduced||motionQuery.matches;
let songReturn=null;
const song=new SongExperience({
  getScene:()=>({layout,rig,renderer,state}),
  score:audio,
  reduced:()=>reduced()||paused,
  projectComment:id=>{const node=layout.nodes.find(n=>n.comment.id===id);return node?project(node,rig.current,innerWidth,innerHeight):null;},
  onOpen:()=>{songReturn={selected,readingOrigin,phase:state.phase};audio.setPerformance(1);syncSound();hideWhisper();orbit(false);clearHover();rig.interrupt();operation++;pending=null;selected=null;readingOrigin=null;renderer.selected=-1;phase('sky');},
  onClose:()=>{audio.setPerformance(0);syncSound();if(songReturn?.selected&&songReturn.phase==='focused'){selected=songReturn.selected;readingOrigin=songReturn.readingOrigin;renderer.selected=selected.index;phase('focused');memoryScene.focus(selected,rig.current);}songReturn=null;},
  announce,
});
installStarCursor({reduced});
const modal=()=>!!document.querySelector('dialog[open]');
const eligible=c=>!state.mood||c.moods.includes(MOODS.find(m=>m.bit===state.mood)?.id);
function announce(text){$('#live').textContent=text;}
function notify(text){
  noticeText=text;clearTimeout(noticeTimer);$$('.modal-notice').forEach(el=>el.remove());
  const top=$$('dialog[open]').at(-1);$('#notice').textContent=text;$('#notice').hidden=!!top;
  if(top){const note=document.createElement('p');note.className='modal-notice';note.setAttribute('role','status');note.textContent=text;top.append(note);}
  noticeTimer=setTimeout(()=>{$('#notice').hidden=true;$$('.modal-notice').forEach(el=>el.remove());},4800);announce(text);
}
function phase(name){state.phase=name;body.dataset.scene=name;if(name!=='focused')memoryScene.clearFocus();}
function syncSound(){
  const on=audio.wanted;body.dataset.sound=on?'on':'off';
  for(const el of [$('#sound'),$('#reader-sound')])if(el){el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',on?'Mute the score':'Turn on the score');}
  $('#comfort-sound').textContent=on?'Let it be silent':'Start the score';
}
async function toggleSound(){
  try{if(audio.wanted)audio.disable();else await audio.enable();}catch(e){notify(e.message);}syncSound();
}
function syncComfort(){
  body.dataset.motion=reduced()?'reduced':'full';body.dataset.paused=String(paused);
  $('#reduced').checked=reduced();$('#reduced').disabled=motionQuery.matches;
  $('#pause').checked=paused;$('#read-size').value=readingScale*100;$('#read-size-value').value=Math.round(readingScale*100)+'%';
}
audio.setVolume(memory.read('observatory-volume',.42));audio.setMode(memory.read('observatory-sound-mode','full'));
$('#volume').value=audio.volume*100;$('#volume-value').value=Math.round(audio.volume*100)+'%';$('#score-mode').value=audio.mode;
syncSound();syncComfort();

function makeRenderer(element){
  try{
    if(new URLSearchParams(location.search).get('renderer')==='canvas')throw new Error('Compatibility requested');
    const instance=new ConstellationRenderer(element,message=>{if(message)notify(message);});instance.kind='webgl2';return {instance,element};
  }catch(error){
    graphicsFallbackReason=error.message;
    // A canvas cannot acquire 2D after a partially initialized WebGL context.
    const fresh=element.cloneNode(false);if(element.isConnected)element.replaceWith(fresh);
    return {instance:new CanvasConstellationRenderer(fresh),element:fresh};
  }
}
function bindControls(){
  controls?.dispose();
  controls=new NavigationControls(canvas,rig,{
    onSelect:point=>{
      const n=hitTest(layout.nodes,rig.current,innerWidth,innerHeight,point,eligible);
      if(n)approach(n);
      else if(!wasZoomed&&state.phase!=='approach')approach(chooseMoment(layout.nodes.filter(n=>eligible(n.comment)),memory.visited));
    },
    onHover:updateHover,
    onInteract:()=>{hideWhisper();orbit(false);if(state.phase==='birth')finishBirth(false);wasZoomed=true;},
    onCancelFocus:()=>{
      if(pending||selected||state.phase==='returning'){operation++;pending=null;selected=null;readingOrigin=null;renderer.selected=-1;phase('sky');}
    },
    onNavigate:()=>{},getPlane:point=>hitTest(layout.nodes,rig.current,innerWidth,innerHeight,point,eligible)?.z??0,
    canCoast:()=>!reduced(),isBlocked:()=>!state.ready||!entered||building||modal()||song.active,
  });
}
function clearHover(){hover=null;hoverPoint=null;renderer?.setHover(-1);$('#hover-name').hidden=true;$('#focus-light').classList.remove('active');canvas.classList.remove('pointing');}
function updateHover(point){
  if(!point||modal()||pending||!entered){clearHover();return;}
  const n=hitTest(layout.nodes,rig.current,innerWidth,innerHeight,point,eligible);
  if(n!==hover){hover=n;hoverAt=performance.now();renderer?.setHover(-1);$('#hover-name').hidden=true;}
  hoverPoint=point;canvas.classList.toggle('pointing',!!n);
  if(!n){$('#focus-light').classList.remove('active');return;}
  $('#focus-light').style.setProperty('--light-x',point.x+'px');$('#focus-light').style.setProperty('--light-y',point.y+'px');$('#focus-light').classList.add('active');
}
function paintHover(now){
  if(!hover||!hoverPoint||modal()||now-hoverAt<340)return;
  renderer.setHover(hover.index);const p=project(hover,rig.current,innerWidth,innerHeight);if(!p)return;
  if(hover.font*p.scale>=8&&now-hoverAt>650){
    const label=$('#hover-name');label.textContent=hover.comment.author?'@'+hover.comment.author.replace(/^@/,''):'';
    label.style.left=clamp(p.x,85,innerWidth-85)+'px';label.style.top=clamp(p.y+hover.h*p.scale/2+9,70,innerHeight-115)+'px';label.hidden=!label.textContent;
  }
}
function orbit(open){$('#show-everything').hidden=!state.mood||open;$('#orbit').hidden=!open;$('#beacon').setAttribute('aria-expanded',String(open));if(open){hideWhisper();$('#home-map').hidden=true;}else paintMap();}
function whisper(text,delay=0){clearTimeout(whisperTimer);whisperTimer=setTimeout(()=>{
  if(modal()||wasZoomed||!entered)return;
  const w=$('#whisper');w.textContent=text;w.hidden=false;requestAnimationFrame(()=>w.classList.add('visible'));
  whisperTimer=setTimeout(hideWhisper,6500);
},delay);}
function hideWhisper(){clearTimeout(whisperTimer);$('#whisper').classList.remove('visible');}
function finishBirth(immediate=false){
  if(state.birth>=1)return;
  if(immediate||reduced()||paused){state.birth=1;phase('sky');$('#skip-birth').hidden=true;dust.clear();}
  else state.birthSpeed=18;
}
async function enter(withSound){
  if(entered||!state.ready)return;
  entered=true;$('#gate').classList.add('leaving');$('#gate').inert=true;
  setTimeout(()=>{$('#gate').hidden=true;$('#gate').classList.remove('leaving');},850);
  if(withSound){try{await audio.enable();}catch(e){notify(e.message);}}else audio.disable();syncSound();
  $('#navigation').hidden=false;$('#home-map').hidden=false;
  phase('birth');state.birth=0;state.birthSpeed=1;$('#skip-birth').hidden=reduced()||paused;
  if(reduced()||paused)finishBirth(true);
  canvas.focus({preventScroll:true});announce('The sky is yours. Scroll or pinch to explore, or press Enter to follow a light.');
}
function home(){
  if(!state.ready||!entered)return;
  hideWhisper();orbit(false);clearHover();operation++;pending=null;selected=null;
  if($('#reader').open){closeReader({home:true});return;}
  finishBirth(true);readingOrigin=null;rig.flyTo({x:0,y:0,z:rig.homeZ},{duration:1.6,arc:false});phase('returning');
  if(reduced())rig.tick(0,true);
}

async function setCollection(input,{url=null,keepPrevious=false}={}){
  if(song.active)song.close({immediate:true,restoreFocus:false});
  const epoch=++collectionEpoch,normalized=normalizeData(input);
  if(!normalized.comments.length)throw new Error('This file has no received comments to place. The current sky has not been changed.');
  building=true;announce('Preparing the original words.');
  let candidate=null;
  try{
    const nextLayout=await createLayout(normalized.comments);
    if(epoch!==collectionEpoch)return;
    let element=document.createElement('canvas');element.id='universe';element.tabIndex=0;element.setAttribute('aria-label',canvas.getAttribute('aria-label'));
    const made=makeRenderer(element);candidate=made.instance;element=made.element;
    await candidate.setLayout(nextLayout);
    if(epoch!==collectionEpoch){candidate.dispose();return;}
    const old=renderer;
    if(keepPrevious&&data.comments.length)previousData={data,url:sourceURL};
    controls?.dispose();canvas.replaceWith(element);canvas=element;renderer=candidate;candidate=null;
    old?.dispose();data=normalized;layout=nextLayout;sourceURL=url;memory.useCollection(data);song.setCollection(data.sample?[]:data.comments);
    audio.setMood('all');body.dataset.skyMood='all';state.ready=true;state.mood=0;$('#show-everything').hidden=true;state.moodFrom=0;state.moodBlend=1;selected=null;pending=null;history=[];historyIndex=-1;readingOrigin=null;libraryOrigin=null;operation++;
    state.readingMix=0;state.transition=null;root.style.setProperty('--reading-mix',0);
    for(const d of $$('dialog[open]'))d.close();
    dust.setLayout(layout);rig.home();rig.tick(0,true);bindControls();
    $('#sample-badge').hidden=!data.sample;$('#reader-sample').hidden=!data.sample;
    $('#undo-import').hidden=!previousData;
    $('#loading').hidden=true;$('#empty').hidden=true;
    $('#data-note').textContent=`${data.comments.length.toLocaleString()} ${data.sample?'illustrative sample':'original received'} comments. Your original wording, line breaks, emoji, attribution, and available conversation context are preserved. Imports stay on this device.`;
    $$('[data-mood]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mood==='all')));
    if(entered){state.birth=1;phase('sky');$('#gate').hidden=true;$('#navigation').hidden=false;$('#home-map').hidden=false;}
    else {state.birth=0;phase('gate');$('#gate').hidden=false;$('#gate').inert=false;}
    paintMap();announce(`${data.comments.length} ${data.sample?'sample':'original'} comments are ready.`);
    document.dispatchEvent(new CustomEvent('sky:ready',{detail:{count:data.comments.length,sample:data.sample}}));
  }catch(error){candidate?.dispose();throw error;}
  finally{if(epoch===collectionEpoch)building=false;}
}
async function importFile(file){
  if(!file)return;
  if(file.size>12*1024*1024){notify('Please use a JSON file under 12 MB. Your current sky is unchanged.');return;}
  const priorNotice=noticeText;
  try{notify('Making room for these words…');await setCollection(JSON.parse(await file.text()),{keepPrevious:true});notify('Her words are here. The previous sky is available in settings.');}
  catch(error){notify(error instanceof SyntaxError?'This file is not valid JSON. Your current sky is unchanged.':error.message);}
  finally{$('#file-input').value='';}
}

function approach(node,{fromLibrary=false,retainOrigin=false,fromHistory=false,openOnArrival=false}={}){
  if(!node||building||!entered)return;
  if($('#reader').open){closeReader({next:node,fromHistory});return;}
  if(selected?.comment.id===node.comment.id && state.phase==='focused'){showReader(node,{fromHistory});return;}
  if(pending?.node.comment.id===node.comment.id&&state.phase==='approach'){pending.openOnArrival=true;return;}
  if(!readingOrigin)readingOrigin={...rig.current};
  const token=++operation;pending={node,token,fromHistory,openOnArrival:openOnArrival||fromLibrary};selected=node;
  if(!fromLibrary)libraryOrigin=null;
  for(const d of $$('dialog[open]'))d.close();
  orbit(false);hideWhisper();clearHover();finishBirth(true);wasZoomed=true;
  renderer.selected=node.index;
  const destination=memoryDestination(node,innerWidth,innerHeight,rig.homeZ,readingScale);
  // One direct, continuous dolly: no pull-back arch, second zoom, or word burst.
  const distance=Math.abs(Math.log(destination.z/rig.current.z));
  rig.flyTo(destination,{duration:clamp(.85+distance*.31,.9,2.15),arc:false});phase('approach');
  if(reduced()){rig.tick(0,true);finishApproach();}
}
function finishApproach(){
  const waiting=pending;pending=null;
  if(!waiting||waiting.token!==operation)return;
  if(arrivalAction(waiting)==='read'){showReader(waiting.node,{fromHistory:waiting.fromHistory});return;}
  phase('focused');memoryScene.focus(waiting.node,rig.current);
  announce('You are closer. Touch this comment again, or press Enter, to hear the voices around it.');
}
function setReadingMix(value){state.readingMix=clamp(value,0,1);root.style.setProperty('--reading-mix',state.readingMix.toFixed(4));}
function animateMix(to,done,duration=DURATION.dissolve){
  if(reduced()){setReadingMix(to);done?.();return;}
  state.transition={from:state.readingMix,to,elapsed:0,duration,done};
}
function syncReaderPositions(){
  if(!$('#reader').open||!selected)return;
  memoryScene.place(selected,rig.current,readingScale);
}
function renderContext(comment){
  const thread=conversationFor(comment),nearby=relatedComments(comment,data.comments);
  $('#inline-conversation').hidden=!thread.length;
  $('#nearby-comments').hidden=!nearby.length;
  $('#reader-context').hidden=!thread.length&&!nearby.length;
  $('#reader').classList.toggle('has-context',!!(thread.length||nearby.length));
  const entry=(c,interactive=false)=>{
    const item=document.createElement(interactive?'button':'article');item.className='context-comment';
    const author=document.createElement('small');author.textContent=(c.author?'@'+c.author.replace(/^@/,''):'Author not recorded')+(c.isOwner?' · Account owner':'');
    const words=document.createElement('p');words.dir='auto';words.textContent=c.text;item.append(author,words);
    if(interactive){item.type='button';item.dataset.commentId=c.id;item.addEventListener('click',()=>closeReader({next:layout.nodes.find(n=>n.comment.id===c.id)}));}
    return item;
  };
  $('#inline-thread').replaceChildren(...thread.map(c=>entry(c)));
  $('#nearby-list').replaceChildren(...nearby.map(c=>entry(c,true)));
  $('.reader-stage').scrollTop=0;$('#reader-context').scrollTop=0;
}
function showReader(node,{fromHistory=false}={}){
  if(!node)return;selected=node;pending=null;
  const c=node.comment;
  $('#reader-quote').textContent=c.text;$('#reader-quote').scrollTop=0;
  $('#reader-author').textContent=c.author?'@'+c.author.replace(/^@/,''):'A little moment';
  $('#reader-date').textContent=c.postDate||c.timeLabel||'';
  const source=c.commentUrl||c.postUrl;$('#reader-source').hidden=!source;
  if(source)$('#reader-source').href=source;else $('#reader-source').removeAttribute('href');
  renderContext(c);
  $('#thread-open').hidden=!conversationFor(c).length;
  $('#reader-results').hidden=!libraryOrigin;
  $('#reader-sample').hidden=!data.sample;
  $('#keep').setAttribute('aria-pressed',String(memory.kept.has(c.id)));$('#keep').setAttribute('aria-label',memory.kept.has(c.id)?'Release this kept moment':'Keep this moment');
  if(!fromHistory){history=history.slice(0,historyIndex+1);history.push(c.id);historyIndex=history.length-1;}
  $('#reader-previous').hidden=historyIndex<1;
  memory.visit(c.id);$('#reader').dataset.transition='enter';
  if(!$('#reader').open)$('#reader').showModal();
  syncReaderPositions();$('#reader-close').focus({preventScroll:true});
  phase('reading');audio.update({reading:true});audio.focus(c.id,0);
  animateMix(1,()=>{$('#reader').dataset.transition='open';},.78);
  announce(`A comment${c.author?' from '+c.author:''}.`);
}
function closeReader({next=null,home:goHome=false,results=false,fromHistory=false}={}){
  if(!$('#reader').open||$('#reader').dataset.transition==='leave')return;
  state.transition=null;$('#reader').dataset.transition='leave';operation++;pending=null;
  const origin=readingOrigin?{...readingOrigin}:{x:0,y:0,z:rig.homeZ};
  audio.update({reading:false});
  animateMix(0,()=>{
    $('#reader').close();renderer.selected=-1;phase('sky');
    if(results&&libraryOrigin){const saved=libraryOrigin;openSheet('library');$('#query').value=saved.query;shelf=saved.shelf;renderResults();$('#library').scrollTop=saved.scroll;selected=null;readingOrigin=null;return;}
    if(next){approach(next,{retainOrigin:true,fromLibrary:!!libraryOrigin,fromHistory,openOnArrival:true});return;}
    if(!goHome&&!results&&selected){renderer.selected=selected.index;phase('focused');memoryScene.focus(selected,rig.current);canvas.focus({preventScroll:true});return;}
    selected=null;libraryOrigin=null;readingOrigin=null;
    rig.flyTo(goHome?{x:0,y:0,z:rig.homeZ}:origin,{duration:DURATION.return,arc:false});phase('returning');
    if(reduced())rig.tick(0,true);
    canvas.focus({preventScroll:true});
  },next?.35:.48);
}
function nextMoment(){
  const node=chooseMoment(layout.nodes.filter(n=>eligible(n.comment)),memory.visited,selected?.comment.id);
  if(node)$('#reader').open?closeReader({next:node}):approach(node);
  else notify('There are no comments with this label. Try the whole sky.');
}
function openSheet(id){
  hideWhisper();orbit(false);clearHover();
  if(id==='kept'){shelf='kept';id='library';}
  if(id==='library'){if(!state.ready){$('#file-input').click();return;}renderResults();}
  const el=$('#'+id);if(!el||el.open)return;
  // Conversation is intentionally a nested reading context. Other sheets do not stack.
  if(id!=='conversation')for(const d of $$('dialog[open]'))if(d.id!=='reader')d.close();
  el.showModal();
  if(id==='library')$('#query').focus({preventScroll:true});
}
function closeSheet(el){el.close();if($('#reader').open)$('#reader-close').focus({preventScroll:true});else if(entered)$('#beacon').focus({preventScroll:true});}
function renderResults(){
  const query=$('#query').value.trim().toLocaleLowerCase();
  const found=data.comments.filter(c=>(shelf!=='kept'||memory.kept.has(c.id))&&eligible(c)&&(!query||(c.text+' '+c.author).toLocaleLowerCase().includes(query)));
  $('#shelf-all').setAttribute('aria-pressed',String(shelf==='all'));$('#shelf-kept').setAttribute('aria-pressed',String(shelf==='kept'));
  $('#library-title').textContent=shelf==='kept'?'Kept close.':'Find a voice.';
  $('#result-count').textContent=`${found.length.toLocaleString()} ${found.length===1?'voice':'voices'}`;
  const fragment=document.createDocumentFragment();
  for(const c of found.slice(0,resultLimit)){
    const b=document.createElement('button');b.className='result';b.dataset.commentId=c.id;
    const words=document.createElement('span');words.className='result-words';
    // Preview only; selecting always uses c.text in full. No source is shortened.
    const hit=query?c.text.toLocaleLowerCase().indexOf(query):-1;const start=hit>210?Math.max(0,hit-55):0;
    const slice=c.text.slice(start,start+240);words.textContent=(start?'… ':'')+slice+(start+240<c.text.length?' …':'');
    const author=document.createElement('span');author.className='result-author';author.textContent=c.author?'@'+c.author.replace(/^@/,''):'A little moment';
    if(memory.kept.has(c.id)){const mark=document.createElement('span');mark.textContent='✧';mark.className='result-kept';author.append(mark);}
    b.append(words,author);b.addEventListener('click',()=>{
      libraryOrigin={query:$('#query').value,shelf,scroll:$('#library').scrollTop};
      approach(layout.nodes.find(n=>n.comment.id===c.id),{fromLibrary:true});
    });fragment.append(b);
  }
  if(!found.length){const p=document.createElement('p');p.className='no-results';p.textContent=shelf==='kept'?'Keep a moment with the little star while reading. It will wait for you here.':'No words found. Try another word, a name, or a different feeling.';fragment.append(p);}
  $('#results').replaceChildren(fragment);$('#more-results').hidden=found.length<=resultLimit;
}
function paintMap(){
  const away=Math.abs(Math.log(rig.current.z/rig.homeZ))>.12||Math.hypot(rig.current.x,rig.current.y)>80;
  $('#home-map').hidden=!entered||!away||!$('#orbit').hidden||!!state.mood;
  const c=$('#map'),ctx=c.getContext('2d');ctx.clearRect(0,0,280,96);
  if(!layout.nodes.length)return;
  const map=n=>({x:140+n.x*.10,y:47-n.y*.10});
  for(const n of layout.nodes){const p=map(n),kept=memory.kept.has(n.comment.id);ctx.fillStyle=kept?'#e8cda5':memory.visited.has(n.comment.id)?'#c5d4e9':'#788899';ctx.globalAlpha=kept?.9:.5;ctx.fillRect(p.x,p.y,kept?2:1.2,kept?2:1.2);}
  const a=unproject(0,0,0,rig.current,innerWidth,innerHeight),b=unproject(innerWidth,innerHeight,0,rig.current,innerWidth,innerHeight);
  const tl=map(a),br=map(b);ctx.globalAlpha=.55;ctx.strokeStyle='#d8c39d';ctx.lineWidth=.65;ctx.strokeRect(clamp(tl.x,3,277),clamp(tl.y,3,93),Math.min(274,br.x-tl.x),Math.min(90,br.y-tl.y));ctx.globalAlpha=1;
}

// Controls are semantic buttons even when their visual forms belong to the sky.
$('#beacon').addEventListener('click',()=>orbit($('#orbit').hidden));
$$('[data-open]').forEach(el=>el.addEventListener('click',()=>openSheet(el.dataset.open)));
$$('[data-close]').forEach(el=>el.addEventListener('click',()=>closeSheet(el.closest('dialog'))));
for(const d of $$('.sheet')){d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet(d);}});d.addEventListener('cancel',e=>{e.preventDefault();closeSheet(d);});}
$('#sound').addEventListener('click',toggleSound);$('#reader-sound').addEventListener('click',toggleSound);$('#comfort-sound').addEventListener('click',toggleSound);
$('#enter-sound').addEventListener('click',()=>enter(true));$('#enter-silent').addEventListener('click',()=>enter(false));
$('#skip-birth').addEventListener('click',()=>finishBirth(false));
$('#home-map').addEventListener('click',home);
$('#reader-close').addEventListener('click',()=>closeReader());$('#reader-next').addEventListener('click',nextMoment);
$('#reader').addEventListener('cancel',e=>{e.preventDefault();closeReader();});
$('#reader').addEventListener('click',e=>{if(['reader','reader-stage','reader-veil'].some(id=>e.target.id===id||e.target.classList.contains(id)))closeReader();});
$('#reader-previous').addEventListener('click',()=>{if(historyIndex>0){historyIndex--;const node=layout.nodes.find(n=>n.comment.id===history[historyIndex]);if(node)closeReader({next:node,fromHistory:true});}});
$('#reader-results').addEventListener('click',()=>closeReader({results:true}));
$('#keep').addEventListener('click',()=>{if(!selected)return;const kept=memory.toggleKeep(selected.comment.id);$('#keep').setAttribute('aria-pressed',String(kept));$('#keep').setAttribute('aria-label',kept?'Release this kept moment':'Keep this moment');announce(kept?'Kept close.':'Released from your kept moments.');paintMap();});
$('#copy').addEventListener('click',async()=>{
  if(!selected)return;
  try{await navigator.clipboard.writeText(selected.comment.text);$('#copy').textContent='copied';setTimeout(()=>$('#copy').textContent='copy words',1800);announce('The original wording was copied.');}
  catch{const selection=getSelection(),range=document.createRange();range.selectNodeContents($('#reader-quote .memory-original')||$('#reader-quote'));selection.removeAllRanges();selection.addRange(range);announce('Text selected. Use your browser’s Copy command.');}
});
$('#thread-open').addEventListener('click',()=>{
  if(!selected)return;const fragment=document.createDocumentFragment();
  for(const c of conversationFor(selected.comment)){const item=document.createElement('article');item.className='thread-item';const name=document.createElement('strong');name.textContent=(c.author?'@'+c.author:'A reply')+(c.isOwner?' · Khushi':'');const p=document.createElement('p');p.textContent=c.text;item.append(name,p);if(c.commentUrl){const a=document.createElement('a');a.textContent='The original ↗';a.href=c.commentUrl;a.target='_blank';a.rel='noopener noreferrer';a.className='text-control';item.append(a);}fragment.append(item);}$('#thread').replaceChildren(fragment);openSheet('conversation');
});
$('#query').addEventListener('input',()=>{clearTimeout(searchTimer);resultLimit=80;searchTimer=setTimeout(renderResults,110);});
$('#shelf-all').addEventListener('click',()=>{shelf='all';resultLimit=80;renderResults();});$('#shelf-kept').addEventListener('click',()=>{shelf='kept';resultLimit=80;renderResults();});
$('#more-results').addEventListener('click',()=>{resultLimit+=80;renderResults();});
$$('[data-mood]').forEach(el=>el.addEventListener('click',()=>{
  const chosen=MOODS.find(m=>m.id===el.dataset.mood);state.moodFrom=state.mood;state.mood=chosen.bit;state.moodBlend=reduced()?1:0;
  $$('[data-mood]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mood===chosen.id)));audio.setMood(chosen.id);body.dataset.skyMood=chosen.id;if($('#feelings').open)closeSheet($('#feelings'));orbit(false);clearHover();$('#beacon').focus({preventScroll:true});
  if(!chosen.bit)home();
  announce(chosen.bit?`${chosen.label}. Matching words are brighter.`:'Every light is visible.');
  if(chosen.bit&&!layout.nodes.some(n=>n.mask&chosen.bit))notify('The archive has no comments with this label. Nothing has been moved or deleted.');
}));
$('#volume').addEventListener('input',e=>{audio.setVolume(Number(e.target.value)/100);$('#volume-value').value=e.target.value+'%';memory.write('observatory-volume',audio.volume);});
$('#score-mode').addEventListener('change',e=>{audio.setMode(e.target.value);memory.write('observatory-sound-mode',audio.mode);});
$('#reduced').addEventListener('change',e=>{manualReduced=e.target.checked;memory.write('observatory-reduced-motion',manualReduced);syncComfort();if(reduced()){finishBirth(true);rig.tick(0,true);}});
$('#pause').addEventListener('change',e=>{paused=e.target.checked;memory.write('cinema-paused',paused);syncComfort();if(paused&&state.phase==='birth')finishBirth(true);});
$('#read-size').addEventListener('input',e=>{readingScale=Number(e.target.value)/100;memory.write('observatory-reading-scale',readingScale);syncComfort();if(selected&&$('#reader').open){rig.target=memoryDestination(selected,innerWidth,innerHeight,rig.homeZ,readingScale);rig.tick(0,true);}syncReaderPositions();});
$('#replay').addEventListener('click',()=>{
  closeSheet($('#comfort'));if(!entered)return;
  operation++;pending=null;selected=null;readingOrigin=null;renderer.selected=-1;rig.home();rig.tick(0,true);dust.setLayout(layout);wasZoomed=false;state.birth=0;state.birthSpeed=1;phase('birth');$('#skip-birth').hidden=false;if(reduced()||paused)finishBirth(true);
});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('Fullscreen is not available in this browser.');}});
for(const id of ['empty-import','import','sample-badge'])$('#'+id).addEventListener('click',()=>$('#file-input').click());
$('#file-input').addEventListener('change',e=>importFile(e.target.files[0]));
$('#demo').addEventListener('click',async()=>{try{$('#empty').hidden=true;$('#loading').hidden=false;await setCollection(sampleData());}catch(e){$('#loading').hidden=true;$('#empty').hidden=false;notify(e.message);}});
$('#undo-import').addEventListener('click',async()=>{if(!previousData)return;const prior=previousData;try{await setCollection(prior.data,{url:prior.url,keepPrevious:true});notify('The previous sky is back.');}catch(e){notify(e.message);}});

window.addEventListener('keydown',e=>{
  if(song.active||e.defaultPrevented)return;
  const input=e.target.closest('input,textarea,select,[contenteditable=true]');
  if(e.key==='Escape'){
    if(modal()){e.preventDefault();const top=$$('dialog[open]').at(-1);if(top.id==='reader')closeReader();else closeSheet(top);return;}
    if(!$('#orbit').hidden){orbit(false);$('#beacon').focus();return;}
    if(state.phase==='birth'){e.preventDefault();finishBirth(false);return;}
    if(pending||selected){const origin=readingOrigin?{...readingOrigin}:{x:0,y:0,z:rig.homeZ};operation++;pending=null;selected=null;readingOrigin=null;rig.interrupt();renderer.selected=-1;rig.flyTo(origin,{duration:DURATION.return,arc:false});phase('returning');if(reduced())rig.tick(0,true);return;}
    return;
  }
  if(input||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key.toLowerCase()==='m'){e.preventDefault();toggleSound();return;}
  if(modal())return;
  if(e.key==='?'){e.preventDefault();openSheet('help');return;}
  if(e.key==='/'){e.preventDefault();openSheet('library');return;}
  if(!entered)return;
  // Native controls retain Enter / Space rather than also triggering a camera action.
  if(e.target.closest('button,a'))return;
  if(e.key===' '){e.preventDefault();orbit($('#orbit').hidden);if(!$('#orbit').hidden)$('.satellite-find').focus();return;}
  if(e.key==='Enter'){e.preventDefault();if(state.phase==='focused'&&selected)showReader(selected);else if(!pending)nextMoment();return;}
  if(e.key.toLowerCase()==='h'){e.preventDefault();home();return;}
  if(['+','=','-','_','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();operation++;pending=null;selected=null;readingOrigin=null;renderer.selected=-1;finishBirth(true);hideWhisper();clearHover();wasZoomed=true;phase('sky');
    if(['+','='].includes(e.key))rig.zoom(.8);
    else if(['-','_'].includes(e.key))rig.zoom(1.25);
    else rig.pan(e.key==='ArrowLeft'?95:e.key==='ArrowRight'?-95:0,e.key==='ArrowUp'?95:e.key==='ArrowDown'?-95:0);
    if(reduced())rig.tick(0,true);
  }
});
window.addEventListener('resize',()=>{
  const oldHome=rig.homeZ;rig.resize(innerWidth,innerHeight);renderer?.resize();dust.resize();
  if(readingOrigin&&Math.abs(readingOrigin.z-oldHome)<1)readingOrigin.z=rig.homeZ;
  if($('#reader').open&&selected){const dest=memoryDestination(selected,innerWidth,innerHeight,rig.homeZ,readingScale);rig.target=dest;rig.tick(0,true);syncReaderPositions();}
  paintMap();clearHover();
});
motionQuery.addEventListener('change',()=>{syncComfort();if(reduced()){finishBirth(true);rig.tick(0,true);}});
document.addEventListener('visibilitychange',()=>{frameTime=0;audio.setVisible(!document.hidden);clearHover();});
window.addEventListener('pagehide',()=>audio.dispose());

function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden){frameTime=0;return;}
  const dt=frameTime?Math.min(.06,(now-frameTime)/1000):0;frameTime=now;
  if(!renderer||building)return;
  song.setReady(entered&&state.ready&&state.birth>=1&&$('#gate').hidden&&!building&&!modal());
  const begin=performance.now();
  if(!paused&&!reduced())simulationTime+=dt;
  if(state.phase==='birth'){
    state.birth=clamp(state.birth+dt/DURATION.birth*state.birthSpeed,0,1);
    if(reduced()||paused)state.birth=1;
    if(state.birth>=1){phase('sky');$('#skip-birth').hidden=true;whisper(innerWidth<650?'Pinch closer, or touch a light.':'Move closer. There are words in the light.',1500);}
  }
  const moving=rig.tick(dt,reduced());
  state.moodBlend=clamp(state.moodBlend+dt/1.2,0,1);
  if(pending&&!rig.flight&&moving<.6)finishApproach();
  if(state.phase==='returning'&&!rig.flight&&moving<.2)phase('sky');
  if(state.transition){const t=state.transition;t.elapsed+=dt;setReadingMix(t.from+(t.to-t.from)*smoother(t.elapsed/t.duration));if(t.elapsed>=t.duration){state.transition=null;t.done?.();}}
  const delta=Math.hypot(rig.current.x-lastCamera.x,rig.current.y-lastCamera.y)/Math.max(rig.current.z,100)+Math.abs(Math.log(rig.current.z/lastCamera.z));
  motion+=(clamp(delta/Math.max(dt,.016)*.45,0,1)-motion)*(1-Math.exp(-3.5*dt));lastCamera={...rig.current};
  Object.assign(renderer,{reveal:state.birth,mood:state.mood,moodFrom:state.moodFrom,moodBlend:state.moodBlend,readerMix:state.readingMix,exposure:.96});
  const interval=song.active?16:(paused||reduced())&&!moving&&!state.transition&&state.phase!=='birth'?160:state.phase==='reading'?50:16;
  if(now-lastPaint>=interval){song.beforeRender(rig.current);renderer.render(rig.current,simulationTime);song.afterRender(rig.current);dust.render(rig.current,state.birth,Math.min(.1,(now-lastPaint)/1000),{reduced:reduced()||paused});lastPaint=now;frameCount++;frameCost=performance.now()-begin;}
  paintHover(now);
  if(now-lastMap>240){paintMap();lastMap=now;}
  if(now-lastAudio>80){audio.update({zoom:rig.homeZ/rig.current.z,motion,reading:$('#reader').open});lastAudio=now;}
}

async function start(){
  try{const made=makeRenderer(canvas);renderer=made.instance;canvas=made.element;bindControls();renderer.reveal=0;}catch(e){$('#loading').hidden=true;$('#empty').hidden=false;notify('Graphics are unavailable in this browser. '+e.message);return;}
  requestAnimationFrame(frame);
  await document.fonts.ready;
  if(new URLSearchParams(location.search).get('demo')==='1'){await setCollection(sampleData());return;}
  if(globalThis.HAPPYCOUD_EMBEDDED){await setCollection(globalThis.HAPPYCOUD_EMBEDDED);return;}
  if(location.protocol!=='file:'){
    const result=await loadData();
    if(result.data.comments.length){await setCollection(result.data,{url:result.url});return;}
  }
  phase('empty');$('#loading').hidden=true;$('#empty').hidden=false;
}
start().catch(e=>{phase('empty');$('#loading').hidden=true;$('#empty').hidden=false;notify(e.message);});

// Development-only inspection. No analytics, network logs, or private text persistence.
if(new URLSearchParams(location.search).has('debug')||globalThis.HAPPYCOUD_DEBUG===true){
  window.__sky=Object.freeze({
    snapshot:()=>({phase:state.phase,ready:state.ready,count:data.comments.length,sample:data.sample,birth:state.birth,readingMix:state.readingMix,
      camera:{...rig.current},target:{...rig.target},homeZ:rig.homeZ,fingerprint:layout.fingerprint,renderer:renderer?.kind,graphicsFallbackReason,frames:frameCount,lastFrameMs:frameCost,
      nodes:layout.nodes.map(n=>({id:n.comment.id,x:n.x,y:n.y,z:n.z,font:n.font,w:n.w,h:n.h,point:project(n,rig.current,innerWidth,innerHeight)})),
      selected:selected?.comment.id,readingOrigin,history:[...history],kept:[...memory.kept],pointers:controls?.pointers.size,song:song.snapshot(),
      mood:MOODS.find(m=>m.bit===state.mood)?.id,audio:{mood:audio.mood,instrument:audio.mood==='all'?null:MOOD_INSTRUMENTS[audio.mood].name,moodNotes:audio.stats.moodNotes,moodTargets:{...audio.moodTargets},moodVoices:Object.fromEntries(Object.keys(MOOD_INSTRUMENTS).map(id=>[id,[...audio.voices].filter(v=>v.mood===id).length])),chordIndex:audio.chordIndex,enabled:audio.enabled,wanted:audio.wanted,visible:audio.visible,stats:{...audio.stats},voices:audio.voices.size,cachedNotes:audio.buffers.size},error:renderer?.gl&&!renderer.lost?renderer.gl.getError():null}),
    select:id=>approach(layout.nodes.find(n=>n.comment.id===id)),finish:()=>finishBirth(true),import:data=>setCollection(data,{keepPrevious:true}),
    original:id=>data.comments.find(c=>c.id===id),
  });
}
