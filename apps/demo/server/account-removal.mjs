// DEMO ONLY. Erase account data atomically while retaining anonymous collective records.
import {snapshotDays} from './membership.mjs';
export const REMOVED_PHOTO='deleted-photo';
export function removalChanges(rows,account,anonymousMember,attemptKeys,{purgePhotos=false}={}){
 const writes=[],deletes=[`accounts/${account.username}`,...attemptKeys];
 const photoKeys=new Set();
 for(const {key,data} of rows){
  if(key.startsWith('rooms/')){
   const room=snapshotDays(structuredClone(data));let changed=false;
   const replace=value=>{if(value!==account.member)return value;changed=true;return anonymousMember;};
   for(const day of Object.values(room.days)){
    if(purgePhotos)for(const [slot,key] of Object.entries(day.posts))if(typeof key==='string'&&key.startsWith(`photos/${account.member}/`)){photoKeys.add(key);day.posts[slot]=REMOVED_PHOTO;changed=true;}
    day.members=day.members.map(replace);if(day.custodian)day.custodian=replace(day.custodian);
   }
   room.members=room.members.map(value=>{if(value!==account.member)return value;changed=true;return null;});
   if(room.creator===account.member){room.creator=room.members.find(Boolean)??null;changed=true;}
   if(changed)writes.push([key,room]);
  }else if(key.startsWith('globals/')&&data.pixels[account.member]){
   const next=structuredClone(data),pixel=next.pixels[account.member];
   if(purgePhotos){if(pixel.photoKey&&!Object.entries(data.pixels).some(([member,other])=>member!==account.member&&other.photoKey===pixel.photoKey))photoKeys.add(pixel.photoKey);delete pixel.photoKey;pixel.sourceDeleted=true;}
   next.pixels[anonymousMember]=pixel;delete next.pixels[account.member];writes.push([key,next]);
  }else if(key.startsWith('sessions/')&&data.username===account.username){
   // Keep only token revocation markers, without ID, member, email or display name.
   writes.push([key,{expires:0,revoked:true,deleted:true}]);
  }else if(/^(google|line|whatsapp)-identities\//.test(key)&&data.username===account.username||/^(google|line|whatsapp)-challenges\//.test(key)&&data.member===account.member)deletes.push(key);
  else if(/^push-(preferences|subscriptions|deliveries)\//.test(key)&&data.member===account.member)deletes.push(key);
  else if(key.startsWith('push-events/')&&data.recipients?.includes(account.member))writes.push([key,{...data,recipients:data.recipients.filter(member=>member!==account.member)}]);
 }
 writes.push([`members/${account.member}`,{deleted:true}]);
 return {writes,deletes,photoKeys:[...photoKeys]};
}
// Check at the actual write/transaction boundary, including requests begun before deletion.
export function metadataWriteAllowed(key,data,read){
 const deleted=member=>member&&read(`members/${member}`)?.deleted;
 if(key.startsWith('photos/')&&deleted(key.split('/')[1]))return false;
 if(key.startsWith('rooms/')){const members=new Set([data.creator,...data.members,...Object.values(data.days).flatMap(day=>[...(day.members??[]),day.custodian])]);if([...members].some(deleted))return false;}
 if(key.startsWith('globals/')&&Object.keys(data.pixels).some(deleted))return false;
 if(key.startsWith('accounts/')&&(deleted(data.member)||read(key)&&read(key).member!==data.member))return false;
 if(key.startsWith('members/')&&read(key)?.deleted&&!data.deleted)return false;
 if(/^(line|whatsapp)-challenges\//.test(key)&&deleted(data.member))return false;
 if(/^push-(preferences|subscriptions|deliveries)\//.test(key)&&deleted(data.member))return false;
 if(key.startsWith('sessions/')){if(read(key)?.deleted&&!data.deleted)return false;if(!data.revoked&&read(`accounts/${data.username}`)?.member!==data.member)return false;}
 return true;
}
