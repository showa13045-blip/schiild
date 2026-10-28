// Real SQLite and the staged deployed revision, without live accounts or providers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {POSTING_POLICY_VERSION} from '../server/posting-policy.mjs';
const stage=process.env.IOS_REVIEW_STAGE,hash=value=>createHash('sha256').update(value).digest('hex');
test('review data, sessions, images, provider discovery and deletion stay isolated',{skip:!stage},async()=>{
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export class DurableObject { constructor(ctx,env){ this.ctx=ctx; this.env=env; } }',shortCircuit:true};return next(specifier,context);}});
 const runtime=await import(pathToFileURL(stage+'/runtime.mjs').href),instances=new Map(),databases=new Map();
 const password='ReviewOnly-Test-Password-2026',credential='1'.repeat(64);
 const env={IMAGE_BACKEND:'durable-sqlite',ALLOWED_ORIGINS:'https://schiild.app',APP_REVIEW_CONFIG:JSON.stringify({users:[{username:'review_one',name:'Alex',passwordHash:hash(password)},{username:'review_two',name:'Sam',passwordHash:hash(password)}]})};
 env.ATELIERS={idFromName:name=>name,get:object=>{
  if(instances.has(object))return instances.get(object);
  const db=new DatabaseSync(':memory:');databases.set(object,db);let alarm=null;
  const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(callback){db.exec('BEGIN');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},async getAlarm(){return alarm;},async setAlarm(value){alarm=value;}};
  // Cloudflare ctx.id is a platform-defined property.
  // eslint-disable-next-line schiild/domain-names
  const directory=new runtime.AtelierDirectory({storage,id:{toString:()=>object}},env);instances.set(object,directory);return directory;
 }};
 async function call(endpoint,action,values={},token=credential,expected=200){const response=await runtime.default.fetch(new Request('https://schiild.app/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,Origin:'https://schiild.app'},body:JSON.stringify({action,...values})}),env,{waitUntil(){}});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;}
 try{
  await call('atelier','account.register',{username:'review_one',password},credential,403);
  await call('atelier','account.review.login',{username:'review_one',password},credential,401);
  const normal=databases.get('shared-demo-v1');normal.prepare('INSERT INTO rooms(key,data,etag) VALUES(?,?,?)').run('accounts/ordinary',JSON.stringify({username:'ordinary',member:'f'.repeat(64),name:'Existing user'}),'1');
  const ordinarySnapshot=normal.prepare('SELECT * FROM rooms ORDER BY key').all();
  await call('review','account.review.login',{username:'review_one',password:'wrong-password'},credential,401);
  await call('review','account.register',{username:'intruder',password},credential,403);
  await call('review','directory',{},credential,401);
  const first=await call('review','account.review.login',{username:'review_one',password});assert.equal(first.account.username,'review_one');assert.equal(first.account.lineLinked,undefined);
  const second=await call('review','account.review.login',{username:'review_two',password},'2'.repeat(64));
  for(const provider of ['line','whatsapp','apple'])assert.deepEqual(await call('review','account.'+provider+'.config'),{enabled:false});
  await call('review','account.apple.start',{intent:'register'},credential,403);
  await call('atelier','create',{name:'Must not exist',capacity:2},first.token,403);
  const room=await call('review','create',{name:'Morning light',capacity:2},first.token);
  await call('review','join',{code:room.code},second.token);
  await call('atelier','state',{code:room.code},first.token,403);
  assert.equal((await call('atelier','directory')).ateliers.length,0);
  const require=createRequire(new URL('../../demo/package.json',import.meta.url)),sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
  const photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#e16e3e'}}).jpeg().toBuffer()).toString('base64');
  await call('review','post',{code:room.code,day:room.day,photo},first.token,409);
  await call('review','post',{code:room.code,day:room.day,photo,policyVersion:POSTING_POLICY_VERSION},first.token);
  await call('review','post',{code:room.code,day:room.day,photo,policyVersion:POSTING_POLICY_VERSION},second.token);
  await call('review','global.record',{sourceCode:room.code,day:room.day,policyVersion:POSTING_POLICY_VERSION},first.token);
  const made=await call('review','generate',{code:room.code,day:room.day},first.token);assert.equal(made.status,'ready');
  assert((await call('review','work',{code:room.code,day:room.day},first.token)).image.startsWith('data:image/png;base64,'));
  assert((await call('review','global',{day:room.day},first.token)).image);
  assert.equal((await call('review','state',{code:room.code},first.token)).works.length,1);
  assert.equal((await call('review','account.me',{},first.token)).account.ateliers.length,1);
  const review=databases.get('app-store-review-v1');assert.equal(review.prepare('SELECT COUNT(*) AS total FROM posting_consents').get().total,2);
  if(process.env.IOS_BLOCKS_STAGE){
   const target=await call('review','safety.target',{target:room.code,day:room.day},first.token),workBefore=await call('review','work',{code:room.code,day:room.day},first.token);
   const block=await call('review','blocks.add',{target:room.code,day:room.day,selectionKey:target.selections[1].key},first.token);assert.equal(block.blocked,true);assert.notEqual((await call('review','work',{code:room.code,day:room.day},first.token)).image,workBefore.image);assert.equal((await call('review','work',{code:room.code,day:room.day},second.token)).image,workBefore.image);
   await call('review','blocks.remove',{blockKey:block.key},second.token,404);assert.equal((await call('review','blocks.list',{},first.token)).items.length,1);
   assert.equal((await call('atelier','global',{day:room.day},first.token)).image,null);
   for(const path of ['/blocked/','/blocked/app.js']){const response=await runtime.default.fetch(new Request('https://schiild.app'+path),env,{});assert.equal(response.status,200);}
  }
  const originals=review.prepare('SELECT name FROM photo_members WHERE member=?').all(hash(credential));assert(originals.length>0);
  await call('review','account.delete',{confirmUsername:first.account.username,password},first.token);
  if(process.env.IOS_BLOCKS_STAGE)assert.equal(review.prepare('SELECT COUNT(*) AS total FROM personal_blocks').get().total,0);
  for(const {name}of originals)assert.equal(review.prepare('SELECT COUNT(*) AS total FROM image_blobs WHERE name=?').get(name).total,0);
  assert.equal(review.prepare('SELECT COUNT(*) AS total FROM posting_consents WHERE member=?').get(hash(credential)).total,0);
  await call('review','account.me',{},first.token,401);
  const fresh=await call('review','account.review.login',{username:'review_one',password},'3'.repeat(64));assert.deepEqual(fresh.account.ateliers,[]);
  assert((await call('review','global',{day:room.day},fresh.token)).image);
  assert.deepEqual(normal.prepare('SELECT * FROM rooms ORDER BY key').all(),ordinarySnapshot);
  const crossOrigin=await runtime.default.fetch(new Request('https://schiild.app/api/review',{method:'POST',headers:{Origin:'https://example.org'},body:'{}'}),env,{});assert.equal(crossOrigin.status,403);
  const page=await runtime.default.fetch(new Request('https://schiild.app/review/'),env,{});assert.equal(page.status,200);assert((await page.text()).includes('/review/_expo/'));
  const rules=await runtime.default.fetch(new Request('https://schiild.app/posting-rules.html?lang=ja'),env,{});assert.equal(rules.status,200);assert((await rules.text()).includes(POSTING_POLICY_VERSION));
 }finally{for(const db of databases.values())db.close();hook.deregister();}
});
