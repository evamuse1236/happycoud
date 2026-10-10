// Guards for the privacy rules in AGENTS.md: owner comments never ship, sample data never carries the owner's
// handles, collecting never modifies the source archive, and no transcription credential reaches the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { collectComments } from '../scripts/comments.mjs';
import { sampleData as appSample } from '../src/demo.js';
import { sampleData as fixtureSample } from './fixtures/sample-data.mjs';
import { OWNER_HANDLES } from '../src/data.js';
import { scanBuildOutput } from '../tools/check-build-output.mjs';

const tempDir = () => mkdtemp(path.join(os.tmpdir(), 'happycoud-test-'));
// Literal copies, so dropping a handle from OWNER_HANDLES fails a test instead of quietly passing.
const HANDLES = ['khushi.o_o', 'khushi.0_0', 'khusi.0_0'];
const checker = fileURLToPath(new URL('../tools/check-build-output.mjs', import.meta.url));
const ownerPattern = new RegExp(HANDLES.map(h => h.replace(/\./g, '\\.')).join('|'), 'i');

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

test('the shared owner list is exactly the three handles', () => {
  assert.deepEqual([...OWNER_HANDLES].sort(), [...HANDLES].sort());
});

// One shipped file per leak shape. Each must be reported, whatever the file type or key.
const o = HANDLES[0];
const leakCases = {
  'owner comment inside an HTML script': ['index.html', `<script>window.__DATA__={"comments":[{"author":"${o}","text":"hi"}]}</script>`],
  'owner comment inlined in a js bundle': ['assets/x.js', `var d=[{author:"${o}",text:"hi"}];`],
  'owner comment in a source map': ['assets/x.js.map', JSON.stringify({ version: 3, sourcesContent: [`const d=[{author:"${o}"}]`] })],
  'owner comment in ndjson': ['data/c.ndjson', `{"id":1,"author":"friend"}\n{"id":2,"author":"${o}","text":"hi"}\n`],
  'owner comment in a txt file': ['notes.txt', `author: "${o}"`],
  'owner comment in a gzip file': ['data/c.json.gz', gzipSync(JSON.stringify({ comments: [{ author: o }] }))],
  'JSON stringified inside a JSON string': ['data/s.json', JSON.stringify({ blob: JSON.stringify({ author: o }) })],
  'handle under the key from': ['data/f.json', JSON.stringify({ comments: [{ from: o }] })],
  'handle under user.handle': ['data/u.json', JSON.stringify({ comments: [{ user: { handle: o } }] })],
  'owner flag as the string "true"': ['data/t.json', JSON.stringify({ comments: [{ is_account_owner: 'true' }] })],
  'owner flag in html': ['index.html', '<script>var c={isOwner:true}</script>'],
  'handle followed by an escaped zero-width character': ['data/z.json', `{"comments":[{"author":"${o}\u200b"}]}`],
  'handle split by a raw zero-width character': ['assets/z.js', `var c={author:"khu​shi.o_o"}`],
  'second handle, @ prefix, upper case': ['index.html', `<script>var c={"username":"@${HANDLES[1].toUpperCase()}"}</script>`],
  'third handle': ['index.html', `<script>var c={"author":"${HANDLES[2]}"}</script>`],
};
for (const [name, [file, content]] of Object.entries(leakCases)) {
  test(`the build scan catches an owner comment: ${name}`, async () => {
    const dir = await tempDir();
    try {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), content);
      const { problems } = await scanBuildOutput(dir);
      assert.ok(problems.some(p => p.includes('account owner')), `not reported: ${problems.join('\n') || '(no problems)'}`);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('the build scan lets the owner list itself ship, and friends\' comments', async () => {
  const dir = await tempDir();
  try {
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'assets/index.js'), `const OWNER_HANDLES=${JSON.stringify(HANDLES)};const f=c=>OWNER_HANDLES.includes(c.author)||c.isOwner===true;var d={author:"friend.one"}`);
    await writeFile(path.join(dir, 'index.html'), '<script>var c={"author":"friend.two","isOwner":false}</script>');
    assert.deepEqual((await scanBuildOutput(dir)).problems, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// [file content, the secret part that must never be printed, label]
const secrets = {
  bearer: ['"Bearer abcdefghijklmnopqrstuvwxyz0123"', 'abcdefghijklmnopqrstuvwxyz0123', 'bearer token'],
  'sk key': ['"sk-ABCDEFGHIJKLMNOPQRSTUVWX1234"', 'ABCDEFGHIJKLMNOPQRSTUVWX1234', 'secret key'],
  'api key': ['{apiKey:"SUPERSECRETVALUE99"}', 'SUPERSECRETVALUE99', 'inline API key'],
};
for (const [name, [content, secret, label]] of Object.entries(secrets)) {
  test(`the build scan never prints the secret it found: ${name}`, async () => {
    const dir = await tempDir();
    try {
      await mkdir(path.join(dir, 'assets'));
      await writeFile(path.join(dir, 'assets/a.js'), `var x={k:${content}};`);
      const { problems } = await scanBuildOutput(dir);
      assert.ok(problems.some(p => p.startsWith('assets/a.js') && p.includes(label)), problems.join('\n'));
      const run = spawnSync(process.execPath, [checker, dir], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
      assert.equal(run.status, 1);
      const out = run.stdout + run.stderr;
      assert.ok(!out.includes(secret), `the output contains the secret:\n${out}`);
      assert.match(out, /at char \d+/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('after a LEAK line the scan never claims there are no owner comments', async () => {
  const dir = await tempDir();
  try {
    await mkdir(path.join(dir, 'data'));
    await writeFile(path.join(dir, 'data/comments.json'), JSON.stringify({ comments: [{ id: '1', author: 'friend', text: 'x', conversation: [{ id: '2', author: o, text: 'y' }] }] }));
    const run = spawnSync(process.execPath, [checker, dir], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /LEAK/);
    assert.doesNotMatch(run.stdout, /no owner comments/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
