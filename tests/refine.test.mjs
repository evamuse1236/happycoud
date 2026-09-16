import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOptions,checkPlan,watchedSource} from '../tools/refine.mjs';
test('local review defaults to one bounded pass, not a background agent',()=>assert.deepEqual(parseOptions([]),{watch:false,cycles:1,browser:false,shaders:false,help:false}));
test('review cycles can be explicitly repeated',()=>assert.equal(parseOptions(['--cycles=2']).cycles,2));
test('watch mode is explicit',()=>assert.equal(parseOptions(['--watch']).watch,true));
test('unknown review flags fail instead of silently skipping checks',()=>assert.throws(()=>parseOptions(['--browesr']),/Unknown/));
test('negative and unlimited counts are refused',()=>{assert.throws(()=>parseOptions(['--cycles=-1']));assert.throws(()=>parseOptions(['--cycles=21']));});
test('watch and repeat count cannot conflict',()=>assert.throws(()=>parseOptions(['--watch','--cycles=2']),/either/));
test('minimal review runs real tests before building',()=>{const p=checkPlan(parseOptions([]),['tests/core.test.mjs'],'node','python');assert.deepEqual(p.map(x=>x.name),['unit-and-installer','build']);assert.deepEqual(p[0].args,['--test','tests/core.test.mjs']);});
test('full review includes all three distinct browser suites and native shader checks',()=>assert.deepEqual(checkPlan(parseOptions(['--browser','--shaders']),[]).map(x=>x.name),['unit-and-installer','build','browser_checks','experience_browser','care_browser','native-shaders']));
test('custom executable paths are passed as arguments without a shell',()=>assert.equal(checkPlan(parseOptions(['--browser']),[],'my node','my python')[2].command,'my python'));
test('generated outputs do not retrigger the watcher',()=>{for(const n of ['Khushi-Observatory.html','refinement-report.json','README.md','dist'])assert.equal(watchedSource('.',n),false);});
test('only relevant root entrypoints are watched',()=>{assert.ok(watchedSource('.','index.html'));assert.ok(watchedSource('.','package.json'));assert.equal(watchedSource('.',null),false);});
test('source and regression edits can retrigger review, temporary files cannot',()=>{assert.ok(watchedSource('src','main.js'));assert.ok(watchedSource('tests','care_browser.py'));assert.ok(watchedSource('tools','refine.mjs'));assert.equal(watchedSource('src','.main.js'),false);assert.equal(watchedSource('src','main.js~'),false);});

test('watcher runs an initial pass, reruns one edit, and stops cleanly',{timeout:15000},async()=>{
  const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
  const {spawn}=await import('node:child_process'),{once}=await import('node:events');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sky-watch-'));
  let child,log='';
  async function readReport(){try{return JSON.parse(await fs.readFile(path.join(dir,'test-results/refinement-report.json'),'utf8'));}catch{return null;}}
  async function until(predicate){const start=Date.now();while(Date.now()-start<6500){const r=await readReport();if(predicate(r))return r;await new Promise(resolve=>setTimeout(resolve,60));}throw new Error('Watcher timed out: '+log);}
  try{
    for(const sub of ['tools','src','tests'])await fs.mkdir(path.join(dir,sub));
    await fs.copyFile(new URL('../tools/refine.mjs',import.meta.url),path.join(dir,'tools/refine.mjs'));
    await fs.writeFile(path.join(dir,'package.json'),'{}');await fs.writeFile(path.join(dir,'index.html'),'<h1>Watcher fixture</h1>');
    await fs.writeFile(path.join(dir,'src/reading.js'),'export const size=1;');
    await fs.writeFile(path.join(dir,'tests/small.test.mjs'),"import test from 'node:test';test('fixture gate',()=>{});");
    await fs.writeFile(path.join(dir,'tools/build.mjs'),"import fs from 'node:fs/promises';await fs.writeFile('bundle.html','fixture');");
    child=spawn(process.execPath,['tools/refine.mjs','--watch'],{cwd:dir,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);
    const first=await until(r=>r?.cycles.length===1);assert.equal(first.cycles[0].passed,true);
    await fs.appendFile(path.join(dir,'src/reading.js'),'\n// deliberate edit\n');
    const next=await until(r=>r?.cycles.length===2);assert.equal(next.cycles[1].passed,true);
    assert.notEqual(next.cycles[0].sourceHashAfter,next.cycles[1].sourceHashAfter);
    await new Promise(resolve=>setTimeout(resolve,750));assert.equal((await readReport()).cycles.length,2,'generated reports must not cause a loop');
    const stopped=once(child,'exit');child.kill('SIGTERM');const [code]=await stopped;assert.equal(code,0);child=null;
  }finally{if(child){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await fs.rm(dir,{recursive:true,force:true});}
});
