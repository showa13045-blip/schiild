import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createAtelierService} from '../server/atelier-service.mjs';
import {memoryStore} from '../server/memory-store.mjs';
const first='a'.repeat(64),second='b'.repeat(64),outside='c'.repeat(64);
async function photo(color){return `data:image/jpeg;base64,${(await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg().toBuffer()).toString('base64')}`;}
const red=await photo('#c39582'),blue=await photo('#87a6b0');
function setup(){const store=memoryStore();let clock=Date.parse('2026-10-08T03:00:00Z');const execute=createAtelierService(store,{now:()=>clock});return {store,execute,nextDay:()=>clock+=86400000};}

test('temporary drafts are available to participants, write nothing and preserve posting and formal generation',async()=>{
 const {store,execute}=setup(),room=await execute({action:'create',name:'仮の窓',capacity:2},first),code=room.code,day=room.day;
 await execute({action:'join',code},second);await execute({action:'post',code,day,photo:red},first);
 const records=await store.listJSON(''),initialState=await execute({action:'state',code},second);
 const draft=await execute({action:'draft',code,day},second);assert.equal(draft.provisional,true);assert.equal(draft.count,1);assert.equal(draft.custody,undefined);assert.equal(draft.index,undefined);
 assert.deepEqual(await store.listJSON(''),records);assert.deepEqual(await execute({action:'state',code},second),initialState);
 assert.equal((await sharp(Buffer.from(draft.image.split(',')[1],'base64')).metadata()).width,128);
 assert.equal((await execute({action:'draft',code,day},first)).image,draft.image);
 await execute({action:'post',code,day,photo:blue},second);
 const next=await execute({action:'draft',code,day},first);assert.equal(next.count,2);assert.notEqual(next.image,draft.image);
 assert.equal((await execute({action:'state',code},first)).status,'open');assert.equal((await execute({action:'state',code},first)).works.length,0);
 await execute({action:'generate',code,day},first);const final=await execute({action:'work',code,day},second);assert.equal(final.image,next.image);assert.equal(final.count,2);assert.equal(final.index,1);
 await assert.rejects(execute({action:'draft',code,day},first),error=>error.code==='window_closed');
});

test('draft validation rejects empty, non-member, stale and unauthorized requests without changing records',async()=>{
 const {store,execute,nextDay}=setup(),room=await execute({action:'create',name:'空の窓',capacity:2},first),code=room.code,day=room.day;
 const before=await store.listJSON('');
 await assert.rejects(execute({action:'draft',code,day},first),error=>error.code==='no_photos');
 await assert.rejects(execute({action:'draft',code,day},outside),error=>error.code==='forbidden');
 await assert.rejects(execute({action:'draft',code,day},null),error=>error.code==='unauthorized');
 assert.deepEqual(await store.listJSON(''),before);
 await execute({action:'post',code,day,photo:red},first);const posted=await store.listJSON('');nextDay();
 await assert.rejects(execute({action:'draft',code,day},first),error=>error.code==='window_closed');assert.deepEqual(await store.listJSON(''),posted);
});

test('failed drafts cannot create artifacts, close the day, erase photos or substitute fake art',async()=>{
 const {store,execute}=setup(),room=await execute({action:'create',name:'記録が残る窓',capacity:2},first),code=room.code,day=room.day;
 await execute({action:'post',code,day,photo:red},first);const records=await store.listJSON(''),get=store.get.bind(store);
 store.get=async(key,options)=>key.startsWith('photos/')?null:get(key,options);
 await assert.rejects(execute({action:'draft',code,day},first),error=>error.code==='generation_failed');assert.deepEqual(await store.listJSON(''),records);
 store.get=get;assert.equal((await execute({action:'state',code},first)).status,'open');assert.equal((await execute({action:'draft',code,day},first)).count,1);
});
