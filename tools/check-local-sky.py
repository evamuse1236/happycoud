"""Local Vite integration: real archive, pointer/touch two-step reading and context."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path('test-results/local-sky');out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--no-sandbox'])
    for width,height,touch in [(1440,900,False),(390,844,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,reduced_motion='reduce')
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4317/?debug&renderer=canvas')
        page.wait_for_function('window.__sky?.snapshot().ready')
        assert page.evaluate('''()=>__sky.snapshot().nodes.every(n=>{const c=__sky.original(n.id),owner=r=>r.isOwner||r.is_account_owner||['khushi.o_o','khushi.0_0','khusi.0_0'].includes((r.author||'').trim().replace(/^@/,'').toLowerCase());return !owner(c)&&c.conversation.every(r=>!owner(r))})''')
        snap=page.evaluate('__sky.snapshot()');assert snap['count']==346 and not snap['sample']
        page.locator('#enter-silent').click();page.wait_for_timeout(900)
        # Use an actual non-overlapped hit target in the existing constellation.
        target=page.evaluate('''()=>__sky.snapshot().nodes.filter(n=>n.point&&n.point.x>80&&n.point.x<innerWidth-80&&n.point.y>110&&n.point.y<innerHeight-120).sort((a,b)=>Math.abs(a.point.x-innerWidth/2)-Math.abs(b.point.x-innerWidth/2))[0]''')
        origin=page.evaluate('__sky.snapshot().camera')
        def tap(x,y):
            if touch:page.touchscreen.tap(x,y)
            else:page.mouse.click(x,y)
        tap(target['point']['x'],target['point']['y'])
        page.wait_for_function('__sky.snapshot().phase==="focused"')
        assert not page.locator('#reader').evaluate('(e)=>e.open')
        selected=page.evaluate('__sky.snapshot().selected')
        point=page.evaluate('__sky.snapshot().nodes.find(n=>n.id===__sky.snapshot().selected).point')
        tap(point['x'],point['y'])
        page.wait_for_function('__sky.snapshot().phase==="reading"')
        assert page.evaluate('__sky.snapshot().selected')==selected
        assert page.locator('#reader-quote').text_content()==page.evaluate('__sky.original(__sky.snapshot().selected).text')
        assert page.locator('#nearby-comments').is_visible()
        assert page.locator('#nearby-list button').count()>0
        page.screenshot(path=str(out/f'reader-{width}.png'))
        if touch:
            page.locator('#nearby-comments').scroll_into_view_if_needed()
            page.screenshot(path=str(out/'context-mobile.png'))
        first=page.locator('#nearby-list button').first;related=first.get_attribute('data-comment-id');first.click()
        page.wait_for_function('(id)=>__sky.snapshot().phase==="reading"&&__sky.snapshot().selected===id',arg=related)
        page.locator('#reader-close').click();page.wait_for_function('__sky.snapshot().phase==="sky"')
        assert page.evaluate('__sky.snapshot().camera')==origin
        # Zoom invalidates selection, so a later tap cannot accidentally read.
        page.evaluate('(id)=>__sky.select(id)',selected);page.wait_for_function('__sky.snapshot().phase==="focused"')
        page.locator('#universe').focus();page.keyboard.press('+');assert page.evaluate('__sky.snapshot().selected') is None
        assert not errors,errors
        results.append({'viewport':[width,height],'touch':touch,'comments':snap['count'],'two_step':True,'context_navigation':True,'exact_return':True,'errors':errors})
        context.close()
    # WebGL shader/rendering smoke with a small explicit sample, independent of software raster speed.
    context=browser.new_context(viewport={'width':1000,'height':700},reduced_motion='reduce')
    page=context.new_page();page.goto('http://127.0.0.1:4317/?debug');page.wait_for_function('window.__sky?.snapshot().ready')
    page.locator('#enter-silent').click();page.wait_for_timeout(1000)
    s=page.evaluate('__sky.snapshot()');results.append({'graphics':s['renderer'],'gl_error':s['error'],'fallback':s['graphicsFallbackReason']})
    assert s['renderer']=='webgl2' and s['error']==0
    page.screenshot(path=str(out/'webgl-sky.png'));browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
