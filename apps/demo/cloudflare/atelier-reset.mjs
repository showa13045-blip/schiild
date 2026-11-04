// Maintenance only. Never exposed by the normal application API.
// Deletes atelier/GLOBAL content while preserving accounts, sessions and profile icons.
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const contentTables=new Set(['image_blobs','image_chunks','photo_members','automatic_image_refs','atelier_chat','moderation_queue','content_reports','removed_schiils']);
function fingerprint(value){
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)){const bytes=value instanceof ArrayBuffer?Buffer.from(value):Buffer.from(value.buffer,value.byteOffset,value.byteLength);return {bytes:bytes.length,sha256:digest(bytes)};}
 if(Array.isArray(value))return value.map(fingerprint);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fingerprint(item)]));
 return value;
}
function snapshot(storage){
 const tables=storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray().map(row=>row.name),data={};
 for(const table of tables){if(!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(table))throw Error('unexpected_table');data[table]=storage.sql.exec('SELECT * FROM "'+table+'"').toArray();}
 const photoJobs=new Set((data.automatic_reviews??[]).filter(row=>row.kind==='photo').map(row=>row.review_key));
 const iconEvents=new Set((data.automatic_reviews??[]).filter(row=>row.kind==='icon').map(row=>digest('automatic-result/'+row.review_key)));
 const contentEvents=new Set((data.rooms??[]).filter(row=>row.key.startsWith('push-events/')).filter(row=>{const event=JSON.parse(row.data);return event.kind!=='moderation'||!iconEvents.has(event.eventId);}).map(row=>JSON.parse(row.data).eventId));
 function erase(table,row){
  if(contentTables.has(table))return true;
  if(table==='rooms')return row.key.startsWith('rooms/')||row.key.startsWith('globals/')||row.key.startsWith('push-events/')&&contentEvents.has(JSON.parse(row.data).eventId)||row.key.startsWith('push-deliveries/')&&contentEvents.has(JSON.parse(row.data).eventId);
  if(table==='automatic_reviews'||table==='moderation_notices')return row.kind==='photo';
  if(table==='automatic_authorizations')return photoJobs.has(row.review_key);
  return table==='community_reports'&&row.kind==='chat';
 }
 const all=[],protectedRows=[],removed={};
 for(const table of tables){removed[table]=0;for(const row of data[table]){const item=JSON.stringify([table,fingerprint(row)]);all.push(digest(item));if(erase(table,row))removed[table]++;else protectedRows.push(digest(item));}}
 const rooms=data.rooms??[],summary={accounts:rooms.filter(row=>row.key.startsWith('accounts/')).length,ateliers:rooms.filter(row=>row.key.startsWith('rooms/')).length,globalDays:rooms.filter(row=>row.key.startsWith('globals/')).length,images:(data.image_blobs??[]).length,imageChunks:(data.image_chunks??[]).length,profileIcons:(data.profile_icons??[]).length,protectedDigest:digest(protectedRows.sort().join('')),revision:digest(all.sort().join('')),deleteCounts:removed};
 return {tables,data,erase,summary};
}
export function atelierResetSummary(storage){return snapshot(storage).summary;}
export function resetAtelierContent(storage,expectedRevision){
 return storage.transactionSync(()=>{
  const before=snapshot(storage);if(before.summary.revision!==expectedRevision)throw Error('content_changed');
  for(const table of before.tables){
   if(!before.summary.deleteCounts[table])continue;
   if(contentTables.has(table)){storage.sql.exec('DELETE FROM "'+table+'"');continue;}
   const primary=storage.sql.exec('PRAGMA table_info("'+table+'")').toArray().filter(column=>column.pk).sort((a,b)=>a.pk-b.pk).map(column=>column.name);
   if(!primary.length||primary.some(name=>!/^\w+$/.test(name)))throw Error('unexpected_primary_key');
   for(const row of before.data[table])if(before.erase(table,row))storage.sql.exec('DELETE FROM "'+table+'" WHERE '+primary.map(name=>'"'+name+'"=?').join(' AND '),...primary.map(name=>row[name]));
  }
  const after=atelierResetSummary(storage);
  if(after.ateliers||after.globalDays||after.images||after.imageChunks||Object.values(after.deleteCounts).some(Boolean)||after.protectedDigest!==before.summary.protectedDigest)throw Error('reset_incomplete');
  return {before:before.summary,after};
 });
}
