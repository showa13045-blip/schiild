// Receive-only authentication. This module never calls a WhatsApp sending API.
import {createHash,randomBytes} from 'node:crypto';
import {ApiError} from './atelier-core.mjs';
import {prepareOriginalDeletion} from './delete-originals.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code)=>{throw new ApiError(status,code);};
const TTL=300000;
export function readWhatsAppConfig(value){
 try{const config=typeof value==='string'?JSON.parse(value):value;
  return config&&/^[1-9][0-9]{6,14}$/.test(config.phoneNumber??'')&&/^[0-9]{5,30}$/.test(config.phoneNumberId??'')&&typeof config.webhookSecret==='string'&&config.webhookSecret.length>=32&&config.webhookSecret.length<=256?config:null;
 }catch{return null;}
}
async function claimQuota(store,now){
 const date=new Date(now).toISOString();
 // Conservative application caps. No payment method or automatic upgrade is configured.
 for(const [period,limit] of [[date.slice(0,7),1900],[date.slice(0,10),400]]){
  const key=`auth-attempts/${hash('whatsapp-start/'+period)}`;let claimed=false;
  for(let attempt=0;attempt<20;attempt++){
   const row=await store.getWithMetadata(key,{type:'json'}),count=row?.data.count??0;
   if(count>=limit)fail(429,'whatsapp_limited');
   if((await store.setJSON(key,{count:count+1},row?{onlyIfMatch:row.etag}:{onlyIfNew:true})).modified){claimed=true;break;}
  }
  if(!claimed)fail(429,'whatsapp_limited');
 }
}
function sender(message,phoneNumberId,conversation){
 const phone=typeof message.from==='string'&&/^[1-9][0-9]{6,14}$/.test(message.from)?message.from:null;
 const scoped=message.from_user_id??conversation?.business_scoped_user_id;
 if(typeof scoped==='string'&&/^[A-Za-z0-9._-]{3,128}$/.test(scoped))return {subject:hash(phoneNumberId+'/bsuid/'+scoped),hint:phone?'•••• '+phone.slice(-4):'WhatsApp'};
 if(phone)return {subject:hash(phoneNumberId+'/phone/'+phone),hint:'•••• '+phone.slice(-4)};
 return null;
}
export function whatsappAccounts(store,{config,now=()=>Date.now(),identity,session,purgePhotos=false,images}){
 config=readWhatsAppConfig(config);
 const enabled=Boolean(config);
 async function challengeFor(body,credential,actor){
  if(typeof body.state!=='string'||!/^[a-f0-9]{64}$/.test(body.state))fail(401,'whatsapp_expired');
  const key=`whatsapp-challenges/${hash(body.state)}`,row=await store.getWithMetadata(key,{type:'json'}),value=row?.data;
  if(!value||value.used||value.expires<=now()||value.member!==actor.member||value.username!==(actor.account?.username??null)||value.credentialHash!==hash(credential))fail(401,'whatsapp_expired');
  return {key,row,value};
 }
 async function execute(body,credential){
  if(body.action==='account.whatsapp.config')return {enabled};
  if(!enabled)fail(503,'whatsapp_unavailable');
  const actor=await identity(credential);
  if(body.action==='account.whatsapp.start'){
   const intent=body.intent??'login';
   if(!['login','register','delete'].includes(intent))fail(400,'invalid');
   // Linking providers is a separate operation; never merge by name or phone number.
   if(intent!=='delete'&&actor.account)fail(409,'account_linked');
   if(intent==='delete'&&(!actor.account?.whatsappSubject||body.confirmUsername!==actor.account.username))fail(401,'whatsapp_invalid');
   await store.pruneWhatsAppChallenges?.(now());await claimQuota(store,now());
   const state=randomBytes(32).toString('hex'),expires=now()+TTL;
   const value={credentialHash:hash(credential),member:actor.member,username:actor.account?.username??null,intent,createdAt:now(),expires,used:false};
   if(!(await store.setJSON(`whatsapp-challenges/${hash(state)}`,value,{onlyIfNew:true})).modified)fail(401,'account_deleted');
   const message=`Schiild ${intent.toUpperCase()} ${state}\nOnly send this message if you started this action on schiild.app. Do not forward it.`;
   return {state,intent,expires,url:`https://wa.me/${config.phoneNumber}?text=${encodeURIComponent(message)}`};
  }
  const {key,row,value}=await challengeFor(body,credential,actor);
  if(body.action==='account.whatsapp.status')return {received:Boolean(value.subject),hint:value.hint??'',intent:value.intent,expires:value.expires};
  if(body.action!=='account.whatsapp.complete')fail(400,'invalid');
  if(!value.subject)fail(409,'whatsapp_pending');
  if(body.intent!==value.intent)fail(401,'whatsapp_expired');
  // Only this bound browser can consume the proof; the webhook never issues a session.
  if(!(await store.setJSON(key,{...value,used:true},{onlyIfMatch:row.etag})).modified)fail(401,'whatsapp_expired');
  const current=await identity(credential);
  if(value.expires<=now()||current.member!==actor.member||current.account?.username!==actor.account?.username)fail(401,'whatsapp_expired');
  if(value.intent==='delete'){
   if(!current.account||current.account.whatsappSubject!==value.subject)fail(401,'whatsapp_invalid');
   if(purgePhotos)await prepareOriginalDeletion(store,current.account,images);
   const result=await store.deleteAccount(current.account,randomBytes(32).toString('hex'),[],{purgePhotos});
   if(!result.modified)fail(401,'account_deleted');
   return {deleted:true};
  }
  const mapping=await store.getWithMetadata(`whatsapp-identities/${value.subject}`,{type:'json'});
  if(mapping){
   if(value.intent==='register')fail(409,'whatsapp_registered');
   const account=await store.getWithMetadata(`accounts/${mapping.data.username}`,{type:'json'});
   if(!account||account.data.whatsappSubject!==value.subject)fail(401,'whatsapp_expired');
   return session(account.data);
  }
  if(value.intent!=='register')fail(401,'whatsapp_not_registered');
  const account={username:`w_${randomBytes(10).toString('hex')}`,name:'',member:current.member,since:new Date(now()).toISOString().slice(0,10),whatsappSubject:value.subject};
  const result=await store.registerWhatsApp(account);
  if(!result.modified)fail(409,result.reason==='whatsapp'?'whatsapp_registered':'whatsapp_conflict');
  return session(result.account);
 }
 async function receive(payload){
  if(!enabled)fail(503,'whatsapp_unavailable');
  const items=payload?.batch===true&&Array.isArray(payload.data)?payload.data:[payload];
  if(items.length>50)fail(400,'invalid');
  for(const item of items){
   const message=item?.message;
   if(item?.phone_number_id!==config.phoneNumberId||message?.type!=='text'||typeof message['id']!=='string'||message['id'].length>512)continue;
   // Live Kapso v2 deliveries identify inbound messages by their signed root type;
   // the optional message.kapso extension is absent on these deliveries.
   const direction=message.kapso?.direction;
   if(item.type!==undefined&&item.type!=='whatsapp.message.received')continue;
   if(direction!==undefined&&direction!=='inbound')continue;
   if(direction!=='inbound'&&item.type!=='whatsapp.message.received')continue;
   if(item.conversation?.phone_number_id!==undefined&&item.conversation.phone_number_id!==config.phoneNumberId)continue;
   const text=message.text?.body;
   if(typeof text!=='string'||text.length>512)continue;
   const match=/^Schiild (LOGIN|REGISTER|DELETE) ([a-f0-9]{64}) Only send this message if you started this action on schiild\.app\. Do not forward it\.$/.exec(text.trim().replace(/\s+/g,' '));
   if(!match)continue;
   const key=`whatsapp-challenges/${hash(match[2])}`,row=await store.getWithMetadata(key,{type:'json'}),value=row?.data;
   const identity=sender(message,config.phoneNumberId,item.conversation),sentAt=Number(message.timestamp)*1000;
   if(!identity||!value||value.used||value.subject||value.expires<=now()||value.intent!==match[1].toLowerCase()||!Number.isFinite(sentAt)||sentAt<value.createdAt-10000||sentAt>now()+30000)continue;
   await store.setJSON(key,{...value,...identity,messageHash:hash(message['id'])},{onlyIfMatch:row.etag});
  }
  return {received:true};
 }
 return {execute,receive};
}
