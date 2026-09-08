import { createHash,randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { SchiilId } from '@schiild/shared/types';
import type pg from 'pg';
import { ApiError,utcDay,uuid } from './errors.js';
import { Database } from './database.js';
import type { ObjectStore,Moderator,Engine } from './ports.js';
export class Posting {
 constructor(private db: Database,private store: ObjectStore,private moderator: Moderator,private engine: Engine,private now=()=>new Date()) {}
 async memberships(client: pg.PoolClient,userId: string,atelierIds: string[]) {
  if(!atelierIds.length) throw new ApiError(400,'invalid_request');
  const rows=await client.query(`SELECT m.atelier_id FROM atelier_members m JOIN ateliers a ON a.id=m.atelier_id WHERE m.user_id=$1 AND m.atelier_id=ANY($2::uuid[]) AND m.left_at IS NULL AND a.archived_at IS NULL FOR SHARE OF m,a`,[userId,atelierIds]);
  if(rows.rowCount!==atelierIds.length) throw new ApiError(403,'atelier_access_denied');
 }
 parseAteliers(value: unknown): string[] {
  if(typeof value==='string') { try { value=JSON.parse(value); } catch { throw new ApiError(400,'invalid_request'); } }
  if(!Array.isArray(value)) throw new ApiError(400,'invalid_request');
  return [...new Set(value.map(uuid))].sort();
 }
 async create(userId:string,bytes:Buffer|undefined,atelierValue:unknown,captionValue:unknown) {
  const at=this.now(), day=utcDay(at), ateliers=this.parseAteliers(atelierValue);
  if(captionValue!==undefined && (typeof captionValue!=='string' || [...captionValue].length>50)) throw new ApiError(400,'invalid_request');
  return this.db.transaction(async client=>{
   // Serialize submissions by user. Recheck after acquiring the lock.
   await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
   const existing=await client.query('SELECT id AS schiil_id FROM schiils WHERE user_id=$1 AND schiild_date=$2',[userId,day]);
   if(existing.rowCount) throw new ApiError(409,'already_posted',{copyKey:'error.already_posted',schiilId:existing.rows[0].schiil_id,action:{method:'POST',href:`/v1/schiils/${existing.rows[0].schiil_id}/posts`}});
   await this.memberships(client,userId,ateliers);
   if(!bytes) throw new ApiError(400,'invalid_image');
   let clean:Buffer;
   try {
    const meta=await sharp(bytes,{limitInputPixels:1080*1080}).metadata();
    if(meta.format!=='jpeg'||meta.width!==1080||meta.height!==1080) throw new Error('dimensions');
    clean=await sharp(bytes,{limitInputPixels:1080*1080}).jpeg({quality:85}).toBuffer();
   } catch { throw new ApiError(400,'invalid_image'); }
   const moderation=await this.moderator.review(clean);
   const mean=await this.engine.prepare(clean);
   if(utcDay(this.now())!==day) throw new ApiError(409,'window_closed',{copyKey:'error.window_closed'});
   const schiilId=randomUUID() as SchiilId, key=`schiils/${schiilId}.jpg`,hash=createHash('sha256').update(clean).digest('hex');
   await this.store.put(key,clean,'image/jpeg');
   try {
    if(utcDay(this.now())!==day)throw new ApiError(409,'window_closed',{copyKey:'error.window_closed'});
    await client.query(`INSERT INTO schiils(id,user_id,schiild_date,image_key,image_sha256,caption,moderation_state,created_at,bucket_mean,moderation_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[schiilId,userId,day,key,hash,captionValue??null,moderation.decision,at,mean,moderation.decision==='rejected'?moderation.reason:null]);
    if(moderation.decision==='rejected')await client.query('INSERT INTO moderation_outbox(schiil_id,user_id,reason) VALUES($1,$2,$3)',[schiilId,userId,moderation.reason]);
    for(const atelierId of ateliers) await client.query('INSERT INTO schiil_posts(id,schiil_id,atelier_id,user_id,schiild_date,posted_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),schiilId,atelierId,userId,day,at]);
   } catch(error) { await this.store.remove(key).catch(()=>{});throw error; }
   await client.query("SELECT pg_notify('schiild_live',$1)",[JSON.stringify(ateliers)]);
   return {schiilId,schiildDate:day,atelierIds:ateliers,moderation};
  });
 }
 async add(userId:string,schiilId:SchiilId,atelierValue:unknown) {
  const at=this.now(),day=utcDay(at),ateliers=this.parseAteliers(atelierValue);
  return this.db.transaction(async client=>{
   const photo=await client.query('SELECT user_id,schiild_date::text,removed_at FROM schiils WHERE id=$1 FOR UPDATE',[schiilId]);
   if(!photo.rowCount||photo.rows[0].user_id!==userId) throw new ApiError(404,'not_found');
   if(photo.rows[0].schiild_date!==day||photo.rows[0].removed_at) throw new ApiError(409,'window_closed',{copyKey:'error.window_closed'});
   await this.memberships(client,userId,ateliers);
   for(const atelierId of ateliers) await client.query('INSERT INTO schiil_posts(id,schiil_id,atelier_id,user_id,schiild_date,posted_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(atelier_id,user_id,schiild_date) DO NOTHING',[randomUUID(),schiilId,atelierId,userId,day,at]);
   await client.query("SELECT pg_notify('schiild_live',$1)",[JSON.stringify(ateliers)]);
   return {schiilId,schiildDate:day,atelierIds:ateliers};
  });
 }
}
