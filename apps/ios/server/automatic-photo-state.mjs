// DEMO/iOS ONLY. Retract only the evaluated original, and preserve unrelated contributions.
import {createHash} from 'node:crypto';
import {imageFilename} from '../../demo/cloudflare/sqlite-images.mjs';
import {atelierRects} from '../../demo/src/atelier-layout.ts';
import {workSize} from '../../demo/src/resolution.ts';
import {relocateApprovedTile} from './moderation-png.mjs';
import {AutomaticReviewError} from './automatic-policy.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function imageReferenceSchema(storage){storage.sql.exec('CREATE TABLE IF NOT EXISTS automatic_image_refs (image_name TEXT PRIMARY KEY, logical_key TEXT NOT NULL)');}
export function automaticImageStore(store,storage){
 imageReferenceSchema(storage);
 return new Proxy(store,{get(object,key){if(key==='set')return async(name,bytes,options)=>{
  // Register before writing bytes, so a failed index write cannot expose an untracked image.
  if(/^(?:photos|works|global)\//.test(name))storage.sql.exec('INSERT OR REPLACE INTO automatic_image_refs VALUES(?,?)',imageFilename(name),name);
  return object.set(name,bytes,options);
 };const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
}
function purgeImages(storage,names){
 for(const name of new Set(names)){storage.sql.exec('DELETE FROM image_chunks WHERE name=?',name);storage.sql.exec('DELETE FROM image_blobs WHERE name=?',name);storage.sql.exec('DELETE FROM photo_members WHERE name=?',name);storage.sql.exec('DELETE FROM automatic_image_refs WHERE image_name=?',name);}
}
function saveImage(storage,key,bytes){
 const name=imageFilename(key),image=Buffer.from(bytes);
 storage.sql.exec('INSERT INTO image_blobs VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET byte_length=excluded.byte_length,sha256=excluded.sha256',name,image.length,hash(image));storage.sql.exec('DELETE FROM image_chunks WHERE name=?',name);
 for(let offset=0,part=0;offset<image.length;offset+=65536,part++)storage.sql.exec('INSERT INTO image_chunks VALUES(?,?,?)',name,part,image.subarray(offset,offset+65536));
 storage.sql.exec('INSERT OR REPLACE INTO automatic_image_refs VALUES(?,?)',name,key);
}
export async function retractAutomaticPhoto({storage,store,images,job,current,now=()=>Date.now()}){
 imageReferenceSchema(storage);const rows=(query,...args)=>storage.sql.exec(query,...args).toArray();
 if(job.kind!=='photo'||job.object_key!==`photos/${job.member}/${job.day}/${job.source}`)throw new AutomaticReviewError('review_image_invalid');
 for(let attempt=0;attempt<12;attempt++){
  if(!current())return false;
  const records=rows('SELECT * FROM moderation_queue WHERE member=? AND photo_key=? AND source=?',job.member,job.object_key,job.source),writes=[];
  for(const record of records.filter(v=>v.target!=='GLOBAL')){
   const before=await store.getWithMetadata('rooms/'+record.target,{type:'json'}),room=before?.data,day=room?.days[record.day];
   if(!day||day.posts[record.slot]!==job.object_key)continue;
   if(day.status==='generating')throw new AutomaticReviewError('review_generation_in_progress');
   const next=structuredClone(room),updated=next.days[record.day];delete updated.posts[record.slot];
   // Keep the original reservation until the daily deadline, including after leave/rejoin.
   if(new Date(now()).toISOString().slice(0,10)===record.day)updated.pendingSlots={...updated.pendingSlots,[record.slot]:job.member};
   else if(updated.pendingSlots?.[record.slot]===job.member)delete updated.pendingSlots[record.slot];
   let png=null;
   if(updated.status==='ready'){
    const rects=atelierRects(next,updated),size=workSize(updated),old=await store.get(`works/${next.code}/${record.day}`,{type:'arrayBuffer'});
    png=await images.compose(rects,async rect=>{const photo=updated.posts[rect.slot];return photo&&photo!=='deleted-photo'?store.get(photo,{type:'arrayBuffer'}):null;},updated.seed,size,record.day);
    for(const to of rects)if(updated.posts[to.slot]==='deleted-photo'){
     const from=atelierRects(room,day).find(v=>v.slot===to.slot);if(!from||!old)throw new AutomaticReviewError('review_rebuild_failed');png=relocateApprovedTile(old,png,from,to);
    }updated.outputSize=size;
   }
   writes.push({key:'rooms/'+record.target,etag:before.etag,data:next,png,imageKey:`works/${record.target}/${record.day}`});
  }
  const global=await store.getWithMetadata('globals/'+job.day,{type:'json'}),pixel=global?.data.pixels[job.member];
  if(pixel?.photoKey===job.object_key&&pixel.source===job.source){const data=structuredClone(global.data);delete data.pixels[job.member];writes.push({key:'globals/'+job.day,etag:global.etag,data});}
  const changed=storage.transactionSync(()=>{
   if(!current())return 'gone';
   if(writes.some(write=>rows('SELECT etag FROM rooms WHERE key=?',write.key)[0]?.etag!==write.etag))return false;
   // A concurrent replacement must never be affected by an older verdict.
   for(const write of writes){if(write.png)saveImage(storage,write.imageKey,write.png);storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(write.data),String(Number(write.etag)+1),write.key);}
   storage.sql.exec("UPDATE moderation_queue SET status='rejected',reviewer=NULL,reviewed_at=? WHERE member=? AND photo_key=? AND source=?",new Date(now()).toISOString(),job.member,job.object_key,job.source);
   const remaining=rows('SELECT data FROM rooms WHERE key=?','globals/'+job.day)[0],pixels=remaining?Object.values(JSON.parse(remaining.data).pixels):[];
   const retained=new Set(pixels.filter(v=>v.source!==job.source).map(v=>`global/${job.day}/${hash('schiil-thumb-v1/'+v.source)}`));
   const caches=rows('SELECT image_name,logical_key FROM automatic_image_refs WHERE logical_key LIKE ?','global/'+job.day+'/%').filter(v=>!retained.has(v.logical_key)).map(v=>v.image_name);
   purgeImages(storage,[imageFilename(job.object_key),imageFilename(`global/${job.day}/${hash('schiil-thumb-v1/'+job.source)}`),...caches]);
   return true;
  });
  if(changed==='gone')return false;if(changed)return records.map(v=>({target:v.target,day:v.day}));
 }throw new AutomaticReviewError('review_rebuild_conflict');
}
