// SQLite-backed Durable Object KV adapter. CAS runs atomically, without I/O.
import {removalChanges,metadataWriteAllowed} from '../server/account-removal.mjs';
export function metadataStore(storage,images){
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
  async getWithMetadata(key){const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag,metadata:{}}:null;},
  async deleteAccount(account,anonymousMember,attemptKeys){return storage.transactionSync(()=>{
   const current=storage.sql.exec('SELECT data FROM rooms WHERE key = ?',`accounts/${account.username}`).toArray()[0];
   if(!current||JSON.parse(current.data).member!==account.member)return {modified:false};
   const rows=storage.sql.exec('SELECT key,data FROM rooms').toArray().map(row=>({key:row.key,data:JSON.parse(row.data)}));
   const {writes,deletes}=removalChanges(rows,account,anonymousMember,attemptKeys);
   for(const key of deletes)storage.sql.exec('DELETE FROM rooms WHERE key = ?',key);
   for(const [key,data] of writes){const old=storage.sql.exec('SELECT etag FROM rooms WHERE key = ?',key).toArray()[0];storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),String(Number(old?.etag??0)+1));}
   return {modified:true};
  });},
  async get(key){return images.get(key);},
  async set(key,data){return images.set(key,data);},
  async setJSON(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!/^(rooms\/[A-Z0-9]{8}|globals\/\d{4}-\d{2}-\d{2}|accounts\/[a-z0-9_-]{3,24}|members\/[a-f0-9]{64}|sessions\/[a-f0-9]{64}|auth-attempts\/[a-f0-9]{64}|google-(challenges|identities)\/[a-f0-9]{64})$/.test(key))throw Error('metadata_key');
   return storage.transactionSync(()=>{
    const read=key=>{const value=storage.sql.exec('SELECT data FROM rooms WHERE key = ?',key).toArray()[0];return value?JSON.parse(value.data):undefined;};
    if(!metadataWriteAllowed(key,data,read))return {modified:false};
    const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];
    if((onlyIfNew&&row)||(onlyIfMatch&&row?.etag!==onlyIfMatch))return {modified:false};
    const etag=String(Number(row?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
    return {modified:true,etag};
   });
  },
 };
}
