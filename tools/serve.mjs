import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(project,process.argv[2]||'.');
const port=Number(process.env.PORT||4317);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const empty={comments:[],version:'empty',notes:'No local collection loaded.'};
let collect=null;
try{const file=path.join(project,'scripts/comments.mjs');await fs.access(file);collect=(await import(pathToFileURL(file).href)).collectComments;}catch{/* An overlay into the original repo can reuse its existing collector. */}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('Read-only server');return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/comments'){
      let data=empty;
      if(collect)data=await collect();
      if(!data.comments?.length){try{data=JSON.parse(await fs.readFile(path.join(root,'public/data/comments.json'),'utf8'));}catch{try{data=JSON.parse(await fs.readFile(path.join(root,'data/comments.json'),'utf8'));}catch{}}}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    let relative=decodeURIComponent(url.pathname);if(relative==='/')relative='/index.html';
    const base=relative.startsWith('/data/')&&root===project?path.join(root,'public'):root;
    const file=path.resolve(base,'.'+relative);
    if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const contents=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:contents);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Constellation: http://127.0.0.1:${port} (local-only, read-only)`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
