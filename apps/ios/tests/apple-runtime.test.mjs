// Optional local workerd integration, never contacts production accounts or Apple.
import {POSTING_POLICY_VERSION} from '../server/posting-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../../demo/package.json',import.meta.url));
const stage=process.env.IOS_APPLE_STAGE;
test('deployed-revision bridge registers, posts, revokes and erases an Apple account in durable SQLite',{skip:!stage},async()=>{
 const {generateKeyPair,exportPKCS8,exportJWK,SignJWT}=await import(pathToFileURL(require.resolve('jose')).href);
 const wrangler=createRequire(realpathSync(require.resolve('wrangler/package.json'))),{Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(wrangler.resolve('miniflare')).href);
 const sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
 const apple=await generateKeyPair('RS256'),client=await generateKeyPair('ES256',{extractable:true}),publicKey=await exportJWK(apple.publicKey);publicKey.kid='runtime';
 const config={clientId:'app.schiild.mobile',teamId:'ABCDEFGHIJ',keyId:'ABCDEFGHIJ',privateKey:await exportPKCS8(client.privateKey),encryptionKey:'a'.repeat(64)};
 let grantToken='',revocations=0;
 const outbound=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://appleid.apple.com');
  if(url.pathname==='/auth/keys')return Response.json({keys:[publicKey]},{headers:{'Cache-Control':'public, max-age=3600'}});
  if(url.pathname==='/auth/token')return Response.json({id_token:grantToken,refresh_token:'runtime-refresh'});
  if(url.pathname==='/auth/revoke'){revocations++;return new Response(null,{status:200});}
  throw Error('Unexpected external request');
 };
 let mf;
 if(process.env.IOS_APPLE_RUNTIME==='node'){
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export class DurableObject { constructor(ctx,env){ this.ctx=ctx; this.env=env; } }',shortCircuit:true};return next(specifier,context);}});
  const fetchBefore=globalThis.fetch;globalThis.fetch=async(input,options)=>outbound(new Request(input,options));
  const runtime=await import(pathToFileURL(stage+'/runtime.mjs').href),db=new DatabaseSync(':memory:');let alarm=null;
  const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(callback){db.exec('BEGIN');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},async getAlarm(){return alarm;},async setAlarm(value){alarm=value;}};
  const env={IMAGE_BACKEND:'durable-sqlite',ALLOWED_ORIGINS:'https://schiild.app',APPLE_LOGIN_CONFIG:JSON.stringify(config)};
  const instance=new runtime.AtelierDirectory({storage},env);env.ATELIERS={idFromName:()=>1,get:()=>instance};
  mf={database:db,dispatchFetch:async(url,options)=>runtime.default.fetch(new Request(url,options),env,{waitUntil(){}}),dispose:async()=>{globalThis.fetch=fetchBefore;hook.deregister();db.close();}};
 }else mf=new Miniflare(convertV4MiniflareOptions({name:'schiild-ios-test',scriptPath:stage+'/runtime.mjs',modules:true,compatibilityDate:'2026-10-08',compatibilityFlags:['nodejs_compat'],durableObjects:{ATELIERS:{className:'AtelierDirectory',useSQLite:true}},bindings:{IMAGE_BACKEND:'durable-sqlite',ALLOWED_ORIGINS:'https://schiild.app',APPLE_LOGIN_CONFIG:JSON.stringify(config)},outboundService:outbound}));
 async function call(action,values={},credential='1'.repeat(64),expected=200){const response=await mf.dispatchFetch('https://schiild.app/api/atelier',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify({action,...values,...(['post','reuse','global.record'].includes(action)?{policyVersion:POSTING_POLICY_VERSION}:{})})});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;}
 async function authenticate(intent,credential='1'.repeat(64),extra={},expected=200){
  const challenge=await call('account.apple.start',{intent,...extra},credential);
  grantToken=await new SignJWT({nonce:challenge.nonce}).setProtectedHeader({alg:'RS256',kid:'runtime'}).setIssuer('https://appleid.apple.com').setAudience(config.clientId).setSubject('runtime-apple-person').setIssuedAt().setExpirationTime('5m').sign(apple.privateKey);
  return call('account.apple',{state:challenge.state,code:'runtime-code',identityToken:grantToken,name:'Example'},credential,expected);
 }
 try{
  assert.deepEqual(await call('account.apple.config'),{enabled:true});
  const first=await authenticate('register');assert.equal(first.account.appleLinked,true);assert.equal(first.account.lineLinked,undefined);assert.equal(first.account.whatsappLinked,undefined);assert.equal(first.account.canDelete,true);
  const room=await call('create',{name:'Window',capacity:2},first.token);await call('visibility.update',{code:room.code,visibility:'public'},first.token);
  const photo='data:image/jpeg;base64,'+(await sharp({create:{width:1080,height:1080,channels:3,background:'#d96a3b'}}).jpeg().toBuffer()).toString('base64');
  await call('post',{code:room.code,day:room.day,photo},first.token);await call('global.record',{sourceCode:room.code,day:room.day},first.token);
  const art=await call('generate',{code:room.code,day:room.day},first.token);assert(art.status==='ready');
  const originalPhotoNames=mf.database?.prepare('SELECT name FROM photo_members').all()??[];
  if(mf.database)assert.equal(originalPhotoNames.length,1);
  assert.equal((await call('account.me',{},first.token)).account.ateliers.length,1);
  const deletion=await authenticate('delete',first.token,{confirmUsername:first.account.username});assert.equal(deletion.deleted,true);assert.equal(revocations,2);
  if(mf.database){
   assert.equal(mf.database.prepare('SELECT COUNT(*) AS total FROM photo_members').get().total,0);
   for(const {name} of originalPhotoNames)assert.equal(mf.database.prepare('SELECT COUNT(*) AS total FROM image_blobs WHERE name = ?').get(name).total,0);
   const workName=createHash('sha256').update('works/'+room.code+'/'+room.day).digest('hex')+'.image';
   assert.equal(mf.database.prepare('SELECT COUNT(*) AS total FROM image_blobs WHERE name = ?').get(workName).total,1);
   assert.equal(mf.database.prepare("SELECT COUNT(*) AS total FROM rooms WHERE key LIKE 'apple-identities/%'").get().total,0);
   assert.equal(mf.database.prepare('SELECT COUNT(*) AS total FROM rooms WHERE key = ?').get('accounts/'+first.account.username).total,0);
  }
  assert.equal((await call('account.me',{},first.token,401)).error,'account_deleted');
  assert.equal((await authenticate('login','2'.repeat(64),{},401)).error,'apple_not_registered');
  const fresh=await authenticate('register','3'.repeat(64));assert.notEqual(fresh.account.username,first.account.username);assert.deepEqual(fresh.account.ateliers,[]);
  assert.equal((await call('area',{},fresh.token)).global.pixels,0);
  const global=await call('global',{day:room.day},fresh.token);assert(global.image);assert.equal(global.area.pixels,0);
 }finally{await mf.dispose();}
});
