// Maintenance only: reset recorded content, never accounts, sessions or atelier membership.
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const transient=key=>key.startsWith('globals/')||key.startsWith('push-events/')||key.startsWith('push-deliveries/');
export function contentResetSummary(storage){
 const tables=new Set(storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray().map(row=>row.name));
 const rows=tables.has('rooms')?storage.sql.exec('SELECT key,data,etag FROM rooms ORDER BY key').toArray():[];
 const count=table=>tables.has(table)?Number(storage.sql.exec('SELECT count(*) AS total FROM '+table).toArray()[0].total):0;
 let ateliers=0,days=0,posts=0;
 const protectedRows=[];
 for(const row of rows){
  if(transient(row.key))continue;
  if(row.key.startsWith('rooms/')){const room=JSON.parse(row.data);ateliers++;days+=Object.keys(room.days??{}).length;posts+=Object.values(room.days??{}).reduce((n,day)=>n+Object.keys(day.posts??{}).length,0);protectedRows.push([row.key,{...room,days:{}}]);}
  else protectedRows.push([row.key,row.data,row.etag]);
 }
 const images=tables.has('image_blobs')?storage.sql.exec('SELECT name,byte_length,sha256 FROM image_blobs ORDER BY name').toArray():[];
 return {ateliers,days,posts,globalDays:rows.filter(row=>row.key.startsWith('globals/')).length,accounts:rows.filter(row=>row.key.startsWith('accounts/')).length,images:count('image_blobs'),imageChunks:count('image_chunks'),photoLinks:count('photo_members'),protectedDigest:hash(protectedRows),revision:hash([rows,images,count('image_chunks'),count('photo_members')])};
}
export function resetRecordedContent(storage,expectedRevision){
 return storage.transactionSync(()=>{
  const before=contentResetSummary(storage);if(before.revision!==expectedRevision)throw Error('content_changed');
  const tables=new Set(storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray().map(row=>row.name));
  if(tables.has('rooms')){
   for(const row of storage.sql.exec("SELECT key,data,etag FROM rooms WHERE key LIKE 'rooms/%'").toArray()){
    const room=JSON.parse(row.data);storage.sql.exec('UPDATE rooms SET data = ?, etag = ? WHERE key = ?',JSON.stringify({...room,days:{}}),String(Number(row.etag)+1),row.key);
   }
   storage.sql.exec("DELETE FROM rooms WHERE key LIKE 'globals/%' OR key LIKE 'push-events/%' OR key LIKE 'push-deliveries/%'");
  }
  for(const table of ['image_chunks','photo_members','image_blobs'])if(tables.has(table))storage.sql.exec('DELETE FROM '+table);
  const after=contentResetSummary(storage);
  if(after.days||after.posts||after.globalDays||after.images||after.imageChunks||after.photoLinks||after.protectedDigest!==before.protectedDigest)throw Error('content_reset_incomplete');
  return {before,after};
 });
}
