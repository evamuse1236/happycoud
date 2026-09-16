import { hash, safeURL } from './math.js';
export const MOODS = [
  { id: 'all', label: 'Everything', symbol: '✧', bit: 0 },
  { id: 'love', label: 'Feeling loved', symbol: '♡', bit: 1 },
  { id: 'laugh', label: 'Make me laugh', symbol: '☺', bit: 2 },
  { id: 'poetry', label: 'A little poetry', symbol: '☾', bit: 4 }
];
export const moodMask = moods => (moods.includes('love') ? 1 : 0) | (moods.includes('laugh') ? 2 : 0) | (moods.includes('poetry') ? 4 : 0);
/** Preserve wording, explicit IDs, attribution and unknown parent relationships. */
export function normalizeData(input) {
  const root = Array.isArray(input) ? { comments: input } : input;
  if (!root || !Array.isArray(root.comments)) throw new Error('Choose a JSON object with a comments array, or an array of comments.');
  if (root.comments.length > 5000) throw new Error('A single import is limited to 5,000 comments. Split larger archives before importing.');
  const ids = new Set();
  const comments = [];
  for (const [sourceIndex, raw] of root.comments.entries()) {
    if (!raw || typeof raw.text !== 'string' || !raw.text.trim() || raw.isOwner === true) continue;
    if (raw.text.length > 30000) throw new Error('One comment exceeds the 30,000-character safety limit. The original file has not been modified.');
    const author = typeof raw.author === 'string' ? raw.author : '';
    const id = String(raw.id ?? `local-${hash(author + '\u0000' + raw.text + '\u0000' + String(raw.postUrl ?? '') + '\u0000' + sourceIndex)}`);
    if (ids.has(id)) continue;
    ids.add(id);
    const moods = Array.isArray(raw.moods) ? raw.moods.filter(x => ['love','laugh','poetry'].includes(x)) : [];
    comments.push({ ...raw, id, author, text: raw.text, moods,
      commentUrl: safeURL(raw.commentUrl), postUrl: safeURL(raw.postUrl),
      conversation: Array.isArray(raw.conversation) ? raw.conversation.filter(r => r && typeof r.text === 'string').map(r => ({ ...r, id: String(r.id ?? ''), author: typeof r.author === 'string' ? r.author : '', commentUrl: safeURL(r.commentUrl) })) : [] });
  }
  return { ...root, comments, version: String(root.version ?? hash(comments.map(c => c.id + c.text).join('\n'))), sample: root.sample === true };
}
export function conversationFor(comment) {
  const rootID = comment.parentId || (!comment.isReply ? comment.id : null);
  // An orphan reply does not get attached to an unrelated root.
  if (rootID === null) return [];
  const ids = new Set();
  return comment.conversation.filter(r => {
    if (String(r.id) === comment.id || ids.has(String(r.id))) return false;
    if (String(r.id) !== String(rootID) && String(r.parentId) !== String(rootID)) return false;
    ids.add(String(r.id)); return true;
  });
}
export async function fetchData(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`Could not read comments (${res.status}).`);
    return normalizeData(await res.json());
  } finally { clearTimeout(timer); }
}
export async function loadData() {
  // Compatible with the existing happycoud Vite middleware and static snapshot.
  let empty = null;
  for (const url of ['./api/comments', './data/comments.json']) {
    try { const data = await fetchData(url); if(data.comments.length)return { data, url }; if(!empty)empty={data,url}; } catch { /* Try the static snapshot before showing the local import screen. */ }
  }
  return empty || { data: normalizeData([]), url: null };
}
