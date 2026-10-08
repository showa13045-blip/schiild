import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {accounts} from '../server/accounts.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {createAtelierService} from '../server/atelier-core.mjs';
import {workerImages} from '../cloudflare/images.mjs';
const first='a'.repeat(64),second='b'.repeat(64),third='c'.repeat(64),password='demo-test-password-29';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){const store=memoryStore();let time=Date.parse('2026-10-08T03:00:00Z');const auth=accounts(store,{now:()=>time});return {store,auth,advance:ms=>time+=ms,async call(action,values={},credential=first){const actor=await auth.identity(credential);return createAtelierService(store,{images:workerImages,now:()=>time,memberForCredential:()=>actor.member})({action,...values},credential);}};}
test('account links existing membership, restores creator on another device, stores only hashes and revokes/expires sessions',async()=>{
 const {auth,store,call,advance}=fixture(),room=await call('create',{name:'アカウントの窓',capacity:2});
 const registered=await auth.execute({action:'account.register',username:'demo_member',name:'あさ',password},first);
 assert.equal(registered.account.ateliers[0].code,room.code);assert.equal(registered.account.ateliers[0].canGenerate,true);
 const saved=JSON.stringify(await store.listJSON('accounts/'));assert(!saved.includes(password));assert(!saved.includes(first));assert(!saved.includes(registered.token));
 const sessionRows=JSON.stringify(await store.listJSON('sessions/'));assert(!sessionRows.includes(registered.token));
 await assert.rejects(auth.identity(first),error=>error.code==='unauthorized');
 const login=await auth.execute({action:'account.login',username:'DEMO_MEMBER',password},second);
 assert.equal((await call('state',{code:room.code},login.token)).canGenerate,true);
 assert.equal((await auth.execute({action:'account.update',name:'よる'},login.token)).account.name,'よる');
 await auth.execute({action:'account.logout'},registered.token);
 await assert.rejects(auth.identity(registered.token),error=>error.code==='session_expired');
 assert.equal((await auth.identity(login.token)).account.name,'よる');
 advance(7*86400000);await assert.rejects(auth.identity(login.token),error=>error.code==='session_expired');
});
test('concurrent registration cannot claim one ID twice or attach one participant to two accounts',async()=>{
 const {auth}=fixture();
 const result=await Promise.allSettled([first,second].map(credential=>auth.execute({action:'account.register',username:'same_name',password},credential)));
 assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(result.find(row=>row.status==='rejected').reason.code,'account_taken');
 const loser=result[0].status==='fulfilled'?second:first;
 const linked=await Promise.allSettled(['name_one','name_two'].map(username=>auth.execute({action:'account.register',username,password},loser)));
 assert.equal(linked.filter(row=>row.status==='fulfilled').length,1);assert.equal(linked.find(row=>row.status==='rejected').reason.code,'account_linked');
});
test('concurrent wrong passwords use an atomic five-attempt window, without revealing unknown IDs',async()=>{
 const {auth,advance}=fixture();await auth.execute({action:'account.register',username:'limited_user',password},first);
 const results=await Promise.allSettled(Array.from({length:8},()=>auth.execute({action:'account.login',username:'limited_user',password:'wrong-password'},second)));
 assert.equal(results.filter(row=>row.reason.code==='login_invalid').length,5);assert.equal(results.filter(row=>row.reason.code==='login_limited').length,3);
 await assert.rejects(auth.execute({action:'account.login',username:'limited_user',password},second),error=>error.code==='login_limited');
 await assert.rejects(auth.execute({action:'account.login',username:'unknown_user',password},second),error=>error.code==='login_invalid');
 advance(600001);assert((await auth.execute({action:'account.login',username:'limited_user',password},second)).token);
});
test('GLOBAL is shared across ateliers/custodians, deduplicates daily participants, updates today and freezes past days',async()=>{
 const {call,store,advance}=fixture(),room=await call('create',{name:'ふたりの窓',capacity:2}),day=room.day;
 const photo=async color=>`data:image/jpeg;base64,${(await sharp({create:{width:1080,height:1080,channels:3,background:color}}).jpeg().toBuffer()).toString('base64')}`;
 const red=await photo('#c39582'),blue=await photo('#87a6b0');
 await call('join',{code:room.code},second);await call('post',{code:room.code,day,photo:red});
 const before=await call('global',{day},third);assert.equal(before.count,1);assert.equal(before.x,undefined);
 const other=await call('create',{name:'もうひとつ',capacity:2});await call('post',{code:other.code,day,photo:blue});
 const same=await call('global',{day});assert.equal(same.count,1);assert.equal(same.ateliers,2);assert.equal(same.x,(await call('global',{day})).x);
 await call('post',{code:room.code,day,photo:blue},second);await call('generate',{code:room.code,day});
 const mine=await call('global',{day}),guest=await call('global',{day},second),viewer=await call('global',{day},third);
 assert.equal(mine.count,2);assert.equal(mine.image,guest.image);assert.equal(mine.image,viewer.image);assert.notEqual(mine.image,before.image);assert.equal(viewer.x,undefined);
 assert.notEqual(mine.y*256+mine.x,guest.y*256+guest.x);
 const bytes=Buffer.from(mine.image.split(',')[1],'base64'),decoded=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,256);
 const pixel=decoded.data.subarray((mine.y*256+mine.x)*4,(mine.y*256+mine.x)*4+3);assert.deepEqual([...pixel],[195,149,130]);
 // Existing days from before the feature are lazily reconstructed from real photos.
 const original=await store.getWithMetadata('globals/'+day);await store.setJSON('globals/'+day,{day,pixels:{},ateliers:[]},{onlyIfMatch:original.etag});assert.equal((await call('global',{day})).image,mine.image);
 advance(86400000);const frozen=await call('global',{day},third);assert.equal(frozen.final,true);assert.equal(frozen.image,mine.image);
 const tomorrow='2026-10-09';await call('post',{code:room.code,day:tomorrow,photo:blue});assert.equal((await call('global',{day})).image,mine.image);
 assert.equal((await call('global',{day:tomorrow})).count,1);
 await assert.rejects(call('global',{day:'2026-02-30'}),error=>error.code==='invalid');await assert.rejects(call('global',{day:'2099-01-01'}),error=>error.code==='invalid');
 assert(!JSON.stringify(await store.listJSON('globals/')).includes(first));assert((await store.getWithMetadata('globals/'+day)).data.pixels[hash(first)]);
});
