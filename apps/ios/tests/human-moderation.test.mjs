import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {metadataStore} from '../../demo/cloudflare/metadata-store.mjs';import {sqliteImages} from '../../demo/cloudflare/sqlite-images.mjs';
import {workerImages} from '../../demo/cloudflare/images.mjs';import {accounts} from '../../demo/server/accounts.mjs';
import {createAtelierService,ApiError} from '../../demo/server/atelier-core.mjs';import {globalService} from '../../demo/server/global-service.mjs';
import {prepareOriginalDeletion} from '../../demo/server/delete-originals.mjs';import {atelierRects} from '../../demo/src/atelier-layout.ts';
import {humanModeration,moderatorReadiness,removeDeletedModeration} from '../server/human-moderation.mjs';
test('manual approval hides pending photos, reserves slots, updates the original date and retains anonymous rendered pixels',async()=>{
 const db=new DatabaseSync(':memory:');const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};storage.sql.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');
 const store=metadataStore(storage,sqliteImages(storage));let stamp=Date.parse('2026-10-25T12:00:00Z');const now=()=>stamp,auth=accounts(store,{now,images:workerImages});
 const config=JSON.stringify({enabled:true,operators:['app_operator']}),require=createRequire(new URL('../../demo/package.json',import.meta.url)),sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
 const makePhoto=async color=>'data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg().toBuffer()).toString('base64');
 const orange=await makePhoto('#dd6840'),blue=await makePhoto('#459ac1');
 const people={};for(const [index,username]of ['app_operator','person_one','person_two','person_three'].entries()){const result=await auth.execute({action:'account.register',username,password:'TestOnly-Password-2026'},String(index+1).repeat(64));people[username]={...result,actor:await auth.identity(result.token)};}
 async function call(person,action,values={}){const user=people[person],core=createAtelierService(store,{now,images:workerImages,memberForCredential:()=>user.actor.member,publicOnly:!user.actor.account}),moderation=humanModeration({store,storage,images:workerImages,core,globalFactory:globalService,ErrorClass:ApiError,config,now});return moderation.execute({action,...values},user.actor,user.token);}
 try{
  assert.deepEqual(await moderatorReadiness(store,config),{enabled:true,operatorReady:true});
  const room=await call('person_one','create',{name:'Window',capacity:2});await call('person_two','join',{code:room.code});
  const first=await call('person_one','post',{code:room.code,day:room.day,photo:orange});assert.equal(first.moderationStatus,'pending');assert.deepEqual(first.postedSlots,[]);
  await call('person_two','post',{code:room.code,day:room.day,photo:blue});await call('person_two','global.record',{sourceCode:room.code,day:room.day});assert.equal((await call('person_two','global',{day:room.day})).image,null);
  const queue=await call('app_operator','moderation.list'),one=queue.items.find(row=>row.target===room.code&&db.prepare('SELECT member FROM moderation_queue WHERE queue_key=?').get(row.queue_key).member===people.person_one.actor.member),two=queue.items.find(row=>row.target===room.code&&row.queue_key!==one.queue_key),global=queue.items.find(row=>row.target==='GLOBAL');
  await assert.rejects(call('person_one','moderation.photo',{queueKey:one.queue_key}),error=>error.code==='forbidden');
  assert((await call('app_operator','moderation.photo',{queueKey:one.queue_key})).photo.startsWith('data:image/jpeg;base64,'));
  await call('app_operator','moderation.approve',{queueKey:one.queue_key});await call('person_one','generate',{code:room.code,day:room.day});
  const original=(await store.getWithMetadata('rooms/'+room.code,{type:'json'})).data.days[room.day],before=await store.get('works/'+room.code+'/'+room.day,{type:'arrayBuffer'});
  await call('person_two','leave',{code:room.code});await assert.rejects(call('person_three','join',{code:room.code}),error=>error.code==='slots_reserved');
  await prepareOriginalDeletion(store,people.person_one.actor.account,workerImages);await store.deleteAccount(people.person_one.actor.account,'a'.repeat(64),[],{purgePhotos:true});removeDeletedModeration(storage);
  const afterDeletion=await store.get('works/'+room.code+'/'+room.day,{type:'arrayBuffer'});assert.deepEqual(Buffer.from(afterDeletion),Buffer.from(before));
  stamp+=86400000;await call('person_three','join',{code:room.code});
  await call('app_operator','moderation.approve',{queueKey:two.queue_key});await call('app_operator','moderation.approve',{queueKey:global.queue_key});
  const saved=(await store.getWithMetadata('rooms/'+room.code,{type:'json'})).data.days[room.day];assert.equal(saved.status,'ready');assert.equal(saved.index,original.index);assert.equal(saved.seed,original.seed);assert.notEqual(saved.custodian,people.person_two.actor.member);
  const after=await store.get('works/'+room.code+'/'+room.day,{type:'arrayBuffer'}),beforePixels=await sharp(Buffer.from(before)).raw().toBuffer(),afterPixels=await sharp(Buffer.from(after)).raw().toBuffer();assert.notDeepEqual(afterPixels,beforePixels);
  // The old anonymous tile is reflowed to its new rectangle without its deleted photo.
  const roomAfter=(await store.getWithMetadata('rooms/'+room.code,{type:'json'})).data,from=atelierRects(roomAfter,original).find(rect=>rect.slot===0),to=atelierRects(roomAfter,saved).find(rect=>rect.slot===0),a=256/128,b=saved.outputSize/128;for(let y=to.y*b;y<(to.y+to.h)*b;y++)for(let x=to.x*b;x<(to.x+to.w)*b;x++){const sx=Math.min((from.x+from.w)*a-1,Math.floor(from.x*a+(x-to.x*b)/(to.w*b)*from.w*a)),sy=Math.min((from.y+from.h)*a-1,Math.floor(from.y*a+(y-to.y*b)/(to.h*b)*from.h*a));assert.deepEqual(afterPixels.subarray((y*saved.outputSize+x)*4,(y*saved.outputSize+x)*4+4),beforePixels.subarray((sy*256+sx)*4,(sy*256+sx)*4+4));}
  const world=await call('person_two','global',{day:room.day});assert.equal(world.count,1);assert(world.image);assert.equal(world.final,true);
  const today=new Date(stamp).toISOString().slice(0,10);await call('person_three','post',{code:room.code,day:today,photo:orange});const last=(await call('app_operator','moderation.list')).items.find(row=>row.day===today);await call('app_operator','moderation.reject',{queueKey:last.queue_key});assert.equal((await call('person_three','state',{code:room.code})).moderationStatus,'rejected');assert.deepEqual((await store.getWithMetadata('rooms/'+room.code,{type:'json'})).data.days[today].posts,{});
  await assert.rejects(call('app_operator','moderation.approve',{queueKey:last.queue_key}),error=>error.code==='moderation_reviewed');
 }finally{db.close();}
});
