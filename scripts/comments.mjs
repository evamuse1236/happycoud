import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { isOwnerComment } from '../src/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceDir = path.resolve(root, '../instagram-comments-khushi-2026-09-16');
const owner = 'khushi.o_o';
const decode = (value) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch {}
  }
  return value;
};
const linkName = (line) => line.match(/- link "((?:\\.|[^"\\])*)"/)?.[1]?.replace(/\\"/g, '"');
const simplified = s => s.toLowerCase().replace(/@[\w.]+/g, '').replace(/(.)\1+/gu, '$1').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
const genericWords = new Set(('nice beautiful gorgeous pretty cute cutie hot hotie stuning lovely lovly lovle awesome amazing wow woww sexy beauty prety cutu beautifuly beautifull beautful beautifuly crazy slay preti sundar sunder khub khubsurat bahut bohot kya kyaa so very to realy you u ur are is look lok loking looking pictures picture photo photos al the such a an queen gurl girl hi hey ya yaa babe baby babes love lov youu osum awsome thank thanks thankyou much dear di best super superb excellent great wel done haha hahah ha huhu adorable pretiest pretiest beaut cutest').split(' ').map(simplified));
for (const word of 'hawt hotay hotayyy hotayy hottaayyyyy hottay hotchiee hotness sexy gal stuning omg oh omgg how whata whatta damn cuties cutieeeiii cutest cutiiiiesss cutay cutayy cutayi kayut beaut butiful khoobsurat khoobsurati khubsurati pyaara pyara pyari pyaari sabse kitni kitna ho tum aap apme it its perfect usual as af and face cool sweet yaar outstanding aesthetic aesthetix aayee aye oof of uff woah wowowi wowowi wowow woowow wowowowowo nice one lock awww aw uwu qt op bam bamb dym fav fabulous yass yaas khushi khushiii end ladki'.split(' ')) genericWords.add(simplified(word));

export function isGeneric(text) {
  const plain = simplified(text);
  if (!plain || !/[\p{L}\p{N}]/u.test(plain)) return true;
  if (/^(a+h*|h+a+|m+w+a+h*|o+m+g+|u+f+|o+h+)$/u.test(plain.replace(/\s/g, ''))) return true;
  const words = plain.split(/\s+/);
  if (/^(wow|wo|ow)+[wi]*$/.test(plain.replace(/\s/g,''))) return true;
  if (/^[a-z]{10,}$/.test(plain) && !/[aeiou].*[aeiou]/.test(plain)) return true;
  // Keep conversational phrases and fuller compliments. Only brief stock reactions go.
  if (words.length >= 3 && new Set(words).size >= 2) return false;
  if (/@[\w.]+/u.test(text) && words.length >= 2) return false;
  return words.every(w => genericWords.has(w));
}

export function moodsFor(text) {
  const t = text.toLowerCase();
  const moods = [];
  if (/swayamvar|bhangra|bari barsi|patakha|sharma|monument|risht|credit|sushi|😂|🤣|lol|lmao|shaadi|shadi|marry|single|dhoka|fake|meme|funny|modi|biryani|pagal|bakwas|jal|yeh kya|kya baat|comedy|ka bg|chandni|blessed us|who dis|\bate\b|tea\b|stalk|chuti|tharki|paisa|paise|pese|bhai|behen|kala jaadu|insaan bhi|brain damaged|who clicked|14 banne|alcohol|sober|peg|amazon|ameer|cringe|blocked|paid promotion|crush have|leave adi|purpose|mary\. me|saxy|pookie/u.test(t)) moods.push('laugh');
  if (/pyaar|pyar|love|miss|best girl|best friend|proud|happy|happiness|forever|always|beautiful|beauty|gorgeous|heart|dil\b|prett|sundar|haseen|bless|cute|cutie|jaan|🥺|❤️|♥|🫶|😘|😍|💖|💗|💕|रूह|प्यार/u.test(t)) moods.push('love');
  if (/bari barsi|bhangra|yunhin|dekhte|raaton|chamak|zindagi|khwa|shay|chand|chamak|aankh|aank|सितार|चाँद|ज़िंदगी|कविता|मोहब्बत|ख़्वाब|रूह|तुम|दिल|teri|tere|humsafar|ishq|sher|poem|poetry|sigh/u.test(t) || (text.includes('\n') && text.length > 75)) moods.push('poetry');
  return moods;
}

export function parseSnapshot(record) {
  const lines = (record.snapshot || '').split('\n');
  const comments = [];
  let lastRoot = null;
  const postUrl = record.url?.split('?')[0] || '';
  let postDate = '';
  for (let i = 0; i < lines.length; i++) {
    if (/\/url: \/khushi\.o_o\/(p|reel)\//.test(lines[i]) && /^\s*- time: /.test(lines[i+1] || '')) {
      postDate = decode(lines[i+1].split('- time: ')[1]);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    // An omitted root comment must never lend its replies to the preceding root.
    if (/^  - link ".*'s profile picture"/.test(lines[i])) lastRoot=null;
    const match = lines[i].match(/\/url: (\/(?:p|reel)\/[^/]+\/c\/(\d+)\/(?:r\/(\d+)\/)?)$/);
    if (!match) continue;
    const indent = lines[i-1].search(/\S/);
    let author = '', authorIndex = i;
    for (let j=i-2; j>=Math.max(0,i-28); j--) {
      const n = linkName(lines[j]);
      if (n && /^[\w.]+$/.test(n) && !/^\d+[wdhms]$/.test(n)) { author = n; authorIndex=j; break; }
    }
    if (!author) continue;
    const fragments = [];
    const take = line => {
      const m = line.match(/^\s*- (?:generic|text): (.*)$/);
      const l = linkName(line);
      if (m && !/^(· Edited|Edited|•)$/.test(m[1])) fragments.push(decode(m[1]));
      else if (l?.startsWith('@')) fragments.push(l);
    };
    // Full post pages put comment text after the time. Dialog snapshots put it before.
    const modal = lines.slice(Math.max(0,authorIndex-3),authorIndex+1).some(l=>l.includes('- heading'));
    if (modal) {
      for(let j=authorIndex+2;j<i-1;j++) take(lines[j]);
    } else {
      for(let j=i+2;j<lines.length;j++) {
        const line=lines[j];
        if (line.search(/\S/)<=indent && /- (button|list|separator|progressbar|textbox)|profile picture/.test(line)) break;
        if (line.search(/\S/)<=indent && linkName(line) && !linkName(line).startsWith('@')) break;
        take(line);
      }
    }
    const text=fragments.join('\n').replace(/(@[\w.]+)\n/g,'$1 ').trim();
    if (!text) continue;
    const isReply = !!match[3] || (!modal && indent > 2);
    const id = match[3] || match[2];
    const parentId = match[3] ? match[2] : isReply ? lastRoot : null;
    if (!isReply) lastRoot=id;
    comments.push({id,author,text,parentId,isReply,postUrl,postDate,
      commentUrl:'https://www.instagram.com'+match[1],
      timeLabel:decode(lines[i+1]?.match(/- time: (.*)/)?.[1] || ''),
      isOwner:isOwnerComment({author},owner), generic:isGeneric(text), moods:moodsFor(text)});
  }
  return comments;
}

/** Adapt the reviewed export without re-filtering or rewriting its comments. */
export function fromReviewedArchive(archive) {
  if (!Array.isArray(archive.comments) || !Array.isArray(archive.posts)) {
    throw new Error('The reviewed archive must contain comments and posts arrays.');
  }
  const posts = new Map(archive.posts.map(p => [p.index, p]));
  const convert = c => ({
    id: String(c.id), text: c.text, author: c.author || '',
    parentId: c.parent_comment_id == null ? null : String(c.parent_comment_id),
    isReply: c.is_reply === true, isOwner: isOwnerComment(c, archive.account),
    commentUrl: c.comment_url || '', postUrl: c.post_url || '',
    postDate: posts.get(c.post_index)?.date_displayed || '',
    timeLabel: c.time_displayed || '', moods: moodsFor(c.text),
  });
  const all = [...archive.comments, ...(archive.context_replies || [])].map(convert);
  const comments = archive.comments.filter(c => !isOwnerComment(c, archive.account)).map(c => {
    const comment = convert(c);
    const rootID = comment.parentId || (!comment.isReply ? comment.id : null);
    return {...comment, conversation: rootID === null ? [] : all.filter(r => r.id === rootID || r.parentId === rootID)};
  });
  const result = {account: archive.account, comments, postsRead: archive.posts.length,
    postTotal: archive.posts.length, coverage: archive.coverage,
    counts: {received: comments.length, context: archive.context_replies?.length || 0},
    source: 'reviewed-archive', provisional: true,
    notes: 'Reviewed comments with original wording. Instagram visibility gaps remain; mood tags are provisional.'};
  result.version = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0,16);
  return result;
}

export async function collectComments() {
  let reviewed=null;
  try {
    reviewed=fromReviewedArchive(JSON.parse(await fs.readFile(path.join(sourceDir, 'khushi-comments-filtered.json'), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let files=[];
  try { files=(await fs.readdir(sourceDir)).filter(f=>/^post-\d+\.json$/.test(f)).sort(); } catch {}
  const all=new Map();
  let postsRead=0;
  for(const file of files) {
    try {
      const record=JSON.parse(await fs.readFile(path.join(sourceDir,file),'utf8'));
      if(!record.snapshot) continue;
      const parsed=parseSnapshot(record);
      for(const c of parsed) all.set(c.id,c);
      postsRead++;
    } catch { /* A file can be mid-write while extraction continues. Retry next refresh. */ }
  }
  // Preserve reviewed wording and relationships; recover additional real comments from snapshots.
  const reviewedIDs=new Set(reviewed?.comments.map(c=>c.id)||[]);
  for(const c of reviewed?.comments||[]){
    for(const reply of c.conversation)all.set(reply.id,{...all.get(reply.id),...reply});
    all.set(c.id,{...all.get(c.id),...c});
  }
  const received=[...all.values()].filter(c=>!isOwnerComment(c,owner) && (reviewedIDs.has(c.id)||!isGeneric(c.text)));
  const comments=received.map(c=>{
    const rootId=c.parentId||(!c.isReply?c.id:null);
    const conversation=rootId===null?[]:[...all.values()].filter(r=>r.id===rootId || r.parentId===rootId);
    return {...c,conversation};
  });
  let postTotal=71;
  try { postTotal=JSON.parse(await fs.readFile(path.join(sourceDir,'post-inventory.json'),'utf8')).length; } catch {}
  const result={account:owner,postsRead,postTotal,comments,
    counts:{received:comments.length,raw:all.size,owner:[...all.values()].filter(c=>isOwnerComment(c,owner)).length,filtered:all.size-comments.length-[...all.values()].filter(c=>isOwnerComment(c,owner)).length},
    coverage:reviewed?.coverage,source:'reviewed-and-expanded',
    provisional:true,notes:'Expanded real archive. Brief generic reactions and account-owner comments are excluded from the cloud. Owner replies appear only as conversation context. Mood tags and historical coverage are provisional.'};
  result.version=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0,16);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await collectComments();
  await fs.mkdir(path.join(root,'public/data'),{recursive:true});
  await fs.writeFile(path.join(root,'public/data/comments.json'),JSON.stringify(result,null,2));
  console.log(`${result.comments.length} comments from ${result.postsRead}/${result.postTotal} posts saved.`);
}
