// npm test: the node:test suite minus the known failures listed by exact name in tests/known-failures.json.
// npm run test:all (--all): every test, known failures included.
// Both modes first run the listed tests on their own and fail when the list has gone stale: a listed test that now
// passes ("now passing"), or a listed name that matches no test or more than one.
// Options (used by tests/run-tests.test.mjs): --known=<json file>, --files=<comma separated test files or globs>.
import { runHidden, runCaptured } from './proc.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const TEST_FILES = ['scripts/comments.test.mjs', 'tests/*.test.mjs', 'tests/cinematic/*.test.mjs'];
const option = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const all = process.argv.includes('--all');
const files = option('files')?.split(',') ?? TEST_FILES;
const knownPath = option('known') ?? fileURLToPath(new URL('../tests/known-failures.json', import.meta.url));
const known = JSON.parse(await readFile(knownPath, 'utf8')).tests;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (known.length) {
  const patterns = known.flatMap(t => ['--test-name-pattern', `^${escape(t.name)}$`]);
  const { code, output } = await runCaptured(['--test', '--test-reporter=tap', ...patterns, ...files], { cwd: root, timeout: 300_000 });
  if (typeof code === 'string') { console.error(`run-tests: checking the known failures: ${code}`); process.exit(1); }
  const results = [...output.matchAll(/^\s*(not ok|ok) \d+ - (.*?)(?: # (?:SKIP|TODO).*)?$/gm)].map(m => ({ ok: m[1] === 'ok', name: m[2].replace(/\\#/g, '#') }));
  let stale = false;
  for (const t of known) {
    const found = results.filter(r => r.name === t.name);
    if (found.length === 0) { console.error(`run-tests: known failure "${t.name}" matches no test. Rename or remove it in tests/known-failures.json.`); stale = true; }
    else if (found.length > 1) { console.error(`run-tests: known failure "${t.name}" matches ${found.length} tests, so the name is ambiguous. Rename one of them.`); stale = true; }
    else if (found[0].ok) { console.error(`run-tests: now passing: remove it from tests/known-failures.json: "${t.name}"`); stale = true; }
  }
  if (stale) process.exit(1);
}

const skips = all ? [] : known.flatMap(t => ['--test-skip-pattern', `^${escape(t.name)}$`]);
const code = await runHidden(['--test', '--test-reporter=spec', ...skips, ...files], { cwd: root, timeout: 300_000 });
if (code !== 0) { if (typeof code === 'string') console.error(`run-tests: ${code}`); process.exit(typeof code === 'number' ? code : 1); }
if (!all) console.log(`run-tests: ${known.length} known failures excluded by name (tests/known-failures.json). Run \`npm run test:all\` to see them.`);
