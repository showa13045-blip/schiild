import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url))),types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)){res.writeHead(403);res.end();return;}const target=url.pathname==='/'?path.join(root,'index.html'):file;const body=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}}).listen(8085,'127.0.0.1',()=>console.log('Demo: http://localhost:8085'));
