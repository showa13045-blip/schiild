// Test/development adapter only. Production uses persistent Netlify Blobs.
export function memoryStore(){
 const values=new Map();let revision=0;
 return {
  async listJSON(prefix){return [...values].filter(([key])=>key.startsWith(prefix)).map(([key,row])=>({key,...structuredClone(row)}));},
  async registerAccount(account){
   if(values.has(`accounts/${account.username}`))return {modified:false,reason:'name'};
   if(values.has(`members/${account.member}`))return {modified:false,reason:'member'};
   for(const [key,data] of [[`accounts/${account.username}`,account],[`members/${account.member}`,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true};
  },
  async getWithMetadata(key){const value=values.get(key);return value?structuredClone(value):null;},
  async get(key,{type}={}){const value=values.get(key)?.data;if(value===undefined)return null;return type==='arrayBuffer'?(value instanceof ArrayBuffer?value.slice(0):Uint8Array.from(value).buffer):structuredClone(value);},
  async setJSON(key,data,options={}){return this.set(key,structuredClone(data),options);},
  async set(key,data,{onlyIfNew,onlyIfMatch}={}){
   const previous=values.get(key);
   if(onlyIfNew&&previous||onlyIfMatch&&previous?.etag!==onlyIfMatch)return {modified:false};
   const etag=String(++revision);values.set(key,{data:structuredClone(data),etag,metadata:{}});return {modified:true,etag};
  },
 };
}
