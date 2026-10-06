import {t} from './copy';
import type {Work} from './model';

export type SharedState={code:string;name:string;capacity:number;members:number;day:string;seed:number;slot:number;postedSlots:number[];hasPhoto:boolean;canGenerate:boolean;status:'open'|'generating'|'ready';works:{day:string;seed:number;count:number;index:number;custody:'self'|'other'}[]};
export type SharedPreview={code:string;name:string;capacity:number;members:number;total:number;online:true};
const credentialKey='schiild.shared.credential.v1';
export function credential(){
 let value=localStorage.getItem(credentialKey);
 if(!value||!/^[a-f0-9]{64}$/.test(value)){
  value=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(credentialKey,value);
 }return value;
}
export async function sharedRequest<T=SharedState>(action:string,values:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 const response=await fetch('/.netlify/functions/atelier',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credential()}`},body:JSON.stringify({action,...values}),signal});
 let body;try{body=await response.json();}catch{throw Error(t('demo.shared.unavailable'));}
 if(!response.ok){
  const key=body.error;
  throw Error(key==='not_found'?t('join.error.not_found'):key==='full'?t('join.error.full'):key==='window_closed'?t('error.window_closed'):key==='image_invalid'?t('demo.shared.image_invalid'):key==='no_photos'?t('demo.shared.no_photos'):key==='forbidden'?t('demo.shared.forbidden'):t('demo.shared.unavailable'));
 }return body as T;
}
export async function sharedPreview(code:string,signal?:AbortSignal){return {...await sharedRequest<Omit<SharedPreview,'online'>>('preview',{code},signal),online:true as const};}
export const fetchWork=(code:string,day:string)=>sharedRequest<Work>('work',{code,day});
