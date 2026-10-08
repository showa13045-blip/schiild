import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
const bundle=process.env.DEMO_WORKER_BUNDLE,php=process.env.DEMO_PHP;
test('workerd and durable SQLite run complete shared generation against the actual PHP gateway',{skip:!bundle||!php},async()=>{
 const require=createRequire(import.meta.url),wranglerRequire=createRequire(realpathSync(require.resolve('wrangler/package.json')));
 const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(wranglerRequire.resolve('miniflare')).href);
 const root=await mkdtemp(path.join(os.tmpdir(),'schiild-runtime-')),site=path.join(root,'site'),directory=path.join(root,'images'),secret='f'.repeat(64);
 await mkdir(site);await mkdir(directory);await cp(new URL('../xserver/storage.php',import.meta.url),path.join(site,'storage.php'));
 await writeFile(path.join(site,'.storage-config.php'),`<?php return ['secret'=>'${secret}','directory'=>'${directory.replaceAll('\\','/')}'];`);
 const child=spawn(php,['-S','127.0.0.1:8793','-t',site],{windowsHide:true,stdio:'ignore'});let mf;
 try{
  for(let n=0;n<50;n++){try{await fetch('http://127.0.0.1:8793/storage.php');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  mf=new Miniflare(convertV4MiniflareOptions({name:'test',scriptPath:bundle,modules:true,compatibilityDate:'2026-10-08',compatibilityFlags:['nodejs_compat'],durableObjects:{ATELIERS:{className:'AtelierDirectory',useSQLite:true}},bindings:{ALLOWED_ORIGINS:'http://localhost:8085',XSERVER_STORAGE_URL:'https://schiild.pickleballnavi.jp/storage.php',XSERVER_STORAGE_SECRET:secret},outboundService:async request=>{
   const url=new URL(request.url);assert.equal(url.hostname,'schiild.pickleballnavi.jp');url.protocol='http:';url.hostname='127.0.0.1';url.port='8793';
   const response=await fetch(url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='PUT'?{body:await request.arrayBuffer()}:{})});
   return response;
  }}));
  const call=async(action,values={},credential='a'.repeat(64))=>{const response=await mf.dispatchFetch('https://api.example/api/atelier',{method:'POST',headers:{Origin:'http://localhost:8085',Authorization:`Bearer ${credential}`},body:JSON.stringify({action,...values})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
  const first='a'.repeat(64),second='b'.repeat(64),room=await call('create',{name:'ふたりの窓',capacity:2});await call('join',{code:room.code},second);
  const photo=await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer();
  await Promise.all([first,second].map(credential=>call('post',{code:room.code,day:room.day,photo:`data:image/jpeg;base64,${photo.toString('base64')}`},credential)));
  const state=await call('state',{code:room.code});assert.equal(state.postedSlots.length,2);
  await call('generate',{code:room.code,day:room.day});
  const made=await call('work',{code:room.code,day:room.day}),guest=await call('work',{code:room.code,day:room.day},second);
  assert.equal(made.image,guest.image);const meta=await sharp(Buffer.from(made.image.split(',')[1],'base64')).metadata();assert.equal(meta.width,128);
  const global=await call('global',{day:room.day}),globalGuest=await call('global',{day:room.day},second),globalOutside=await call('global',{day:room.day},'c'.repeat(64));
  assert.equal(global.image,globalGuest.image);assert.equal(global.image,globalOutside.image);assert.equal(global.count,2);assert.equal(globalOutside.x,undefined);
  assert.equal((await sharp(Buffer.from(global.image.split(',')[1],'base64')).metadata()).width,256);
  const account=await call('account.register',{username:'runtime_member',password:'runtime-password-29',name:'あさ'},first);
  assert.equal(account.account.ateliers[0].code,room.code);assert.equal(account.account.ateliers[0].canGenerate,true);
  const login=await call('account.login',{username:'runtime_member',password:'runtime-password-29'},'c'.repeat(64));
  assert.equal((await call('state',{code:room.code},login.token)).canGenerate,true);assert.equal((await call('global',{day:room.day},login.token)).x,global.x);
  await call('account.logout',{},login.token);
  const expired=await mf.dispatchFetch('https://api.example/api/atelier',{method:'POST',headers:{Authorization:`Bearer ${login.token}`},body:JSON.stringify({action:'account.me'})});assert.equal(expired.status,401);
  const invalid=await mf.dispatchFetch('https://api.example/api/atelier',{method:'POST',headers:{Authorization:`Bearer ${first}`},body:'[]'});assert.equal(invalid.status,400);
 }finally{if(mf)await mf.dispose();child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(root,{recursive:true,force:true});}
});
