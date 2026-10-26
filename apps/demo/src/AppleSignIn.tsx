import React,{useState} from 'react';
import {beginApple,nativeAppleAvailable} from './apple-login';
import {t} from './copy';
export default function AppleSignIn(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!nativeAppleAvailable())return null;
 async function start(intent:'login'|'register'){if(busy)return;setBusy(true);setError('');try{await beginApple(intent);}catch(cause){if(!(cause instanceof Error&&cause.name==='AbortError'))setError(cause instanceof Error?cause.message:t('error.server.body'));}finally{setBusy(false);}}
 return <div className="line-sign-in apple-sign-in"><a href="#apple-login" aria-disabled={busy} onClick={event=>{event.preventDefault();void start('login');}}>{busy?t('common.loading'):t('demo.line.login').replaceAll('LINE','Apple')}</a><p><a href="#apple-register" aria-disabled={busy} onClick={event=>{event.preventDefault();void start('register');}}>{t('demo.line.register').replaceAll('LINE','Apple')}</a></p>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
