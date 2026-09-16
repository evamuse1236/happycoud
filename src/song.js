import { phraseAt, wordState, clockLabel, belongsToCollection } from './song-timeline.js';

const $=s=>document.querySelector(s);
const icon=name=>`<svg aria-hidden="true"><use href="#glyph-${name}"/></svg>`;

export class SongExperience {
  constructor({reduced,projectComment,onOpen,onClose,announce}){
    Object.assign(this,{reduced,projectComment,onOpen,onClose,announce});
    this.active=false;this.ready=false;this.compatible=false;this.generation=0;this.rows=[];this.animations=[];
    this.recording=new Audio();this.recording.preload='metadata';this.recording.volume=.85;
    this.radar=document.createElement('button');this.radar.id='song-radar';this.radar.className='song-radar control';this.radar.hidden=true;
    this.radar.setAttribute('aria-label','Gather the comments and play Khushti');
    this.radar.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="6"/><path class="radar-sweep" d="M16 16 24.5 7.5"/><circle class="radar-blip" cx="11" cy="11" r="1.6"/></svg><span class="tip">A song is hiding here</span>';
    $('#app').append(this.radar);
    this.scene=document.createElement('section');this.scene.id='song-scene';this.scene.hidden=true;this.scene.setAttribute('aria-label','Khushti, a song made from these comments');
    this.scene.innerHTML=`<header class="song-header"><button id="song-close" class="control" aria-label="Return to the clouds">${icon('back')}<span>Back to the clouds</span></button><div class="song-heading"><h1>Khushti</h1><p id="song-status" role="status">Gathering the words…</p></div><button id="song-mute" class="text-control" aria-label="Mute song" aria-pressed="false">Sound on</button></header>
      <div id="song-scroll" class="song-scroll" tabindex="0" aria-label="Comments in song order"><div id="song-lines" class="song-lines"></div></div>
      <footer class="song-footer"><p class="song-key"><span>Words from the clouds</span><span>Words added to the song</span></p><div class="song-transport"><button id="song-play" class="control" aria-label="Pause song" disabled>${icon('pause')}</button><output id="song-time">0:00</output><input id="song-seek" type="range" min="0" max="1" value="0" step="0.01" aria-label="Song position" disabled><output id="song-duration">0:00</output><button id="song-restart" class="text-control" disabled>Replay</button></div><p id="song-error" role="alert" hidden></p></footer>`;
    document.body.append(this.scene);
    this.radar.addEventListener('click',()=>this.open());
    $('#song-close').addEventListener('click',()=>this.close());
    $('#song-play').addEventListener('click',()=>this.toggle());
    $('#song-restart').addEventListener('click',()=>{this.recording.currentTime=0;this.update(true);this.play();});
    $('#song-mute').addEventListener('click',()=>this.mute());
    $('#song-seek').addEventListener('input',e=>{this.recording.currentTime=Number(e.target.value);this.update(true);});
    this.scene.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();this.close();}
      else if(e.key.toLowerCase()==='m'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();this.mute();}
      else if(e.key===' '&&!e.target.closest('button,input,a')){e.preventDefault();this.toggle();}
    });
    for(const type of ['timeupdate','seeked','loadedmetadata'])this.recording.addEventListener(type,()=>this.update());
    this.recording.addEventListener('play',()=>{this.syncTransport();this.tick();});
    this.recording.addEventListener('pause',()=>{this.syncTransport();cancelAnimationFrame(this.frame);});
    this.recording.addEventListener('ended',()=>{this.update();this.syncTransport();this.status('Some words stay. Play them again.');});
    this.recording.addEventListener('error',()=>{if(this.active)this.fail('The song could not load. Return to the clouds and try again.');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active){this.recording.pause();if(!this.gathering)this.status('Paused. Play whenever you’re ready.');}});
    window.addEventListener('pagehide',()=>{this.recording.pause();cancelAnimationFrame(this.frame);});
    this.loaded=this.load();
  }
  async load(){
    try{
      if(globalThis.HAPPYCOUD_SONG)this.song=globalThis.HAPPYCOUD_SONG;
      else{if(location.protocol==='file:')return;const response=await fetch('./data/song.json');if(!response.ok)return;this.song=await response.json();}
      this.recording.src=globalThis.HAPPYCOUD_SONG_AUDIO||'./media/khushti.mp3';
      this.setCollection(this.comments||[]);
    }catch{ /* An optional local song never blocks loading the cloud. */ }
  }
  setCollection(comments){
    if(this.active)this.close();this.comments=comments;
    this.compatible=belongsToCollection(this.song,comments);this.syncRadar();
  }
  setReady(ready){if(this.ready===ready)return;this.ready=ready;this.syncRadar();}
  syncRadar(){this.radar.hidden=!(this.ready&&this.compatible&&!this.active);}
  status(text){$('#song-status').textContent=text;}
  render(){
    this.rows=[];const fragment=document.createDocumentFragment();
    for(const [index,phrase] of this.song.phrases.entries()){
      const row=document.createElement('article');row.className='song-line';row.dataset.phrase=index;
      const lyric=document.createElement('p');lyric.className='song-lyric';lyric.dir='auto';
      const spoken=document.createElement('span');spoken.className='sr-only';spoken.textContent=phrase.text;lyric.append(spoken);
      const words=phrase.words.map(word=>{
        const el=document.createElement('span');el.textContent=word.text;el.className=`song-word ${word.source==='comment'?'from-comment':'added-word'}`;el.dataset.state='waiting';el.setAttribute('aria-hidden','true');lyric.append(el,document.createTextNode(' '));return {word,el};
      });
      row.append(lyric);const quotes=[];
      for(const id of phrase.commentIds||[]){
        const comment=this.comments.find(c=>c.id===id);if(!comment)continue;
        const source=document.createElement('figure');source.className='song-source';source.dataset.commentId=id;
        const quote=document.createElement('blockquote');quote.dir='auto';
        // Character ranges come from exact source text, never rewritten lyrics.
        const bounds=new Set([0,comment.text.length]);const ranges=[];
        words.forEach(({word},wordIndex)=>{if(word.source!=='comment')return;for(const match of word.matches||[]){if(match.commentId!==id)continue;const start=match.sourceStart,end=match.sourceEnd;if(Number.isInteger(start)&&Number.isInteger(end)&&end>start&&start>=0&&end<=comment.text.length){bounds.add(start);bounds.add(end);ranges.push({start,end,wordIndex});}}});
        const sorted=[...bounds].sort((a,b)=>a-b),spans=[];
        for(let j=0;j<sorted.length-1;j++){
          const start=sorted[j],end=sorted[j+1],span=document.createElement('span');span.textContent=comment.text.slice(start,end);
          const indices=ranges.filter(r=>r.start<=start&&r.end>=end).map(r=>r.wordIndex);
          if(indices.length)span.className='source-word';quote.append(span);spans.push({span,indices});
        }
        const author=document.createElement('figcaption');author.textContent=comment.author?'@'+comment.author.replace(/^@/,''):'From the clouds';source.append(quote,author);row.append(source);quotes.push({id,source,spans});
      }
      row.dataset.hasSource=String(quotes.length>0);fragment.append(row);this.rows.push({row,words,quotes,phrase});
    }
    $('#song-lines').replaceChildren(fragment);$('#song-scroll').scrollTop=0;this.current=-2;
  }
  async open(){
    if(this.active||!this.ready||!this.compatible)return;
    const token=++this.generation;this.active=true;this.gathering=true;this.syncRadar();this.onOpen();
    this.render();this.scene.hidden=false;this.scene.dataset.state='gathering';document.body.dataset.song='on';$('#app').inert=true;
    $('#song-error').hidden=true;this.status('Gathering the words…');$('#song-close').focus({preventScroll:true});
    this.recording.currentTime=0;this.recording.muted=true;this.syncTransport();
    // Unlock in the radar's user gesture, inaudibly. The real playback waits for arrival.
    const unlock=this.recording.play().then(()=>{if(token===this.generation){this.recording.pause();this.recording.currentTime=0;}}).catch(()=>{});
    this.animations=[];
    if(!this.reduced()){
      for(const {quotes} of this.rows){for(const {id,source} of quotes){
        const rect=source.getBoundingClientRect();if(rect.top>innerHeight||rect.bottom<0)continue;
        const point=this.projectComment(id);if(!point)continue;
        this.animations.push(source.animate([{transform:`translate(${point.x-rect.left-rect.width/2}px,${point.y-rect.top-rect.height/2}px) scale(.12)`,opacity:.15,filter:'blur(1px)'},{transform:'none',opacity:1,filter:'blur(0px)'}],{duration:1800,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'}));
      }}
    }
    await Promise.all([unlock,...this.animations.map(a=>a.finished.catch(()=>{}))]);
    if(token!==this.generation||!this.active)return;
    this.animations.forEach(a=>a.cancel());this.animations=[];this.gathering=false;this.scene.dataset.state='ready';this.recording.muted=false;this.syncMute();this.update(true);
    this.announce('The comments are in song order. Added words appear as they are sung.');
    if(document.hidden){this.syncTransport();this.status('Ready. Play whenever you’re ready.');return;}
    await this.play();
  }
  async play(){
    if(!this.active||this.gathering)return;
    $('#song-error').hidden=true;
    if(this.recording.ended)this.recording.currentTime=0;
    const token=this.generation;
    try{await this.recording.play();if(token!==this.generation)return;this.status('Their words, a little more, and you.');}
    catch(error){if(token===this.generation&&error.name!=='AbortError'){this.fail(error.name==='NotAllowedError'?'Tap Play to start the song.':'Playback stopped. Tap Play to try again.');}}
    this.syncTransport();
  }
  toggle(){if(this.gathering)return;if(this.recording.paused)this.play();else{this.recording.pause();this.status('Paused. Stay a little.');}}
  mute(){this.recording.muted=!this.recording.muted;this.syncMute();}
  syncMute(){$('#song-mute').textContent=this.recording.muted?'Sound off':'Sound on';$('#song-mute').setAttribute('aria-label',this.recording.muted?'Unmute song':'Mute song');$('#song-mute').setAttribute('aria-pressed',String(this.recording.muted));}
  fail(message){this.recording.pause();$('#song-error').textContent=message;$('#song-error').hidden=false;this.status('The words are here.');this.syncTransport();}
  syncTransport(){
    const playing=!this.recording.paused&&!this.recording.ended;
    $('#song-play').innerHTML=icon(playing?'pause':'play');$('#song-play').setAttribute('aria-label',playing?'Pause song':this.recording.ended?'Replay song':'Play song');
    for(const id of ['song-play','song-seek','song-restart'])$('#'+id).disabled=!!this.gathering;
  }
  tick(){cancelAnimationFrame(this.frame);if(!this.active||this.gathering||this.recording.paused)return;this.update();this.frame=requestAnimationFrame(()=>this.tick());}
  update(force=false){
    if(!this.active||this.gathering)return;
    const time=this.recording.currentTime,duration=Number.isFinite(this.recording.duration)?this.recording.duration:this.song.duration;
    $('#song-seek').max=duration||1;$('#song-seek').value=time;$('#song-seek').setAttribute('aria-valuetext',`${clockLabel(time)} of ${clockLabel(duration)}`);$('#song-time').value=clockLabel(time);$('#song-duration').value=clockLabel(duration);
    const current=phraseAt(this.song.phrases,time),display=Math.max(0,current);
    if(current!==this.current||force){
      this.current=current;
      this.rows.forEach(({row},i)=>{row.classList.toggle('is-current',i===display);row.classList.toggle('is-past',i<display);if(i===display)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});
      const row=this.rows[display]?.row,scroll=$('#song-scroll');
      if(row){const top=scroll.scrollTop+row.getBoundingClientRect().top-scroll.getBoundingClientRect().top-scroll.clientHeight*.25;scroll.scrollTo({top:Math.max(0,top),behavior:force||this.reduced()?'instant':'smooth'});}
    }
    for(const {words,quotes} of this.rows){
      const states=words.map(({word,el})=>{const state=wordState(word,time);if(el.dataset.state!==state)el.dataset.state=state;return state;});
      for(const {spans} of quotes)for(const {span,indices} of spans){if(!indices.length)continue;const state=indices.some(i=>states[i]==='singing')?'singing':indices.some(i=>states[i]==='sung')?'sung':'waiting';if(span.dataset.state!==state)span.dataset.state=state;}
    }
  }
  close(){
    if(!this.active)return;++this.generation;this.recording.pause();this.recording.currentTime=0;cancelAnimationFrame(this.frame);this.animations.forEach(a=>a.cancel());this.animations=[];
    this.active=false;this.gathering=false;this.scene.hidden=true;delete document.body.dataset.song;$('#app').inert=false;this.syncRadar();this.onClose();this.radar.focus({preventScroll:true});
  }
  snapshot(){return {available:this.compatible,active:this.active,gathering:this.gathering,time:this.recording.currentTime,duration:this.recording.duration,paused:this.recording.paused,muted:this.recording.muted,phrase:this.current,phrases:this.rows.length};}
}
