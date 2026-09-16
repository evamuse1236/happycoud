import test from 'node:test';
import assert from 'node:assert/strict';
import { ObservatorySound, SOUND_EVENTS } from '../src/sound.js';

class CaptureSound extends ObservatorySound {
  constructor() {
    super();
    this.enabled = true;
    this.context = { state: 'running', currentTime: 10 };
    this.captured = [];
  }
  tone(id, options) {
    this.captured.push({ id, ...options });
    this.stats.notes++;
    return true;
  }
}

const capture = (name, seed = 'same-seed', pan = 0) => {
  const sound = new CaptureSound();
  assert.equal(sound.event(name, seed, pan), true);
  return sound.captured;
};

test('the public cue vocabulary covers every authored interaction', () => {
  assert.deepEqual(SOUND_EVENTS, [
    'arrival', 'camera-approach', 'camera-return', 'reader-open', 'reader-close',
    'mood-switch', 'library-open', 'library-close', 'list-select', 'keep',
    'unkeep', 'options-open', 'options-close', 'search-update', 'search-results',
    'import-success',
  ]);
  for (const name of SOUND_EVENTS) {
    const voices = capture(name);
    assert.ok(voices.length > 0, `${name} should have an authored cue`);
    assert.ok(voices.every(voice => voice.kind === name));
  }
});

test('legacy event names retain the event(name, seed, pan) API', () => {
  for (const [legacy, current] of Object.entries({ approach: 'camera-approach', return: 'camera-return', open: 'reader-open', close: 'reader-close' })) {
    const before = capture(legacy, 'comment-7', .2);
    const after = capture(current, 'comment-7', .2);
    assert.deepEqual(before, after);
  }
});

test('camera and panel cues follow the direction of their transition', () => {
  assert.ok(capture('camera-approach')[0].slide > 1);
  assert.ok(capture('camera-return')[0].slide < 1);
  const open = capture('reader-open');
  const close = capture('reader-close');
  assert.ok(open.at(-1).frequency > open[0].frequency);
  assert.ok(close.at(-1).frequency < close[0].frequency);
  assert.ok(capture('options-open')[0].slide > 1);
  assert.ok(capture('options-close')[0].slide < 1);
});

test('arrival gather fits the final 1.4 seconds of the opening choreography', () => {
  const voices = capture('arrival');
  assert.equal(voices.length, 4);
  assert.ok(Math.max(...voices.map(voice => voice.delay + voice.duration)) <= 1.4);
  assert.deepEqual(voices.map(voice => voice.pan), [-.42, .27, -.12, 0]);
});

test('frequent search feedback is smaller than the settled result cue', () => {
  const update = capture('search-update');
  const results = capture('search-results');
  assert.equal(update.length, 1);
  assert.equal(results.length, 2);
  assert.ok(update[0].duration < Math.min(...results.map(voice => voice.duration)));
  assert.ok(update[0].level < Math.max(...results.map(voice => voice.level)));
});

test('reading silences camera travel while keeping deliberate reader controls audible', () => {
  const sound = new CaptureSound();
  sound.reading = true;
  assert.equal(sound.event('camera-approach', 'a'), false);
  assert.equal(sound.event('arrival', 'a'), false);
  assert.equal(sound.event('reader-close', 'a'), true);
  assert.equal(sound.event('keep', 'a'), true);
  assert.equal(sound.captured.every(voice => ['reader-close', 'keep'].includes(voice.kind)), true);
});

test('events never create or resume audio without the explicit sound toggle', () => {
  let contexts = 0;
  class Context { constructor() { contexts++; } }
  const sound = new ObservatorySound({ contextFactory: Context });
  assert.equal(sound.event('reader-open', 'a'), false);
  assert.equal(sound.context, null);
  assert.equal(contexts, 0);
});

test('hidden and suspended contexts cannot emit event cues', () => {
  const hidden = new CaptureSound();
  hidden.visible = false;
  assert.equal(hidden.event('keep', 'a'), false);
  assert.equal(hidden.captured.length, 0);
  const suspended = new CaptureSound();
  suspended.context.state = 'suspended';
  assert.equal(suspended.event('keep', 'a'), false);
  assert.equal(suspended.captured.length, 0);
});

test('rapid repeated controls are rate limited without blocking the next settled event', () => {
  const sound = new CaptureSound();
  assert.equal(sound.event('search-update', 'a'), true);
  assert.equal(sound.event('search-update', 'ab'), false);
  assert.equal(sound.stats.dropped, 1);
  sound.context.currentTime += .17;
  assert.equal(sound.event('search-update', 'ab'), true);
});

test('event panning remains inside a conservative stereo field', () => {
  const right = capture('arrival', 'a', .64);
  const left = capture('arrival', 'a', -.64);
  assert.ok(right.every(voice => voice.pan >= -.65 && voice.pan <= .65));
  assert.ok(left.every(voice => voice.pan >= -.65 && voice.pan <= .65));
});

class FakeParam {
  constructor(value = 0) { this.value = value; this.calls = []; }
  record(name, value, time, extra) { this.value = value; this.calls.push({ name, value, time, extra }); }
  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exponential', value, time); }
  setTargetAtTime(value, time, extra) { this.record('target', value, time, extra); }
  cancelAndHoldAtTime(time) { this.calls.push({ name: 'hold', time }); }
  cancelScheduledValues(time) { this.calls.push({ name: 'cancel', time }); }
}

class FakeNode {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class FakeGain extends FakeNode { constructor() { super(); this.gain = new FakeParam(); } }
class FakeFilter extends FakeNode { constructor() { super(); this.frequency = new FakeParam(); this.Q = new FakeParam(); } }
class FakePanner extends FakeNode { constructor() { super(); this.pan = new FakeParam(); } }
class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this.starts = [];
    this.stops = [];
    this.onended = null;
  }
  start(time) { this.starts.push(time); }
  stop(time) { this.stops.push(time); }
}

class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 2; this.oscillators = []; }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createStereoPanner() { return new FakePanner(); }
  createOscillator() { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
}

function synthesizedSound() {
  const sound = new ObservatorySound();
  sound.context = new FakeContext();
  sound.enabled = true;
  sound.notes = new FakeNode();
  sound.reverb = new FakeNode();
  return sound;
}

test('tone envelopes use safe ramps and positive exponential targets', () => {
  const sound = synthesizedSound();
  assert.equal(sound.tone('safe', { frequency: 220, slide: 1.4, duration: .4, attack: .01, cutoff: 1400 }), true);
  const voice = [...sound.voices][0];
  assert.deepEqual(voice.envelope.gain.calls.map(call => call.name), ['set', 'linear', 'exponential']);
  assert.equal(voice.envelope.gain.calls[0].value, 0);
  assert.equal(voice.envelope.gain.calls[1].value, 1);
  assert.ok(voice.envelope.gain.calls[2].value > 0);
  assert.ok(sound.context.oscillators.every(oscillator => oscillator.frequency.calls.at(-1).value > 0));
});

test('the synth has a strict twelve-voice polyphony ceiling', () => {
  const sound = synthesizedSound();
  for (let index = 0; index < 12; index++) assert.equal(sound.tone(`voice-${index}`), true);
  assert.equal(sound.voices.size, 12);
  assert.equal(sound.tone('voice-overflow'), false);
  assert.equal(sound.voices.size, 12);
  assert.equal(sound.stats.dropped, 1);
});
