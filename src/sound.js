import { clamp, hash, random } from './math.js';

// Original, locally synthesized D-major pentatonic palette. No recordings or downloads.
export const SCALE = Object.freeze([146.8324, 164.8138, 184.9972, 220, 246.9417, 293.6648, 329.6276, 369.9944]);
export const SOUND_EVENTS = Object.freeze([
  'arrival',
  'camera-approach',
  'camera-return',
  'reader-open',
  'reader-close',
  'mood-switch',
  'library-open',
  'library-close',
  'list-select',
  'keep',
  'unkeep',
  'options-open',
  'options-close',
  'search-update',
  'search-results',
  'import-success',
]);

export function noteFor(id) { return SCALE[hash(id) % SCALE.length]; }

export function audioMix({ zoom = 1, motion = 0, reading = false, mode = 'full', enabled = false, visible = true, volume = .32 } = {}) {
  const depth = clamp(Math.log2(Math.max(1, zoom)) / 5, 0, 1);
  return {
    master: enabled && visible ? clamp(volume, 0, 1) * .48 : 0,
    bed: mode === 'notes' ? 0 : (reading ? .18 : 1) * (.15 + .055 * depth),
    air: mode === 'notes' || reading ? 0 : .012 + clamp(motion, 0, 1) * .055,
    cutoff: 480 + depth * 1250,
    depth,
  };
}

const MIN_GAIN = .0001;
const MAX_VOICES = 12;
const EVENT_ALIASES = Object.freeze({
  approach: 'camera-approach',
  return: 'camera-return',
  open: 'reader-open',
  close: 'reader-close',
});
const NAVIGATION_EVENTS = new Set(['arrival', 'camera-approach', 'camera-return']);
const EVENT_COOLDOWNS = Object.freeze({
  arrival: .7,
  'camera-approach': .14,
  'camera-return': .14,
  'reader-open': .12,
  'reader-close': .12,
  'mood-switch': .18,
  'library-open': .12,
  'library-close': .12,
  'list-select': .08,
  keep: .12,
  unkeep: .12,
  'options-open': .1,
  'options-close': .1,
  'search-update': .16,
  'search-results': .22,
  'import-success': .7,
});

// Each family mirrors a physical change in the sky: gather, travel, unfold, settle.
// Levels are intentionally small; the compressor is a final guard, not the mix strategy.
const CUES = Object.freeze({
  arrival: [
    { ratio: .75, delay: 0, duration: .78, level: .058, pan: -.42, cutoff: 1250, wet: .48 },
    { ratio: 1, delay: .18, duration: .82, level: .06, pan: .27, cutoff: 1500, wet: .5 },
    { ratio: 1.25, delay: .37, duration: .84, level: .055, pan: -.12, cutoff: 1800, wet: .54 },
    { ratio: 1.5, delay: .58, duration: .82, level: .048, pan: 0, cutoff: 2100, wet: .58 },
  ],
  'camera-approach': [
    { ratio: .75, slide: 1.34, duration: .78, attack: .026, level: .055, type: 'triangle', cutoff: 1350, wet: .34 },
  ],
  'camera-return': [
    { ratio: 1, slide: .67, duration: .82, attack: .018, level: .05, type: 'triangle', cutoff: 1100, wet: .3 },
  ],
  'reader-open': [
    { ratio: 1, duration: .92, attack: .012, level: .07, pan: -.08, cutoff: 2100, wet: .55 },
    { ratio: 1.5, delay: .095, duration: 1.12, attack: .018, level: .052, pan: .1, cutoff: 2600, wet: .68 },
  ],
  'reader-close': [
    { ratio: 1.5, duration: .52, attack: .008, level: .045, pan: .08, cutoff: 1700, wet: .34 },
    { ratio: 1, delay: .075, duration: .64, attack: .01, level: .038, pan: -.06, cutoff: 1250, wet: .3 },
  ],
  'mood-switch': [
    { ratio: 1, duration: .56, attack: .008, level: .042, pan: -.16, cutoff: 2350, wet: .42 },
    { ratio: 1.25, delay: .075, duration: .7, attack: .01, level: .038, pan: .16, cutoff: 2750, wet: .5 },
  ],
  'library-open': [
    { ratio: .75, slide: 1.12, duration: .62, attack: .02, level: .047, pan: -.08, type: 'triangle', cutoff: 1350, wet: .26 },
    { ratio: 1, delay: .09, duration: .72, attack: .018, level: .036, pan: .07, cutoff: 1750, wet: .32 },
  ],
  'library-close': [
    { ratio: 1, slide: .84, duration: .48, attack: .01, level: .038, pan: .07, type: 'triangle', cutoff: 1350, wet: .22 },
    { ratio: .75, delay: .065, duration: .56, attack: .012, level: .03, pan: -.07, cutoff: 1050, wet: .2 },
  ],
  'list-select': [
    { ratio: 1, duration: .24, attack: .006, level: .034, type: 'triangle', partial: .05, cutoff: 1600, wet: .14 },
  ],
  keep: [
    { ratio: 1, duration: .78, attack: .008, level: .082, pan: -.06, cutoff: 2200, wet: .46 },
    { ratio: 1.5, delay: .16, duration: 1, attack: .01, level: .06, pan: .09, cutoff: 2700, wet: .58 },
  ],
  unkeep: [
    { ratio: 1.25, slide: .92, duration: .42, attack: .006, level: .044, pan: .06, type: 'triangle', cutoff: 1600, wet: .22 },
    { ratio: .75, delay: .075, duration: .5, attack: .008, level: .032, pan: -.05, type: 'triangle', cutoff: 1100, wet: .18 },
  ],
  'options-open': [
    { ratio: 1, slide: 1.08, duration: .23, attack: .005, level: .032, type: 'triangle', partial: .04, cutoff: 1550, wet: .1 },
  ],
  'options-close': [
    { ratio: 1, slide: .88, duration: .22, attack: .005, level: .029, type: 'triangle', partial: .04, cutoff: 1250, wet: .08 },
  ],
  'search-update': [
    { ratio: 1, duration: .18, attack: .005, level: .026, type: 'triangle', partial: .035, cutoff: 1450, wet: .08 },
  ],
  'search-results': [
    { ratio: 1, duration: .43, attack: .008, level: .038, pan: -.05, cutoff: 1900, wet: .28 },
    { ratio: 1.25, delay: .07, duration: .52, attack: .008, level: .03, pan: .06, cutoff: 2250, wet: .36 },
  ],
  'import-success': [
    { ratio: .75, duration: .72, attack: .01, level: .064, pan: -.16, cutoff: 1800, wet: .42 },
    { ratio: 1, delay: .13, duration: .86, attack: .012, level: .06, pan: .05, cutoff: 2200, wet: .5 },
    { ratio: 1.5, delay: .29, duration: 1.16, attack: .014, level: .052, pan: .12, cutoff: 2800, wet: .62 },
  ],
});

function glide(param, target, ctx, seconds = .3) {
  const time = ctx.currentTime;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
  else {
    const value = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(value, time);
  }
  param.setTargetAtTime(target, time, Math.max(.012, seconds));
}

/** All audio originates after explicit consent. Silence is an equal first-class entry. */
export class ObservatorySound {
  constructor({ contextFactory } = {}) {
    this.context = null;
    this.contextFactory = contextFactory;
    this.enabled = false;
    this.wanted = false;
    this.visible = true;
    this.volume = .32;
    this.mode = 'full';
    this.reading = false;
    this.zoom = 1;
    this.motion = 0;
    this.voices = new Set();
    this.noteHistory = new Map();
    this.eventHistory = new Map();
    this.lastNote = -Infinity;
    this.lastUpdate = -Infinity;
    this.stats = { notes: 0, events: 0, dropped: 0, cancelled: 0 };
    this.suspendTimer = null;
    this.epoch = 0;
  }

  build() {
    const Context = this.contextFactory || globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('Sound isn’t available in this browser. Your sky is still here in silence.');
    const ctx = this.context = new Context();
    const gain = (value = 0) => { const node = ctx.createGain(); node.gain.value = value; return node; };
    this.master = gain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -16;
    this.limiter.knee.value = 16;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = .006;
    this.limiter.release.value = .35;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.bed = gain(.15);
    this.notes = gain(1);
    this.air = gain(.012);
    this.bed.connect(this.master);
    this.notes.connect(this.master);
    this.air.connect(this.master);

    const reverb = ctx.createConvolver();
    const tail = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.7), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const r = random(371 + channel), arr = tail.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < arr.length; i++) {
        low = low * .72 + (r() * 2 - 1) * .28;
        arr[i] = low * Math.pow(1 - i / arr.length, 3.1) * .35;
      }
    }
    reverb.buffer = tail;
    const wet = gain(.22);
    reverb.connect(wet);
    wet.connect(this.master);
    this.reverb = reverb;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 480;
    this.filter.Q.value = .4;
    this.filter.connect(this.bed);
    this.drones = [];
    [73.4162, 110, 146.8324, 184.9972].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(), level = gain([.28, .13, .08, .055][index]);
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = [-2, 1, 2, -1][index];
      oscillator.connect(level);
      level.connect(this.filter);
      oscillator.start();
      this.drones.push(oscillator);
    });

    // A periodic, seam-free low-level air buffer. The attack/release is envelope-driven.
    const noise = ctx.createBuffer(2, ctx.sampleRate * 5, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const arr = noise.getChannelData(channel), r = random(529 + channel);
      let sample = 0;
      for (let i = 0; i < arr.length; i++) {
        sample = sample * .88 + (r() * 2 - 1) * .12;
        arr[i] = sample * Math.sin(Math.PI * i / (arr.length - 1)) ** 2;
      }
    }
    this.wind = ctx.createBufferSource();
    this.wind.buffer = noise;
    this.wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 920;
    band.Q.value = .45;
    this.wind.connect(band);
    band.connect(this.air);
    this.wind.start();
    this.applyMix();
  }

  async enable() {
    this.wanted = true;
    const epoch = ++this.epoch;
    clearTimeout(this.suspendTimer);
    try {
      if (!this.context) this.build();
      await this.context.resume();
      if (epoch !== this.epoch) return this.enabled;
      this.enabled = true;
      this.applyMix();
      return true;
    } catch (error) {
      if (epoch === this.epoch) {
        this.wanted = false;
        this.enabled = false;
        this.applyMix();
      }
      throw error;
    }
  }

  disable() {
    ++this.epoch;
    this.wanted = false;
    this.enabled = false;
    this.hush();
    this.applyMix();
    this.scheduleSuspend();
    return false;
  }

  async toggle() { return this.wanted || this.enabled ? this.disable() : this.enable(); }
  setVolume(value) { this.volume = clamp(Number(value) || 0, 0, 1); this.applyMix(); }
  setMode(mode) { this.mode = mode === 'notes' ? 'notes' : 'full'; this.applyMix(); }

  setReading(value) {
    this.reading = !!value;
    if (this.reading) this.hush(new Set(['arrival', 'approach', 'return', 'camera-approach', 'camera-return', 'hover']));
    this.applyMix();
  }

  setAudible(value) {
    this.visible = !!value;
    clearTimeout(this.suspendTimer);
    this.applyMix();
    if (!this.visible) {
      this.hush();
      this.scheduleSuspend();
    } else if (this.enabled && this.context?.state === 'suspended') {
      this.context.resume().catch(() => {
        this.enabled = false;
        this.wanted = false;
        this.applyMix();
      });
    }
  }

  scheduleSuspend() {
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if ((!this.visible || !this.enabled) && this.context?.state === 'running') this.context.suspend().catch(() => {});
    }, 1500);
  }

  update(zoom, motion) {
    this.zoom = zoom;
    this.motion = motion;
    if (!this.context || this.context.currentTime - this.lastUpdate < .095) return;
    this.lastUpdate = this.context.currentTime;
    this.applyMix();
  }

  applyMix() {
    this.mix = audioMix({ ...this, enabled: this.enabled, visible: this.visible });
    if (!this.context) return;
    glide(this.master.gain, this.mix.master, this.context, .2);
    glide(this.bed.gain, this.mix.bed, this.context, .65);
    glide(this.air.gain, this.mix.air, this.context, .3);
    glide(this.filter.frequency, this.mix.cutoff, this.context, .6);
  }

  tone(id, {
    pan = 0,
    kind = 'ui',
    delay = 0,
    frequency = noteFor(id),
    transpose = 1,
    slide = 1,
    duration = .6,
    attack = .012,
    level = .05,
    type = 'sine',
    partial = .16,
    cutoff = 0,
    wet = .3,
  } = {}) {
    if (!this.enabled || !this.visible || !this.context || this.context.state !== 'running' || !this.notes) return false;
    if (this.voices.size >= MAX_VOICES) {
      this.stats.dropped++;
      return false;
    }

    const ctx = this.context;
    const now = ctx.currentTime;
    const when = now + Math.max(0, delay);
    const length = Math.max(.08, duration);
    const end = when + length;
    const baseFrequency = Math.max(30, Number(frequency) * Math.max(.01, Number(transpose) || 1));
    const gain = (value = 0) => { const node = ctx.createGain(); node.gain.value = value; return node; };
    const envelope = gain();
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, Math.min(end - .025, when + Math.max(.004, attack)));
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, end);

    let output = envelope;
    let filter = null;
    if (cutoff) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.max(120, cutoff), when);
      filter.Q.value = .55;
      envelope.connect(filter);
      output = filter;
    }

    const panner = ctx.createStereoPanner?.();
    if (panner) {
      panner.pan.value = clamp(pan, -.65, .65);
      output.connect(panner);
      panner.connect(this.notes);
    } else output.connect(this.notes);

    let wetSend = null;
    if (this.reverb && wet > 0) {
      wetSend = gain(clamp(wet, 0, .8));
      output.connect(wetSend);
      wetSend.connect(this.reverb);
    }

    const oscillators = [
      { multiple: 1, amplitude: clamp(level, .001, .16), waveform: type },
      { multiple: 2.003, amplitude: clamp(level * partial, .0001, .04), waveform: 'sine' },
    ].map(({ multiple, amplitude, waveform }) => {
      const oscillator = ctx.createOscillator(), partialGain = gain(amplitude);
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(baseFrequency * multiple, when);
      if (slide !== 1) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, baseFrequency * multiple * slide), when + length * .76);
      oscillator.connect(partialGain);
      partialGain.connect(envelope);
      oscillator.start(when);
      oscillator.stop(end + .045);
      return { o: oscillator, g: partialGain };
    });

    const voice = { envelope, filter, panner, wetSend, oscillators, kind, when, cancelled: false };
    this.voices.add(voice);
    let cleaned = false;
    oscillators[0].o.onended = () => {
      if (cleaned) return;
      cleaned = true;
      for (const { o, g } of oscillators) { o.disconnect(); g.disconnect(); }
      envelope.disconnect();
      filter?.disconnect();
      panner?.disconnect();
      wetSend?.disconnect();
      this.voices.delete(voice);
    };
    this.stats.notes++;
    return true;
  }

  pluck(id, { pan = 0, kind = 'hover', delay = 0, transpose = 1 } = {}) {
    if (!this.enabled || !this.visible || !this.context || this.context.state !== 'running') return false;
    const now = this.context.currentTime;
    if (kind === 'hover' && (this.reading || now - this.lastNote < .6 || now - (this.noteHistory.get(id) ?? -100) < 7)) {
      this.stats.dropped++;
      return false;
    }
    const played = this.tone(id, {
      kind,
      pan,
      delay,
      transpose,
      duration: kind === 'hover' ? 1.6 : 1.3,
      level: kind === 'hover' ? .07 : kind === 'keep' ? .12 : .095,
      partial: kind === 'hover' ? .17 : .2,
      cutoff: kind === 'hover' ? 1900 : 2300,
      wet: kind === 'hover' ? .42 : .5,
    });
    if (!played) return false;
    this.lastNote = now;
    this.noteHistory.set(id, now);
    if (this.noteHistory.size > 256) this.noteHistory.delete(this.noteHistory.keys().next().value);
    return true;
  }

  hush(kinds = null) {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (voice.cancelled || (kinds && !kinds.has(voice.kind))) continue;
      voice.cancelled = true;
      this.stats.cancelled++;
      // Cancel future notes and current navigation tails with a short release.
      // Nothing stale should resume after a tab has been hidden.
      glide(voice.envelope.gain, 0, this.context, .012);
      for (const { o } of voice.oscillators) { try { o.stop(now + .065); } catch {} }
    }
  }

  event(name, seed = 'sky', pan = 0) {
    if (!this.enabled || !this.visible || !this.context || this.context.state !== 'running') return false;
    const requested = String(name || '');
    const kind = EVENT_ALIASES[requested] || requested;
    const cue = CUES[kind];

    // Preserve the former catch-all event behavior for callers with a custom name.
    if (!cue) return this.reading ? false : this.pluck(seed, { kind: requested || 'ui', pan });
    if (this.reading && NAVIGATION_EVENTS.has(kind)) return false;

    const now = this.context.currentTime;
    const last = this.eventHistory.get(kind) ?? -Infinity;
    if (now - last < EVENT_COOLDOWNS[kind]) {
      this.stats.dropped++;
      return false;
    }

    const base = noteFor(`${kind}:${seed}`);
    let played = false;
    for (let index = 0; index < cue.length; index++) {
      const { ratio = 1, pan: offset = 0, ...voice } = cue[index];
      played = this.tone(`${kind}:${seed}:${index}`, {
        ...voice,
        kind,
        frequency: base * ratio,
        pan: clamp(pan + offset, -.65, .65),
      }) || played;
    }
    if (played) {
      this.eventHistory.set(kind, now);
      this.stats.events++;
    }
    return played;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      wanted: this.wanted,
      cancelled: this.stats.cancelled,
      context: this.context?.state || 'not-created',
      mode: this.mode,
      volume: this.volume,
      reading: this.reading,
      voices: this.voices.size,
      notes: this.stats.notes,
      events: this.stats.events,
      dropped: this.stats.dropped,
      mix: this.mix || audioMix(),
    };
  }

  async dispose() {
    clearTimeout(this.suspendTimer);
    ++this.epoch;
    this.enabled = false;
    this.wanted = false;
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.voices.clear();
  }
}
