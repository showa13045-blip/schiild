import {createHash} from 'node:crypto';
import {Queue,Worker,QueueEvents,Job} from 'bullmq';
import {utcDay} from './errors.js';
import {Database} from './database.js';
import {DailyGeneration} from './daily.js';
import type {PushSender} from './ports.js';
export const SCHEDULES={generation:{pattern:'0 0 0 * * *',tz:'UTC'},notification:{pattern:'0 15 0 * * *',tz:'UTC'}};
export function precedingDay(timestamp:number){return utcDay(new Date(timestamp-86400000));}
export function redisConnection(url:string){const parsed=new URL(url);return {host:parsed.hostname,port:Number(parsed.port||6379),username:parsed.username||undefined,password:parsed.password||undefined,...(parsed.protocol==='rediss:'?{tls:{}}:{})};}
export async function startWorkers(db:Database,daily:DailyGeneration,push:PushSender,redisUrl:string){
 const connection=redisConnection(redisUrl),queue=new Queue('schiild-daily',{connection}),clock=new Queue('schiild-clock',{connection}),dead=new Queue('schiild-dlq',{connection}),events=new QueueEvents('schiild-daily',{connection});
 await events.waitUntilReady();
 const generationWorker=new Worker('schiild-daily',job=>daily.run(job.data.day,job.data.atelierId),{connection,concurrency:4});
 const worker=new Worker('schiild-clock',async(job:Job)=>{
  const day=job.data.day??precedingDay(job.opts.prevMillis??job.timestamp);
  if(job.name==='generate')return daily.run(day,job.data.atelierId);
  if(job.name==='plan'){
   const ateliers=await db.pool.query('SELECT id AS atelier_id FROM ateliers WHERE archived_at IS NULL');
   const children=await Promise.all(ateliers.rows.map(row=>queue.add('generate',{day,atelierId:row.atelier_id},{jobId:`generate-${day}-${row.atelier_id}`,attempts:4,backoff:{type:'exponential',delay:1000}})));
   await Promise.allSettled(children.map(child=>child.waitUntilFinished(events,14*60000)));
   await queue.add('generate',{day,atelierId:null},{jobId:`generate-${day}-global`,attempts:4,backoff:{type:'exponential',delay:1000}});return;
  }
  if(job.name==='notify'){await daily.notifications(day);await clock.add('deliver',{}, {jobId:`deliver-${day}`,attempts:4,backoff:{type:'exponential',delay:1000}});return;}
  if(job.name==='deliver'){while(await daily.deliver(push)){};}
 },{connection,concurrency:4});
 for(const source of [worker,generationWorker])source.on('failed',(job)=>{if(job&&job.attemptsMade>=(job.opts.attempts??1)){const queueJobId=job['id'];void dead.add('failed',{sourceJobId:queueJobId,name:job.name,data:job.data},{jobId:createHash('sha256').update(String(queueJobId)).digest('hex')}).catch(()=>console.error('dead_letter_write_failed'));}});
 await clock.upsertJobScheduler('utc-generation',SCHEDULES.generation,{name:'plan',data:{},opts:{attempts:4,backoff:{type:'exponential',delay:1000}}});
 await clock.upsertJobScheduler('utc-notification',SCHEDULES.notification,{name:'notify',data:{},opts:{attempts:4,backoff:{type:'exponential',delay:1000}}});
 return {close:async()=>{await worker.close();await generationWorker.close();await events.close();await clock.close();await queue.close();await dead.close();}};
}
