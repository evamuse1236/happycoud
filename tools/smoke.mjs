// Drive the sample sky like a visitor: open it, enter silently, tap a comment twice to read it, close it.
// Runs at phone 390x844 (touch) and desktop 1440x900, then checks reduced motion skips the formation.
// Never screenshots real comments: it always reads the labelled sample sky.
//
// Env: HAPPYCOUD_URL  use an already-running server instead of starting `vite` on a free port
//      PORT           port for the server this script starts (default: a free port)
//      SMOKE_OUT      folder for screenshots + smoke-report.json (default test-results/smoke)
//      CHROMIUM_PATH  browser to use (default: Playwright's Chromium, installed by `npm run setup`)
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.resolve(root, process.env.SMOKE_OUT || 'test-results/smoke');
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const stopTree = pid => process.platform === 'win32'
  ? spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15_000, stdio: 'ignore' })
  : process.kill(pid, 'SIGTERM');

async function startServer() {
  const port = Number(process.env.PORT) || await freePort();
  const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js')], {
    cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite exited early:\n${log}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return { url, pid: child.pid }; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  stopTree(child.pid);
  throw new Error(`vite did not answer on ${url} within 30s:\n${log}`);
}

const check = (ok, message) => { if (!ok) throw new Error(message); };
const snapshot = page => page.evaluate(() => { const s = window.__sky.snapshot(); return { phase: s.phase, ready: s.ready, count: s.count, sample: s.sample, birth: s.birth, readingMix: s.readingMix, selected: s.selected, renderer: s.renderer, fallback: s.graphicsFallbackReason }; });

// Open the sample sky. Without a synced archive the app shows its empty state; use its sample button like a visitor.
async function openSample(page, url) {
  await page.goto(url + '?debug', { timeout: 30_000 });
  await page.waitForFunction(() => window.__sky && (window.__sky.snapshot().ready || !document.querySelector('#empty').hidden), null, { timeout: 30_000 });
  let route;
  if (await page.locator('#empty').isVisible()) {
    route = 'empty state -> "Explore an illustrative sample sky"';
    await page.locator('#demo').click();
  } else {
    route = '?demo=1 (a real archive is loaded; it is never screenshotted)';
    await page.goto(url + '?demo=1&debug', { timeout: 30_000 });
  }
  await page.waitForFunction(() => window.__sky.snapshot().ready && window.__sky.snapshot().sample, null, { timeout: 30_000 });
  return route;
}

async function readOneComment(page, vp) {
  const tap = (x, y) => vp.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  const target = await page.evaluate(() => window.__sky.snapshot().nodes
    .filter(n => n.point && n.point.x > 80 && n.point.x < innerWidth - 80 && n.point.y > 110 && n.point.y < innerHeight - 120)
    .sort((a, b) => Math.abs(a.point.x - innerWidth / 2) - Math.abs(b.point.x - innerWidth / 2))[0]);
  check(target, 'no comment is on screen to tap');
  await tap(target.point.x, target.point.y);
  try { await page.waitForFunction(() => window.__sky.snapshot().phase === 'focused', null, { timeout: 30_000 }); }
  catch { const s = await snapshot(page); throw new Error(`tapping ${target.id} at (${Math.round(target.point.x)},${Math.round(target.point.y)}) did not focus it: phase=${s.phase} selected=${s.selected}`); }
  check(!(await page.locator('#reader').evaluate(el => el.open)), 'the first tap opened the reader; it should only zoom in');
  const point = await page.evaluate(() => { const s = window.__sky.snapshot(); return s.nodes.find(n => n.id === s.selected).point; });
  await tap(point.x, point.y);
  await page.waitForFunction(() => { const s = window.__sky.snapshot(); return s.phase === 'reading' && s.readingMix === 1; }, null, { timeout: 30_000 });
  // The reader keeps the exact text in .memory-original (screen readers) and draws an aria-hidden, line-broken copy beside it.
  const shown = await page.evaluate(() => { const q = document.querySelector('#reader-quote'); return (q.querySelector('.memory-original') || q).textContent; });
  const original = await page.evaluate(() => window.__sky.original(window.__sky.snapshot().selected).text);
  check(shown === original, `the reader changed the comment text: ${JSON.stringify(shown)} vs ${JSON.stringify(original)}`);
  return { id: await page.evaluate(() => window.__sky.snapshot().selected), text: shown };
}

const report = { url: null, startedServer: false, viewports: [], reducedMotion: null, passed: false };
let server = null, browser = null;
try {
  await mkdir(out, { recursive: true });
  if (process.env.HAPPYCOUD_URL) report.url = process.env.HAPPYCOUD_URL.replace(/\/?$/, '/');
  else { server = await startServer(); report.url = server.url; report.startedServer = true; report.serverPid = server.pid; }
  // Headless Chromium defaults to SwiftShader, which renders the 1440x900 sky at ~3 fps and stalls camera flights.
  // On Windows use the real GPU through D3D11 (~60 fps measured); SMOKE_GPU=0 forces software rendering.
  const gpuArgs = process.platform === 'win32' && process.env.SMOKE_GPU !== '0' ? ['--enable-gpu', '--use-angle=d3d11'] : [];
  browser = await chromium.launch({ headless: true, args: gpuArgs, executablePath: process.env.CHROMIUM_PATH || undefined, timeout: 60_000 });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const route = await openSample(page, report.url);
    const ready = await snapshot(page);
    ready.gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null; });
    check(ready.sample === true && ready.count === 360, `expected the 360-comment sample sky, got ${ready.count} (sample=${ready.sample})`);
    await page.locator('#enter-silent').click();
    await page.evaluate(() => window.__sky.finish());
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `${vp.name}-${vp.width}x${vp.height}-sky.png`) });
    const comment = await readOneComment(page, vp);
    await page.screenshot({ path: path.join(out, `${vp.name}-${vp.width}x${vp.height}-reader.png`) });
    await page.locator('#reader-close').click();
    // Closing the reader steps back to the zoomed-in comment ('focused'), not straight out to the whole sky.
    await page.waitForFunction(() => ['focused', 'sky'].includes(window.__sky.snapshot().phase) && !document.querySelector('#reader').open, null, { timeout: 15_000 });
    check(errors.length === 0, `page errors at ${vp.name}: ${errors.join(' | ')}`);
    report.viewports.push({ ...vp, route, renderer: ready.renderer, gpu: ready.gpu, graphicsFallback: ready.fallback ?? null, opened: comment.id, pageErrors: errors.length });
    console.log(`PASS ${vp.name} ${vp.width}x${vp.height}: renderer=${ready.renderer} on ${ready.gpu}${ready.fallback ? ` (fallback: ${ready.fallback})` : ''}, read ${comment.id}, 0 page errors`);
    await context.close();
  }

  // Reduced motion: entering must show the finished sky at once, with no formation to wait through.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openSample(page, report.url);
  await page.locator('#enter-silent').click();
  await page.waitForTimeout(400);
  const s = await snapshot(page);
  check(s.birth === 1 && s.phase === 'sky', `reduced motion still played the formation (birth=${s.birth}, phase=${s.phase})`);
  report.reducedMotion = { birthAfter400ms: s.birth, phase: s.phase };
  console.log('PASS reduced motion: the sky is fully formed on entry');
  await context.close();
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  console.error('FAIL ' + (error?.message || error));
} finally {
  await browser?.close().catch(() => {});
  if (server) stopTree(server.pid);
  await writeFile(path.join(out, 'smoke-report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  console.log(`smoke: screenshots and smoke-report.json in ${out}`);
}
process.exit(report.passed ? 0 : 1);
