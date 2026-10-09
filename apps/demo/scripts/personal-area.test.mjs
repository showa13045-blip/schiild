import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createAtelierService} from '../server/atelier-service.mjs';
import {createAtelierService as core} from '../server/atelier-core.mjs';
import {partition,random} from '../src/engine.ts';
import {memoryStore} from '../server/memory-store.mjs';
import {accounts} from '../server/accounts.mjs';
const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64);
const member=credential=>createHash('sha256').update(credential).digest('hex');
async function photo(color){return 'data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg().toBuffer()).toString('base64');}
const red=await photo('#c39582'),blue=await photo('#87a6b0');
function fixture(){const store=memoryStore();let clock=Date.parse('2026-10-08T03:00:00Z');const auth=accounts(store,{now:()=>clock});return {store,auth,nextDay:()=>clock+=86400000,async call(action,values={},credential=first){const actor=await auth.identity(credential);return createAtelierService(store,{now:()=>clock,memberForCredential:()=>actor.member})({action,...values},credential);}};}
const rectPixels=(room,slot=0)=>{const rect=partition(room.capacity,random(room.seed)).find(value=>value.slot===slot);return rect.w*rect.h;};

test('reuse selects only own current-day photos, returns partial results and keeps GLOBAL one pixel',async()=>{
 const {store,call,nextDay}=fixture();const create=name=>call('create',{name,capacity:2});
 const source=await create('写真の窓'),target=await create('追加の窓'),different=await create('別の写真'),sealed=await create('受付終了'),untouched=await create('選んでいない窓');
 const foreign=await call('create',{name:'他の人の窓',capacity:2},second),day=source.day;
 await call('post',{code:source.code,day,photo:red});await call('post',{code:different.code,day,photo:blue});
 await call('post',{code:sealed.code,day,photo:blue});await call('generate',{code:sealed.code,day});
 await call('post',{code:foreign.code,day,photo:blue},second);
 const listing=await call('posts');assert.equal(listing.sources.length,3);assert.equal(JSON.stringify(listing).includes('base64'),false);assert.equal(listing.sources.some(row=>row.code===foreign.code),false);
 const original=await call('post.photo',{sourceCode:source.code,day});assert.equal((await sharp(Buffer.from(original.photo.split(',')[1],'base64')).metadata()).width,1080);
 assert.notEqual(original.photo,(await call('post.photo',{sourceCode:different.code,day})).photo);
 await assert.rejects(call('post.photo',{sourceCode:source.code,day},second),error=>error.code==='source_forbidden');
 await assert.rejects(call('reuse',{sourceCode:foreign.code,day,codes:[target.code]}),error=>error.code==='source_forbidden');
 const imagesBefore=(await store.listJSON('photos/')).length;
 const result=await call('reuse',{sourceCode:source.code,day,codes:[target.code,different.code,sealed.code,foreign.code]});
 assert.deepEqual(result.results.map(row=>[row.done,row.error]),[[true,undefined],[false,'already_recorded'],[false,'window_closed'],[false,'forbidden']]);
 assert.equal((await store.listJSON('photos/')).length,imagesBefore);
 assert.equal((await call('state',{code:untouched.code})).hasPhoto,false);
 const sourceKey=(await store.getWithMetadata('rooms/'+source.code)).data.days[day].posts[0];
 assert.equal((await store.getWithMetadata('rooms/'+target.code)).data.days[day].posts[0],sourceKey);
 assert.equal((await call('reuse',{sourceCode:source.code,day,codes:[target.code]})).results[0].done,true);
 const global=await call('global',{day});assert.equal(global.area.pixels,1);assert.equal(global.count,2);
 const pixels=await sharp(Buffer.from(global.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();assert.deepEqual([...pixels.subarray((global.y*256+global.x)*4,(global.y*256+global.x)*4+3)],[195,149,130]);
 const totals=await call('area');assert.equal(totals.global.pixels,1);assert.equal(totals.atelier.days,4);
 await call('leave',{code:source.code});assert.equal((await call('post.photo',{sourceCode:source.code,day})).photo,original.photo);
 assert.equal((await call('reuse',{sourceCode:source.code,day,codes:[untouched.code]})).results[0].done,true);
 nextDay();await assert.rejects(call('reuse',{sourceCode:source.code,day,codes:[untouched.code]}),error=>error.code==='window_closed');assert.equal((await call('posts')).sources.length,0);
});

test('day rectangles, drafts, works and totals use historical participants, including departed users and login restoration',async()=>{
 const {store,auth,call,nextDay}=fixture(),a=await call('create',{name:'大きな窓',capacity:2}),b=await call('create',{name:'小さな窓',capacity:5}),day=a.day;
 assert.equal((await call('area')).atelier.pixels,0);assert.equal(a.area.pixels,0);
 await call('join',{code:a.code},second);await call('post',{code:a.code,day,photo:red});await call('post',{code:b.code,day,photo:blue});
 const areaA=rectPixels(a),areaB=rectPixels(b);assert.equal((await call('state',{code:a.code})).area.pixels,areaA);assert.equal((await call('state',{code:a.code},second)).area.pixels,0);
 assert.equal((await call('draft',{code:a.code,day})).area.pixels,areaA);await call('generate',{code:a.code,day});assert.equal((await call('work',{code:a.code,day})).area.pixels,areaA);
 assert.equal((await call('state',{code:a.code})).works[0].area.pixels,areaA);
 // Existing metadata and photos written before this feature still work.
 const old=(await store.getWithMetadata('rooms/'+a.code)).data;delete old.days[day].members;
 const oldKey=`photos/${member(first)}/${day}`,bytes=await store.get(old.days[day].posts[0],{type:'arrayBuffer'});await store.set(oldKey,bytes);old.days[day].posts[0]=oldKey;await store.setJSON('rooms/'+a.code,old);
 assert.equal((await call('post.photo',{sourceCode:a.code,day})).photo,'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64'));
 await call('leave',{code:a.code});let totals=await call('area');assert.equal(totals.atelier.pixels,areaA+areaB);assert.equal(totals.global.pixels,1);assert.equal(totals.ateliers.find(row=>row.code===a.code).joined,false);
 nextDay();await call('join',{code:a.code},third);assert.equal((await call('work',{code:a.code,day},third)).area.pixels,0);
 assert.equal((await call('area',{},third)).atelier.pixels,0);assert.equal((await call('area')).atelier.pixels,areaA+areaB);
 const today=await call('state',{code:b.code});await call('post',{code:b.code,day:today.day,photo:red});totals=await call('area');assert.equal(totals.atelier.pixels,areaA+areaB+rectPixels(today));assert.equal(totals.global.pixels,2);assert.equal(totals.atelier.days,3);
 const registration=await auth.execute({action:'account.register',username:'area_user',password:'area-test-password-29'},first);
 const login=await auth.execute({action:'account.login',username:'area_user',password:'area-test-password-29'},third);assert.deepEqual(await call('area',{},registration.token),totals);assert.deepEqual(await call('area',{},login.token),totals);
 assert.equal((await call('global',{day},login.token)).area.pixels,1);
});

test('concurrent distinct photos cannot replace a slot and crossing UTC midnight cannot record in the wrong day',async()=>{
 const {call}=fixture(),room=await call('create',{name:'同時の窓',capacity:2});
 const results=await Promise.allSettled([red,blue].map(photo=>call('post',{code:room.code,day:room.day,photo})));
 assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.code,'already_recorded');assert.equal((await call('area')).atelier.days,1);
 const store=memoryStore();let clock=Date.parse('2026-10-08T23:59:59Z');const service=core(store,{now:()=>clock,images:{async normalize(bytes){clock+=2000;return bytes;}}});
 const last=await service({action:'create',name:'日付の窓',capacity:2},first);
 await assert.rejects(service({action:'post',code:last.code,day:last.day,photo:red},first),error=>error.code==='window_closed');
 assert.deepEqual((await store.getWithMetadata('rooms/'+last.code)).data.days,{});
});
