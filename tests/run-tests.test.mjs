// tools/run-tests.mjs keeps a list of known failing tests. The list must never go stale in silence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const runner = fileURLToPath(new URL('../tools/run-tests.mjs', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

async function runWith(testSource, known) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'happycoud-runner-'));
  try {
    const file = path.join(dir, 'fixture.test.mjs');
    await writeFile(file, testSource);
    const list = path.join(dir, 'known.json');
    await writeFile(list, JSON.stringify({ tests: known.map(name => ({ file: 'fixture.test.mjs', name })) }));
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST')) delete env[k];
    const run = spawnSync(process.execPath, [runner, `--known=${list}`, `--files=${file}`], { cwd: root, env, encoding: 'utf8', timeout: 60_000, windowsHide: true });
    return { status: run.status, out: run.stdout + run.stderr };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const src = body => `import test from 'node:test'; import assert from 'node:assert/strict';\n${body}`;

test('a listed test that still fails is excluded and the run passes', async () => {
  const r = await runWith(src(`test('good', () => {}); test('broken', () => assert.fail('x'));`), ['broken']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 known failures? excluded/);
});

test('a listed test that now passes is an error that says how to fix the list', async () => {
  const r = await runWith(src(`test('good', () => {}); test('fixed now', () => {});`), ['fixed now']);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /now passing: remove it from tests\/known-failures\.json/);
  assert.match(r.out, /fixed now/);
});

test('a listed name that matches no test is an error', async () => {
  const r = await runWith(src(`test('good', () => {});`), ['renamed away']);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /matches no test/);
});

test('a listed name that matches two tests is an error', async () => {
  const r = await runWith(src(`test('twin', () => assert.fail('a')); test('twin', () => {});`), ['twin']);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /matches 2 tests/);
});

test('an unlisted failing test still fails the run', async () => {
  const r = await runWith(src(`test('broken', () => assert.fail('x')); test('other', () => assert.fail('y'));`), ['broken']);
  assert.notEqual(r.status, 0, r.out);
});

test('a double-quoted listed test is found too', async () => {
  const r = await runWith(src(`test("quoted", () => assert.fail('x'));`), ['quoted']);
  assert.equal(r.status, 0, r.out);
});
