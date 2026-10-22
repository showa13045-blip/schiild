// Test/development adapter only. The published demo uses Cloudflare durable SQLite.
import {removalChanges,metadataWriteAllowed} from './account-removal.mjs';
import {roomNotificationEvents} from './notification-events.mjs';
export function memoryStore({notificationEvents=false,now=()=>Date.now()}={}){
 const values=new Map();let revision=0;
 return {
  async listJSON(prefix){return [...values].filter(([key])=>key.startsWith(prefix)).map(([key,row])=>({key,...structuredClone(row)}));},
  async registerAccount(account){
   if(values.has(`accounts/${account.username}`))return {modified:false,reason:'name'};
   if(values.has(`members/${account.member}`))return {modified:false,reason:'member'};
   for(const [key,data] of [[`accounts/${account.username}`,account],[`members/${account.member}`,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true};
  },
  async registerGoogle(account){
   const googleKey=`google-identities/${account.googleSubject}`,mapping=values.get(googleKey)?.data;
   if(mapping)return {modified:false,reason:'google',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=values.get(memberKey)?.data,current=values.get(accountKey)?.data;
   if(linked&&linked.username!==account.username||current&&current.member!==account.member||current?.googleSubject&&current.googleSubject!==account.googleSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),googleSubject:account.googleSubject,googleEmail:account.googleEmail};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[googleKey,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true,account:structuredClone(updated)};
  },
  async registerLine(account){
   const lineKey=`line-identities/${account.lineSubject}`,mapping=values.get(lineKey)?.data;
   if(mapping)return {modified:false,reason:'line',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=values.get(memberKey)?.data,current=values.get(accountKey)?.data;
   if(linked?.deleted||linked&&linked.username!==account.username||current&&current.member!==account.member||current?.lineSubject&&current.lineSubject!==account.lineSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),lineSubject:account.lineSubject};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[lineKey,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true,account:structuredClone(updated)};
  },
  async registerWhatsApp(account){
   const whatsappKey=`whatsapp-identities/${account.whatsappSubject}`,mapping=values.get(whatsappKey)?.data;
   if(mapping)return {modified:false,reason:'whatsapp',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=values.get(memberKey)?.data,current=values.get(accountKey)?.data;
   if(linked?.deleted||linked&&linked.username!==account.username||current&&current.member!==account.member||current?.whatsappSubject&&current.whatsappSubject!==account.whatsappSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),whatsappSubject:account.whatsappSubject};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[whatsappKey,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true,account:structuredClone(updated)};
  },
  async getWithMetadata(key){const value=values.get(key);return value?structuredClone(value):null;},
  async pruneLineChallenges(now){for(const [key,row] of values)if(key.startsWith('line-challenges/')&&row.data.expires<=now)values.delete(key);},
  async pruneWhatsAppChallenges(now){for(const [key,row] of values)if(key.startsWith('whatsapp-challenges/')&&row.data.expires<=now)values.delete(key);},
  async deleteAccount(account,anonymousMember,attemptKeys,options={}){
   if(values.get(`accounts/${account.username}`)?.data.member!==account.member)return {modified:false};
   const {writes,deletes,photoKeys}=removalChanges([...values].map(([key,row])=>({key,data:row.data})),account,anonymousMember,attemptKeys,options);
   if(options.purgePhotos)this.deletePhotosSync(photoKeys,account.member);
   for(const key of deletes)values.delete(key);
   for(const [key,data] of writes)values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true};
  },
  deletePhotosSync(keys,member){for(const key of new Set([...keys,...[...values.keys()].filter(key=>key.startsWith(`photos/${member}/`))]))values.delete(key);},
  async get(key,{type}={}){const value=values.get(key)?.data;if(value===undefined)return null;return type==='arrayBuffer'?(value instanceof ArrayBuffer?value.slice(0):Uint8Array.from(value).buffer):structuredClone(value);},
  async setJSON(key,data,options={}){return this.set(key,structuredClone(data),options);},
  async deleteJSON(key){if(!/^push-(preferences|subscriptions|events|deliveries)\/[a-f0-9]{64}$/.test(key))throw Error('metadata_key');values.delete(key);},
  async set(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!metadataWriteAllowed(key,data,key=>values.get(key)?.data))return {modified:false};
   const previous=values.get(key);
   if(onlyIfNew&&previous||onlyIfMatch&&previous?.etag!==onlyIfMatch)return {modified:false};
   const etag=String(++revision);values.set(key,{data:structuredClone(data),etag,metadata:{}});
   if(notificationEvents&&key.startsWith('rooms/'))for(const event of roomNotificationEvents(previous?.data,data,now()))if(!values.has(event.key))values.set(event.key,{data:structuredClone(event.data),etag:String(++revision),metadata:{}});
   return {modified:true,etag};
  },
 };
}
