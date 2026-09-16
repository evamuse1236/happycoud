"""Run after `npm run build`. Requires Python Playwright and a Chromium executable.
No website access is needed: the actual standalone build is rendered in memory.
"""
from pathlib import Path
import json,math,os,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'Khushi-Observatory.html').read_text().replace('<head>','<head><script>window.HAPPYCOUD_DEBUG=true;</script>')
REPORT={'checks':[],'runtime_errors':[],'notes':['Actual in-memory v4 standalone bundle, not a UI mock. Browser GPU context unavailable; Canvas2D fallback tested. Separate native EGL shader tests are supplied.']}
def check(name,condition,detail=None):
 REPORT['checks'].append({'name':name,'pass':bool(condition),'detail':detail})
 print(time.strftime('%H:%M:%S')+' '+('PASS' if condition else 'FAIL')+' '+name,flush=True)
 if not condition: print('FAILED',name,detail)
def snap(page):return page.evaluate('window.__skyDebug.snapshot()')
def geometry(s):return [(n['id'],n['x'],n['y'],n['z'],n['w'],n['h']) for n in s['nodes']]
def settled(page):
 page.wait_for_function('''() => {const s=window.__skyDebug.snapshot();return !s.closingReader && !s.flight && Math.hypot(s.velocity.x,s.velocity.y)<.11 && Math.hypot(s.camera.x-s.target.x,s.camera.y-s.target.y,s.camera.z-s.target.z)<.02}''',timeout=12000)
def initialise(page):
 page.set_default_timeout(8000)
 page.on('pageerror',lambda e:REPORT['runtime_errors'].append(str(e)))
 page.set_content(HTML);page.locator('#demo-button').click();page.wait_for_function('window.__skyDebug?.snapshot().ready',timeout=40000);page.wait_for_timeout(300)
 # Cross the new first-visit threshold with genuine zoom gestures, then return home.
 page.keyboard.press('+');page.keyboard.press('+');page.keyboard.press('+');settled(page)
 page.keyboard.press('Home');settled(page)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 desktop=b.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
 page=desktop.new_page();initialise(page);before=snap(page);base=geometry(before)
 REPORT['renderer']=before['renderer'];REPORT['sample_comments']=before['total'];REPORT['texture_bytes']=before['textureBytes']
 check('360 unique comments, no duplicated word-cloud instances',len(base)==360 and len(set(n[0] for n in base))==360)
 check('Private comments are not fabricated',page.locator('#sample-label').is_visible() and before['sample'])
 # Reconstruct the mask-plane rectangles from the immutable perspective-compensated data.
 ref=[]
 for n in before['nodes']:
  f=(3200-n['z'])/3200;ref.append({k:n[k]/f for k in ['x','y','w','h']})
 overlaps=sum(abs(a['x']-c['x'])<(a['w']+c['w'])/2-.01 and abs(a['y']-c['y'])<(a['h']+c['h'])/2-.01 for i,a in enumerate(ref) for c in ref[i+1:])
 check('All complete-comment rectangles are collision-free on the packing reference plane',overlaps==0,overlaps)
 check('The word field has real depth exceeding 100 world units',before['depth']['maxZ']-before['depth']['minZ']>100,before['depth'])
 check('All words remain behind the closest allowed camera position',before['depth']['maxZ']<78)
 check('Initial texture allocation stays below 64 MiB on the Canvas2D fallback',before['textureBytes']<64*1024*1024,before['textureBytes'])
 page.screenshot(path=str(OUT/'desktop-home.png'))
 page.locator('#options-toggle').click();page.locator('#motion-toggle').click();page.locator('#options-toggle').click()
 s=snap(page);page.wait_for_timeout(300);check('Pause freezes ambient time',snap(page)['motionTime']==s['motionTime'])
 node=min(before['nodes'],key=lambda n:abs(n['x']+780)+abs(n['y'])*2)
 anchor=node['projected'];page.mouse.move(anchor['x'],anchor['y'])
 for _ in range(4):page.mouse.wheel(0,-220);page.wait_for_timeout(110)
 settled(page);after=snap(page)
 check('Zoom changes the actual camera distance',after['camera']['z']<before['camera']['z']*.3)
 check('All XYZ positions and sizes are unchanged by zoom',geometry(after)==base)
 same=next(n for n in after['nodes'] if n['id']==node['id'])
 check('Cursor-anchored zoom keeps a targeted node close to the pointer',math.hypot(same['projected']['x']-anchor['x'],same['projected']['y']-anchor['y'])<8)
 page.mouse.move(10,200);page.screenshot(path=str(OUT/'desktop-inside.png'))
 page.locator('[data-mood=love]').click();check('Mood highlighting does not rebuild geometry',geometry(snap(page))==base)
 page.locator('[data-mood=all]').click()
 page.mouse.move(700,350);page.mouse.down();page.mouse.move(820,380,steps=10);page.mouse.up();settled(page)
 check('Dragging changes camera XY without moving words',geometry(snap(page))==base and abs(snap(page)['camera']['x']-after['camera']['x'])>1)
 s=snap(page)
 visible=[n for n in s['nodes'] if n['projected'] and 150<n['projected']['x']<1250 and 160<n['projected']['y']<650]
 target=min(visible,key=lambda n:abs(n['projected']['x']-720)+abs(n['projected']['y']-440))
 origin=dict(s['camera']);page.mouse.click(target['projected']['x'],target['projected']['y'])
 page.wait_for_function("document.querySelector('#reader').open",timeout=12000)
 check('Picking an actual word opens a reading card',page.locator('#quote').inner_text().strip()!='')
 check('Reading does not change the cloud topology',geometry(snap(page))==base)
 page.wait_for_timeout(350);page.screenshot(path=str(OUT/'desktop-reading.png'))
 page.keyboard.press('Escape');page.wait_for_function('window.__skyDebug.snapshot().activeID === null');settled(page);returned=snap(page)['camera']
 check('Closing a comment restores the exact exploration position',math.dist([origin[k] for k in ['x','y','z']],[returned[k] for k in ['x','y','z']])<.08,{'origin':origin,'returned':returned})
 page.locator('#browse').click();page.locator('#search').fill('sample.friend.01');page.wait_for_timeout(250)
 check('Search finds the recorded author',page.locator('#list-results li button').count()>0 and 'sample.friend.01' in page.locator('#list-results').inner_text())
 page.locator('#list-results li button').first.click();page.wait_for_function("document.querySelector('#reader').open",timeout=12000)
 page.locator('#reader-author').click();settled(page);check('Author exploration is real and reversible',page.locator('#author-chip').is_visible())
 page.locator('#author-chip').click();check('Clearing author filter retains geometry',geometry(snap(page))==base)
 page.locator('#options-toggle').click();page.locator('#atmosphere-toggle').click();page.locator('#options-toggle').click()
 check('Atmosphere-off leaves every actual word present',snap(page)['atmosphere'] is False and geometry(snap(page))==base)
 page.locator('#home').click();settled(page);page.screenshot(path=str(OUT/'words-only.png'))
 page.set_viewport_size({'width':1024,'height':768});page.wait_for_function('window.__skyDebug.snapshot().viewport.width===1024');settled(page);check('Resize refits only the camera, not the world',geometry(snap(page))==base)
 # New Observatory interactions operate on the same geometry.
 original=dict(snap(page)['camera']);page.locator('#journey-toggle').click();samples=[]
 for _ in range(6):page.wait_for_timeout(80);samples.append(snap(page))
 check('Guided camera flight changes the view continuously',len({round(s['camera']['z'],2) for s in samples})>3)
 check('Intermediate flight frames never morph or replace word geometry',all(geometry(s)==base for s in samples))
 settled(page);j=snap(page)['journey']
 check('Guided route has seven unique existing comment IDs',len(j['ids'])==7 and len(set(j['ids']))==7 and set(j['ids'])<=set(n[0] for n in base))
 page.wait_for_timeout(1000);check('Guidance waits for the user instead of auto-advancing',snap(page)['journey']['index']==0)
 page.screenshot(path=str(OUT/'guided-stop.png'));stop_camera=dict(snap(page)['camera'])
 page.locator('#waypoint').click();page.wait_for_function("document.querySelector('#reader').open",timeout=12000)
 check('A waypoint opens the exact comment it points to',snap(page)['activeID']==j['ids'][0])
 quote=page.locator('#quote').text_content();page.locator('#keep-moment').click()
 check('Keeping a comment adds exactly one ID to the shelf',snap(page)['kept']==1 and page.locator('#keep-moment').get_attribute('aria-pressed')=='true')
 check('Keeping does not rewrite the original wording',quote==page.locator('#quote').text_content())
 page.screenshot(path=str(OUT/'paper-reader.png'));page.keyboard.press('Escape');settled(page)
 check('Reading inside a trail restores its exact stop',math.dist(list(stop_camera.values()),list(snap(page)['camera'].values()))<.08)
 page.locator('#journey-next').click();settled(page)
 check('Next trail step goes to the second actual node without rebuilding',snap(page)['journey']['index']==1 and geometry(snap(page))==base)
 page.locator('#journey-end').click();settled(page)
 check('Ending a guided wander returns to the original exploration view',snap(page)['journey'] is None and math.dist(list(original.values()),list(snap(page)['camera'].values()))<.08,{'original':original,'returned':snap(page)['camera'],'target':snap(page)['target']})
 page.locator('#browse').click();page.locator('#search').fill('');page.wait_for_timeout(200);page.locator('[data-shelf=kept]').click()
 check('Kept shelf shows just the saved comment',page.locator('#list-results button').count()==1 and quote in page.locator('#list-results').text_content())
 page.screenshot(path=str(OUT/'kept-shelf.png'));page.locator('[data-shelf=unvisited]').click()
 check('Unvisited shelf excludes opened comments',page.locator('#result-count').text_content().startswith(str(360-snap(page)['seen'])))
 page.locator('[data-shelf=all]').click();page.keyboard.press('Escape')
 page.locator('#options-toggle').click();page.locator('#paper-toggle').click();page.locator('#options-toggle').click();page.locator('#surprise').click();page.wait_for_function("document.querySelector('#reader').open",timeout=12000)
 check('Reading surface switches to midnight without changing the sky',not snap(page)['paper'] and geometry(snap(page))==base)
 page.screenshot(path=str(OUT/'night-reader.png'));page.keyboard.press('Escape');settled(page)
 page.keyboard.press('f');check('Distraction-free mode hides the controls, not the words',snap(page)['zen'] and geometry(snap(page))==base)
 page.keyboard.press('Escape');check('Escape restores the controls from distraction-free mode',not snap(page)['zen'])
 page.keyboard.press('Control+k');check('Keyboard search opens and focuses the real search input',page.locator('#library').is_visible() and page.evaluate('document.activeElement.id')=='search')
 page.keyboard.press('Escape');page.locator('#journey-toggle').click();page.wait_for_timeout(160);page.mouse.move(500,320);page.mouse.down();page.mouse.move(550,345,steps=4);page.mouse.up();settled(page)
 check('Dragging immediately interrupts a guided flight',snap(page)['journey'] is None and not snap(page)['flight'])
 check('Interrupted flight still leaves the entire geometry unchanged',geometry(snap(page))==base)
 # Import a literal XSS string and a real Unicode sequence; no execution or rewriting.
 malicious={'comments':[{'id':'test-literal','author':'<b>literal</b>','text':'<img src=x onerror="window.XSS=1">\n👩🏽‍🚀 e\u0301\nतुम्हारी हँसी','commentUrl':'javascript:alert(1)','moods':[]}]}
 page.locator('#import-file').set_input_files({'name':'test.json','mimeType':'application/json','buffer':json.dumps(malicious,ensure_ascii=False).encode()})
 page.wait_for_function('window.__skyDebug.snapshot().ready && window.__skyDebug.snapshot().total===1',timeout=20000)
 page.locator('#browse').click();page.locator('#search').fill('');page.wait_for_timeout(200);page.locator('#list-results li button').first.click();page.wait_for_function("document.querySelector('#reader').open",timeout=12000)
 check('Original Unicode and multiline text survives import to reading card',page.locator('#quote').text_content()==malicious['comments'][0]['text'])
 check('Imported HTML is never executed',page.evaluate('window.XSS') is None and page.locator('#quote img').count()==0)
 check('Unsafe source URL is not clickable',not page.locator('#reader-source').is_visible())
 page.keyboard.press('Escape')
 old=snap(page)['fingerprint'];page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'not json'});page.wait_for_timeout(200)
 check('Invalid import keeps the existing collection',snap(page)['fingerprint']==old)
 # Malformed structure and empty imports have separate, truthful outcomes.
 old=snap(page)['fingerprint'];page.locator('#import-file').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':b'{"posts":[]}'});page.wait_for_timeout(200)
 check('Unsupported JSON structure leaves the existing sky unchanged',snap(page)['fingerprint']==old)
 page.locator('#import-file').set_input_files({'name':'empty.json','mimeType':'application/json','buffer':b'{"comments":[]}'});page.wait_for_timeout(250)
 check('An explicit empty collection clears the old scene and local shelf counts',snap(page)['total']==0 and snap(page)['kept']==0 and len(snap(page)['nodes'])==0 and page.locator('#empty').is_visible())
 # Mobile touch test: actual browser touch events, not synthetic pointer listeners.
 mobile=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce')
 phone=mobile.new_page();initialise(phone);m=snap(phone);mbase=geometry(m)
 check('Reduced-motion preference is honored',m['paused'])
 check('Mobile interface has no horizontal document overflow',phone.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 phone.screenshot(path=str(OUT/'phone-home.png'))
 phone.locator('#journey-toggle').tap();phone.wait_for_timeout(180)
 check('Reduced-motion guided travel completes without an animated flight',not snap(phone)['flight'] and snap(phone)['journey']['index']==0)
 phone.screenshot(path=str(OUT/'phone-guided-stop.png'));phone.locator('#journey-end').tap();phone.wait_for_timeout(120)

 client=mobile.new_cdp_session(phone)
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':150,'y':405,'id':1},{'x':235,'y':405,'id':2}]})
 client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':90,'y':405,'id':1},{'x':295,'y':405,'id':2}]})
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 phone.wait_for_timeout(250);ms=snap(phone)
 check('Pinch physically dollies the camera',ms['camera']['z']<m['camera']['z']*.7)
 check('Pinch never turns into an accidental tap',ms['activeID'] is None and ms['gesturePointers']==0)
 check('Pinch does not change any world coordinates',geometry(ms)==mbase)
 phone.locator('#surprise').tap();phone.wait_for_function("document.querySelector('#reader').open",timeout=10000)
 check('Mobile surprise opens a readable original comment',len(phone.locator('#quote').text_content())>0)
 box=phone.locator('#reader').bounding_box();check('Mobile reader fits within the viewport',box['x']>=0 and box['x']+box['width']<=391 and box['height']<=844)
 phone.wait_for_timeout(350);phone.screenshot(path=str(OUT/'phone-reading.png'))
 phone.locator('#reader-close').tap();phone.locator('#browse').tap();phone.locator('#search').fill('no such word 9898787');phone.wait_for_timeout(220)
 check('No-results state is informative, not a blank list','No matches' in phone.locator('#list-results').inner_text())
 check('No uncaught browser errors',not REPORT['runtime_errors'],REPORT['runtime_errors'])
 REPORT['checks'].append({'name':'No graphical scene mutated by final interaction','pass':geometry(snap(phone))==mbase,'detail':None})
 print('All interactions completed; writing report.',flush=True)
 REPORT['passed']=sum(c['pass'] for c in REPORT['checks']);REPORT['total']=len(REPORT['checks'])
 (OUT/'browser-report.json').write_text(json.dumps(REPORT,indent=2))
 b.close()
REPORT['passed']=sum(c['pass'] for c in REPORT['checks']);REPORT['total']=len(REPORT['checks']);
(OUT/'browser-report.json').write_text(json.dumps(REPORT,indent=2));print(json.dumps(REPORT,indent=2));
assert REPORT['passed']==REPORT['total'],f"{REPORT['passed']}/{REPORT['total']} browser checks passed"
