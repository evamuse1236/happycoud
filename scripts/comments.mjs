import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

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
      isOwner:author===owner, generic:isGeneric(text), moods:moodsFor(text)});
  }
  return comments;
}

export async function collectComments() {
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
  const received=[...all.values()].filter(c=>!c.isOwner && !c.generic);
  const comments=received.map(c=>{
    const rootId=c.parentId||c.id;
    const conversation=[...all.values()].filter(r=>r.id===rootId || r.parentId===rootId);
    return {...c,conversation};
  });
  let postTotal=71;
  try { postTotal=JSON.parse(await fs.readFile(path.join(sourceDir,'post-inventory.json'),'utf8')).length; } catch {}
  const result={account:owner,postsRead,postTotal,comments,
    counts:{received:comments.length,raw:all.size,filtered:[...all.values()].filter(c=>!c.isOwner && c.generic).length},
    provisional:true,notes:'Ongoing extraction. Generic filtering and mood tags are provisional. Original wording is preserved. Visual fragments may recur; counts refer to unique comments.'};
  result.version=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0,16);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await collectComments();
  await fs.mkdir(path.join(root,'public/data'),{recursive:true});
  await fs.writeFile(path.join(root,'public/data/comments.json'),JSON.stringify(result,null,2));
  console.log(`${result.comments.length} comments from ${result.postsRead}/${result.postTotal} posts saved.`);
}
