import { hash, safeURL } from './math.js';
export const MOODS = [
  { id: 'all', label: 'Everything', symbol: '✧', bit: 0 },
  { id: 'love', label: 'Feeling loved', symbol: '♡', bit: 1 },
  { id: 'laugh', label: 'Make me laugh', symbol: '☺', bit: 2 },
  { id: 'poetry', label: 'A little poetry', symbol: '☾', bit: 4 }
];
export function isOwnerComment(comment, account = 'khushi.o_o') {
  const username = value => String(value || '').trim().replace(/^@/, '').toLowerCase();
  const name = username(comment.author);
  return comment.isOwner === true || comment.is_account_owner === true ||
    [username(account), 'khushi.o_o', 'khushi.0_0', 'khusi.0_0'].filter(Boolean).includes(name);
}
export const moodMask = moods => (moods.includes('love') ? 1 : 0) | (moods.includes('laugh') ? 2 : 0) | (moods.includes('poetry') ? 4 : 0);
/** Same reviewed-archive adapter as the audited repository. Original records survive. */
export function normalizeData(input) {
  let root = Array.isArray(input) ? { comments: input } : input;
  if (!root || !Array.isArray(root.comments)) throw new Error('Choose a JSON object with a comments array, or an array of comments.');
  if (root.comments.length > 5000) throw new Error('A single import is limited to 5,000 comments. Split larger archives before importing.');
  if (Array.isArray(root.context_replies) && Array.isArray(root.posts)) {
    const dates = new Map(root.posts.map(p => [p.index,p.date_displayed]));
    const adapt = c => ({...c, id:String(c.id), parentId:c.parent_comment_id == null?null:String(c.parent_comment_id),
      isReply:c.is_reply===true, isOwner:c.is_account_owner===true,
      commentUrl:c.comment_url, postUrl:c.post_url, postDate:dates.get(c.post_index), timeLabel:c.time_displayed});
    const all = [...root.comments,...root.context_replies].map(adapt);
    root = {...root, comments:root.comments.map(c => {
      const comment=adapt(c), parent=comment.parentId || (!comment.isReply?comment.id:null);
      return {...comment, conversation:parent===null?[]:all.filter(r=>r.id===parent||r.parentId===parent)};
    })};
  }
  const ids = new Set(), comments = [];
  for (const [sourceIndex, raw] of root.comments.entries()) {
    if (!raw || typeof raw.text !== 'string' || !raw.text.trim() || isOwnerComment(raw, root.account)) continue;
    if (raw.text.length > 30000) throw new Error('One comment exceeds the 30,000-character safety limit. The original file has not been modified.');
    const author = typeof raw.author === 'string' ? raw.author : '';
    const id = String(raw.id ?? `local-${hash(author + '\u0000' + raw.text + '\u0000' + String(raw.postUrl ?? '') + '\u0000' + sourceIndex)}`);
    if (ids.has(id)) continue;
    ids.add(id);
    const moods = Array.isArray(raw.moods) ? raw.moods.filter(x => ['love','laugh','poetry'].includes(x)) : [];
    comments.push({ ...raw, id, author, text: raw.text, moods,
      commentUrl: safeURL(raw.commentUrl), postUrl: safeURL(raw.postUrl),
      conversation: Array.isArray(raw.conversation) ? raw.conversation.filter(r => r && typeof r.text === 'string' && !isOwnerComment(r, root.account)).map(r => ({ ...r, id: String(r.id ?? ''), author: typeof r.author === 'string' ? r.author : '', commentUrl: safeURL(r.commentUrl) })) : [] });
  }
  return { ...root, comments, version: String(root.version ?? hash(comments.map(c => c.id + c.text).join('\n'))), sample: root.sample === true };
}
export function conversationFor(comment) {
  const rootID = comment.parentId || (!comment.isReply ? comment.id : null);
  if (rootID === null) return [];
  const ids = new Set();
  return comment.conversation.filter(r => {
    if (isOwnerComment(r)) return false;
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
  let empty = null;
  for (const url of ['./api/comments', './data/comments.json']) {
    try { const data = await fetchData(url); if(data.comments.length)return { data, url }; if(!empty)empty={data,url}; } catch { /* Keep both existing loading routes. */ }
  }
  return empty || { data: normalizeData([]), url: null };
}
