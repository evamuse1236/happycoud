import { CameraRig, project, unproject, clamp } from './math.js';
import { MOODS, normalizeData, loadData, fetchData, conversationFor } from './data.js';
import { createLayout, WORLD, graphemes } from './layout.js';
import { ConstellationRenderer } from './renderer.js';
import { CanvasConstellationRenderer } from './canvas-renderer.js';
import { NavigationControls } from './controls.js';
import { ObservatorySound } from './sound.js';
import { Experience, TIMING, firstMoment, validView, calloutPosition } from './experience.js';
import { Annotations } from './annotations.js';
import { sampleData } from './demo.js';
import { planJourney, LocalMemory } from './journey.js';
import { ViewTrail, ReadingTrail, paintInterval, atmosphereExposure, searchKey, snippetAround, isTextEntry } from './care.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let canvas=$('#universe');
const rig=new CameraRig(innerWidth,innerHeight),audio=new ObservatorySound();
const experience=new Experience(),annotations=new Annotations($('#annotations'));
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=preference.matches,ready=false,dirty=true,building=false,renderer=null;
let data=normalizeData([]),layout={nodes:[],fingerprint:'empty'},mood=MOODS[0],author=null;
let frameTime=0,motionTime=0,lastPaint=0,pendingFocus=null,readingOrigin=null,active=null;
let hover=-1,noticeTimer=null,pendingData=null,sourceURL=null,pollBusy=false;
let listLimit=100,searchTimer=null,importEpoch=0,frameCount=0,frameDuration=0;
let localStorageRef;try{localStorageRef=window.localStorage;}catch{}
const memory=new LocalMemory(localStorageRef);let seen=new Set();
let shelf='all',journey=null,zen=false,lastHUD=0;
const viewTrail=new ViewTrail(),readingTrail=new ReadingTrail();
let libraryOrigin=null,returnToLibrary=false,placementCache=null,exposure=1;
let saving=memory.read('observatory-saving',false)===true;
let tapNavigation=memory.read('observatory-tap-navigation',false)===true;
function syncTrail(){ $('#retrace').hidden=!viewTrail.size; }
function rememberView(view=rig.current){ if(ready&&!dialogOpen()&&!journey){viewTrail.record(view);syncTrail();} }
function syncReadingTrail(){
  $('#reader-previous').disabled=!readingTrail.previous;$('#reader-forward').disabled=!readingTrail.next;
  $('#reading-position').textContent=readingTrail.items.length>1?`${readingTrail.index+1} / ${readingTrail.items.length}`:'';
  $('#reader-results').hidden=!libraryOrigin;
  $('.reading-route').hidden=readingTrail.items.length<2&&!libraryOrigin;
}
function syncComfort(){
  $('#energy-toggle').setAttribute('aria-pressed',String(saving));$('#energy-state').textContent=saving?'On':'Off';
  $('#tap-nav-toggle').setAttribute('aria-pressed',String(tapNavigation));$('#tap-nav-state').textContent=tapNavigation?'On':'Off';
  $('#tap-navigation').hidden=!tapNavigation||!ready;document.body.dataset.saving=String(saving);
}
syncComfort();
let effectsTime=0,hoverPoint=null,lastActivity=performance.now(),firstAnchor=null,lastViewSave=0,savedView=null;
let whisperTimer=null,readerAnimation=null,manualReduced=memory.read('observatory-reduced-motion',false)===true,readingScale=1,closeEpoch=0,callout=null,closingReader=false;
const reduced=()=>preference.matches||manualReduced;
function updateMotionPreference(){document.body.dataset.reduced=String(reduced());$('#reduced-toggle').setAttribute('aria-pressed',String(reduced()));$('#reduced-state').textContent=reduced()?'On':'Off';if(reduced()){experience.skip();rig.tick(0,true);}dirty=true;}
updateMotionPreference();
function syncSound(){
  const on=audio.enabled||audio.wanted;document.body.dataset.sound=String(on);$('#sound-toggle').setAttribute('aria-pressed',String(on));$('#sound-state').textContent=on?'On':'Off';$('#sound-quick').setAttribute('aria-pressed',String(on));$('#sound-quick').setAttribute('aria-label',on?'Turn off sound':'Turn on sound');$('#quick-sound-label').textContent=on?'Sound on':'Sound off';$('#reader-sound').setAttribute('aria-pressed',String(on));$('#reader-sound').setAttribute('aria-label',on?'Turn off sound':'Turn on sound');
}
audio.setVolume(memory.read('observatory-volume',.32));audio.setMode(memory.read('observatory-sound-mode','full'));
$('#sound-volume').value=Math.round(audio.volume*100);$('#volume-value').textContent=Math.round(audio.volume*100)+'%';$('#sound-mode').value=audio.mode;
readingScale=clamp(Number(memory.read('observatory-reading-scale',1))||1,.9,1.5);
function updateType(){document.documentElement.style.setProperty('--reading-scale',readingScale);$('#type-down').disabled=readingScale<=.9;$('#type-up').disabled=readingScale>=1.5;}
updateType();
function updateEntryCopy(){ $('#entry-instruction').textContent=innerWidth<700?'Or pinch into the words. Take your time.':'Or simply scroll into the words. There’s no wrong way.'; }
updateEntryCopy();
function finishArrival(){experience.skip();$('#app').dataset.arrival='false';$('#skip-opening').hidden=true;dirty=true;}
function leaveInvitation(){finishArrival();experience.zoomed=true;$('#entry-invitation').hidden=true;$('#app').dataset.invitation='false';}
function panFor(node){return clamp((project(node,rig.current,innerWidth,innerHeight)?.x/innerWidth-.5)*1.3,-.65,.65);}

let paper=memory.read('observatory-paper',true);document.body.dataset.paper=String(paper);
function updatePaper(){document.body.dataset.paper=String(paper);$('#paper-state').textContent=paper?'Paper':'Midnight';$('#paper-toggle').setAttribute('aria-pressed',String(paper));memory.write('observatory-paper',paper);}
updatePaper();
const dialogOpen=()=>!!document.querySelector('dialog[open]');
const eligible=c=>(!mood.bit||c.moods.includes(mood.id))&&(!author||c.author===author);
const announce=text=>$('#live-status').textContent=text;
function toast(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,4200);announce(text);}
function graphicsFailure(message){$('#graphics-error').textContent=message;$('#graphics-error').hidden=!message;dirty=true;if(message)announce(message);}
try{if(window.HAPPYCOUD_FORCE_CANVAS)throw new Error('Compatibility renderer requested.');renderer=new ConstellationRenderer(canvas,graphicsFailure);renderer.kind='webgl2';}catch(error){
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
  try{renderer=new CanvasConstellationRenderer(canvas);}catch(fallbackError){graphicsFailure(fallbackError.message);}
}
function options(open){$('#options').hidden=!open;$('#options-toggle').setAttribute('aria-expanded',String(open));}
function updatePause(){
  document.body.dataset.paused=String(paused);
  $('#motion-toggle').setAttribute('aria-pressed',String(paused));$('#motion-state').textContent=paused?'On':'Off';dirty=true;
}
updatePause();
function clearHover(){hover=-1;experience.setHover(-1);hoverPoint=null;renderer?.setHover(-1);$('#hover-label').hidden=true;canvas.classList.remove('pointing');dirty=true;}
function cancelFocus(){firstAnchor=null;$('#first-read').hidden=true;pendingFocus=null;readingOrigin=null;if(journey)endJourney(false);rig.interrupt();if(renderer)renderer.selected=-1;}
function markInteraction(){finishArrival();options(false);lastActivity=performance.now();dirty=true;}
function pick(point){
  let chosen=null,score=Infinity;
  for(const node of layout.nodes){
    if(!eligible(node.comment))continue;
    const p=project(node,rig.current,innerWidth,innerHeight);if(!p)continue;
    const w=Math.max(10,node.w*p.scale),h=Math.max(9,node.h*p.scale);
    if(Math.abs(point.x-p.x)>w/2+3||Math.abs(point.y-p.y)>h/2+3)continue;
    const distance=Math.hypot((point.x-p.x)/w,(point.y-p.y)/h);
    if(distance<score){chosen=node;score=distance;}
  }
  return chosen;
}
function onHover(point){
  if(!point||building||dialogOpen()||pendingFocus){clearHover();return;}
  const n=pick(point);
  if(!n){if(hover>=0)clearHover();return;}
  if(hover!==n.index){hover=n.index;experience.setHover(hover);renderer?.setHover(-1);dirty=true;}hoverPoint=point;
  canvas.classList.add('pointing');
  const p=project(n,rig.current,innerWidth,innerHeight);
  const label=$('#hover-label');
  label.textContent=(n.comment.author?`@${n.comment.author}`:'A little moment')+'\n'+(p&&n.font*p.scale>11?'Open these words ↗':'Come closer to these words ↗');
  label.style.left=clamp(point.x+18,12,innerWidth-252)+'px';label.style.top=clamp(point.y+18,110,innerHeight-165)+'px';label.hidden=!experience.hoverReady;
}
const controls=new NavigationControls(canvas,rig,{
  onSelect:p=>{const n=pick(p);if(n)approach(n);},onHover,onInteract:markInteraction,onCancelFocus:cancelFocus,onNavigate:rememberView,
  getPlane:p=>pick(p)?.z??0,canCoast:()=>!reduced(),
  isBlocked:()=>!ready||building||dialogOpen()
});
function approach(node){
  rememberView();
  leaveInvitation();firstAnchor=null;$('#first-read').hidden=true;clearHover();options(false);audio.event('approach',node.comment.id,panFor(node));
  if(!readingOrigin)readingOrigin={...rig.current};
  rig.focus(node);rig.flyTo({...rig.target});if(renderer)renderer.selected=node.index;
  pendingFocus={node};dirty=true;
  if(reduced()||!renderer){rig.tick(0,true);pendingFocus=null;showReader(node.comment);}
}
function another(){
  const all=layout.nodes.filter(n=>eligible(n.comment));
  const unseen=all.filter(n=>!seen.has(n.comment.id));
  const pool=(unseen.length?unseen:all).filter(n=>n.comment.id!==active?.id);
  const choice=pool.length?pool[Math.floor(Math.random()*pool.length)]:all[0];
  if(!choice){toast('No moments match this selection. Try Everything or clear the person filter.');return;}
  if($('#reader').open){
    // Reading navigation is explicit. The underlying selected node remains in the same world.
    rig.focus(choice);rig.flyTo({...rig.target});if(reduced())rig.tick(0,true);if(renderer)renderer.selected=choice.index;showReader(choice.comment);
  }else approach(choice);
}
function showReader(comment,{record=true,scroll=0}={}){
  if(active)readingTrail.rememberScroll($('.reader-scroll').scrollTop);
  if(record)readingTrail.push(comment.id);syncReadingTrail();
  leaveInvitation();experience.reads++;audio.setReading(true);document.body.dataset.reading='true';
  const wasOpen=$('#reader').open;closeEpoch++;closingReader=false;
  active=comment;memory.visit(comment.id);seen=memory.visited;clearHover();dirty=true;updateKept();
  const dialog=$('#reader');dialog.classList.toggle('long',comment.text.length>230);
  $('#quote').textContent=comment.text;
  $('#reader-title').textContent=data.sample?'ILLUSTRATIVE SAMPLE':`MOMENT ${String(data.comments.findIndex(c=>c.id===comment.id)+1).padStart(3,'0')} / ${data.comments.length}`;
  $('#reader-moods').textContent=comment.moods.map(id=>{const m=MOODS.find(x=>x.id===id);return m?m.symbol+' '+m.label:'';}).filter(Boolean).join(' · ') || 'Original words, just as they were left.';
  $('#reader-author').textContent=comment.author?'@'+comment.author:'Author not recorded';
  $('#reader-author').disabled=!comment.author;
  $('#reader-date').textContent=data.sample?'Sample collection · not a real account':comment.postDate?`Post date: ${comment.postDate}`:comment.timeLabel?`Recorded time label: ${comment.timeLabel}`:'Date not recorded in the archive';
  const link=comment.commentUrl||comment.postUrl;
  $('#reader-source').hidden=!link;
  if(link){$('#reader-source').href=link;$('#reader-source').textContent=comment.commentUrl?'View original comment ↗':'View original post ↗';}
  else $('#reader-source').removeAttribute('href');
  const relatives=conversationFor(comment);$('#conversation').hidden=!relatives.length;$('#conversation').open=false;
  $('#conversation-summary').textContent=`In this conversation · ${relatives.length} other ${relatives.length===1?'message':'messages'}`;
  $('#replies').replaceChildren();
  for(const r of relatives){
    const box=document.createElement('article');box.className='reply';
    const name=document.createElement('span');name.className='reply-author';name.textContent=r.author?'@'+r.author:'Author not recorded';box.append(name);
    if(r.isOwner){const badge=document.createElement('span');badge.className='reply-owner';badge.textContent='Account owner';box.append(badge);}
    const text=document.createElement('p');text.dir='auto';text.textContent=r.text;box.append(text);$('#replies').append(box);
  }
  if(!dialog.open)dialog.showModal();
  readerAnimation?.cancel();
  if(!reduced())readerAnimation=dialog.animate(wasOpen?[{opacity:.8},{opacity:1}]:[{opacity:0,transform:'translateY(12px) scale(.975)'},{opacity:1,transform:'none'}],{duration:wasOpen?200:440,easing:'cubic-bezier(.16,1,.3,1)'});
  const visibleNode=layout.nodes.find(n=>n.comment.id===comment.id);
  if(visibleNode)audio.event('open',comment.id,0);
  $('.reader-scroll').scrollTo({top:scroll,behavior:'instant'});$('#reader-close').focus({preventScroll:true});
  $('#seen-label').textContent=`${seen.size} of ${data.comments.length} moments visited`;
  announce('Reading '+(comment.author?'a comment by '+comment.author:'a comment')+'.');
}
function closeReader(){
  const dialog=$('#reader');if(!dialog.open)return;
  const epoch=++closeEpoch;closingReader=true;readerAnimation?.cancel();
  if(reduced()){dialog.close();return;}
  readerAnimation=dialog.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(5px) scale(.99)'}],{duration:180,easing:'ease-in',fill:'forwards'});
  readerAnimation.finished.catch(()=>{}).then(()=>{if(epoch===closeEpoch&&dialog.open)dialog.close();});
}
$('#reader').addEventListener('cancel',e=>{e.preventDefault();closeReader();});
let backdropDown=false;
function outsideReader(e){const r=$('#reader').getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
$('#reader').addEventListener('pointerdown',e=>{backdropDown=e.target===$('#reader')&&outsideReader(e);});
$('#reader').addEventListener('pointerup',e=>{if(backdropDown&&e.target===$('#reader')&&outsideReader(e))closeReader();backdropDown=false;});
$('#reader').addEventListener('close',()=>{
  closingReader=false;readingTrail.rememberScroll($('.reader-scroll').scrollTop);
  const lastNode=layout.nodes.find(n=>n.comment.id===active?.id);
  if(lastNode&&!reduced())annotations.echo(lastNode,effectsTime+.65,'return');
  audio.setReading(false);document.body.dataset.reading='false';readerAnimation?.cancel();
  if(readingOrigin){rig.flyTo({...readingOrigin},{arc:false,duration:1});if(reduced())rig.tick(0,true);readingOrigin=null;}
  active=null;pendingFocus=null;if(renderer)renderer.selected=journey?journey.nodes[journey.index].index:-1;dirty=true;
  if(returnToLibrary&&libraryOrigin){
    returnToLibrary=false;const saved=libraryOrigin;
    $('#search').value=saved.query;shelf=saved.shelf;listLimit=saved.limit;
    setShelf(saved.shelf);listLimit=saved.limit;renderList();$('#library').showModal();
    $('#library').scrollTop=saved.scroll;
    const button=$$('#list-results button').find(b=>b.dataset.commentId===saved.commentID);(button||$('#search')).focus({preventScroll:true});
  }else{libraryOrigin=null;canvas.focus({preventScroll:true});}
});
function walkReading(delta){
  if(!active)return;readingTrail.rememberScroll($('.reader-scroll').scrollTop);
  const entry=readingTrail.step(delta);if(!entry)return;
  const comment=data.comments.find(c=>c.id===entry.id);if(!comment)return;
  const node=layout.nodes.find(n=>n.comment.id===entry.id);
  if(node){rig.focus(node);rig.flyTo({...rig.target});if(reduced())rig.tick(0,true);if(renderer)renderer.selected=node.index;}
  // Avoid overwriting the destination's remembered scroll in showReader.
  active=null;showReader(comment,{record:false,scroll:entry.scroll});
}
$('#reader-previous').onclick=()=>walkReading(-1);$('#reader-forward').onclick=()=>walkReading(1);
$('#reader-results').onclick=()=>{returnToLibrary=true;closeReader();};
$('#copy-words').onclick=async()=>{
  if(!active)return;const text=active.text;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard permission unavailable');
    await navigator.clipboard.writeText(text);announce('Original words copied.');
    const button=$('#copy-words');button.dataset.copied='true';button.setAttribute('aria-label','Original words copied');
    setTimeout(()=>{delete button.dataset.copied;button.setAttribute('aria-label','Copy the exact original words');},1800);
  }catch{
    const selection=getSelection(),range=document.createRange();range.selectNodeContents($('#quote'));selection.removeAllRanges();selection.addRange(range);
    $('#copy-words').dataset.selected='true';setTimeout(()=>delete $('#copy-words').dataset.selected,2600);
    announce('Clipboard unavailable here. The original words are selected; use your browser’s Copy command.');
  }
};
$('#reader-close').onclick=closeReader;$('#return-to-sky').onclick=closeReader;$('#next-moment').onclick=another;
$('#reader-author').onclick=()=>{if(!active?.author)return;setAuthor(active.author);closeReader();};
function setAuthor(name){
  if(journey)endJourney(false);
  author=name;renderer?.setAuthor(name);const chip=$('#author-chip');chip.hidden=!name;chip.textContent=name?`Words from @${name} · Clear ×`:'';
  clearHover();dirty=true;announce(name?`Highlighting words from ${name}.`:'Person filter cleared.');
}
$('#author-chip').onclick=()=>setAuthor(null);
function setMood(id){
  if(journey)endJourney(false);
  mood=MOODS.find(m=>m.id===id)||MOODS[0];experience.setMood(mood.bit,reduced());if(renderer)renderer.mood=mood.bit;
  if(ready)leaveInvitation();
  $$('#moods button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mood===mood.id)));
  clearHover();dirty=true;
  const count=data.comments.filter(eligible).length;
  announce(`${count} comments highlighted. Their positions have not changed.`);
  if(!count&&ready)toast('No moments match this mood and person. Everything brings the whole sky back.');
}
$$('#moods button').forEach(b=>b.onclick=()=>setMood(b.dataset.mood));
$('#options-toggle').onclick=()=>options($('#options').hidden);
document.addEventListener('pointerdown',e=>{if(!$('#options').contains(e.target)&&!$('#options-toggle').contains(e.target))options(false);});
$('#motion-toggle').onclick=()=>{paused=!paused;updatePause();};
async function toggleSound(){
  try{const firstSound=!audio.context;const change=audio.toggle();syncSound();await change;syncSound();if(firstSound&&audio.enabled&&!dialogOpen())audio.event('arrival');}
  catch(error){syncSound();toast(error.message);}
}
$('#sound-toggle').onclick=toggleSound;$('#sound-quick').onclick=toggleSound;$('#reader-sound').onclick=toggleSound;
$('#sound-volume').oninput=e=>{audio.setVolume(Number(e.target.value)/100);$('#volume-value').textContent=e.target.value+'%';memory.write('observatory-volume',audio.volume);};
$('#sound-mode').onchange=e=>{audio.setMode(e.target.value);memory.write('observatory-sound-mode',audio.mode);};
$('#reduced-toggle').onclick=()=>{if(preference.matches){toast('Your device requests reduced motion. It stays on here.');return;}manualReduced=!manualReduced;memory.write('observatory-reduced-motion',manualReduced);updateMotionPreference();};
$('#type-down').onclick=()=>{readingScale=clamp(Math.round((readingScale-.1)*10)/10,.9,1.5);updateType();memory.write('observatory-reading-scale',readingScale);};
$('#type-up').onclick=()=>{readingScale=clamp(Math.round((readingScale+.1)*10)/10,.9,1.5);updateType();memory.write('observatory-reading-scale',readingScale);};
$('#atmosphere-toggle').onclick=()=>{
  if(!renderer)return;renderer.atmosphere=!renderer.atmosphere;$('#atmosphere-toggle').setAttribute('aria-pressed',String(renderer.atmosphere));$('#atmosphere-state').textContent=renderer.atmosphere?'On':'Off';dirty=true;
  if(!renderer.atmosphere)toast('Only the actual comments remain. This is the same word structure at every distance.');
};
$('#fullscreen').onclick=async()=>{
  options(false);
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Use your browser’s full-screen mode on this device.');}
  catch{toast('Full screen is unavailable in this browser view.');}
};
function goHome(){rememberView();finishArrival();cancelFocus();clearHover();rig.home();rig.flyTo({...rig.target},{arc:false,duration:1.25});if(reduced())rig.tick(0,true);dirty=true;}
$('#brand').onclick=goHome;$('#home').onclick=goHome;
$('#zoom-in').onclick=()=>{rememberView();finishArrival();cancelFocus();rig.zoom(.74);dirty=true;};
$('#zoom-out').onclick=()=>{rememberView();finishArrival();cancelFocus();rig.zoom(1.35);dirty=true;};
$('#surprise').onclick=()=>{if(journey)endJourney(false);another();};
$('#help-open').onclick=()=>{options(false);$('#help').showModal();};
$('#help-close').onclick=()=>$('#help').close();
$('#library-close').onclick=()=>$('#library').close();
$('#browse').onclick=()=>{options(false);libraryOrigin=null;listLimit=100;renderList();if(!$('#library').open)$('#library').showModal();$('#search').focus();};
$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{listLimit=100;renderList();},100);});
$('#more-results').onclick=()=>{listLimit+=100;renderList();};
function renderList(){
  const fold=searchKey;
  const q=fold($('#search').value.trim());
  const found=data.comments.filter(c=>eligible(c)&&(shelf==='all'||(shelf==='unvisited'?!seen.has(c.id):memory.kept.has(c.id)))&&(!q||fold(c.text+' '+c.author).includes(q)));
  $('#result-count').textContent=`${found.length.toLocaleString()} ${found.length===1?'moment':'moments'}${mood.id!=='all'?' · '+mood.label:''}${author?' · @'+author:''}${data.sample?' · illustrative samples':''}`;
  $('#list-results').replaceChildren();
  for(const comment of found.slice(0,listLimit)){
    const li=document.createElement('li'),button=document.createElement('button'),star=document.createElement('span'),body=document.createElement('span'),name=document.createElement('span');
    star.className=memory.kept.has(comment.id)?'list-star kept':'list-star';star.textContent=memory.kept.has(comment.id)?'◆':seen.has(comment.id)?'✦':'✧';star.setAttribute('aria-hidden','true');
    body.className='list-text';body.textContent=snippetAround(comment.text,$('#search').value,170);body.dir='auto';button.dataset.commentId=comment.id;
    name.className='list-author';name.textContent=(comment.author?'@'+comment.author:'Author not recorded')+(memory.kept.has(comment.id)?' · kept':'');body.append(name);button.append(star,body);li.append(button);$('#list-results').append(li);
    button.onclick=()=>{
      libraryOrigin={query:$('#search').value,shelf,limit:listLimit,scroll:$('#library').scrollTop,commentID:comment.id};
      $('#library').close();const n=layout.nodes.find(n=>n.comment.id===comment.id);
      if(n&&renderer&&!renderer.lost)approach(n);else{readingOrigin={...rig.current};showReader(comment);}
    };
  }
  if(!found.length){const li=document.createElement('li');li.className='privacy-note';li.style.padding='25px 0';li.textContent=data.comments.length?(shelf==='kept'?'Your kept moments will find a home here. Use the bookmark while reading.':'No matches here. Try another word, shelf, or mood.'):'No collection loaded yet. Open a local comment JSON to begin.';$('#list-results').append(li);}
  $('#more-results').hidden=found.length<=listLimit;
  $('#clear-search-filters').hidden=!q&&!mood.bit&&!author;
  $('#archive-note').textContent=data.sample?'Illustrative test material. None of these are her private comments.':data.provisional?'Archive coverage and mood tags are provisional. Original wording is preserved.':'Original wording and the relationships present in your file are preserved.';
}
$('#clear-search-filters').onclick=()=>{$('#search').value='';setMood('all');setAuthor(null);setShelf('all');renderList();$('#search').focus();};
$('#retrace').onclick=()=>{
  if(!ready||dialogOpen())return;const view=viewTrail.back(rig.current);syncTrail();if(!view)return;
  leaveInvitation();cancelFocus();clearHover();rig.flyTo(view,{duration:1.15,arc:false});if(reduced())rig.tick(0,true);dirty=true;announce('Returning to your previous view.');
};
$('#energy-toggle').onclick=()=>{saving=!saving;memory.write('observatory-saving',saving);syncComfort();dirty=true;};
$('#tap-nav-toggle').onclick=()=>{tapNavigation=!tapNavigation;memory.write('observatory-tap-navigation',tapNavigation);syncComfort();};
$$('[data-pan]').forEach(button=>button.onclick=()=>{
  rememberView();leaveInvitation();cancelFocus();clearHover();
  const directions={up:[0,80],down:[0,-80],left:[80,0],right:[-80,0]};rig.pan(...directions[button.dataset.pan]);dirty=true;
});
let mapRevision=0,mapPaintKey='';
const mapBase=document.createElement('canvas');mapBase.width=360;mapBase.height=88;
function buildMap(){
  mapRevision++;
  const c=mapBase.getContext('2d');c.clearRect(0,0,360,88);
  for(const n of layout.nodes){const p=mapCoords(n.x,n.y);c.fillStyle=memory.kept.has(n.comment.id)?'rgba(245,216,153,.95)':'rgba(207,194,167,.42)';c.fillRect(p.x,p.y,Math.max(.6,n.w/2400*340),Math.max(.6,n.h/WORLD.height*76));}
}
function mapCoords(x,y){return {x:10+(x+1200)/2400*340,y:6+(WORLD.height/2-y)/WORLD.height*76};}
function updateMap(){
  const key=[mapRevision,rig.current.x.toFixed(2),rig.current.y.toFixed(2),rig.current.z.toFixed(2),innerWidth,innerHeight].join('|');
  if(mapPaintKey===key)return;mapPaintKey=key;
  const c=$('#minimap').getContext('2d');c.clearRect(0,0,360,88);c.drawImage(mapBase,0,0);
  const a=unproject(0,0,0,rig.current,innerWidth,innerHeight),b=unproject(innerWidth,innerHeight,0,rig.current,innerWidth,innerHeight);
  const p=mapCoords(a.x,a.y),q=mapCoords(b.x,b.y);
  c.strokeStyle='rgba(195,217,245,.8)';c.lineWidth=1.2;
  const left=clamp(p.x,1,359),top=clamp(p.y,1,87),right=clamp(q.x,1,359),bottom=clamp(q.y,1,87);
  c.fillStyle='rgba(164,196,234,.05)';c.fillRect(left,top,right-left,bottom-top);c.strokeRect(left,top,Math.max(3,right-left),Math.max(3,bottom-top));
  const centre=mapCoords(rig.current.x,rig.current.y);c.fillStyle='#d8c3a0';c.fillRect(centre.x-1,centre.y-1,2,2);
}
$('#map-button').onclick=e=>{
  if(e.detail===0){goHome();return;}rememberView();leaveInvitation();
  const rect=$('#minimap').getBoundingClientRect();cancelFocus();
  rig.target.x=clamp(((e.clientX-rect.left)/rect.width*360-10)/340*2400-1200,-1200,1200);
  rig.target.y=clamp(WORLD.height/2-((e.clientY-rect.top)/rect.height*88-6)/76*WORLD.height,-WORLD.height/2,WORLD.height/2);
  if(rig.target.z>rig.homeZ*.55)rig.target.z=rig.homeZ*.42;rig.bounds();dirty=true;
};
async function setCollection(input){
  const hadWorld=ready;const prior={data,layout,view:{...rig.current},sample:!$('#sample-label').hidden};
  const candidate=normalizeData(input);
  if(building){toast('This sky is still being prepared. Please wait a moment before loading another.');return;}
  const epoch=++importEpoch;building=true;ready=false;cancelFocus();clearHover();options(false);
  for(const dialog of $$('dialog[open]'))dialog.close();
  $('#entry-invitation').hidden=true;$('#skip-opening').hidden=true;$('#app').dataset.invitation='false';$('#empty').hidden=true;$('#loading').hidden=false;$('#load-progress').value=0;$('#app').dataset.state='loading';$('#graphics-error').hidden=true;
  try{
    const next=candidate;
    if(!next.comments.length){data=next;memory.useCollection(data);seen=memory.visited;setShelf('all');updateKept();layout={nodes:[],fingerprint:'empty'};renderer?.clearWorld();$('#empty').hidden=false;$('#world-chrome').hidden=true;$('#sample-label').hidden=true;$('#collection-label').textContent='A CONSTELLATION OF LITTLE MOMENTS';$('#app').dataset.state='empty';return;}
    $('#loading-label').textContent='Finding a place for every complete comment…';
    const nextLayout=await createLayout(next.comments,p=>$('#load-progress').value=p*.58);
    $('#loading-label').textContent='Bringing the words into focus…';
    if(epoch!==importEpoch)return;
    if(renderer)await renderer.setLayout(nextLayout,p=>$('#load-progress').value=.58+p*.42);
    if(epoch!==importEpoch)return;
    data=next;layout=nextLayout;viewTrail.clear();readingTrail.clear();libraryOrigin=null;syncTrail();memory.useCollection(data);seen=memory.visited;shelf='all';updateKept();setShelf('all');setAuthor(null);setMood('all');rig.home();rig.tick(0,true);buildMap();
    $('#collection-label').textContent=`${data.comments.length.toLocaleString()} MOMENTS · ${data.sample?'SAMPLE COLLECTION':'A PRIVATE CONSTELLATION'}`;
    $('#sample-label').hidden=!data.sample;$('#world-chrome').hidden=false;$('#seen-label').textContent=seen.size?`${seen.size} of ${data.comments.length} moments visited`:'';
    $('#app').dataset.state='ready';ready=true;dirty=true;syncComfort();
    experience.reset({immediate:hadWorld||reduced()||seen.size>0});
    $('#app').dataset.arrival=String(experience.arriving);$('#skip-opening').hidden=!experience.arriving;
    savedView=validView(memory.read(memory.key+':view',null),layout.fingerprint,rig.homeZ);
    $('#resume-place').hidden=!savedView;
    $('#entry-kicker').textContent=data.sample?`${data.comments.length} MOMENTS · AN ILLUSTRATIVE SKY`:seen.size?'YOUR SKY IS STILL HERE.':'A LITTLE UNIVERSE. ALL IN THE WORDS.';
    $('#entry-invitation').hidden=hadWorld;$('#app').dataset.invitation=String(!hadWorld);
    if(!hadWorld&&audio.enabled)audio.event('arrival');

    if(!renderer||renderer.lost)graphicsFailure('The 3D sky is unavailable in this browser. Browse still lets you read every comment and conversation.');
    announce(`${data.comments.length} ${data.sample?'sample ':''}comments have found their places. Scroll or pinch to explore.`);
  }catch(error){
    if(hadWorld&&prior.layout.nodes.length){
      data=prior.data;layout=prior.layout;
      try{await renderer?.setLayout(layout);renderer?.setAuthor(author);if(renderer)renderer.mood=mood.bit;}catch{graphicsFailure('The sky renderer needs to recover. Every original comment is still in Browse.');}
      rig.current={...prior.view};rig.target={...prior.view};ready=true;$('#app').dataset.state='ready';$('#world-chrome').hidden=false;$('#empty').hidden=true;$('#sample-label').hidden=!prior.sample;
      toast('The new sky could not be prepared. Your previous collection and place are still here. '+error.message);
    }else{
      data=candidate;layout={nodes:[],fingerprint:'unavailable'};renderer?.clearWorld();$('#app').dataset.state='empty';$('#world-chrome').hidden=true;$('#empty').hidden=false;
      graphicsFailure(error.message+' Your original file has not been changed. Browse remains available.');
    }
  }finally{if(epoch===importEpoch){building=false;$('#loading').hidden=true;syncComfort();dirty=true;}}
}
$$('.import-trigger').forEach(b=>b.onclick=()=>{options(false);$('#import-file').click();});
async function importFile(file){
  if(!file)return;
  if(building){toast('The sky is still being prepared. Please wait before loading another.');return;}
  if(file.size>20*1024*1024){toast('Choose a JSON file smaller than 20 MB. Nothing has been uploaded or changed.');return;}
  try{const next=normalizeData(JSON.parse(await file.text()));sourceURL=null;pendingData=null;$('#pending-update').hidden=true;await setCollection(next);}
  catch(error){toast(error instanceof SyntaxError?'That file could not be read as JSON. The existing sky has not been changed.':error.message);}
}
$('#import-file').onchange=e=>{const file=e.target.files?.[0];e.target.value='';importFile(file);};
let dragDepth=0;
document.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();dragDepth++;$('#drop-zone').hidden=false;}});
document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
document.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;$('#drop-zone').hidden=true;}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#drop-zone').hidden=true;importFile(e.dataTransfer.files[0]);});
$('#demo-button').onclick=async()=>{sourceURL=null;await setCollection(sampleData());};
$('#pending-update').onclick=async()=>{if(!pendingData)return;const next=pendingData;pendingData=null;$('#pending-update').hidden=true;await setCollection(next);};
window.addEventListener('resize',()=>{updateEntryCopy();rig.resize(innerWidth,innerHeight);renderer?.resize();annotations.resize();clearHover();dirty=true;});
preference.addEventListener('change',()=>{updateMotionPreference();if(reduced()){paused=true;updatePause();}dirty=true;});
document.addEventListener('visibilitychange',()=>{audio.setAudible(!document.hidden);frameTime=0;dirty=true;clearHover();if(document.hidden)saveView();});
document.addEventListener('keydown',e=>{
  if(!isTextEntry(e.target)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='m'){e.preventDefault();toggleSound();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('#reader').open&&!$('#help').open)$('#browse').click();return;}
  if(e.key==='Escape'&&!dialogOpen()){finishArrival();if(zen){setZen(false);return;}if(journey){endJourney(true);return;}if(pendingFocus){cancelFocus();return;}}
  if(!dialogOpen()&&!isTextEntry(e.target)&&!e.ctrlKey&&!e.metaKey){
    if(e.key.toLowerCase()==='j'){e.preventDefault();$('#journey-toggle').click();return;}
    if(e.key.toLowerCase()==='f'){e.preventDefault();setZen(!zen);return;}
  }

  if(e.key==='Escape'&&!$('#options').hidden){options(false);$('#options-toggle').focus();return;}
  if(dialogOpen()||isTextEntry(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='l'||e.key==='L'){$('#browse').click();return;}
  if(e.key==='h'||e.key==='H'){$('#help-open').click();return;}
  if(!ready)return;
  if(e.key.toLowerCase()==='b'){e.preventDefault();$('#retrace').click();return;}
  const keys=['+','=','-','_','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','s','S'];
  if(!keys.includes(e.key))return;
  // Space on an actual button keeps its native activation behavior.
  if(e.key===' '&&e.target.closest('button'))return;
  e.preventDefault();clearHover();
  if(['+','='].includes(e.key)){$('#zoom-in').click();return;}
  if(['-','_'].includes(e.key)){$('#zoom-out').click();return;}
  if(e.key==='Home'){goHome();return;}
  if(e.key==='s'||e.key==='S'){another();return;}
  if(e.key===' '){paused=!paused;updatePause();return;}
  rememberView();cancelFocus();const directions={ArrowLeft:[90,0],ArrowRight:[-90,0],ArrowUp:[0,90],ArrowDown:[0,-90]};rig.pan(...directions[e.key]);dirty=true;
});
function updateKept(){
  $('#kept-count').textContent=memory.kept.size;
  const kept=active&&memory.kept.has(active.id);
  $('#keep-moment').setAttribute('aria-pressed',String(!!kept));$('#keep-moment').setAttribute('aria-label',kept?'Remove this kept moment':'Keep this moment on this device');$('#keep-feedback').hidden=!kept;$('#keep-feedback').textContent=memory.available?'Kept here, on this device.':'Kept for this visit. Browser storage is unavailable.';
}
$('#keep-moment').onclick=()=>{if(!active)return;const kept=memory.toggleKeep(active.id);updateKept();dirty=true;buildMap();
  if(kept){audio.event('keep',active.id);if(!reduced())$('#keep-moment').animate([{transform:'scale(1)'},{transform:'scale(1.2)',offset:.35},{transform:'scale(1)'}],{duration:520,easing:'ease-out'});}
announce(memory.kept.has(active.id)?(memory.available?'Moment kept on this device.':'Moment kept for this visit. Browser storage is unavailable.'):'Moment removed from your kept shelf.');};
function setShelf(value){shelf=value;listLimit=100;$$('#library-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shelf===value)));if($('#library').open)renderList();}
$$('#library-tabs button').forEach(b=>b.onclick=()=>{setShelf(b.dataset.shelf);renderList();});
$('#paper-toggle').onclick=()=>{paper=!paper;updatePaper();};
$('#forget-trail').onclick=()=>{options(false);if(confirm('Reset the visited and kept markers for this collection on this device? Your comments will not be changed.')){memory.forget();memory.write(memory.key+':view',null);savedView=null;$('#resume-place').hidden=true;seen=memory.visited;buildMap();updateKept();$('#seen-label').textContent='';toast('A fresh trail. Every original word is still here.');}};
function setZen(value){zen=value;$('#app').dataset.zen=String(value);$('#leave-zen').hidden=!value;options(false);if(!value)$('#zen-toggle').blur();dirty=true;}
$('#zen-toggle').onclick=()=>setZen(true);$('#leave-zen').onclick=()=>setZen(false);
function visitStop(index){
  if(!journey)return;
  journey.index=clamp(index,0,journey.nodes.length-1);const n=journey.nodes[journey.index];
  pendingFocus=null;clearHover();rig.focus(n);rig.flyTo({...rig.target});if(reduced())rig.tick(0,true);renderer.selected=n.index;audio.event('approach',n.comment.id,panFor(n));
  $('#journey-counter').replaceChildren(document.createTextNode(String(journey.index+1).padStart(2,'0')+' '));
  const total=document.createElement('span');total.textContent='/ '+String(journey.nodes.length).padStart(2,'0');$('#journey-counter').append(total);
  $('#journey-prev').disabled=journey.index===0;$('#journey-next').disabled=journey.index===journey.nodes.length-1;
  const category=MOODS.find(m=>m.bit&&(n.mask&m.bit));$('#waypoint-label').textContent=`STOP ${String(journey.index+1).padStart(2,'0')} · ${category?category.label.toUpperCase():'A LITTLE MOMENT'}`;
  announce(`Stop ${journey.index+1} of ${journey.nodes.length}. Choose Read these words to open the original comment.`);dirty=true;
}
function endJourney(restore=true){
  if(!journey)return;const origin=journey.origin;journey=null;$('#app').dataset.journey='false';$('#journey-hud').hidden=true;$('#waypoint').hidden=true;
  if(renderer)renderer.selected=-1;
  if(restore){rig.flyTo(origin,{arc:false,duration:1.1});if(reduced())rig.tick(0,true);}dirty=true;
}
$('#journey-toggle').onclick=()=>{
  if(!ready||!renderer)return;leaveInvitation();firstAnchor=null;$('#first-read').hidden=true;options(false);if(journey){endJourney();return;}
  const nodes=planJourney(layout.nodes,{mood:mood.bit,author,seen});if(!nodes.length){toast('No moments match this selection. Try Everything.');return;}
  journey={nodes,index:0,origin:{...rig.current}};$('#app').dataset.journey='true';$('#journey-hud').hidden=false;visitStop(0);
};
$('#journey-prev').onclick=()=>visitStop(journey.index-1);$('#journey-next').onclick=()=>visitStop(journey.index+1);$('#journey-end').onclick=()=>endJourney();
$('#waypoint').onclick=()=>{if(journey)approach(journey.nodes[journey.index]);};
function placeLabel(node,element){
  const p=project(node,rig.current,innerWidth,innerHeight);if(!p){element.hidden=true;return null;}
  element.hidden=false;
  const target={id:node.index,x:p.x,y:p.y,w:node.w*p.scale,h:node.h*p.scale};
  const key=[node.index,p.x,p.y,p.scale,innerWidth,innerHeight,element.id,element.offsetWidth,element.offsetHeight].join('|');
  let placement;
  if(placementCache?.key===key)placement=placementCache.placement;
  else{
    const rects=layout.nodes.map(n=>{const q=project(n,rig.current,innerWidth,innerHeight);return q&&n.font*q.scale>8?{id:n.index,x:q.x,y:q.y,w:n.w*q.scale,h:n.h*q.scale}:null;}).filter(Boolean);
    const reserved=$$('.topbar,.bottom-bar,#journey-hud,#tap-navigation').filter(e=>!e.hidden).map(e=>{const q=e.getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2,w:q.width,h:q.height};});
    placement=calloutPosition(target,rects,{width:innerWidth,height:innerHeight,labelWidth:element.offsetWidth||245,labelHeight:element.offsetHeight||76,reserved,previous:placementCache?.node===node.index?placementCache.placement:null});
    placementCache={key,placement,node:node.index};
  }
  element.style.left=placement.x+'px';element.style.top=(placement.y-placement.h/2)+'px';
  return {from:target,to:placement};
}
function updateWaypoint(){
  const el=$('#waypoint');if(!journey||dialogOpen()||rig.flight||pendingFocus){el.hidden=true;return;}
  callout=placeLabel(journey.nodes[journey.index],el);
}
function saveView(){
  if(!ready||dialogOpen()||pendingFocus||rig.flight||!experience.zoomed||!memory.key)return;
  if(Math.hypot(rig.current.x-rig.target.x,rig.current.y-rig.target.y,rig.current.z-rig.target.z)>.1)return;
  memory.write(memory.key+':view',{fingerprint:layout.fingerprint,camera:{...rig.current}});
}
window.addEventListener('pagehide',saveView);
for(const type of ['pointerdown','pointermove','keydown','wheel'])document.addEventListener(type,()=>{lastActivity=performance.now();},{passive:true});
$('#skip-opening').onclick=finishArrival;
$('#enter-first').onclick=()=>{
  const node=firstMoment(layout.nodes.filter(n=>eligible(n.comment)),seen);if(!node)return;
  rememberView();leaveInvitation();cancelFocus();firstAnchor=node;
  rig.focus(node);rig.flyTo({...rig.target},{duration:2.25,arc:false});if(reduced())rig.tick(0,true);
  if(renderer)renderer.selected=node.index;audio.event('approach',node.comment.id,panFor(node));dirty=true;
};
$('#resume-place').onclick=()=>{if(!savedView)return;rememberView();leaveInvitation();cancelFocus();rig.flyTo(savedView,{duration:1.8});if(reduced())rig.tick(0,true);dirty=true;};
$('#first-read').onclick=()=>{if(firstAnchor)approach(firstAnchor);};
$('#replay-opening').onclick=()=>{if(!ready)return;goHome();experience.reset({immediate:reduced()});experience.setMood(mood.bit,true);$('#app').dataset.arrival=String(!reduced());$('#skip-opening').hidden=reduced();$('#entry-invitation').hidden=false;$('#app').dataset.invitation='true';options(false);audio.event('arrival');};
function updateExperienceHUD(now){
  if($('#app').dataset.arrival!==String(experience.arriving)){$('#app').dataset.arrival=String(experience.arriving);$('#skip-opening').hidden=!experience.arriving;}
  const resting=String(now-lastActivity>6500&&!dialogOpen()&&experience.zoomed&&!journey);
  if(document.body.dataset.resting!==resting)document.body.dataset.resting=resting;
  const zoom=rig.homeZ/rig.current.z;
  if(zoom>1.7&&!experience.zoomed&&!rig.flight){
    leaveInvitation();
    if(!firstAnchor&&!reduced()){$('#first-zoom-whisper').hidden=false;clearTimeout(whisperTimer);whisperTimer=setTimeout(()=>$('#first-zoom-whisper').hidden=true,3100);}
  }
  callout=null;
  if(firstAnchor&&!rig.flight&&!dialogOpen())callout=placeLabel(firstAnchor,$('#first-read'));
  else $('#first-read').hidden=true;
  if(now-lastViewSave>5000){saveView();lastViewSave=now;}
  if(experience.hoverReady&&hover>=0&&hoverPoint&&!dialogOpen()&&!pendingFocus){renderer?.setHover(hover);$('#hover-label').hidden=false;}
  if(experience.takeHoverNote()&&hover>=0){const n=layout.nodes[hover];if(n)audio.pluck(n.comment.id,{pan:panFor(n)});}
}
function frame(now){
  requestAnimationFrame(frame);if(document.hidden)return;
  const dt=frameTime?Math.min((now-frameTime)/1000,.1):1/60;frameTime=now;
  effectsTime+=dt;
  const choreography=experience.tick(dt,{immediate:reduced()});
  if(renderer)Object.assign(renderer,experience.lighting());
  const before={...rig.current};
  const moving=rig.tick(dt,reduced());
  const speed=clamp(Math.abs(Math.log(rig.current.z/before.z))/Math.max(.001,dt)*.25+Math.hypot(rig.current.x-before.x,rig.current.y-before.y)/Math.max(.001,dt)/1800,0,1);
  audio.update(rig.homeZ/rig.current.z,speed);
  updateExperienceHUD(now);
  const ambience=!paused&&!reduced()&&!dialogOpen()&&ready&&renderer?.atmosphere;
  if(ambience)motionTime+=dt;
  if(pendingFocus&&moving<.75){const n=pendingFocus.node;pendingFocus=null;showReader(n.comment);}
  // Stop redrawing a paused, settled scene; inputs mark it dirty again.
  const interval=paintInterval({moving:moving>.006||!!rig.flight,effects:choreography||(!paused&&!reduced()&&annotations.echoes.length>0),ambient:ambience,saving,reading:dialogOpen()});
  if(renderer&&(dirty||now-lastPaint>=interval-1)){
    exposure=atmosphereExposure(rig.current.z,rig.homeZ);renderer.exposure=exposure;
    const start=performance.now();renderer.render(rig.current,motionTime);frameDuration=performance.now()-start;frameCount++;
    lastPaint=now;dirty=false;
  }
  if(ready&&now-lastHUD>100){
    lastHUD=now;
    const zoom=rig.homeZ/rig.current.z;$('#zoom-label').textContent=zoom.toFixed(1)+'×';
    $('#depth-label').textContent=zoom<1.6?'THE WHOLE SKY':zoom<4?'BETWEEN THE LETTERS':zoom<10?'AMONG THE WORDS':'A LITTLE CLOSER';
    $('#gesture-hint').textContent=zoom<1.6?(innerWidth<700?'Pinch to come closer.':'Scroll to come closer. Drag to wander.'):'Choose a moment. Stay a while.';
    updateMap();
  }
  updateWaypoint();
  annotations.render(rig.current,layout.nodes,{hover,selected:renderer?.selected??-1,hoverReady:experience.hoverReady,kept:memory.kept,time:effectsTime,reduced:reduced()||paused,reading:dialogOpen(),reveal:experience.reveal,callout});
}
requestAnimationFrame(frame);
setInterval(async()=>{
  if(!sourceURL||sourceURL.indexOf('/api/')<0||pollBusy||building||document.hidden)return;
  pollBusy=true;
  try{const next=await fetchData(sourceURL);if(next.version!==data.version&&next.comments.length){pendingData=next;$('#pending-update').hidden=false;}}
  catch{/* Keep the last good sky, and try again on the next poll. */}finally{pollBusy=false;}
},12000);
// Opt-in diagnostics contain geometry and counters, not the private comment wording.
if(new URLSearchParams(location.search).has('debug') || window.HAPPYCOUD_DEBUG === true){
  window.__skyDebug=Object.freeze({snapshot:()=>({
    experience:{reveal:experience.reveal,arriving:experience.arriving,zoomed:experience.zoomed,hoverReady:experience.hoverReady,moodBlend:experience.moodBlend},audio:audio.snapshot(),reduced:reduced(),readingScale,firstAnchor:firstAnchor?.comment.id||null,
    closingReader,ready,building,paused,activeID:active?.id||null,fingerprint:layout.fingerprint,
    camera:{...rig.current},target:{...rig.target},viewport:{width:rig.width,height:rig.height},velocity:{...rig.velocity},homeZ:rig.homeZ,motionTime,
    nodes:layout.nodes.map(n=>({id:n.comment.id,x:n.x,y:n.y,z:n.z,w:n.w,h:n.h,font:n.font,index:n.index,projected:project(n,rig.current,innerWidth,innerHeight)})),
    drawCalls:renderer?.drawCalls||0,atlasPages:renderer?.pages.length||0,textureBytes:renderer?.textureBytes||0,
    viewTrail:viewTrail.size,readingTrail:{index:readingTrail.index,ids:readingTrail.items.map(x=>x.id)},saving,tapNavigation,exposure,libraryOrigin:libraryOrigin?{commentID:libraryOrigin.commentID,shelf:libraryOrigin.shelf,scroll:libraryOrigin.scroll}:null,
    renderer:renderer?.kind,webglError:renderer?.gl&&!renderer.lost?renderer.gl.getError():null,frames:frameCount,cpuSubmitMs:frameDuration,
    atmosphere:renderer?.atmosphere,seen:seen.size,kept:memory.kept.size,shelf,journey:journey?{index:journey.index,ids:journey.nodes.map(n=>n.comment.id)}:null,flight:!!rig.flight,paper,zen,detailTextures:renderer?.details?.size||0,depth:layout.bounds,sample:data.sample,total:data.comments.length,gesturePointers:controls.pointers.size
  })});
}
async function start(){
  await document.fonts.ready;
  if(new URLSearchParams(location.search).get('demo')==='1'){await setCollection(sampleData());return;}
  if(location.protocol==='file:')return;
  const epoch=importEpoch;const result=await loadData();if(importEpoch!==epoch)return;sourceURL=result.url;
  if(result.data.comments.length)await setCollection(result.data);
}
start().catch(error=>toast(error.message));
