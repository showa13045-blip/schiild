// SQLite-backed Durable Object KV adapter. CAS runs atomically, without I/O.
export function metadataStore(storage,images){
 return {
  async listJSON(prefix){return storage.sql.exec('SELECT key,data,etag FROM rooms WHERE key LIKE ?',prefix+'%').toArray().map(row=>({...row,data:JSON.parse(row.data)}));},
  async registerAccount(account){return storage.transactionSync(()=>{
   if(storage.sql.exec('SELECT key FROM rooms WHERE key = ?',`accounts/${account.username}`).toArray().length)return {modified:false,reason:'name'};
   if(storage.sql.exec('SELECT key FROM rooms WHERE key = ?',`members/${account.member}`).toArray().length)return {modified:false,reason:'member'};
   for(const [key,data] of [[`accounts/${account.username}`,account],[`members/${account.member}`,{username:account.username}]])storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?)',key,JSON.stringify(data),'1');
   return {modified:true};
  });},
  async getWithMetadata(key){const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag,metadata:{}}:null;},
  async get(key){return images.get(key);},
  async set(key,data){return images.set(key,data);},
  async setJSON(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!/^(rooms\/[A-Z0-9]{8}|globals\/\d{4}-\d{2}-\d{2}|accounts\/[a-z0-9_-]{3,24}|members\/[a-f0-9]{64}|sessions\/[a-f0-9]{64}|auth-attempts\/[a-f0-9]{64})$/.test(key))throw Error('metadata_key');
   return storage.transactionSync(()=>{
    const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];
    if((onlyIfNew&&row)||(onlyIfMatch&&row?.etag!==onlyIfMatch))return {modified:false};
    const etag=String(Number(row?.etag??0)+1);
    storage.sql.exec('INSERT INTO rooms (key,data,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=excluded.etag',key,JSON.stringify(data),etag);
    return {modified:true,etag};
   });
  },
 };
}
