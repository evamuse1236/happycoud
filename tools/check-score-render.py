"""Render each additive voice through the actual audio engine and check samples."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('test-results/mood-score');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--no-sandbox']);page=b.new_page()
    page.goto('http://127.0.0.1:4317/')
    result=page.evaluate('''async()=>{
      const {ObservatorySound,PROGRESSION}=await import('/src/sound.js');const results=[];
      for(const mood of ['all','love','laugh','poetry']){
        const rate=24000,ctx=new OfflineAudioContext(2,rate*12,rate),s=new ObservatorySound({contextFactory:()=>ctx});s.create();
        s.master.gain.setValueAtTime(0,0);s.master.gain.setValueAtTime(.294,2);s.bed.gain.value=.72;s.wet.gain.value=.3;
        PROGRESSION[0].forEach((m,i)=>s.bow(m,2.1+i*.017,(i-1.5)*.28));s.piano(64,3);
        if(mood!=='all'){s.mood=mood;s.moodBuses[mood].gain.value=.7;s.moodNote(57,3.5);s.moodNote(61,8);}
        const rendered=await ctx.startRendering();let peak=0,power=0,silentPeak=0,finite=true;
        for(let c=0;c<2;c++){const samples=rendered.getChannelData(c);for(let i=0;i<samples.length;i++){const v=samples[i];finite&&=Number.isFinite(v);peak=Math.max(peak,Math.abs(v));power+=v*v;if(i<rate*2)silentPeak=Math.max(silentPeak,Math.abs(v));}}
        results.push({mood,peak,rms:Math.sqrt(power/(rate*12*2)),silentPeak,finite});
      }return results;
    }''');b.close()
assert all(r['finite'] and 0<r['peak']<1 and r['silentPeak']==0 for r in result)
assert all(abs(r['rms']-result[0]['rms'])>1e-5 for r in result[1:])
(out/'render-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
