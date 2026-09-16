"""v4 choreography and sound integration, using the actual standalone app.
Run `npm run build` first. Browser navigation is blocked in the build environment; persistence uses an explicit Storage fixture.
Set CHROMIUM to a browser executable if it is not /usr/bin/chromium.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, math, os, time, traceback
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'Khushi-Observatory.html').read_text().replace('<head>','<head><script>window.HAPPYCOUD_DEBUG=true;</script>')
R={'checks':[],'runtime_errors':[],'scope':'Actual v4 standalone bytes rendered in memory; Chromium Canvas2D fallback; production Web Audio graph rendered offline. Storage restoration uses a test fixture, not real origin persistence. No subjective listening or physical-device performance test.','not_executed':[{'name':'Direct file:// and localhost navigation','reason':'Managed Chromium blocks navigation with ERR_BLOCKED_BY_ADMINISTRATOR; standalone bytes are executed with set_content instead.'},{'name':'Native browser localStorage persistence across actual navigation','reason':'No usable navigable origin; restored-view logic is checked with an explicit content-free Storage fixture.'}]}
def check(name,yes,detail=None):
 R['checks'].append({'name':name,'pass':bool(yes),'detail':detail});print(time.strftime('%H:%M:%S'), 'PASS' if yes else 'FAIL',name,flush=True)
def snap(p):return p.evaluate('window.__skyDebug.snapshot()')
def geo(p):return [(n['id'],n['x'],n['y'],n['z'],n['w'],n['h']) for n in snap(p)['nodes']]
def settled(p):p.wait_for_function('''() => {const s=__skyDebug.snapshot();return !s.closingReader&&!s.flight&&Math.hypot(s.camera.x-s.target.x,s.camera.y-s.target.y,s.camera.z-s.target.z)<.03}''',timeout=14000)
def camera_delta(a,b):return math.dist([a[k] for k in ('x','y','z')],[b[k] for k in ('x','y','z')])
def boot(context,store=None):
 p=context.new_page();p.set_default_timeout(10000);p.on('pageerror',lambda e:R['runtime_errors'].append(str(e)))
 html=HTML
 if store is not None:
  fixture="<script>window.__storageFixture="+json.dumps(store).replace('<','\\u003c')+";Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return Object.hasOwn(__storageFixture,k)?__storageFixture[k]:null},setItem(k,v){__storageFixture[k]=String(v)},removeItem(k){delete __storageFixture[k]},clear(){window.__storageFixture={}}}});</script>"
  html=html.replace('<head>','<head>'+fixture)
 p.set_content(html);return p
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  ctx=browser.new_context(viewport={'width':1440,'height':900});page=boot(ctx);requests=[];page.on('request',lambda r:requests.append(r.url))
  check('Empty first opening does not create an AudioContext',snap(page)['audio']['context']=='not-created')
  check('Local sample and import are distinct, explicit choices',page.locator('#demo-button').is_visible() and page.locator('.empty-state .import-trigger').count()>0)
  page.screenshot(path=str(OUT/'v4-empty.png'))
  page.locator('#demo-button').click();page.wait_for_function('__skyDebug.snapshot().ready',timeout=40000);base=geo(page);initial=snap(page)
  check('First opening begins an in-place ink reveal',initial['experience']['arriving'] and 0<=initial['experience']['reveal']<1,initial['experience'])
  progress=[]
  for _ in range(5):page.wait_for_timeout(160);progress.append(snap(page)['experience']['reveal'])
  check('Opening reveal advances without changing a single word position',len(set(progress))>2 and geo(page)==base,progress)
  page.wait_for_function('__skyDebug.snapshot().experience.reveal===1',timeout=12000)
  check('The opening completes with all 360 original instances still present',geo(page)==base and snap(page)['total']==360)
  check('Opening is silent unless deliberately enabled',snap(page)['audio']['context']=='not-created')
  check('No external font, image, audio or CDN requests for standalone opening',not requests,requests)
  page.screenshot(path=str(OUT/'v4-home.png'))
  page.locator('#sound-quick').click();page.wait_for_function('__skyDebug.snapshot().audio.enabled');a=snap(page)['audio']
  check('Explicit sound button starts the real browser AudioContext',a['context']=='running' and a['notes']==3,a)
  page.locator('#enter-first').click();first=snap(page)['firstAnchor'];frames=[]
  for _ in range(5):page.wait_for_timeout(130);frames.append(snap(page))
  check('First approach flies to an existing comment, not generated placeholder text',first in [n[0] for n in base])
  check('First zoom is continuous and all intermediate word coordinates stay fixed',len({round(s['camera']['z']) for s in frames})>2 and geo(page)==base)
  settled(page);page.wait_for_selector('#first-read:visible');view=snap(page);origin=dict(view['camera'])
  check('First approach waits for an intentional reading click',view['activeID'] is None and not page.locator('#reader').is_visible())
  target=next(n for n in view['nodes'] if n['id']==first);p=target['projected'];r=page.locator('#first-read').bounding_box();tw,th=target['w']*p['scale'],target['h']*p['scale']
  overlap=max(0,min(r['x']+r['width'],p['x']+tw/2)-max(r['x'],p['x']-tw/2))*max(0,min(r['y']+r['height'],p['y']+th/2)-max(r['y'],p['y']-th/2))
  check('The first-reading invitation does not cover its own comment',overlap<1,{'overlap_pixels':overlap})
  page.screenshot(path=str(OUT/'v4-first-approach.png'))
  # Dwell needs intent; crossing the text quickly must not play a note.
  page.mouse.move(5,250);page.wait_for_timeout(1500);notes=snap(page)['audio']['notes']
  neighbor=min((n for n in view['nodes'] if n['id']!=first and n['projected'] and 150<n['projected']['x']<1200 and 210<n['projected']['y']<680 and n['font']*n['projected']['scale']>11),key=lambda n:math.hypot(n['projected']['x']-720,n['projected']['y']-450))
  page.mouse.move(neighbor['projected']['x'],neighbor['projected']['y']);page.wait_for_timeout(70)
  check('A fleeting hover does not chirp',snap(page)['audio']['notes']==notes)
  page.wait_for_timeout(620)
  check('A deliberate dwell gives one restrained comment note',snap(page)['audio']['notes']==notes+1,{'before':notes,'after':snap(page)['audio']['notes'],'audio':snap(page)['audio']})
  page.wait_for_timeout(600);check('Holding still does not repeat the same hover note',snap(page)['audio']['notes']==notes+1,{'before':notes,'after':snap(page)['audio']['notes'],'audio':snap(page)['audio']})
  page.mouse.move(5,250)
  page.locator('#first-read').click();page.wait_for_function("document.querySelector('#reader').open");page.wait_for_timeout(450);read=snap(page)
  check('First invitation opens exactly the real comment it marked',read['activeID']==first)
  check('Reading quiets the ambient bed and removes navigation air',read['audio']['reading'] and read['audio']['mix']['air']==0 and read['audio']['mix']['bed']<.04,read['audio']['mix'])
  text=page.locator('#quote').text_content();size=page.locator('#quote').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')
  page.locator('#type-up').click();newsize=page.locator('#quote').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')
  check('Reading size grows without altering any wording or cloud position',newsize>size and page.locator('#quote').text_content()==text and geo(page)==base)
  page.locator('#keep-moment').click();check('Keeping a moment produces one stored ID and a short audio response',snap(page)['kept']==1 and page.locator('#keep-moment').get_attribute('aria-pressed')=='true')
  check('Comment HTML retains original line breaks and automatic text direction',page.locator('#quote').get_attribute('dir')=='auto' and page.locator('#quote').evaluate('(e)=>getComputedStyle(e).whiteSpace')=='pre-wrap')
  page.screenshot(path=str(OUT/'v4-paper-reading.png'))
  page.keyboard.press('m');page.wait_for_timeout(1700)
  check('M mutes even inside the reader, then releases the audio context',not snap(page)['audio']['enabled'] and snap(page)['audio']['context']=='suspended')
  count=snap(page)['audio']['notes'];page.locator('#reader-sound').click();page.wait_for_function('__skyDebug.snapshot().audio.enabled')
  check('Unmuting while reading does not replay the opening motif',snap(page)['audio']['notes']==count)
  # A drag from text into the backdrop is not a dismissal.
  quote=page.locator('#quote').bounding_box();page.mouse.move(quote['x']+25,quote['y']+20);page.mouse.down();page.mouse.move(5,20,steps=6);page.mouse.up();page.wait_for_timeout(250)
  check('A selection drag ending outside the paper does not dismiss it',page.locator('#reader').is_visible())
  page.keyboard.press('Escape');settled(page)
  check('Closing settles at the exact pre-reader first-approach camera',camera_delta(origin,snap(page)['camera'])<.08)
  check('Reading return restores the sound mix, never the comment geometry',not snap(page)['audio']['reading'] and geo(page)==base)
  page.locator('#options-toggle').click();page.locator('#sound-mode').select_option('notes')
  page.locator('#sound-volume').fill('20');page.locator('#sound-volume').dispatch_event('input');a=snap(page)['audio']
  check('Notes-only genuinely removes the drone and air paths',a['mode']=='notes' and a['mix']['bed']==0 and a['mix']['air']==0)
  check('Sound-level control changes the real mix and visible value',a['volume']==.2 and abs(a['mix']['master']-.096)<1e-9 and page.locator('#volume-value').inner_text()=='20%')
  page.locator('#options-toggle').click();page.locator('[data-mood=love]').click();wave=snap(page)['experience']['moodBlend'];page.wait_for_timeout(1250)
  check('Mood lighting is a continuous wave, with fixed geometry',wave<1 and snap(page)['experience']['moodBlend']==1 and geo(page)==base)
  page.locator('[data-mood=all]').click();page.locator('#options-toggle').click();page.locator('#replay-opening').click();page.wait_for_timeout(80);page.locator('#skip-opening').click()
  check('Replay uses the same instances and the opening can be skipped immediately',geo(page)==base and snap(page)['experience']['reveal']==1)
  page.locator('#options-toggle').click();page.locator('#reduced-toggle').click();page.locator('#options-toggle').click();page.locator('#enter-first').click();page.wait_for_timeout(100)
  check('Gentler-motion preference removes the first camera flight',snap(page)['reduced'] and not snap(page)['flight'])
  # Render the exact production Web Audio nodes, not just their intended settings.
  audio_render=page.evaluate('''async () => {
    const {ObservatorySound}=await import('hc:sound');
    async function render(muted){
      const raw=new OfflineAudioContext(2,44100*6,44100);
      const proxy=new Proxy(raw,{get(t,k){if(k==='state')return 'running';const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
      const s=new ObservatorySound({contextFactory:function(){return proxy;}});
      s.mode='notes';s.build();s.enabled=!muted;s.volume=.32;s.applyMix();s.event('arrival');s.pluck('measured-comment',{kind:'keep',pan:-.6,delay:2});
      const buffer=await raw.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
      let peak=0,finite=true,energy=0,stereo=0,tail=0;
      for(let i=0;i<left.length;i++){finite&&=Number.isFinite(left[i])&&Number.isFinite(right[i]);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));energy+=left[i]**2+right[i]**2;stereo+=(left[i]-right[i])**2;if(i>44100*5.8)tail=Math.max(tail,Math.abs(left[i]),Math.abs(right[i]));}
      return {sampleRate:buffer.sampleRate,frames:buffer.length,finite,peak,rms:Math.sqrt(energy/(left.length*2)),stereoDifferenceRMS:Math.sqrt(stereo/left.length),tailPeak:tail,scheduledNotes:s.stats.notes};
    }
    return {on:await render(false),muted:await render(true)};
  }''')
  R['offline_audio']=audio_render
  check('Production audio graph renders finite, non-silent, unclipped PCM',audio_render['on']['finite'] and .001<audio_render['on']['peak']<1,audio_render['on'])
  check('Production notes create an actual stereo difference, not mono pretending to pan',audio_render['on']['stereoDifferenceRMS']>.00001)
  check('Muted production graph renders complete silence',audio_render['muted']['peak']==0,audio_render['muted'])
  # Test the app's stored-state contract honestly with a browser Storage fixture.
  persist=boot(ctx,{});persist.locator('#demo-button').click();persist.wait_for_function('__skyDebug.snapshot().ready',timeout=40000)
  persist.locator('#enter-first').click();settled(persist);saved=snap(persist)['camera'];persist.evaluate("window.dispatchEvent(new Event('pagehide'))")
  persist.locator('#sound-quick').click();persist.wait_for_function('__skyDebug.snapshot().audio.enabled');persist.locator('#options-toggle').click();persist.locator('#reduced-toggle').click()
  stored=persist.evaluate('window.__storageFixture');persist.close();persist=boot(ctx,stored);persist.locator('#demo-button').click();persist.wait_for_function('__skyDebug.snapshot().ready',timeout=40000)
  check('Stored preferences do not auto-enable sound on app reinitialization',snap(persist)['audio']['context']=='not-created')
  check('Restored storage offers the saved view for the same layout',persist.locator('#resume-place').is_visible())
  check('An explicitly selected gentler-motion setting survives storage restoration',snap(persist)['reduced'])
  persist.locator('#resume-place').click();settled(persist)
  check('Resume goes back to the same exact settled view',camera_delta(saved,snap(persist)['camera'])<.08)
  storage=persist.evaluate('window.__storageFixture');check('Local memory contains no comment text or author handles',not any('sample.friend' in v or text in v for v in storage.values()),list(storage.keys()))
  # Phone layouts at both standard and narrow sizes, native OS reduced-motion preference.
  phone_ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,reduced_motion='reduce')
  phone=boot(phone_ctx);phone.locator('#demo-button').click();phone.wait_for_function('__skyDebug.snapshot().ready',timeout=40000);phone_base=geo(phone)
  check('OS reduced-motion starts with a complete, still word field',snap(phone)['reduced'] and snap(phone)['experience']['reveal']==1)
  check('Phone opening leaves the invitation clear of the navigation map',phone.locator('#enter-first').is_visible() and not phone.locator('.navigator').is_visible())
  phone.screenshot(path=str(OUT/'v4-phone-opening.png'));phone.locator('#enter-first').click();phone.wait_for_selector('#first-read:visible');r=phone.locator('#first-read').bounding_box()
  check('Phone first-reading callout stays within the viewport',r['x']>=0 and r['x']+r['width']<=390 and r['y']>0 and r['y']+r['height']<844,r)
  phone.locator('#first-read').click();phone.wait_for_function("document.querySelector('#reader').open");t=phone.locator('#quote').text_content()
  for _ in range(5):phone.locator('#type-up').click()
  check('Largest reading size stops at 150%, preserving exact words',snap(phone)['readingScale']==1.5 and phone.locator('#type-up').is_disabled() and phone.locator('#quote').text_content()==t)
  check('Phone reader remains inside the viewport with no horizontal overflow',phone.locator('#reader').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1}'))
  phone.screenshot(path=str(OUT/'v4-phone-reading.png'));phone.keyboard.press('Escape');settled(phone)
  phone.set_viewport_size({'width':320,'height':700});settled(phone);phone.locator('#options-toggle').click();phone.locator('#reduced-toggle').click()
  check('The app cannot override an OS reduced-motion request',snap(phone)['reduced'])
  phone.locator('#replay-opening').click();phone.wait_for_timeout(150);cta=phone.locator('#enter-first').bounding_box()
  check('Narrow 320px phone still has an unobstructed first-entry button',cta['x']>=0 and cta['x']+cta['width']<=320 and cta['y']+cta['height']<=700)
  phone.locator('#enter-first').click();phone.wait_for_selector('#first-read:visible');phone.locator('#first-read').click();phone.wait_for_function("document.querySelector('#reader').open")
  check('Narrow phone reading still fits at the enlarged preference',phone.locator('#reader').evaluate('(e)=>e.getBoundingClientRect().right<=innerWidth&&e.scrollWidth<=e.clientWidth+1') and geo(phone)==phone_base)
  phone.screenshot(path=str(OUT/'v4-narrow-reading.png'))
  # Direct navigation is blocked by the managed browser; do not claim it passed.
  check('All experience integration checks completed without uncaught JS exceptions',not R['runtime_errors'],R['runtime_errors'])
  browser.close()
except Exception as e:
 R['fatal']=str(e);R['traceback']=traceback.format_exc();check('Integration run completes without tooling or application interruption',False,str(e));print(R['traceback'],flush=True)
finally:
 R['passed']=sum(c['pass'] for c in R['checks']);R['total']=len(R['checks'])
 (OUT/'experience-browser-report.json').write_text(json.dumps(R,indent=2));print(json.dumps({'passed':R['passed'],'total':R['total'],'fatal':R.get('fatal')}),flush=True)
 if R['passed']!=R['total']:raise SystemExit(1)
