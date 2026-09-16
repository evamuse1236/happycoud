import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeData } from '../src/data.js';
import { belongsToCollection } from '../src/song-timeline.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const audioPath=process.argv[2];
if(!audioPath)throw new Error('Pass the original MP3 path. This copies an existing reviewed alignment; it does not call transcription services.');
const matches=JSON.parse(await fs.readFile(path.join(root,'song-work/lyric-matches.json'),'utf8'));
const transcript=JSON.parse(await fs.readFile(path.join(root,'song-work/song-transcript.json'),'utf8'));
const audioBytes=await fs.readFile(audioPath);
if(transcript.sourceSha256&&createHash('sha256').update(audioBytes).digest('hex')!==transcript.sourceSha256)throw new Error('This is not the recording used for the alignment.');
const song={...matches,title:'Khushti',duration:transcript.duration,timingMethod:transcript.timingMethod,timingAccuracy:transcript.timingAccuracy};
const comments=normalizeData(JSON.parse(await fs.readFile(path.join(root,'public/data/comments.json'),'utf8'))).comments;
if(!belongsToCollection(song,comments))throw new Error('The lyric mapping does not belong to the current comment collection.');
let previous=-1;
for(const phrase of song.phrases){
  if(!Number.isFinite(phrase.start)||phrase.start<previous)throw new Error('Phrase times must be ordered.');previous=phrase.start;
  for(const word of phrase.words){
    if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.end<word.start||word.end>song.duration+.1)throw new Error('Invalid word timing.');
    if(word.source==='comment'&&!word.matches?.length)throw new Error('A comment word must have a source match.');
    for(const match of word.matches||[]){
      const text=song.commentsById[match.commentId]?.text;
      if(!text||!Number.isInteger(match.sourceStart)||!Number.isInteger(match.sourceEnd)||match.sourceEnd<=match.sourceStart||match.sourceStart<0||match.sourceEnd>text.length)throw new Error('A source highlight has an invalid character range.');
    }
  }
}
await fs.mkdir(path.join(root,'public/media'),{recursive:true});
await fs.writeFile(path.join(root,'public/media/khushti.mp3'),audioBytes);
await fs.writeFile(path.join(root,'public/data/song.json'),JSON.stringify(song,null,2)+'\n');
const stamp=time=>{const ms=Math.round(time*1000);return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const timedLines=song.phrases.map(p=>`[${stamp(p.start)}–${stamp(p.end)}] ${p.text}`).join('\n');
const timedWords=song.phrases.flatMap(p=>p.words.map(w=>`[${stamp(w.start)}–${stamp(w.end)}] ${w.text} (${w.source}${w.alignmentNote?'; '+w.alignmentNote:''})`)).join('\n');
await fs.writeFile(path.join(root,'song-work/lyrics-timed.txt'),`Khushti — lyrics aligned to the recording\n${song.timingAccuracy}\n\nLYRIC LINES\n${timedLines}\n\nWORDS AND TIMED GROUPS\n${timedWords}\n`);
console.log(`Prepared ${song.phrases.length} lyric lines and ${Object.keys(song.commentsById).length} original comments for ${song.duration.toFixed(2)} seconds of audio.`);
