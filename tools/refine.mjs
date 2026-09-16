/** Repeatable local quality gate. It runs checks; it does not write or redesign source.
 * --watch serializes changed-source passes until Ctrl+C. Optional browser tests
 * need Python/Playwright/Chromium; shader checks need Linux EGL. No dependencies.
 */
import fs from 'node:fs/promises';
import {watch} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
export function parseOptions(args=[]){
  const options={watch:false,cycles:1,browser:false,shaders:false,help:false};
  for(const arg of args){
    if(arg==='--watch')options.watch=true;
    else if(arg==='--browser')options.browser=true;
    else if(arg==='--shaders')options.shaders=true;
    else if(arg==='--help'||arg==='-h')options.help=true;
    else if(/^--cycles=[1-9]\d*$/.test(arg))options.cycles=Number(arg.split('=')[1]);
    else throw new Error(`Unknown option: ${arg}. Use --help.`);
  }
  if(options.cycles>20)throw new Error('Choose 1–20 cycles; use --watch to check edits over time.');
  if(options.watch&&options.cycles!==1)throw new Error('Use either --watch or --cycles, not both.');
  return options;
}
export function checkPlan(options,testFiles,node=process.execPath,python=process.env.PYTHON||'python3'){
  const plan=[{name:'unit-and-installer',command:node,args:['--test',...testFiles]},{name:'build',command:node,args:['tools/build.mjs']}];
  if(options.browser)for(const name of ['browser_checks','experience_browser','care_browser'])plan.push({name,command:python,args:[`tests/${name}.py`]});
  if(options.shaders)plan.push({name:'native-shaders',command:python,args:['tests/shader_checks.py']});
  return plan;
}
export function watchedSource(directory,filename){
  if(!filename)return false;
  const name=String(filename);
  if(directory==='.')return name==='index.html'||name==='package.json';
  return /\.(?:js|mjs|css|py)$/.test(name)&&!name.startsWith('.');
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'test-results');
async function fingerprint(){
  const names=['index.html','package.json'];
  for(const dir of ['src','tools','tests'])for(const name of await fs.readdir(path.join(root,dir)))if(watchedSource(dir,name))names.push(`${dir}/${name}`);
  const hash=createHash('sha256');
  for(const name of names.sort()){hash.update(name+'\0');hash.update(await fs.readFile(path.join(root,name)));}
  return hash.digest('hex');
}
export async function main(args=process.argv.slice(2)){
  const options=parseOptions(args);
  if(options.help){
    console.log(`Living Sky local review gate

node tools/refine.mjs                     Test + rebuild once
node tools/refine.mjs --cycles=2          Repeat twice, stop on failure
node tools/refine.mjs --browser --shaders  Include integration and native shader checks
node tools/refine.mjs --watch             Recheck source edits until Ctrl+C

Optional: CHROMIUM=/path/to/chromium and PYTHON=/path/to/python.
Reports and command logs: test-results/refinement-*. No cloud calls or source edits.
A passing report does not replace visual review, device testing, or listening.`);
    return;
  }
  await fs.mkdir(out,{recursive:true});
  const files=(await fs.readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n);
  const plan=checkPlan(options,files);
  const report={version:4,started:new Date().toISOString(),mode:options.watch?'watch':'bounded',options,scope:'Checks and builds only. No automatic source editing, AI agent, deployment, or continuous background service.',cycles:[]};
  let child=null,stopping=false,running=false,queued=false,timer=null,failed=false;
  const watchers=[];
  const save=async()=>{await fs.writeFile(path.join(out,'refinement-report.json.tmp'),JSON.stringify(report,null,2)+'\n');await fs.rename(path.join(out,'refinement-report.json.tmp'),path.join(out,'refinement-report.json'));};
  async function runCommand(step,sequence){
    const name=`refinement-${sequence}-${step.name}.log`;
    const handle=await fs.open(path.join(out,name),'w');
    const started=Date.now();
    console.log(`  ${step.name}…`);
    return new Promise(resolve=>{
      let error=null,done=false;
      child=spawn(step.command,step.args,{cwd:root,env:process.env,stdio:['ignore',handle.fd,handle.fd],shell:false});
      child.on('error',e=>{error=e.message;});
      child.on('close',async(code,signal)=>{
        if(done)return;done=true;child=null;await handle.close();
        const result={name:step.name,code,signal,error,passed:code===0&&!error,durationMs:Date.now()-started,log:name};
        console.log(`  ${result.passed?'PASS':'FAIL'} ${step.name} · ${(result.durationMs/1000).toFixed(1)}s`);
        resolve(result);
      });
    });
  }
  async function cycle(){
    if(stopping)return;
    const sequence=report.cycles.length+1;
    const cycle={sequence,started:new Date().toISOString(),sourceHashBefore:await fingerprint(),checks:[]};
    console.log(`\nReview pass ${sequence}`);
    for(const step of plan){
      if(stopping)break;
      const check=await runCommand(step,sequence);cycle.checks.push(check);
      if(!check.passed)break;
    }
    cycle.sourceHashAfter=await fingerprint();cycle.sourceChanged=cycle.sourceHashBefore!==cycle.sourceHashAfter;
    cycle.finished=new Date().toISOString();cycle.passed=!stopping&&!cycle.sourceChanged&&cycle.checks.length===plan.length&&cycle.checks.every(c=>c.passed);
    failed=!cycle.passed;report.cycles.push(cycle);await save();
    if(cycle.sourceChanged)console.log('  Source changed during the checks; this pass is not a clean certification.');
    console.log(cycle.passed?'Pass complete. Inspect the experience as well as the report.':'Pass needs attention. Open the command log; no source was changed by the gate.');
  }
  function stop(){
    stopping=true;clearTimeout(timer);for(const watcher of watchers)watcher.close();
    if(child)child.kill('SIGTERM');
    console.log('\nReview watcher stopped.');
  }
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    if(!options.watch){
      for(let i=0;i<options.cycles&&!stopping;i++){await cycle();if(failed)break;}
      if(failed)process.exitCode=1;
      return;
    }
    async function drain(){
      if(running||stopping||!queued)return;clearTimeout(timer);running=true;
      try{do{queued=false;await cycle();}while(queued&&!stopping);}
      catch(e){console.error(e);process.exitCode=1;stop();}
      finally{running=false;}
    }
    for(const dir of ['.','src','tests','tools'])watchers.push(watch(path.join(root,dir),(_event,file)=>{
      if(!watchedSource(dir,file)||stopping)return;
      queued=true;clearTimeout(timer);timer=setTimeout(()=>void drain(),500);
    }));
    queued=true;await drain();
    if(!stopping)console.log('\nWatching index.html, package.json, src/, tests/, tools/. Ctrl+C stops the watcher.');
  }finally{
    if(!options.watch){process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
