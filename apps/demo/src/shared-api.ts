import {t} from './copy';
import type {Work} from './model';

export type SharedState={code:string;name:string;capacity:number;members:number;day:string;seed:number;slot:number;postedSlots:number[];hasPhoto:boolean;canGenerate:boolean;status:'open'|'generating'|'ready';works:{day:string;seed:number;count:number;index:number;custody:'self'|'other'}[]};
export type SharedPreview={code:string;name:string;capacity:number;members:number;total:number;online:true};
const credentialKey='schiild.shared.credential.v1';
const sessionKey='schiild.account.session.v1';
export type Account={username:string;name:string;since:string;ateliers:{code:string;name:string;capacity:number;canGenerate:boolean}[];custody:{code:string;name:string;day:string;index:number}[]};
export function saveSession(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_session');localStorage.setItem(sessionKey,token);}
export function clearSession(){localStorage.removeItem(sessionKey);localStorage.removeItem(credentialKey);}
export class SharedError extends Error{constructor(public code:string,message:string){super(message);}}
export function credential(){
 const session=localStorage.getItem(sessionKey);if(session&&/^[a-f0-9]{64}$/.test(session))return session;
 let value=localStorage.getItem(credentialKey);
 if(!value||!/^[a-f0-9]{64}$/.test(value)){
  value=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(credentialKey,value);
 }return value;
}
export async function sharedRequest<T=SharedState>(action:string,values:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 // Public API URL only. Secrets are never part of Expo's public environment.
 const endpoint=process.env.EXPO_PUBLIC_DEMO_API_URL||'/.netlify/functions/atelier';
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credential()}`},body:JSON.stringify({action,...values}),signal});
 let body;try{body=await response.json();}catch{throw Error(t('demo.shared.unavailable'));}
 if(!response.ok){
  const key=body.error;
  const accountErrors={account_invalid:'demo.account.invalid',account_taken:'demo.account.taken',account_linked:'demo.account.linked',login_invalid:'demo.account.login_invalid',login_limited:'demo.account.limited',session_expired:'demo.account.expired',unauthorized:'demo.account.expired',slots_reserved:'demo.atelier.slots_reserved'} as const;
  throw new SharedError(key,key in accountErrors?t(accountErrors[key as keyof typeof accountErrors]):key==='not_found'?t('join.error.not_found'):key==='full'?t('join.error.full'):key==='window_closed'?t('error.window_closed'):key==='image_invalid'?t('demo.shared.image_invalid'):key==='no_photos'?t('demo.shared.no_photos'):key==='forbidden'?t('demo.shared.forbidden'):t('demo.shared.unavailable'));
 }return body as T;
}
export async function sharedPreview(code:string,signal?:AbortSignal){return {...await sharedRequest<Omit<SharedPreview,'online'>>('preview',{code},signal),online:true as const};}
export const fetchWork=(code:string,day:string)=>sharedRequest<Work>('work',{code,day});
