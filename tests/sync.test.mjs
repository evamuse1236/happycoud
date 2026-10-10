import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncComments } from '../scripts/comments.mjs';

const quiet = {warn() {}, log() {}};

test('a sync without the archive keeps an existing real snapshot instead of emptying it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'happycoud-sync-'));
  try {
    const outFile = path.join(dir, 'comments.json');
    const real = JSON.stringify({comments: [{id: 'a', text: 'kept'}, {id: 'b', text: 'also kept'}]});
    await fs.writeFile(outFile, real);
    const result = await syncComments({archiveDir: path.join(dir, 'missing-archive'), outFile, log: quiet});
    assert.equal(result.action, 'kept');
    assert.equal(await fs.readFile(outFile, 'utf8'), real, 'the earlier snapshot must be byte-identical');
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
});

test('a sync without the archive and without a snapshot writes the empty one, as before', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'happycoud-sync-'));
  try {
    const outFile = path.join(dir, 'data', 'comments.json');
    const result = await syncComments({archiveDir: path.join(dir, 'missing-archive'), outFile, log: quiet});
    assert.equal(result.action, 'empty');
    assert.equal(JSON.parse(await fs.readFile(outFile, 'utf8')).comments.length, 0);
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
});
