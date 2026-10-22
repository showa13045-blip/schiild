import AtelierNameLabel from './AtelierNameLabel';
import {isWeekPreview} from './preview-mode.ts';
import React,{useEffect,useState} from 'react';
import {t} from './copy';
import HelpDetails from './HelpDetails';
import LanguageSelect from './LanguageSelect';
import type {Language} from './language';
import type {Account} from './shared-api';
import type {Preferences} from './preferences';
import LineSignIn from './LineSignIn';
import {w} from './whatsapp-copy';
import {AreaTotals} from './AreaDisplay';
import NotificationSettings from './NotificationSettings';
import {localAreas} from './area';
import type {AreaSummary} from './area';
import {sharedRequest} from './shared-api';
import type {Collection} from './ateliers';
export default function AccountPage({account,collection,onPosts,onName,onArchive,onSettings,onCustody}:{account:Account;collection:Collection;onPosts:()=>void;onName:(name:string)=>Promise<void>;onArchive:()=>void;onSettings:()=>void;onCustody:(code:string,day:string)=>void}){
 const [displayName,setDisplayName]=useState(account.name),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setDisplayName(account.name),[account.username,account.name]);
 async function submit(task:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await task();}catch(cause){setError(cause instanceof Error?cause.message:t('error.server.body'));}finally{setBusy(false);}}
 const [areas,setAreas]=useState<AreaSummary|null>(null),[areaError,setAreaError]=useState(''),local=localAreas(collection);
 useEffect(()=>{const controller=new AbortController();void sharedRequest<AreaSummary>('area',{},controller.signal).then(setAreas).catch(cause=>{if(!controller.signal.aborted)setAreaError(cause instanceof Error?cause.message:t('error.server.body'));});return()=>controller.abort();},[account.username]);
 return <section className="account-page" data-testid="profile-page"><h1>{t('me.title')}</h1><p className="mono">@{account.username} ／ {t('me.since',{date:account.since})}</p><div className="stats"><div><span>{t('me.stat.joined')}</span><b>{account.ateliers.length}</b></div><div><span>{t('me.stat.custody')}</span><b>{account.custody.length}</b></div></div>
 {isWeekPreview?<p>{account.name}</p>:<form onSubmit={event=>{event.preventDefault();void submit(()=>onName(displayName));}}><label className="field">{t('demo.account.name')}<input autoComplete="off" name="schiild-display-name" value={displayName} maxLength={40} required onChange={event=>setDisplayName(event.target.value)}/></label><button className="button" disabled={busy}>{t('common.done')}</button></form>}{account.whatsappLinked?<p>{w('linked')}</p>:<LineSignIn disabled={busy} linked={account.lineLinked}/>}<h2>{t('me.section.custody')}</h2>{account.custody.length?account.custody.map(item=><button className="atelier-select" key={item.code+item.day} onClick={()=>onCustody(item.code,item.day)}><span className="atelier-name"><AtelierNameLabel/>{item.name}</span><span className="mono">{item.day}</span></button>):<p>{t('empty.custody.title')}</p>}
 {areas?<AreaTotals value={areas}/>:!areaError&&<p>{t('common.loading')}</p>}{areaError&&<p role="alert" className="error">{areaError}</p>}{local.atelier.pixels>0&&<AreaTotals value={local} local/>}<button className="atelier-select" onClick={onPosts}>{t('demo.posts.title')}</button>{error&&<p className="error" role="alert">{error}</p>}<button className="atelier-select" onClick={onArchive}>{t('me.link.archive')}</button><button className="atelier-select" onClick={onSettings}>{t('me.link.settings')}</button></section>;
}
export function SettingsPage({language,onLanguage,value,onChange,account,onAccount,onLogout,onDelete}:{language:Language;onLanguage:(value:Language)=>void;value:Preferences;onChange:(value:Preferences)=>void;account:Account|null;onAccount:()=>void;onLogout:()=>Promise<void>;onDelete:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setError(''),[language]);
 return <section className="settings-page"><h1>{t('settings.title')}</h1><LanguageSelect value={language} onChange={onLanguage}/><button className="atelier-select" onClick={onAccount}>{t('settings.account')}</button><label className="setting-toggle"><span>{t('demo.settings.motion')}</span><input type="checkbox" checked={value.reduceMotion} onChange={event=>onChange({...value,reduceMotion:event.target.checked})}/></label><NotificationSettings language={language}/><HelpDetails label="settings.privacy"><p>{t('demo.settings.privacy')}</p><p>{t('demo.push.note')}</p><p>{t('demo.settings.notification_privacy')}</p></HelpDetails>{account&&!isWeekPreview&&<button className="button secondary" disabled={busy} onClick={()=>{setBusy(true);setError('');void onLogout().catch(cause=>setError(cause instanceof Error?cause.message:t('error.server.body'))).finally(()=>setBusy(false));}}>{t('settings.logout')}</button>}{account&&account.canDelete!==false&&<button className='button secondary settings-delete' disabled={busy} onClick={onDelete}>{t('settings.delete_account')}</button>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
