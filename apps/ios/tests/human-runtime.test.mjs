import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {registerHooks,createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {POSTING_POLICY_VERSION} from '../server/posting-policy.mjs';
const stage=process.env.IOS_MODERATION_STAGE,hash=value=>createHash('sha256').update(value).digest('hex');
test('published-revision moderation wiring enforces operator permissions and prevents unapproved publication',{skip:!stage},async()=>{
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export class DurableObject { constructor(ctx,env){ this.ctx=ctx; this.env=env; } }',shortCircuit:true};return next(specifier,context);}});
 const runtime=await import(pathToFileURL(stage+'/runtime.mjs').href),db=new DatabaseSync(':memory:');let alarm=null;
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},async getAlarm(){return alarm;},async setAlarm(value){alarm=value;}};
 const operator='a_test_operator',ordinary='a_test_person',env={IMAGE_BACKEND:'durable-sqlite',ALLOWED_ORIGINS:'https://schiild.app',MODERATION_CONFIG:JSON.stringify({enabled:true,operators:[operator]})};let directory;
 env.ATELIERS={idFromName:name=>name,get:()=>directory};
 // ctx.id is defined by Cloudflare's platform API.
 // eslint-disable-next-line schiild/domain-names
 directory=new runtime.AtelierDirectory({storage,id:{toString:()=>'shared-demo-v1'}},env);
 function seed(username,token,member){for(const [key,data]of [['accounts/'+username,{username,name:'Test',member,lineSubject:hash(username),since:'2026-10-27'}],['members/'+member,{username}],['sessions/'+hash(token),{username,member,revoked:false,expires:Date.now()+600000}]])db.prepare('INSERT INTO rooms(key,data,etag) VALUES(?,?,?)').run(key,JSON.stringify(data),'1');}
 seed(operator,'1'.repeat(64),'a'.repeat(64));seed(ordinary,'2'.repeat(64),'b'.repeat(64));
 async function call(action,values={},token='2'.repeat(64),status=200){const response=await runtime.default.fetch(new Request('https://schiild.app/api/atelier',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...values})}),env,{waitUntil(){}});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
 try{
  assert.deepEqual(await call('account.moderation.config'),{enabled:true,operatorReady:true});assert.deepEqual(await call('moderation.capabilities'),{operator:false,enabled:true});assert.equal((await call('moderation.capabilities',{},'1'.repeat(64))).operator,true);
  const room=await call('create',{name:'Test window',capacity:2});const require=createRequire(new URL('../../demo/package.json',import.meta.url)),sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default,photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#df744a'}}).jpeg().toBuffer()).toString('base64');
  const pending=await call('post',{code:room.code,day:room.day,photo,policyVersion:POSTING_POLICY_VERSION});assert.equal(pending.moderationStatus,'pending');assert.deepEqual(pending.postedSlots,[]);
  await call('global.record',{sourceCode:room.code,day:room.day,policyVersion:POSTING_POLICY_VERSION});assert.equal((await call('global',{day:room.day})).image,null);
  await call('moderation.list',{},'2'.repeat(64),403);const queue=await call('moderation.list',{},'1'.repeat(64));assert.equal(queue.items.length,2);
  for(const row of queue.items){await call('moderation.photo',{queueKey:row.queue_key},'2'.repeat(64),403);await call('moderation.approve',{queueKey:row.queue_key},'1'.repeat(64));}
  assert.equal((await call('state',{code:room.code})).hasPhoto,true);assert.equal((await call('state',{code:room.code})).moderationStatus,undefined);await call('generate',{code:room.code,day:room.day});assert((await call('work',{code:room.code,day:room.day})).image);assert((await call('global',{day:room.day})).image);
  assert.equal((await call('moderation.list',{},'1'.repeat(64))).items.length,0);assert.equal((await call('moderation.list',{status:'approved'},'1'.repeat(64))).items.length,2);
  const page=await runtime.default.fetch(new Request('https://schiild.app/moderation/'),env,{});assert.equal(page.status,200);assert((await page.text()).includes('/moderation/app.js'));
  if(process.env.IOS_SAFETY_STAGE){
   const before=await call('work',{code:room.code,day:room.day}),target=await call('safety.target',{target:room.code,day:room.day}),report=await call('reports.submit',{target:room.code,day:room.day,selectionKey:target.selections[0].key,reason:'rights',details:'Synthetic review test'});
   await call('reports.list',{},'2'.repeat(64),403);assert.equal((await call('reports.list',{},'1'.repeat(64))).items.length,1);assert((await call('reports.preview',{reportKey:report.reference},'1'.repeat(64))).image);await call('reports.remove',{reportKey:report.reference,note:'Test selected Schiil removal'},'1'.repeat(64));assert.notEqual((await call('work',{code:room.code,day:room.day})).image,before.image);assert((await call('work',{code:room.code,day:room.day})).reportUrl);
   const globalTarget=await call('safety.target',{target:'GLOBAL',day:room.day}),globalReport=await call('reports.submit',{target:'GLOBAL',day:room.day,selectionKey:globalTarget.selections[0].key,reason:'privacy',details:'Synthetic global test'});assert((await call('reports.preview',{reportKey:globalReport.reference},'1'.repeat(64))).schiilImage);await call('reports.remove',{reportKey:globalReport.reference,note:'Test global selected Schiil removal'},'1'.repeat(64));assert.equal((await call('global',{day:room.day})).image,null);assert.deepEqual((await call('global.archive')).days,[]);
   for(const path of ['/report/','/report/app.js','/reports/','/reports/app.js','/safety/links.js']){const response=await runtime.default.fetch(new Request('https://schiild.app'+path),env,{});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');}
  }
 }finally{db.close();hook.deregister();}
});
