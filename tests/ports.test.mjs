// Port 8765 belongs to the owner's own servers. The guard must hold for the PORT variable and for
// Vite's own flags (`--port 8765`), and PORT=0 must mean "any free port", not the fixed default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from 'vite';
import { resolveDevPort } from '../tools/proc.mjs';

const configFile = new URL('../vite.config.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const resolveWith = async (env, inline = {}) => {
  const saved = process.env.PORT;
  if (env === undefined) delete process.env.PORT; else process.env.PORT = env;
  try { return await resolveConfig({ configFile, logLevel: 'silent', ...inline }, 'serve'); }
  finally { if (saved === undefined) delete process.env.PORT; else process.env.PORT = saved; }
};

test('PORT=8765 is refused', async () => {
  await assert.rejects(resolveWith('8765'), /8765/);
});

test('--port 8765 (vite flags merge over the config) is refused for dev and preview', async () => {
  await assert.rejects(resolveWith(undefined, { server: { port: 8765 } }), /8765/);
  await assert.rejects(resolveWith(undefined, { preview: { port: 8765 } }), /8765/);
});

test('without PORT the dev server starts at 4317 and may move on', async () => {
  const c = await resolveWith(undefined);
  assert.equal(c.server.port, 4317);
  assert.equal(c.server.strictPort, false);
});

test('PORT=4399 pins that port', async () => {
  const c = await resolveWith('4399');
  assert.equal(c.server.port, 4399);
  assert.equal(c.server.strictPort, true);
});

test('PORT=0 means a free port, not the fixed default', () => {
  assert.deepEqual(resolveDevPort({ PORT: '0' }), { port: 0, strictPort: false });
});

test('a PORT that is not a port number fails with a clear message', () => {
  for (const bad of ['abc', '-1', '70000', '12.5', '4317x']) {
    assert.throws(() => resolveDevPort({ PORT: bad }), /PORT must be/, bad);
  }
});
