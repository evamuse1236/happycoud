"""Real recording checks for radio lock, light contacts and KHUSHI letter bounces."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/lost-signal/restoration';OUT.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def check(name,ok):
 checks.append({'name':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True);assert ok,name

def seek(page,t):
 page.locator('.ls-seek').evaluate('(e,t)=>{e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}))}',t)
 page.wait_for_timeout(70)

INIT='''window.radioMeters=[];window.radioEvents=[];
const connect=AudioNode.prototype.connect;
AudioNode.prototype.connect=function(destination,...args){
 if(destination===this.context.destination){const a=this.context.createAnalyser();a.fftSize=2048;connect.call(this,a);radioMeters.push(a);}
 return connect.call(this,destination,...args);
};
const NativeAudio=window.Audio;
window.Audio=function(...args){const a=new NativeAudio(...args);window.testRecording=a;
 a.addEventListener('playing',()=>setTimeout(()=>radioEvents.push({event:'playing',wall:performance.now(),time:a.currentTime,song:window.__sky?.snapshot().song,moves:(document.querySelector('.ls-receiver .ls-carrier-line')?.getAttribute('d')?.match(/M/g)||[]).length}),0));
 return a;};
window.radioLevel=()=>{const a=radioMeters.at(-1);if(!a)return 0;const d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);};
'''
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/google-chrome-stable'),headless=True,args=['--no-sandbox'])
  page=b.new_page(viewport={'width':1440,'height':900});page.add_init_script(INIT);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4317/?debug');page.wait_for_function('window.__sky?.snapshot().ready');page.click('#enter-silent');page.evaluate('__sky.finish()');page.click('#sl-portal');page.wait_for_timeout(1500)
  check('Radio generates an audible signal after the user opens it',page.evaluate('radioLevel()>0.0001&&__sky.snapshot().song.radioActive'))
  check('Radio remains broken while the words gather',page.locator('.ls-receiver .ls-carrier-line').evaluate('e=>(e.getAttribute("d").match(/M/g)||[]).length===2'))
  page.screenshot(path=str(OUT/'radio-connecting.png'))
  page.click('[data-action=mute]');page.wait_for_timeout(180)
  check('Mute silences tuning sound',page.evaluate('radioLevel()<0.00001'))
  page.click('[data-action=mute]')
  page.wait_for_function('__sky.snapshot().song.connected',timeout=25000)
  events=page.evaluate('radioEvents');(OUT/'connection-events.json').write_text(json.dumps(events,indent=2))
  live=[e for e in events if e.get('song') and not e['song']['gathering']]
  check('Final visual lock coincides with native recording playback',live and live[0]['moves']==1 and live[0]['song']['connected'] and live[0]['time']<.5)
  check('Radio stops as the recording starts',page.evaluate('!__sky.snapshot().song.radioActive&&!__sky.snapshot().song.paused'))
  page.click('[data-action=play]')
  for start,end in [(6.64,9.319),(10.32,12.96),(124.44,126.799)]:
   for i,char in enumerate('KHUSHI'):
    seek(page,start+(end-start)*i/6+.01)
    check(f'Name at {start}: letter {i+1} receives contact',page.locator('.ls-letter[data-landed=true]').inner_text()==char)
    check(f'Name at {start}: ball reaches letter {i+1}',page.evaluate('''()=>{const e=document.querySelector('.ls-letter[data-landed=true]'),r=document.createRange();r.selectNodeContents(e);const box=r.getBoundingClientRect(),m=document.querySelector('.ls-pulse').transform.baseVal.getItem(0).matrix;return Math.abs(m.e-(box.left+box.width/2))<2&&Math.abs(m.f-(box.top-8))<2;}'''))
  for w,h in [(1440,900),(390,844),(320,568)]:
   page.set_viewport_size({'width':w,'height':h});seek(page,6.64+(9.319-6.64)*3/6+.01)
   page.screenshot(path=str(OUT/f'name-{w}.png'))
   check(f'Canonical name and spacing preserved at {w}',page.locator('#ls-lyric').inner_text()=='K H U S H I')
   check(f'Light has soft halo and no hard ring at {w}',page.locator('.ls-pulse-halo').evaluate('e=>getComputedStyle(e).stroke==="none"&&e.getAttribute("r")==="20"'))
   seek(page,70.17);page.screenshot(path=str(OUT/f'word-glow-{w}.png'))
   check(f'Landing glow lights the word at {w}',page.locator('.ls-word[data-landed=true]').evaluate('e=>getComputedStyle(e).textShadow.includes("25px")'))
  seek(page,69.8);page.click('[data-action=play]');page.wait_for_timeout(350)
  check('Playback never sends comment text across the screen',page.locator('.ls-cargo').count()==0)
  page.click('[data-action=close]');page.wait_for_function('!__sky.snapshot().song.active')
  page.click('#sl-portal');page.wait_for_timeout(300);page.keyboard.press('Escape');page.wait_for_timeout(160)
  check('Closing during tuning stops the radio',page.evaluate('!__sky.snapshot().song.radioActive&&radioLevel()<0.00001'))
  page.wait_for_function('!__sky.snapshot().song.active');page.emulate_media(reduced_motion='reduce');page.click('#sl-portal');page.wait_for_function('__sky.snapshot().song.connected')
  check('Reduced motion skips radio travel and starts the song',page.evaluate('!__sky.snapshot().song.radioActive&&!__sky.snapshot().song.gathering'))
  check('No browser exceptions',not errors);b.close()
finally:
 (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2)+'\n')
