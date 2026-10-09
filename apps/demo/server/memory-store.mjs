// Test/development adapter only. The published demo uses Cloudflare durable SQLite.
import {removalChanges,metadataWriteAllowed} from './account-removal.mjs';
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
  async registerGoogle(account){
   const googleKey=`google-identities/${account.googleSubject}`,mapping=values.get(googleKey)?.data;
   if(mapping)return {modified:false,reason:'google',username:mapping.username};
   const memberKey=`members/${account.member}`,accountKey=`accounts/${account.username}`,linked=values.get(memberKey)?.data,current=values.get(accountKey)?.data;
   if(linked&&linked.username!==account.username||current&&current.member!==account.member||current?.googleSubject&&current.googleSubject!==account.googleSubject)return {modified:false,reason:'member'};
   const updated={...(current??account),googleSubject:account.googleSubject,googleEmail:account.googleEmail};
   for(const [key,data] of [[accountKey,updated],[memberKey,{username:account.username}],[googleKey,{username:account.username}]])values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true,account:structuredClone(updated)};
  },
  async getWithMetadata(key){const value=values.get(key);return value?structuredClone(value):null;},
  async deleteAccount(account,anonymousMember,attemptKeys){
   if(values.get(`accounts/${account.username}`)?.data.member!==account.member)return {modified:false};
   const {writes,deletes}=removalChanges([...values].map(([key,row])=>({key,data:row.data})),account,anonymousMember,attemptKeys);
   for(const key of deletes)values.delete(key);
   for(const [key,data] of writes)values.set(key,{data:structuredClone(data),etag:String(++revision),metadata:{}});
   return {modified:true};
  },
  async get(key,{type}={}){const value=values.get(key)?.data;if(value===undefined)return null;return type==='arrayBuffer'?(value instanceof ArrayBuffer?value.slice(0):Uint8Array.from(value).buffer):structuredClone(value);},
  async setJSON(key,data,options={}){return this.set(key,structuredClone(data),options);},
  async set(key,data,{onlyIfNew,onlyIfMatch}={}){
   if(!metadataWriteAllowed(key,data,key=>values.get(key)?.data))return {modified:false};
   const previous=values.get(key);
   if(onlyIfNew&&previous||onlyIfMatch&&previous?.etag!==onlyIfMatch)return {modified:false};
   const etag=String(++revision);values.set(key,{data:structuredClone(data),etag,metadata:{}});return {modified:true,etag};
  },
 };
}
