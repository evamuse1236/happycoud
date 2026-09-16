"""Render and exercise the actual standalone code in Chromium.

Requires: Python, playwright, and a Chromium executable. No remote test service.
Uses set_content + inline import map, so it does not need navigation permissions.
This deliberately tests a labelled fixture, not the private comment archive.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, json, subprocess, time, sys

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--chromium', default='/usr/bin/google-chrome-stable')
parser.add_argument('--canvas', action='store_true', help='Exercise the Canvas fallback')
parser.add_argument('--output', default=str(ROOT/'test-results/cinematic'))
args=parser.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','tools/build-cinematic.mjs'],cwd=ROOT,check=True)
HTML=(ROOT/'dist-cinematic/Khushi-Cinematic-Sky.html').read_text()
DATA=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {sampleData} from './src/demo.js';console.log(JSON.stringify(sampleData()))"],cwd=ROOT))
results=[];errors=[];requests=[]
def record(name,fn):
    start=time.time()
    try:
        detail=fn();results.append({'name':name,'passed':True,'seconds':round(time.time()-start,2),'detail':detail})
        print('PASS',name,flush=True)
    except Exception as e:
        results.append({'name':name,'passed':False,'seconds':round(time.time()-start,2),'error':str(e)})
        print('FAIL',name,str(e),flush=True)
def check(condition,message):
    assert condition,message

def load(browser,width=1440,height=900,reduced=False,touch=False,data=None):
    ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=touch,is_mobile=touch,reduced_motion='reduce' if reduced else 'no-preference')
    page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    payload=json.dumps(data or DATA,ensure_ascii=True).replace('</','<\\/')
    html=HTML.replace('</head>','<script>globalThis.HAPPYCOUD_DEBUG=true;globalThis.HAPPYCOUD_EMBEDDED='+payload+';</script></head>')
    if args.canvas:
        page.add_init_script('HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext,{apply(target, self, args){return String(args[0]).startsWith("webgl")?null:Reflect.apply(target,self,args)}})')
        page.goto('about:blank')
    page.set_content(html,wait_until='load')
    page.wait_for_function('window.__sky?.snapshot().ready',timeout=20000)
    return page

def enter(page):
    page.locator('#enter-silent').click();page.evaluate('__sky.finish()');page.wait_for_timeout(950)

def ready_read(page,id):
    page.evaluate('(id)=>__sky.select(id)',id)
    page.wait_for_function("__sky.snapshot().phase==='focused'",timeout=12000)
    check(not page.locator('#reader').evaluate('(el)=>el.open'),'First selection opened the reader')
    page.evaluate('(id)=>__sky.select(id)',id)
    page.wait_for_function("__sky.snapshot().phase==='reading' && __sky.snapshot().readingMix===1",timeout=12000)

def close_read(page):
    page.locator('#reader-close').click()
    page.wait_for_function("__sky.snapshot().phase==='sky' && !document.querySelector('#reader').open",timeout=10000)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=load(browser)
    def desktop_start():
        s=page.evaluate('__sky.snapshot()');check(s['count']==360 and s['sample'],'Fixture is not clearly labelled');check(not s['audio']['enabled'],'Autoplay without consent')
        page.screenshot(path=str(OUT/'01-gate-desktop.png'))
        page.locator('#enter-silent').click();page.wait_for_timeout(2200)
        a=page.evaluate('__sky.snapshot()');check(0<a['birth']<1,'No finite opening progression');page.screenshot(path=str(OUT/'02-condensation-desktop.png'))
        page.evaluate('__sky.finish()');page.wait_for_timeout(400);b=page.evaluate('__sky.snapshot()')
        check([(n['x'],n['y'],n['z']) for n in a['nodes']]==[(n['x'],n['y'],n['z']) for n in b['nodes']],'Quote anchors changed')
        page.screenshot(path=str(OUT/'03-sky-desktop.png'))
        return {'renderer':s['renderer'],'fallback':s.get('graphicsFallbackReason'),'comments':s['count']}
    record('Desktop opening: immutable words, opt-in audio, actual formation',desktop_start)
    origin=page.evaluate('__sky.snapshot().camera')
    def reader_roundtrip():
        ready_read(page,'sample-157');s=page.evaluate('__sky.snapshot()');text=page.locator('#reader-quote').text_content()
        check(text==page.evaluate('__sky.original("sample-157").text'),'Original text changed')
        check(page.locator('#reader-word').count()==0,'Per-word explosion returned')
        check(page.evaluate('getComputedStyle(document.querySelector("#navigation")).opacity')=='0','Sky controls overlap reader')
        check(page.evaluate('__sky.snapshot().readingOrigin')==origin,'Return origin lost')
        page.screenshot(path=str(OUT/'04-reader-desktop.png'))
        page.locator('#keep').click();check('sample-157' in page.evaluate('__sky.snapshot().kept'),'Keep action failed')
        close_read(page);after=page.evaluate('__sky.snapshot().camera')
        check(all(abs(after[k]-origin[k])<.01 for k in origin),'Camera did not return to exact saved position')
        return {'exact_text':True,'return_error':max(abs(after[k]-origin[k]) for k in origin)}
    record('Reader: exact words, one camera approach, keep, exact return',reader_roundtrip)
    def interruption():
        page.evaluate('__sky.select("sample-005")');page.wait_for_timeout(200)
        page.mouse.move(700,450);page.mouse.wheel(0,-100);page.wait_for_timeout(2500)
        check(not page.locator('#reader').evaluate('(el)=>el.open'),'Cancelled flight opened a ghost reader')
        check(page.evaluate('__sky.snapshot().pointers')==0,'Stuck gesture')
        page.locator('#universe').focus();page.keyboard.press('h');page.wait_for_timeout(1900)
    record('A scroll interrupts a camera approach without a late reader',interruption)
    def nav_library():
        page.locator('#beacon').click();check(page.locator('#orbit').is_visible(),'Navigation constellation did not open')
        page.wait_for_timeout(550);page.screenshot(path=str(OUT/'05-navigation-desktop.png'))
        page.locator('[data-open="library"]').click();page.locator('#query').fill('ordinary afternoons');page.wait_for_timeout(180)
        count=page.locator('.result').count();check(count>0,'Search missed originals')
        first=page.locator('.result').first.get_attribute('data-comment-id')
        page.locator('.result').first.click();page.wait_for_function('__sky.snapshot().readingMix===1',timeout=12000)
        check(page.evaluate('__sky.snapshot().selected')==first,'Search clicked a different comment')
        page.locator('#reader-results').click();page.wait_for_function('document.querySelector("#library").open')
        check(page.locator('#query').input_value()=='ordinary afternoons','Search context lost')
        page.locator('#library [data-close]').click();page.locator('#universe').focus();page.keyboard.press('h');page.wait_for_timeout(1900)
        return {'matching_results':count}
    record('Stellar navigation, search, selection and return to results',nav_library)
    def keyboard():
        page.locator('#universe').focus();page.keyboard.press('Space');check(page.locator('#orbit').is_visible(),'Space did not reveal navigation')
        check(page.evaluate('document.activeElement.classList.contains("satellite-find")'),'Keyboard focus not placed in navigation')
        page.keyboard.press('Escape');check(not page.locator('#orbit').is_visible(),'Escape did not close navigation')
        page.locator('#universe').focus();page.keyboard.press('/');check(page.locator('#library').evaluate('(e)=>e.open'),'Search shortcut failed')
        page.keyboard.press('Escape');page.locator('#universe').focus();page.keyboard.press('Enter');page.wait_for_function('__sky.snapshot().phase==="focused"',timeout=12000);page.keyboard.press('Enter');page.wait_for_function('__sky.snapshot().readingMix===1',timeout=12000)
        page.keyboard.press('Escape');page.wait_for_function('__sky.snapshot().phase==="sky"',timeout=10000)
    record('Keyboard navigation, native modal focus, Enter and Escape',keyboard)
    def failed_import():
        before=page.evaluate('__sky.snapshot().fingerprint')
        failure=page.evaluate('async()=>{try{await __sky.import({wrong:[]});return false}catch{return true}}')
        check(failure and before==page.evaluate('__sky.snapshot().fingerprint'),'Invalid import destroyed current sky')
        failure=page.evaluate('async()=>{try{await __sky.import({comments:[]});return false}catch{return true}}')
        check(failure and before==page.evaluate('__sky.snapshot().fingerprint'),'Empty import destroyed current sky')
    record('Malformed and empty imports keep the current constellation intact',failed_import)
    def reader_history():
        ready_read(page,'sample-002');first=page.evaluate('__sky.snapshot().selected');page.locator('#reader-next').click()
        page.wait_for_function('(id)=>__sky.snapshot().selected!==id&&__sky.snapshot().readingMix===1',arg=first,timeout=12000)
        page.locator('#reader-previous').click();page.wait_for_function('(id)=>__sky.snapshot().selected===id&&__sky.snapshot().readingMix===1',arg=first,timeout=12000)
        close_read(page)
    record('Next and previous reading preserve real-comment history',reader_history)
    def audio_consent():
        check(not page.evaluate('__sky.snapshot().audio.enabled'),'Silent entry did not stay silent')
        page.locator('#sound').click();page.wait_for_timeout(900)
        check(page.evaluate('__sky.snapshot().audio.enabled'),'Opt-in sound did not enable')
        page.locator('#sound').click();page.wait_for_timeout(350)
        check(not page.evaluate('__sky.snapshot().audio.enabled'),'Mute failed')
        page.locator('#sound').click();page.locator('#sound').click();page.locator('#sound').click();page.wait_for_timeout(350)
        check(page.evaluate('__sky.snapshot().audio.enabled'),'Rapid mute/unmute race')
        ready_read(page,'sample-030');page.wait_for_timeout(650)
        s=page.evaluate('__sky.snapshot().audio');check(s['stats']['notes']>0,'Reading did not produce a scheduled piano voice');check(s['stats']['peakVoices']<=24,'Unbounded audio voices')
        close_read(page)
        page.locator('#sound').click();page.wait_for_timeout(300)
        return s
    record('Audio consent, mute, rapid toggles and voice limits',audio_consent)
    page.context.close()
    mobile=load(browser,390,844,touch=True)
    def mobile_reading():
        enter(mobile);mobile.screenshot(path=str(OUT/'06-sky-mobile.png'));ready_read(mobile,'sample-157')
        bounds=mobile.locator('#reader-quote').bounding_box();check(bounds['x']>=0 and bounds['x']+bounds['width']<=391,'Reader overflows horizontally')
        check(mobile.evaluate('document.documentElement.scrollWidth')==390,'Mobile page has horizontal overflow')
        mobile.screenshot(path=str(OUT/'07-reader-mobile.png'));close_read(mobile)
        mobile.locator('#beacon').click();mobile.wait_for_timeout(550);mobile.screenshot(path=str(OUT/'08-navigation-mobile.png'));mobile.locator('[data-open="comfort"]').click()
        check(mobile.locator('#comfort').bounding_box()['width']<=390,'Settings exceed phone width');mobile.screenshot(path=str(OUT/'09-settings-mobile.png'));mobile.locator('#comfort [data-close]').click()
        return {'viewport':[390,844],'quote_bounds':bounds}
    record('390px mobile sky, navigation, reader and settings',mobile_reading)
    def pinch():
        before=mobile.evaluate('__sky.snapshot().camera.z');client=mobile.context.new_cdp_session(mobile)
        client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':150,'y':420},{'x':240,'y':420}]})
        for step in range(1,7):
            client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':150-step*8,'y':420},{'x':240+step*8,'y':420}]});mobile.wait_for_timeout(30)
        client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});mobile.wait_for_timeout(1600)
        after=mobile.evaluate('__sky.snapshot()');check(after['camera']['z']<before,'Pinch did not move closer');check(after['pointers']==0,'Pinch pointer stayed captured');check(after['phase']!='reading','Pinch release turned into accidental quote click')
    record('Two-finger pinch zoom does not become an accidental click',pinch)
    mobile.context.close()
    short={**DATA,'comments':DATA['comments'][:14]}
    short['comments'][0]={**short['comments'][0],'text':'First line.\n  Keep my spaces. 🤍\n'+('A long original with a breath, a pause, and room to read. '*50)+'<img src=x onerror="window.__injected=true">','commentUrl':'javascript:alert(1)'}
    reduced_page=load(browser,390,844,reduced=True,touch=True,data=short)
    def reduced_long():
        enter(reduced_page);check(reduced_page.evaluate('__sky.snapshot().birth')==1,'Reduced motion played formation')
        ready_read(reduced_page,'sample-001');check(reduced_page.locator('#reader-quote').text_content()==short['comments'][0]['text'],'Long original was shortened')
        check(reduced_page.locator('#reader-quote').evaluate('(el)=>el.scrollHeight>el.clientHeight'),'Long reader is not scrollable')
        check(reduced_page.locator('#reader-quote img').count()==0,'Unsafe text executed as markup');check(not reduced_page.evaluate('!!window.__injected'),'Injected script executed')
        check(not reduced_page.locator('#reader-source').is_visible(),'Unsafe source link exposed')
        reduced_page.locator('#reader-quote').evaluate('(el)=>el.scrollTop=el.scrollHeight')
        reduced_page.screenshot(path=str(OUT/'10-long-reader-mobile.png'))
        check(reduced_page.evaluate('document.documentElement.scrollWidth')==390,'Long text widened the page')
        close_read(reduced_page)
    record('Reduced motion, full long originals, scrolling and inert markup',reduced_long)
    reduced_page.context.close();browser.close()

results.append({'name':'No uncaught JavaScript errors','passed':not errors,'errors':errors})
results.append({'name':'Standalone fixture makes no external network requests','passed':not requests,'requests':requests})
report={'test_mode':'Actual standalone import-map code rendered with set_content and explicitly labelled fixtures; no private archive or destination Vite build involved.','results':results,'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results)}
(OUT/'browser-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'report':str(OUT/'browser-report.json')}),flush=True)
sys.exit(1 if report['failed'] else 0)
