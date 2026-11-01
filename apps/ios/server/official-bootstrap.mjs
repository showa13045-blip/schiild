// One-time operator instruction approved by the user. Does not run in App Review data.
// A stored receipt makes subsequent changes in the operator UI authoritative.
export function applyRequestedOfficialAteliers(storage,review=false){
 if(review)return;
 storage.transactionSync(()=>{
  const receipt='system/official-picklemate-20261102-v1';if(storage.sql.exec('SELECT key FROM rooms WHERE key=?',receipt).toArray().length)return;
  const row=storage.sql.exec('SELECT data,etag FROM rooms WHERE key=?','rooms/HRQZ7WEF').toArray()[0];if(!row)return;const room=JSON.parse(row.data);if(room.name!=='Picklemate')return;
  room.official=true;room.memberLimit=null;storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(room),String(Number(row.etag)+1),'rooms/HRQZ7WEF');
  storage.sql.exec('INSERT INTO rooms(key,data,etag) VALUES(?,?,?)',receipt,JSON.stringify({code:room.code,name:room.name,official:true,memberLimit:null}),'1');
 });
}
