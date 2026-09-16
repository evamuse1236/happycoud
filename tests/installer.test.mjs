import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const installer=path.join(project,'tools/apply-to-repo.mjs');
async function fixture(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'hc-overlay-'));
  const repo=path.join(base,'happycoud');
  for(const dir of ['src','scripts','public/data'])await fs.mkdir(path.join(repo,dir),{recursive:true});
  const protectedFiles={'package.json':'{"name":"fixture"}','vite.config.js':'// keep config',
    'scripts/comments.mjs':'// keep collector','public/data/comments.json':'{"private":"keep me"}'};
  for(const [name,text] of Object.entries(protectedFiles))await fs.writeFile(path.join(repo,name),text);
  await fs.writeFile(path.join(repo,'index.html'),'<p>Old page</p>');
  await fs.writeFile(path.join(repo,'src/main.js'),'// old main');
  return {base,repo,protectedFiles};
}
function run(args){return spawnSync(process.execPath,[installer,...args],{encoding:'utf8'});}
test('installer dry run is read-only',async()=>{
  const f=await fixture();try{
    const r=run([f.repo,'--dry-run']);assert.equal(r.status,0,r.stderr);
    assert.equal(await fs.readFile(path.join(f.repo,'src/main.js'),'utf8'),'// old main');
    assert.deepEqual(await fs.readdir(f.base),['happycoud']);
  }finally{await fs.rm(f.base,{recursive:true,force:true});}
});
test('installer backs up, preserves data/config, applies, and restores',async()=>{
  const f=await fixture();try{
    const r=run([f.repo]);assert.equal(r.status,0,r.stderr);
    assert.equal(await fs.readFile(path.join(f.repo,'src/main.js'),'utf8'),await fs.readFile(path.join(project,'src/main.js'),'utf8'));
    for(const [name,text] of Object.entries(f.protectedFiles))assert.equal(await fs.readFile(path.join(f.repo,name),'utf8'),text);
    const backup=(await fs.readdir(f.base)).find(x=>x.startsWith('happycoud-constellation-backup-'));
    assert.ok(backup);
    const restore=spawnSync(process.execPath,[path.join(f.base,backup,'restore.mjs'),'--restore'],{encoding:'utf8'});
    assert.equal(restore.status,0,restore.stderr);
    assert.equal(await fs.readFile(path.join(f.repo,'src/main.js'),'utf8'),'// old main');
    assert.equal(await fs.readFile(path.join(f.repo,'index.html'),'utf8'),'<p>Old page</p>');
    assert.deepEqual(await fs.readdir(path.join(f.repo,'src')),['main.js']);
    for(const [name,text] of Object.entries(f.protectedFiles))assert.equal(await fs.readFile(path.join(f.repo,name),'utf8'),text);
  }finally{await fs.rm(f.base,{recursive:true,force:true});}
});
test('installer rejects a non-repository without changing it',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hc-reject-'));try{
    const r=run([dir]);assert.notEqual(r.status,0);
    assert.deepEqual(await fs.readdir(dir),[]);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
