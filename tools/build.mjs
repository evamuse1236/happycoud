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
// Offline single file. Local real data is included only in this ignored build output.
const names=(await fs.readdir(path.join(root,'src'))).filter(n=>n.endsWith('.js')).map(n=>n.slice(0,-3));
const imports={};
for(const name of names){
  let code=await fs.readFile(path.join(root,'src',name+'.js'),'utf8');
  code=code.replace(/from\s+(['"])\.\/([^'"]+)\1/g,(_all,_q,file)=>`from 'hc:${file.replace(/\.js$/,'')}'`);
  imports['hc:'+name]='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
for (const name of ['style','reader']) {
  const css=await fs.readFile(path.join(root,'src',name+'.css'),'utf8');
  html=html.replace(`<link rel="stylesheet" href="./src/${name}.css">`,`<style>\n${css}\n</style>`);
}
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script type="importmap">${JSON.stringify({imports}).replace(/</g,'\\u003c')}</script>\n<script type="module">import 'hc:main';</script>`);
try {
  const data=JSON.parse(await fs.readFile(path.join(root,'public/data/comments.json'),'utf8'));
  html=html.replace('</body>',`<script>globalThis.HAPPYCOUD_EMBEDDED=${JSON.stringify(data).replace(/</g,'\\u003c')};</script>\n</body>`);
} catch(error) { if(error.code!=='ENOENT')throw error; }
await fs.writeFile(path.join(dist,'Khushi-Observatory.html'),html);
console.log('Built dist-standalone/ including Khushi-Observatory.html. Both use exactly the same source modules.');
