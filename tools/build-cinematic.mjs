import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const imports={};
for(const file of (await readdir(path.join(root,'src'))).filter(n=>n.endsWith('.js'))){
  let text=await readFile(path.join(root,'src',file),'utf8');
  text=text.replace(/(['"])\.\/([\w-]+)\.js\1/g,(_,q,name)=>`${q}hc:${name}${q}`);
  imports['hc:'+file.slice(0,-3)]='data:text/javascript;base64,'+Buffer.from(text).toString('base64');
}
let html=await readFile(path.join(root,'index.html'),'utf8');
for(const name of ['style','song']){
  const css=await readFile(path.join(root,`src/${name}.css`),'utf8');
  html=html.replace(`<link rel="stylesheet" href="./src/${name}.css">`,`<style>\n${css}\n</style>`);
}
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script type="importmap">${JSON.stringify({imports})}</script>\n<script type="module">import 'hc:main';</script>`);
const output=path.join(root,'dist-cinematic');await mkdir(output,{recursive:true});
await writeFile(path.join(output,'Khushi-Cinematic-Sky.html'),html);
console.log('Built dist-cinematic/Khushi-Cinematic-Sky.html');
