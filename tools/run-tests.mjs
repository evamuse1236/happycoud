// npm test: the node:test suite minus the known failures listed by exact name in tests/known-failures.json.
// npm run test:all (--all): every test, known failures included.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const TEST_FILES = ['scripts/comments.test.mjs', 'tests/*.test.mjs', 'tests/cinematic/*.test.mjs'];
const all = process.argv.includes('--all');
const known = JSON.parse(await readFile(new URL('../tests/known-failures.json', import.meta.url), 'utf8')).tests;
// A renamed or deleted test would silently drop out of the skip list, so each name must still exist in its file.
for (const t of known) {
  const source = await readFile(new URL('../' + t.file, import.meta.url), 'utf8');
  if (!source.includes(`test('${t.name}'`)) {
    console.error(`run-tests: known failure "${t.name}" is not in ${t.file}. Update tests/known-failures.json.`);
    process.exit(1);
  }
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const skips = all ? [] : known.flatMap(t => ['--test-skip-pattern', `^${escape(t.name)}$`]);

const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...skips, ...TEST_FILES], {
  cwd: root, windowsHide: true, timeout: 300_000, stdio: ['ignore', 'inherit', 'inherit'],
});
const code = await new Promise(resolve => child.on('close', (c, signal) => resolve(signal ? 1 : c ?? 1)));
if (code !== 0) process.exit(code);
if (!all) console.log(`run-tests: ${known.length} known failures excluded by name (tests/known-failures.json). Run \`npm run test:all\` to see them.`);
