// npm run verify: the gate to pass before calling a change done.
// 1. npm test  2. sync the real archive (SKIPPED loudly when it is missing)  3. vite build into a temp folder
// 4. scan that build for owner comments, transcription endpoints and credentials, then delete it  5. smoke drive.
// The build goes to a temp folder, never dist/, so verify cannot leave private comments where .openai/hosting.json deploys from.
import { runHidden } from './proc.mjs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceDir } from '../scripts/comments.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (label, args, timeout) => { console.log(`\n== verify: ${label}`); return runHidden(args, { cwd: root, timeout }); };
const results = [];
const step = async (label, args, timeout) => { const code = await run(label, args, timeout); results.push([label, code]); return code === 0; };

await step('tests (npm test)', ['tools/run-tests.mjs'], 300_000);

const archive = await stat(sourceDir).then(() => true, () => false);
if (archive) await step('sync the real archive into public/data (npm run sync)', ['scripts/comments.mjs'], 120_000);
else {
  console.log(`\n== verify: SKIPPED real-archive sync: ${sourceDir} is missing on this machine.`);
  console.log('   The build below has no real comments; the app falls back to its empty state and the labelled sample sky.');
  results.push(['sync the real archive', 'SKIPPED (archive missing)']);
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'happycoud-verify-'));
try {
  const out = path.join(tmp, 'dist');
  if (await step('production build (vite build, temp folder)', ['node_modules/vite/bin/vite.js', 'build', '--outDir', out, '--emptyOutDir'], 180_000))
    await step('build output privacy scan', ['tools/check-build-output.mjs', out], 60_000);
} finally {
  await rm(tmp, { recursive: true, force: true });
}

await step('smoke drive: sample sky at 390x844 and 1440x900, reduced motion', ['tools/smoke.mjs'], 300_000);

console.log('\n== verify summary');
for (const [label, code] of results) console.log(`${code === 0 ? 'PASS' : String(code).startsWith('SKIPPED') ? 'SKIP' : 'FAIL'}  ${label}${code === 0 ? '' : `: ${code}`}`);
const failed = results.some(([, code]) => code !== 0 && !String(code).startsWith('SKIPPED'));
process.exit(failed ? 1 : 0);
