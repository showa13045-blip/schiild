// DEMO ONLY. Reports identify an immutable Schiil, never a mutable GLOBAL position.
// Removal affects its selected destination; original evidence remains private.
import {createHash,randomBytes} from 'node:crypto';
import {partition,random} from '../../demo/src/engine.ts';
import {compactGlobal} from '../../demo/src/global-layout.ts';
import {workSize} from '../../demo/src/resolution.ts';
import {moderationConfig} from './human-moderation.mjs';
import {overlayApprovedTile} from './moderation-png.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const REPORT_REASONS=['sexual','violence','harassment','privacy','rights','other'];
function schema(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS content_reports (report_key TEXT PRIMARY KEY, selection_key TEXT NOT NULL, target TEXT NOT NULL, day TEXT NOT NULL, slot INTEGER, source TEXT NOT NULL, order_key TEXT, reporter TEXT, reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT, reviewer TEXT, decision_note TEXT)');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS content_reports_status ON content_reports(status,created_at,report_key)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS removed_schiils (selection_key TEXT PRIMARY KEY, target TEXT NOT NULL, day TEXT NOT NULL, slot INTEGER, source TEXT NOT NULL, order_key TEXT, removed_at TEXT NOT NULL)');
}
export function anonymizeDeletedReports(storage){schema(storage);for(const column of ['reporter','reviewer'])storage.sql.exec(`UPDATE content_reports SET ${column}=NULL${column==='reporter'?",details=''":''} WHERE ${column} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=content_reports.${column})`);}
export function contentSafety({store,storage,images,core,globalFactory,ErrorClass,config:value,review=false,now=()=>Date.now()}){
 schema(storage);const rows=(query,...args)=>storage.sql.exec(query,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);};
 const removed=(target,day)=>rows('SELECT * FROM removed_schiils WHERE target=? AND day=?',target,day);
 const selection=(target,day,slot,source,orderKey=null)=>({selection_key:hash(JSON.stringify(target==='GLOBAL'?[target,day,source,orderKey]:[target,day,slot])),target,day,slot,source,order_key:orderKey});
 const config=moderationConfig(value,review),isOperator=actor=>Boolean(config?.enabled&&config.operators.includes(actor.account?.username));
 async function liveActor(actor){if(!actor?.account)fail(401,'unauthorized');const account=await store.getWithMetadata('accounts/'+actor.account.username,{type:'json'});if(account?.data.member!==actor.member)fail(401,'account_deleted');}
 function validTarget(body){const target=body.target,day=body.day;if(typeof target!=='string'||target!=='GLOBAL'&&!/^[A-Z0-9]{8}$/.test(target)||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||day>new Date(now()).toISOString().slice(0,10))fail(400,'invalid');return {target,day};}
 async function rawRoom(target,day){const row=await store.getWithMetadata('rooms/'+target,{type:'json'}),room=row?.data,record=room?.days[day];if(!room||record?.status!=='ready')fail(404,'not_found');return {room,record};}
 async function rawAtelierImage(target,day){const bytes=await store.get('works/'+target+'/'+day,{type:'arrayBuffer'});if(!bytes?.byteLength)fail(503,'generation_failed');return 'data:image/png;base64,'+Buffer.from(bytes).toString('base64');}
 async function selections(target,day,actor,operator=false){
  if(target==='GLOBAL'){
   // Materialize the established random order before inspecting the same raw record.
   await globalFactory(store,{images,now}).view(day,actor.member);
   const row=await store.getWithMetadata('globals/'+day,{type:'json'});if(!row||!Object.keys(row.data.pixels).length)fail(404,'not_found');
   const hidden=removed(target,day),visible=Object.fromEntries(Object.entries(row.data.pixels).filter(([,pixel])=>!hidden.some(item=>item.order_key===pixel.orderKey&&item.source===pixel.source))),layout=compactGlobal(visible);
   return {name:'GLOBAL SCHIILD',size:layout.outputSize,items:layout.pixels.map(pixel=>({...selection(target,day,null,row.data.pixels[pixel.member].source,row.data.pixels[pixel.member].orderKey),x:pixel.position%layout.outputSize,y:Math.floor(pixel.position/layout.outputSize),w:1,h:1}))};
  }
  const {room,record}=await rawRoom(target,day);if(!operator&&room.visibility!=='public'&&!room.members.includes(actor.member))fail(404,'not_found');
  const hidden=removed(target,day),rects=partition(room.capacity,random(record.seed));
  return {name:room.name,size:128,items:rects.filter(rect=>record.posts[rect.slot]&&!hidden.some(item=>item.slot===rect.slot)).map(rect=>({...selection(target,day,rect.slot,record.posts[rect.slot].split('/').at(-1)),x:rect.x,y:rect.y,w:rect.w,h:rect.h}))};
 }
 async function maskedAtelier(image,target,day){const hidden=removed(target,day);if(!hidden.length)return image;const {room,record}=await rawRoom(target,day),rects=partition(room.capacity,random(record.seed));let result=Buffer.from(image.split(',')[1],'base64');for(const item of hidden){const rect=rects.find(rect=>rect.slot===item.slot);if(rect){const blank=await images.compose([rect],async()=>null,record.seed,workSize(record),day);result=overlayApprovedTile(result,blank,rect);}}return 'data:image/png;base64,'+result.toString('base64');}
 // Reads filter the actual recorded GLOBAL pixels before compacting the layout.
 // Legacy random-order writes merge removed records back into retained evidence.
 function globalStore(){return new Proxy(store,{get(object,property){
  if(property==='getWithMetadata')return async(key,options)=>{const row=await object.getWithMetadata(key,options);if(!row||!key.startsWith('globals/'))return row;const hidden=removed('GLOBAL',row.data.day);return {...row,data:{...row.data,pixels:Object.fromEntries(Object.entries(row.data.pixels).filter(([,pixel])=>!hidden.some(item=>item.order_key===pixel.orderKey&&item.source===pixel.source)))}};};
  if(property==='listJSON')return async prefix=>{const list=await object.listJSON(prefix);return prefix==='globals/'?Promise.all(list.map(async row=>({...row,...await globalStore().getWithMetadata(row.key,{type:'json'})}))):list;};
  if(property==='setJSON')return async(key,data,options)=>{if(key.startsWith('globals/')){const original=await object.getWithMetadata(key,{type:'json'}),hidden=removed('GLOBAL',data.day);if(original){const retained=Object.fromEntries(Object.entries(original.data.pixels).filter(([,pixel])=>hidden.some(item=>item.order_key===pixel.orderKey&&item.source===pixel.source)));data={...data,pixels:{...data.pixels,...retained}};}}return object.setJSON(key,data,options);};
  const entry=Reflect.get(object,property);return typeof entry==='function'?entry.bind(object):entry;
 }});}
 async function globalView(day,actor){const result=await globalFactory(globalStore(),{images,now}).view(day,actor.member);if(result.artworks)result.artworks=await Promise.all(result.artworks.map(async item=>({...item,image:await maskedAtelier(item.image,item.code,item.day)})));return result;}
 async function globalSchiil(day,item){const row=await store.getWithMetadata('globals/'+day,{type:'json'}),pixel=Object.values(row?.data.pixels??{}).find(pixel=>pixel.orderKey===item.order_key&&pixel.source===item.source);if(!pixel||removed('GLOBAL',day).some(hidden=>hidden.order_key===item.order_key&&hidden.source===item.source))return null;const key='global/'+day+'/'+hash('schiil-thumb-v1/'+pixel.source);let bytes=await store.get(key,{type:'arrayBuffer'});if(!bytes&&!pixel.sourceDeleted&&pixel.photoKey){const photo=await store.get(pixel.photoKey,{type:'arrayBuffer'});if(photo){bytes=await images.thumbnail(photo);await store.set(key,bytes,{onlyIfNew:true});}}return bytes?'data:image/png;base64,'+Buffer.from(bytes).toString('base64'):null;}
 const reportURL=(target,day)=>'/report/?'+new URLSearchParams({target,day,...(review?{mode:'review'}:{})});
 async function execute(body,actor,credential){
  if(typeof body.action!=='string')fail(400,'invalid');const action=body.action;
  if(['safety.target','safety.schiil','reports.submit'].includes(action)){
   await liveActor(actor);const {target,day}=validTarget(body),available=await selections(target,day,actor);
   if(action==='safety.target'){
    const image=target==='GLOBAL'?(await globalView(day,actor)).image:await maskedAtelier(await rawAtelierImage(target,day),target,day);
    return {target,day,name:available.name,size:available.size,image,selections:available.items.map(item=>({key:item.selection_key,x:item.x,y:item.y,w:item.w,h:item.h}))};
   }
   if(typeof body.selectionKey!=='string')fail(400,'invalid');const item=available.items.find(item=>item.selection_key===body.selectionKey);if(!item)fail(409,'report_selection_changed');
   if(action==='safety.schiil'){if(target!=='GLOBAL')fail(400,'invalid');return {image:await globalSchiil(day,item)};}
   if(!REPORT_REASONS.includes(body.reason)||typeof body.details!=='string'||body.details.length>1000)fail(400,'invalid');
   return storage.transactionSync(()=>{const account=rows('SELECT data FROM rooms WHERE key=?','accounts/'+actor.account.username)[0];if(!account||JSON.parse(account.data).member!==actor.member)fail(401,'account_deleted');const existing=rows('SELECT report_key FROM content_reports WHERE reporter=? AND selection_key=?',actor.member,item.selection_key)[0];if(existing)return {received:true,reference:existing.report_key};if(rows('SELECT report_key FROM content_reports WHERE reporter=? AND created_at>?',actor.member,new Date(now()-86400000).toISOString()).length>=5)fail(429,'report_limited');const key=randomBytes(16).toString('hex');storage.sql.exec('INSERT INTO content_reports(report_key,selection_key,target,day,slot,source,order_key,reporter,reason,details,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',key,item.selection_key,target,day,item.slot,item.source,item.order_key,actor.member,body.reason,body.details.trim(),'open',new Date(now()).toISOString());return {received:true,reference:key};});
  }
  if(action.startsWith('reports.')){
   await liveActor(actor);if(!isOperator(actor))fail(403,'forbidden');
   if(action==='reports.list'){
    const status=body.status??'open';if(!['open','removed','dismissed'].includes(status))fail(400,'invalid');let cursor=null;if(body.cursor){if(typeof body.cursor!=='string'||!/^[a-f0-9]{32}$/.test(body.cursor))fail(400,'invalid');cursor=rows('SELECT created_at,report_key FROM content_reports WHERE report_key=?',body.cursor)[0];if(!cursor)fail(400,'invalid');}
    const list=cursor?rows('SELECT report_key,target,day,reason,details,status,created_at,reviewed_at,decision_note FROM content_reports WHERE status=? AND (created_at>? OR (created_at=? AND report_key>?)) ORDER BY created_at,report_key LIMIT 26',status,cursor.created_at,cursor.created_at,cursor.report_key):rows('SELECT report_key,target,day,reason,details,status,created_at,reviewed_at,decision_note FROM content_reports WHERE status=? ORDER BY created_at,report_key LIMIT 26',status);return {items:list.slice(0,25).map(item=>({...item,name:item.target==='GLOBAL'?'GLOBAL SCHIILD':rows('SELECT data FROM rooms WHERE key=?','rooms/'+item.target).map(row=>JSON.parse(row.data).name)[0]??item.target})),nextCursor:list.length>25?list[24].report_key:null};
   }
   if(typeof body.reportKey!=='string'||!/^[a-f0-9]{32}$/.test(body.reportKey))fail(400,'invalid');const record=rows('SELECT * FROM content_reports WHERE report_key=?',body.reportKey)[0];if(!record)fail(404,'not_found');
   if(action==='reports.preview'){
    let available;try{available=await selections(record.target,record.day,actor,true);}catch(error){if(error.status===404)return {image:null,unavailable:true};throw error;}const match=available.items.find(item=>item.selection_key===record.selection_key);if(!match)return {image:null,removed:true};const image=record.target==='GLOBAL'?(await globalView(record.day,actor)).image:await rawAtelierImage(record.target,record.day);const schiilImage=record.target==='GLOBAL'?await globalSchiil(record.day,match):undefined;return {image,schiilImage,size:available.size,rect:{x:match.x,y:match.y,w:match.w,h:match.h}};
   }
   if(!['reports.remove','reports.dismiss'].includes(action)||typeof body.note!=='string'||!body.note.trim()||body.note.length>1000)fail(400,'invalid');
   return storage.transactionSync(()=>{if(rows('SELECT status FROM content_reports WHERE report_key=?',record.report_key)[0]?.status!=='open')fail(409,'report_reviewed');const stamp=new Date(now()).toISOString(),status=action==='reports.remove'?'removed':'dismissed';if(status==='removed')storage.sql.exec('INSERT OR IGNORE INTO removed_schiils(selection_key,target,day,slot,source,order_key,removed_at) VALUES(?,?,?,?,?,?,?)',record.selection_key,record.target,record.day,record.slot,record.source,record.order_key,stamp);storage.sql.exec('UPDATE content_reports SET status=?,reviewed_at=?,reviewer=?,decision_note=? WHERE report_key=?',status,stamp,actor.member,body.note.trim(),record.report_key);return {done:true,status};});
  }
  if(action==='global'){const result=await globalView(String(body.day??new Date(now()).toISOString().slice(0,10)),actor);const pending=await core(body,credential);return {...result,...(pending.moderationStatus?{moderationStatus:pending.moderationStatus}:{}),reportUrl:result.image?reportURL('GLOBAL',result.day):undefined};}
  if(action==='global.schiils')return globalFactory(globalStore(),{images,now}).schiils(body.day,body.positions,body.layoutRevision);
  if(action==='global.archive'){const result=await core(body,credential);return {days:result.days.filter(item=>{const record=rows('SELECT data FROM rooms WHERE key=?','globals/'+item.day)[0];if(!record)return false;const hidden=removed('GLOBAL',item.day);return Object.values(JSON.parse(record.data).pixels).some(pixel=>!hidden.some(item=>item.order_key===pixel.orderKey&&item.source===pixel.source));})};}
  const result=await core(body,credential);
  if(['work','public.work','draft'].includes(action)&&result.image){result.image=await maskedAtelier(result.image,String(body.code),result.day);if(action!=='draft')result.reportUrl=reportURL(String(body.code),result.day);}
  // Recheck after asynchronous work so a concurrent removal cannot escape via a read.
  return result;
 }
 // Source etags also detect new GLOBAL arrivals and a private visibility change
 // between selection, image loading and response serialization.
 const readVersion=()=>JSON.stringify([rows('SELECT COUNT(*) AS n FROM removed_schiils')[0].n,rows("SELECT key,etag FROM rooms WHERE key LIKE 'globals/%' OR key LIKE 'rooms/%' ORDER BY key")]);
 return {async execute(body,actor,credential){const read=['safety.target','safety.schiil','reports.preview','global','global.schiils','global.archive','work','public.work','draft'].includes(body.action);for(let attempt=0;attempt<4;attempt++){const before=read?readVersion():null,result=await execute(body,actor,credential);if(!read||readVersion()===before)return result;}fail(409,'retry');}};
}
