import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phraseAt,wordState,belongsToCollection,clockLabel} from '../src/song-timeline.js';

test('the audio clock selects the right line across intro, gaps, reverse seeking and ending',()=>{
  const phrases=[{start:2,end:4},{start:7,end:9},{start:8,end:10}];
  assert.equal(phraseAt(phrases,0),-1);assert.equal(phraseAt(phrases,2),0);
  assert.equal(phraseAt(phrases,6.9),0);assert.equal(phraseAt(phrases,7),1);
  assert.equal(phraseAt(phrases,8.5),2);assert.equal(phraseAt(phrases,3),0);
  assert.equal(phraseAt(phrases,100),2);assert.equal(phraseAt([],2),-1);
});
test('word highlights use provider start/end including subsecond times and reverse seek',()=>{
  const word={start:14.125,end:14.781};
  assert.equal(wordState(word,14.124),'waiting');assert.equal(wordState(word,14.125),'singing');
  assert.equal(wordState(word,14.780),'singing');assert.equal(wordState(word,14.781),'sung');assert.equal(wordState(word,0),'waiting');
});
test('a song never borrows attribution from a different imported sky',()=>{
  const song={phrases:[{start:0}],commentsById:{a:{text:'Original 🌙'}}};
  assert.equal(belongsToCollection(song,[{id:'a',text:'Original 🌙'}]),true);
  assert.equal(belongsToCollection(song,[{id:'a',text:'Changed'}]),false);
  assert.equal(belongsToCollection(song,[{id:'b',text:'Original 🌙'}]),false);
  assert.equal(belongsToCollection(null,[]),false);assert.equal(belongsToCollection({...song,commentsById:{}},[]),false);
});
test('clock displays actual minutes without rounding ahead',()=>{
  assert.equal(clockLabel(135.66),'2:15');assert.equal(clockLabel(59.999),'0:59');assert.equal(clockLabel(NaN),'0:00');
});
