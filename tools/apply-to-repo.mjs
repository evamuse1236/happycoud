#!/usr/bin/env node
/** Apply only the front end. Never edit the collector, private data, or Vite config. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv[2];
if (!argument || process.argv.includes('--help')) {
  console.log('Usage: node tools/apply-to-repo.mjs /absolute/path/to/happycoud [--dry-run]');
  console.log('Creates a sibling backup before replacing index.html and the constellation source files.');
  process.exit(argument ? 0 : 1);
}
const destination = path.resolve(argument);
const dryRun = process.argv.includes('--dry-run');
const sourceFiles = ['index.html', ...(await fs.readdir(path.join(source, 'src')))
  .filter(name => /\.(js|css)$/.test(name)).map(name => path.join('src', name))];

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
try {
  if (destination === source) throw new Error('Choose the existing happycoud repository, not this source bundle.');
  for (const required of ['package.json', 'vite.config.js', 'scripts/comments.mjs']) {
    if (!await exists(path.join(destination, required))) {
      throw new Error(`Not the expected happycoud repository: ${required} is missing. Nothing was changed.`);
    }
  }
  for (const relative of sourceFiles) {
    const target = path.join(destination, relative);
    if (await exists(target) && (await fs.lstat(target)).isSymbolicLink()) {
      throw new Error(`Refusing to overwrite a symbolic link: ${relative}. Nothing was changed.`);
    }
  }
  if (await exists(path.join(destination, 'src')) && (await fs.lstat(path.join(destination, 'src'))).isSymbolicLink()) {
    throw new Error('Refusing to write through a symbolic-link src directory. Nothing was changed.');
  }
  console.log(`${dryRun ? 'Would apply' : 'Applying'} ${sourceFiles.length} front-end files to ${destination}`);
  for (const file of sourceFiles) console.log('  ' + file);
  if (dryRun) {
    console.log('Dry run finished. No files were changed.');
    process.exit(0);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  const backup = path.join(path.dirname(destination), path.basename(destination) + '-constellation-backup-' + stamp);
  await fs.mkdir(backup, { recursive: false });
  const overwritten = [], created = [];
  // Complete the backup before the first replacement.
  for (const file of sourceFiles) {
    const target = path.join(destination, file);
    if (await exists(target)) {
      const saved = path.join(backup, file);
      await fs.mkdir(path.dirname(saved), { recursive: true });
      await fs.copyFile(target, saved);
      overwritten.push(file);
    } else created.push(file);
  }
  await fs.writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ destination, overwritten, created }, null, 2));
  await fs.writeFile(path.join(backup, 'restore.mjs'), `
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const m=JSON.parse(await fs.readFile(path.join(here,'manifest.json'),'utf8'));
if(!process.argv.includes('--restore')){console.log('This restores the old front end. Run: node restore.mjs --restore');process.exit(0);}
for(const file of m.overwritten){await fs.copyFile(path.join(here,file),path.join(m.destination,file));}
for(const file of m.created){await fs.rm(path.join(m.destination,file),{force:true});}
console.log('Restored front end in '+m.destination+'. Collector and private data were not changed.');
`);
  try {
    for (const file of sourceFiles) {
      const target = path.join(destination, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(source, file), target);
    }
  } catch (error) {
    for (const file of overwritten) await fs.copyFile(path.join(backup, file), path.join(destination, file));
    for (const file of created) await fs.rm(path.join(destination, file), { force: true });
    throw new Error(`Apply failed and the previous front end was restored: ${error.message}`);
  }
  console.log('\nApplied. Backup: ' + backup);
  console.log('Unchanged: package.json, package-lock.json, vite.config.js, scripts/, public/data/, and extraction snapshots.');
  console.log('Run your repository’s existing npm run dev command. No push or deployment has been performed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
