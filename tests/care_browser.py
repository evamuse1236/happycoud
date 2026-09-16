"""Adversarial v4 interaction checks against the actual standalone bundle.
Requires Python Playwright and Chromium. Rendering/persistence scope is recorded,
not inferred from older report files. No private comment archive is required.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,math,time,traceback
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'Khushi-Observatory.html').read_text().replace('<head>','<head><script>window.HAPPYCOUD_DEBUG=true;</script>')
R={'checks':[],'runtime_errors':[],'scope':'Actual v4 in-memory standalone bytes. Desktop, small phone, landscape. Chromium Canvas2D fallback. No private archive or physical-device testing.'}
def check(name,yes,detail=None):
 R['checks'].append({'name':name,'pass':bool(yes),'detail':detail});print(('PASS ' if yes else 'FAIL ')+name,detail if not yes else '',flush=True)
def snap(p):return p.evaluate('__skyDebug.snapshot()')
def geometry(s):return [(n['id'],n['x'],n['y'],n['z'],n['w'],n['h']) for n in s['nodes']]
def settled(p):p.wait_for_function('''()=>{const s=__skyDebug.snapshot();return !s.closingReader&&!s.flight&&Math.hypot(s.velocity.x,s.velocity.y)<.11&&Math.hypot(s.camera.x-s.target.x,s.camera.y-s.target.y,s.camera.z-s.target.z)<.02}''',timeout=16000)
def boot(c):
 p=c.new_page();p.on('pageerror',lambda e:R['runtime_errors'].append(str(e)));p.set_default_timeout(12000);p.set_content(HTML);p.locator('#demo-button').click();p.wait_for_function('__skyDebug.snapshot().ready',timeout=45000);return p
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  ctx=b.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce');p=boot(ctx);s=snap(p);base=geometry(s);R['renderer']=s['renderer']
  check('No AudioContext is created by loading or rendering the collection',s['audio']['context']=='not-created')
  p.locator('#enter-first').click();settled(p);origin=snap(p)['camera'];p.locator('#zoom-in').click();settled(p)
  check('A user zoom records a retrace point without changing geometry',snap(p)['viewTrail']>0 and geometry(snap(p))==base)
  p.locator('#retrace').click();settled(p);returned=snap(p)['camera']
  check('Retrace restores the exact prior camera',math.dist(list(origin.values()),list(returned.values()))<.05,{'before':origin,'returned':returned})
  p.locator('#browse').click();p.locator('#search').fill('sample.friend.');p.wait_for_timeout(200)
  buttons=p.locator('#list-results button');buttons.nth(12).scroll_into_view_if_needed();pre=p.locator('#library').evaluate('e=>e.scrollTop');cid=buttons.nth(12).get_attribute('data-comment-id');buttons.nth(12).click();p.wait_for_function('document.querySelector("#reader").open');quote=p.locator('#quote').text_content()
  check('Reader retains an explicit return route to the originating search',p.locator('#reader-results').is_visible() and snap(p)['activeID']==cid)
  p.locator('#reader-results').click();p.wait_for_function('document.querySelector("#library").open');post=p.locator('#library').evaluate('e=>e.scrollTop')
  check('Back to results restores search, scroll and exact keyboard focus',p.locator('#search').input_value()=='sample.friend.' and abs(pre-post)<2 and p.evaluate('document.activeElement.dataset.commentId')==cid,{'pre':pre,'post':post})
  p.keyboard.press('Escape');settled(p);p.locator('#surprise').click();p.wait_for_function('document.querySelector("#reader").open');a=snap(p)['activeID'];texta=p.locator('#quote').text_content()
  p.locator('#next-moment').click();new=snap(p)['activeID'];p.locator('#reader-previous').click()
  check('Previous restores the exact earlier comment, not another random choice',snap(p)['activeID']==a and p.locator('#quote').text_content()==texta and new!=a)
  p.locator('#reader-forward').click();check('Forward restores the same next comment',snap(p)['activeID']==new)
  p.locator('#reader-previous').click();p.locator('#next-moment').click();check('A fresh reading branch retires stale forward entries',p.locator('#reader-forward').is_disabled())
  p.locator('#copy-words').click();p.wait_for_timeout(100)
  selected=p.evaluate('getSelection().toString()');copied=p.locator('#copy-words').get_attribute('data-copied')
  check('Clipboard refusal offers selected exact original text rather than losing the action',bool(copied) or selected==p.locator('#quote').text_content())
  p.keyboard.press('Escape');settled(p)
  p.locator('#map-button').focus();p.keyboard.press('Enter');settled(p)
  check('Keyboard map activation returns home rather than jumping to a bogus pointer coordinate',abs(snap(p)['camera']['x'])<.03 and abs(snap(p)['camera']['y'])<.03 and abs(snap(p)['camera']['z']-snap(p)['homeZ'])<.03)
  p.locator('#options-toggle').click();p.locator('#tap-nav-toggle').click();p.locator('#options-toggle').click();before=snap(p)['camera'];p.locator('[data-pan=left]').click();settled(p)
  check('Single-tap directional controls provide actual drag-free navigation',snap(p)['camera']['x']!=before['x'] and geometry(snap(p))==base)
  p.locator('#options-toggle').click();p.locator('#energy-toggle').click();p.locator('#options-toggle').click();check('Energy mode is an explicit, visible setting',snap(p)['saving'])
  p.wait_for_timeout(600);start=snap(p)['frames'];p.wait_for_timeout(650)
  check('A reduced-motion settled sky makes no redundant world paints',snap(p)['frames']-start<=1,{'paints':snap(p)['frames']-start})
  p.locator('#browse').click();p.locator('#search').fill('a-query-that-does-not-exist-8821');p.wait_for_timeout(250);check('A dead-end search exposes a visible reset instead of an empty list alone',p.locator('#clear-search-filters').is_visible());p.locator('#clear-search-filters').click();check('Search reset restores all moments without altering the sky',p.locator('#list-results button').count()>0 and geometry(snap(p))==base);p.keyboard.press('Escape')
  p.screenshot(path=str(OUT/'v4-desktop.png'));ctx.close()
  # Stress a small viewport with a long actual input, not a screenshot-only mock.
  ctx=b.new_context(viewport={'width':320,'height':568},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce');p=boot(ctx);p.locator('#enter-first').click();settled(p);p.locator('#first-read').click();p.wait_for_function('document.querySelector("#reader").open')
  check('The first reading card does not waste a row on disabled history controls',p.locator('.reading-route').is_hidden())
  for _ in range(5):p.locator('#type-up').click()
  scroll=p.locator('.reader-scroll');sb=scroll.bounding_box();fb=p.locator('.reader-footer').bounding_box();rb=p.locator('#reader').bounding_box()
  check('Small-phone maximum-size reading retains a scrollable body and reachable footer',sb['height']>70 and fb['y']+fb['height']<=568 and rb['y']>=0,{'scroll':sb,'footer':fb})
  check('Small-phone reader does not overflow horizontally',p.locator('#reader').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
  p.screenshot(path=str(OUT/'v4-small-phone-reader.png'));p.keyboard.press('Escape');settled(p);before=snap(p);g=geometry(before)
  # Synthetic multipointer stress intentionally includes a third finger and a cancel.
  p.locator('#universe').evaluate('''e=>{e.setPointerCapture=()=>{};e.hasPointerCapture=()=>false;
    const send=(type,id,x,y)=>e.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,button:0}));
    send('pointerdown',1,95,280);send('pointerdown',2,210,280);send('pointerdown',3,155,350);
    send('pointermove',1,70,280);send('pointermove',2,240,280);send('pointercancel',3,155,350);send('pointerup',1,70,280);send('pointerup',2,240,280);
  }''');settled(p);after=snap(p)
  check('A third touch cannot leave stuck pointers or accidentally open a comment',after['gesturePointers']==0 and after['activeID'] is None)
  check('Pinch still changes the camera while keeping every word immutable',after['camera']['z']!=before['camera']['z'] and geometry(after)==g)
  p.set_viewport_size({'width':740,'height':360});p.locator('#surprise').click();p.wait_for_function('document.querySelector("#reader").open');fb=p.locator('.reader-footer').bounding_box();sb=p.locator('.reader-scroll').bounding_box()
  check('Short landscape reading keeps the footer reachable',fb['y']+fb['height']<=360.5 and sb['height']>35,{'footer':fb,'scroll':sb});p.screenshot(path=str(OUT/'v4-landscape-reader.png'))
  space=p.evaluate('''()=>{const q=document.querySelector('#quote'),b=document.querySelector('.reader-scroll');return {available:b.getBoundingClientRect().bottom-q.getBoundingClientRect().top,line:parseFloat(getComputedStyle(q).lineHeight),ornament:getComputedStyle(document.querySelector('.quotation-mark')).display}}''')
  check('Short landscape gives at least two enlarged text lines before scrolling',space['available']>=space['line']*2 and space['ornament']=='none',space)
  ctx.close();b.close()
 check('No uncaught runtime errors during care-focused interaction checks',not R['runtime_errors'],R['runtime_errors'])
except Exception:
 R['fatal']=traceback.format_exc();print(R['fatal']);check('Browser scenario completed',False)
finally:
 R['passed']=sum(c['pass'] for c in R['checks']);R['total']=len(R['checks']);(OUT/'care-browser-report.json').write_text(json.dumps(R,indent=2));print(json.dumps({'passed':R['passed'],'total':R['total']},indent=2))
 if R['passed']!=R['total']:raise SystemExit(1)
