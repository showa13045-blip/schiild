import React,{useState} from 'react';
import {sharedRequest,saveSession} from './shared-api';
import {t} from './copy';
export default function ReviewSignIn(){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section><h1>App Review</h1><p>通常のアカウントとは別の審査用環境です。 / Isolated review environment.</p><form onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');void sharedRequest<{token:string}>('account.review.login',{username,password}).then(result=>{saveSession(result.token);location.replace('/review/');}).catch(()=>setError(t('demo.account.login_invalid'))).finally(()=>setBusy(false));}}><label className="field">{t('demo.account.id')}<input autoComplete="username" required value={username} onChange={event=>setUsername(event.target.value)} maxLength={24}/></label><label className="field">{t('demo.account.password')}<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} maxLength={128}/></label><button className="button" disabled={busy}>{t(busy?'common.loading':'demo.account.login')}</button>{error&&<p role="alert">{error}</p>}</form><a href="/">Schiild</a></section>;
}
