// DEMO ONLY. Password authentication and sessions stay in Cloudflare metadata.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {ApiError} from './atelier-core.mjs';
import {googleVerifier,validGoogleClient} from './google-identity.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code)=>{throw new ApiError(status,code);};
const accountKey=username=>`accounts/${username}`;
const SESSION_MS=7*86400000;
async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(salt,'hex'),iterations:100000,hash:'SHA-256'},key,256)).toString('hex');
}
export async function listRecords(store,prefix){
 if(store.listJSON)return store.listJSON(prefix);
 const listing=await store.list({prefix});
 const rows=await Promise.all((listing.blobs??[]).map(async blob=>({key:blob.key,...await store.getWithMetadata(blob.key,{type:'json'})})));
 return rows;
}
export function accounts(store,{now=()=>Date.now(),googleClientId='',verifyGoogle=googleVerifier(googleClientId,{now})}={}){
 async function identity(credential){
  if(!/^[a-f0-9]{64}$/.test(credential??''))fail(401,'unauthorized');
  const member=hash(credential),session=await store.getWithMetadata(`sessions/${member}`,{type:'json'});
  if(session){if(session.data.revoked||session.data.expires<=now())fail(401,'session_expired');
   const account=await store.getWithMetadata(accountKey(session.data.username),{type:'json'});if(!account)fail(401,'unauthorized');
   return {member:account.data.member,account:account.data,sessionKey:`sessions/${member}`};
  }
  if(await store.getWithMetadata(`members/${member}`,{type:'json'}))fail(401,'unauthorized');
  return {member,account:null};
 }
 async function profile(account){
  const rooms=(await listRecords(store,'rooms/')).map(row=>row.data).filter(room=>room.members.includes(account.member));
  return {username:account.username,name:account.name,since:account.since,googleEmail:account.googleEmail,ateliers:rooms.map(room=>({code:room.code,name:room.name,capacity:room.capacity,canGenerate:room.creator===account.member})),custody:rooms.flatMap(room=>Object.values(room.days).filter(day=>day.status==='ready'&&day.custodian===account.member).map(day=>({code:room.code,name:room.name,day:day.day,index:day.index})))};
 }
 async function session(account){
  const token=randomBytes(32).toString('hex');
  await store.setJSON(`sessions/${hash(token)}`,{username:account.username,expires:now()+SESSION_MS,revoked:false},{onlyIfNew:true});
  return {token,account:await profile(account)};
 }
 async function execute(body,credential){
  const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
  if(body.action==='account.google.start'){
   if(!validGoogleClient(googleClientId))return {enabled:false};
   const actor=await identity(credential),nonce=randomBytes(32).toString('hex');
   await store.setJSON(`google-challenges/${hash(credential)}`,{nonceHash:hash(nonce),member:actor.member,expires:now()+300000,used:false});
   return {enabled:true,clientId:googleClientId,nonce};
  }
  if(body.action==='account.google'){
   if(!validGoogleClient(googleClientId))fail(503,'google_unavailable');
   const actor=await identity(credential),key=`google-challenges/${hash(credential)}`,challenge=await store.getWithMetadata(key,{type:'json'});
   if(!challenge||challenge.data.used||challenge.data.expires<=now()||challenge.data.member!==actor.member)fail(401,'google_expired');
   const verified=await verifyGoogle(body.idToken);
   if(hash(verified.nonce)!==challenge.data.nonceHash)fail(401,'google_invalid');
   if(challenge.data.expires<=now())fail(401,'google_expired');
   await identity(credential);
   // Consume before issuing a session. CAS prevents replay and concurrent callbacks.
   if(!(await store.setJSON(key,{...challenge.data,used:true},{onlyIfMatch:challenge.etag})).modified)fail(401,'google_expired');
   const subject=hash(verified.subject),mapping=await store.getWithMetadata(`google-identities/${subject}`,{type:'json'});
   if(mapping){
    if(actor.account&&actor.account.username!==mapping.data.username)fail(409,'google_conflict');
    const account=await store.getWithMetadata(accountKey(mapping.data.username),{type:'json'});
    if(!account)fail(503,'unavailable');
    return session(account.data);
   }
   // Never merge accounts by email. Linking requires an existing authenticated session.
   const account=actor.account??{username:`g_${randomBytes(10).toString('hex')}`,name:verified.name||'Schiilder',member:actor.member,since:new Date(now()).toISOString().slice(0,10)};
   if(!store.registerGoogle)fail(503,'unavailable');
   const result=await store.registerGoogle({...account,googleSubject:subject,googleEmail:verified.email});
   if(!result.modified){
    if(result.reason==='google'&&(!actor.account||actor.account.username===result.username)){
     const existing=await store.getWithMetadata(accountKey(result.username),{type:'json'});if(existing)return session(existing.data);
    }
    fail(409,'google_conflict');
   }
   return session(result.account);
  }
  if(body.action==='account.register'){
   if(!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(username)||typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'account_invalid');
   const actor=await identity(credential);if(actor.account)fail(409,'account_linked');
   const salt=randomBytes(16).toString('hex');
   const account={username,name:typeof body.name==='string'&&body.name.trim()?body.name.trim().slice(0,40):username,member:actor.member,since:new Date(now()).toISOString().slice(0,10),salt,passwordHash:await passwordHash(body.password,salt)};
   // Both names and participant linkage must be claimed in one atomic operation.
   if(!store.registerAccount)fail(503,'unavailable');
   const result=await store.registerAccount(account);
   if(!result.modified)fail(409,result.reason==='member'?'account_linked':'account_taken');
   return session(account);
  }
  if(body.action==='account.login'){
   if(!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(username)||typeof body.password!=='string'||body.password.length>128)fail(401,'login_invalid');
   const attemptsKey=`auth-attempts/${hash(username)}`;
   let claimed;
   for(let n=0;n<20;n++){
    const row=await store.getWithMetadata(attemptsKey,{type:'json'}),attempts=row?.data;
    if(attempts&&attempts.until>now()&&attempts.count>=5)fail(429,'login_limited');
    const result=await store.setJSON(attemptsKey,{count:attempts&&attempts.until>now()?attempts.count+1:1,until:attempts&&attempts.until>now()?attempts.until:now()+600000},row?{onlyIfMatch:row.etag}:{onlyIfNew:true});
    if(result.modified){claimed=result.etag;break;}
   }
   if(!claimed)fail(429,'login_limited');
   const row=await store.getWithMetadata(accountKey(username),{type:'json'});
   const derived=await passwordHash(body.password,row?.data.salt??'0'.repeat(32));
   if(!row?.data.passwordHash||!timingSafeEqual(Buffer.from(derived,'hex'),Buffer.from(row.data.passwordHash,'hex')))fail(401,'login_invalid');
   await store.setJSON(attemptsKey,{count:0,until:now()},{onlyIfMatch:claimed});
   return session(row.data);
  }
  const actor=await identity(credential);
  if(body.action==='account.me')return {account:actor.account?await profile(actor.account):null};
  if(!actor.account)fail(401,'unauthorized');
  if(body.action==='account.logout'){await store.setJSON(actor.sessionKey,{username:actor.account.username,expires:0,revoked:true});return {done:true};}
  if(body.action==='account.update'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>40)fail(400,'account_invalid');
   for(let n=0;n<20;n++){
    const row=await store.getWithMetadata(accountKey(actor.account.username),{type:'json'});
    const updated={...row.data,name:body.name.trim()};
    if((await store.setJSON(accountKey(updated.username),updated,{onlyIfMatch:row.etag})).modified)return {account:await profile(updated)};
   }
   fail(503,'unavailable');
  }
  fail(400,'invalid');
 }
 return {identity,execute};
}
