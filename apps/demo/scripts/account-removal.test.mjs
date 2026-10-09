import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {accounts} from '../server/accounts.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {metadataStore} from '../cloudflare/metadata-store.mjs';
import {createAtelierService} from '../server/atelier-service.mjs';
const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64),password='irreversible-test-password-29';
const hash=value=>createHash('sha256').update(value).digest('hex');
const photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#c39582'}}).jpeg().toBuffer()).toString('base64');
function fixture(sqlite){
 let clock=Date.parse('2026-10-09T03:00:00Z');let store,db;
 if(sqlite){db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');const images=new Map();store=metadataStore({sql:{exec(query,...args){const statement=db.prepare(query),rows=query.startsWith('SELECT')?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows};}},transactionSync(callback){db.exec('BEGIN');try{const value=callback();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}},{async get(key){return images.get(key)??null;},async set(key,data){if(images.has(key))return {modified:false};images.set(key,data);return {modified:true};}});}else store=memoryStore();
 const auth=accounts(store,{now:()=>clock});return {store,db,auth,nextDay:()=>clock+=86400000,async call(action,values={},credential=first){const actor=await auth.identity(credential);return createAtelierService(store,{now:()=>clock,memberForCredential:()=>actor.member})({action,...values},credential);}};
}
for(const sqlite of [false,true])test(`permanent deletion removes personal data and all login paths while retaining anonymous works (${sqlite?'SQLite':'memory'})`,async()=>{
 const {store,db,auth,call,nextDay}=fixture(sqlite);
 try{
  const room=await call('create',{name:'残す作品',capacity:2}),solo=await call('create',{name:'残す区画',capacity:5}),day=room.day;await call('join',{code:room.code},second);await call('post',{code:room.code,day,photo});await call('post',{code:room.code,day,photo},second);await call('post',{code:solo.code,day,photo});await call('generate',{code:room.code,day});
  const art=await call('work',{code:room.code,day}),global=await call('global',{day});
  const registration=await auth.execute({action:'account.register',username:'erase_user',name:'消す表示名',password},first),login=await auth.execute({action:'account.login',username:'erase_user',password},third);
  const account=(await store.getWithMetadata('accounts/erase_user')).data;
  await store.registerGoogle({...account,googleSubject:hash('old-google-subject'),googleEmail:'erased@example.test'});await store.setJSON('google-challenges/'+hash(registration.token),{member:account.member,used:false,expires:Date.now()+10000});
  const beforeRoom=await store.getWithMetadata('rooms/'+room.code),beforeGlobal=await store.getWithMetadata('globals/'+day),originalKey=beforeRoom.data.days[day].posts[0],originalPhoto=await store.get(originalKey,{type:'arrayBuffer'});
  await assert.rejects(auth.execute({action:'account.delete',confirmUsername:'someone_else',password},registration.token),error=>error.code==='account_invalid');
  await assert.rejects(auth.execute({action:'account.delete',confirmUsername:'erase_user',password:'incorrect'},registration.token),error=>error.code==='login_invalid');assert.deepEqual(await store.getWithMetadata('rooms/'+room.code),beforeRoom);
  assert.deepEqual(await auth.execute({action:'account.delete',confirmUsername:'erase_user',password},registration.token),{done:true});
  assert.equal(await store.getWithMetadata('accounts/erase_user'),null);assert.equal((await store.listJSON('google-identities/')).length,0);assert.equal((await store.listJSON('google-challenges/')).length,0);
  assert.deepEqual((await store.getWithMetadata('members/'+account.member)).data,{deleted:true});
  for(const row of await store.listJSON('sessions/'))assert.deepEqual(row.data,{revoked:true,deleted:true,expires:0});
  for(const credential of [first,registration.token,login.token])await assert.rejects(auth.identity(credential),error=>error.code==='account_deleted');
  await assert.rejects(auth.execute({action:'account.login',username:'erase_user',password},third),error=>error.code==='login_invalid');
  assert.equal((await call('state',{code:room.code},second)).canGenerate,true);assert.deepEqual((await call('state',{code:room.code},second)).postedSlots,[0,1]);assert.equal((await call('work',{code:room.code,day},second)).image,art.image);
  const retained=await call('global',{day},third);assert.equal(retained.image,global.image);assert.equal(retained.count,global.count);assert.equal(retained.x,undefined);assert.equal(retained.area.pixels,0);assert(Buffer.from(await store.get(originalKey,{type:'arrayBuffer'})).equals(Buffer.from(originalPhoto)));
  const remaining=(await store.getWithMetadata('rooms/'+room.code)).data;assert.equal(remaining.members.includes(account.member),false);assert.equal(remaining.days[day].members.includes(account.member),false);assert.equal(remaining.days[day].custodian===account.member,false);assert.equal((await store.getWithMetadata('globals/'+day)).data.pixels[account.member],undefined);
  assert.equal((await store.setJSON('rooms/'+room.code,beforeRoom.data)).modified,false);assert.equal((await store.setJSON('globals/'+day,beforeGlobal.data)).modified,false);assert.equal((await store.setJSON('accounts/erase_user',account,{onlyIfNew:true})).modified,false);
  const fresh=await auth.execute({action:'account.register',username:'erase_user',password,name:'新しい人'},third);assert.equal(fresh.account.ateliers.length,0);assert.equal((await call('area',{},fresh.token)).global.pixels,0);assert.equal((await call('area',{},fresh.token)).atelier.pixels,0);
  assert.equal((await store.setJSON('accounts/erase_user',account)).modified,false);assert.equal((await store.setJSON('sessions/'+hash(login.token),{username:'erase_user',member:account.member,expires:Date.now()+10000,revoked:false})).modified,false);
  await assert.rejects(call('join',{code:room.code},fresh.token),error=>error.code==='slots_reserved');nextDay();await call('join',{code:room.code},fresh.token);assert.equal((await call('work',{code:room.code,day},fresh.token)).area.pixels,0);
 }finally{db?.close();}
});
test('deletion password attempts are bounded, guests cannot delete and login begun before deletion cannot issue a live session',async()=>{
 const {store,auth}=fixture(false),registration=await auth.execute({action:'account.register',username:'limited_erase',password},first);
 await assert.rejects(auth.execute({action:'account.delete',confirmUsername:'limited_erase',password},second),error=>error.code==='unauthorized');
 const failures=await Promise.allSettled(Array.from({length:8},()=>auth.execute({action:'account.delete',confirmUsername:'limited_erase',password:'incorrect'},registration.token)));assert(failures.every(row=>row.status==='rejected'));assert.equal(failures.filter(row=>row.reason.code==='login_limited').length,3);assert.notEqual(await store.getWithMetadata('accounts/limited_erase'),null);
 const {store:otherStore,auth:otherAuth}=fixture(false),live=await otherAuth.execute({action:'account.register',username:'racing_erase',password},first),set=otherStore.setJSON.bind(otherStore);let unblock,entered;const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>unblock=resolve);
 otherStore.setJSON=async(key,data,options)=>{if(key.startsWith('sessions/')&&!data.revoked){entered();await gate;}return set(key,data,options);};
 const login=otherAuth.execute({action:'account.login',username:'racing_erase',password},third);const checked=assert.rejects(login,error=>error.code==='account_deleted');await reached;await otherAuth.execute({action:'account.delete',confirmUsername:'racing_erase',password},live.token);unblock();await checked;
});
test('an identity lookup begun before deletion cannot authenticate the fresh account with the same ID',async()=>{
 const {store,auth}=fixture(false),live=await auth.execute({action:'account.register',username:'reused_erase',password},first),read=store.getWithMetadata.bind(store);let unblock,entered,pause=true;const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>unblock=resolve);
 store.getWithMetadata=async(key,options)=>{if(pause&&key==='accounts/reused_erase'){pause=false;entered();await gate;}return read(key,options);};
 const identity=auth.identity(live.token),checked=assert.rejects(identity,error=>error.code==='account_deleted');await reached;await auth.execute({action:'account.delete',confirmUsername:'reused_erase',password},live.token);await auth.execute({action:'account.register',username:'reused_erase',password},third);unblock();await checked;
});

test('SQLite deletion rolls back account removal and all anonymization if any write fails',async()=>{
 const {store,db,auth,call}=fixture(true);
 try{const room=await call('create',{name:'失敗しても残る記録',capacity:2});await call('post',{code:room.code,day:room.day,photo});const live=await auth.execute({action:'account.register',username:'atomic_erase',password},first),before=await store.getWithMetadata('rooms/'+room.code);
  db.exec("CREATE TRIGGER fail_removal BEFORE UPDATE ON rooms WHEN NEW.key LIKE 'rooms/%' BEGIN SELECT RAISE(ABORT,'test_failure'); END;");
  await assert.rejects(auth.execute({action:'account.delete',confirmUsername:'atomic_erase',password},live.token));assert.notEqual(await store.getWithMetadata('accounts/atomic_erase'),null);assert.deepEqual(await store.getWithMetadata('rooms/'+room.code),before);assert.equal((await auth.identity(live.token)).account.username,'atomic_erase');
 }finally{db.close();}
});
