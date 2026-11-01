// DEMO ONLY. A creator cannot award verification. Only configured Schiild operators can.
import {memberCount,snapshotDays} from '../../demo/server/membership.mjs';
export function officialAteliers({storage,ErrorClass,isOperator}){
 const rows=(query,...args)=>storage.sql.exec(query,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);};
 const metadata=room=>({code:room.code,name:room.name,official:Boolean(room.official),memberLimit:room.official?room.memberLimit:room.capacity,members:memberCount(room)});
 return {execute(body,actor){
  if(body.action==='social.official.public'){
   const cursor=body.cursor??'';if(typeof cursor!=='string'||cursor&&!/^[A-Z0-9]{8}$/.test(cursor))fail(400,'invalid');
   const list=rows("SELECT data FROM rooms WHERE key LIKE 'rooms/%' AND json_extract(data,'$.official')=1 AND json_extract(data,'$.visibility')='public' AND json_extract(data,'$.code')>? ORDER BY key LIMIT 101",cursor).map(row=>JSON.parse(row.data));return {items:list.slice(0,100).map(metadata),nextCursor:list.length>100?list[99].code:null};
  }
  if(!actor?.account)fail(401,'unauthorized');
  if(body.action==='social.official.mine')return {items:rows("SELECT data FROM rooms WHERE key LIKE 'rooms/%'").map(row=>JSON.parse(row.data)).filter(room=>room.members.includes(actor.member)).map(metadata)};
  if(!isOperator(actor))fail(403,'forbidden');
  if(body.action==='social.official.get'){
   if(typeof body.code!=='string'||!/^[A-Z0-9]{8}$/.test(body.code))fail(400,'invalid');const raw=rows('SELECT data FROM rooms WHERE key=?','rooms/'+body.code)[0];if(!raw)fail(404,'not_found');return metadata(JSON.parse(raw.data));
  }
  if(body.action!=='social.official.configure'||typeof body.code!=='string'||!/^[A-Z0-9]{8}$/.test(body.code)||typeof body.official!=='boolean'||body.official&&body.memberLimit!==null&&(!Number.isSafeInteger(body.memberLimit)||body.memberLimit<1))fail(400,'invalid');
  return storage.transactionSync(()=>{
   const raw=rows('SELECT data,etag FROM rooms WHERE key=?','rooms/'+body.code)[0];if(!raw)fail(404,'not_found');const room=snapshotDays(JSON.parse(raw.data));
   if(body.official&&body.memberLimit!==null&&body.memberLimit<memberCount(room))fail(409,'official_limit');
   if(body.official){room.official=true;room.memberLimit=body.memberLimit;}else{delete room.official;delete room.memberLimit;room.capacity=Math.max(room.capacity,room.members.length);}
   storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(room),String(Number(raw.etag)+1),'rooms/'+body.code);return metadata(room);
  });
 }};
}
