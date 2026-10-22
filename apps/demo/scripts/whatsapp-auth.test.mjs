import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {accounts} from '../server/accounts.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {DatabaseSync} from 'node:sqlite';
import {metadataStore} from '../cloudflare/metadata-store.mjs';
import {actorForAction,isVerifiedParticipant} from '../server/access-policy.mjs';
import {whatsappWebhook} from '../cloudflare/whatsapp-webhook.mjs';
const config={phoneNumber:'447700900000',phoneNumberId:'111111111111111',webhookSecret:'test-secret-'.repeat(6)};
const first='a'.repeat(64),second='b'.repeat(64);
function fixture(store=memoryStore()){
 let time=Date.parse('2026-10-22T03:00:00Z');const auth=accounts(store,{now:()=>time,requireLine:true,whatsappConfig:config});
 const call=(action,values={},credential=first)=>auth.execute({action,...values},credential);
 const start=(intent='register',credential=first,values={})=>call('account.whatsapp.start',{intent,...values},credential);
 function payload(value,from='447700900123',overrides={}){return {phone_number_id:config.phoneNumberId,message:{'id':'wamid.'+randomBytes(8).toString('hex'),timestamp:String(time/1000),type:'text',from,text:{body:new URL(value.url).searchParams.get('text')},kapso:{direction:'inbound'},...overrides}};}
 const receive=(value,from,overrides)=>auth.receiveWhatsApp(payload(value,from,overrides));
 const finish=(value,credential=first)=>call('account.whatsapp.complete',{state:value.state,intent:value.intent},credential);
 return {store,auth,call,start,payload,receive,finish,advance:ms=>{time+=ms;}};
}
test('WhatsApp registration accepts only an inbound proof and issues a usable participant session',async()=>{
 const f=fixture(),value=await f.start();assert.equal(new URL(value.url).hostname,'wa.me');
 await assert.rejects(f.finish(value),e=>e.code==='whatsapp_pending');
 await f.receive(value);const status=await f.call('account.whatsapp.status',{state:value.state});assert.equal(status.received,true);assert.equal(status.hint,'•••• 0123');
 const signed=await f.finish(value);assert.equal(signed.account.whatsappLinked,true);assert.equal(signed.account.canDelete,true);assert.equal(signed.account.hasPassword,false);assert.equal(signed.account.name,'');
 const actor=await actorForAction(f.auth,'create',signed.token);assert(isVerifiedParticipant(actor));assert(!signed.account.whatsappSubject);
 await f.call('account.update',{name:'Schiilder'},signed.token);assert.equal((await f.call('account.me',{},signed.token)).account.name,'Schiilder');
 await assert.rejects(f.finish(value),e=>e.status===401);
});
test('a proof is browser-bound, short-lived, single-use, and cannot change intent',async()=>{
 const f=fixture(),value=await f.start();await f.receive(value);
 await assert.rejects(f.finish(value,second),e=>e.code==='whatsapp_expired');
 await assert.rejects(f.call('account.whatsapp.complete',{state:value.state,intent:'delete'}),e=>e.code==='whatsapp_expired');
 const results=await Promise.allSettled([f.finish(value),f.finish(value)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const expired=await f.start('login',second);f.advance(300001);await f.receive(expired);
 await assert.rejects(f.finish(expired,second),e=>e.code==='whatsapp_expired');
});
test('outbound, stale, other-number, malformed and edited messages do not verify a challenge',async()=>{
 const f=fixture(),value=await f.start();
 for(const payload of [
  {...f.payload(value),phone_number_id:'wrong'},
  f.payload(value,undefined,{kapso:{direction:'outbound'}}),
  f.payload(value,undefined,{timestamp:'1'}),
  f.payload(value,undefined,{timestamp:'999999999999'}),
  f.payload(value,undefined,{type:'image'}),
  f.payload(value,undefined,{text:{body:'REGISTER '+value.state}}),
  f.payload(value,undefined,{from:'not-a-phone-number'}),
 ])await f.auth.receiveWhatsApp(payload);
 assert.equal((await f.call('account.whatsapp.status',{state:value.state})).received,false);
 await f.receive(value,'447700900123');await f.receive(value,'447700900456');
 assert.equal((await f.call('account.whatsapp.status',{state:value.state})).hint,'•••• 0123');
});
test('login never creates an account; registration never silently reuses an existing identity',async()=>{
 const f=fixture(),missing=await f.start('login');await f.receive(missing);await assert.rejects(f.finish(missing),e=>e.code==='whatsapp_not_registered');
 const registration=await f.start(),signed=await (async()=>{await f.receive(registration);return f.finish(registration);})();
 const duplicate=await f.start('register',second);await f.receive(duplicate);await assert.rejects(f.finish(duplicate,second),e=>e.code==='whatsapp_registered');
 const returning=await f.start('login',second);await f.receive(returning);assert.equal((await f.finish(returning,second)).account.username,signed.account.username);
 await assert.rejects(f.start('register',signed.token),e=>e.code==='account_linked');
});
test('BSUID-only customers can register without storing or requiring a phone number',async()=>{
 const f=fixture(),value=await f.start();const payload=f.payload(value,undefined,{from:undefined,from_user_id:'US.13491208655302741918'});await f.auth.receiveWhatsApp(payload);
 const signed=await f.finish(value);assert(signed.account.whatsappLinked);const stored=await f.store.getWithMetadata('accounts/'+signed.account.username);
 assert.match(stored.data.whatsappSubject,/^[a-f0-9]{64}$/);assert(!JSON.stringify(stored).includes('13491208655302741918'));
});
test('deletion requires a fresh proof from the same WhatsApp account and removes mappings and sessions',async()=>{
 const f=fixture(),value=await f.start();await f.receive(value);const signed=await f.finish(value);
 await assert.rejects(f.start('delete',signed.token,{confirmUsername:'wrong'}),e=>e.code==='whatsapp_invalid');
 const bad=await f.start('delete',signed.token,{confirmUsername:signed.account.username});await f.receive(bad,'447700900456');await assert.rejects(f.finish(bad,signed.token),e=>e.code==='whatsapp_invalid');
 assert((await f.call('account.me',{},signed.token)).account);
 const deletion=await f.start('delete',signed.token,{confirmUsername:signed.account.username});await f.receive(deletion);assert.deepEqual(await f.finish(deletion,signed.token),{deleted:true});
 await assert.rejects(f.call('account.me',{},signed.token),e=>e.code==='account_deleted');
 assert.equal((await f.store.listJSON('whatsapp-identities/')).length,0);assert.equal((await f.store.listJSON('whatsapp-challenges/')).length,0);
 const attempt=await f.start('login',second);await f.receive(attempt);await assert.rejects(f.finish(attempt,second),e=>e.code==='whatsapp_not_registered');
});
test('registration quota fails closed and disabled discovery requires no sending credential',async()=>{
 const f=fixture();for(let n=0;n<400;n++)await f.start();await assert.rejects(f.start(),e=>e.code==='whatsapp_limited');
 const disabled=accounts(memoryStore(),{requireLine:true});assert.deepEqual(await disabled.execute({action:'account.whatsapp.config'},first),{enabled:false});
 await assert.rejects(disabled.execute({action:'account.whatsapp.start'},first),e=>e.code==='whatsapp_unavailable');
 assert(!isVerifiedParticipant({sessionKey:'forged',account:{whatsappLinked:true}}));
});
test('webhook verifies the exact raw body before accepting or forwarding it, including batches',async()=>{
 const f=fixture(),value=await f.start();let forwards=0;
 const env={WHATSAPP_LOGIN_CONFIG:JSON.stringify(config),ATELIERS:{idFromName:()=>1,get:()=>({receiveWhatsApp:async payload=>{forwards++;return f.auth.receiveWhatsApp(payload);}})}};
 const raw=JSON.stringify({batch:true,data:[f.payload(value)]}),signature=createHmac('sha256',config.webhookSecret).update(raw).digest('hex');
 const request=(body=raw,sig=signature,event='whatsapp.message.received')=>new Request('https://schiild.app/api/auth/whatsapp',{method:'POST',headers:{'X-Webhook-Signature':sig,'X-Webhook-Event':event},body});
 assert.equal((await whatsappWebhook(request(raw,'0'.repeat(64)),env)).status,401);assert.equal((await whatsappWebhook(request(raw+' '),env)).status,401);assert.equal(forwards,0);
 assert.equal((await whatsappWebhook(request(raw,signature,'whatsapp.message.sent'),env)).status,400);
 assert.equal((await whatsappWebhook(request(),env)).status,200);assert.equal(forwards,1);assert.equal((await f.call('account.whatsapp.status',{state:value.state})).received,true);
 await f.finish(value);assert.equal((await whatsappWebhook(request(),env)).status,200);await assert.rejects(f.finish(value),e=>e.status===401);
 assert.equal((await whatsappWebhook(new Request('https://schiild.app/api/auth/whatsapp'),env)).status,405);
});

test('production SQLite atomically claims WhatsApp identities and removes their proof and sessions on deletion',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);const rows=query.startsWith('SELECT')?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows};}},transactionSync(callback){db.exec('BEGIN');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 try{
  const f=fixture(metadataStore(storage,{})),a=await f.start(),b=await f.start('register',second);
  await f.receive(a);await f.receive(b);
  const results=await Promise.allSettled([f.finish(a),f.finish(b,second)]),successful=results.filter(result=>result.status==='fulfilled');
  assert.equal(successful.length,1);const signed=successful[0].value,member=(await f.store.getWithMetadata('accounts/'+signed.account.username)).data.member;
  const returning=await f.start('login','c'.repeat(64));await f.receive(returning);assert.equal((await f.finish(returning,'c'.repeat(64))).account.username,signed.account.username);
  const deletion=await f.start('delete',signed.token,{confirmUsername:signed.account.username});await f.receive(deletion);assert.deepEqual(await f.finish(deletion,signed.token),{deleted:true});
  assert.equal((await f.store.listJSON('whatsapp-identities/')).length,0);assert.equal((await f.store.listJSON('whatsapp-challenges/')).filter(row=>row.data.member===member).length,0);await assert.rejects(f.call('account.me',{},signed.token),error=>error.code==='account_deleted');
 }finally{db.close();}
});

test('live Kapso v2 envelopes accept single-line WhatsApp prefills and stable conversation BSUIDs',async()=>{
 const f=fixture(),value=await f.start(),payload=f.payload(value);
 delete payload.message.kapso;payload.type='whatsapp.message.received';
 payload.message.text.body=payload.message.text.body.replace(/\s+/g,' ');
 payload.conversation={phone_number_id:config.phoneNumberId,phone_number:payload.message.from,business_scoped_user_id:'JP.1234567890123456'};
 const raw=JSON.stringify(payload),signature=createHmac('sha256',config.webhookSecret).update(raw).digest('hex');
 const env={WHATSAPP_LOGIN_CONFIG:JSON.stringify(config),ATELIERS:{idFromName:()=>1,get:()=>({receiveWhatsApp:body=>f.auth.receiveWhatsApp(body)})}};
 assert.equal((await whatsappWebhook(new Request('https://schiild.app/api/auth/whatsapp',{method:'POST',headers:{'X-Webhook-Signature':signature,'X-Webhook-Event':'whatsapp.message.received'},body:raw}),env)).status,200);
 assert.equal((await f.call('account.whatsapp.status',{state:value.state})).received,true);
 assert.equal((await f.call('account.whatsapp.status',{state:value.state})).hint,'•••• 0123');
 const signed=await f.finish(value);assert(signed.account.whatsappLinked);
 const again=await f.start('login',second),returning=f.payload(again);
 delete returning.message.kapso;delete returning.message.from;returning.type='whatsapp.message.received';returning.conversation={phone_number_id:config.phoneNumberId,business_scoped_user_id:payload.conversation.business_scoped_user_id};
 returning.message.text.body=returning.message.text.body.replace(/\s+/g,' ');
 await f.auth.receiveWhatsApp(returning);assert.equal((await f.finish(again,second)).account.username,signed.account.username);
});
test('root event classification never accepts outbound, unclassified or mismatched conversation deliveries',async()=>{
 const f=fixture(),value=await f.start();
 for(const change of [
  payload=>{payload.type='whatsapp.message.sent';},
  payload=>{payload.type='whatsapp.message.received';payload.message.kapso.direction='outbound';},
  payload=>{delete payload.message.kapso;},
  payload=>{delete payload.message.kapso;payload.type='whatsapp.message.received';payload.conversation={phone_number_id:'222222222222222',business_scoped_user_id:'JP.1234567890123456'};},
  payload=>{delete payload.message.kapso;payload.type='whatsapp.message.received';payload.message.text.body='Schiild REGISTER '+value.state;},
 ]){const payload=f.payload(value);change(payload);await f.auth.receiveWhatsApp(payload);assert.equal((await f.call('account.whatsapp.status',{state:value.state})).received,false);}
 const correct=f.payload(value);delete correct.message.kapso;correct.type='whatsapp.message.received';correct.message.text.body=correct.message.text.body.replace('\n','\r\n');await f.auth.receiveWhatsApp(correct);assert.equal((await f.call('account.whatsapp.status',{state:value.state})).received,true);
});
