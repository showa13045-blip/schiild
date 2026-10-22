import React,{useState} from 'react';
import {t} from './copy';
import type {Account} from './shared-api';
import WhatsAppSignIn from './WhatsAppSignIn';
import type {WhatsAppResult} from './WhatsAppSignIn';
import {w} from './whatsapp-copy';
export default function DeleteAccountPage({account,onDelete,onWhatsAppComplete}:{account:Account;onDelete:(confirmUsername:string,password:string)=>Promise<void>;onWhatsAppComplete:(result:WhatsAppResult)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lineOnly=Boolean(account.lineLinked),whatsappOnly=Boolean(account.whatsappLinked&&!account.lineLinked),valid=username===account.username&&(lineOnly||whatsappOnly||password.length>0);
 async function submit(){if(!valid||busy)return;setBusy(true);setError('');try{await onDelete(username,password);setPassword('');}catch(cause){setError(cause instanceof Error?cause.message:t('error.server.body'));setConfirm(false);}finally{setBusy(false);}}
 return <section className="delete-account" data-testid="delete-account"><h1>{t('demo.delete.title')}</h1><p className="mono">@{account.username}</p><p>{t('demo.delete.body')}</p><p>{t('demo.delete.records')}</p><p>{t('demo.delete.local')}</p><form onSubmit={event=>{event.preventDefault();if(valid){setError('');setConfirm(true);}}}>
  <label className="field">{t('demo.delete.confirm_id')}<input value={username} required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={24} disabled={busy} onChange={event=>setUsername(event.target.value)}/></label>{lineOnly?<p>{t('demo.line.delete')}</p>:whatsappOnly?<p>{w('deleteNote')}</p>:<label className="field">{t('demo.account.password')}<input value={password} type="password" required autoComplete="current-password" maxLength={128} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label>}
  <button className="button secondary" disabled={!valid||busy}>{t('demo.delete.review')}</button>
 </form>{error&&<p className="error" role="alert">{error}</p>}
 {confirm&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-confirm"><h2 id="delete-account-confirm">{t('demo.delete.confirm')}</h2><p className="mono">@{account.username}</p><p>{t('demo.delete.body')}</p><p>{t('demo.delete.records')}</p><>{whatsappOnly?<WhatsAppSignIn intent="delete" confirmUsername={username} disabled={busy||!valid} onComplete={onWhatsAppComplete}/>:<button className="button delete-submit" disabled={busy||!valid} onClick={()=>void submit()}>{t(busy?'common.loading':'demo.delete.submit')}</button>}</><button className="button secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('delete.cancel')}</button></section></div>}
 </section>;
}
