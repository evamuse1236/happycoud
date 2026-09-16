import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-standalone');
// Generated directory only: remove stale private snapshots from earlier builds.
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
await fs.cp(path.join(root,'src'),path.join(dist,'src'),{recursive:true});
await fs.copyFile(path.join(root,'index.html'),path.join(dist,'index.html'));
try{await fs.cp(path.join(root,'public'),dist,{recursive:true});}catch{}
// A one-file build without a CDN, install step, font files, or network imports.
const names=['math','care','experience','sound','annotations','data','layout','atmosphere','renderer','canvas-renderer','controls','demo','journey','main'];
const imports={};
for(const name of names){
  let code=await fs.readFile(path.join(root,'src',name+'.js'),'utf8');
  code=code.replace(/from\s+(['"])\.\/([^'"]+)\1/g,(_all,_q,file)=>`from 'hc:${file.replace(/\.js$/,'')}'`);
  imports['hc:'+name]='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
const css=await fs.readFile(path.join(root,'src/style.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="./src/style.css">',`<style>\n${css}\n</style>`);
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script type="importmap">${JSON.stringify({imports}).replace(/</g,'\\u003c')}</script>\n<script type="module">import 'hc:main';</script>`);
await fs.writeFile(path.join(root,'Khushi-Observatory.html'),html);
console.log('Built dist-standalone/ and Khushi-Observatory.html. Both use exactly the same source modules.');
