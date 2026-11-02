import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {metadataStore} from '../../demo/cloudflare/metadata-store.mjs';
import {sqliteImages} from '../../demo/cloudflare/sqlite-images.mjs';
import {workerImages} from '../../demo/cloudflare/images.mjs';
import {accounts} from '../../demo/server/accounts.mjs';
import {createAtelierService,ApiError} from '../../demo/server/atelier-core.mjs';
import {globalService} from '../../demo/server/global-service.mjs';
import {humanModeration} from '../server/human-moderation.mjs';
import {automaticModeration} from '../server/automatic-moderation.mjs';
import {automaticImageStore} from '../server/automatic-photo-state.mjs';
import {AUTOMATIC_POLICY_VERSION} from '../server/automatic-policy.mjs';

test('old pending photos and interrupted publication finish through an alarm without inventing user consent',async()=>{
 const db=new DatabaseSync(':memory:');
 const storage={sql:{exec(sql,...args){const statement=db.prepare(sql);if(/^\s*(SELECT|PRAGMA)/i.test(sql))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(run){db.exec('BEGIN');try{const result=run();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');
 const now=()=>Date.parse('2026-11-02T12:00:00Z'),store=automaticImageStore(metadataStore(storage,sqliteImages(storage)),storage),auth=accounts(store,{now,images:workerImages});
 const account=await auth.execute({action:'account.register',username:'recovery_one',name:'Test',password:'TestOnly-Password-2026'},'1'.repeat(64)),actor=await auth.identity(account.token);
 const base=createAtelierService(store,{now,images:workerImages,memberForCredential:()=>actor.member}),operatorConfig=JSON.stringify({enabled:true,operators:['recovery_one']}),publisher=humanModeration({store,storage,images:workerImages,core:base,globalFactory:globalService,ErrorClass:ApiError,config:operatorConfig,now});
 const config={enabled:true,endpoint:'https://test.pickleballnavi.jp/schiild-image-review.cgi',key:'a'.repeat(64)},require=createRequire(new URL('../../demo/package.json',import.meta.url)),sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
 const photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#dc623b'}}).jpeg().toBuffer()).toString('base64');
 let calls=0,verdict='allow';const schedule=[];
 const options={storage,store,images:workerImages,core:(body,token)=>publisher.execute(body,actor,token),ErrorClass:ApiError,config,operatorConfig,now,schedule:async stamp=>schedule.push(stamp),analyze:async()=>{calls++;return {decision:verdict,reasons:verdict==='allow'?[]:['uncertain']};}};
 // Deliberately omit a publisher, as the real alarm does.
 const automatic=automaticModeration(options),call=(action,values={})=>automatic.execute({action,...values},actor,account.token);
 try{
  const room=await publisher.execute({action:'create',name:'Legacy',capacity:2},actor,account.token),scope={code:room.code,day:room.day};
  await publisher.execute({action:'post',...scope,photo},actor,account.token);
  assert.equal((await base({action:'state',code:room.code},account.token)).postedSlots.length,0);
  await call('state',{code:room.code});assert(schedule.length);assert.equal(calls,0);
  assert.equal(db.prepare('SELECT basis FROM automatic_authorizations').get().basis,'existing_pending_service_transition');
  await automatic.drain();assert.equal(calls,1);assert.equal((await call('state',{code:room.code})).postedSlots.length,1);assert.equal((await call('state',{code:room.code})).moderationStatus,undefined);
  // Reproduce a completed verdict whose original publication did not persist.
  const saved=await store.getWithMetadata('rooms/'+room.code,{type:'json'});delete saved.data.days[room.day].posts[0];
  await store.setJSON('rooms/'+room.code,saved.data,{onlyIfMatch:saved.etag});db.prepare("UPDATE moderation_queue SET status='pending'").run();
  await call('state',{code:room.code});await automatic.drain();assert.equal(calls,1);assert.equal((await call('state',{code:room.code})).postedSlots.length,1);
  // A new explicit-consent submission can fail between enqueue and publication.
  const second=await call('create',{name:'Interrupted',capacity:2});let first=true;
  const interrupted=automaticModeration({...options,publisher:{async publishForAutomatic(record){if(first){first=false;throw new ApiError(503,'retry');}return publisher.publishForAutomatic(record);}}});
  const nextPhoto='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#2497bb'}}).jpeg().toBuffer()).toString('base64');
  await assert.rejects(interrupted.execute({action:'post',code:second.code,day:second.day,photo:nextPhoto,automaticConsentVersion:AUTOMATIC_POLICY_VERSION},actor,account.token));
  db.prepare("UPDATE automatic_reviews SET status='retry',error_code='review_transport_failed',available_at=? WHERE object_key=(SELECT photo_key FROM moderation_queue WHERE target=?)").run(now()+3600000,second.code);
  db.prepare('DELETE FROM automatic_recovery_runs').run();
  await automatic.drain();assert.equal((await call('state',{code:second.code})).postedSlots.length,1);
  assert(db.prepare("SELECT basis FROM automatic_authorizations WHERE basis='explicit_submission_consent'").get());
  const third=await call('create',{name:'Rejected legacy',capacity:2});
  const rejectedPhoto='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#daca40'}}).jpeg().toBuffer()).toString('base64');
  await publisher.execute({action:'post',code:third.code,day:third.day,photo:rejectedPhoto},actor,account.token);verdict='reject';await automatic.drain();
  assert.equal((await call('state',{code:third.code})).postedSlots.length,0);assert.equal((await call('state',{code:third.code})).moderationStatus,'rejected');
  await assert.rejects(call('post',{code:third.code,day:third.day,photo:nextPhoto,authorization:'existing_pending_service_transition'}),error=>error.code==='review_consent_required');
 }finally{db.close();}
});
