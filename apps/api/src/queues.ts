import {createHash} from 'node:crypto';
import {Queue,Worker,QueueEvents,Job} from 'bullmq';
import {utcDay} from './errors.js';
import {Database} from './database.js';
import {DailyGeneration} from './daily.js';
import type {PushSender} from './ports.js';
export const SCHEDULES={generation:{pattern:'0 0 0 * * *',tz:'UTC'},notification:{pattern:'0 15 0 * * *',tz:'UTC'}};
export function precedingDay(timestamp:number){return utcDay(new Date(timestamp-86400000));}
export function redisConnection(url:string){const parsed=new URL(url);if(!['redis:','rediss:'].includes(parsed.protocol))throw new Error('Invalid Redis URL');const database=Number(parsed.pathname.slice(1)||0);if(!Number.isInteger(database)||database<0)throw new Error('Invalid Redis database');return {db:database,host:parsed.hostname,port:Number(parsed.port||6379),username:parsed.username?decodeURIComponent(parsed.username):undefined,password:parsed.password?decodeURIComponent(parsed.password):undefined,...(parsed.protocol==='rediss:'?{tls:{}}:{})};}
export async function startWorkers(db:Database,daily:DailyGeneration,push:PushSender,redisUrl:string, prefix='schiild'){
 const connection=redisConnection(redisUrl),queue=new Queue(`${prefix}-daily`,{connection}),clock=new Queue(`${prefix}-clock`,{connection}),dead=new Queue(`${prefix}-dlq`,{connection}),events=new QueueEvents(`${prefix}-daily`,{connection});
 await events.waitUntilReady();
 const generationWorker=new Worker(`${prefix}-daily`,job=>daily.run(job.data.day,job.data.atelierId),{connection,concurrency:4});
 const worker=new Worker(`${prefix}-clock`,async(job:Job)=>{
  const day=job.data.day??precedingDay(job.opts.prevMillis??job.timestamp);
  if(job.name==='generate')return daily.run(day,job.data.atelierId);
  if(job.name==='plan'){
   const ateliers=await db.pool.query('SELECT id AS atelier_id FROM ateliers WHERE archived_at IS NULL');
   const children=await Promise.all(ateliers.rows.map(row=>queue.add('generate',{day,atelierId:row.atelier_id},{jobId:`generate-${day}-${row.atelier_id}`,attempts:4,backoff:{type:'exponential',delay:1000}})));
   await Promise.allSettled(children.map(child=>child.waitUntilFinished(events,14*60000)));
   await queue.add('generate',{day,atelierId:null},{jobId:`generate-${day}-global`,attempts:4,backoff:{type:'exponential',delay:1000}});return;
  }
  if(job.name==='notify'){await daily.notifications(day);await clock.add('deliver',{}, {jobId:`deliver-${day}`,attempts:4,backoff:{type:'exponential',delay:1000}});return;}
  if(job.name==='moderation'){while(await daily.deliverModeration(push)){};return;}
  if(job.name==='deliver'){while(await daily.deliver(push)){};}
 },{connection,concurrency:4});
 for(const source of [worker,generationWorker])source.on('failed',(job)=>{if(job&&job.attemptsMade>=(job.opts.attempts??1)){const queueJobId=job['id'];void dead.add('failed',{sourceJobId:queueJobId,name:job.name,data:job.data},{jobId:createHash('sha256').update(String(queueJobId)).digest('hex')}).catch(()=>console.error('dead_letter_write_failed'));}});
 for(const source of [worker,generationWorker])source.on('error',()=>console.error('queue_connection_error'));
 events.on('error',()=>console.error('queue_connection_error'));
 await clock.upsertJobScheduler('moderation-outbox',{every:5000},{name:'moderation',data:{},opts:{attempts:4,backoff:{type:'exponential',delay:1000}}});
 await clock.upsertJobScheduler('utc-generation',SCHEDULES.generation,{name:'plan',data:{},opts:{attempts:4,backoff:{type:'exponential',delay:1000}}});
 await clock.upsertJobScheduler('utc-notification',SCHEDULES.notification,{name:'notify',data:{},opts:{attempts:4,backoff:{type:'exponential',delay:1000}}});
 return {close:async()=>{await worker.close();await generationWorker.close();await events.close();await clock.close();await queue.close();await dead.close();}};
}
