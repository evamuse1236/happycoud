import test from 'node:test';
import assert from 'node:assert/strict';
import {isGeneric,parseSnapshot,moodsFor} from './comments.mjs';

test('generic reactions are excluded while specific jokes survive',()=>{
  for(const t of ['❤️😍','Niiice','uWu','Woww🔥' ])assert.equal(isGeneric(t),true,t);
  for(const t of ['Stunningggg omg','HOTTAAYYYY','Beautiful','So pretty','Pretty as usual 😍','Omggggg so pretty','Kitni sundar ho tum','We should do a swayamvar','Best girl in the best park','Saxy hairs deers.','Mary. Me deer.','What is your life purpose?','Your smile is just so genuine and beautiful❤'])assert.equal(isGeneric(t),false,t);
  assert.equal(moodsFor('The caption itself is a separate set of emotions. ❤️').includes('laugh'),false);
});

test('snapshot preserves original multiline text and associates the correct replies',()=>{
  const snapshot=`- main:
  - link "friend's profile picture":
    - /url: /friend/
  - link "friend":
    - /url: /friend/
    - generic: friend
  - link "8w":
    - /url: /p/abc/c/101/
    - time: 8w
  - text: Bari barsi khatan gaya si
  - text: Khat ke liyande Sushi
  - button "Reply":
    - generic: Reply
  - list:
    - link "khushi.o_o's profile picture":
      - /url: /khushi.o_o/
    - link "khushi.o_o":
      - /url: /khushi.o_o/
      - generic: khushi.o_o
    - link "8w":
      - /url: /p/abc/c/102/
      - time: 8w
    - link "@friend":
      - /url: /friend/
    - text: hello 🌸
    - button "Reply":
      - generic: Reply
  - link "missing's profile picture":
    - /url: /missing/
  - link "missing":
    - /url: /missing/
    - generic: missing
  - button "Reply":
    - generic: Reply
  - list:
    - link "other's profile picture":
      - /url: /other/
    - link "other":
      - /url: /other/
      - generic: other
    - link "8w":
      - /url: /p/abc/c/103/
      - time: 8w
    - text: This belongs to the missing parent.
    - button "Reply":
      - generic: Reply`;
  const parsed=parseSnapshot({url:'https://www.instagram.com/p/abc/',snapshot});
  assert.equal(parsed.length,3);
  assert.equal(parsed[0].text,'Bari barsi khatan gaya si\nKhat ke liyande Sushi');
  assert.equal(parsed[1].text,'@friend hello 🌸');
  assert.equal(parsed[1].parentId,'101');
  assert.equal(parsed[2].parentId,null);
  assert.equal(parsed[2].isReply,true);
});
