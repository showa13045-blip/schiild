// SQLite-backed Durable Object KV adapter. CAS runs atomically, without I/O.
import {removalChanges,metadataWriteAllowed} from '../server/account-removal.mjs';
import {roomNotificationEvents} from '../server/notification-events.mjs';
export function metadataStore(storage,images,{notificationEvents=false,now=()=>Date.now()}={}){
 return {
  async listJSON(prefix){return storage.sql.exec('SELECT key,data,etag FROM rooms WHERE key LIKE ?',prefix+'%').toArray().map(row=>({...row,data:JSON.parse(row.data)}));},
  async registerAccount(account){return storage.transactionSync(()=>{
   if(storage.sql.exec('SELECT key FROM rooms WHERE key = ?',`accounts/${account.username}`).toArray().length)return {modified:false,reason:'name'};
   if(storage.sql.exec('SELECT key FROM rooms WHERE key = ?',`members/${account.member}`).toArray().length)return {modified:false,reason:'member'};
   for(const [key,data] of [[`accounts/${account.username}`,account],[`members/${account.member}`,{username:account.username}]])storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?)',key,JSON.stringify(data),'1');
   return {modified:true};
  });},
  async registerGoogle(account){return storage.transactionSync(()=>{
   const read=key=>{const row=storage.sql.exec('SELECT data,etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag}:null;};
   const googleKey=`google-identities/${account.googleSubject}`,mapping=read(googleKey)?.data;
   if(mapping)return {modified:false,reason:'google',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=read(memberKey)?.data,current=read(accountKey)?.data;
   if(linked&&linked.username!==account.username||current&&current.member!==account.member||current?.googleSubject&&current.googleSubject!==account.googleSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),googleSubject:account.googleSubject,googleEmail:account.googleEmail};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[googleKey,{username:account.username}]]){
    const etag=String(Number(read(key)?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
   }
   return {modified:true,account:updated};
  });},
  async registerLine(account){return storage.transactionSync(()=>{
   const read=key=>{const row=storage.sql.exec('SELECT data,etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag}:null;};
   const lineKey=`line-identities/${account.lineSubject}`,mapping=read(lineKey)?.data;
   if(mapping)return {modified:false,reason:'line',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=read(memberKey)?.data,current=read(accountKey)?.data;
   if(linked?.deleted||linked&&linked.username!==account.username||current&&current.member!==account.member||current?.lineSubject&&current.lineSubject!==account.lineSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),lineSubject:account.lineSubject};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[lineKey,{username:account.username}]]){
    const etag=String(Number(read(key)?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
   }
   return {modified:true,account:updated};
  });},
  async registerWhatsApp(account){return storage.transactionSync(()=>{
   const read=key=>{const row=storage.sql.exec('SELECT data,etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag}:null;};
   const whatsappKey=`whatsapp-identities/${account.whatsappSubject}`,mapping=read(whatsappKey)?.data;
   if(mapping)return {modified:false,reason:'whatsapp',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=read(memberKey)?.data,current=read(accountKey)?.data;
   if(linked?.deleted||linked&&linked.username!==account.username||current&&current.member!==account.member||current?.whatsappSubject&&current.whatsappSubject!==account.whatsappSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),whatsappSubject:account.whatsappSubject};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[whatsappKey,{username:account.username}]]){
    const etag=String(Number(read(key)?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
   }
   return {modified:true,account:updated};
  });},
  async getWithMetadata(key){const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag,metadata:{}}:null;},
  async pruneLineChallenges(now){storage.sql.exec("DELETE FROM rooms WHERE key LIKE 'line-challenges/%' AND json_extract(data,'$.expires') <= ?",now);},
  async pruneWhatsAppChallenges(now){storage.sql.exec("DELETE FROM rooms WHERE key LIKE 'whatsapp-challenges/%' AND json_extract(data,'$.expires') <= ?",now);},
  async deleteAccount(account,anonymousMember,attemptKeys,options={}){return storage.transactionSync(()=>{
   const current=storage.sql.exec('SELECT data FROM rooms WHERE key = ?',`accounts/${account.username}`).toArray()[0];
   if(!current||JSON.parse(current.data).member!==account.member)return {modified:false};
   const rows=storage.sql.exec('SELECT key,data FROM rooms').toArray().map(row=>({key:row.key,data:JSON.parse(row.data)}));
   const {writes,deletes,photoKeys}=removalChanges(rows,account,anonymousMember,attemptKeys,options);
   for(const key of deletes)storage.sql.exec('DELETE FROM rooms WHERE key = ?',key);
   for(const [key,data] of writes){const old=storage.sql.exec('SELECT etag FROM rooms WHERE key = ?',key).toArray()[0];storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),String(Number(old?.etag??0)+1));}
   if(options.purgePhotos){if(!images.deletePhotosSync&&photoKeys.length)throw Error('image_deletion_unavailable');images.deletePhotosSync?.(photoKeys,account.member);}
   return {modified:true};
  });},
  async get(key){return images.get(key);},
  async set(key,data){const read=key=>{const value=storage.sql.exec('SELECT data FROM rooms WHERE key = ?',key).toArray()[0];return value?JSON.parse(value.data):undefined;};if(!metadataWriteAllowed(key,data,read))return {modified:false};return images.set(key,data);},
  async deleteJSON(key){if(!/^push-(preferences|subscriptions|events|deliveries)\/[a-f0-9]{64}$/.test(key))throw Error('metadata_key');storage.sql.exec('DELETE FROM rooms WHERE key = ?',key);},
  async setJSON(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!/^(rooms\/[A-Z0-9]{8}|globals\/\d{4}-\d{2}-\d{2}|accounts\/[a-z0-9_-]{3,24}|members\/[a-f0-9]{64}|sessions\/[a-f0-9]{64}|auth-attempts\/[a-f0-9]{64}|(google|line|whatsapp)-(challenges|identities)\/[a-f0-9]{64}|push-(preferences|subscriptions|events|deliveries)\/[a-f0-9]{64})$/.test(key))throw Error('metadata_key');
   return storage.transactionSync(()=>{
    const read=key=>{const value=storage.sql.exec('SELECT data FROM rooms WHERE key = ?',key).toArray()[0];return value?JSON.parse(value.data):undefined;};
    if(!metadataWriteAllowed(key,data,read))return {modified:false};
    const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];
    if((onlyIfNew&&row)||(onlyIfMatch&&row?.etag!==onlyIfMatch))return {modified:false};
    const etag=String(Number(row?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
    if(notificationEvents&&key.startsWith('rooms/'))for(const event of roomNotificationEvents(row?JSON.parse(row.data):null,data,now()))storage.sql.exec('INSERT OR IGNORE INTO rooms (key,data,etag) VALUES (?,?,?)',event.key,JSON.stringify(event.data),'1');
    return {modified:true,etag};
   });
  },
 };
}
