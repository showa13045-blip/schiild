import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createAtelierService} from '../server/atelier-service.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {accounts} from '../server/accounts.mjs';
const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64),fourth='d'.repeat(64);
function fixture(){const store=memoryStore();let clock=Date.parse('2026-10-08T03:00:00Z');const auth=accounts(store,{now:()=>clock});return {store,auth,nextDay:()=>clock+=86400000,async call(action,values={},credential=first){const actor=await auth.identity(credential);return createAtelierService(store,{now:()=>clock,memberForCredential:()=>actor.member})({action,...values},credential);}};}
const photo=`data:image/jpeg;base64,${(await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer()).toString('base64')}`;
test('leaving preserves posted regions, finished artifacts and GLOBAL, transfers creator and prevents further posts',async()=>{
 const {store,call,nextDay}=fixture(),room=await call('create',{name:'残る区画',capacity:2}),code=room.code,day=room.day;
 await call('join',{code},second);await call('post',{code,day,photo});await call('post',{code,day,photo},second);await call('generate',{code,day});
 const art=await call('work',{code,day},second),global=await call('global',{day});
 // Simulate an existing published record from before per-day snapshots existed.
 const old=(await store.getWithMetadata('rooms/'+code)).data;delete old.days[day].members;await store.setJSON('rooms/'+code,old);
 await call('leave',{code});await call('leave',{code});
 const state=await call('state',{code},second);assert.equal(state.members,1);assert.equal(state.canGenerate,true);assert.deepEqual(state.postedSlots,[0,1]);
 await assert.rejects(call('state',{code}),error=>error.code==='forbidden');await assert.rejects(call('post',{code,day,photo}),error=>error.code==='forbidden');
 assert.equal((await call('work',{code,day},second)).image,art.image);assert.deepEqual((await call('work',{code,day},second)).rects,art.rects);assert.equal((await call('global',{day})).image,global.image);
 await assert.rejects(call('join',{code},third),error=>error.code==='slots_reserved');
 // Rejoining one's recorded slot on the same day keeps the original contribution.
 const rejoined=await call('join',{code});assert.equal(rejoined.hasPhoto,true);assert.equal(rejoined.canGenerate,false);await call('leave',{code});
 nextDay();const replacement=await call('join',{code},third);assert.equal(replacement.members,2);assert.equal(replacement.slot,0);assert.equal(replacement.hasPhoto,false);
 assert.equal((await call('work',{code,day},third)).image,art.image);assert.equal((await call('global',{day},third)).x,undefined);
 // Rebuild GLOBAL from stored photos: a reused current slot must not claim old pixels.
 await store.setJSON('globals/'+day,{day,pixels:{},ateliers:[]});const rebuilt=await call('global',{day});assert.equal(rebuilt.image,global.image);assert.equal(rebuilt.x,global.x);assert.equal((await call('global',{day},third)).x,undefined);
});
test('unposted slots are freed immediately, all participants may leave and first rejoin receives generation authority',async()=>{
 const {call}=fixture(),room=await call('create',{name:'空いた窓',capacity:2}),code=room.code;
 await call('join',{code},second);await call('leave',{code},second);
 assert.equal((await call('join',{code},third)).members,2);
 await Promise.all([call('leave',{code}),call('leave',{code},third)]);
 assert.equal((await call('preview',{code},fourth)).members,0);
 const returning=await call('join',{code},fourth);assert.equal(returning.members,1);assert.equal(returning.canGenerate,true);
});
test('leaving is excluded from account restoration without deleting the account or the daily contribution',async()=>{
 const {auth,call}=fixture(),room=await call('create',{name:'復元しない窓',capacity:2}),code=room.code;
 const registered=await auth.execute({action:'account.register',username:'leaving_user',password:'leave-test-password-29'},first);
 await call('post',{code,day:room.day,photo},registered.token);await call('leave',{code},registered.token);
 const login=await auth.execute({action:'account.login',username:'leaving_user',password:'leave-test-password-29'},second);assert.equal(login.account.ateliers.length,0);
 assert.equal((await call('global',{day:room.day},login.token)).count,1);assert.notEqual((await call('global',{day:room.day},login.token)).x,undefined);
 assert.equal((await call('join',{code},login.token)).hasPhoto,true);
});
test('concurrent joins to a freed slot keep capacity, and concurrent leave/post cannot publish after access is removed',async()=>{
 const {call}=fixture(),room=await call('create',{name:'同時の窓',capacity:2}),code=room.code;
 await call('join',{code},second);await call('leave',{code},second);
 const results=await Promise.allSettled([third,fourth].map(credential=>call('join',{code},credential)));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const participant=results[0].status==='fulfilled'?third:fourth;
 const race=await Promise.allSettled([call('post',{code,day:room.day,photo},participant),call('leave',{code},participant)]);
 assert.equal(race[1].status,'fulfilled');assert.equal(race[0].status,'rejected');assert.equal(race[0].reason.code,'forbidden');assert.equal((await call('state',{code})).postedSlots.length,0);
});
