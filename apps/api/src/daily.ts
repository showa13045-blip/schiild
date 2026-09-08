import {randomUUID} from 'node:crypto';
import {Database} from './database.js';
import {draw} from './lottery.js';
import type {Engine,ObjectStore,GenerationInput,PushSender} from './ports.js';
export const GLOBAL_ATELIER='00000000-0000-0000-0000-000000000000';
export class DailyGeneration {
 constructor(private db:Database,private engine:Engine,private store:ObjectStore){}
 async run(day:string,atelierId:string|null){
  const jobKey=`${day}/${atelierId??'global'}`,client=await this.db.pool.connect();
  try {
   // Session lock covers generation; a failed process releases it automatically.
   const lock=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[jobKey]);if(!lock.rows[0].acquired)return {status:'busy'};
   const existing=await client.query('SELECT id FROM schiilds WHERE schiild_date=$1 AND atelier_id IS NOT DISTINCT FROM $2::uuid',[day,atelierId]);if(existing.rowCount)return {status:'existing'};
   await client.query("INSERT INTO generation_jobs(job_key,atelier_id,schiild_date,status,attempts) VALUES($1,$2,$3,'running',1) ON CONFLICT(job_key) DO UPDATE SET status='running',attempts=generation_jobs.attempts+1,updated_at=now()",[jobKey,atelierId,day]);
   const pending=await client.query(atelierId?`SELECT 1 FROM schiils s JOIN schiil_posts p ON p.schiil_id=s.id WHERE p.atelier_id=$1 AND s.schiild_date=$2 AND s.moderation_state='pending' AND s.removed_at IS NULL LIMIT 1`:`SELECT 1 FROM schiils WHERE $1::uuid IS NULL AND schiild_date=$2 AND moderation_state='pending' AND removed_at IS NULL LIMIT 1`,[atelierId,day]);if(pending.rowCount)throw new Error('moderation_pending');
   const records=await client.query(atelierId?`SELECT s.user_id,s.image_key,s.image_sha256,s.bucket_mean,m.slot_index FROM schiils s JOIN schiil_posts p ON p.schiil_id=s.id JOIN atelier_members m ON m.atelier_id=p.atelier_id AND m.user_id=p.user_id WHERE p.atelier_id=$1 AND p.schiild_date=$2 AND s.moderation_state='approved' AND s.removed_at IS NULL ORDER BY m.slot_index`:`SELECT user_id,image_key,image_sha256,bucket_mean FROM schiils WHERE $1::uuid IS NULL AND schiild_date=$2 AND moderation_state='approved' AND removed_at IS NULL ORDER BY user_id`,[atelierId,day]);
   const inputs:GenerationInput[]=records.rows.map((r,n)=>({userId:r.user_id,slotIndex:atelierId?r.slot_index:n,hash:r.image_sha256,imageKey:r.image_key,mean:r.bucket_mean}));
   const capacity=atelierId?(await client.query('SELECT capacity FROM ateliers WHERE id=$1',[atelierId])).rows[0].capacity:Math.max(1,inputs.length);
   const index=Number((await client.query('SELECT count(*)+1 AS next_index FROM schiilds WHERE atelier_id IS NOT DISTINCT FROM $1::uuid',[atelierId])).rows[0].next_index);
   const generated=await this.engine.generate(atelierId??GLOBAL_ATELIER,day,capacity,index,inputs,atelierId===null);
   const lottery=draw(atelierId?inputs.map(p=>p.userId):[]),schiildId=randomUUID(),prefix=`schiilds/${schiildId}/1`;
   await this.store.put(`${prefix}/schiild.png`,generated.image,'image/png');await this.store.put(`${prefix}/thumbnail.png`,generated.thumbnail,'image/png');await this.store.put(`${prefix}/state.json`,generated.state,'application/json');
   await client.query('BEGIN');
   try {
    await client.query(`INSERT INTO schiilds(id,atelier_id,kind,schiild_date,schiild_index,participant_count,capacity_at_gen,fill_rate,algorithm_version,generation_seed,lottery_seed,lottery_order,palette_id,image_key,thumbnail_key,region_map,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'v1.0.0',$9,$10,$11,'schiild_32',$12,$13,$14,$15)`,[schiildId,atelierId,atelierId?'atelier':'global',day,index,inputs.length,capacity,inputs.length/capacity,generated.seed,lottery.seed,JSON.stringify(lottery.order),`${prefix}/schiild.png`,`${prefix}/thumbnail.png`,JSON.stringify(generated.regions),JSON.stringify(generated.metadata)]);
    const first=lottery.order[0]??null;
    await client.query('INSERT INTO schiild_custody(schiild_id,custodian_user_id,lottery_rank) VALUES($1,$2,$3)',[schiildId,first,first?0:null]);
    await client.query('INSERT INTO schiild_custody_events(schiild_id,event_type,user_id,lottery_rank) VALUES($1,$2,$3,$4)',[schiildId,first?'assigned':'returned',first,first?0:null]);
    await client.query("UPDATE generation_jobs SET status='succeeded',error_code=NULL,updated_at=now() WHERE job_key=$1",[jobKey]);await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}
   return {status:'succeeded',schiildId};
  }catch(error){await client.query("UPDATE generation_jobs SET status='failed',error_code='generation_failed',updated_at=now() WHERE job_key=$1",[jobKey]);throw error;}
  finally {await client.query('SELECT pg_advisory_unlock(hashtext($1))',[jobKey]);client.release();}
 }
 async notifications(day:string,at=new Date()){
  if(at.getTime()<new Date(`${day}T00:00:00Z`).getTime()+86400000+900000)throw new Error('notification_window_not_open');
  // One fanout begins at 00:15 UTC; users.timezone never participates.
  await this.db.pool.query(`INSERT INTO notification_outbox(id,user_id,schiild_date,payload)
  SELECT gen_random_uuid(),u.id,$1,jsonb_build_object('type',CASE WHEN EXISTS(
   SELECT 1 FROM atelier_members m WHERE m.user_id=u.id AND m.left_at IS NULL AND NOT EXISTS(SELECT 1 FROM schiilds s WHERE s.atelier_id=m.atelier_id AND s.schiild_date=$1)
  ) THEN 'generation_failed' ELSE 'daily_ready' END,'schiildDate',$1::text)
  FROM users u WHERE u.deleted_at IS NULL ON CONFLICT(user_id,schiild_date) DO NOTHING`,[day]);
 }
 async deliverModeration(push:PushSender){
  return this.db.transaction(async c=>{
   const rows=await c.query('SELECT o.schiil_id,o.user_id,o.reason,s.schiild_date::text FROM moderation_outbox o JOIN schiils s ON s.id=o.schiil_id WHERE o.delivered_at IS NULL ORDER BY o.created_at LIMIT 100 FOR UPDATE OF o SKIP LOCKED');
   for(const row of rows.rows){
    const devices=await c.query('SELECT token FROM push_devices WHERE user_id=$1 AND enabled',[row.user_id]);
    for(const device of devices.rows)await push.send(device.token,{type:'moderation_excluded',schiilId:row.schiil_id,schiildDate:row.schiild_date,reason:row.reason,titleKey:'push.excluded.title',bodyKey:'push.excluded.body'});
    await c.query('UPDATE moderation_outbox SET delivered_at=now() WHERE schiil_id=$1',[row.schiil_id]);
   }
   return rows.rowCount;
  });
 }
 async deliver(push:PushSender){
  return this.db.transaction(async c=>{const rows=await c.query('SELECT id AS notification_id,user_id,payload FROM notification_outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED');
   for(const row of rows.rows){const devices=await c.query('SELECT token FROM push_devices WHERE user_id=$1 AND enabled',[row.user_id]);for(const device of devices.rows)await push.send(device.token,row.payload);await c.query('UPDATE notification_outbox SET delivered_at=now() WHERE id=$1',[row.notification_id]);}return rows.rowCount;
  });
 }
}
