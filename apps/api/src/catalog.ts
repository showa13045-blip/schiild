import {randomUUID,randomBytes} from 'node:crypto';
import type {SchiildId} from '@schiild/shared/types';
import {Database} from './database.js';
import {ApiError,dayWindow,utcDay,uuid} from './errors.js';
import type {Engine} from './ports.js';
export class Catalog {
 constructor(private db:Database,private engine:Engine,private now=()=>new Date()){}
 async member(userId:string,atelierId:string) {
  const r=await this.db.pool.query('SELECT 1 FROM atelier_members WHERE atelier_id=$1 AND user_id=$2 AND left_at IS NULL',[atelierId,userId]);
  if(!r.rowCount)throw new ApiError(403,'atelier_access_denied');
 }
 async ateliers(userId:string){return (await this.db.pool.query('SELECT a.id AS atelier_id,a.name,a.capacity,a.cover_schiild_id FROM ateliers a JOIN atelier_members m ON m.atelier_id=a.id WHERE m.user_id=$1 AND m.left_at IS NULL AND a.archived_at IS NULL ORDER BY a.created_at,a.id',[userId])).rows;}
 async create(userId:string,name:unknown,capacity:unknown){
  if(typeof name!=='string'||!name.trim()||![2,5,12,20].includes(Number(capacity)))throw new ApiError(400,'invalid_request');
  return this.db.transaction(async c=>{
   const u=await c.query('SELECT verification_tier FROM users WHERE id=$1 FOR UPDATE',[userId]);if(u.rows[0]?.verification_tier<1)throw new ApiError(403,'verification_required');
   const atelierId=randomUUID();await c.query('INSERT INTO ateliers(id,name,capacity,invite_code,created_by) VALUES($1,$2,$3,$4,$5)',[atelierId,name.trim(),Number(capacity),randomBytes(12).toString('hex'),userId]);
   await c.query("INSERT INTO atelier_members(atelier_id,user_id,role,slot_index) VALUES($1,$2,'creator',0)",[atelierId,userId]);
   return (await c.query('SELECT id AS atelier_id,name,capacity,invite_code FROM ateliers WHERE id=$1',[atelierId])).rows[0];
  });
 }
 async join(userId:string,code:unknown){
  if(typeof code!=='string')throw new ApiError(400,'invalid_request');
  return this.db.transaction(async c=>{
   const found=await c.query('SELECT id AS atelier_id,capacity FROM ateliers WHERE invite_code=$1 AND archived_at IS NULL FOR UPDATE',[code]);if(!found.rowCount)throw new ApiError(404,'not_found',{copyKey:'join.error.not_found'});
   const a=found.rows[0],people=await c.query('SELECT user_id,slot_index FROM atelier_members WHERE atelier_id=$1 AND left_at IS NULL',[a.atelier_id]);
   if(people.rows.some(p=>p.user_id===userId))throw new ApiError(409,'already_joined',{copyKey:'join.error.already'});
   if(people.rowCount===a.capacity)throw new ApiError(409,'atelier_full',{copyKey:'join.error.full'});
   const slots=new Set(people.rows.map(p=>p.slot_index));let slot=0;while(slots.has(slot))slot++;
   await c.query("INSERT INTO atelier_members(atelier_id,user_id,role,slot_index) VALUES($1,$2,'member',$3) ON CONFLICT(atelier_id,user_id) DO UPDATE SET left_at=NULL,joined_at=now(),slot_index=$3",[a.atelier_id,userId,slot]);return {atelierId:a.atelier_id};
  });
 }
 async today(userId:string,atelierId:string){
  await this.member(userId,atelierId);const day=utcDay(this.now());
  const a=(await this.db.pool.query('SELECT capacity FROM ateliers WHERE id=$1',[atelierId])).rows[0];
  const posts=await this.db.pool.query('SELECT m.slot_index,s.image_sha256 FROM schiil_posts p JOIN schiils s ON s.id=p.schiil_id JOIN atelier_members m ON m.atelier_id=p.atelier_id AND m.user_id=p.user_id WHERE p.atelier_id=$1 AND p.schiild_date=$2 AND s.removed_at IS NULL',[atelierId,day]);
  const rects=await this.engine.layout(atelierId,day,posts.rows.map(p=>p.image_sha256),a.capacity),occupied=new Set(posts.rows.map(p=>p.slot_index));
  return {schiildDate:day,window:dayWindow(day),provisional:true,capacity:a.capacity,recordedCount:posts.rowCount,tiles:rects.map((rect,n)=>({rect,recorded:occupied.has(n)}))};
 }
 async cover(userId:string,atelierId:string,work:unknown){
  await this.member(userId,atelierId);
  return this.db.transaction(async c=>{
   await c.query('SELECT id FROM ateliers WHERE id=$1 FOR UPDATE',[atelierId]);
   if(work===null){const role=await c.query('SELECT role FROM atelier_members WHERE atelier_id=$1 AND user_id=$2',[atelierId,userId]);if(!['creator','moderator'].includes(role.rows[0]?.role))throw new ApiError(403,'forbidden');}
   else {const found=await c.query('SELECT 1 FROM schiild_custody c JOIN schiilds s ON s.id=c.schiild_id WHERE s.id=$1 AND s.atelier_id=$2 AND c.custodian_user_id=$3 FOR UPDATE OF c',[uuid(work),atelierId,userId]);if(!found.rowCount)throw new ApiError(403,'forbidden');}
   await c.query('UPDATE ateliers SET cover_schiild_id=$1,cover_set_by=$2,cover_set_at=now() WHERE id=$3',[work,userId,atelierId]);return {atelierId,schiildId:work};
  });
 }
 async list(userId:string,atelierId:string,cursor:unknown){await this.member(userId,atelierId);if(cursor!==undefined && (typeof cursor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(cursor)))throw new ApiError(400,'invalid_request');return (await this.db.pool.query('SELECT id AS schiild_id,schiild_date::text,metadata FROM schiilds WHERE atelier_id=$1 AND ($2::date IS NULL OR schiild_date<$2::date) ORDER BY schiild_date DESC LIMIT 20',[atelierId,cursor??null])).rows;}
 async detail(schiildId:SchiildId){const r=await this.db.pool.query('SELECT s.id AS schiild_id,s.schiild_date::text,s.metadata,s.region_map,c.custodian_user_id,s.image_key,s.thumbnail_key FROM schiilds s LEFT JOIN schiild_custody c ON c.schiild_id=s.id WHERE s.id=$1',[schiildId]);if(!r.rowCount)throw new ApiError(404,'not_found');return r.rows[0];}
 async lottery(schiildId:SchiildId){const r=await this.db.pool.query('SELECT lottery_seed,lottery_order FROM schiilds WHERE id=$1',[schiildId]);if(!r.rowCount)throw new ApiError(404,'not_found');return {...r.rows[0],algorithm:'hmac-sha256-counter-fisher-yates-v1'};}
 async decline(userId:string,schiildId:SchiildId){return this.db.transaction(async c=>{
  const found=await c.query('SELECT c.custodian_user_id,c.lottery_rank,s.lottery_order FROM schiild_custody c JOIN schiilds s ON s.id=c.schiild_id WHERE c.schiild_id=$1 FOR UPDATE OF c',[schiildId]);if(!found.rowCount)throw new ApiError(404,'not_found');const row=found.rows[0];if(row.custodian_user_id!==userId)throw new ApiError(409,'not_custodian');
  const rank=row.lottery_rank+1, next=row.lottery_order[rank]??null;
  await c.query("INSERT INTO schiild_custody_events(schiild_id,event_type,user_id,lottery_rank) VALUES($1,'declined',$2,$3)",[schiildId,userId,row.lottery_rank]);
  await c.query('UPDATE schiild_custody SET custodian_user_id=$2,lottery_rank=$3,assigned_at=now(),declined_count=declined_count+1 WHERE schiild_id=$1',[schiildId,next,next?rank:null]);
  await c.query('INSERT INTO schiild_custody_events(schiild_id,event_type,user_id,lottery_rank) VALUES($1,$2,$3,$4)',[schiildId,next?'promoted':'returned',next,next?rank:null]);return {schiildId,custodianUserId:next};
 });}
 async custody(userId:string){return (await this.db.pool.query('SELECT s.id AS schiild_id,s.schiild_date::text,s.metadata FROM schiild_custody c JOIN schiilds s ON s.id=c.schiild_id WHERE c.custodian_user_id=$1 ORDER BY s.schiild_date DESC LIMIT 20',[userId])).rows;}
 async global(day:string,userId?:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new ApiError(400,'invalid_request');const r=await this.db.pool.query("SELECT id AS schiild_id,region_map FROM schiilds WHERE kind='global' AND schiild_date=$1",[day]);if(!r.rowCount)throw new ApiError(404,'not_found');return userId?{rect:r.rows[0].region_map.find((p:{user_id:string})=>p.user_id===userId)?.rect??null}:this.detail(r.rows[0].schiild_id as SchiildId);}
}
