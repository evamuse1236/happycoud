import test from 'node:test';
import assert from 'node:assert/strict';
import { wordTokens, commentTheme, relatedComments } from '../src/immersion.js';
import { normalizeData, conversationFor } from '../src/data.js';
import { fromReviewedArchive } from '../scripts/comments.mjs';

const archive = {account:'owner',posts:[{index:1,date_displayed:'August 21'}],
  comments:[{id:'a',text:'A specific joke\nwith  two spaces 🪐',author:'friend',post_index:1,post_url:'https://www.instagram.com/p/abc/',comment_url:'https://www.instagram.com/p/abc/c/a/',is_reply:false},
    {id:'orphan',text:'Reply without its parent',author:'friend',is_reply:true}],
  context_replies:[{id:'b',text:'The actual reply.',author:'owner',parent_comment_id:'a',is_account_owner:true,is_reply:true}]};

test('reviewed comments keep exact wording, attribution, dates, and reply relationships',()=>{
  const d=normalizeData(fromReviewedArchive(archive));
  assert.equal(d.comments.length,2);
  assert.equal(d.comments[0].text,archive.comments[0].text);
  assert.equal(d.comments[0].postDate,'August 21');
  assert.equal(d.comments[0].commentUrl,archive.comments[0].comment_url);
  assert.equal(conversationFor(d.comments[0])[0].text,'The actual reply.');
  assert.deepEqual(conversationFor(d.comments[1]),[]);
});
test('importing the reviewed JSON directly preserves its links and context',()=>{
  const d=normalizeData(archive);
  assert.equal(d.comments[0].commentUrl,archive.comments[0].comment_url);
  assert.equal(conversationFor(d.comments[0])[0].isOwner,true);
});
test('animation tokens reconstruct the exact source including whitespace and emoji',()=>{
  for(const text of ['  word\nnext\t  line ❤️‍🔥','कभी  कभी\n✨','👨‍👩‍👧‍👦 — hey!', '<img src=x>']) {
    assert.equal(wordTokens(text).join(''),text);
  }
});
test('themes follow recorded mood labels with a neutral fallback',()=>{
  assert.equal(commentTheme({moods:[]}), 'starlight');
  assert.equal(commentTheme({moods:['laugh']}),'laughter');
  assert.equal(commentTheme({moods:['love']}),'love');
  assert.equal(commentTheme({moods:['poetry']}),'poetry');
});
test('nearby words are real related records, exclude the current thread, and prioritize the same post',()=>{
  const c={id:'a',postUrl:'post',author:'friend',conversation:[{id:'b'}]};
  const others=[c,{id:'b',postUrl:'post'},{id:'c',postUrl:'other',author:'friend'},
    {id:'d',postUrl:'post',author:'other'},{id:'e',postUrl:'elsewhere',author:'stranger'}];
  assert.deepEqual(relatedComments(c,others).map(x=>x.id),['d','c']);
});
test('missing source and author never manufacture relationships',()=>{
  assert.deepEqual(relatedComments({id:'a',conversation:[]},[{id:'b'}]),[]);
});


test('owner identity is excluded even when flags are absent or misleading',()=>{
  const input={account:'khushi.o_o',comments:[
    {id:'owner',author:'Khushi.o_o',text:'My own reply',isOwner:false},
    {id:'alias',author:'Khusi.0_0',text:'My own words'},
    {id:'friend',author:'friend',text:'@khushi.o_o a comment for you'}]};
  assert.deepEqual(normalizeData(input).comments.map(c=>c.id),['friend']);
});
