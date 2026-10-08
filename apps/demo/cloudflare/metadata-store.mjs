// SQLite-backed Durable Object KV adapter. CAS runs atomically, without I/O.
export function metadataStore(storage,images){
 return {
  async getWithMetadata(key){const row=storage.sql.exec('SELECT data, etag FROM rooms WHERE key = ?',key).toArray()[0];return row?{data:JSON.parse(row.data),etag:row.etag,metadata:{}}:null;},
  async get(key){return images.get(key);},
  async set(key,data){return images.set(key,data);},
  async setJSON(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!/^rooms\/[A-Z0-9]{8}$/.test(key))throw Error('metadata_key');
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
