import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportPKCS8,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {appleAccounts} from '../server/apple-accounts.mjs';
import {appleIdentity,appleDigest,sealAppleToken,openAppleToken,readAppleConfig} from '../server/apple-identity.mjs';
const secret={clientId:'app.schiild.mobile',teamId:'ABCDEFGHIJ',keyId:'ABCDEFGHIJ',encryptionKey:'a'.repeat(64)};
test('Apple grant encryption binds the provider subject and rejects tampering',()=>{
 const encrypted=sealAppleToken('test-refresh',secret,'user-a');assert.equal(openAppleToken(encrypted,secret,'user-a'),'test-refresh');assert.throws(()=>openAppleToken(encrypted,secret,'user-b'));
 const bytes=Buffer.from(encrypted,'base64url');bytes[15]^=1;assert.throws(()=>openAppleToken(bytes.toString('base64url'),secret,'user-a'));
 assert.equal(readAppleConfig('{}'),null);
});
test('Apple verifies signature, audience, nonce and exchanged subject, not client assertions',async()=>{
 const signing=await generateKeyPair('RS256'),client=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(signing.publicKey),now=Date.now(),nonce='a'.repeat(64);
 jwk.kid='test';const config={...secret,privateKey:await exportPKCS8(client.privateKey)};
 const token=(sub='subject',aud=config.clientId,n=nonce)=>new SignJWT({nonce:n}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://appleid.apple.com').setAudience(aud).setSubject(sub).setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+300).sign(signing.privateKey);
 const good=await token();let exchanged=good,calls=0;
 const provider=appleIdentity(config,{now:()=>now,jwks:createLocalJWKSet({keys:[jwk]}),fetcher:async(url,options)=>{calls++;assert.equal(url,'https://appleid.apple.com/auth/token');assert.equal(options.body.get('client_id'),config.clientId);return Response.json({id_token:exchanged,refresh_token:'refresh-test'});}});
 assert.equal((await provider.authorize({identityToken:good,code:'code',nonce,createdAt:now})).subject,appleDigest(config.clientId+'/subject'));
 await assert.rejects(provider.authorize({identityToken:await token('subject','wrong-app'),code:'code',nonce,createdAt:now}));assert.equal(calls,1);
 await assert.rejects(provider.authorize({identityToken:good,code:'code',nonce:'wrong',createdAt:now}));
 exchanged=await token('other-user');await assert.rejects(provider.authorize({identityToken:good,code:'code',nonce,createdAt:now}));
});
function scenario(){
 let revision=0,clock=Date.now(),account=null;const records=new Map(),calls=[];
 const credential='1'.repeat(64),subject='b'.repeat(64),store={
  async getWithMetadata(key){return structuredClone(records.get(key));},
  async setJSON(key,data,{onlyIfNew,onlyIfMatch}={}){const row=records.get(key);if(onlyIfNew&&row||onlyIfMatch&&row?.etag!==onlyIfMatch)return {modified:false};records.set(key,{data:structuredClone(data),etag:String(++revision)});return {modified:true};},
  async registerApple(value){if(records.has('apple-identities/'+value.appleSubject))return {modified:false};await store.setJSON('apple-identities/'+value.appleSubject,{username:value.username});await store.setJSON('accounts/'+value.username,value);return {modified:true,account:value};},
  async deleteAccount(value,anonymous,attempts,options){calls.push('delete');assert.equal(options.purgePhotos,true);records.delete('accounts/'+value.username);records.delete('apple-identities/'+value.appleSubject);account=null;return {modified:true};}
 };
 const execute=appleAccounts(store,{config:secret,now:()=>clock,identity:async value=>{if(value!==credential)throw Error('wrong credential');return {member:account?.member??'c'.repeat(64),account};},session:async value=>{account=value;return {token:'d'.repeat(64),account:value};},verify:{authorize:async()=>({subject,refreshToken:'grant'}),revoke:async()=>{calls.push('revoke');}},prepareDeletion:async()=>{calls.push('photos');}});
 async function start(intent,extra={}){return execute({action:'account.apple.start',intent,...extra},credential);}
 async function finish(value,extra={}){return execute({action:'account.apple',state:value.state,code:'code',identityToken:'token',...extra},credential);}
 return {start,finish,calls,records,credential,get account(){return account;},logout(){account=null;},expire(){clock+=300001;}};
}
test('Apple challenges reject replay and expired attempts; login never silently registers',async()=>{
 const s=scenario(),login=await s.start('login');await assert.rejects(s.finish(login),{code:'apple_not_registered'});await assert.rejects(s.finish(login),{code:'apple_expired'});
 const stale=await s.start('register');s.expire();await assert.rejects(s.finish(stale),{code:'apple_expired'});
});
test('Apple deletion revokes, purges original photos and requires fresh explicit registration',async()=>{
 const s=scenario(),created=await s.finish(await s.start('register'),{name:'Example'}),oldMember=created.account.member;
 const deletion=await s.start('delete',{confirmUsername:s.account.username});await s.finish(deletion);assert.deepEqual(s.calls,['revoke','revoke','photos','delete']);assert.equal(s.account,null);
 await assert.rejects(s.finish(await s.start('login')),{code:'apple_not_registered'});
 const fresh=await s.finish(await s.start('register'));assert.notEqual(fresh.account.member,oldMember);assert.notEqual(fresh.account.username,created.account.username);
});
