import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Queue,QueueEvents} from 'bullmq';
import {startWorkers,redisConnection} from '../dist/queues.js';
test('real Redis: independent notification queue, retries, DLQ and UTC schedulers',{skip:!process.env.REDIS_URL,timeout:30000},async()=>{
 const prefix='schiild-test-'+randomUUID(),connection=redisConnection(process.env.REDIS_URL);
 const queue=new Queue(`${prefix}-daily`,{connection}),clock=new Queue(`${prefix}-clock`,{connection}),dead=new Queue(`${prefix}-dlq`,{connection});
 const events=new QueueEvents(`${prefix}-daily`,{connection}),clockEvents=new QueueEvents(`${prefix}-clock`,{connection});await events.waitUntilReady();await clockEvents.waitUntilReady();
 let release;const gate=new Promise(resolve=>{release=resolve;});let started=0,attempts=0,notified=0;
 const daily={run:async(_day,atelier)=>{if(atelier==='blocked'){started++;await gate;return {status:'succeeded'};}if(atelier==='broken'){attempts++;throw Error('forced');}return {status:'succeeded'};},notifications:async()=>{notified++;},deliver:async()=>0,deliverModeration:async()=>0};
 const workers=await startWorkers({pool:{query:async()=>({rows:[]})}},daily,{send:async()=>{}},process.env.REDIS_URL,prefix);
 try{
  const schedules=await clock.getJobSchedulers();assert(schedules.some(s=>s.key==='utc-generation'&&s.pattern==='0 0 0 * * *'&&s.tz==='UTC'));assert(schedules.some(s=>s.key==='utc-notification'&&s.pattern==='0 15 0 * * *'&&s.tz==='UTC'));
  const blocked=await Promise.all(Array.from({length:4},(_,n)=>queue.add('generate',{day:'2030-01-01',atelierId:'blocked'},{jobId:`blocked-${n}`})));
  for(let n=0;n<100&&started<4;n++)await delay(20);assert.equal(started,4);
  const notice=await clock.add('notify',{day:'2030-01-01'});await notice.waitUntilFinished(clockEvents,5000);assert.equal(notified,1);
  release();await Promise.all(blocked.map(job=>job.waitUntilFinished(events,5000)));
  const failure=await queue.add('generate',{day:'2030-01-01',atelierId:'broken'},{jobId:'failure',attempts:4,backoff:{type:'fixed',delay:10}});
  await assert.rejects(failure.waitUntilFinished(events,5000));assert.equal(attempts,4);
  for(let n=0;n<100 && await dead.getWaitingCount()===0;n++)await delay(20);
  assert.equal(await dead.getWaitingCount(),1);
 }finally{
  release();await workers.close();await events.close();await clockEvents.close();
  // Only test-owned queues with the generated prefix are removed.
  for(const q of [queue,clock,dead]){await q.obliterate({force:true});await q.close();}
 }
});
