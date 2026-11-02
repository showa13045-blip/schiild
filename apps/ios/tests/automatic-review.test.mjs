import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {AUTOMATIC_POLICY_VERSION,IMAGE_CATEGORIES,classifyImageResult,canRetryPhoto,AutomaticReviewError} from '../server/automatic-policy.mjs';
import {readAutomaticConfig,analyzeImage} from '../server/automatic-provider.mjs';
import {automaticJobs,eraseAutomaticReviews} from '../server/automatic-jobs.mjs';
const config={enabled:true,endpoint:'https://test.pickleballnavi.jp/schiild-image-review.cgi',key:'a'.repeat(64)};
const scores=(changes={})=>({model:'OwenElliott/image-safety-classifier-s',revision:'015042b0eab17f1b17f2986527386346fb0d94be',decision:'approved',reasons:[],scores:{gore:.01,sexual:.01,clear:.98},...changes});
function fixture(){
 const db=new DatabaseSync(':memory:');const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
 storage.sql.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');const member='a'.repeat(64);storage.sql.exec('INSERT INTO rooms VALUES(?,?,?)','accounts/test_member',JSON.stringify({member,username:'test_member'}),'1');return {db,storage,member};
}
test('local model scope, uncertain results, signed transport and day boundary are enforced',async()=>{
 assert.equal(classifyImageResult(scores()).decision,'allow');
 assert.deepEqual(classifyImageResult(scores({decision:'rejected',reasons:['sexual'],scores:{gore:.01,sexual:.98,clear:.01}})).reasons,['sexual']);
 assert.deepEqual(classifyImageResult(scores({decision:'rejected',reasons:['uncertain'],scores:{gore:.2,sexual:.2,clear:.6}})).reasons,['uncertain']);
 for(const value of [null,{},scores({revision:'wrong'}),scores({scores:{gore:NaN,sexual:0,clear:1}}),scores({decision:'rejected'})])assert.throws(()=>classifyImageResult(value),e=>e.code==='review_result_invalid');
 assert.equal(canRetryPhoto('2026-11-02',Date.parse('2026-11-02T23:59:59.999Z')),true);assert.equal(canRetryPhoto('2026-11-02',Date.parse('2026-11-03T00:00:00.000Z')),false);
 for(const endpoint of ['http://test.pickleballnavi.jp/schiild-image-review.cgi','https://localhost/','https://test.pickleballnavi.jp.evil.test/schiild-image-review.cgi','https://user@test.pickleballnavi.jp/schiild-image-review.cgi'])assert.equal(readAutomaticConfig({...config,endpoint}),null);
 let sent;const bytes=Buffer.from([255,216,255,217]);
 const result=await analyzeImage(bytes,config,{request:async(url,options)=>{sent=options;const b=JSON.parse(options.body);return Response.json({job_key:b.job_key,image_hash:(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),policy_version:AUTOMATIC_POLICY_VERSION,status:'approved',result:scores()});}});
 assert.equal(result.decision,'allow');assert.equal(sent.redirect,'manual');assert.match(sent.headers['X-Review-Signature'],/^[a-f0-9]{64}$/);assert(!sent.body.includes('member'));assert.equal(JSON.parse(sent.body).image_base64,bytes.toString('base64'));
 await assert.rejects(analyzeImage(bytes,config,{request:async()=>Response.json({}, {status:503})}),e=>e.code==='review_service_failed');
 let redirects=0;await assert.rejects(analyzeImage(bytes,config,{request:async(_url,options)=>{redirects++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://not-an-ai-service.example/'}});}}),e=>e.code==='review_service_failed');assert.equal(redirects,1);
 await assert.rejects(analyzeImage(bytes,config,{request:async()=>{throw Error('network');}}),e=>e.code==='review_transport_failed');
 await assert.rejects(analyzeImage(bytes,config,{request:async()=>Response.json({status:'approved',result:scores()})}),e=>e.code==='review_result_invalid');
});
test('persistent jobs deduplicate one submission, recover decisions without another AI call and enforce leases',async()=>{
 const {db,storage,member}=fixture();let time=Date.parse('2026-11-02T12:00:00Z'),calls=0,applies=0,failApply=true;const scheduled=[];
 const args={storage,config,now:()=>time,schedule:async stamp=>scheduled.push(stamp),loadImage:async()=>Buffer.from([1]),analyze:async()=>{calls++;return classifyImageResult(scores());},applyDecision:async(_job,_result,current)=>{assert(current());applies++;if(failApply)throw Error('temporary');}};
 const jobs=automaticJobs(args),input={member,kind:'photo',source:'b'.repeat(64),objectKey:`photos/${member}/2026-11-02/${'b'.repeat(64)}`,day:'2026-11-02',consentVersion:AUTOMATIC_POLICY_VERSION};
 try{
  await assert.rejects(jobs.enqueue({...input,consentVersion:'old'}),e=>e.code==='review_consent_required');const first=await jobs.enqueue(input);assert.equal((await jobs.enqueue(input)).key,first.key);assert.equal(calls,0);assert(scheduled.length);
  await jobs.drain();assert.equal(calls,1);assert.equal(applies,1);assert.equal(storage.sql.exec('SELECT status FROM automatic_reviews').toArray()[0].status,'decided');
  time+=31000;failApply=false;await jobs.drain();assert.equal(calls,1);assert.equal(applies,2);assert.equal(storage.sql.exec('SELECT status FROM automatic_reviews').toArray()[0].status,'complete');
  const another=await jobs.enqueue({...input,objectKey:input.objectKey.replace('2026-11-02','2026-11-03'),day:'2026-11-03'});assert.notEqual(another.key,first.key);
  let release;const pending=new Promise(resolve=>{release=resolve;});let inFlight=0;const a=automaticJobs({...args,analyze:async()=>{inFlight++;await pending;return classifyImageResult(scores());},applyDecision:async()=>{}});const running=a.drain();await new Promise(resolve=>setImmediate(resolve));await a.drain();assert.equal(inFlight,1);release();await running;
 }finally{db.close();}
});
test('provider errors retain a retryable job and deletion cancels an in-flight verdict',async()=>{
 const {db,storage,member}=fixture();let time=Date.parse('2026-11-02T12:00:00Z'),applied=0,release;
 const args={storage,config,now:()=>time,loadImage:async()=>Buffer.from([1]),applyDecision:async()=>{applied++;}};
 try{
  const first=automaticJobs({...args,analyze:async()=>{throw new AutomaticReviewError('review_rate_limited',60000);}});await first.enqueue({member,kind:'icon',source:'c'.repeat(64),objectKey:'icon-one',consentVersion:AUTOMATIC_POLICY_VERSION});await first.drain();assert.equal(applied,0);const row=storage.sql.exec('SELECT * FROM automatic_reviews').toArray()[0];assert.equal(row.status,'retry');assert(row.available_at>=time+60000);
  time+=60001;const pending=new Promise(resolve=>{release=resolve;});const second=automaticJobs({...args,analyze:async()=>{await pending;return classifyImageResult(scores());}});const work=second.drain();await new Promise(resolve=>setImmediate(resolve));eraseAutomaticReviews(storage,member);storage.sql.exec('DELETE FROM rooms');release();await work;assert.equal(applied,0);assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM automatic_reviews').toArray()[0].n,0);
 }finally{db.close();}
});
