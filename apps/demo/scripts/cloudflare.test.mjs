import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {workerImages} from '../cloudflare/images.mjs';
import {metadataStore} from '../cloudflare/metadata-store.mjs';
import {xserverImages} from '../cloudflare/xserver-store.mjs';
import {gateway} from '../cloudflare/gateway.mjs';
import {createAtelierService} from '../server/atelier-core.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);const rows=query.startsWith('SELECT')?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows};}},transactionSync(callback){db.exec('BEGIN');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 // Real SQLite CAS with isolated in-memory fake image host; no external API.
 const images=new Map();const binary={async get(key){return images.get(key)??null;},async set(key,value){if(images.has(key))return {modified:false};images.set(key,value);return {modified:true};}};
 return {store:metadataStore(storage,binary),db,images};
}
test('Cloudflare codec and SQLite metadata preserve concurrent membership, images and immutable day',async()=>{
 const {store,db,images}=fixture(),execute=createAtelierService(store,{images:workerImages});
 const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64),room=await execute({action:'create',name:'ふたりの窓',capacity:2},first);
 const joined=await Promise.allSettled([execute({action:'join',code:room.code},second),execute({action:'join',code:room.code},third)]);
 assert.equal(joined.filter(r=>r.status==='fulfilled').length,1);
 const guest=joined[0].status==='fulfilled'?second:third;
 const photo=await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer();
 await Promise.all([first,guest].map(credential=>execute({action:'post',code:room.code,day:room.day,photo:`data:image/jpeg;base64,${photo.toString('base64')}`},credential)));
 await assert.rejects(execute({action:'generate',code:room.code,day:room.day},guest),e=>e.status===403);
 await execute({action:'generate',code:room.code,day:room.day},first);
 const work=await execute({action:'work',code:room.code,day:room.day},first);
 assert.equal(work.image,(await execute({action:'work',code:room.code,day:room.day},guest)).image);
 const metadata=await sharp(Buffer.from(work.image.split(',')[1],'base64')).metadata();assert.equal(metadata.width,128);assert.equal(metadata.height,128);
 assert.equal(images.size,3);assert.equal(db.prepare('SELECT count(*) as n FROM rooms').get().n,1);
 const row=db.prepare('SELECT data FROM rooms').get().data;assert(!row.includes('base64'));assert(!row.includes(first));
 await assert.rejects(execute({action:'post',code:room.code,day:room.day,photo:'data:image/jpeg;base64,AAAA'},first),e=>e.code==='window_closed');
 await assert.rejects(workerImages.normalize(Buffer.from('broken')));
 await assert.rejects(workerImages.normalize(await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).jpeg().toBuffer()));
 db.close();
});
test('image host requests authenticate method, key, timestamp and body; redirects are refused',async()=>{
 const secret='d'.repeat(64),key=`photos/${'e'.repeat(64)}/2026-10-08`,now=()=>Date.parse('2026-10-08T00:00:00Z');
 const store=xserverImages({url:'https://schiild.pickleballnavi.jp/storage.php',secret,now,fetcher:async(url,init)=>{
  assert.equal(new URL(url).searchParams.get('key'),key);assert.equal(init.redirect,'manual');
  const expected=createHmac('sha256',secret).update(`PUT\n${key}\n${Math.floor(now()/1000)}\n${createHash('sha256').update(init.body).digest('hex')}`).digest('hex');
  assert.equal(init.headers['X-Schiild-Signature'],expected);return new Response(null,{status:201});
 }});
 assert.deepEqual(await store.set(key,Buffer.from('image')),{modified:true});
 await assert.rejects(store.get('../private'));
 assert.throws(()=>xserverImages({url:'http://example.com',secret}));
});
test('gateway isolates origins, preflight, rate limits and bearer credentials',async()=>{
 const env={ALLOWED_ORIGINS:'https://schiild.pickleballnavi.jp',ATELIERS:{idFromName:n=>n,get:()=>({fetch:async(request)=>{let body;try{body=await request.json();}catch{return Response.json({error:'invalid'},{status:400});}return Array.isArray(body)?Response.json({error:'invalid'},{status:400}):Response.json({members:1});}})}};
 const call=(origin,method='POST',body='{}',credential='a'.repeat(64))=>gateway(new Request('https://api.example/api/atelier',{method,headers:{Origin:origin,Authorization:`Bearer ${credential}`},...(method==='POST'?{body}:{})}),env);
 assert.equal((await call('https://evil.example')).status,403);
 const preflight=await call(env.ALLOWED_ORIGINS,'OPTIONS');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),env.ALLOWED_ORIGINS);
 assert.equal((await call(env.ALLOWED_ORIGINS,'POST','{}','invalid')).status,401);
 assert.equal((await call(env.ALLOWED_ORIGINS,'POST','[')).status,400);
 assert.equal((await call(env.ALLOWED_ORIGINS,'POST','[]')).status,400);
 const valid=await call(env.ALLOWED_ORIGINS);assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{members:1});
 env.RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await call(env.ALLOWED_ORIGINS)).status,429);
});
