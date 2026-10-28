// DEMO/iOS ONLY. Personal visibility preferences never alter a shared artwork.
import {createHash,randomBytes} from 'node:crypto';
import {partition,random,voidColor} from '../../demo/src/engine.ts';
import {compactGlobal} from '../../demo/src/global-layout.ts';
import {workSize} from '../../demo/src/resolution.ts';
import {overlayApprovedTile} from './moderation-png.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function schema(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS personal_blocks (block_key TEXT PRIMARY KEY, viewer_member TEXT NOT NULL, target_member TEXT NOT NULL, target TEXT NOT NULL, day TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(viewer_member,target_member))');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS personal_blocks_viewer ON personal_blocks(viewer_member,created_at,block_key)');
}
// Call inside the existing deletion transaction, before its anonymous rewrite.
// Only the anonymous shared-record reference survives; the old identity does not.
export function erasePersonalBlocks(storage,member,anonymousMember){
 schema(storage);
 storage.sql.exec('DELETE FROM personal_blocks WHERE viewer_member=?',member);
 storage.sql.exec('UPDATE personal_blocks SET target_member=? WHERE target_member=?',anonymousMember,member);
}
export function personalBlocks({store,storage,images,core,ErrorClass,now=()=>Date.now()}){
 schema(storage);const rows=(query,...args)=>storage.sql.exec(query,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);};
 const blocks=actor=>actor?.account?rows('SELECT * FROM personal_blocks WHERE viewer_member=? ORDER BY block_key',actor.member):[];
 function assertLive(actor){if(!actor?.account)fail(401,'unauthorized');const row=rows('SELECT data FROM rooms WHERE key=?','accounts/'+actor.account.username)[0];if(!row||JSON.parse(row.data).member!==actor.member)fail(401,'account_deleted');}
 const roomRecord=(target,day)=>{const row=rows('SELECT data FROM rooms WHERE key=?','rooms/'+target)[0],room=row?JSON.parse(row.data):null;return {room,record:room?.days[day]};};
 function globalRecord(day){const row=rows('SELECT data FROM rooms WHERE key=?','globals/'+day)[0],record=row?JSON.parse(row.data):null;if(!record)return null;const removed=rows('SELECT source,order_key FROM removed_schiils WHERE target=? AND day=?','GLOBAL',day),visible=Object.fromEntries(Object.entries(record.pixels).filter(([,pixel])=>!removed.some(item=>item.source===pixel.source&&item.order_key===pixel.orderKey)));return {record,layout:compactGlobal(visible)};}
 function memberAt(target,day,item){
  if(target!=='GLOBAL'){const {room,record}=roomRecord(target,day),rect=record&&partition(room.capacity,random(record.seed)).find(rect=>rect.x===item.x&&rect.y===item.y&&rect.w===item.w&&rect.h===item.h);return rect?(record.members??room.members)[rect.slot]:null;}
  const data=globalRecord(day);return data?.layout.pixels.find(pixel=>pixel.position===item.y*data.layout.outputSize+item.x)?.member??null;
 }
 const hidden=(list,member)=>Boolean(member&&list.some(item=>item.target_member===member));
 async function maskAtelier(image,target,day,list){
  if(!image||!list.length)return image;const {room,record}=roomRecord(target,day);if(!record)return image;
  const rects=partition(room.capacity,random(record.seed)).filter(rect=>record.posts[rect.slot]&&hidden(list,(record.members??room.members)[rect.slot]));if(!rects.length)return image;
  let result=Buffer.from(image.split(',')[1],'base64');for(const rect of rects){const blank=await images.compose([rect],async()=>null,record.seed,workSize(record),day);result=overlayApprovedTile(result,blank,rect);}return 'data:image/png;base64,'+result.toString('base64');
 }
 const revision=(base,list)=>base&&list.length?hash(base+'\n'+JSON.stringify(list.map(item=>[item.block_key,item.target_member]))):base;
 async function maskGlobal(result,list){
  if(!list.length||!result.image)return result;const data=globalRecord(result.day);if(!data)fail(409,'retry');
  const pixels=data.layout.pixels.map(pixel=>hidden(list,pixel.member)?{...pixel,color:voidColor(pixel.position%data.layout.outputSize,Math.floor(pixel.position/data.layout.outputSize),0,result.day)}:pixel);
  if(pixels.some((pixel,index)=>pixel!==data.layout.pixels[index]))result.image='data:image/png;base64,'+Buffer.from(await images.global(pixels,data.layout.outputSize,result.day)).toString('base64');
  result.layoutRevision=revision(result.layoutRevision,list);
  if(result.artworks)result.artworks=await Promise.all(result.artworks.map(async item=>({...item,image:await maskAtelier(item.image,item.code,item.day,list)})));
  return result;
 }
 async function execute(body,actor,credential){
  const action=body.action;if(actor?.account)assertLive(actor);
  if(typeof action==='string'&&action.startsWith('blocks.')){
   assertLive(actor);
   if(action==='blocks.list'){
    let cursor=null;if(body.cursor!==undefined&&body.cursor!==null){if(typeof body.cursor!=='string'||!/^[a-f0-9]{32}$/.test(body.cursor))fail(400,'invalid');cursor=rows('SELECT created_at,block_key FROM personal_blocks WHERE viewer_member=? AND block_key=?',actor.member,body.cursor)[0];if(!cursor)fail(400,'invalid');}
    const list=cursor?rows('SELECT * FROM personal_blocks WHERE viewer_member=? AND (created_at>? OR (created_at=? AND block_key>?)) ORDER BY created_at,block_key LIMIT 26',actor.member,cursor.created_at,cursor.created_at,cursor.block_key):rows('SELECT * FROM personal_blocks WHERE viewer_member=? ORDER BY created_at,block_key LIMIT 26',actor.member);
    return {items:list.slice(0,25).map(item=>({key:item.block_key,target:item.target,day:item.day,x:item.x+1,y:item.y+1,createdAt:item.created_at})),nextCursor:list.length>25?list[24].block_key:null};
   }
   if(action==='blocks.remove')return storage.transactionSync(()=>{assertLive(actor);if(typeof body.blockKey!=='string'||!/^[a-f0-9]{32}$/.test(body.blockKey))fail(400,'invalid');const record=rows('SELECT block_key FROM personal_blocks WHERE viewer_member=? AND block_key=?',actor.member,body.blockKey)[0];if(!record)fail(404,'not_found');storage.sql.exec('DELETE FROM personal_blocks WHERE viewer_member=? AND block_key=?',actor.member,body.blockKey);return {done:true};});
   if(action!=='blocks.add')fail(400,'invalid');
   // Reuse the report layer's authorization and immutable selection keys.
   for(let attempt=0;attempt<4;attempt++){
    const before=version(actor),available=await core({action:'safety.target',target:body.target,day:body.day},credential);if(version(actor)!==before)continue;
    const item=available.selections.find(item=>item.key===body.selectionKey);if(!item)fail(409,'report_selection_changed');const member=memberAt(body.target,body.day,item);if(!member||member===actor.member)fail(400,'block_self');
    return storage.transactionSync(()=>{assertLive(actor);if(!rows("SELECT key FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=?",member).length)fail(409,'report_selection_changed');const existing=rows('SELECT block_key FROM personal_blocks WHERE viewer_member=? AND target_member=?',actor.member,member)[0];if(existing)return {blocked:true,key:existing.block_key};const key=randomBytes(16).toString('hex');storage.sql.exec('INSERT INTO personal_blocks(block_key,viewer_member,target_member,target,day,x,y,created_at) VALUES(?,?,?,?,?,?,?,?)',key,actor.member,member,body.target,body.day,item.x,item.y,new Date(now()).toISOString());return {blocked:true,key};});
   }
   fail(409,'retry');
  }
  const list=blocks(actor);
  if(action==='global.schiils'&&list.length){
   const global=await core({action:'global',day:body.day},credential),expected=revision(global.layoutRevision,list);
   if(body.layoutRevision!==undefined&&(typeof body.layoutRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.layoutRevision)))fail(400,'invalid');if(body.layoutRevision&&body.layoutRevision!==expected)fail(409,'retry');
   const result=await core({...body,layoutRevision:global.layoutRevision},credential),data=globalRecord(body.day);return {...result,schiils:result.schiils.map(item=>hidden(list,data?.layout.pixels[item.position]?.member)?{...item,image:null}:item)};
  }
  const result=await core(body,credential);
  if(action==='safety.target'){
   const currentMembers=new Set(rows("SELECT json_extract(data,'$.member') AS member FROM rooms WHERE key LIKE 'accounts/%'").map(row=>row.member)),data=body.target==='GLOBAL'?globalRecord(body.day):null,atelier=body.target==='GLOBAL'?null:roomRecord(body.target,body.day),rects=atelier?partition(atelier.room.capacity,random(atelier.record.seed)):null;
   result.selections=result.selections.map(item=>{const rect=rects?.find(rect=>rect.x===item.x&&rect.y===item.y),member=data?data.layout.pixels[item.y*data.layout.outputSize+item.x]?.member:rect?(atelier.record.members??atelier.room.members)[rect.slot]:null;return {...item,blocked:hidden(list,member),canBlock:Boolean(member&&member!==actor.member&&currentMembers.has(member))};});
   if(body.target==='GLOBAL'){const data=globalRecord(body.day),pixels=data.layout.pixels.map(pixel=>hidden(list,pixel.member)?{...pixel,color:voidColor(pixel.position%data.layout.outputSize,Math.floor(pixel.position/data.layout.outputSize),0,body.day)}:pixel);if(result.selections.some(item=>item.blocked))result.image='data:image/png;base64,'+Buffer.from(await images.global(pixels,data.layout.outputSize,body.day)).toString('base64');}
   else result.image=await maskAtelier(result.image,body.target,body.day,list);
  }
  if(action==='safety.schiil'&&list.length){const available=await core({action:'safety.target',target:body.target,day:body.day},credential),item=available.selections.find(item=>item.key===body.selectionKey);if(!item)fail(409,'report_selection_changed');if(hidden(list,memberAt(body.target,body.day,item)))result.image=null;}
  if(action==='global')await maskGlobal(result,list);
  if(['work','public.work','draft'].includes(action))result.image=await maskAtelier(result.image,body.code,result.day,list);
  return result;
 }
 function version(actor){return JSON.stringify([blocks(actor),rows("SELECT key,etag FROM rooms WHERE key LIKE 'globals/%' OR key LIKE 'rooms/%' ORDER BY key"),rows('SELECT COUNT(*) AS n FROM removed_schiils')[0]?.n]);}
 return {async execute(body,actor,credential){const read=['safety.target','safety.schiil','global','global.schiils','work','public.work','draft'].includes(body.action);for(let attempt=0;attempt<4;attempt++){const before=read?version(actor):null,result=await execute(body,actor,credential);if(actor?.account)assertLive(actor);if(!read||before===version(actor))return result;}fail(409,'retry');}};
}
