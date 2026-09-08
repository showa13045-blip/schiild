// DEMO ONLY: local identity and invitation snapshots; no authentication or synchronization.
import {initial,load,dayAfter} from './model';
import type {State} from './model';
export type Invitation={code:string;name:string;capacity:number};
export type Atelier=Invitation&{creator:string|null;activeFrom:string;state:State};
export type Collection={version:2;device:string;selected:string;ateliers:Atelier[]};
export const COLLECTION='schiild.demo.ateliers.v2';
export function restore():Collection{
 try{const value=JSON.parse(localStorage.getItem(COLLECTION)||'null');if(value?.version===2&&typeof value.device==='string'&&Array.isArray(value.ateliers))return value;}catch{/* Fall back to the original demo. */}
 const state=load();return {version:2,device:crypto.randomUUID(),selected:'ASADEMO1',ateliers:[{code:'ASADEMO1',name:'あさ',capacity:12,creator:null,activeFrom:state.day,state}]};
}
export function newCode(){return Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');}
export function inviteUrl(atelier:Invitation){return `${location.origin}${location.pathname}#invite=${encodeURIComponent(JSON.stringify({code:atelier.code,name:atelier.name,capacity:atelier.capacity}))}`;}
export function parseInvite(value:string):Invitation|null{
 try{const hash=value.includes('#')?value.slice(value.indexOf('#')+1):value.replace(/^#/,'');const raw=new URLSearchParams(hash).get('invite');if(!raw||raw.length>1000)return null;const data=JSON.parse(raw);if(!/^[A-Z0-9]{8}$/.test(data.code)||typeof data.name!=='string'||!data.name.trim()||data.name.length>40||![2,5,12,20].includes(data.capacity))return null;return {code:data.code,name:data.name.trim(),capacity:data.capacity};}catch{return null;}
}
export function addAtelier(collection:Collection,invitation:Invitation,created:boolean):Collection{
 if(collection.ateliers.some(a=>a.code===invitation.code))return collection;
 const day=collection.ateliers.find(a=>a.code===collection.selected)?.state.day??new Date().toISOString().slice(0,10);
 const state=initial(invitation.capacity,false);state.day=day;
 const activeFrom=created?day:dayAfter(day);
 const shared=collection.ateliers.find(a=>a.state.day===day&&a.state.photo)?.state.photo;
 if(created&&shared){state.photo=shared;state.count=1;}
 return {...collection,selected:invitation.code,ateliers:[...collection.ateliers,{...invitation,creator:created?collection.device:null,activeFrom,state}]};
}
export function removeAtelier(collection:Collection,code:string):Collection{
 const target=collection.ateliers.find(a=>a.code===code);if(!target||target.creator!==collection.device)return collection;
 const ateliers=collection.ateliers.filter(a=>a.code!==code);return {...collection,ateliers,selected:collection.selected===code?(ateliers[0]?.code??''):collection.selected};
}
