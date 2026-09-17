import {prepareSong, lyricSegments, sourceSegments, project, timeLabel, mediaDuration, phraseSource, lyricBeats} from './core.js';
import {SourceBridge} from './bridge.js';
import {clamp, mix, ease, phase, ENTRY, entryState, carrierPath, rectMix, pulseCue, displayPhrase} from './signal-motion.js';
import {SignalInk, sourceRangeRect, wordRect} from './signal-ink.js';
import {SignalCourier} from './signal-courier.js';
import {SignalRadio, radioState} from './signal-radio.js';

const BACK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"/></svg>';
const SOUND='<svg viewBox="0 0 26 24" aria-hidden="true"><path d="M3 10v4m5-7v10m5-13v16m5-13v10m5-7v4"/></svg>';
const PLAY='<svg viewBox="0 0 32 32" aria-hidden="true"><path class="ls-play-mark" d="m12 8 12 8-12 8Z"/><path class="ls-pause-mark" d="M12 9v14M21 9v14"/></svg>';
const SIGNAL='<svg class="ls-carrier" viewBox="0 0 160 44" aria-hidden="true"><path class="ls-carrier-echo"/><path class="ls-carrier-line"/></svg>';
const name=c=>c?.author?'@'+c.author.replace(/^@/,''):'a voice in this sky';
const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height});
const NS='http://www.w3.org/2000/svg';

/** Lost Signal — native SongExperience contract; main.js remains untouched.
 * The existing sky owns the only animation loop, original atlas and camera.
 * One entry clock; after connection, the recording owns every word and pulse. */
export class SongExperience {
  constructor({reduced=()=>false, projectComment, getScene, score, onOpen, onClose, announce=()=>{}, recording=null}) {
    if(typeof getScene!=='function')throw new TypeError('SongExperience needs the host getScene function.');
    Object.assign(this,{reduced,projectComment,getScene,score,onOpen,onClose,announce});
    this.active=false;this.ready=false;this.compatible=false;this.generation=0;this.comments=[];this.current=-1;
    this.elapsed=0;this.fade=0;this.lastFrame=0;this.userMuted=false;this.layoutDirty=true;
    this.model={records:[],phrases:[],sources:[],comments:new Map(),warnings:[],errors:[]};
    this.recording=recording||new Audio();this.recording.preload='metadata';this.recording.volume=1;
    this.controller=new AbortController();this.bridge=new SourceBridge();this.wordEls=new Map();this.rects=new Map();
    this.radar=document.createElement('button');this.radar.id='sl-portal';this.radar.className='sl-portal ls-portal';this.radar.hidden=true;
    this.radar.type='button';this.radar.setAttribute('aria-label','Connect to the lost signal and hear the song');
    this.radar.innerHTML=SIGNAL+'<span class="ls-portal-label">a lost signal</span><span class="ls-portal-hint">listen closer</span>';
    (document.querySelector('#app')||document.body).append(this.radar);
    this.scene=document.createElement('section');this.scene.id='sl-scene';this.scene.className='sl-scene ls-scene';this.scene.hidden=true;
    this.scene.setAttribute('role','dialog');this.scene.setAttribute('aria-modal','true');this.scene.setAttribute('aria-labelledby','ls-title');
    this.scene.innerHTML=`
      <div class="ls-haze" aria-hidden="true"></div>
      <svg class="ls-filaments" aria-hidden="true"></svg>
      <header class="ls-header"><button class="ls-button ls-back" data-action="close" aria-label="Return to the same sky">${BACK}<span>the same sky</span></button>
        <div class="ls-heading ls-sr"><h1 id="ls-title">Khushti</h1></div>
        <button class="ls-button ls-mute" data-action="mute" aria-label="Mute song" aria-pressed="false">${SOUND}<span>sound on</span></button></header>
      <div class="ls-receiver" aria-hidden="true">${SIGNAL}<p class="ls-signal-state">somewhere in the quiet</p></div>
      <div class="ls-recognition" aria-hidden="true"><p class="ls-survivors ls-eyebrow"></p><h2>The words that stayed.</h2></div>
      <figure class="ls-witness" aria-hidden="true"><blockquote></blockquote><figcaption></figcaption></figure>
      <div class="ls-room">
        <aside class="ls-source" aria-label="Original comment behind this lyric"><p class="ls-eyebrow">where the words began</p>
          <p class="ls-author"></p><blockquote class="ls-source-quote" dir="auto" tabindex="0"></blockquote>
          <div class="ls-source-tabs" aria-label="Source comments for this line"></div>
          <button class="ls-text-button" data-action="source">the original words <span aria-hidden="true">↗</span></button></aside>
        <div class="ls-stage-home"><div class="ls-stage"><p class="ls-line-label ls-eyebrow">a line, finding its melody</p>
          <div class="ls-lyric-window"><p class="ls-lyric" id="ls-lyric" dir="auto" tabindex="0"></p></div>
          <p class="ls-next" aria-hidden="true"></p></div></div>
      </div>
      <button class="ls-skip ls-text-button" data-action="skip">go gently to the song <span aria-hidden="true">↗</span></button>
      <footer class="ls-footer"><p class="ls-status" role="status"></p><div class="ls-controls">
        <button class="ls-text-button" data-action="restart" aria-label="Restart the recording">again</button>
        <button class="ls-button ls-play" data-action="play" aria-label="Play song">${PLAY}</button>
        <button class="ls-text-button" data-action="lyrics" aria-label="Browse all lyrics">the lyrics</button></div>
        <div class="ls-timeline"><output class="ls-time" aria-hidden="true">0:00</output><input class="ls-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Song position"><output class="ls-duration" aria-hidden="true">0:00</output></div>
        <p class="ls-error" role="alert" hidden></p></footer>
      <aside class="ls-drawer" role="dialog" aria-modal="true" aria-labelledby="ls-drawer-title" hidden><div class="ls-drawer-header"><h2 id="ls-drawer-title"></h2><button class="ls-button" data-action="drawer-close" aria-label="Close this panel">×</button></div><div class="ls-drawer-content"></div></aside>
      <p class="ls-live ls-sr" aria-live="polite" aria-atomic="true"></p>`;
    document.body.append(this.scene);this.el=s=>this.scene.querySelector(s);this.ink=new SignalInk(this.scene);this.courier=new SignalCourier(this.scene);this.radio=new SignalRadio();
    const signal=this.controller.signal;
    this.radar.addEventListener('click',()=>this.open(),{signal});
    this.scene.addEventListener('click',e=>{
      const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
      const a=b.dataset.action;
      if(a==='close')this.close();else if(a==='play')this.toggle();else if(a==='mute')this.mute();
      else if(a==='skip')this.finishEntry();else if(a==='restart'){this.seek(0);this.play();}
      else if(a==='lyrics'||a==='source')this.showDrawer(a==='lyrics'?'lyrics':'sources');else if(a==='drawer-close')this.hideDrawer();
    },{signal});
    this.scene.addEventListener('keydown',e=>this.keydown(e),{signal});
    this.el('.ls-seek').addEventListener('input',e=>this.seek(Number(e.target.value)),{signal});
    for(const type of ['play','pause','ended','loadedmetadata','durationchange'])this.recording.addEventListener(type,()=>{
      this.syncTransport();if(this.active&&!this.gathering&&!this.returning)this.update(true);
      if(type==='ended'){this.playWanted=false;this.status('The song ends.');}
    },{signal});
    this.recording.addEventListener('seeked',()=>{this.ink.clear();this.layoutDirty=true;this.update(true);},{signal});
    this.recording.addEventListener('waiting',()=>{if(this.active&&!this.gathering){this.scene.dataset.buffering='true';this.status('The recording is catching up…');}},{signal});
    this.recording.addEventListener('playing',()=>{this.lockConnection();delete this.scene.dataset.buffering;if(this.active&&!this.gathering)this.status('');},{signal});
    this.recording.addEventListener('error',()=>{if(this.active&&!this.returning)this.fail('The recording could not load. The lyrics and original comments are still here.');},{signal});
    document.addEventListener('visibilitychange',()=>{this.lastFrame=0;if(document.hidden&&this.active){this.hiddenDuringEntry=true;this.radio.stop();this.pausePlayback('Paused. Come back when you’re ready.');}},{signal});
    window.addEventListener('pagehide',()=>this.close({immediate:true,restoreFocus:false}),{signal});
    window.addEventListener('resize',()=>{this.layoutDirty=true;this.ink.clear();},{signal});
    this.observer=new ResizeObserver(()=>{this.layoutDirty=true;});this.observer.observe(this.el('.ls-room'));
    this.observer.observe(this.el('#ls-lyric'));this.observer.observe(this.el('.ls-source-quote'));
    for(const s of ['.ls-source-quote','#ls-lyric','.ls-room'])this.el(s).addEventListener('scroll',()=>{this.layoutDirty=true;},{passive:true,signal});
    document.fonts?.ready.then(()=>{if(!signal.aborted)this.layoutDirty=true;});
    this.paintCarrier(this.radar,0,0);this.loaded=this.load();
  }
  async load(){
    try{
      if(globalThis.HAPPYCOUD_SONG)this.song=globalThis.HAPPYCOUD_SONG;
      else{if(location.protocol==='file:')return;const r=await fetch('./data/song.json',{signal:this.controller.signal});if(!r.ok)return;this.song=await r.json();}
      if(this.controller.signal.aborted)return;
      this.recording.src=globalThis.HAPPYCOUD_SONG_AUDIO||'./media/khushti.mp3';
      this.el('#ls-title').textContent=this.song.title||'Khushti';this.setCollection(this.comments);
    }catch{/* The optional recording cannot prevent browsing the original sky. */}
  }
  setCollection(comments){
    if(this.active)this.close({immediate:true});this.comments=Array.isArray(comments)?comments:[];
    try{this.model=prepareSong(this.song,this.comments);}catch{this.model={valid:false,records:[],phrases:[],sources:[],comments:new Map(),warnings:[],errors:['The optional song manifest is malformed.']};}
    this.compatible=!!this.model.valid;this.syncRadar();
  }
  setReady(ready){this.ready=ready;this.syncRadar();}
  syncRadar(){this.radar.hidden=!this.ready||!this.compatible||this.active;}
  duration(){return mediaDuration(this.recording,this.model,this.song);}
  status(text){const el=this.el('.ls-status');if(el.textContent!==text)el.textContent=text;}
  paintCarrier(host,t,coherence){
    const line=host.querySelector('.ls-carrier-line'),echo=host.querySelector('.ls-carrier-echo');if(!line)return;
    line.setAttribute('d',carrierPath(t,coherence));echo.setAttribute('d',carrierPath(t+.52,coherence));echo.style.opacity=String(.22*(1-coherence));
  }
  open(){
    if(!this.ready||!this.compatible||this.active)return;
    const {rig,layout,renderer}=this.getScene();if(!renderer||renderer.lost)return;
    const token=++this.generation;this.savedCamera={...rig.current};this.rendererRef=renderer;
    this.previousFocus=document.activeElement;this.restoreFocus=true;this.portalRect=center(this.radar.getBoundingClientRect());
    this.active=true;this.gathering=true;this.returning=false;this.elapsed=0;this.fade=0;this.lastFrame=0;this.current=-1;
    this.openingReveal=false;this.el('.ls-skip').style.opacity='1';this.connectionPending=false;this.connectionAt=null;this.hiddenDuringEntry=document.hidden;this.mediaGraph=false;this.playPending=null;this.playWanted=false;this.playRequest=(this.playRequest||0)+1;this.lastSourceId=null;this.lyricTransition=null;
    this.nodes=new Map(layout.nodes.map(n=>[n.comment.id,n]));
    this.previewIndex=Math.max(0,this.model.phrases.findIndex(p=>p.sourceIds.length));
    const candidates=this.model.phrases[this.previewIndex].sourceIds.map(id=>this.nodes.get(id)).filter(Boolean);
    this.hero=candidates.find(n=>n.comment.text.length<240)||candidates[0]||this.nodes.get(this.model.sources[0]?.id);
    this.openingSourceId=this.hero?.comment.id;
    this.bridge.prepare(renderer,this.model.sources.map(c=>this.nodes.get(c.id)).filter(Boolean),this.openingSourceId);
    this.onOpen?.();rig.interrupt(); // No reset-to-home shot. We stay in the camera the user chose.
    this.scene.hidden=false;this.scene.dataset.phase='tuning';document.body.dataset.starlight='on';
    const app=document.querySelector('#app');this.previousInert=app?.inert??false;if(app)app.inert=true;
    delete this.scene.dataset.connected;this.el('.ls-source').inert=false;this.el('.ls-source').removeAttribute('aria-hidden');this.el('.ls-drawer').hidden=true;this.el('.ls-error').hidden=true;this.el('.ls-skip').hidden=false;this.setRoomInert(true);
    this.el('.ls-witness').hidden=false;this.el('.ls-receiver').hidden=false;this.el('.ls-recognition').hidden=false;
    this.el('.ls-survivors').textContent=this.model.sources.length?`${this.model.sources.length} original ${this.model.sources.length===1?'comment':'comments'} · still here`:'';
    this.el('.ls-recognition h2').textContent=this.hero?'The words that stayed.':'A melody in the quiet.';
    this.renderPhrase(this.previewIndex,true);this.renderWitness();this.createFilaments();
    this.syncRadar();this.syncTransport();this.syncMute();this.status('');this.entryFrame(false);
    this.el('[data-action=close]').focus({preventScroll:true});this.announce('Connecting to the song. Its original comments will remain in the sky.');
    this.recording.pause();this.recording.currentTime=0;this.recording.muted=true;
    try{this.score?.attachMedia(this.recording);this.mediaGraph=!!this.score?.media;this.score?.setMediaLevel(0,.01);if(!this.reduced())this.radio.start(this.score?.context,this.userMuted);}catch{/* Native HTML audio remains available. */}
    // Obtain playback permission in the user's click, without leaking any audio.
    Promise.resolve(this.recording.play()).then(()=>{
      if(token!==this.generation){if(!this.active)this.recording.pause();return;}
      if(this.gathering){this.recording.pause();this.recording.currentTime=0;}
    }).catch(()=>{});
    if(this.reduced())this.finishEntry();
  }
  setRoomInert(value){for(const s of ['.ls-room','.ls-footer'])this.el(s).inert=value;}
  createFilaments(){
    const svg=this.el('.ls-filaments');svg.replaceChildren();this.filaments=[];
    // These routes terminate at real projected comments, never decorative fake sources.
    for(const c of this.model.sources.slice(0,18)){const n=this.nodes.get(c.id);if(!n)continue;const p=document.createElementNS(NS,'path');svg.append(p);this.filaments.push({node:n,path:p});}
  }
  witnessRect(){
    if(!this.hero)return null;const n=this.hero;
    const scale=Math.min(35/n.font,(innerWidth<700?innerWidth*.86:Math.min(650,innerWidth*.6))/n.w,Math.max(60,innerHeight*.2)/n.h);
    return {x:innerWidth*.5,y:innerHeight*(innerWidth<700?.405:.445),width:n.w*scale,height:n.h*scale,font:n.font*scale};
  }
  renderWitness(){
    const q=this.el('.ls-witness blockquote');q.replaceChildren();if(!this.hero)return;
    const n=this.hero,phrase=this.model.phrases[this.previewIndex],ranges=phrase.records.filter(r=>r.origin?.commentId===n.comment.id).map(r=>r.origin);
    let cursor=0,valid=Array.isArray(n.lines)&&n.lines.length>0;
    const parts=[];
    for(const text of n.lines||[]){const start=n.comment.text.indexOf(text,cursor);if(start<0){valid=false;break;}parts.push({text,start});cursor=start+text.length;}
    if(valid){for(const part of parts){const line=document.createElement('span');line.className='ls-witness-line';this.appendSource(line,part.text,ranges,part.start);q.append(line);}}
    else this.appendSource(q,n.comment.text,ranges);
    this.el('.ls-witness figcaption').textContent=name(n.comment);
  }
  appendSource(host,text,ranges,offset=0){
    const local=ranges.map(r=>({start:Math.max(0,r.start-offset),end:Math.min(text.length,r.end-offset)})).filter(r=>r.end>r.start);
    for(const part of sourceSegments(text,local)){const span=document.createElement('span');span.textContent=part.text;span.className=part.kept?'ls-kept':'ls-rest';span.dataset.start=String(part.start+offset);span.dataset.end=String(part.end+offset);host.append(span);}
  }
  entryFrame(allowFinish=true){
    const s=entryState(this.elapsed,this.reduced());this.entry=s;this.fade=s.hush;const story=s.storyTime,remaining=1-s.clear;this.scene.dataset.phase=s.phase;
    const witness=this.witnessRect(),source=center(this.el('.ls-source-quote').getBoundingClientRect());
    const w=this.el('.ls-witness');
    if(witness){
      const d=rectMix(witness,source,s.dock),scale=mix(1,source.width/Math.max(1,witness.width),s.dock);
      w.style.left=d.x+'px';w.style.top=d.y+'px';w.style.width=witness.width+'px';w.style.height=witness.height+'px';
      w.style.transform=`translate(-50%,-50%) scale(${scale})`;w.style.fontSize=witness.font+'px';
      w.style.opacity=String(s.ink*(1-phase(s.dock,.72,1))*remaining);w.style.setProperty('--ls-shed',s.recognition);
    }
    this.bridgeFrame={fade:s.hush,gather:s.approach,destination:witness,dissolve:s.ink};
    const recognition=this.el('.ls-recognition');recognition.style.opacity=String(phase(story,1.9,2.7)*(1-phase(story,4.1,4.8))*remaining);
    const receiver=this.el('.ls-receiver'),rx=mix(this.portalRect.x,innerWidth*.5,s.lock),ry=mix(this.portalRect.y,innerHeight*(innerWidth<700?.155:.135),s.lock);
    receiver.style.left=rx+'px';receiver.style.top=ry+'px';receiver.style.opacity='1';
    this.paintCarrier(receiver,this.reduced()?0:s.time,radioState(s.time).coherence);this.radio.update(s.time);
    const text=s.time<1.5?'somewhere in the quiet':s.time<2.7?'a connection, finding its way':'finding the frequency';
    if(this.el('.ls-signal-state').textContent!==text)this.el('.ls-signal-state').textContent=text;
    this.el('.ls-signal-state').style.opacity=String(remaining);
    this.paintFilaments(rx,ry,s);
    this.el('.ls-source').style.opacity=String(phase(s.dock,.72,1)*remaining);
    this.el('.ls-footer').style.opacity='0';this.el('.ls-heading').style.opacity=String(s.controls);
    this.el('.ls-next').style.opacity='0';this.el('.ls-line-label').style.opacity='0';
    const home=center(this.el('.ls-stage-home').getBoundingClientRect());
    this.el('.ls-stage').style.transform=`translate(${(innerWidth*.5-home.x)*(1-s.dock)}px,${(innerHeight*(innerWidth<700?.66:.65)-home.y)*(1-s.dock)}px)`;
    const flights=[],p=this.model.phrases[this.current];
    p.records.forEach((r,i)=>{
      const el=this.wordEls.get(r.key);if(!el)return;
      const progress=clamp((story-4.82-Math.min(.2,i*.035))/1.12);
      const origin=r.origin?.commentId===this.openingSourceId?sourceRangeRect(this.el('.ls-witness blockquote'),r.origin):null;
      const target=wordRect(el);el.style.opacity=String(ease((progress-(origin ? .76 : .08))/(origin ? .24 : .92)));
      if(origin&&target)flights.push({key:r.key,text:r.origin.text,origin,target,progress,kind:'entry'});
    });
    // A manifest with unalignable timing tokens still displays its intact phrase.
    this.el('#ls-lyric').style.opacity=String((this.wordEls.size?1:s.weave)*remaining);
    this.el('.ls-skip').style.opacity=String(remaining);this.el('.ls-skip').inert=s.clear===1;
    this.entryFlights=flights;this.layoutDirty=true;
    if(s.done&&allowFinish)this.finishEntry();
  }
  paintFilaments(x,y,s){
    const camera=this.getScene().rig.current;
    this.filaments.forEach(({node,path},i)=>{
      const p=project(node,camera,innerWidth,innerHeight);if(!p||p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight){path.style.opacity='0';return;}
      path.setAttribute('d',`M${x} ${y} C${x} ${y+28},${p.x} ${p.y-30},${p.x} ${p.y}`);
      path.setAttribute('pathLength','1');path.style.strokeDasharray='1';path.style.strokeDashoffset=String(1-phase(s.time,.45+i*.055,1.7+i*.055));
      path.style.opacity=String(.2*s.lock*(1-phase(s.time,2.7,3.5)));
    });
  }
  finishEntry(){
    if(!this.active||!this.gathering||this.returning)return;
    this.openingReveal=!this.reduced();this.gathering=false;this.fade=1;this.connectionPending=true;this.scene.dataset.phase='connecting';this.bridge.dispose();this.ink.clear();
    for(const s of ['.ls-witness','.ls-recognition','.ls-skip'])this.el(s).hidden=true;
    this.el('.ls-filaments').replaceChildren();this.el('.ls-stage').style.transform='none';this.el('.ls-line-label').style.opacity='0';
    for(const s of ['.ls-source','.ls-footer','.ls-heading'])this.el(s).style.opacity='1';this.el('.ls-next').style.opacity='.85';this.setRoomInert(false);
    if(document.activeElement===this.el('.ls-skip'))this.el('[data-action=play]').focus({preventScroll:true});
    this.recording.pause();this.recording.currentTime=0;this.recording.muted=this.userMuted;
    this.seeking=true;this.update(true);this.seeking=false;this.syncMute();this.syncTransport();this.layoutDirty=true;
    this.announce('The original comments are beside the lyrics. The light follows the recording.');
    if(!this.hiddenDuringEntry&&!document.hidden)this.play();else this.status('Connected. Play when you’re ready.');
  }
  lockConnection(){
    if(!this.connectionPending||!this.active||this.gathering||this.returning||document.hidden||!this.playWanted)return;
    this.connectionPending=false;this.connectionAt=this.recording.currentTime;this.scene.dataset.phase='song';this.scene.dataset.connected='true';
    this.radio.connect();this.paintCarrier(this.el('.ls-receiver'),ENTRY.end,1);
    this.el('.ls-signal-state').textContent='';this.el('.ls-receiver').hidden=this.reduced();
  }
  paintConnection(){
    if(this.connectionAt==null)return;
    const age=Math.max(0,this.recording.currentTime-this.connectionAt);
    this.el('.ls-receiver').style.opacity=String(1-phase(age,.15,.75));
    if(age>=.75)this.el('.ls-receiver').hidden=true;
  }
  renderPhrase(index,intro=false){
    const phrase=this.model.phrases[index];if(!phrase)return;
    const lyric=this.el('#ls-lyric'),change=this.current!==index&&this.current>=0&&!intro&&!this.gathering;
    this.lyricTransition?.old.remove();this.lyricTransition=null;this.ink.clear();this.courier.hide();
    if(change&&!this.reduced()&&!this.seeking){
      const old=lyric.cloneNode(true);old.removeAttribute('id');old.removeAttribute('tabindex');old.removeAttribute('aria-label');old.setAttribute('aria-hidden','true');old.classList.add('ls-outgoing');
      old.querySelectorAll('[data-key]').forEach(el=>el.removeAttribute('data-key'));lyric.before(old);
      this.lyricTransition={old,start:this.recording.currentTime,duration:Math.min(.44,Math.max(.12,phrase.start-this.recording.currentTime))};
    }
    lyric.replaceChildren();lyric.style.opacity='1';lyric.style.filter='none';lyric.style.transform='none';
    this.current=index;this.wordEls=new Map();this.beatEls=new Map();this.beats=lyricBeats(phrase.records);
    for(const part of lyricSegments(phrase)){
      if(!part.record){lyric.append(document.createTextNode(part.text));continue;}
      const r=part.record,span=document.createElement('span');span.className='ls-word';span.dataset.key=r.key;
      const letters=this.beats.filter(b=>b.parentKey===r.key);
      if(letters.length){
        span.classList.add('ls-name');let i=0;
        for(const char of part.text){
          if(/\s/.test(char)){span.append(document.createTextNode(char));continue;}
          const letter=document.createElement('span');letter.className='ls-letter';letter.textContent=char;letter.dataset.key=letters[i].key;
          span.append(letter);this.beatEls.set(letters[i++].key,letter);
        }
      }else{span.textContent=part.text;this.beatEls.set(r.key,span);}
      span.dataset.origin=r.origin?'comment':r.word.source==='comment'?'unlocated':'added';span.setAttribute('aria-hidden','true');
      if(r.origin)span.title=`${name(r.origin.comment)}${r.origin.adapted?' · sung adaptation of “'+r.origin.text+'”':''}`;
      lyric.append(span);this.wordEls.set(r.key,span);
    }
    lyric.setAttribute('aria-label',phrase.text);lyric.scrollTop=0;
    this.el('.ls-next').textContent=this.model.phrases[index+1]?.text||'';this.el('.ls-live').textContent=phrase.text;
    const source=phraseSource(this.model.phrases,index,this.openingSourceId);this.renderSource(source.id||this.openingSourceId);
    this.layoutDirty=true;
  }
  renderSource(id){
    const comment=this.model.comments.get(id),phrase=this.model.phrases[this.current],quote=this.el('.ls-source-quote');
    this.sourceTransition?.old.remove();this.sourceTransition=null;quote.style.opacity='1';
    if(this.sourceId&&id!==this.sourceId&&!this.gathering&&!this.seeking&&!this.recording.paused){
      const before=quote.getBoundingClientRect();
      const old=quote.cloneNode(true);old.className='ls-source-shadow';old.removeAttribute('tabindex');old.removeAttribute('aria-label');old.setAttribute('aria-hidden','true');
      old.querySelectorAll('[data-start]').forEach(el=>{el.removeAttribute('data-start');el.removeAttribute('data-end');});
      Object.assign(old.style,{position:'fixed',left:before.left+'px',top:before.top+'px',width:before.width+'px',height:before.height+'px',font:getComputedStyle(quote).font});
      quote.before(old);this.sourceTransition={old,start:this.recording.currentTime,duration:.28};quote.style.opacity='0';
    }
    this.sourceId=comment?id:null;quote.replaceChildren();quote.scrollTop=0;this.el('.ls-author').textContent=comment?name(comment):'';
    if(comment){this.appendSource(quote,comment.text,phrase.records.filter(r=>r.origin?.commentId===id).map(r=>r.origin));quote.setAttribute('aria-label',comment.text);}
    else{quote.textContent='This line brings new words into the melody.';quote.removeAttribute('aria-label');}
    this.el('[data-action=source]').hidden=!comment;
    const tabs=this.el('.ls-source-tabs');tabs.replaceChildren();
    for(const [i,sourceId] of phrase.sourceIds.entries()){
      const b=document.createElement('button');b.type='button';b.textContent=String(i+1).padStart(2,'0');b.setAttribute('aria-label',`Read original comment ${i+1} from ${name(this.model.comments.get(sourceId))}`);b.setAttribute('aria-pressed',String(sourceId===id));
      b.addEventListener('click',()=>{this.pausePlayback();this.manualSource=true;this.renderSource(sourceId);});tabs.append(b);
    }
    tabs.hidden=phrase.sourceIds.length<=1;this.layoutDirty=true;
  }
  measure(){
    this.rects.clear();const rows=[];
    const bounds=this.el('#ls-lyric').getBoundingClientRect();
    for(const [key,el] of this.beatEls){
      const range=document.createRange();range.selectNodeContents(el);const rs=[...range.getClientRects()].filter(r=>r.width>0);
      const r=rs.find(r=>r.top>=Math.max(0,bounds.top)-2&&r.bottom<=Math.min(innerHeight,bounds.bottom)+2);if(!r)continue;
      let row=rows.find(row=>Math.abs(row.top-r.top)<5);if(!row){row={top:r.top,bottom:r.bottom,left:r.left,right:r.right};rows.push(row);}
      row.left=Math.min(row.left,r.left);row.right=Math.max(row.right,r.right);row.bottom=Math.max(row.bottom,r.bottom);
      this.rects.set(key,{x:r.left+r.width/2,y:r.top-8,width:r.width,height:r.height,row});
    }
    rows.sort((a,b)=>a.top-b.top);rows.forEach((row,i)=>{row.ceiling=i?rows[i-1].bottom+4:row.top-55;});
    this.layoutDirty=false;
  }
  update(force=false){
    if(!this.active||this.gathering||this.returning)return;
    const time=this.recording.currentTime||0;
    const index=displayPhrase(this.model.phrases,time);if(index!==this.current){this.manualSource=false;this.renderPhrase(index);}
    const phrase=this.model.phrases[this.current];if(!phrase)return;
    const next=phrase.records.find(r=>r.word.start>time&&r.word.start-time<.68&&r.origin),sung=[...phrase.records].reverse().find(r=>r.word.start<=time&&r.origin);
    const source=next?.origin?.commentId||sung?.origin?.commentId;
    if(source&&source!==this.sourceId&&!this.manualSource)this.renderSource(source);
    if(force)this.layoutDirty=true;
    if(this.layoutDirty)this.measure();
    for(const r of phrase.records){
      const el=this.wordEls.get(r.key);if(!el)continue;
      if(el.classList.contains('ls-name'))el.style.opacity='1';
    }
    for(const beat of this.beats){
      const el=this.beatEls.get(beat.key);if(!el)continue;
      const age=time-beat.word.start,singing=age>=0&&time<beat.word.end;
      el.dataset.singing=String(singing);el.dataset.sung=String(age>=0);el.dataset.landed=String(age>=0&&age<.22);
      el.style.opacity=String(age>=0?1:mix(.62,1,phase(time,beat.word.start-.25,beat.word.start)));
    }
    this.paintConnection();
    const d=this.duration(),seek=this.el('.ls-seek');seek.max=String(d);seek.value=String(clamp(time,0,d));seek.style.setProperty('--ls-progress',clamp(time/d)*100+'%');
    seek.setAttribute('aria-valuetext',`${timeLabel(time)} of ${timeLabel(d)}`);this.el('.ls-time').value=timeLabel(time);this.el('.ls-duration').value=timeLabel(d);
    this.paintLyrics(time);this.paintSource(time);this.syncTransport();
  }
  paintSource(time){
    const transition=this.sourceTransition;if(!transition)return;
    const p=this.reduced()||this.seeking?1:phase(time,transition.start,transition.start+transition.duration);
    transition.old.style.opacity=String(1-p);transition.old.style.filter=`blur(${p*1.5}px)`;
    this.el('.ls-source-quote').style.opacity=String(p);
    if(p>=1){transition.old.remove();this.sourceTransition=null;this.el('.ls-source-quote').style.opacity='1';}
  }
  paintLyrics(time){
    const transition=this.lyricTransition;
    const source=this.el('.ls-source'),intro=this.current<this.previewIndex;
    source.style.opacity=intro?'0':'1';source.inert=intro;source.setAttribute('aria-hidden',String(intro));
    if(this.openingReveal){
      const first=this.model.phrases[0]?.start||.48;
      this.el('#ls-lyric').style.opacity=String(phase(time,Math.max(0,first-.18),first+.12));
      if(time>=first+.12)this.openingReveal=false;
    }
    if(!transition)return;
    const p=this.reduced()||this.seeking?1:clamp((time-transition.start)/transition.duration);
    transition.old.style.opacity=String(1-ease(p));transition.old.style.filter=`blur(${ease(p)*2}px)`;
    const lyric=this.el('#ls-lyric');lyric.style.opacity=String(ease(p));
    if(p>=1){transition.old.remove();this.lyricTransition=null;lyric.style.opacity='1';}
  }
  beforeRender(camera){
    const now=performance.now();
    if(!this.active){if(!this.radar.hidden&&(!this.lastIdle||now-this.lastIdle>40)){this.paintCarrier(this.radar,this.reduced()?0:now/1000,0);this.lastIdle=now;}return;}
    const dt=this.lastFrame?clamp((now-this.lastFrame)/1000,0,.08):0;this.lastFrame=now;
    if(document.hidden)return;
    const {renderer}=this.getScene();if(!renderer||renderer.lost||renderer!==this.rendererRef){this.close({immediate:true});return;}
    if(this.returning){
      this.exitElapsed+=dt;const p=this.reduced()?1:clamp(this.exitElapsed/1.25);renderer.performanceMix=this.exitStartMix*(1-ease(p));
      this.el('.ls-room').style.opacity=String(1-phase(p,0,.5));this.el('.ls-footer').style.opacity=String(1-phase(p,0,.35));this.el('.ls-heading').style.opacity=String(1-phase(p,0,.4));
      this.el('.ls-witness').style.opacity=String((this.exitWitnessOpacity||0)*(1-phase(p,0,.3)));
      this.bridgeFrame={fade:this.exitStartMix*(1-ease(p)),gather:1-ease(p),destination:this.exitRect,dissolve:(this.exitDissolve??1)*(1-phase(p,0,.3))};
      if(p>=1)this.finalizeClose();return;
    }
    if(this.gathering){this.elapsed+=dt;this.entryFrame();renderer.performanceMix=this.fade;}
    else{renderer.performanceMix=1;this.update();}
  }
  afterRender(camera){
    if(!this.active||document.hidden)return;
    if(this.gathering||this.returning){this.bridge.render(camera,this.bridgeFrame||{});this.courier.hide();this.ink.paint(this.returning?[]:this.entryFlights||[],this.reduced());}
    else if(this.el('.ls-drawer').hidden){this.ink.clear();this.courier.draw(pulseCue(this.beats||[],this.rects,this.recording.currentTime||0),{reduced:this.reduced()});}
    else{this.ink.clear();this.courier.hide();}
  }
  async play(){
    if(!this.active||this.gathering||this.returning||!this.el('.ls-drawer').hidden)return;
    if(this.playPending)return this.playPending;
    const token=this.generation, request=(this.playRequest||0)+1;this.playRequest=request;this.playWanted=true;
    this.manualSource=false;this.el('.ls-error').hidden=true;
    const valid=()=>token===this.generation&&request===this.playRequest&&this.playWanted&&this.active&&!this.returning&&!document.hidden&&this.el('.ls-drawer').hidden;
    const run=async()=>{
      try{
        if(this.recording.ended)this.recording.currentTime=0;
        if(this.mediaGraph){await this.score.context?.resume?.();if(!valid())return;this.score.setMediaLevel(.82,.008);}
        if(!valid())return;
        this.recording.muted=this.userMuted;await this.recording.play();
        if(valid()){this.lockConnection();this.status('');}else if(!this.active||!this.playWanted)this.recording.pause();
      }catch(e){if(token===this.generation&&request===this.playRequest&&e.name!=='AbortError')this.fail(e.name==='NotAllowedError'?'Press play to connect the recording.':'The recording is unavailable. Every lyric and original comment is still here.');}
      finally{if(token===this.generation&&request===this.playRequest){this.playPending=null;this.syncTransport();}}
    };
    this.playPending=run();return this.playPending;
  }
  pausePlayback(message=''){
    this.playRequest=(this.playRequest||0)+1;this.playWanted=false;this.playPending=null;this.recording.pause();if(this.connectionPending)this.radio.stop();
    if(message)this.status(message);this.syncTransport();
  }
  toggle(){if(this.gathering||this.returning)return;if(this.recording.paused&&!this.playWanted)this.play();else this.pausePlayback('Paused. The words can wait.');}
  seek(time){if(!this.active||this.gathering||this.returning)return;this.openingReveal=false;this.seeking=true;this.manualSource=false;this.ink.clear();this.courier.hide();this.lyricTransition?.old.remove();this.lyricTransition=null;this.el('#ls-lyric').style.opacity='1';this.recording.currentTime=clamp(time,0,this.duration());this.update(true);this.seeking=false;}
  mute(){this.userMuted=!this.userMuted;this.radio.mute(this.userMuted);if(!this.gathering)this.recording.muted=this.userMuted;this.syncMute();}
  syncMute(){const b=this.el('.ls-mute');b.setAttribute('aria-pressed',String(this.userMuted));b.setAttribute('aria-label',this.userMuted?'Unmute song':'Mute song');b.querySelector('span').textContent=this.userMuted?'sound off':'sound on';}
  syncTransport(){
    const playing=!this.recording.paused&&!this.recording.ended&&!this.gathering&&!this.returning;this.scene.dataset.playing=String(playing);
    this.el('[data-action=play]').setAttribute('aria-label',playing?'Pause song':this.recording.ended?'Replay song':'Play song');
    for(const s of ['[data-action=play]','[data-action=restart]','[data-action=lyrics]','.ls-seek'])this.el(s).disabled=!!(this.gathering||this.returning);
  }
  fail(message){this.radio.stop();this.pausePlayback();this.status('The words are still here.');this.el('.ls-error').hidden=false;this.el('.ls-error').textContent=message;this.syncTransport();}
  showDrawer(kind){
    if(!this.active||this.gathering||this.returning)return;
    this.pausePlayback();this.ink.clear();this.courier.hide();this.drawerFocus=document.activeElement;
    const content=this.el('.ls-drawer-content');content.replaceChildren();this.el('.ls-drawer').hidden=false;this.setRoomInert(true);this.el('.ls-header').inert=true;
    this.el('#ls-drawer-title').textContent=kind==='lyrics'?'Every word, in order.':'Where the words began.';
    if(kind==='lyrics')for(const p of this.model.phrases){
      const b=document.createElement('button');b.className='ls-transcript-line';b.type='button';const t=document.createElement('small'),text=document.createElement('span');t.textContent=timeLabel(p.start);text.textContent=p.text;b.append(t,text);
      b.addEventListener('click',()=>{this.hideDrawer();this.seek(p.start);this.play();});content.append(b);
    }else{
      const note=document.createElement('p');note.className='ls-drawer-note';note.textContent='Original comments, unchanged. Underlined words have verified source ranges. Italic words were added to the song. Adapted spellings retain their original source here.';content.append(note);
      for(const id of [...new Set([this.sourceId,...this.model.sources.map(c=>c.id)])]){
        const c=this.model.comments.get(id);if(!c)continue;const fig=document.createElement('figure'),quote=document.createElement('blockquote'),caption=document.createElement('figcaption');quote.textContent=c.text;quote.dir='auto';caption.textContent=name(c);fig.append(quote,caption);
        try{const url=new URL(c.commentUrl||c.postUrl);if(['https:','http:'].includes(url.protocol)){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View original ↗';fig.append(a);}}catch{}
        content.append(fig);
      }
      if(this.model.warnings.length){const p=document.createElement('p');p.className='ls-drawer-note';p.textContent=`${this.model.warnings.length} source or timing entries could not be aligned exactly. Their text remains readable; no source flights are invented.`;content.append(p);}
    }
    this.el('[data-action=drawer-close]').focus({preventScroll:true});
  }
  hideDrawer(){this.el('.ls-drawer').hidden=true;this.el('.ls-header').inert=false;this.setRoomInert(this.gathering||this.returning);if(this.drawerFocus?.isConnected)this.drawerFocus.focus({preventScroll:true});this.drawerFocus=null;this.layoutDirty=true;}
  keydown(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!this.el('.ls-drawer').hidden)this.hideDrawer();else this.close();return;}
    if(e.key==='Tab'){
      const host=this.el('.ls-drawer').hidden?this.scene:this.el('.ls-drawer'),items=[...host.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'));
      const first=items[0],last=items.at(-1),focused=document.activeElement;
      if(e.shiftKey&&(focused===first||!items.includes(focused))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(focused===last||!items.includes(focused))){e.preventDefault();first?.focus();}return;
    }
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
    if(e.key.toLowerCase()==='m'){e.preventDefault();this.mute();}else if(e.key===' '&&!e.target.closest('button,a')){e.preventDefault();this.toggle();}
  }
  close({immediate=false,restoreFocus=true}={}){
    if(!this.active||(this.returning&&!immediate))return;
    const wasGathering=this.gathering;
    this.exitWitnessOpacity=wasGathering?Number(this.el('.ls-witness').style.opacity)||0:0;
    const originalFrame=this.bridgeFrame;
    ++this.generation;this.radio.stop();this.pausePlayback();this.restoreFocus=restoreFocus;this.score?.setMediaLevel(0,.15);this.ink.clear();this.courier.hide();
    this.exitStartMix=this.fade;this.exitElapsed=0;this.returning=true;this.gathering=false;this.scene.dataset.phase='returning';
    for(const s of ['.ls-drawer','.ls-skip','.ls-receiver','.ls-recognition'])this.el(s).hidden=true;
    this.el('.ls-filaments').replaceChildren();this.el('.ls-header').inert=false;this.setRoomInert(true);this.syncTransport();
    const {renderer}=this.getScene(),n=this.nodes?.get(this.sourceId)||this.hero;
    this.exitRect=this.el('.ls-source').style.opacity==='1'?center(this.el('.ls-source-quote').getBoundingClientRect()):this.witnessRect();
    this.exitDissolve=1;
    if(wasGathering&&this.exitWitnessOpacity>.02){
      this.exitRect=center(this.el('.ls-witness blockquote').getBoundingClientRect());
    }else if(wasGathering&&n){
      const origin=project(n,this.getScene().rig.current,innerWidth,innerHeight);
      if(origin){const a={x:origin.x,y:origin.y,width:n.w*origin.scale,height:n.h*origin.scale},b=originalFrame?.destination||a,e=ease(originalFrame?.gather||0);this.exitRect=rectMix(a,b,e);this.exitRect.y-=Math.sin(Math.PI*e)*Math.min(44,innerHeight*.05);}
      this.exitDissolve=originalFrame?.dissolve||0;
    }
    if(!immediate&&!this.reduced()&&renderer&&!renderer.lost)this.bridge.prepare(renderer,this.model.sources.map(c=>this.nodes.get(c.id)).filter(Boolean),n?.comment.id);
    if(immediate||this.reduced())this.finalizeClose();
  }
  finalizeClose(){
    const {renderer,rig}=this.getScene();if(renderer)renderer.performanceMix=0;
    if(this.savedCamera){rig.interrupt();rig.current={...this.savedCamera};rig.target={...this.savedCamera};}
    this.bridge.dispose();this.ink.clear();this.courier.hide();this.sourceTransition?.old.remove();this.sourceTransition=null;this.el('.ls-source-quote').style.opacity='1';this.lyricTransition?.old.remove();this.lyricTransition=null;
    this.recording.pause();this.recording.currentTime=0;this.score?.releaseMedia();
    this.active=false;this.gathering=false;this.returning=false;this.scene.hidden=true;this.scene.dataset.phase='idle';delete document.body.dataset.starlight;
    this.el('.ls-room').style.opacity='1';const app=document.querySelector('#app');if(app)app.inert=this.previousInert;
    this.onClose?.();this.syncRadar();
    if(this.restoreFocus){const target=this.previousFocus?.isConnected&&!this.previousFocus.hidden?this.previousFocus:!this.radar.hidden?this.radar:document.querySelector('#universe');target?.focus({preventScroll:true});}
    this.announce('Back in the same sky, exactly where you left it.');
  }
  snapshot(){return {available:this.compatible,active:this.active,gathering:!!this.gathering,returning:!!this.returning,phase:this.scene.dataset.phase||'idle',time:this.recording.currentTime,duration:this.duration(),paused:this.recording.paused,muted:this.userMuted,phrase:this.current,phrases:this.model.phrases.length,sourceComments:this.model.sources.length,sourceFragments:this.bridge.items.length,warnings:this.model.warnings.length,mediaGraph:this.mediaGraph,radioActive:this.radio.active===true,connected:this.scene.dataset.connected==='true',version:'lost-signal-2.1.0'};}
  dispose(){this.close({immediate:true,restoreFocus:false});this.controller.abort();this.observer.disconnect();this.bridge.dispose();this.ink.dispose();this.courier.dispose();this.recording.removeAttribute('src');this.recording.load();this.scene.remove();this.radar.remove();}
}
