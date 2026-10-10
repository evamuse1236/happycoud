// Scan a built output folder (vite build) for two kinds of leak:
// 1. A comment written by Khushi (owner handle or owner flag) anywhere in a shipped file: JSON, HTML, JS, source maps,
//    ndjson, text, and inside .gz/.br. The bundle legitimately contains the handle list (OWNER_HANDLES), so a handle only
//    counts when it is the VALUE of an author-like key (author, username, from, handle ...) or an owner flag is true.
// 2. A transcription endpoint or credential (the song was aligned with Azure MAI-Transcribe; none of it may reach the browser).
// Problem lines carry the label, the file and the match offset, never the matched text (it may be a secret).
// Usage: node tools/check-build-output.mjs <dir>   (exit 1 and one line per problem when something leaks)
import { readdir, readFile } from 'node:fs/promises';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
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
const TEXT = /\.(html|js|mjs|css|json|jsonl|ndjson|txt|csv|map|svg|webmanifest)$/i;
const PACKED = /\.(gz|br)$/i;

// Characters that hide a handle from a plain comparison, as raw characters or as JSON \uXXXX escapes.
const ZERO_WIDTH = /[­​-‏‪-‮⁠-⁤﻿]|\\u(?:00ad|200[b-f]|202[a-e]|206[0-4]|feff)/gi;
const stripZeroWidth = s => s.replace(ZERO_WIDTH, '');

const handlePattern = OWNER_HANDLES.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// `key: "handle"`, `"key":"handle"`, `key="handle"`, also with the quotes escaped inside a JSON string.
const OWNER_HANDLE_VALUE = new RegExp(String.raw`\b(?:author|username|from|handle|owner_username|owner|user|screen_name|login|by|commenter)\\*["']?\s*[:=]\s*\\*["']@?(?:${handlePattern})(?![\w.])`, 'i');
const OWNER_FLAG_TRUE = new RegExp(String.raw`\b(?:isOwner|is_owner|isAccountOwner|is_account_owner|owner)\\*["']?\s*[:=]\s*\\*["']?(?:true|!0)(?![\w])`, 'i');

const handle = v => stripZeroWidth(String(v ?? '')).trim().replace(/^@/, '').toLowerCase();
const isTrue = v => v === true || String(v).trim().toLowerCase() === 'true';
const HANDLE_KEYS = ['author', 'username', 'from', 'handle', 'owner_username', 'user', 'screen_name', 'login', 'by', 'commenter'];
const FLAG_KEYS = ['isOwner', 'is_owner', 'isAccountOwner', 'is_account_owner'];
const ownerAuthored = o => FLAG_KEYS.some(k => isTrue(o[k])) || HANDLE_KEYS.some(k => typeof o[k] === 'string' && OWNER_HANDLES.includes(handle(o[k])));

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
    if (ownerAuthored(value)) problems.push(`${where}: comment by the account owner is shipped`);
    for (const [k, v] of Object.entries(value)) ownerEntries(v, `${where}.${k}`, problems);
  }
}

/** The file's text, unpacked from .gz/.br, and the name that says what it is; null when it is not a text file. */
async function readShipped(file) {
  const packed = PACKED.test(file);
  const name = packed ? file.replace(PACKED, '') : file;
  if (!packed && !TEXT.test(name)) return null;
  const bytes = await readFile(file);
  const raw = packed ? (file.toLowerCase().endsWith('.gz') ? gunzipSync(bytes) : brotliDecompressSync(bytes)) : bytes;
  return { name, text: raw.toString('utf8') };
}

/** Returns { problems: string[], realComments: number } for the built folder `dir`. */
export async function scanBuildOutput(dir) {
  const problems = [];
  let realComments = 0;
  for (const file of await filesIn(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    let shipped;
    try { shipped = await readShipped(file); } catch { problems.push(`${rel}: packed file cannot be unpacked, so it cannot be checked`); continue; }
    if (!shipped) continue;
    const text = stripZeroWidth(shipped.text);
    for (const [pattern, label] of SECRET_PATTERNS) {
      const m = pattern.exec(text);
      if (m) problems.push(`${rel}: ${label} at char ${m.index}`);
    }
    let structured = 0;
    if (/\.json$/i.test(shipped.name)) {
      let data;
      try { data = JSON.parse(text); } catch { problems.push(`${rel}: invalid JSON`); continue; }
      const before = problems.length;
      ownerEntries(data, rel, problems);
      structured = problems.length - before;
      if (rel === 'data/comments.json' && Array.isArray(data.comments) && data.sample !== true) realComments = data.comments.length;
    }
    if (!structured) {
      for (const [pattern, what] of [[OWNER_HANDLE_VALUE, 'an owner handle is the author'], [OWNER_FLAG_TRUE, 'an owner flag is true']]) {
        const m = pattern.exec(text);
        if (m) problems.push(`${rel}: comment by the account owner is shipped (${what}) at char ${m.index}`);
      }
    }
  }
  return { problems, realComments };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node tools/check-build-output.mjs <built-dir>'); process.exit(2); }
  const { problems, realComments } = await scanBuildOutput(dir);
  for (const p of problems) console.error('LEAK ' + p);
  if (problems.length) process.exit(1);
  if (realComments === 0) console.log('SAMPLE-DATA: the build output contains 0 real comments (no synced archive). Visitors get the import screen and the labelled sample sky.');
  else console.log(`build output: ${realComments} real comments.`);
  console.log('build output: no owner comments, transcription endpoints or credentials found.');
}
