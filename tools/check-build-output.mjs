// Scan a built output folder (vite build) for two kinds of leak:
// 1. A comment written by Khushi (owner handle or owner flag) in any shipped JSON, including conversation context.
// 2. A transcription endpoint or credential (the song was aligned with Azure MAI-Transcribe; none of it may reach the browser).
// Usage: node tools/check-build-output.mjs <dir>   (exit 1 and one line per problem when something leaks)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWNER_HANDLES } from '../src/data.js';

export const SECRET_PATTERNS = [
  [/cognitiveservices\.azure\.com|services\.ai\.azure\.com|\.openai\.azure\.com|api\.cognitive\.microsoft\.com|speech\.microsoft\.com/i, 'Azure AI / speech endpoint'],
  [/speechtotext\/|\/transcriptions?[:/?]/i, 'transcription API path'],
  [/Ocp-Apim-Subscription-Key/i, 'Azure subscription key header'],
  [/\bAZURE_[A-Z_]*(KEY|TOKEN|SECRET)\b/, 'Azure credential variable'],
  [/\bapi[-_]?key["']?\s*[:=]\s*["'][^"']{8,}/i, 'inline API key'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/, 'bearer token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'secret key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/song-work\//, 'reference to the private song-work/ folder'],
];
const TEXT = /\.(html|js|mjs|css|json|txt|map|svg|webmanifest)$/i;
const handle = v => String(v ?? '').trim().replace(/^@/, '').toLowerCase();
const ownerAuthored = o => o.isOwner === true || o.is_account_owner === true || OWNER_HANDLES.includes(handle(o.author)) || OWNER_HANDLES.includes(handle(o.username));

async function filesIn(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesIn(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function ownerEntries(value, where, problems) {
  if (Array.isArray(value)) value.forEach((v, i) => ownerEntries(v, `${where}[${i}]`, problems));
  else if (value && typeof value === 'object') {
    if (ownerAuthored(value)) problems.push(`${where}: comment by the account owner (${value.author ?? value.username ?? 'owner flag'}) is shipped`);
    for (const [k, v] of Object.entries(value)) ownerEntries(v, `${where}.${k}`, problems);
  }
}

/** Returns { problems: string[], realComments: number } for the built folder `dir`. */
export async function scanBuildOutput(dir) {
  const problems = [];
  let realComments = 0;
  for (const file of await filesIn(dir)) {
    if (!TEXT.test(file)) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const text = await readFile(file, 'utf8');
    for (const [pattern, label] of SECRET_PATTERNS) {
      const m = text.match(pattern);
      if (m) problems.push(`${rel}: ${label} ("${m[0].slice(0, 40)}")`);
    }
    if (file.endsWith('.json')) {
      let data;
      try { data = JSON.parse(text); } catch { problems.push(`${rel}: invalid JSON`); continue; }
      ownerEntries(data, rel, problems);
      if (rel === 'data/comments.json' && Array.isArray(data.comments) && data.sample !== true) realComments = data.comments.length;
    }
  }
  return { problems, realComments };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node tools/check-build-output.mjs <built-dir>'); process.exit(2); }
  const { problems, realComments } = await scanBuildOutput(dir);
  for (const p of problems) console.error('LEAK ' + p);
  if (realComments === 0) console.log('SAMPLE-DATA: the build output contains 0 real comments (no synced archive). Visitors get the import screen and the labelled sample sky.');
  else console.log(`build output: ${realComments} real comments, no owner comments.`);
  if (problems.length) process.exit(1);
  console.log('build output: no owner comments, transcription endpoints or credentials found.');
}
