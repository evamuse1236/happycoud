"""Exercise the live feeling menu and its sustained instrument parts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('test-results/mood-score');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:4317/?debug&renderer=canvas');page.wait_for_function('window.__sky?.snapshot().ready')
    page.locator('#enter-silent').click();page.wait_for_timeout(900)
    original=page.evaluate('__sky.snapshot().fingerprint')
    def choose(mood):
        page.locator('#beacon').click();page.locator(f'#orbit [data-mood="{mood}"]').click()
        assert page.evaluate('__sky.snapshot().mood')==mood
        assert page.evaluate('__sky.snapshot().fingerprint')==original
    choose('love');assert not page.evaluate('__sky.snapshot().audio.enabled')
    page.locator('#sound').click();page.wait_for_function('__sky.snapshot().audio.enabled')
    page.wait_for_function('__sky.snapshot().audio.moodNotes>=1',timeout=7000)
    results=[]
    for mood,instrument in [('love','cello'),('laugh','marimba'),('poetry','flute')]:
        if mood!='love':choose(mood)
        before=page.evaluate('__sky.snapshot().audio')
        page.wait_for_function('(n)=>__sky.snapshot().audio.moodNotes>=n+2',arg=before['moodNotes'],timeout=19000)
        page.wait_for_function('(m)=>Object.entries(__sky.snapshot().audio.moodVoices).every(([id,v])=>id===m||v===0)',arg=mood,timeout=9000)
        a=page.evaluate('__sky.snapshot().audio');assert a['instrument']==instrument and a['moodTargets'][mood]==.7
        assert a['chordIndex']>=before['chordIndex']
        assert all(v==0 for k,v in a['moodVoices'].items() if k!=mood)
        results.append({'feeling':mood,'instrument':instrument,'recurring_notes':a['moodNotes']-before['moodNotes'],'peak_voices':a['stats']['peakVoices']})
    # Reading softens the instrument; it continues to play until the feeling changes.
    page.locator('#universe').focus();page.keyboard.press('Enter');page.wait_for_function('__sky.snapshot().phase==="focused"');page.keyboard.press('Enter')
    page.wait_for_function('__sky.snapshot().audio.moodTargets.poetry===.28')
    before=page.evaluate('__sky.snapshot().audio.moodNotes');page.wait_for_function('(n)=>__sky.snapshot().audio.moodNotes>n',arg=before,timeout=9000)
    page.locator('#reader-close').click();page.wait_for_function('__sky.snapshot().phase==="sky"')
    choose('all');before=page.evaluate('__sky.snapshot().audio.moodNotes');page.wait_for_timeout(7000)
    a=page.evaluate('__sky.snapshot().audio');assert a['moodNotes']==before and all(v==0 for v in a['moodVoices'].values()) and all(v==0 for v in a['moodTargets'].values())
    page.keyboard.press('m');assert not page.evaluate('__sky.snapshot().audio.enabled')
    for width,height in [(1440,900),(390,844),(320,640)]:
        page.set_viewport_size({'width':width,'height':height});page.locator('#beacon').click()
        for button in page.locator('#orbit button').all():
            bounds=button.bounding_box();label=button.locator('span').bounding_box()
            assert bounds['x']>=0 and bounds['y']>=0 and bounds['x']+bounds['width']<=width
            assert label['x']>=0 and label['x']+label['width']<=width
        page.screenshot(path=str(out/f'menu-{width}.png'));page.locator('#beacon').click()
    assert not errors,errors
    (out/'report.json').write_text(json.dumps({'results':results,'errors':errors,'reading_continues':True,'all_returns_to_base':True},indent=2));print(json.dumps(results));browser.close()
