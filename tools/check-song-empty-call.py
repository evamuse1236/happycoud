from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).resolve().parents[1]/'test-results/lost-signal/empty-call';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,900),(390,844)]:
  page=b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4317/?debug');page.wait_for_function('window.__sky?.snapshot().ready');page.click('#enter-silent');page.evaluate('__sky.finish()');page.click('#sl-portal')
  page.evaluate('''()=>{window.sequence=[];function track(){const s=__sky.snapshot().song;sequence.push({at:performance.now(),phase:s.phase,time:s.time,lyric:Number(document.querySelector('#ls-lyric').style.opacity),source:Number(document.querySelector('.ls-source').style.opacity),old:!!document.querySelector('.ls-outgoing')});if(s.active&&s.time<.8)requestAnimationFrame(track);}track();}''')
  page.wait_for_function('__sky.snapshot().song.phase==="quiet"',timeout=25000)
  blank=page.evaluate('''()=>Object.fromEntries(['#ls-lyric','.ls-source','.ls-witness','.ls-recognition','.ls-next','.ls-signal-state','.ls-footer','.ls-skip'].map(s=>[s,Number(getComputedStyle(document.querySelector(s)).opacity)]))''')
  assert all(x==0 for x in blank.values()),blank
  page.screenshot(path=str(out/f'empty-{w}.png'))
  page.wait_for_function('__sky.snapshot().song.time>.7',timeout=10000)
  seq=page.evaluate('sequence');quiet=[f for f in seq if f['phase']=='quiet'];live=[f for f in seq if f['phase']=='song']
  gap=(live[0]['at']-quiet[0]['at'])/1000
  assert gap>1.5,(gap,quiet)
  assert not any(f['old'] for f in live),live
  assert all(f['lyric']==0 for f in quiet)
  assert page.locator('#ls-lyric').evaluate('e=>Number(e.style.opacity)===1')
  page.screenshot(path=str(out/f'call-{w}.png'))
  print('PASS',w,'empty before call:',round(gap,2),'seconds; no old words; errors:',errors,flush=True);assert not errors;page.close()
 b.close()
