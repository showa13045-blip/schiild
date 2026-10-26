// iOS interface for the already deployed inbound-message authentication API.
// No OTP delivery, telephone-number entry or replacement backend is introduced.
import React,{useEffect,useState} from 'react';
import {sharedRequest,saveSession,clearAccountBrowser} from './shared-api';
import {nativeAppleAvailable} from './apple-login';
import {t} from './copy';
export default function WhatsAppSignIn({deleteUsername}:{deleteUsername?:string}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<{state:string;intent:string;url:string}|null>(null);
 useEffect(()=>{if(nativeAppleAvailable())void sharedRequest<{enabled:boolean}>('account.whatsapp.config').then(result=>setEnabled(result.enabled)).catch(()=>{});},[]);
 async function start(intent:'login'|'register'|'delete'){if(busy)return;setBusy(true);setError('');try{setPending(await sharedRequest('account.whatsapp.start',{intent,confirmUsername:deleteUsername}));}catch(cause){setError(cause instanceof Error?cause.message:t('error.server.body'));}finally{setBusy(false);}}
 async function complete(){if(!pending||busy)return;setBusy(true);setError('');try{const result=await sharedRequest<{token:string}|{deleted:true}>('account.whatsapp.complete',{state:pending.state,intent:pending.intent});if('deleted' in result){clearAccountBrowser();window.dispatchEvent(new Event('schiild:account-deleted'));return;}saveSession(result.token);location.replace(location.pathname);}catch{setError(t('demo.shared.unavailable'));}finally{setBusy(false);}}
 if(!enabled)return null;
 return <div className="line-sign-in whatsapp-sign-in">{pending?<><a href={pending.url} target="_blank" rel="noopener noreferrer">WhatsApp</a><p><button className="text-button" disabled={busy} onClick={()=>void complete()}>{t('common.done')}</button></p><button className="text-button" disabled={busy} onClick={()=>setPending(null)}>{t('common.back')}</button></>:deleteUsername?<button className="button delete-submit" disabled={busy} onClick={()=>void start('delete')}>{t('demo.delete.submit')}</button>:<><button className="text-button" disabled={busy} onClick={()=>void start('login')}>{t('demo.line.login').replaceAll('LINE','WhatsApp')}</button><p><button className="text-button" disabled={busy} onClick={()=>void start('register')}>{t('demo.line.register').replaceAll('LINE','WhatsApp')}</button></p></>}{error&&<p role="alert" className="error">{error}</p>}</div>;
}
