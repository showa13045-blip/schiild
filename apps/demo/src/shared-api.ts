import {browserStorage,browserSessionStorage,isWeekPreview} from './preview-mode.ts';
import {clearAccountStores,ACCOUNT_ERASE_EVENT} from './account-storage.ts';
import {t} from './copy';
import {w,whatsappError} from './whatsapp-copy';
import type {Work} from './model';
import type {Area} from './area';

export type Visibility='private'|'public';
export type SharedState={visibility:Visibility;concept:string;defaultConcept:string;code:string;name:string;capacity:number;members:number;day:string;seed:number;slot:number;postedSlots:number[];hasPhoto:boolean;canGenerate:boolean;area:Area;status:'open'|'generating'|'ready';works:{concept?:string;day:string;seed:number;count:number;index:number;custody:'self'|'other';area:Area}[]};
export type DirectoryAtelier={code:string;name:string;capacity:number;concept:string;members:number;total:number};
export type DirectoryPage={ateliers:DirectoryAtelier[];nextCursor:string|null};
export type SharedPreview={concept?:string;code:string;name:string;capacity:number;members:number;total:number;online:true};
const credentialKey='schiild.shared.credential.v2';
const sessionKey='schiild.account.session.v2';
let deletionNotified=false;
let identityGeneration=0;
export function clearAccountBrowser(notify=true,includeLocal=true){
 identityGeneration++;const stores:Storage[]=[];let accessible=true;
 for(const read of [...(includeLocal?[browserStorage]:[]),browserSessionStorage])try{stores.push(read());}catch{accessible=false;}
 let cleared=clearAccountStores(stores)&&accessible;
 if(notify)try{browserStorage().setItem(ACCOUNT_ERASE_EVENT,String(Date.now()));}catch{cleared=false;}
 return cleared;
}
export type Account={username:string;name:string;since:string;googleEmail?:string;lineLinked?:boolean;whatsappLinked?:boolean;hasPassword?:boolean;canDelete?:boolean;ateliers:{code:string;name:string;capacity:number;canGenerate:boolean}[];custody:{code:string;name:string;day:string;index:number}[]};
export function saveSession(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw Error('invalid_session');identityGeneration++;browserStorage().setItem(sessionKey,token);deletionNotified=false;}
export function clearSession(){identityGeneration++;browserStorage().removeItem(sessionKey);browserStorage().removeItem(credentialKey);}
export function currentSession(){return browserStorage().getItem(sessionKey);}
export class SharedError extends Error{constructor(public code:string,message:string){super(message);}}
export function sharedErrorMessage(key:string){
 const messages={global_already_recorded:'demo.global.already_recorded',concept_restricted:'demo.posts.concept_restricted',already_recorded:'demo.posts.already',source_forbidden:'demo.posts.source_forbidden',window_closed:'error.window_closed',forbidden:'demo.posts.target_forbidden',not_found:'join.error.not_found',full:'join.error.full',image_invalid:'demo.shared.image_invalid',retry:'demo.posts.retry'} as const;
 return t(key in messages?messages[key as keyof typeof messages]:'demo.shared.unavailable');
}
export function credential(){
 const session=browserStorage().getItem(sessionKey);if(session&&/^[a-f0-9]{64}$/.test(session))return session;
 let value=browserStorage().getItem(credentialKey);
 if(!value||!/^[a-f0-9]{64}$/.test(value)){
  value=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  browserStorage().setItem(credentialKey,value);
 }return value;
}
export async function sharedRequest<T=SharedState>(action:string,values:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 if(isWeekPreview){const {weekRequest}=await import('./week-preview');return weekRequest<T>(action,values,signal);}
 // Public API URL only. Secrets are never part of Expo's public environment.
 const endpoint=process.env.EXPO_PUBLIC_DEMO_API_URL||'/.netlify/functions/atelier';
 const requestCredential=credential(),generation=identityGeneration;
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${requestCredential}`},body:JSON.stringify({action,...values}),signal});
 let body;try{body=await response.json();}catch{throw Error(t('demo.shared.unavailable'));}
 if(!response.ok){
  const key=body.error;
  // A response for an old session must not clear a newly signed-in account.
  const current=(currentSession()||browserStorage().getItem(credentialKey))===requestCredential;
  if(key==='line_required'){if(current)window.dispatchEvent(new Event('schiild:line-required'));throw new SharedError(key,w('authRequired'));}
  if(current&&(key==='session_expired'||key==='unauthorized'))window.dispatchEvent(new Event('schiild:session-expired'));
  if(key==='account_deleted'){if(current&&!deletionNotified){deletionNotified=true;window.dispatchEvent(new Event('schiild:account-deleted'));}throw new SharedError(key,t('demo.delete.done'));}
  if(key==='concept_invalid'||key==='concept_forbidden')throw new SharedError(key,t(key==='concept_invalid'?'demo.concept.invalid':'demo.concept.forbidden'));
  if(key==='visibility_invalid'||key==='visibility_forbidden')throw new SharedError(key,t(key==='visibility_invalid'?'demo.visibility.invalid':'demo.visibility.forbidden'));
  if(key==='delete_requires_password')throw new SharedError(key,t('demo.delete.requires_password'));
  if(['line_invalid','line_expired','line_conflict','line_unavailable','line_not_registered','line_registered'].includes(key)){const messages={line_invalid:'demo.line.invalid',line_expired:'demo.line.expired',line_conflict:'demo.line.conflict',line_unavailable:'demo.line.unavailable',line_not_registered:'demo.line.not_registered',line_registered:'demo.line.registered'} as const;throw new SharedError(key,t(messages[key as keyof typeof messages]));}
  if(typeof key==='string'&&key.startsWith('whatsapp_'))throw new SharedError(key,whatsappError(key));
  const accountErrors={account_invalid:'demo.account.invalid',account_taken:'demo.account.taken',account_linked:'demo.account.linked',login_invalid:'demo.account.login_invalid',login_limited:'demo.account.limited',session_expired:'demo.account.expired',unauthorized:'demo.account.expired',slots_reserved:'demo.atelier.slots_reserved',google_invalid:'demo.google.invalid',google_expired:'demo.google.expired',google_conflict:'demo.google.conflict',google_unavailable:'demo.google.unavailable'} as const;
  throw new SharedError(key,key in accountErrors?t(accountErrors[key as keyof typeof accountErrors]):key==='global_already_recorded'||key==='concept_restricted'||key==='already_recorded'||key==='source_forbidden'?sharedErrorMessage(key):key==='not_found'?t('join.error.not_found'):key==='full'?t('join.error.full'):key==='window_closed'?t('error.window_closed'):key==='image_invalid'?t('demo.shared.image_invalid'):key==='no_photos'?t('demo.shared.no_photos'):key==='forbidden'?t('demo.shared.forbidden'):action==='draft'?t('demo.draft.failed'):t('demo.shared.unavailable'));
 }
 if(!['account.line.config','account.whatsapp.config'].includes(action)&&(generation!==identityGeneration||(currentSession()||browserStorage().getItem(credentialKey))!==requestCredential))throw new DOMException('Session changed','AbortError');
 return body as T;
}
export async function sharedPreview(code:string,signal?:AbortSignal){return {...await sharedRequest<Omit<SharedPreview,'online'>>('preview',{code},signal),online:true as const};}
export const fetchWork=(code:string,day:string)=>sharedRequest<Work>('work',{code,day});
