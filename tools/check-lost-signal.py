"""Real-asset Lost Signal browser regression and bounded screenshot pass.
Run with Vite on :4317 and Python Playwright + Chrome installed.
Outputs (including private screenshots) stay under ignored test-results/.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/lost-signal/final'
OUT.mkdir(parents=True, exist_ok=True)
SONG = json.loads((ROOT / 'public/data/song.json').read_text())
checks, errors = [], []

def check(name, passed):
    checks.append({'name': name, 'passed': bool(passed)})
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    assert passed, name

def seek(page, time):
    page.locator('.ls-seek').evaluate('(e,t)=>{e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}))}', time)
    page.wait_for_timeout(100)

def enter(page, reduced=False):
    page.goto(os.environ.get('HAPPYCOUD_URL', 'http://127.0.0.1:4317/') + '?debug' + ('&renderer=canvas' if reduced else ''))
    page.wait_for_function('window.__sky?.snapshot().ready')
    page.click('#enter-silent')
    page.evaluate('__sky.finish()')
    page.wait_for_selector('#sl-portal', state='visible')

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/google-chrome-stable'), headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1440,'height':900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        enter(page)
        camera = page.evaluate('__sky.snapshot().camera')
        check('Production WebGL renderer', page.evaluate('__sky.snapshot().renderer') == 'webgl2')
        page.click('#sl-portal')
        page.wait_for_timeout(1700)
        check('Pulse hidden during connection', page.locator('.ls-pulse-layer').evaluate('e=>e.hasAttribute("hidden")&&getComputedStyle(e).display==="none"'))
        check('Native pointer restored in song', page.evaluate('!document.documentElement.hasAttribute("data-star-cursor")'))
        page.screenshot(path=str(OUT / 'connection.png'))
        page.wait_for_function('__sky.snapshot().song.phase==="song"', timeout=25000)
        page.wait_for_function('__sky.snapshot().song.time>.2&&!__sky.snapshot().song.paused')
        check('Real recording advances with no alignment warnings', page.evaluate('__sky.snapshot().song.duration>130&&__sky.snapshot().song.warnings===0'))
        page.click('[data-action=play]')
        t = page.evaluate('__sky.snapshot().song.time')
        page.wait_for_timeout(200)
        check('Pause freezes the recording', page.evaluate('__sky.snapshot().song.time') == t)
        seek(page,70)
        page.wait_for_timeout(200)
        check('Paused seeking leaves no floating source words', page.locator('.ls-cargo').count() == 0)
        check('Untimed source text stays legible', page.locator('.ls-source .ls-rest').first.evaluate('e=>Number(getComputedStyle(e).opacity)>=.85'))
        for w,h in [(1440,900),(390,844),(320,568),(844,390),(768,1024)]:
            page.set_viewport_size({'width':w,'height':h})
            seek(page,70)
            page.screenshot(path=str(OUT / f'player-{w}x{h}.png'))
            bounds=page.locator('.ls-lyric,.ls-source-quote,.ls-footer').evaluate_all('(es)=>es.map(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})')
            check(f'Visible layout at {w}x{h}',all(bounds))
        page.click('[data-action=mute]')
        check('Mute state updates',page.evaluate('__sky.snapshot().song.muted'))
        page.click('[data-action=mute]')
        page.click('[data-action=source]')
        page.keyboard.press('Shift+Tab')
        check('Original drawer traps keyboard focus',page.evaluate('!!document.activeElement.closest(".ls-drawer")'))
        page.keyboard.press('Escape')
        check('Closing drawer restores original trigger',page.evaluate('document.activeElement.dataset.action==="source"'))
        page.click('[data-action=lyrics]')
        page.screenshot(path=str(OUT/'lyrics.png'))
        page.locator('.ls-transcript-line').nth(5).click()
        page.wait_for_timeout(200)
        check('Transcript selection seeks and plays',page.evaluate('__sky.snapshot().song.time')>=SONG['phrases'][5]['start'] and not page.evaluate('__sky.snapshot().song.paused'))
        page.click('[data-action=restart]')
        page.wait_for_timeout(100)
        check('Restart plays from beginning',page.evaluate('__sky.snapshot().song.time<1&&!__sky.snapshot().song.paused'))
        page.keyboard.press('Escape')
        page.wait_for_function('!__sky.snapshot().song.active')
        check('Return restores camera and interaction',page.evaluate('__sky.snapshot().camera')==camera and page.evaluate('!document.querySelector("#app").inert'))
        page.close()
        page=browser.new_page(viewport={'width':320,'height':568},reduced_motion='reduce',has_touch=True,is_mobile=True)
        page.on('pageerror',lambda e:errors.append(str(e)))
        enter(page,True)
        page.click('#sl-portal')
        page.wait_for_function('__sky.snapshot().song.phase==="song"')
        check('Reduced motion enters directly',page.locator('.ls-cargo').count()==0)
        page.wait_for_function('!__sky.snapshot().song.paused')
        page.click('[data-action=play]')
        for w,h in [(320,568),(390,844),(844,390),(768,1024),(1440,900)]:
            page.set_viewport_size({'width':w,'height':h})
            issues=page.evaluate('''async phrases=>{
              const issues=[],seek=document.querySelector('.ls-seek');
              for(const [i,p] of phrases.entries()){
                seek.value=p.start+.15;seek.dispatchEvent(new Event('input',{bubbles:true}));
                await new Promise(r=>setTimeout(r,35));
                const l=document.querySelector('#ls-lyric'),stage=document.querySelector('.ls-stage').getBoundingClientRect(),footer=document.querySelector('.ls-footer').getBoundingClientRect();
                if(l.scrollHeight>l.clientHeight+2||stage.bottom>footer.top||l.textContent!==p.text)issues.push(i);
              }return issues;
            }''',SONG['phrases'])
            check(f'All 40 actual lyrics fit and retain text at {w}x{h}',not issues)
        page.keyboard.press('Escape')
        check('Reduced motion restores sky',page.evaluate('!__sky.snapshot().song.active'))
        check('No uncaught browser errors',not errors)
        browser.close()
finally:
    (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2)+'\n')
