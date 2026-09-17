import { clamp, mix, smooth, project, prepareSong, lyricSegments, sourceSegments, bounceCue, lyricBeats, lyricDisplayIndex, phraseSource, timeLabel, mediaDuration } from './core.js';
import { SourceBridge } from './bridge.js';
import { Courier, hopDuration } from './courier.js';

const STAR = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3c0 12-5 17-17 17 12 0 17 5 17 17 0-12 5-17 17-17-12 0-17-5-17-17Z"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"/></svg>';
const PLAY = '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="sl-play-mark" d="m12 7 14 9-14 9Z"/><path class="sl-pause-mark" d="M12 8v16M21 8v16"/></svg>';
const ORBITS = '<svg class="sl-play-orbits" viewBox="0 0 100 100" aria-hidden="true"><g class="sl-orbit-track"><ellipse cx="50" cy="50" rx="46" ry="30" transform="rotate(-32 50 50)"/><path d="M14 34a43 43 0 0 1 71 43"/><circle class="sl-orbit-satellite" cx="14" cy="34" r="2"/><circle class="sl-orbit-satellite" cx="85" cy="77" r="1.3"/></g></svg>';
const RESTART = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 10a10 10 0 1 1-2 11M4 9l5 1 1-5"/><path class="sl-control-star" d="M18 7q0 5-5 5 5 0 5 5 0-5 5-5-5 0-5-5Z"/></svg>';
const LYRICS = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m6 23 7-14 7 9 7-12"/><circle cx="6" cy="23" r="1.6"/><circle cx="13" cy="9" r="1.6"/><circle cx="20" cy="18" r="1.6"/><path class="sl-control-star" d="M27 2q0 4-4 4 4 0 4 4 0-4 4-4-4 0-4-4Z"/></svg>';
const rectCenter = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height });
const interpolateRect = (a, b, p) => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, mix(a[k], b[k], p)]));
const authorName = c => c?.author ? '@' + c.author.replace(/^@/, '') : 'A voice in this sky';

/** Drop-in for the repository's SongExperience. It owns ONE timeline and ONE lyric row.
 * Called by main.js before/after the existing sky render. No additional render loop.
 */
export class SongExperience {
  constructor({ reduced = () => false, projectComment, getScene, score, onOpen, onClose, announce = () => {}, recording = null }) {
    Object.assign(this, { reduced, projectComment, getScene, score, onOpen, onClose, announce });
    this.active = false; this.ready = false; this.compatible = false; this.generation = 0; this.comments = [];
    this.current = -1; this.lastFrame = 0; this.elapsed = 0; this.exitElapsed = 0; this.entryPickup = null; this.fade = 0; this.userMuted = false;
    this.recording = recording || new Audio(); this.recording.preload = 'metadata'; this.recording.volume = 1;
    this.bridge = new SourceBridge(); this.controller = new AbortController(); this.layoutDirty = true; this.rects = new Map();
    this.radar = document.createElement('button'); this.radar.id = 'sl-portal'; this.radar.className = 'sl-portal'; this.radar.hidden = true;
    this.radar.innerHTML = `<span class="sl-portal-star">${STAR}<i></i></span>`;
    this.radar.setAttribute('aria-label', 'Listen to the song made from these comments');
    (document.querySelector('#app') || document.body).append(this.radar);
    this.scene = document.createElement('section'); this.scene.id = 'sl-scene'; this.scene.className = 'sl-scene'; this.scene.hidden = true;
    this.scene.setAttribute('role', 'dialog'); this.scene.setAttribute('aria-modal', 'true'); this.scene.setAttribute('aria-labelledby', 'sl-title');
    this.scene.innerHTML = `
      <div class="sl-scrim" aria-hidden="true"></div>
      <header class="sl-header"><button class="sl-back sl-button" data-action="close" aria-label="Return to the same sky">${BACK}<span>the same sky</span></button>
        <div class="sl-heading"><h1 id="sl-title">Khushti</h1></div>
        <button class="sl-mute sl-button" data-action="mute" aria-label="Mute song" aria-pressed="false">${STAR}<span>sound on</span></button></header>
      <div class="sl-prologue" aria-hidden="true"><p class="sl-eyebrow sl-survivor-count"></p><h2>These words stayed.</h2><p class="sl-prologue-note">The same comments. A new way to hear them.</p></div>
      <p class="sl-witness-author" aria-hidden="true"></p>
      <div class="sl-room">
        <aside class="sl-source" aria-label="Original comment for the lyric"><p class="sl-eyebrow">where this line began</p>
          <div class="sl-source-byline"><span class="sl-source-dot" aria-hidden="true">${STAR}</span><span class="sl-source-author"></span><span class="sl-source-count"></span></div>
          <blockquote class="sl-source-quote" dir="auto"></blockquote><div class="sl-source-tabs" aria-label="Other source comments for this line"></div>
          <button class="sl-source-open sl-text-button" data-action="source">read the original <span aria-hidden="true">↗</span></button>
          </aside>
        <div class="sl-lyric-stage">
          <div class="sl-lyric-window"><p class="sl-lyric" id="sl-lyric" dir="auto"></p></div><p class="sl-next-line" aria-hidden="true"></p>
</div>
      </div>
      <button class="sl-skip sl-text-button" data-action="skip">skip to the song <span aria-hidden="true">↗</span></button>
      <footer class="sl-footer"><p class="sl-status sl-sr-only" role="status"></p><div class="sl-controls">
        <button class="sl-text-button sl-small-control" data-action="restart" aria-label="Restart the recording">${RESTART}<span>again</span></button>
        <button class="sl-play sl-button" data-action="play" aria-label="Play song"><span class="sl-play-aura" aria-hidden="true"></span>${ORBITS}<span class="sl-play-symbol">${PLAY}</span></button>
        <button class="sl-text-button sl-small-control" data-action="lyrics" aria-label="Browse all lyrics">${LYRICS}<span>the lyrics</span></button></div>
        <div class="sl-timeline"><output class="sl-time" aria-hidden="true">0:00</output><input class="sl-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Song position"><output class="sl-duration" aria-hidden="true">0:00</output></div>
        <p class="sl-error" role="alert" hidden></p></footer>
      <aside class="sl-drawer" hidden aria-labelledby="sl-drawer-title"><div class="sl-drawer-header"><h2 id="sl-drawer-title"></h2><button class="sl-button" data-action="drawer-close" aria-label="Close this panel">×</button></div><div class="sl-drawer-content"></div></aside>
      <p class="sl-live sl-sr-only" aria-live="polite" aria-atomic="true"></p>`;
    document.body.append(this.scene); this.courier = new Courier(this.scene);
    this.el = selector => this.scene.querySelector(selector);
    this.model = { records: [], phrases: [], sources: [], warnings: [], errors: [] };
    const signal = this.controller.signal;
    this.radar.addEventListener('click', () => this.open(), { signal });
    this.scene.addEventListener('click', e => {
      const button = e.target.closest('[data-action]'); if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') this.close();
      else if (action === 'play') this.toggle();
      else if (action === 'mute') this.mute();
      else if (action === 'skip') this.finishEntry();
      else if (action === 'restart' && !this.gathering && !this.returning) { this.seek(0); this.play(); }
      else if (action === 'lyrics') this.showDrawer('lyrics');
      else if (action === 'source') this.showDrawer('sources');
      else if (action === 'drawer-close') this.hideDrawer();
    }, { signal });
    this.scene.addEventListener('keydown', e => this.keydown(e), { signal });
    this.el('.sl-seek').addEventListener('input', e => this.seek(Number(e.target.value)), { signal });
    for (const event of ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange']) this.recording.addEventListener(event, () => {
      this.syncTransport(); if (this.active && !this.gathering && !this.returning) this.update(true);
      if (event === 'ended') this.status('The song ends. The words stay.');
    }, { signal });
    this.recording.addEventListener('seeked', () => { this.courier.hide(); this.update(true); }, { signal });
    this.recording.addEventListener('waiting', () => { if (this.active && !this.gathering) this.status('Waiting for the recording…'); }, { signal });
    this.recording.addEventListener('playing', () => { if (this.active && !this.gathering) this.status('Their words. Your melody.'); }, { signal });
    this.recording.addEventListener('error', () => { if (this.active && !this.returning) this.fail('The recording could not load. You can still read every lyric and its original comments.'); }, { signal });
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; if (document.hidden && this.active) { this.hiddenDuringEntry = true; this.recording.pause(); this.status('Paused. Stay a little.'); } }, { signal });
    window.addEventListener('pagehide', () => this.close({ immediate: true, restoreFocus: false }), { signal });
    window.addEventListener('resize', () => { this.layoutDirty = true; }, { signal });
    this.observer = new ResizeObserver(() => { this.layoutDirty = true; }); this.observer.observe(this.el('.sl-room')); this.observer.observe(this.el('.sl-source-quote'));
    this.el('#sl-lyric').addEventListener('scroll', () => { this.layoutDirty = true; }, { passive: true, signal });
    this.el('.sl-source-quote').addEventListener('scroll', () => { this.layoutDirty = true; }, { passive: true, signal });
    this.el('.sl-room').addEventListener('scroll', () => { this.layoutDirty = true; }, { passive: true, signal });
    document.fonts?.ready.then(() => { this.layoutDirty = true; });
    this.loaded = this.load();
  }
  async load() {
    try {
      if (globalThis.HAPPYCOUD_SONG) this.song = globalThis.HAPPYCOUD_SONG;
      else {
        if (location.protocol === 'file:') return;
        const response = await fetch('./data/song.json', { signal: this.controller.signal });
        if (!response.ok) return; this.song = await response.json();
      }
      this.recording.src = globalThis.HAPPYCOUD_SONG_AUDIO || './media/khushti.mp3';
      this.el('#sl-title').textContent = this.song.title || 'Khushti';
      this.setCollection(this.comments);
    } catch { /* Optional private assets must never prevent browsing the constellation. */ }
  }
  setCollection(comments) {
    if (this.active) this.close({ immediate: true });
    this.comments = comments || []; this.model = prepareSong(this.song, this.comments); this.compatible = this.model.valid;
    this.syncRadar();
  }
  setReady(ready) { this.ready = ready; this.syncRadar(); }
  syncRadar() { this.radar.hidden = !this.ready || !this.compatible || this.active; }
  duration() { return mediaDuration(this.recording, this.model, this.song); }
  status(text) { if (this.el('.sl-status').textContent !== text) this.el('.sl-status').textContent = text; }
  open() {
    if (!this.ready || !this.compatible || this.active) return;
    const { rig, layout, renderer } = this.getScene(), token = ++this.generation;
    this.savedCamera = { ...rig.current }; this.savedWasHome = Math.abs(rig.current.z - rig.homeZ) < 1 && Math.hypot(rig.current.x, rig.current.y) < 1;
    this.previousFocus = document.activeElement; this.restoreFocus = true; this.active = true; this.gathering = true; this.returning = false;
    this.elapsed = 0; this.exitElapsed = 0; this.entryPickup = null; this.lastFrame = 0; this.fade = 0; this.current = -1; this.hiddenDuringEntry = document.hidden; this.mediaGraph = false;
    this.nodes = new Map(layout.nodes.map(n => [n.comment.id, n]));
    const sources = this.model.sources.map(c => this.nodes.get(c.id)).filter(Boolean);
    // Prefer an early, legible whole comment; never synthesize a quote or a source.
    const earliest = this.model.phrases.find(p => p.sourceIds.length);
    const preferred = (earliest?.sourceIds || []).map(id => this.nodes.get(id)).filter(Boolean);
    this.hero = preferred.find(n => n.comment.text.length <= 240) || preferred[0] || sources.find(n => n.comment.text.length <= 240) || sources[0];
    this.openingSourceId = this.hero?.comment.id; this.courier.lastPosition=null;
    this.bridge.prepare(renderer, sources, this.openingSourceId);
    this.onOpen?.();
    this.orientDuration = this.savedWasHome ? .28 : 1.1;
    if (!this.savedWasHome) rig.flyTo({ x: 0, y: 0, z: rig.homeZ }, { duration: this.orientDuration, arc: false });
    this.scene.hidden = false; this.scene.dataset.phase = 'orient'; document.body.dataset.starlight = 'on';
    const app = document.querySelector('#app'); this.previousInert = app?.inert ?? false; if (app) app.inert = true;
    this.el('.sl-error').hidden = true; this.el('.sl-drawer').hidden = true; this.el('.sl-skip').hidden = false;
    this.el('.sl-source-quote').style.opacity = '0'; this.el('.sl-room').style.opacity = '0'; this.el('.sl-footer').style.opacity = '0';
    this.el('.sl-room').inert = true; this.el('.sl-footer').inert = true; this.bridgeFrame = { fade: 0 }; this.scene.style.setProperty('--sl-heading', '0');
    this.el('.sl-survivor-count').textContent = `${sources.length} ${sources.length === 1 ? 'original comment' : 'original comments'} · still here`;
    this.el('.sl-witness-author').textContent = authorName(this.hero?.comment);
    this.el('.sl-prologue h2').textContent = sources.length ? 'These words stayed.' : 'A song in the same sky.';
    this.renderPhrase(0, this.hero?.comment.id, true); this.syncRadar(); this.syncTransport(); this.syncMute();
    this.el('[data-action="close"]').focus({ preventScroll: true }); this.announce('The comments that became the song are staying in the sky.');
    this.recording.pause(); this.recording.currentTime = 0; this.recording.muted = true;
    try { this.score?.attachMedia(this.recording); this.mediaGraph = !!this.score?.media; this.score?.setMediaLevel(0, .02); } catch { /* Native media remains available. */ }
    // Unlock during the click, silently. Late promises cannot reopen a cancelled transition.
    this.recording.play().then(() => {
      if (token !== this.generation) return;
      if (this.gathering) { this.recording.pause(); this.recording.currentTime = 0; }
    }).catch(() => {});
    this.status('Watch the words that stay.'); this.layoutDirty = true;
    if (this.reduced()) { rig.tick(0, true); this.orientDuration = 0; }
  }
  witnessRect() {
    if (!this.hero) return null;
    const n = this.hero, width = innerWidth, height = innerHeight;
    const scale = Math.min((width < 700 ? width * .80 : width * .56) / n.w, height * .24 / n.h, 36 / n.font);
    return { x: width * .5, y: height * .48, width: n.w * scale, height: n.h * scale };
  }
  sourceRect() {
    if (!this.hero) return null;
    const quote = this.el('.sl-source-quote'), r = quote.getBoundingClientRect();
    const scale = Math.min(r.width / this.hero.w, Math.max(70, Math.min(r.height, innerHeight * .30)) / this.hero.h);
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, this.hero.h * scale) / 2, width: this.hero.w * scale, height: this.hero.h * scale };
  }
  entryFrame() {
    if (this.reduced()) {
      this.fade = 1; this.scene.dataset.phase = 'witness'; this.el('.sl-prologue').style.opacity = '0';
      if (this.elapsed > .35) this.finishEntry(); return;
    }
    const t = Math.max(0, this.elapsed - this.orientDuration), reveal = smooth(t / 1.0), gather = clamp((t - 1.12) / 1.4), arrange = clamp((t - 3.55) / 1.35);
    this.fade = reveal;
    this.scene.dataset.phase = t < 1.12 ? 'survivors' : t < 3.55 ? 'witness' : 'arrange';
    this.el('.sl-prologue').style.opacity = String(smooth((t - .25) / .6) * (1 - smooth(arrange * 2)));
    this.el('.sl-witness-author').style.opacity = String(smooth((t - 2.2) / .5) * (1 - smooth(arrange * 2)));
    const witness = this.witnessRect();
    if (witness) { const a = this.el('.sl-witness-author'); a.style.top = (witness.y + witness.height / 2 + 26) + 'px'; }
    this.el('.sl-room').style.opacity = String(smooth((arrange - .25) / .6));
    this.el('.sl-source-quote').style.opacity = String(smooth((arrange - .68) / .32));
    this.el('.sl-footer').style.opacity = String(smooth((arrange - .65) / .35));
    this.scene.style.setProperty('--sl-heading', smooth((arrange - .25) / .65));
    const destination = witness && this.sourceRect() ? interpolateRect(witness, this.sourceRect(), smooth(arrange)) : witness;
    this.bridgeFrame = { fade: reveal, gather, destination, dissolve: smooth((arrange - .68) / .32) };
    this.entryPickup = t >= 4.9 ? clamp((t - 4.9) / .62) : null;
    if (t >= 5.52) this.finishEntry();
  }
  finishEntry() {
    if (!this.active || !this.gathering || this.returning) return;
    this.gathering = false; this.fade = 1; this.bridge.dispose(); this.scene.dataset.phase = 'song';
    this.el('.sl-prologue').style.opacity = '0'; this.el('.sl-witness-author').style.opacity = '0';
    for (const selector of ['.sl-room', '.sl-footer', '.sl-source-quote']) this.el(selector).style.opacity = '1';
    this.scene.style.setProperty('--sl-heading', '1'); this.el('.sl-skip').hidden = true;
    this.el('.sl-room').inert = false; this.el('.sl-footer').inert = false;
    if (document.activeElement === this.el('.sl-skip')) this.el('[data-action="play"]').focus({ preventScroll: true });
    this.renderPhrase(0);
    this.recording.pause(); this.recording.currentTime = 0; this.recording.muted = this.userMuted;
    this.update(true); this.syncTransport(); this.layoutDirty = true;
    this.announce('The original comments are beside the lyrics. The star follows the sung words.');
    if (!this.hiddenDuringEntry && !document.hidden) this.play(); else this.status('Ready when you are.');
  }
  renderPhrase(index, preferredId = null, intro = false) {
    const phrase = this.model.phrases[index]; if (!phrase) return;
    const lyric = this.el('#sl-lyric');
    const changing = this.current !== index && this.current >= 0 && !intro && !this.gathering;
    this.phraseAnchor = this.courier.lastPosition ? {...this.courier.lastPosition} : null;
    this.phraseLeadTime = this.recording.currentTime || 0;
    this.lyricTransition?.old.remove(); this.lyricTransition=null;
    lyric.style.opacity='1'; lyric.style.transform='none';
    if(changing && !this.reduced() && !this.seeking) {
      const old=lyric.cloneNode(true);old.removeAttribute('id');old.removeAttribute('aria-label');
      old.setAttribute('aria-hidden','true');old.classList.add('sl-outgoing');
      old.querySelectorAll('[data-key]').forEach(el=>el.removeAttribute('data-key'));
      old.style.width=lyric.getBoundingClientRect().width+'px';lyric.before(old);
      const available=Math.max(.08,phrase.records[0].word.start-this.recording.currentTime-.02);
      this.lyricTransition={old,start:this.recording.currentTime,duration:Math.min(.5,available)};
    }
    this.current = index; lyric.replaceChildren(); this.wordEls = new Map();
    this.beats = lyricBeats(phrase.records);
    for (const segment of lyricSegments(phrase)) {
      if (!segment.record) { this.el('#sl-lyric').append(document.createTextNode(segment.text)); continue; }
      const r = segment.record, span = document.createElement('span'); span.className = 'sl-word'; span.dataset.key = r.key;
      span.dataset.origin = r.origin ? 'comment' : r.word.source === 'comment' ? 'unlocated' : 'added';
      span.dataset.sung = 'false';
      const letters=this.beats.filter(b=>b.parentKey===r.key);
      if(letters.length) {
        span.classList.add('sl-name');
        letters.forEach((b,i)=>{if(i)span.append(document.createTextNode(' '));const letter=document.createElement('span');letter.className='sl-letter';letter.textContent=b.word.text;span.append(letter);this.wordEls.set(b.key,letter);});
      }else{span.textContent = segment.text;this.wordEls.set(r.key,span);}
      if (r.origin) span.title = `${authorName(r.origin.comment)}${r.origin.adapted ? ' · adapted from “' + r.origin.text + '”' : ''}`;
      this.el('#sl-lyric').append(span);
    }
    this.el('#sl-lyric').setAttribute('aria-label', phrase.text);
    this.el('.sl-next-line').textContent = this.model.phrases[index + 1]?.text || '';
    this.el('.sl-live').textContent = phrase.text;
    const source=phraseSource(this.model.phrases,index,this.openingSourceId);
    this.renderSource(preferredId || source.id, intro || source.opening);
    const fragment = document.createDocumentFragment();
    phrase.sourceIds.forEach((id, i) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = String(i + 1).padStart(2, '0'); button.setAttribute('aria-label', `Read source comment ${i + 1} from ${authorName(this.model.comments.get(id))}`); button.dataset.sourceId = id; button.setAttribute('aria-pressed', String(id === this.sourceId)); button.addEventListener('click', () => { this.recording.pause(); this.renderSource(id); }); fragment.append(button); });
    this.el('.sl-source-tabs').replaceChildren(fragment); this.el('.sl-source-tabs').hidden = phrase.sourceIds.length <= 1;
    this.layoutDirty = true;
  }
  renderSource(id, intro = false) {
    const phrase = this.model.phrases[this.current], quote = this.el('.sl-source-quote'), comment = this.model.comments.get(id);
    const changed=this.sourceId && this.sourceId!==id;
    this.sourceId = id || null; quote.replaceChildren(); quote.scrollTop = 0; quote.style.fontSize = ''; quote.style.height = ''; quote.classList.remove('sl-source-layout');
    this.el('.sl-source').style.visibility = comment || intro ? '' : 'hidden';
    this.el('.sl-source-author').textContent = comment ? authorName(comment) : '';
    const pos = phrase.sourceIds.indexOf(id);
    this.el('.sl-source-count').textContent = phrase.sourceIds.length > 1 && pos >= 0 ? `${pos + 1} / ${phrase.sourceIds.length}` : '';
    this.el('.sl-source-open').hidden = !comment;
    this.el('.sl-source').dataset.shedding = 'false';
    if (!comment) { quote.removeAttribute('aria-label'); quote.textContent = 'This part of the melody brings in new words.';  this.layoutDirty = true; return; }
    const ranges = phrase.records.filter(r => r.origin?.commentId === id).map(r => r.origin), node = this.nodes.get(id);
    const appendSpans = (host, text, offset = 0) => {
      for (const part of sourceSegments(text, ranges.map(r => ({ start: Math.max(0, r.start - offset), end: Math.min(text.length, r.end - offset) })).filter(r => r.end > r.start))) {
        const span = document.createElement('span'); span.textContent = part.text; span.className = part.kept ? 'sl-kept-ink' : 'sl-rest-ink'; span.dataset.start = offset + part.start; span.dataset.end = offset + part.end; host.append(span);
      }
    };
    const hasUsableLines = node?.lines?.length && node.lines.every(line => comment.text.includes(line));
    if (intro && hasUsableLines && comment.text.length < 280) {
      quote.classList.add('sl-source-layout'); const available = Math.max(150, this.el('.sl-source').getBoundingClientRect().width);
      const font = Math.min(23, available / node.w * node.font); quote.style.fontSize = font + 'px';
      let offset = 0;
      for (const line of node.lines) { const at = comment.text.indexOf(line, offset); const span = document.createElement('span'); span.className = 'sl-source-line'; appendSpans(span, line, Math.max(0, at)); quote.append(span); offset = Math.max(0, at) + line.length; }
    } else appendSpans(quote, comment.text);
    quote.setAttribute('aria-label', comment.text);
    if(changed&&!this.reduced()&&!this.seeking){quote.getAnimations().forEach(a=>a.cancel());quote.animate([{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:300,easing:'cubic-bezier(.2,.7,.2,1)'});}
    for (const button of this.el('.sl-source-tabs').children) button.setAttribute('aria-pressed', String(button.dataset.sourceId === id));
    this.layoutDirty = true;
  }
  measure() {
    this.rects.clear();
    const frameTop=this.el('.sl-lyric-window').getBoundingClientRect().top;
    const animatedOffset=this.el('#sl-lyric').getBoundingClientRect().top-frameTop;
    // Range measures the letters, not the inline block's leading/line-height.
    // Group the visible glyphs into rows so every hop has its own clear airspace.
    const rows = [];
    for (const [key, el] of this.wordEls || []) {
      const range = document.createRange(); range.selectNodeContents(el);
      const r = range.getBoundingClientRect(), top = r.top - animatedOffset;
      let row = rows.find(row => Math.abs(row.top - top) < 5);
      if (!row) { row = { top, bottom:top + r.height, left:r.left, right:r.right }; rows.push(row); }
      row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right);
      row.bottom = Math.max(row.bottom, top + r.height);
      this.rects.set(key, { x:r.left + r.width / 2, y:top - 8, width:r.width, height:r.height, row });
    }
    rows.sort((a,b) => a.top - b.top);
    rows.forEach((row,i) => { row.ceiling = i ? rows[i-1].bottom + 11 : row.top - 65; row.edge = Math.max(...rows.map(r=>r.right)); row.edgeLeft=Math.min(...rows.map(r=>r.left)); });
    this.sourceRects = [];
    for (const span of this.el('.sl-source-quote').querySelectorAll('[data-start]')) {
      const r = span.getBoundingClientRect(); this.sourceRects.push({ start: Number(span.dataset.start), end: Number(span.dataset.end), rect: rectCenter(r) });
    }
    this.quoteBounds = this.el('.sl-source-quote').getBoundingClientRect(); this.originRects = new Map();
    for (const r of this.model.phrases[this.current]?.records || []) if (r.origin?.commentId === this.sourceId) this.originRects.set(r.key, this.originPoint(r.origin));
    if (!this.phraseAnchor) { const first=this.rects.values().next().value; if(first)this.phraseAnchor={x:first.x,y:first.y-35}; }
    this.layoutDirty = false;
  }
  originPoint(origin, target) {
    const span = [...this.el('.sl-source-quote').querySelectorAll('[data-start]')].find(el => Number(el.dataset.start) <= origin.start && Number(el.dataset.end) > origin.start);
    if (!span?.firstChild) return null;
    const start = Math.max(0, origin.start - Number(span.dataset.start)), end = Math.min(span.firstChild.length, origin.end - Number(span.dataset.start));
    if (end <= start) return null;
    const range = document.createRange(); range.setStart(span.firstChild, start); range.setEnd(span.firstChild, end);
    const visible = [...range.getClientRects()].find(r => r.top >= this.quoteBounds.top - 1 && r.bottom <= this.quoteBounds.bottom + 1);
    return visible ? rectCenter(visible) : null;
  }
  update(force = false) {
    if (!this.active || this.gathering || this.returning) return;
    const time = this.recording.currentTime || 0, duration = this.duration();
    const index = lyricDisplayIndex(this.model.phrases, time);
    if (index !== this.current) this.renderPhrase(index);
    const phrase = this.model.phrases[this.current]; if (!phrase) return;
    for (const r of this.beats) {
      const el = this.wordEls.get(r.key); if (!el) continue;
      el.dataset.sung = String(time >= r.word.start); el.dataset.singing = String(time >= r.word.start && time < r.word.end);
      el.dataset.landed = String(time >= r.word.start && time < r.word.start+.18);
    }
    this.el('.sl-time').value = timeLabel(time); this.el('.sl-duration').value = timeLabel(duration);
    const seek = this.el('.sl-seek'); seek.max = String(duration); seek.value = String(clamp(time, 0, duration)); seek.style.setProperty('--sl-progress', `${clamp(time / duration) * 100}%`);
    seek.setAttribute('aria-valuetext', `${timeLabel(time)} of ${timeLabel(duration)}`);
    const cue = bounceCue(phrase.records, time);
    const sounding = cue?.phase === 'flight' && cue.previous ? cue.previous : cue?.record;
    if (sounding?.origin && sounding.origin.commentId !== this.sourceId && (!this.recording.paused || force)) this.renderSource(sounding.origin.commentId);
    if (force) this.layoutDirty = true;
    this.paintLyrics(time);
    this.syncTransport();
  }
  paintLyrics(time) {
    const transition=this.lyricTransition;if(!transition)return;
    const p=this.reduced()||this.recording.paused?1:clamp((time-transition.start)/transition.duration);
    const ease=1-Math.pow(1-p,3),lyric=this.el('#sl-lyric');
    transition.old.style.opacity=String(1-smooth(clamp(p*1.3)));
    transition.old.style.transform=`translateY(${-16*ease}px)`;
    lyric.style.opacity=String(smooth(clamp((p-.12)/.88)));
    lyric.style.transform=`translateY(${14*(1-ease)}px)`;
    if(p>=1){transition.old.remove();lyric.style.opacity='1';lyric.style.transform='none';this.lyricTransition=null;}
  }
  paintCourier() {
    if (!this.el('.sl-drawer').hidden || this.gathering || this.returning) { this.courier.hide(); return; }
    const time = this.recording.currentTime || 0, phrase = this.model.phrases[this.current];
    const cue = bounceCue((this.beats || []).filter(r=>this.rects.has(r.key)), time, this.phraseLeadTime, (previous,next)=>{
      const to=this.rects.get(next.key),from=this.rects.get(previous?.key)||this.phraseAnchor||to;return hopDuration(from,to);
    });
    if (!cue) { this.courier.idle(time, this.reduced()); return; }
    const to = this.rects.get(cue.record.key);
    const from = (cue.previous && this.rects.get(cue.previous.key)) || this.phraseAnchor || to;
    this.courier.draw({ key:cue.record.key, from, to, progress:cue.progress, phase:cue.phase,
      reduced:this.reduced(), time, duration:cue.duration });
  }

  async play() {
    if (!this.active || this.gathering || this.returning || !this.el('.sl-drawer').hidden) return;
    const token = this.generation; this.el('.sl-error').hidden = true;
    try {
      if (this.recording.ended) this.recording.currentTime = 0;
      if (this.mediaGraph) { await this.score.context?.resume?.(); if (token !== this.generation) return; this.score.setMediaLevel(.82, .35); }
      this.recording.muted = this.userMuted; await this.recording.play();
      if (token === this.generation) this.status('Their words. Your melody.');
    } catch (error) { if (token === this.generation && error.name !== 'AbortError') this.fail(error.name === 'NotAllowedError' ? 'Touch the play star to start the recording.' : 'The recording is unavailable. The lyrics and original comments are still here.'); }
    this.syncTransport();
  }
  toggle() { if (this.gathering || this.returning) return; if (this.recording.paused) this.play(); else { this.recording.pause(); this.status('Paused. Stay a little.'); } }
  seek(time) { if (!this.active || this.gathering || this.returning) return; this.seeking=true; this.phraseAnchor=null; this.courier.lastPosition=null; this.recording.currentTime = clamp(time, 0, this.duration()); this.courier.hide(); this.update(true); this.seeking=false; }
  mute() { this.userMuted = !this.userMuted; if (!this.gathering) this.recording.muted = this.userMuted; this.syncMute(); }
  syncMute() { const button = this.el('.sl-mute'); button.setAttribute('aria-pressed', String(this.userMuted)); button.setAttribute('aria-label', this.userMuted ? 'Unmute song' : 'Mute song'); button.querySelector('span').textContent = this.userMuted ? 'sound off' : 'sound on'; }
  syncTransport() {
    const playing = !this.recording.paused && !this.recording.ended && !this.gathering && !this.returning;
    this.scene.dataset.playing = String(playing); this.el('[data-action="play"]').setAttribute('aria-label', playing ? 'Pause song' : 'Play song');
    for (const selector of ['[data-action="play"]', '[data-action="restart"]', '[data-action="lyrics"]', '.sl-seek']) this.el(selector).disabled = !!(this.gathering || this.returning);
  }
  fail(message) { this.recording.pause(); this.el('.sl-error').hidden = false; this.el('.sl-error').textContent = message; this.status('The words are still here.'); this.syncTransport(); }
  showDrawer(kind) {
    if (!this.active || this.gathering || this.returning) return;
    this.recording.pause(); this.courier.hide(); this.drawerFocus = document.activeElement;
    const content = this.el('.sl-drawer-content'); content.replaceChildren(); this.el('.sl-drawer').hidden = false;
    this.el('#sl-drawer-title').textContent = kind === 'lyrics' ? 'Every word, in order.' : 'Where the words began.';
    if (kind === 'lyrics') for (const p of this.model.phrases) {
      const b = document.createElement('button'); b.className = 'sl-transcript-line'; b.type = 'button';
      const time = document.createElement('small'); time.textContent = timeLabel(p.start); const text = document.createElement('span'); text.textContent = p.text; b.append(time, text);
      b.addEventListener('click', () => { this.hideDrawer(); this.seek(p.start); this.play(); }); content.append(b);
    } else {
      const note = document.createElement('p'); note.className = 'sl-drawer-note'; note.textContent = 'These are the original comments, unchanged. Only verified source ranges travel into the lyrics. Added or unlocated words never fly from an invented comment.'; content.append(note);
      const ids = [this.sourceId, ...this.model.sources.map(c => c.id)].filter((id, i, all) => id && all.indexOf(id) === i);
      for (const id of ids) {
        const c = this.model.comments.get(id); if (!c) continue;
        const figure = document.createElement('figure'), quote = document.createElement('blockquote'), caption = document.createElement('figcaption');
        quote.textContent = c.text; quote.dir = 'auto'; caption.textContent = authorName(c); figure.append(quote, caption);
        const rawURL = c.commentUrl || c.postUrl;
        if (rawURL) { try { const url = new URL(rawURL); if (['https:', 'http:'].includes(url.protocol)) { const a = document.createElement('a'); a.href = url.href; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = 'View original ↗'; figure.append(a); } } catch {} }
        content.append(figure);
      }
      if (this.model.warnings.length) { const p = document.createElement('p'); p.className = 'sl-drawer-note'; p.textContent = `${this.model.warnings.length} source/timing entries could not be mapped exactly. Their words remain readable; no source movement is fabricated.`; content.append(p); }
    }
    this.el('[data-action="drawer-close"]').focus({ preventScroll: true });
  }
  hideDrawer() { this.el('.sl-drawer').hidden = true; if (this.drawerFocus?.isConnected && this.scene.contains(this.drawerFocus)) this.drawerFocus.focus({ preventScroll: true }); this.drawerFocus = null; this.layoutDirty = true; }
  keydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!this.el('.sl-drawer').hidden) this.hideDrawer(); else this.close(); return; }
    if (e.key === 'Tab') {
      const host = this.el('.sl-drawer').hidden ? this.scene : this.el('.sl-drawer');
      const items = [...host.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden],[inert]'));
      const first = items[0], last = items.at(-1), focused = document.activeElement;
      if (e.shiftKey && (focused === first || !items.includes(focused))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (focused === last || !items.includes(focused))) { e.preventDefault(); first?.focus(); }
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); this.mute(); }
    else if (e.key === ' ' && !e.target.closest('button,a')) { e.preventDefault(); this.toggle(); }
  }
  beforeRender(camera) {
    if (!this.active) return;
    const now = performance.now(), dt = this.lastFrame ? clamp((now - this.lastFrame) / 1000, 0, .08) : 0; this.lastFrame = now;
    const { renderer } = this.getScene(); if (!renderer || renderer.lost) { this.close({ immediate: true }); return; }
    if (this.returning) {
      this.exitElapsed += dt; const p = this.reduced() ? 1 : clamp(this.exitElapsed / 1.15);
      renderer.performanceMix = this.exitStartMix * (1 - smooth(p));
      this.el('.sl-room').style.opacity = String(1 - smooth(p / .45)); this.el('.sl-footer').style.opacity = String(1 - smooth(p / .4));
      this.el('.sl-prologue').style.opacity = '0'; this.el('.sl-witness-author').style.opacity = '0';
      this.scene.style.setProperty('--sl-heading', 1 - smooth(p / .45));
      this.bridgeFrame = { fade: this.exitStartMix * (1 - smooth(p)), gather: 1 - smooth(p), destination: this.exitRect, dissolve: 0 };
      if (p >= 1) this.finalizeClose(); return;
    }
    if (this.gathering) { this.elapsed += dt; this.entryFrame(); renderer.performanceMix = this.fade; }
    else { renderer.performanceMix = 1; this.update(); }
  }
  afterRender(camera) {
    if (!this.active) return;
    if (this.gathering || this.returning) {
      this.bridge.render(camera, this.bridgeFrame || { fade: 0 });
      this.courier.hide();
    }
    else { if (this.layoutDirty) this.measure(); this.paintCourier(); }
  }
  close({ immediate = false, restoreFocus = true } = {}) {
    if (!this.active || (this.returning && !immediate)) return;
    ++this.generation; this.restoreFocus = restoreFocus; this.recording.pause(); this.score?.setMediaLevel(0, .15); this.courier.hide();
    this.exitStartMix = this.fade; this.exitElapsed = 0; this.returning = true; this.gathering = false; this.scene.dataset.phase = 'returning';
    this.el('.sl-drawer').hidden = true; this.el('.sl-skip').hidden = true; this.el('.sl-room').inert = true; this.el('.sl-footer').inert = true; this.syncTransport();
    const { rig, renderer, layout } = this.getScene();
    if (this.savedWasHome) this.savedCamera = { x: 0, y: 0, z: rig.homeZ };
    const source = this.nodes?.get(this.sourceId) || this.hero;
    this.hero = source; this.exitRect = this.sourceRect() || this.witnessRect();
    if (!immediate && !this.reduced()) {
      this.bridge.prepare(renderer, layout.nodes.filter(n => this.model.sources.some(c => c.id === n.comment.id)), source?.comment.id);
      rig.flyTo(this.savedCamera, { duration: 1.15, arc: false });
    }
    if (immediate || this.reduced()) this.finalizeClose();
  }
  finalizeClose() {
    const { renderer, rig } = this.getScene(); if (renderer) renderer.performanceMix = 0;
    if (this.savedCamera) { rig.interrupt(); rig.current = { ...this.savedCamera }; rig.target = { ...this.savedCamera }; }
    this.bridge.dispose(); this.courier.hide(); this.recording.pause(); this.recording.currentTime = 0; this.score?.releaseMedia();
    this.active = false; this.gathering = false; this.returning = false; this.scene.hidden = true; delete document.body.dataset.starlight;
    const app = document.querySelector('#app'); if (app) app.inert = this.previousInert;
    this.onClose?.(); this.syncRadar();
    if (this.restoreFocus) { const target = this.previousFocus?.isConnected && !this.previousFocus.hidden ? this.previousFocus : !this.radar.hidden ? this.radar : document.querySelector('#universe'); target?.focus({ preventScroll: true }); }
    this.announce('Back in the same sky, exactly where you left it.');
  }
  snapshot() { return { available: !!this.compatible, active: this.active, gathering: !!this.gathering, returning: !!this.returning, phase: this.scene.dataset.phase || 'idle', time: this.recording.currentTime, duration: this.duration(), paused: this.recording.paused, muted: this.userMuted, phrase: this.current, phrases: this.model.phrases.length, sourceComments: this.model.sources.length, sourceFragments: this.bridge.items.length, warnings: this.model.warnings.length, mediaGraph: this.mediaGraph, version: 'starlight-1.0.0' }; }
  dispose() { this.close({ immediate: true, restoreFocus: false }); this.controller.abort(); this.observer.disconnect(); this.bridge.dispose(); this.courier.dispose(); this.recording.removeAttribute('src'); this.recording.load(); this.scene.remove(); this.radar.remove(); }
}
