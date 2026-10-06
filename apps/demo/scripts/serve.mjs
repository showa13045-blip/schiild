import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ApiError,createAtelierService} from '../server/atelier-service.mjs';
import {memoryStore} from '../server/memory-store.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url))),types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
const service=createAtelierService(memoryStore());
// All local servers below share the same test store. Production uses Netlify.
function createServer(port){http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://localhost:${port}`);
  if(url.pathname==='/.netlify/functions/atelier'){
   if(req.method!=='POST'){res.writeHead(405);res.end();return;}
   let text='';for await(const chunk of req){text+=chunk;if(text.length>4100000)throw new ApiError(413,'image_invalid');}
   const credential=req.headers.authorization?.replace(/^Bearer /,'');
   const result=await service(JSON.parse(text),credential);
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const target=url.pathname==='/'?path.join(root,'index.html'):file;
  const body=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream'});res.end(body);
 }catch(error){res.writeHead(error instanceof ApiError?error.status:404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof ApiError?error.code:'not_found'}));}
}).listen(port,'127.0.0.1',()=>console.log(`Demo: http://localhost:${port}`));}
createServer(8085);
if(process.env.DEMO_SECOND_ORIGIN==='1')createServer(8086);
if(process.env.DEMO_FIXTURE==='1'){
 const sharp=(await import('sharp')).default;
 const first='d'.repeat(64),second='e'.repeat(64),room=await service({action:'create',name:'ふたりの体験',capacity:5},first);
 await service({action:'join',code:room.code},second);
 for(const [credential,color] of [[first,'#c39582'],[second,'#87a6b0']]){
  const bytes=await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg({quality:85}).toBuffer();
  await service({action:'post',code:room.code,day:room.day,photo:`data:image/jpeg;base64,${bytes.toString('base64')}`},credential);
 }
 await service({action:'generate',code:room.code,day:room.day},first);
 console.log(`Fixture: http://localhost:8085/#atelier=${room.code}`);
}
