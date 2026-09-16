import { LyricField } from './lyric-field.js';
import { exactSource, validateSong, phraseIndex, timeLabel, clamp, smooth } from './lyric-geometry.js';

const $=s=>document.querySelector(s);
const glyph=name=>`<svg aria-hidden="true"><use href="#glyph-${name}"/></svg>`;
const radioDrawing=`<svg viewBox="0 0 80 80" aria-hidden="true"><path class="signal-thread" d="M12 58 27 44 40 40 60 23"/><circle class="signal-satellite" cx="12" cy="58" r="1.2"/><circle class="signal-satellite" cx="60" cy="23" r="1.4"/><path class="signal-wave wave-one" d="M30 25a18 18 0 0 1 24 24"/><path class="signal-wave wave-two" d="M25 17a28 28 0 0 1 38 38"/><path class="signal-core" d="M40 28c0 9-3 12-12 12 9 0 12 3 12 12 0-9 3-12 12-12-9 0-12-3-12-12Z"/></svg>`;
const transportDrawing=`<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="play-orbit" cx="32" cy="32" r="27"/><circle id="song-progress-ring" cx="32" cy="32" r="27" pathLength="1"/><path class="play-mark" d="m28 23 13 9-13 9Z"/><path class="pause-mark" d="M28 24v16M37 24v16"/></svg>`;
function belongs(song,comments){
  if(!validateSong(song)||!song.commentsById)return false;
  const map=new Map(comments.map(c=>[c.id,c.text])),entries=Object.entries(song.commentsById);
  return entries.length>0&&entries.every(([id,c])=>map.get(id)===c.text);
}
const clean=t=>t.normalize('NFC').replace(/\s+/gu,' ').trim();

/** A performance IN the current world, not a replacement page.
 * The recording clock owns every sung word. The sky owns the source pixels. */
export class SongExperience {
  constructor({reduced,projectComment,getScene,score,onOpen,onClose,announce}){
    Object.assign(this,{reduced,projectComment,getScene,score,onOpen,onClose,announce});
    this.active=false;this.ready=false;this.compatible=false;this.generation=0;this.rows=[];this.records=[];this.comments=[];
    this.userMuted=false;this.follow=true;this.energy=0;this.lastDOM=0;this.lastFrame=0;this.gather=0;this.returnProgress=0;
    this.recording=new Audio();this.recording.preload='metadata';this.recording.volume=1;
    this.field=new LyricField(getScene);
    this.radar=document.createElement('button');this.radar.id='song-radar';this.radar.className='song-radar control';this.radar.hidden=true;
    this.radar.setAttribute('aria-label','Listen to Khushti, a song made from these words');
    this.radar.innerHTML=radioDrawing+'<span class="song-signal-label">a song lives here</span>';
    this.tether=document.createElementNS('http://www.w3.org/2000/svg','svg');this.tether.classList.add('song-signal-tether');this.tether.setAttribute('aria-hidden','true');this.tether.style.display='none';
    this.tetherPath=document.createElementNS(this.tether.namespaceURI,'path');this.tether.append(this.tetherPath);$('#app').append(this.tether,this.radar);
    this.scene=document.createElement('section');this.scene.id='song-scene';this.scene.hidden=true;this.scene.tabIndex=-1;
    this.scene.setAttribute('role','dialog');this.scene.setAttribute('aria-modal','true');this.scene.setAttribute('aria-labelledby','song-title');
    this.scene.innerHTML=`<div class="song-aureole" aria-hidden="true"></div>
      <header class="song-header"><button id="song-close" class="control" aria-label="Return these words to the sky">${glyph('back')}<span class="song-back-label">the same sky</span></button>
      <div class="song-heading"><span class="song-kicker">a little of you, in every note</span><h1 id="song-title">Khushti</h1></div>
      <button id="song-mute" class="control song-mute" aria-label="Mute song" aria-pressed="false"><span class="song-sound-star" aria-hidden="true">✧</span><span class="song-mute-label">sound on</span></button></header>
      <div id="song-scroll" class="song-scroll" tabindex="0" aria-label="Song lyrics. Scroll to explore; the follow control returns to the sung line."><div id="song-lines" class="song-lines"></div></div>
      <button id="song-follow" class="song-follow" hidden>follow the song <span aria-hidden="true">↓</span></button>
      <footer class="song-footer"><p id="song-status" class="song-status" role="status">The words remember their melody.</p>
      <div class="song-transport"><button id="song-restart" class="song-small" aria-label="Replay the song from its beginning">again</button>
      <output id="song-time" aria-hidden="true">0:00</output><button id="song-play" class="song-play control" aria-label="Play song" disabled>${transportDrawing}</button>
      <output id="song-duration" aria-hidden="true">0:00</output><button id="song-origins" class="song-small" aria-expanded="false" aria-controls="song-sources">the words</button></div>
      <div class="song-timeline"><div id="song-timeline-stars" aria-hidden="true"></div><input id="song-seek" type="range" min="0" max="1" value="0" step="0.01" aria-label="Song position" disabled></div>
      <p id="song-error" role="alert" hidden></p></footer>
      <p id="song-announcement" class="sr-only" aria-live="polite"></p><aside id="song-sources" hidden aria-label="Original comments used in this song"><button id="song-sources-close" class="control" aria-label="Close the original words">${glyph('close')}</button><h2>Where the words began.</h2><p class="song-origin-note">The lit words came from these original comments. The softer italic words were added to the song. Where the song uses a different spelling or script, the original arrives first and the sung spelling takes over.</p><div id="song-source-list"></div></aside>`;
    document.body.append(this.scene);this.scroll=$('#song-scroll');
    this.radar.addEventListener('click',()=>this.open());$('#song-close').addEventListener('click',()=>this.close());
    $('#song-play').addEventListener('click',()=>this.toggle());$('#song-mute').addEventListener('click',()=>this.mute());
    $('#song-restart').addEventListener('click',()=>{if(this.gathering||this.returning)return;this.recording.currentTime=0;this.follow=true;this.update(true);this.play();});
    $('#song-seek').addEventListener('input',e=>{const duration=this.duration();this.recording.currentTime=clamp(Number(e.target.value),0,duration);this.follow=true;this.update(true);});
    $('#song-follow').addEventListener('click',()=>{this.follow=true;$('#song-follow').hidden=true;this.center(this.current,true);});
    for(const type of ['wheel','touchstart','pointerdown'])this.scroll.addEventListener(type,()=>{if(!this.gathering&&!this.returning){this.follow=false;$('#song-follow').hidden=false;}},{passive:true});
    this.scroll.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(e.key)){this.follow=false;$('#song-follow').hidden=false;}});
    $('#song-origins').addEventListener('click',()=>this.showSources(true));$('#song-sources-close').addEventListener('click',()=>this.showSources(false));
    this.scene.addEventListener('keydown',e=>this.keydown(e));
    for(const type of ['timeupdate','seeked','loadedmetadata'])this.recording.addEventListener(type,()=>this.update(type==='seeked'));
    this.recording.addEventListener('play',()=>this.syncTransport());this.recording.addEventListener('pause',()=>this.syncTransport());
    this.recording.addEventListener('ended',()=>{this.update();this.syncTransport();this.status('The song ends. The words stay.');});
    this.recording.addEventListener('error',()=>{if(this.active&&!this.returning)this.fail('The recording could not load. The original words are still here.');});
    this.recording.addEventListener('waiting',()=>{if(this.active&&!this.gathering&&!this.returning)this.status('The recording is catching up…');});
    this.recording.addEventListener('playing',()=>{if(this.active&&!this.gathering&&!this.returning)this.status('Their words. Your melody.');});
    document.addEventListener('visibilitychange',()=>{this.lastFrame=0;if(document.hidden&&this.active){this.hiddenDuringEntry=true;this.recording.pause();if(!this.gathering)this.status('Paused. Come back when you’re ready.');}});
    window.addEventListener('pagehide',()=>this.close({immediate:true,restoreFocus:false}));
    window.addEventListener('resize',()=>{this.field.needsMeasure=true;this.positionSignal(true);});
    this.loaded=this.load();
  }
  async load(){
    try{
      if(globalThis.HAPPYCOUD_SONG)this.song=globalThis.HAPPYCOUD_SONG;
      else{if(location.protocol==='file:')return;const r=await fetch('./data/song.json');if(!r.ok)return;this.song=await r.json();}
      this.recording.src=globalThis.HAPPYCOUD_SONG_AUDIO||'./media/khushti.mp3';this.setCollection(this.comments);
    }catch{/* Optional private assets never prevent exploring the sky. */}
  }
  setCollection(comments){if(this.active)this.close({immediate:true});this.comments=comments;this.anchor=null;this.compatible=belongs(this.song,comments);this.syncRadar();}
  setReady(value){if(value===this.ready)return;this.ready=value;this.syncRadar();}
  syncRadar(){const show=this.ready&&this.compatible&&!this.active;const changed=this.radar.hidden===show;this.radar.hidden=!show;this.tether.style.display=show?'block':'none';if(show&&changed)this.positionSignal(true);}
  positionSignal(force=false){
    if(this.radar.hidden)return;
    if(!force&&(this.radar.matches(':hover')||document.activeElement===this.radar))return;
    const ids=Object.keys(this.song?.commentsById||{}),points=ids.map(id=>({id,p:this.projectComment(id)})).filter(({p})=>p&&p.x>90&&p.x<innerWidth-130&&p.y>130&&p.y<innerHeight-170);
    let chosen=points.find(p=>p.id===this.anchor);if(!chosen)chosen=points.sort((a,b)=>Math.hypot(a.p.x-innerWidth*.64,a.p.y-innerHeight*.58)-Math.hypot(b.p.x-innerWidth*.64,b.p.y-innerHeight*.58))[0];
    if(chosen){this.anchor=chosen.id;this.radar.style.left=clamp(chosen.p.x+48,50,innerWidth-150)+'px';this.radar.style.top=clamp(chosen.p.y+45,110,innerHeight-170)+'px';this.radar.dataset.docked='false';this.tether.style.display='block';this.tether.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);const x=parseFloat(this.radar.style.left)+40,y=parseFloat(this.radar.style.top)+40;this.tetherPath.setAttribute('d',`M${chosen.p.x} ${chosen.p.y+9} C${chosen.p.x+35} ${chosen.p.y+12},${x-42} ${y-15},${x} ${y}`);}
    else{this.radar.style.left=Math.max(48,innerWidth*.5-40)+'px';this.radar.style.top=(innerHeight-145)+'px';this.radar.dataset.docked='true';this.tether.style.display='none';}
  }
  announceHere(text){$('#song-announcement').textContent=text;}
  status(text){if($('#song-status').textContent!==text)$('#song-status').textContent=text;}
  duration(){const d=this.recording.duration;return Number.isFinite(d)&&d>0?d:Number(this.song?.duration)||Math.max(1,...(this.song?.phrases||[]).flatMap(p=>p.words.map(w=>w.end)));}
  render(){
    const nodes=new Map(this.getScene().layout.nodes.map(n=>[n.comment.id,n]));this.rows=[];this.records=[];
    const fragment=document.createDocumentFragment(),measure=document.createElement('canvas').getContext('2d');measure.font='100px Georgia, "Times New Roman", serif';
    for(const [i,phrase] of this.song.phrases.entries()){
      const row=document.createElement('p');row.className='song-line';row.dataset.phrase=i;row.setAttribute('aria-label',phrase.text);
      const words=[];
      for(const word of phrase.words){
        const source=exactSource(word,nodes),adapted=!!source&&clean(source.text)!==clean(word.text),el=document.createElement('span');
        el.className='song-word '+(source?'source-glyph':word.source==='comment'?'unlocated-word':'added-word');el.dataset.state='waiting';el.setAttribute('aria-hidden','true');
        if(adapted)el.classList.add('adapted-word');const ink=document.createElement('span');ink.className='lyric-ink';ink.textContent=word.text;el.append(ink);
        if(source){const sourceWidth=measure.measureText(source.text.replace(/\s+/gu,' ')).width/100,lyricWidth=measure.measureText(word.text).width/100;el.style.width=(Math.max(sourceWidth,lyricWidth)+.1)+'em';}
        row.append(el,document.createTextNode(' '));const record={source,adapted,word,el,phrase,phraseIndex:i};this.records.push(record);words.push(record);
      }
      fragment.append(row);this.rows.push({row,words,phrase});
    }
    $('#song-lines').replaceChildren(fragment);this.scroll.scrollTop=0;this.current=-2;this.follow=true;$('#song-follow').hidden=true;
    const sources=document.createDocumentFragment();
    for(const [id] of Object.entries(this.song.commentsById)){
      const comment=this.comments.find(c=>c.id===id);if(!comment)continue;
      const figure=document.createElement('figure'),quote=document.createElement('blockquote'),caption=document.createElement('figcaption');quote.textContent=comment.text;quote.dir='auto';caption.textContent=comment.author?'@'+comment.author.replace(/^@/,''):'From this sky';figure.append(quote,caption);sources.append(figure);
    }
    $('#song-source-list').replaceChildren(sources);
    const unlocated=this.records.filter(r=>r.word.source==='comment'&&!r.source).length;
    if(unlocated){const note=document.createElement('p');note.className='song-origin-note';note.textContent=`${unlocated} lyric words have no usable exact source range. They appear when sung; they are not shown flying from an invented source.`;$('#song-source-list').prepend(note);}
    const timeline=document.createDocumentFragment(),duration=this.duration();for(const p of this.song.phrases){const dot=document.createElement('i');dot.style.left=clamp(p.start/duration*100,0,100)+'%';timeline.append(dot);}$('#song-timeline-stars').replaceChildren(timeline);
  }
  open(){
    if(this.active||!this.ready||!this.compatible)return;
    const token=++this.generation;this.active=true;this.gathering=true;this.returning=false;this.gather=0;this.energy=0;this.lastFrame=0;this.hiddenDuringEntry=document.hidden;this.gesturePlay=false;this.mediaGraph=false;
    this.previousFocus=document.activeElement;this.syncRadar();this.onOpen?.();this.render();this.scene.hidden=false;this.scene.dataset.state='gathering';document.body.dataset.song='on';$('#app').inert=true;
    $('#song-error').hidden=true;this.showSources(false,false);this.status('The words remember their melody.');$('#song-close').focus({preventScroll:true});
    this.recording.pause();this.recording.currentTime=0;this.recording.muted=true;
    try{this.score?.attachMedia(this.recording);this.mediaGraph=!!this.score?.media;this.score?.setMediaLevel(0,.01);}catch{/* HTML media playback remains available without Web Audio. */}
    // Unlock only inside the actual click, in silence. Do not wait indefinitely
    // for an unresponsive network before exposing usable controls.
    this.recording.play().then(()=>{
      if(token!==this.generation)return;this.gesturePlay=true;
      if(this.gathering){this.recording.pause();this.recording.currentTime=0;}
    }).catch(()=>{});
    this.field.prepare(this.records,this.scroll);this.syncTransport();this.syncMute();
    if(this.reduced()){this.gather=1;this.finishGather(token);}
  }
  finishGather(token=this.generation){
    if(token!==this.generation||!this.active||!this.gathering||this.returning)return;
    this.gathering=false;this.gather=1;this.scene.dataset.state='ready';this.recording.pause();this.recording.currentTime=0;this.recording.muted=this.userMuted;
    this.syncMute();this.update(true);this.syncTransport();
    this.announceHere('These are the song’s original source words. The song follows the recording.');
    if(document.hidden||this.hiddenDuringEntry){this.status('Ready. Play when you’re here.');return;}this.play();
  }
  async play(){
    if(!this.active||this.gathering||this.returning)return;
    const token=this.generation;$('#song-error').hidden=true;
    if(this.recording.ended)this.recording.currentTime=0;
    try{if(this.mediaGraph){await this.score.context.resume?.();this.score.setMediaLevel(.82,.06);}
      this.recording.muted=this.userMuted;await this.recording.play();
      if(token!==this.generation)return;this.status('Their words. Your melody.');
    }catch(error){if(token===this.generation&&error.name!=='AbortError')this.fail(error.name==='NotAllowedError'?'Touch the play star to start the recording.':'The recording could not play. Try the play star again.');}
    this.syncTransport();
  }
  toggle(){if(this.gathering||this.returning)return;if(this.recording.paused)this.play();else{this.recording.pause();this.status('Paused. Stay a little.');}}
  mute(){this.userMuted=!this.userMuted;if(!this.gathering)this.recording.muted=this.userMuted;this.syncMute();}
  syncMute(){$('#song-mute').setAttribute('aria-pressed',String(this.userMuted));$('#song-mute').setAttribute('aria-label',this.userMuted?'Unmute song':'Mute song');$('.song-mute-label').textContent=this.userMuted?'sound off':'sound on';}
  syncTransport(){
    const playing=!this.recording.paused&&!this.recording.ended&&!this.gathering&&!this.returning;this.scene.dataset.playing=String(playing);
    $('#song-play').setAttribute('aria-label',playing?'Pause song':this.recording.ended?'Replay song':'Play song');
    for(const id of ['song-play','song-seek','song-restart'])$('#'+id).disabled=!!(this.gathering||this.returning);
  }
  fail(message){this.recording.pause();$('#song-error').textContent=message;$('#song-error').hidden=false;this.status('The words are still here.');this.syncTransport();}
  center(index,immediate=false){
    const row=this.rows[Math.max(0,index)]?.row;if(!row)return;
    const top=this.scroll.scrollTop+row.getBoundingClientRect().top-this.scroll.getBoundingClientRect().top-this.scroll.clientHeight*.42+row.offsetHeight*.5;
    this.scroll.scrollTo({top:Math.max(0,top),behavior:immediate||this.reduced()?'instant':'smooth'});
  }
  update(force=false){
    if(!this.active||this.gathering||this.returning)return;
    const time=this.recording.currentTime,duration=this.duration();$('#song-seek').max=duration;$('#song-seek').value=time;
    $('#song-seek').setAttribute('aria-valuetext',`${timeLabel(time)} of ${timeLabel(duration)}`);$('#song-time').value=timeLabel(time);$('#song-duration').value=timeLabel(duration);
    $('#song-progress-ring').style.strokeDashoffset=String(1-clamp(time/duration));$('.song-timeline').style.setProperty('--song-progress',clamp(time/duration)*100+'%');
    const current=Math.max(0,phraseIndex(this.song.phrases,time));
    if(force||current!==this.current){this.current=current;this.rows.forEach(({row},i)=>{row.classList.toggle('is-current',i===current);row.classList.toggle('is-past',i<current);if(i===current)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});if(this.follow)this.center(current,force);this.announceHere(this.rows[current]?.phrase.text||'');}
    for(const r of this.records){const state=time<r.word.start?'waiting':time<r.word.end?'singing':'sung';if(r.el.dataset.state!==state)r.el.dataset.state=state;}
    this.field.needsMeasure||=force;
  }
  /** Called by the sky's own render loop, before and after its native draw. */
  beforeRender(camera){
    const now=performance.now(),dt=this.lastFrame?Math.min(.08,(now-this.lastFrame)/1000):0;this.lastFrame=now;
    if(!this.active){if(!this.lastSignal||now-this.lastSignal>30){this.positionSignal();this.lastSignal=now;}return;}
    const {renderer}=this.getScene();
    if(renderer!==this.field.renderer||renderer.lost){this.close({immediate:true});return;}
    if(this.returning){this.returnProgress=this.reduced()?1:Math.min(1,this.returnProgress+dt/1.7);renderer.performanceMix=1-smooth((this.returnProgress-.72)/.28);if(this.returnProgress>=1){this.finalizeClose();return;}}
    else if(this.gathering){this.gather=this.reduced()?1:Math.min(1,this.gather+dt/3.6);renderer.performanceMix=smooth(this.gather/.18);if(this.gather>=1)this.finishGather();}
    else renderer.performanceMix=1;
    const level=!this.recording.paused&&!this.userMuted&&!this.gathering&&!this.returning?(this.score?.mediaEnergy()||0):0;
    this.energy+=(level-this.energy)*(1-Math.exp(-dt*4));this.scene.style.setProperty('--song-energy',this.reduced()?0:this.energy);
    if(now-this.lastDOM>45){this.update();this.lastDOM=now;}
  }
  afterRender(camera){if(this.active)this.field.render(camera,{gather:this.gather,returning:this.returning,returnProgress:this.returnProgress,time:this.recording.currentTime,current:Math.max(0,this.current),energy:this.energy,reduced:this.reduced()});}
  showSources(show,focus=true){$('#song-sources').hidden=!show;$('#song-origins').setAttribute('aria-expanded',String(show));this.scene.dataset.origins=show?'open':'closed';if(show){this.recording.pause();this.syncTransport();this.status('The original words, unchanged.');}if(focus)$(show?'#song-sources-close':'#song-origins').focus({preventScroll:true});}
  keydown(e){
    if(e.key==='Tab'){
      const items=[...this.scene.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(x=>x.getClientRects().length&&!x.closest('[hidden]'));
      const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||!this.scene.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;
    }
    if(e.key==='Escape'){e.preventDefault();if(!$('#song-sources').hidden)this.showSources(false);else this.close();}
    else if(e.key.toLowerCase()==='m'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();this.mute();}
    else if(e.key===' '&&!e.target.closest('button,input,a')){e.preventDefault();this.toggle();}
  }
  close({immediate=false,restoreFocus=true}={}){
    if(!this.active)return;
    if(this.returning&&!immediate)return;
    ++this.generation;this.restoreFocus=restoreFocus;this.returning=true;this.gathering=false;this.returnProgress=0;this.field.beginReturn();this.scene.dataset.state='returning';this.status('Every word finds its way home.');
    this.score?.setMediaLevel(0,.08);this.recording.pause();this.syncTransport();
    if(immediate||this.reduced())this.finalizeClose();
  }
  finalizeClose(){
    const renderer=this.getScene().renderer;if(renderer)renderer.performanceMix=0;
    this.field.dispose();this.recording.pause();this.recording.currentTime=0;this.score?.releaseMedia();this.active=false;this.gathering=false;this.returning=false;this.scene.hidden=true;delete document.body.dataset.song;$('#app').inert=false;
    this.onClose?.();this.syncRadar();if(this.restoreFocus!==false){const target=!this.radar.hidden?this.radar:$('#beacon')||$('#universe');target?.focus({preventScroll:true});}this.announce?.('Back in the same sky.');
  }
  snapshot(){return {available:this.compatible,active:this.active,gathering:this.gathering,returning:this.returning,time:this.recording.currentTime,duration:this.duration(),paused:this.recording.paused,muted:this.userMuted,phrase:this.current,phrases:this.rows.length,sourceFragments:this.field.fragments.length,follow:this.follow,mediaGraph:this.mediaGraph};}
}
