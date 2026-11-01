import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {partition,random,render,synthetic} from '../src/engine.ts';
import {memoryStore} from '../server/memory-store.mjs';
import {createAtelierService} from '../server/atelier-service.mjs';
import {workerImages} from '../cloudflare/images.mjs';
test('legacy completed artifacts keep their original 128px bytes and area, while new days use 256px',async()=>{
 const store=memoryStore(),credential='a'.repeat(64),member=createHash('sha256').update(credential).digest('hex'),clock=Date.parse('2026-10-15T03:00:00Z'),execute=createAtelierService(store,{now:()=>clock}),room=await execute({action:'create',name:'解像度の窓',capacity:2},credential),oldDay='2026-10-14',rects=partition(2,random(99)),pixels=render(rects,[synthetic(50)],99),png=await sharp(Buffer.from(pixels.data),{raw:{width:128,height:128,channels:4}}).png().toBuffer();
 const row=(await store.getWithMetadata('rooms/'+room.code)).data;row.days[oldDay]={day:oldDay,seed:99,members:[member],posts:{0:'legacy-photo'},status:'ready',index:1,custodian:member};await store.setJSON('rooms/'+room.code,row);await store.set(`works/${room.code}/${oldDay}`,png);
 const old=await execute({action:'work',code:room.code,day:oldDay},credential);assert.equal(old.outputSize,128);assert.equal(old.area.total,16384);assert.equal(old.area.pixels,rects[0].w*rects[0].h);assert(Buffer.from(old.image.split(',')[1],'base64').equals(png));
 const photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer()).toString('base64');await execute({action:'post',code:room.code,day:room.day,photo},credential);const draft=await execute({action:'draft',code:room.code,day:room.day},credential);assert.equal((await sharp(Buffer.from(draft.image.split(',')[1],'base64')).metadata()).width,256);await execute({action:'generate',code:room.code,day:room.day},credential);const made=await execute({action:'work',code:room.code,day:room.day},credential);assert.equal(made.outputSize,256);assert.equal(made.area.total,65536);assert.equal(made.area.pixels,65536);assert.equal(made.image,draft.image);assert.equal((await execute({action:'work',code:room.code,day:oldDay},credential)).image,old.image);
});
test('portable Cloudflare codec writes genuine 256px PNGs without changing logical regions',async()=>{
 const photo=await sharp({create:{width:1080,height:1080,channels:3,background:'#87a6b0'}}).jpeg().toBuffer(),rects=partition(5,random(12)),before=structuredClone(rects),png=await workerImages.compose(rects,async()=>photo,12,256),metadata=await sharp(png).metadata();assert.equal(metadata.width,256);assert.equal(metadata.height,256);assert.deepEqual(rects,before);
});
