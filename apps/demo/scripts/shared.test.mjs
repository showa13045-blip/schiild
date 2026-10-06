import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createAtelierService} from '../server/atelier-service.mjs';
import {memoryStore} from '../server/memory-store.mjs';
const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64);
async function photo(color){const bytes=await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg({quality:85}).toBuffer();return `data:image/jpeg;base64,${bytes.toString('base64')}`;}
const red=await photo('#c39582'),blue=await photo('#87a6b0');
function setup(capacity=2){const store=memoryStore();let clock=Date.parse('2026-10-06T03:00:00Z');const execute=createAtelierService(store,{now:()=>clock});return {store,execute,nextDay:()=>{clock+=86400000;},create:()=>execute({action:'create',name:'ふたりの窓',capacity},first)};}

test('two independent members post, generate and receive the same persisted image',async()=>{
 const {execute,create,nextDay}=setup(),room=await create(),code=room.code,day=room.day;
 assert.equal(room.members,1);assert.equal(room.postedSlots.length,0);
 await execute({action:'join',code},second);
 await assert.rejects(execute({action:'join',code},third),error=>error.code==='full');
 await assert.rejects(execute({action:'state',code},third),error=>error.status===403);
 const preview=await execute({action:'preview',code},third);assert.equal(preview.members,2);assert.equal(preview.photos,undefined);assert.equal(preview.creator,undefined);
 await Promise.all([execute({action:'post',code,day,photo:red},first),execute({action:'post',code,day,photo:blue},second)]);
 const current=await execute({action:'state',code},first);assert.deepEqual(current.postedSlots.sort(),[0,1]);assert.equal(current.hasPhoto,true);
 await assert.rejects(execute({action:'generate',code,day},second),error=>error.status===403);
 await execute({action:'generate',code,day},first);
 const made=await execute({action:'work',code,day},first),guest=await execute({action:'work',code,day},second);
 assert.equal(made.image,guest.image);assert.equal(made.count,2);assert.equal(made.custody===guest.custody,false);
 const bytes=Buffer.from(made.image.split(',')[1],'base64');const metadata=await sharp(bytes).metadata();assert.equal(metadata.width,128);assert.equal(metadata.height,128);
 const {data}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});const colors=new Set();for(let n=0;n<data.length;n+=4)colors.add(data.subarray(n,n+3).join(','));assert(colors.has('195,149,130'));assert(colors.has('135,166,176'));
 await execute({action:'generate',code,day},first);assert.equal((await execute({action:'work',code,day},first)).image,made.image);
 await assert.rejects(execute({action:'post',code,day,photo:blue},first),error=>error.code==='window_closed');
 nextDay();assert.equal((await execute({action:'state',code},first)).hasPhoto,false);
 await assert.rejects(execute({action:'post',code,day,photo:blue},first),error=>error.code==='window_closed');
 assert.equal((await execute({action:'work',code,day},second)).image,made.image);
});

test('same UTC day image cannot be replaced, including across ateliers',async()=>{
 const {execute,create}=setup(),room=await create(),day=room.day;
 await execute({action:'post',code:room.code,day,photo:red},first);
 await execute({action:'post',code:room.code,day,photo:blue},first);
 const other=await execute({action:'create',name:'もうひとつ',capacity:2},first);
 await execute({action:'post',code:other.code,day,photo:blue},first);
 await execute({action:'generate',code:room.code,day},first);await execute({action:'generate',code:other.code,day},first);
 for(const code of [room.code,other.code]){
  const image=(await execute({action:'work',code,day},first)).image;
  const data=await sharp(Buffer.from(image.split(',')[1],'base64')).raw().toBuffer();
  let warm=0,cool=0;for(let n=0;n<data.length;n+=4){if(data[n]===195&&data[n+1]===149)warm++;if(data[n]===135&&data[n+1]===166)cool++;}assert(warm>0);assert.equal(cool,0);
 }
});

test('parallel joins preserve capacity and generation can retry after storage failure',async()=>{
 const {store,execute,create}=setup(),room=await create(),code=room.code,day=room.day;
 const joined=await Promise.allSettled([execute({action:'join',code},second),execute({action:'join',code},third)]);assert.equal(joined.filter(v=>v.status==='fulfilled').length,1);
 await assert.rejects(execute({action:'generate',code,day},first),error=>error.code==='no_photos');
 await assert.rejects(execute({action:'post',code,day,photo:'data:image/jpeg;base64,AAAA'},first),error=>error.code==='image_invalid');
 await execute({action:'post',code,day,photo:red},first);
 const original=store.set.bind(store);let failOnce=true;store.set=async(key,...rest)=>{if(key.startsWith('works/')&&failOnce){failOnce=false;throw Error('storage_unavailable');}return original(key,...rest);};
 await assert.rejects(execute({action:'generate',code,day},first));assert.equal((await execute({action:'state',code},first)).status,'generating');
 await execute({action:'generate',code,day},first);assert.equal((await execute({action:'state',code},first)).status,'ready');
 await assert.rejects(execute({action:'state',code},'invalid'),error=>error.status===401);
});
