import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {xserverImages} from '../cloudflare/xserver-store.mjs';
const php=process.env.DEMO_PHP;
test('PHP storage rejects unsigned/expired/path requests and atomically keeps first image',{skip:!php},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'schiild-storage-')),site=path.join(root,'site'),images=path.join(root,'images'),secret='f'.repeat(64);
 await mkdir(site);await mkdir(images);
 await cp(new URL('../xserver/storage.php',import.meta.url),path.join(site,'storage.php'));
 await writeFile(path.join(site,'.storage-config.php'),`<?php return ['secret'=>'${secret}','directory'=>'${images.replaceAll('\\','/')}'];`);
 const child=spawn(php,['-S','127.0.0.1:8792','-t',site],{windowsHide:true,stdio:'ignore'});
 try{
  const url='http://127.0.0.1:8792/storage.php';let ready=false;for(let n=0;n<50;n++){try{await fetch(url);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert(ready);
  const key=`photos/${'e'.repeat(64)}/2026-10-08`,store=xserverImages({url,secret,allowLocal:true});
  assert.equal((await fetch(url+'?key='+key)).status,403);
  assert.equal((await fetch(url+'?key=../private')).status,400);
  const old=xserverImages({url,secret,allowLocal:true,now:()=>Date.now()-120000});await assert.rejects(old.get(key));
  assert.equal(await store.get(key),null);
  const red=await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer();
  const blue=await sharp({create:{width:1080,height:1080,channels:3,background:'#87a6b0'}}).jpeg().toBuffer();
  assert.deepEqual(await store.set(key,red),{modified:true});
  const attempts=await Promise.all(Array.from({length:8},()=>store.set(key,blue)));assert(attempts.every(x=>!x.modified));
  assert(Buffer.from(await store.get(key)).equals(red));
  await assert.rejects(store.set(`works/ABCDEFGH/2026-10-08`,red));
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(root,{recursive:true,force:true});}
});
