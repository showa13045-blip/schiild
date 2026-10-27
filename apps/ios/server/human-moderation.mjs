// DEMO ONLY. Private original photos enter a queue, never a public work, before approval.
// Normal and App Review instances use the same queue behavior but separate SQLite data.
import {createHash,randomInt} from 'node:crypto';
import {partition,random} from '../../demo/src/engine.ts';
import {isFreeConcept} from '../../demo/src/concept.ts';
import {workSize} from '../../demo/src/resolution.ts';
import {roomNotificationEvents} from '../../demo/server/notification-events.mjs';
import {overlayApprovedTile} from './moderation-png.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function moderationConfig(value,review=false){let config;try{config=JSON.parse(value??'null');}catch{return null;}if(typeof config?.enabled!=='boolean'||!Array.isArray(config.operators)||!config.operators.length||config.operators.some(name=>typeof name!=='string'||!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(name)))return null;return {...config,operators:review?['review_one']:config.operators};}
export async function moderatorReadiness(store,value,review=false){const config=moderationConfig(value,review);let operatorReady=false;for(const name of config?.operators??[])if((await store.getWithMetadata('accounts/'+name,{type:'json'}))?.data?.member)operatorReady=true;return {enabled:Boolean(config?.enabled),operatorReady};}
function ensureQueue(storage){storage.sql.exec('CREATE TABLE IF NOT EXISTS moderation_queue (queue_key TEXT PRIMARY KEY, member TEXT NOT NULL, day TEXT NOT NULL, target TEXT NOT NULL, photo_key TEXT NOT NULL, source TEXT NOT NULL, slot INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT, reviewer TEXT, UNIQUE(member,day,target))');storage.sql.exec('CREATE INDEX IF NOT EXISTS moderation_queue_status ON moderation_queue(status,created_at,queue_key)');}
export function removeDeletedModeration(storage){ensureQueue(storage);storage.sql.exec("DELETE FROM moderation_queue WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=moderation_queue.member)");
 storage.transactionSync(()=>{for(const row of storage.sql.exec("SELECT key,data,etag FROM rooms WHERE key LIKE 'rooms/%'").toArray()){const room=JSON.parse(row.data);let changed=false;for(const day of Object.values(room.days))for(const [slot,member]of Object.entries(day.pendingSlots??{})){const mapping=storage.sql.exec('SELECT data FROM rooms WHERE key=?','members/'+member).toArray()[0];if(!mapping||JSON.parse(mapping.data).deleted){delete day.pendingSlots[slot];changed=true;}}if(changed)storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(room),String(Number(row.etag)+1),row.key);}});
}
export function humanModeration({store,storage,images,core,globalFactory,ErrorClass,config:value,review=false,now=()=>Date.now(),notifications=false}){
 const config=moderationConfig(value,review),fail=(status,code)=>{throw new ErrorClass(status,code);},today=()=>new Date(now()).toISOString().slice(0,10);
 function rows(query,...args){return storage.sql.exec(query,...args).toArray();}
 function ensure(){ensureQueue(storage);storage.sql.exec("UPDATE moderation_queue SET status='pending' WHERE status='reviewing' AND reviewed_at < ?",new Date(now()-300000).toISOString());}
 const queued=(member,day,target)=>rows('SELECT * FROM moderation_queue WHERE member=? AND day=? AND target=?',member,day,target)[0];
 async function active(member){const mapping=await store.getWithMetadata('members/'+member,{type:'json'}),account=mapping?.data?.username?await store.getWithMetadata('accounts/'+mapping.data.username,{type:'json'}):null;if(!account||account.data.member!==member)fail(401,'account_deleted');return account.data;}
 async function room(code){if(!/^[A-Z0-9]{8}$/.test(code))fail(404,'not_found');const value=await store.getWithMetadata('rooms/'+code,{type:'json'});if(!value)fail(404,'not_found');return value;}
 async function photo(body,actor){
  if(body.sourceCode!==undefined){const source=queued(actor.member,body.day,String(body.sourceCode));if(source&&source.status!=='rejected'){const bytes=await store.get(source.photo_key,{type:'arrayBuffer'});if(!bytes)fail(503,'unavailable');return Buffer.from(bytes);}
   const result=await core({action:'post.photo',sourceCode:body.sourceCode,day:body.day},actor.credential);return Buffer.from(result.photo.split(',')[1],'base64');}
  if(typeof body.photo!=='string'||body.photo.length>4e6||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))fail(400,'image_invalid');try{return await images.normalize(Buffer.from(body.photo.split(',')[1],'base64'));}catch{fail(400,'image_invalid');}
 }
 async function state(body,actor){const result=await core(body,actor.credential),record=queued(actor.member,result.day,result.code);return record&&record.status!=='approved'?{...result,hasPhoto:true,moderationStatus:record.status==='reviewing'?'pending':record.status}:result;}
 async function enqueue(body,actor,target){
  if(body.day!==today())fail(409,'window_closed');const global=target==='GLOBAL';let targetRoom,stateValue,slot=null;
  if(!global){stateValue=await core({action:'state',code:target},actor.credential);targetRoom=(await room(target)).data;slot=targetRoom.members.indexOf(actor.member);if((stateValue.status!=='open'&&!queued(actor.member,body.day,target))||slot<0)fail(409,'window_closed');if((body.sourceCode!==undefined||body.reuse===true)&&!isFreeConcept(stateValue.concept))fail(409,'concept_restricted');}
  const bytes=await photo(body,actor),source=digest(bytes),previous=queued(actor.member,body.day,target);
  if(previous){if(previous.source!==source)fail(409,global?'global_already_recorded':'already_recorded');return previous;}
  if(global){if(await globalFactory(store,{images,now}).has(body.day,actor.member))fail(409,'global_already_recorded');}
  else if(stateValue.hasPhoto)fail(409,'already_recorded');
  const photoKey='photos/'+actor.member+'/'+body.day+'/'+source;await store.set(photoKey,bytes);await active(actor.member);
  const queueKey=digest(actor.member+'/'+body.day+'/'+target),createdAt=new Date(now()).toISOString();
  // Reserve the accepted submission's original slot before someone leaves/rejoins.
  if(!global)for(let attempt=0;attempt<12;attempt++){
   const current=await room(target),next=structuredClone(current.data);for(const day of Object.values(next.days))day.members??=[...next.members];
   if(next.members[slot]!==actor.member)fail(409,'retry');const day=next.days[body.day]??{day:body.day,seed:stateValue.seed,members:[...next.members],posts:{},status:'open',concept:stateValue.concept,outputSize:256};
   if(day.status!=='open'||body.day!==today())fail(409,'window_closed');if(day.posts[slot])fail(409,'already_recorded');day.pendingSlots={...day.pendingSlots,[slot]:actor.member};next.days[body.day]=day;
   if((await store.setJSON('rooms/'+target,next,{onlyIfMatch:current.etag})).modified)break;if(attempt===11)fail(409,'retry');
  }
  storage.transactionSync(()=>{if(body.day!==today())fail(409,'window_closed');const account=rows('SELECT data FROM rooms WHERE key=?','accounts/'+actor.account.username)[0];if(!account||JSON.parse(account.data).member!==actor.member)fail(401,'account_deleted');const existing=queued(actor.member,body.day,target);if(existing&&existing.source!==source)fail(409,global?'global_already_recorded':'already_recorded');if(!existing)storage.sql.exec('INSERT INTO moderation_queue(queue_key,member,day,target,photo_key,source,slot,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)',queueKey,actor.member,body.day,target,photoKey,source,slot,'pending',createdAt);});
  return queued(actor.member,body.day,target);
 }
 async function approve(record,operator){
  await active(record.member);const photo=await store.get(record.photo_key,{type:'arrayBuffer'});if(!photo||digest(Buffer.from(photo))!==record.source)fail(503,'unavailable');
  if(record.target==='GLOBAL'){
   await globalFactory(store,{images,now:()=>Date.parse(record.day+'T12:00:00Z')}).record(record.day,record.member,'moderated',Buffer.from(photo));
   storage.sql.exec("UPDATE moderation_queue SET status='approved',reviewer=?,reviewed_at=? WHERE queue_key=?",operator.member,new Date(now()).toISOString(),record.queue_key);return;
  }
  for(let attempt=0;attempt<12;attempt++){
   const previous=await room(record.target),next=structuredClone(previous.data),day=next.days[record.day];if(!day||(day.members??next.members)[record.slot]!==record.member)fail(409,'moderation_conflict');
   if(day.posts[record.slot]&&day.posts[record.slot]!==record.photo_key)fail(409,'already_recorded');const oldStatus=day.status;if(oldStatus==='generating')fail(409,'retry');day.posts[record.slot]=record.photo_key;if(day.pendingSlots)delete day.pendingSlots[record.slot];
   const rects=partition(next.capacity,random(day.seed)),size=workSize(day),rect=rects.find(rect=>rect.slot===record.slot),key='works/'+next.code+'/'+record.day;
   // Existing announced custodian, seed, index and all other pixels stay unchanged.
   let png;if(oldStatus==='ready'){
    const old=await store.get(key,{type:'arrayBuffer'});if(!old)fail(503,'generation_failed');const tile=await images.compose([rect],async()=>photo,day.seed,size,record.day);png=overlayApprovedTile(old,tile,rect);
   }else if(record.day<today()){
    png=await images.compose(rects,async rect=>{const image=day.posts[rect.slot];return image&&image!=='deleted-photo'?store.get(image,{type:'arrayBuffer'}):null;},day.seed,size,record.day);
    day.status='ready';const contributors=Object.keys(day.posts).map(Number);day.custodian??=(day.members??next.members)[contributors[randomInt(contributors.length)]];day.index??=Object.values(next.days).filter(value=>value.status==='ready').length;day.outputSize=size;
   }
   await active(record.member);const saved=storage.transactionSync(()=>{
    const current=rows('SELECT etag FROM rooms WHERE key=?','rooms/'+next.code)[0];if(current?.etag!==previous.etag)return false;
    const memberRecord=rows('SELECT data FROM rooms WHERE key=?','members/'+record.member)[0];if(!memberRecord||JSON.parse(memberRecord.data).deleted)fail(401,'account_deleted');
    if(png){const name=digest(key)+'.image',bytes=Buffer.from(png);storage.sql.exec('INSERT INTO image_blobs(name,byte_length,sha256) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET byte_length=excluded.byte_length,sha256=excluded.sha256',name,bytes.length,digest(bytes));storage.sql.exec('DELETE FROM image_chunks WHERE name=?',name);for(let offset=0,part=0;offset<bytes.length;offset+=65536,part++)storage.sql.exec('INSERT INTO image_chunks(name,part,bytes) VALUES(?,?,?)',name,part,bytes.subarray(offset,offset+65536));}
    storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(next),String(Number(previous.etag)+1),'rooms/'+next.code);
    if(notifications)for(const event of roomNotificationEvents(previous.data,next,now()))storage.sql.exec('INSERT OR IGNORE INTO rooms(key,data,etag) VALUES(?,?,?)',event.key,JSON.stringify(event.data),'1');
    storage.sql.exec("UPDATE moderation_queue SET status='approved',reviewer=?,reviewed_at=? WHERE queue_key=?",operator.member,new Date(now()).toISOString(),record.queue_key);return true;
   });if(saved)return;
  }fail(409,'retry');
 }
 return {async execute(body,actor,credential){
  if(typeof body.action!=='string')fail(400,'invalid');
  if(value&&!config)fail(503,'unavailable');
  const operator=Boolean(config?.enabled&&config.operators.includes(actor.account?.username));if(body.action==='moderation.capabilities')return {operator,enabled:Boolean(config?.enabled)};
  if(config&&!config.enabled&&['post','reuse','global.record'].includes(body.action))fail(503,'moderation_unavailable');
  if(!config?.enabled)return core(body,credential);ensure();actor={...actor,credential};
  if(body.action.startsWith('moderation.')){
   if(!operator)fail(403,'forbidden');
   if(body.action==='moderation.list'){
    const status=body.status??'pending';if(!['pending','approved','rejected'].includes(status))fail(400,'invalid');let cursor=null;if(body.cursor){if(typeof body.cursor!=='string'||!/^[a-f0-9]{64}$/.test(body.cursor))fail(400,'invalid');cursor=rows('SELECT created_at,queue_key FROM moderation_queue WHERE queue_key=?',body.cursor)[0];if(!cursor)fail(400,'invalid');}
    const records=cursor?rows('SELECT queue_key,day,target,status,created_at,reviewed_at FROM moderation_queue WHERE status=? AND (created_at>? OR (created_at=? AND queue_key>?)) ORDER BY created_at,queue_key LIMIT 26',status,cursor.created_at,cursor.created_at,cursor.queue_key):rows('SELECT queue_key,day,target,status,created_at,reviewed_at FROM moderation_queue WHERE status=? ORDER BY created_at,queue_key LIMIT 26',status);
    return {items:records.slice(0,25).map(row=>({...row,atelier:row.target==='GLOBAL'?'GLOBAL SCHIILD':rows('SELECT data FROM rooms WHERE key=?','rooms/'+row.target).map(value=>JSON.parse(value.data).name)[0]??row.target})),nextCursor:records.length>25?records[24].queue_key:null};
   }
   if(typeof body.queueKey!=='string'||!/^[a-f0-9]{64}$/.test(body.queueKey))fail(400,'invalid');const record=rows('SELECT * FROM moderation_queue WHERE queue_key=?',body.queueKey)[0];if(!record)fail(404,'not_found');
   if(body.action==='moderation.photo'){const bytes=await store.get(record.photo_key,{type:'arrayBuffer'});if(!bytes)fail(404,'not_found');return {photo:'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64')};}
   if(record.status!=='pending')fail(409,'moderation_reviewed');
   if(body.action==='moderation.approve'){
    storage.transactionSync(()=>{if(rows('SELECT status FROM moderation_queue WHERE queue_key=?',record.queue_key)[0]?.status!=='pending')fail(409,'moderation_reviewed');storage.sql.exec("UPDATE moderation_queue SET status='reviewing',reviewed_at=? WHERE queue_key=?",new Date(now()).toISOString(),record.queue_key);});
    try{await approve(record,actor);return {done:true};}catch(error){storage.sql.exec("UPDATE moderation_queue SET status='pending' WHERE queue_key=? AND status='reviewing'",record.queue_key);throw error;}
   }
   if(body.action==='moderation.reject'){storage.sql.exec("UPDATE moderation_queue SET status='rejected',reviewer=?,reviewed_at=? WHERE queue_key=? AND status='pending'",actor.member,new Date(now()).toISOString(),record.queue_key);return {done:true};}
   fail(400,'invalid');
  }
  if(body.action==='post'){await enqueue(body,actor,String(body.code));return state({action:'state',code:body.code},actor);}
  if(body.action==='global.record'){const queued=await enqueue(body,actor,'GLOBAL');return {done:true,day:body.day,moderationStatus:queued.status};}
  if(body.action==='reuse'){if(!Array.isArray(body.codes)||!body.codes.length||body.codes.length>20||new Set(body.codes).size!==body.codes.length)fail(400,'invalid');const results=[];for(const code of body.codes)try{await enqueue({...body,reuse:true},actor,code);results.push({code,done:true});}catch(error){results.push({code,done:false,error:error.code??'unavailable'});}return {day:body.day,results,moderationStatus:'pending'};}
  if(body.action==='post.photo'){const row=queued(actor.member,body.day,String(body.sourceCode));if(row&&row.status==='pending'){const bytes=await store.get(row.photo_key,{type:'arrayBuffer'});if(!bytes)fail(503,'unavailable');return {day:body.day,photo:'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64')};}}
  if(body.action==='state')return state(body,actor);
  if(body.action==='posts'){const result=await core(body,credential),pending=rows("SELECT * FROM moderation_queue WHERE member=? AND day=? AND status<>'approved'",actor.member,result.day);return {...result,sources:[...result.sources,...pending.filter(row=>row.target!=='GLOBAL'&&row.status==='pending'&&!result.sources.some(source=>source.code===row.target)).map(row=>({code:row.target,name:rows('SELECT data FROM rooms WHERE key=?','rooms/'+row.target).map(value=>JSON.parse(value.data).name)[0]??row.target,day:row.day}))],targets:result.targets.map(target=>pending.some(row=>row.target===target.code)?{...target,posted:true}:target),globalRecorded:result.globalRecorded||pending.some(row=>row.target==='GLOBAL')};}
  const result=await core(body,credential);if(body.action==='global'){const row=queued(actor.member,result.day,'GLOBAL');if(row&&row.status!=='approved')return {...result,moderationStatus:row.status};}return result;
 }};
}
