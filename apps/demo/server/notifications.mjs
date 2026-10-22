// DEMO ONLY. Encrypted Web Push; independent of production M1–M4.
import webpush from 'web-push';
import {ECDH} from 'node:crypto';
import {ApiError} from './atelier-core.mjs';
import {listRecords} from './accounts.mjs';
import {globalService} from './global-service.mjs';
import {pushDigest,EVENT_TTL} from './notification-events.mjs';
import {pushText} from '../src/push-copy.ts';
import {localeTags} from '../src/locale-info.ts';
import {localizedDate} from '../src/locale-dates.ts';
const kinds=['atelierReady','globalReady','post'],locales=Object.keys(localeTags);
const defaults={atelierReady:true,globalReady:true,post:true};
const fail=(status,code)=>{throw new ApiError(status,code);};
const read=(store,key)=>store.getWithMetadata(key,{type:'json'});
export function readPushConfig(value){
 try{const config=typeof value==='string'?JSON.parse(value):value;
  if(!config||!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.subject)||!/^[\w-]{87}$/.test(config.publicKey)||!/^[\w-]{43}$/.test(config.privateKey))return null;
  const key=Buffer.from(config.publicKey,'base64url');if(key.length!==65||key[0]!==4)return null;ECDH.convertKey(key,'prime256v1');
  return {subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey};
 }catch{return null;}
}
function subscriptionInput(value){
 try{if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)throw Error();
  const url=new URL(value.endpoint),host=url.hostname;
  // Browser-managed push services only. No arbitrary outbound URLs or redirects.
  const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'].some(domain=>host===domain||domain==='wns.windows.com'&&host.endsWith('.'+domain));
  if(!allowed||url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw Error();
  const {p256dh,auth}=value.keys??{};
  if(!/^[\w-]{87}$/.test(p256dh)||!/^[\w-]{22}$/.test(auth))throw Error();
  const key=Buffer.from(p256dh,'base64url');if(key.length!==65||key[0]!==4||Buffer.from(auth,'base64url').length!==16)throw Error();
  ECDH.convertKey(key,'prime256v1');return {endpoint:url.href,keys:{p256dh,auth}};
 }catch{fail(400,'push_invalid');}
}
const deviceProof=body=>{if(!/^[a-f0-9]{64}$/.test(body.clientKey??''))fail(400,'push_invalid');return pushDigest(body.clientKey);};
const deviceKey=body=>{if(typeof body.endpoint!=='string'||body.endpoint.length>2048)fail(400,'push_invalid');return `push-subscriptions/${pushDigest(body.endpoint)}`;};
export function notificationService(store,{config,images,now=()=>Date.now(),send=sendPush,requireLine=false}={}){
 config=readPushConfig(config);
 async function preference(member){return (await read(store,`push-preferences/${member}`))?.data??{member,preferences:{...defaults},enabledSince:Object.fromEntries(kinds.map(kind=>[kind,now()]))};}
 async function live(sub){
  const session=(await read(store,sub.sessionKey))?.data;
  if(!session||session.revoked||session.deleted||session.expires<=now()||session.member!==sub.member)return false;
  const account=(await read(store,`accounts/${session.username}`))?.data;return account?.member===sub.member&&(!requireLine||Boolean(account.lineSubject||account.whatsappSubject));
 }
 async function execute(body,actor){
  if(!actor.account||!actor.sessionKey)fail(401,'unauthorized');
  if(requireLine&&!actor.account.lineSubject&&!actor.account.whatsappSubject)fail(403,'line_required');
  if(body.action==='push.config')return {enabled:Boolean(config),publicKey:config?.publicKey??null,preferences:(await preference(actor.member)).preferences};
  if(body.action==='push.preferences'){
   if(!body.preferences||kinds.some(kind=>typeof body.preferences[kind]!=='boolean'))fail(400,'push_invalid');
   for(let n=0;n<10;n++){
    const key=`push-preferences/${actor.member}`,row=await read(store,key),old=row?.data??await preference(actor.member);
    const preferences=Object.fromEntries(kinds.map(kind=>[kind,body.preferences[kind]])),enabledSince=Object.fromEntries(kinds.map(kind=>[kind,preferences[kind]&&!old.preferences[kind]?now():old.enabledSince[kind]]));
    if((await store.setJSON(key,{member:actor.member,preferences,enabledSince},row?{onlyIfMatch:row.etag}:{onlyIfNew:true})).modified)return {preferences};
   }fail(409,'retry');
  }
  if(body.action==='push.state'){
   const proof=deviceProof(body),row=await read(store,deviceKey(body));
   return {active:Boolean(row&&!row.data.disabled&&row.data.member===actor.member&&row.data.proof===proof&&await live(row.data)),preferences:(await preference(actor.member)).preferences};
  }
  if(body.action==='push.unsubscribe'){
   const key=deviceKey(body),proof=deviceProof(body),row=await read(store,key);
   if(row&&(row.data.member!==actor.member||row.data.proof!==proof))fail(403,'forbidden');
   // CAS tombstone prevents a concurrent subscribe from being silently erased.
   if(row&&!(await store.setJSON(key,{...row.data,disabled:true}, {onlyIfMatch:row.etag})).modified)fail(409,'retry');return {done:true};
  }
  if(body.action==='push.subscribe'){
   if(!config)fail(503,'push_unavailable');
   const subscription=subscriptionInput(body.subscription),proof=deviceProof(body),key=`push-subscriptions/${pushDigest(subscription.endpoint)}`,row=await read(store,key);
   if(!locales.includes(body.language))fail(400,'push_invalid');
   if(row&&(row.data.proof!==proof||row.data.member!==actor.member&&await live(row.data)))fail(403,'forbidden');
   if(!row&&(await listRecords(store,'push-subscriptions/')).filter(row=>row.data.member===actor.member&&!row.data.disabled).length>=20)fail(400,'push_invalid');
   const data={member:actor.member,sessionKey:actor.sessionKey,subscription,proof,language:body.language,registeredAt:row?.data.member===actor.member&&row.data.sessionKey===actor.sessionKey&&!row.data.disabled?row.data.registeredAt:now(),disabled:false};
   if(!(await store.setJSON(key,data,row?{onlyIfMatch:row.etag}:{onlyIfNew:true})).modified)fail(409,'retry');
   const prefKey=`push-preferences/${actor.member}`;await store.setJSON(prefKey,await preference(actor.member),{onlyIfNew:true});
   return {active:true,preferences:(await preference(actor.member)).preferences};
  }
  fail(400,'invalid');
 }
 async function eligible(event,sub){
  if(sub.disabled||sub.registeredAt>event.createdAt||!event.recipients.includes(sub.member)||!await live(sub))return false;
  const pref=await preference(sub.member);if(!pref.preferences[event.kind]||pref.enabledSince[event.kind]>event.createdAt)return false;
  if(event.code){const room=(await read(store,`rooms/${event.code}`))?.data;return Boolean(room?.members.includes(sub.member));}
  return true;
 }
 async function payload(event,sub){
  const atelier=event.code?(await read(store,`rooms/${event.code}`))?.data.name??'Schiild':'',language=sub.language;
  const date=localizedDate(event.day,'notification',language);
  const prefix={atelierReady:'ready',globalReady:'global',post:'post'}[event.kind];
  const query=new URLSearchParams({push:event.kind==='globalReady'?'global':'atelier',day:event.day,...(event.code?{code:event.code,ready:event.kind==='atelierReady'?'1':'0'}:{})});
  return {title:pushText(`demo.push.${prefix}_title`,language),body:pushText(`demo.push.${prefix}_body`,language,{atelier,date}),tag:`schiild-${event.eventId}`,url:'/?'+query,icon:'/app-icons/icon-192.png'};
 }
 async function drain(){
  if(!config)return;
  const subscriptions=await listRecords(store,'push-subscriptions/'),events=await listRecords(store,'push-events/');let budget=30,nextAlarm=Infinity;
  for(const {key:eventKey,data:event} of events){
   if(event.expiresAt<=now()){await store.deleteJSON(eventKey);continue;}
   if(event.complete)continue;let complete=true;
   for(const subscription of subscriptions){
    const sub=subscription.data;if(!event.recipients.includes(sub.member)||sub.registeredAt>event.createdAt)continue;
    const key=`push-deliveries/${pushDigest(event.eventId+'/'+subscription.key)}`,old=await read(store,key),receipt=old?.data;
    if(receipt?.done)continue;
    if(receipt?.nextAt>now()||receipt?.leaseUntil>now()||budget<=0){complete=false;nextAlarm=Math.min(nextAlarm,receipt?.nextAt>now()?receipt.nextAt:receipt?.leaseUntil>now()?receipt.leaseUntil:now()+1000);continue;}
    const attempt={member:sub.member,eventId:event.eventId,expiresAt:event.expiresAt,attempts:(receipt?.attempts??0)+1,leaseUntil:now()+45000,done:false};
    const claimed=await store.setJSON(key,attempt,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!claimed.modified){complete=false;continue;}
    budget--;let done=true,nextAt=0;
    // Re-read immediately before delivery: logout, leave, toggles and deletion revoke queued work.
    const current=await read(store,subscription.key),currentEvent=await read(store,eventKey);
    if(current&&currentEvent&&await eligible(currentEvent.data,current.data)){
     try{
      const message=await payload(event,current.data);const response=await send(current.data.subscription,message,config,Math.min(3600,Math.max(1,Math.floor((event.expiresAt-now())/1000))));
      if(response.status===404||response.status===410){await store.setJSON(subscription.key,{...current.data,disabled:true},{onlyIfMatch:current.etag});}
      else if(response.status===429||response.status>=500){done=false;const delay=Math.min(3600000,30000*2**Math.min(attempt.attempts,6));nextAt=now()+delay;}
      // Other 4xx indicate invalid subscription/config; no unbounded retry loop.
     }catch{done=false;nextAt=now()+Math.min(3600000,30000*2**Math.min(attempt.attempts,6));}
    }
    if(!done){complete=false;nextAlarm=Math.min(nextAlarm,nextAt);}
    await store.setJSON(key,{...attempt,done,nextAt,leaseUntil:0},{onlyIfMatch:claimed.etag});
   }
   if(complete){const row=await read(store,eventKey);if(row)await store.setJSON(eventKey,{...row.data,complete:true},{onlyIfMatch:row.etag});}
  }
  for(const {key,data} of await listRecords(store,'push-deliveries/'))if(data.expiresAt<=now())await store.deleteJSON(key);
  return Number.isFinite(nextAlarm)?nextAlarm:null;
 }
 async function finalizeGlobal(){
  if(!config||!images)return;
  // UTC 00:15, shared by all users. Never send a backfill for old works on deployment.
  const stamp=now(),today=new Date(stamp).toISOString().slice(0,10),midnight=Date.parse(today+'T00:00:00Z');if(stamp-midnight<15*60000)return;
  const day=new Date(midnight-86400000).toISOString().slice(0,10),createdAt=midnight+15*60000,eventId=pushDigest('globalReady/'+day),key=`push-events/${eventId}`;
  if(await read(store,key))return;
  const global=await globalService(store,{images,now}).view(day,'notification');if(!global.image||!global.final)return;
  const recipients=[...new Set((await listRecords(store,'push-subscriptions/')).filter(row=>!row.data.disabled&&row.data.registeredAt<=createdAt).map(row=>row.data.member))];
  await store.setJSON(key,{eventId,kind:'globalReady',day,recipients,createdAt,expiresAt:createdAt+EVENT_TTL},{onlyIfNew:true});
 }
 return {execute,drain,finalizeGlobal,enabled:Boolean(config)};
}
async function sendPush(subscription,payload,config,ttl){
 const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{vapidDetails:config,TTL:ttl,urgency:'normal'});
 // Workers use manual redirect handling. Never forward a subscription or VAPID header.
 const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(10000)});await response.body?.cancel();return {status:response.status};
}
