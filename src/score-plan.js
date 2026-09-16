/** Original arrangements. MIDI is a compositional description, not sampled instruments. */
const freeze = x => { Object.values(x).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(x); };
export const SCORE_PROFILES = freeze({
  all: { name:'An open sky', bpm:58, beats:6, register:0, wet:.36, width:.72,
    chords:[[50,57,62,64],[47,54,59,62],[43,50,57,62],[45,52,57,62]],
    melody:[{beat:1.5,tone:2},{beat:4.5,tone:3}], bow:[1,.22,.08,.025], bass:.018, pad:.024, piano:.10 },
  love: { name:'Held, not hurried', bpm:62, beats:6, register:0, wet:.24, width:.55,
    chords:[[38,50,57,61,64],[43,50,59,62,66],[35,47,54,57,62],[45,52,57,59,64]],
    melody:[{beat:0,tone:2},{beat:1.5,tone:3},{beat:3,tone:4},{beat:4.5,tone:3}],
    bow:[1,.42,.18,.075,.025], bass:.036, pad:.036, piano:.14 },
  poetry: { name:'A room for the unsaid', bpm:48, beats:4, register:12, wet:.52, width:.90,
    chords:[[38,50,57,60,64],[34,46,53,57,60],[41,53,57,60,67],[36,48,55,62,65]],
    melody:[{beat:.5,tone:3},{beat:2.75,tone:4}], bow:[1,.07,.018], bass:.014, pad:.020, piano:.09 },
  laugh: { name:'Light on its feet', bpm:76, beats:4, register:0, wet:.20, width:.68,
    chords:[[43,55,59,62,64],[48,55,60,64,67],[45,57,60,64,67],[50,57,62,66,69]],
    melody:[{beat:0,tone:2},{beat:.75,tone:3},{beat:2,tone:4},{beat:2.75,tone:3}],
    bow:[1,.16,.04], bass:.017, pad:.013, piano:.12 }
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
export const midiHz = midi => 440 * 2 ** ((midi-69)/12);
export function scoreMix({zoom=1,motion=0,reading=false,enabled=false,visible=true,volume=.42,mode='full',performance=0,mood='all'}={}) {
  const p=SCORE_PROFILES[mood]||SCORE_PROFILES.all;
  const depth=clamp(Math.log2(Math.max(1,zoom))/5,0,1), movement=clamp(motion,0,1);
  return {
    master:enabled&&visible?clamp(volume,0,1)*.82*(1-clamp(performance,0,1)):0,
    pad:mode==='notes'?0:(reading?.22:1)*(1-depth*.3),
    piano:reading?.42:1,
    cutoff:reading?1350:1750+movement*650+depth*450,
    wet:reading?.12:p.wet*(1-depth*.62),
    width:reading?.16:p.width*(1-depth*.6),
    density:reading?.28:.7+movement*.3,
    depth
  };
}
/** A harmonic boundary no more than one beat away; never a mouse-click note. */
export function nextBoundary(now,epoch=0,bpm=60){const beat=60/bpm;return epoch+Math.ceil((now-epoch+.04)/beat)*beat;}
export function eventsForBar(mood,bar,start,reading=false){
  const p=SCORE_PROFILES[mood]||SCORE_PROFILES.all,chord=p.chords[((bar%p.chords.length)+p.chords.length)%p.chords.length],beat=60/p.bpm;
  const notes=p.melody.filter((_,i)=>!reading||i===0).map((event,i)=>({
    kind:'piano',when:start+event.beat*beat,midi:chord[Math.min(event.tone,chord.length-1)]+p.register,
    velocity:p.piano*(i%2?.76:1),pan:(i%2?1:-1)*p.width*.38
  }));
  return {chord,notes,duration:p.beats*beat,profile:p};
}
