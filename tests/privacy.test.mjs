// Guards for the privacy rules in AGENTS.md: owner comments never ship, sample data never carries the owner's
// handles, collecting never modifies the source archive, and no transcription credential reaches the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { collectComments } from '../scripts/comments.mjs';
import { sampleData as appSample } from '../src/demo.js';
import { sampleData as fixtureSample } from './fixtures/sample-data.mjs';
import { scanBuildOutput, OWNER_HANDLES } from '../tools/check-build-output.mjs';

const tempDir = () => mkdtemp(path.join(os.tmpdir(), 'happycoud-test-'));
const ownerPattern = new RegExp(OWNER_HANDLES.map(h => h.replace(/\./g, '\\.')).join('|'), 'i');

// A miniature archive in the real layout: reviewed export, one post snapshot, and the post inventory.
// Khushi replies in all three places, under each of her handles.
const reviewed = {
  account: 'khushi.o_o',
  posts: [{ index: 1, date_displayed: '1 Sept 2026' }],
  comments: [
    { id: 1, text: 'You turn every ordinary day into a story.', author: 'friend.one', post_index: 1, is_reply: false },
    { id: 2, text: 'stop it 🙈', author: 'khushi.o_o', is_account_owner: true, parent_comment_id: 1, is_reply: true, post_index: 1 },
  ],
  context_replies: [
    { id: 3, text: 'Thank you so much!', author: 'khushi.0_0', parent_comment_id: 1, is_reply: true },
    { id: 4, text: 'She really does.', author: 'friend.two', parent_comment_id: 1, is_reply: true },
  ],
};
const snapshot = `- main:
  - link "friend.three's profile picture":
    - /url: /friend.three/
  - link "friend.three":
    - /url: /friend.three/
    - generic: friend.three
  - link "8w":
    - /url: /p/abc/c/101/
    - time: 8w
  - text: We should do a swayamvar for this photo
  - button "Reply":
    - generic: Reply
  - list:
    - link "khusi.0_0's profile picture":
      - /url: /khusi.0_0/
    - link "khusi.0_0":
      - /url: /khusi.0_0/
      - generic: khusi.0_0
    - link "8w":
      - /url: /p/abc/c/101/r/102/
      - time: 8w
    - text: only if you organise it
    - button "Reply":
      - generic: Reply`;

async function writeArchive(dir) {
  await writeFile(path.join(dir, 'khushi-comments-filtered.json'), JSON.stringify(reviewed, null, 2));
  await writeFile(path.join(dir, 'post-001.json'), JSON.stringify({ url: 'https://www.instagram.com/p/abc/', snapshot }));
  await writeFile(path.join(dir, 'post-inventory.json'), JSON.stringify([{ index: 1 }]));
}
async function fingerprint(dir) {
  const files = (await readdir(dir)).sort();
  return Promise.all(files.map(async f => [f, createHash('sha256').update(await readFile(path.join(dir, f))).digest('hex')]));
}

test('sample skies never carry the account owner\'s handles', () => {
  for (const [name, data] of [['src/demo.js', appSample()], ['tests/fixtures/sample-data.mjs', fixtureSample()]]) {
    assert.equal(data.sample, true, `${name} must stay labelled as sample data`);
    assert.doesNotMatch(JSON.stringify(data), ownerPattern, `${name} contains an owner handle`);
  }
});

test('collecting an archive never modifies the source files', async () => {
  const dir = await tempDir();
  try {
    await writeArchive(dir);
    const before = await fingerprint(dir);
    await collectComments(dir);
    assert.deepEqual(await fingerprint(dir), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('collected comments and their conversations exclude every owner handle', async () => {
  const dir = await tempDir();
  try {
    await writeArchive(dir);
    const result = await collectComments(dir);
    assert.ok(result.comments.some(c => c.author === 'friend.one'), 'the friend\'s reviewed comment is kept');
    assert.ok(result.comments.some(c => c.author === 'friend.three'), 'the snapshot comment is kept');
    // Write it exactly where `npm run sync` puts it, then scan it the way `npm run verify` scans a build.
    await mkdir(path.join(dir, 'out/data'), { recursive: true });
    await writeFile(path.join(dir, 'out/data/comments.json'), JSON.stringify(result));
    const { problems, realComments } = await scanBuildOutput(path.join(dir, 'out'));
    assert.deepEqual(problems, []);
    assert.equal(realComments, result.comments.length);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the build scan reports owner comments, transcription endpoints and keys', async () => {
  const dir = await tempDir();
  try {
    await mkdir(path.join(dir, 'data'));
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'assets/index.js'), 'const sky="clean";');
    assert.deepEqual((await scanBuildOutput(dir)).problems, []);
    await writeFile(path.join(dir, 'data/comments.json'), JSON.stringify({ comments: [{ id: '1', author: 'friend', text: 'hi', conversation: [{ id: '2', author: '@Khushi.O_O', text: 'hello' }] }] }));
    await writeFile(path.join(dir, 'assets/song.js'), 'fetch("https://eastus.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe",{headers:{"Ocp-Apim-Subscription-Key":k}})');
    const { problems } = await scanBuildOutput(dir);
    assert.ok(problems.some(p => p.startsWith('data/comments.json') && p.includes('account owner')), problems.join('\n'));
    assert.ok(problems.some(p => p.includes('Azure AI / speech endpoint')), problems.join('\n'));
    assert.ok(problems.some(p => p.includes('subscription key header')), problems.join('\n'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
