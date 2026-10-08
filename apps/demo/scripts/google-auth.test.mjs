import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {googleVerifier} from '../server/google-identity.mjs';
import {accounts} from '../server/accounts.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {metadataStore} from '../cloudflare/metadata-store.mjs';
import {createAtelierService} from '../server/atelier-core.mjs';
const client='123456789-test.apps.googleusercontent.com',first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64);
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test';
const keys=createLocalJWKSet({keys:[jwk]});
function sqliteStore(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms (key TEXT PRIMARY KEY, data TEXT NOT NULL, etag TEXT NOT NULL)');
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^SELECT/.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(task){db.exec('BEGIN');try{const value=task();db.exec('COMMIT');return value;}catch(cause){db.exec('ROLLBACK');throw cause;}}};
 return {store:metadataStore(storage,{}),close:()=>db.close()};
}
function fixture(store=memoryStore()){
 let time=Date.parse('2026-10-08T03:00:00Z');const now=()=>time,verify=googleVerifier(client,{keys,now}),auth=accounts(store,{now,googleClientId:client,verifyGoogle:verify});
 async function token(nonce,claims={},signingKey=privateKey){return new SignJWT({nonce,email:'member@gmail.com',email_verified:true,name:'あさ',...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(claims.sub??'google-person-one').setIssuer('https://accounts.google.com').setAudience(client).setIssuedAt(Math.floor(time/1000)).setExpirationTime(Math.floor(time/1000)+3600).sign(signingKey);}
 async function login(credential=first,claims={}){const start=await auth.execute({action:'account.google.start'},credential);return auth.execute({action:'account.google',idToken:await token(start.nonce,claims)},credential);}
 return {auth,store,token,verify,login,advance:ms=>time+=ms,now};
}
test('Google verification rejects forged, wrong-app, expired and unverified tokens',async()=>{
 const {verify,token,advance}=fixture(),nonce='test-nonce',valid=await token(nonce);
 assert.equal((await verify(valid)).subject,'google-person-one');
 const {privateKey:forged}=await generateKeyPair('RS256');await assert.rejects(verify(await token(nonce,{},forged)),e=>e.code==='google_invalid');
 const claims={nonce,email:'x@gmail.com',email_verified:true};
 for(const [audience,issuer] of [['other.apps.googleusercontent.com','https://accounts.google.com'],[client,'https://evil.example']]){
  const value=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('someone').setAudience(audience).setIssuer(issuer).setIssuedAt(Math.floor(Date.parse('2026-10-08T03:00:00Z')/1000)).setExpirationTime('1h').sign(privateKey);
  await assert.rejects(verify(value),e=>e.code==='google_invalid');
 }
 await assert.rejects(verify(await token(nonce,{email_verified:false})),e=>e.code==='google_invalid');
 await assert.rejects(verify(await token(nonce,{azp:'other-client'})),e=>e.code==='google_invalid');
 advance(3600001);await assert.rejects(verify(valid),e=>e.code==='google_invalid');
});
test('Google nonce is bound to the browser, expires, and is consumed only once under concurrent requests',async()=>{
 const {auth,token,advance}=fixture(),start=await auth.execute({action:'account.google.start'},first),idToken=await token(start.nonce);
 await auth.execute({action:'account.google.start'},second);
 await assert.rejects(auth.execute({action:'account.google',idToken},second),e=>e.code==='google_invalid');
 const results=await Promise.allSettled([1,2].map(()=>auth.execute({action:'account.google',idToken},first)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(auth.execute({action:'account.google',idToken},first),e=>['unauthorized','google_expired'].includes(e.code));
 const expired=await auth.execute({action:'account.google.start'},third);advance(300001);
 await assert.rejects(auth.execute({action:'account.google',idToken:await token(expired.nonce)},third),e=>e.code==='google_expired');
});
for(const adapter of ['memory','sqlite'])test(`Google accounts preserve memberships, link existing IDs safely and restore across devices (${adapter})`,async()=>{
 const db=adapter==='sqlite'?sqliteStore():{store:memoryStore(),close:()=>{}};
 try{
  const {auth,store,login}=fixture(db.store),room=await createAtelierService(store)({action:'create',name:'認証の窓',capacity:2},first);
  const registered=await auth.execute({action:'account.register',username:'existing_member',password:'existing-password-29'},first);
  const linked=await login(registered.token);assert.equal(linked.account.username,'existing_member');assert.equal(linked.account.googleEmail,'member@gmail.com');assert.equal(linked.account.ateliers[0].code,room.code);
  const restored=await login(second);assert.equal(restored.account.username,'existing_member');assert.equal(restored.account.ateliers[0].canGenerate,true);
  const other=await auth.execute({action:'account.register',username:'other_member',password:'other-password-29'},third);
  await assert.rejects(login(other.token),e=>e.code==='google_conflict');
  const otherGoogle=await login(other.token,{sub:'google-person-two'});assert.equal(otherGoogle.account.username,'other_member');
  // Equal verified emails cannot merge two Google subjects or take over an existing account.
  assert.notEqual(otherGoogle.account.username,linked.account.username);
  await assert.rejects(login(linked.token,{sub:'google-person-three'}),e=>e.code==='google_conflict');
  const passwordLogin=await auth.execute({action:'account.login',username:'existing_member',password:'existing-password-29'},second);assert.equal(passwordLogin.account.googleEmail,'member@gmail.com');
  await auth.execute({action:'account.logout'},restored.token);await assert.rejects(auth.identity(restored.token),e=>e.code==='session_expired');
  const rows=JSON.stringify(await store.listJSON('google-'));assert(!rows.includes('eyJ'));assert(!rows.includes(first));
 }finally{db.close();}
});
test('first Google registration inherits guest membership without creating a password login',async()=>{
 const {auth,store,login}=fixture(),room=await createAtelierService(store)({action:'create',name:'はじめの窓',capacity:2},first);
 const registered=await login();assert.equal(registered.account.ateliers[0].code,room.code);
 await assert.rejects(auth.execute({action:'account.login',username:registered.account.username,password:'anything'},second),e=>e.code==='login_invalid');
 assert.equal((await login(second)).account.username,registered.account.username);
 const disabled=accounts(memoryStore());assert.deepEqual(await disabled.execute({action:'account.google.start'},first),{enabled:false});
 await assert.rejects(disabled.execute({action:'account.google',idToken:'anything'},first),e=>e.code==='google_unavailable');
});
test('concurrent first Google registrations attach one subject to one participant atomically',async()=>{
 const {auth,store,login}=fixture(),results=await Promise.all([login(first),login(second)]);
 assert.equal(results[0].account.username,results[1].account.username);
 assert.equal((await store.listJSON('accounts/')).length,1);assert.equal((await store.listJSON('google-identities/')).length,1);
 assert.equal((await auth.identity(results[0].token)).member,(await auth.identity(results[1].token)).member);
});
