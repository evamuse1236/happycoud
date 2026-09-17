"""Focused real-song checks for row fades and the opening crossfade."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).resolve().parents[1]/'test-results/lost-signal/wrap-opening';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':900});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.add_init_script('const AudioClass=window.Audio;window.Audio=function(...args){const a=new AudioClass(...args);window.recording=a;return a;}')
 page.goto('http://127.0.0.1:4317/?debug');page.wait_for_function('window.__sky?.snapshot().ready');page.click('#enter-silent');page.evaluate('__sky.finish()');page.click('#sl-portal')
 page.evaluate('''()=>{function hold(){if(__sky.snapshot().song.connected&&recording.currentTime>=.25){recording.pause();window.held=true;}else requestAnimationFrame(hold);}requestAnimationFrame(hold);}''')
 page.wait_for_function('window.held',timeout=30000)
 state=page.evaluate('''()=>({time:recording.currentTime,old:Number(document.querySelector('.ls-outgoing')?.style.opacity),incoming:Number(document.querySelector('#ls-lyric').style.opacity),source:Number(document.querySelector('.ls-source').style.opacity)})''')
 assert state['old'] is None and state['incoming']<1 and state['source']==0,state
 print('PASS opening arrives without overlapping the gathered words',state,flush=True);page.screenshot(path=str(out/'opening-desktop.png'))
 for w,h in [(1440,900),(390,844)]:
  page.set_viewport_size({'width':w,'height':h})
  page.locator('.ls-seek').evaluate('(e)=>{e.value=1;e.dispatchEvent(new Event("input",{bubbles:true}))}');page.wait_for_timeout(80)
  assert page.locator('.ls-source').evaluate('e=>e.style.opacity==="0"&&e.inert')
  assert page.locator('#ls-lyric').evaluate('e=>e.style.opacity==="1"')
  page.screenshot(path=str(out/f'intro-{w}.png'))
  geometry=page.locator('#ls-lyric .ls-word').evaluate_all('(es)=>es.map(e=>({key:e.dataset.key,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y}))')
  pair=next((geometry[i-1],geometry[i]) for i in range(1,len(geometry)) if geometry[i]['y']>geometry[i-1]['y']+5)
  model=page.evaluate('async()=>{const {prepareSong}=await import("/src/starlight/core.js");const s=await fetch("/data/song.json").then(r=>r.json());return s.phrases[0].words;}')
  index=int(pair[1]['key'].split('-w')[1]);prev,nextword=model[index-1],model[index]
  start=max(prev['start']+min(.065,(nextword['start']-prev['start'])*.18),nextword['start']-.72)
  positions=[]
  for u in [.2,.5,.8]:
   t=start+(nextword['start']-start)*u
   page.locator('.ls-seek').evaluate('(e,t)=>{e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}))}',t);page.wait_for_timeout(70)
   positions.append(page.locator('.ls-pulse').evaluate('e=>({opacity:Number(e.style.opacity),x:e.transform.baseVal.getItem(0).matrix.e,y:e.transform.baseVal.getItem(0).matrix.f})'))
   page.screenshot(path=str(out/f'wrap-{w}-{u}.png'))
  assert positions[1]['opacity']==0,positions
  assert positions[0]['y']<positions[2]['y']-5,positions
  assert positions[0]['opacity']>0 and positions[2]['opacity']>0,positions
  print('PASS row fade-out, invisible switch and fade-in',w,positions,flush=True)
 page.locator('.ls-seek').evaluate('(e)=>{e.value=14.1;e.dispatchEvent(new Event("input",{bubbles:true}))}');page.wait_for_timeout(100)
 assert page.locator('.ls-source').evaluate('e=>e.style.opacity==="1"&&!e.inert')
 print('PASS source returns for source lyrics; browser errors:',errs,flush=True);assert not errs
 b.close()
