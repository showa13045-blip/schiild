import React,{useEffect,useRef,useState} from 'react';
import {sharedRequest} from './shared-api';
import type {Account} from './shared-api';
import {browserSessionStorage} from './preview-mode';
import {w} from './whatsapp-copy';
import {t} from './copy';
export type WhatsAppResult={token:string;account:Account}|{deleted:true};
type Pending={state:string;intent:'login'|'register'|'delete';url:string;expires:number;confirmUsername?:string};
const key='schiild.whatsapp.pending.v1';
function valid(value:Pending){try{const url=new URL(value.url);return /^[a-f0-9]{64}$/.test(value.state)&&['login','register','delete'].includes(value.intent)&&value.expires>Date.now()&&value.expires<=Date.now()+300000&&url.origin==='https://wa.me'&&/^\/[1-9][0-9]{6,14}$/.test(url.pathname)&&url.searchParams.get('text')?.includes(value.state);}catch{return false;}}
function restore(intent?:string,confirmUsername?:string):Pending|null{try{const value=JSON.parse(browserSessionStorage().getItem(key)??'null');return value&&valid(value)&&(!intent||intent===value.intent)&&value.confirmUsername===confirmUsername?value:null;}catch{return null;}}
export default function WhatsAppSignIn({onComplete,intent,confirmUsername,disabled=false}:{onComplete:(result:WhatsAppResult)=>void;intent?:'delete';confirmUsername?:string;disabled?:boolean}){
 const [enabled,setEnabled]=useState(false),[pending,setPending]=useState<Pending|null>(()=>restore(intent,confirmUsername)),[received,setReceived]=useState(false),[hint,setHint]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=useRef(pending),checking=useRef(false),mounted=useRef(true);current.current=pending;
 useEffect(()=>{mounted.current=true;const controller=new AbortController();void sharedRequest<{enabled:boolean}>('account.whatsapp.config',{},controller.signal).then(value=>setEnabled(value.enabled)).catch(()=>{});return()=>{mounted.current=false;controller.abort();};},[]);
 function clear(){current.current=null;setPending(null);setReceived(false);setHint('');setError('');try{browserSessionStorage().removeItem(key);}catch{/* A non-persistent attempt can still finish in this tab. */}}
 async function start(nextIntent:'login'|'register'|'delete'){
  if(busy||disabled)return;setBusy(true);setError('');
  try{const value=await sharedRequest<Pending>('account.whatsapp.start',{intent:nextIntent,confirmUsername});if(!mounted.current)return;if(!valid(value))throw Error(w('unavailable'));const next={...value,confirmUsername};current.current=next;setPending(next);setReceived(false);setHint('');try{browserSessionStorage().setItem(key,JSON.stringify(next));}catch{/* Keep the live attempt in memory. */}}
  catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:w('unavailable'));}finally{if(mounted.current)setBusy(false);}
 }
 async function check(manual=false){
  const value=current.current;if(!value||checking.current||received)return;
  if(value.expires<=Date.now()){setError(w('expired'));return;}
  checking.current=true;
  try{const result=await sharedRequest<{received:boolean;hint:string}>('account.whatsapp.status',{state:value.state});if(!mounted.current||current.current?.state!==value.state)return;setReceived(result.received);setHint(result.hint);if(manual&&!result.received)setError(w('pending'));else setError('');}
  catch(cause){if(mounted.current&&current.current?.state===value.state)setError(cause instanceof Error?cause.message:w('unavailable'));}finally{checking.current=false;}
 }
 useEffect(()=>{if(!pending||received)return;const resume=()=>{if(document.visibilityState==='visible')void check();};const interval=setInterval(resume,10000);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{clearInterval(interval);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};},[pending?.state,received]);
 async function finish(){
  const value=current.current;if(!value||busy||!received)return;setBusy(true);setError('');
  try{const result=await sharedRequest<WhatsAppResult>('account.whatsapp.complete',{state:value.state,intent:value.intent});if(!mounted.current||current.current?.state!==value.state)return;clear();onComplete(result);}
  catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:w('unavailable'));}finally{if(mounted.current)setBusy(false);}
 }
 if(!enabled)return null;
 return <div className="whatsapp-sign-in" data-testid="whatsapp-sign-in">{pending?<>
  <p>{w('note')}</p><a className="button secondary" href={pending.url} target="_blank" rel="noopener noreferrer">{w('open')}</a>
  {received?<><p role="status">{w('received',{hint})}</p><button className="button" disabled={busy||disabled} onClick={()=>void finish()}>{busy?t('common.loading'):intent==='delete'?t('demo.delete.submit'):w('finish')}</button></>:<><p role="status">{w('waiting')}</p><button className="text-button" disabled={busy||disabled} onClick={()=>void check(true)}>{w('check')}</button></>}
  <p><button className="text-button" disabled={busy} onClick={clear}>{w('restart')}</button></p>
 </>:intent==='delete'?<button className="button secondary" disabled={busy||disabled} onClick={()=>void start('delete')}>{w('delete')}</button>:<><button className="text-button" disabled={busy||disabled} onClick={()=>void start('login')}>{w('login')}</button><p><button className="text-button" disabled={busy||disabled} onClick={()=>void start('register')}>{w('register')}</button></p></>}
 {error&&<p className="error" role="alert">{error}</p>}</div>;
}
