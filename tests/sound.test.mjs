import test from 'node:test';
import assert from 'node:assert/strict';
import {ObservatorySound, audioMix, MAX_VOICES} from '../src/sound.js';

class ConsentSound extends ObservatorySound {
  create(){return this.context={state:'suspended',currentTime:0,resume:()=>new Promise(r=>this.release=r)};}
  applyMix(){}
  tick(){}
}
test('muting during consent prevents a delayed enable',async()=>{
  const s=new ConsentSound(),pending=s.enable();assert.equal(s.wanted,true);
  s.disable();s.release();assert.equal(await pending,false);assert.equal(s.enabled,false);assert.equal(s.interval,null);
});
test('audio activation failure resets consent so the next attempt can retry',async()=>{
  const s=new ConsentSound();s.create=()=>{throw Error('not allowed');};
  await assert.rejects(s.enable(),/not allowed/);assert.equal(s.wanted,false);assert.equal(s.enabled,false);
});
test('the newest enable wins after a rapid off-on gesture',async()=>{
  const s=new ConsentSound(),first=s.enable(),releaseFirst=s.release;s.disable();const second=s.enable(),releaseSecond=s.release;
  releaseFirst();assert.equal(await first,false);releaseSecond();assert.equal(await second,true);s.disable();
});
test('ordinary interaction events leave the score undisturbed',()=>{
  const s=new ObservatorySound();let requests=0;s.focus=()=>requests++;
  for(const name of ['arrival','camera-approach','camera-return','reader-close','mood-switch','library-open','library-close','search-update','search-results','options-open','options-close'])s.event(name,'a');
  s.note('hover');assert.equal(requests,0);s.event('reader-open','a');assert.equal(requests,1);
});
test('reader focus stays silent before consent and while hidden',()=>{
  const s=new ObservatorySound();s.focus('a');assert.equal(s.context,null);assert.equal(s.pendingFocus,null);
  s.enabled=true;s.visible=false;s.focus('a');assert.equal(s.pendingFocus,null);
});
test('reading gently lowers the bed and reverb and silences motion air',()=>{
  const travel=audioMix({enabled:true,motion:1}),read=audioMix({enabled:true,motion:1,reading:true});
  assert.ok(read.bed>0&&read.bed<travel.bed);assert.ok(read.wet<travel.wet);assert.equal(read.air,0);
});
test('polyphony has a hard ceiling and disposes overflow nodes',()=>{
  const s=new ObservatorySound();let stops=0,disconnects=0;
  for(let i=0;i<MAX_VOICES;i++)s.voices.add({});
  assert.equal(s.track([{stop(){stops++;}}],[{disconnect(){disconnects++;}}],{},1),null);
  assert.equal(s.voices.size,MAX_VOICES);assert.equal(stops,1);assert.equal(disconnects,1);assert.equal(s.stats.dropped,1);
});

test('a feeling contributes recurring phrases without restarting the base score',()=>{
  const s=new ObservatorySound(),phrases=[],chords=[];
  s.context={state:'running',currentTime:10};s.enabled=true;s.nextChord=10;s.nextFelt=Infinity;
  s.bow=(m,at)=>chords.push({m,at});s.piano=()=>{};
  s.moodNote=(m,at)=>phrases.push({m,at,mood:s.mood});
  s.setMood('love');
  for(let t=10;t<34;t+=.1){s.context.currentTime=t;s.tick();}
  assert.ok(phrases.length>=3);assert.ok(chords.length>=8);assert.ok(phrases.every(p=>p.mood==='love'));
  const chordIndex=s.chordIndex;s.setMood('poetry');assert.equal(s.chordIndex,chordIndex);
  for(let t=34;t<49;t+=.1){s.context.currentTime=t;s.tick();}
  assert.ok(phrases.filter(p=>p.mood==='poetry').length>=2);
  const count=phrases.length;s.setMood('all');
  for(let t=49;t<66;t+=.1){s.context.currentTime=t;s.tick();}
  assert.equal(phrases.length,count);assert.ok(s.chordIndex>chordIndex);
});
test('choosing a feeling before consent creates no audio or timer',()=>{
  const s=new ObservatorySound();s.setMood('laugh');s.tick();
  assert.equal(s.mood,'laugh');assert.equal(s.context,null);assert.equal(s.interval,null);assert.equal(s.stats.moodNotes,0);
  s.setMood('unknown');assert.equal(s.mood,'all');
});

test('frame updates do not restart an in-progress instrument crossfade',()=>{
  const s=new ObservatorySound(),param=()=>({value:0,targets:[],cancelAndHoldAtTime(){},setTargetAtTime(target){this.targets.push(target);}});
  s.context={currentTime:1};
  for(const key of ['master','bed','wet','air'])s[key]={gain:param()};
  s.bedFilter={frequency:param()};s.moodBuses={love:{gain:param()},poetry:{gain:param()}};
  s.moodTargets={love:0,poetry:0};s.setMood('love');
  for(let i=0;i<100;i++)s.update({motion:i/100});
  assert.deepEqual(s.moodBuses.love.gain.targets,[.7]);
  s.setMood('poetry');for(let i=0;i<100;i++)s.update();
  assert.deepEqual(s.moodBuses.love.gain.targets,[.7,0]);assert.deepEqual(s.moodBuses.poetry.gain.targets,[.7]);
  s.update({reading:true});s.update({reading:true});assert.deepEqual(s.moodBuses.poetry.gain.targets,[.7,.28]);
  s.setMode('notes');assert.deepEqual(s.moodBuses.poetry.gain.targets,[.7,.28,0]);
});
