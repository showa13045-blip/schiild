// DEMO/iOS ONLY. Independent Apple identities; never impersonate a LINE identity.
import {randomBytes} from 'node:crypto';
import {ApiError} from './atelier-core.mjs';
import {prepareOriginalDeletion} from './delete-originals.mjs';
import {appleDigest as hash,appleIdentity,sealAppleToken,openAppleToken} from './apple-identity.mjs';
export function appleAccounts(store,{config,now=()=>Date.now(),identity,session,images,verify=config?appleIdentity(config,{now}):null,prepareDeletion=prepareOriginalDeletion,ErrorClass=ApiError}){
 const fail=(status,code)=>{throw new ErrorClass(status,code);};
 return async(body,credential)=>{
  if(body.action==='account.apple.config')return {enabled:Boolean(config)};
  if(!config)fail(503,'apple_unavailable');
  const actor=await identity(credential);
  if(body.action==='account.apple.start'){
   const intent=body.intent;if(!['login','register','delete'].includes(intent))fail(400,'invalid');
   if(intent==='delete'&&(!actor.account?.appleSubject||body.confirmUsername!==actor.account.username))fail(401,'apple_invalid');
   if(intent!=='delete'&&actor.account)fail(409,'account_linked');
   await store.pruneAppleChallenges?.(now());
   const state=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex');
   const challenge={credentialHash:hash(credential),nonce,intent,member:actor.member,username:actor.account?.username??null,createdAt:now(),expires:now()+300000,used:false};
   if(!(await store.setJSON('apple-challenges/'+hash(state),challenge,{onlyIfNew:true})).modified)fail(401,'apple_expired');
   return {state,nonce,intent};
  }
  if(body.action!=='account.apple')fail(400,'invalid');
  if(!/^[a-f0-9]{64}$/.test(body.state??'')||typeof body.code!=='string'||!body.code||body.code.length>4096||typeof body.identityToken!=='string'||body.identityToken.length>16384)fail(401,'apple_invalid');
  const key='apple-challenges/'+hash(body.state),row=await store.getWithMetadata(key,{type:'json'}),challenge=row?.data;
  if(!challenge||challenge.used||challenge.expires<=now()||challenge.member!==actor.member||challenge.username!==(actor.account?.username??null)||challenge.credentialHash!==hash(credential))fail(401,'apple_expired');
  if(!(await store.setJSON(key,{...challenge,used:true},{onlyIfMatch:row.etag})).modified)fail(401,'apple_expired');
  let verified;try{verified=await verify.authorize({identityToken:body.identityToken,code:body.code,nonce:challenge.nonce,createdAt:challenge.createdAt});}catch(error){fail(401,/^apple_invalid_a0[1-9]$/.test(error?.code??'')?error.code:'apple_invalid');}
  const current=await identity(credential);
  if(challenge.expires<=now()||current.member!==actor.member||current.account?.username!==actor.account?.username)fail(401,'apple_expired');
  if(challenge.intent==='delete'){
   if(!current.account||current.account.appleSubject!==verified.subject)fail(401,'apple_invalid');
   // Revoke both the fresh grant and the saved grant before deleting identifying data.
   // Remote failures retain the account so the user can safely retry.
   try{
    await verify.revoke(verified.refreshToken);
    if(current.account.appleRefresh)await verify.revoke(openAppleToken(current.account.appleRefresh,config,verified.subject));
   }catch{fail(503,'apple_unavailable');}
   await prepareDeletion(store,current.account,images);
   const result=await store.deleteAccount(current.account,randomBytes(32).toString('hex'),[],{purgePhotos:true});
   if(!result.modified)fail(401,'account_deleted');
   return {deleted:true};
  }
  const mapping=await store.getWithMetadata('apple-identities/'+verified.subject,{type:'json'});
  if(mapping){
   if(challenge.intent==='register')fail(409,'apple_registered');
   const account=await store.getWithMetadata('accounts/'+mapping.data.username,{type:'json'});
   if(!account||account.data.appleSubject!==verified.subject)fail(401,'apple_not_registered');
   for(let attempt=0;attempt<10;attempt++){
    const latest=await store.getWithMetadata('accounts/'+account.data.username,{type:'json'});
    if(!latest||latest.data.member!==account.data.member)fail(401,'account_deleted');
    const updated={...latest.data,appleRefresh:sealAppleToken(verified.refreshToken,config,verified.subject)};
    if((await store.setJSON('accounts/'+updated.username,updated,{onlyIfMatch:latest.etag})).modified)return session(updated);
   }
   fail(503,'unavailable');
  }
  if(challenge.intent!=='register')fail(401,'apple_not_registered');
  // A new random member prevents deleted drafts or old memberships from reappearing.
  const account={username:'a_'+randomBytes(10).toString('hex'),name:typeof body.name==='string'&&body.name.trim()?body.name.trim().slice(0,40):'Schiilder',member:randomBytes(32).toString('hex'),since:new Date(now()).toISOString().slice(0,10),appleSubject:verified.subject,appleRefresh:sealAppleToken(verified.refreshToken,config,verified.subject)};
  const result=await store.registerApple(account);if(!result.modified)fail(409,'apple_registered');
  return session(result.account);
 };
}
export function registerAppleInStorage(storage,account){
 return storage.transactionSync(()=>{
  const read=key=>storage.sql.exec('SELECT data FROM rooms WHERE key = ?',key).toArray()[0];
  const identityKey='apple-identities/'+account.appleSubject,accountKey='accounts/'+account.username,memberKey='members/'+account.member;
  if(read(identityKey)||read(accountKey)||read(memberKey))return {modified:false};
  for(const [key,data] of [[identityKey,{username:account.username}],[accountKey,account],[memberKey,{username:account.username}]])storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?)',key,JSON.stringify(data),'1');
  return {modified:true,account};
 });
}
