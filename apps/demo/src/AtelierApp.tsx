import PublicAtelierPage from './PublicAtelierPage';
import {rememberAuthDestination,takeAuthDestination} from './auth-return';
import AtelierNameLabel from './AtelierNameLabel';
import {refreshPush,disablePush} from './push-client';
import WeekNotice from './WeekNotice';
import {localizeWeekData} from './week-localization';
import {browserStorage,isWeekPreview,demoDay} from './preview-mode.ts';
import React,{useEffect,useRef,useState} from 'react';
import {Experience} from '../App';
import HelpDetails from './HelpDetails';
import {WORK_SIZE} from './resolution';
import {CONCEPT_LIMIT} from './concept';
import AtelierConcept from './AtelierConcept';
import {activateLanguage,readLanguage,saveLanguage} from './language';
import type {Language} from './language';
import SharedExperience from './SharedExperience';
import {t} from './copy';
import {partition,random} from './engine';
import {COLLECTION,restore,inviteUrl,parseInvite,addAtelier,removeAtelier,leaveAtelier,reuseLocal} from './ateliers';
import {sharedPreview,sharedRequest,saveSession,clearSession,clearAccountBrowser,SharedError} from './shared-api';
import type {Account} from './shared-api';
import DemoNav from './DemoNav';
import DiscoverPage from './DiscoverPage';
import AtelierVisibility,{VisibilityField} from './AtelierVisibility';
import type {Visibility,DirectoryAtelier} from './shared-api';
import useSwipe from './useSwipe';
import type {Navigation} from './DemoNav';
import GlobalPage from './GlobalPage';
import type {GlobalSelection} from './GlobalPage';
import AccountPage,{SettingsPage} from './AccountPage';
import AuthPage from './AuthPage';
import type {WhatsAppResult} from './WhatsAppSignIn';
import ArchiveCalendar from './ArchiveCalendar';
import {resetBrowser} from './browser-reset';
import DailyPostsPage from './DailyPostsPage';
import type {PostSelection} from './DailyPostsPage';
import DeleteAccountPage from './DeleteAccountPage';
import {googleLogout} from './GoogleSignIn';
import {takeLineCallback,completeLine,beginLine,hasPendingLineDeletion} from './line-login';
import {watchAccountLifecycle} from './account-lifecycle';
import {currentSession} from './shared-api';
import {preferences,savePreferences} from './preferences';
import type {Preferences} from './preferences';
import type {SharedPreview} from './shared-api';
import type {Collection,Invitation,Atelier} from './ateliers';
import type {State,Work} from './model';

export default function AtelierApp(){
 const [browserReady]=useState(resetBrowser);
 const [lineCallback]=useState(takeLineCallback),lineFinished=useRef(false),lineInProgress=useRef(Boolean(lineCallback));
 const [publicCode,setPublicCode]=useState('');
 const [visibility,setVisibility]=useState<Visibility>('private');
 const [concept,setConcept]=useState(''),[experienceScreen,setExperienceScreen]=useState('home');
 const [postSelection,setPostSelection]=useState<PostSelection|undefined>();
 const [language,setLanguage]=useState(readLanguage);activateLanguage(language);
 useEffect(()=>{document.documentElement.lang=language;},[language]);
 const [collection,setCollection]=useState<Collection|null>(null),[view,setView]=useState('experience'),[name,setName]=useState(''),[capacity,setCapacity]=useState(12),[input,setInput]=useState(''),[invitation,setInvitation]=useState<Invitation|null>(null),[sharing,setSharing]=useState<Atelier|null>(null),[deleting,setDeleting]=useState<string|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),accountSequence=useRef(0);
 const [navigation,setNavigation]=useState<Navigation>({screen:'home',revision:0}),[globalSelection,setGlobalSelection]=useState<GlobalSelection>({day:demoDay()}),[account,setAccount]=useState<Account|null>(null),[accountRevision,setAccountRevision]=useState(0),[settings,setSettings]=useState(preferences);
 const participant=isWeekPreview||Boolean(account?.lineLinked||account?.whatsappLinked);
 useEffect(()=>{const required=()=>{accountSequence.current++;setAccount(null);setView('auth');};window.addEventListener('schiild:line-required',required);return()=>window.removeEventListener('schiild:line-required',required);},[]);
 useEffect(()=>{const removed=()=>finishDeletion();window.addEventListener('schiild:account-deleted',removed);return()=>window.removeEventListener('schiild:account-deleted',removed);},[]);
 useEffect(()=>{const expired=()=>{accountSequence.current++;clearSession();setAccount(null);setAccountRevision(value=>value+1);setCollection(current=>current?{...current,ateliers:current.ateliers.filter(entry=>!entry.online),selected:current.ateliers.find(entry=>!entry.online)?.code??''}:current);setView('auth');};window.addEventListener('schiild:session-expired',expired);return()=>window.removeEventListener('schiild:session-expired',expired);},[]);
 useEffect(()=>{if(!browserReady)return;setCollection(restore());function receive(){const incoming=parseInvite(location.hash);if(incoming){setInvitation(incoming);setInput(incoming.online?incoming.code:location.href);setView('join');}history.replaceState(null,'',location.pathname+location.search);}receive();window.addEventListener('hashchange',receive);return()=>window.removeEventListener('hashchange',receive);},[]);
 useEffect(()=>{if(collection)try{browserStorage().setItem(COLLECTION,JSON.stringify(collection));}catch{setMessage(t('error.server.title'));}},[collection]);
 useEffect(()=>{if(view!=='me'||!account)return;const controller=new AbortController(),request=accountSequence.current,session=currentSession();void sharedRequest<{account:Account|null}>('account.me',{},controller.signal).then(value=>{if(!controller.signal.aborted&&request===accountSequence.current&&session===currentSession())setAccount(value.account);}).catch(cause=>{if(!controller.signal.aborted)setMessage(cause instanceof Error?cause.message:t('error.server.body'));});return()=>controller.abort();},[view]);
 useEffect(()=>{if(!collection||lineCallback)return;const controller=new AbortController(),request=++accountSequence.current;void sharedRequest<{account:Account|null}>('account.me',{},controller.signal).then(value=>{if(request===accountSequence.current){setAccount(value.account);if(value.account){restoreMembership(value.account);if(hasPendingLineDeletion()){setView('delete-account');setMessage(t('demo.delete.failed'));}}else if(['global','atelier'].includes(new URLSearchParams(location.search).get('push')??''))setView('auth');}}).catch(cause=>{if(!controller.signal.aborted&&request===accountSequence.current){if(cause instanceof SharedError&&['session_expired','unauthorized'].includes(cause.code)){clearSession();setAccount(null);setView('auth');}setMessage(cause instanceof Error?cause.message:t('error.server.body'));}});return()=>controller.abort();},[collection?.device]);
 useEffect(()=>{if(!collection||!lineCallback||lineFinished.current)return;lineFinished.current=true;const request=++accountSequence.current;setView('account-check');void completeLine(lineCallback).then(result=>{if(request!==accountSequence.current)return;if('deleted' in result){finishDeletion();return;}saveSession(result.token);setAccount(result.account);restoreMembership(result.account);setAccountRevision(value=>value+1);setMessage('');const destination=takeAuthDestination();if(destination){setInput(destination.code);setInvitation(null);setView(destination.view);}else setView('me');}).catch(async cause=>{if(request!==accountSequence.current)return;const detail=cause instanceof Error?cause.message:t('demo.line.invalid');if(lineCallback.intent==='delete'){try{const value=await sharedRequest<{account:Account|null}>('account.me');if(request!==accountSequence.current)return;setAccount(value.account);setView(value.account?'delete-account':'auth');setMessage(t('demo.delete.failed')+' '+detail);}catch{if(request===accountSequence.current){setView('auth');setMessage(t('demo.delete.failed')+' '+detail);}}}else{setView('auth');setMessage(detail);}}).finally(()=>{lineInProgress.current=false;});},[collection?.device]);
 useEffect(()=>{
  if(isWeekPreview||!collection)return;
  const refresh=(changed=false)=>{
   if(lineInProgress.current)return;
   const request=++accountSequence.current,session=currentSession(),deletionPending=hasPendingLineDeletion();
   if(changed){setAccount(null);setSharing(null);setInvitation(null);setCollection(current=>current?{...current,ateliers:current.ateliers.filter(entry=>!entry.online),selected:''}:current);setView('account-check');}
   void sharedRequest<{account:Account|null}>('account.me').then(value=>{
    if(request!==accountSequence.current||session!==currentSession())return;
    setAccount(value.account);
    if(value.account)restoreMembership(value.account);
    else setCollection(current=>current?{...current,ateliers:current.ateliers.filter(entry=>!entry.online),selected:''}:current);
    if(value.account&&deletionPending){setView('delete-account');setMessage(t('demo.delete.failed'));}
    else if(changed||!value.account)setView(previous=>changed||['me','settings','delete-account','account-check'].includes(previous)?value.account?'me':'auth':previous);
   }).catch(cause=>{if(request===accountSequence.current)setMessage(cause instanceof Error?cause.message:t('error.server.body'));});
  };
  return watchAccountLifecycle({target:window,document,readSession:currentSession,onChange:()=>refresh(true),onResume:()=>refresh(),onErase:()=>finishDeletion(false)});
 },[Boolean(collection)]);
 useEffect(()=>{
  if(view!=='join'||!input)return;
  const incoming=parseInvite(input);
  if(incoming&&!incoming.online){setInvitation(incoming);return;}
  const code=(incoming?.code??input.trim()).toUpperCase();
  const departed=collection?.departed?.find(entry=>!entry.online&&entry.code===code);
  if(departed){setInvitation({code:departed.code,name:departed.name,capacity:departed.capacity});return;}
  setInvitation(null);if(!/^[A-Z0-9]{8}$/.test(code))return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{void sharedPreview(code,controller.signal).then(value=>{setInvitation(value);setMessage('');}).catch(error=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:t('demo.shared.unavailable'));});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[input,view]);
 const tabSwipe=useSwipe({
  canStart:(target,surface)=>{
   if(!['experience','list','global','empty-archive','discover'].includes(view))return false;
   const screen=surface.querySelector('[data-tab-screen]')?.getAttribute('data-tab-screen');
   if(screen&&!['home','archive'].includes(screen))return false;
   if(target.closest('.global-explorer,.operator,input,textarea,select,a,summary,[contenteditable],[role=slider]'))return false;
   return !target.closest('button')||Boolean(target.closest('.nav,.discover-card'));
  },
  onSwipe:direction=>{
   const screen=document.querySelector('[data-tab-screen]')?.getAttribute('data-tab-screen');
   const current=view==='discover'?3:view==='global'?1:view==='empty-archive'||screen==='archive'&&view==='experience'?2:0,next=current+direction;
   if(next===0)visit('home');else if(next===1)showGlobal(demoDay());else if(next===2)visit('archive');else if(next===3)go('discover');
  },
 });
 useEffect(()=>{if(account&&!isWeekPreview)void refreshPush(language).catch(()=>{});},[account?.username,accountRevision,language]);
 useEffect(()=>{
  if(!account||!collection)return;
  const url=new URL(location.href),kind=url.searchParams.get('push'),day=url.searchParams.get('day'),code=url.searchParams.get('code');
  if(!['global','atelier'].includes(kind??'')||!/^\d{4}-\d{2}-\d{2}$/.test(day??''))return;
  if(kind==='global')showGlobal(day!);
  else if(account.ateliers.some(room=>room.code===code)&&collection.ateliers.some(room=>room.code===code)){
   setCollection({...collection,selected:code!});setNavigation(previous=>({screen:'home',openDay:url.searchParams.get('ready')==='1'?day!:undefined,revision:previous.revision+1}));go('experience');
  }else if(kind==='atelier'&&account.ateliers.some(room=>room.code===code))return;
  for(const key of ['push','day','code','ready'])url.searchParams.delete(key);history.replaceState(null,'',url.pathname+url.search+url.hash);
 },[account?.username,collection?.ateliers.length]);
 if(!browserReady)return <main className="app"><p className="error" role="alert">{t('demo.reset.storage')}</p></main>;
 if(!collection)return <div className="loading">{t('common.loading')}</div>;
 const visibleAteliers=participant?collection.ateliers:[];
 const active=visibleAteliers.find(a=>a.code===collection.selected);
 function change(state:State){
  if(!collection)return;
  const next={...collection,ateliers:collection.ateliers.map(a=>a.code===collection.selected?{...a,state}:a)};
  browserStorage().setItem(COLLECTION,JSON.stringify(next));setCollection(next);
 }
 function reuseLocalPosts(day:string,photo:string,codes:string[]){
  const next=reuseLocal(collection!,day,photo,codes);
  try{browserStorage().setItem(COLLECTION,JSON.stringify(next.collection));setCollection(next.collection);return next.results;}
  catch{return next.results.map(result=>({...result,done:false,error:'unavailable'}));}
 }
 function go(next:string){setMessage('');if(!participant&&['create','posts','share','me','settings','delete-account'].includes(next)){if(next==='create')rememberAuthDestination('create');setView('auth');}else setView(next);window.scrollTo(0,0);}
 function showPosts(source?:PostSelection){setPostSelection(source);go('posts');}
 async function openAccount(){const request=++accountSequence.current;go('account-check');try{const value=await sharedRequest<{account:Account|null}>('account.me');if(request!==accountSequence.current)return;setAccount(value.account);setView(previous=>previous==='account-check'?(value.account?'me':'auth'):previous);}catch(cause){if(request===accountSequence.current){setAccount(null);setView('auth');setMessage(cause instanceof Error?cause.message:t('error.server.body'));}}}
 function visit(screen:'home'|'archive',openDay?:string){setNavigation(previous=>({screen,openDay,revision:previous.revision+1}));go(active?'experience':screen==='archive'?'empty-archive':'list');}
 function showGlobal(day:string,sample?:Work){setGlobalSelection({day,sample});go('global');}
 function restoreMembership(profile:Account){setCollection(current=>{
  if(!current)return current;let next={...current,ateliers:current.ateliers.filter(entry=>!entry.online)};
  for(const room of profile.ateliers)next=addAtelier(next,{code:room.code,name:room.name,capacity:room.capacity,online:true},room.canGenerate);
  if(profile.ateliers.some(room=>room.code===current.selected))next.selected=current.selected;
  else if(isWeekPreview&&profile.ateliers.length)next.selected=profile.ateliers[0].code;
  return next;
 });}
 function acceptWhatsApp(result:WhatsAppResult){
  accountSequence.current++;if('deleted' in result){finishDeletion();return;}
  saveSession(result.token);setAccount(result.account);restoreMembership(result.account);setAccountRevision(value=>value+1);setMessage('');
  const destination=takeAuthDestination();if(destination){setInput(destination.code);setInvitation(null);setView(destination.view);}else setView('me');
 }
 async function updateName(name:string){const request=accountSequence.current,session=currentSession(),result=await sharedRequest<{account:Account}>('account.update',{name});if(request===accountSequence.current&&session===currentSession())setAccount(result.account);}
 function changeLanguage(value:Language){try{saveLanguage(value);if(isWeekPreview){setAccount(current=>current?localizeWeekData(current,value):current);setCollection(current=>current?localizeWeekData(current,value):current);setSharing(current=>current?localizeWeekData(current,value):current);setInvitation(current=>current?localizeWeekData(current,value):current);}setLanguage(value);setMessage('');}catch{setMessage(t('error.server.title'));}}
 function updateSettings(value:Preferences){try{savePreferences(value);setSettings(value);}catch{setMessage(t('error.server.title'));}}
 async function logout(){accountSequence.current++;await disablePush().catch(()=>{});await sharedRequest('account.logout');clearSession();googleLogout();setAccount(null);setAccountRevision(value=>value+1);setCollection(current=>current?{...current,ateliers:current.ateliers.filter(entry=>!entry.online),selected:current.ateliers.find(entry=>!entry.online)?.code??''}:current);setView('auth');}
 function finishDeletion(notify=true){accountSequence.current++;const cleared=clearAccountBrowser(notify,notify);if(notify)resetBrowser();googleLogout();setAccount(null);setAccountRevision(value=>value+1);setSettings({name:'',reduceMotion:false});setName('');setInput('');setConcept('');setPublicCode('');setPostSelection(undefined);setDeleting(null);setGlobalSelection({day:demoDay()});setCollection({version:3,device:crypto.randomUUID(),selected:'',ateliers:[]});setNavigation(previous=>({screen:'home',revision:previous.revision+1}));setSharing(null);setInvitation(null);setView('auth');setMessage(t(cleared?'demo.delete.done':'demo.delete.local_failed'));window.scrollTo(0,0);}
 async function deleteAccount(confirmUsername:string,password:string){if(account?.lineLinked){await beginLine('delete',confirmUsername);return;}accountSequence.current++;await sharedRequest<{done:boolean}>('account.delete',{confirmUsername,password});finishDeletion();}
 async function operation(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await task();}catch(error){setMessage(error instanceof Error?error.message:t('demo.shared.unavailable'));}finally{lock.current=false;setBusy(false);}}
 async function create(source?:Atelier){
  if(!participant){rememberAuthDestination('create');go('auth');return;}
  if(!source&&!name.trim())return;
  await operation(async()=>{
   const room=await sharedRequest('create',{name:source?.name??name.trim(),capacity:source?.capacity??capacity,concept:source?source.concept??'':concept,visibility:source?'private':visibility});
   const next=addAtelier(collection!,{code:room.code,name:room.name,capacity:room.capacity,online:true},true);
   setCollection(next);setSharing(next.ateliers.find(a=>a.code===room.code)!);go('share');
  });
 }
 function chooseDiscovered(room:DirectoryAtelier){if(!isWeekPreview&&!visibleAteliers.some(entry=>entry.code===room.code)){setPublicCode(room.code);go('public-atelier');return;}if(visibleAteliers.some(entry=>entry.code===room.code)){setCollection({...collection!,selected:room.code});setNavigation(previous=>({screen:'home',revision:previous.revision+1}));go('experience');}else{setInput(room.code);setInvitation(null);go('join');}}
 function lookup(value:string){setInput(value);setMessage('');setInvitation(null);}
 async function leave(entry:Atelier){
  await operation(async()=>{
   accountSequence.current++;
   if(entry.online)await sharedRequest<{done:boolean}>('leave',{code:entry.code});
   setCollection(current=>current?leaveAtelier(current,entry.code):current);
   setAccount(current=>current?{...current,ateliers:current.ateliers.filter(room=>room.code!==entry.code)}:current);
   setNavigation(previous=>({screen:'home',revision:previous.revision+1}));setSharing(null);go('list');
  });
 }
 async function join(){
  if(!participant){const code=(parseInvite(input)?.code??input.trim()).toUpperCase();rememberAuthDestination('join',code);go('auth');return;}
  if(!invitation){setMessage(t('join.error.not_found'));return;}
  if(collection!.ateliers.some(a=>a.code===invitation.code)){setMessage(t('join.error.already'));return;}
  await operation(async()=>{
   let target=invitation;
   if(target.online){const room=await sharedRequest('join',{code:target.code});target={code:room.code,name:room.name,capacity:room.capacity,online:true};}
   setCollection(addAtelier(collection!,target,false));setInvitation(null);setNavigation(previous=>({screen:'home',revision:previous.revision+1}));go('experience');
  });
 }
 async function share(copy:boolean){if(!sharing)return;const url=inviteUrl(sharing);try{if(!copy&&navigator.share)await navigator.share({title:sharing.name,url});else{await navigator.clipboard.writeText(copy?sharing.code:url);setMessage(t('common.done'));}}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setMessage(t('error.server.title'));}}
 const preview=partition(capacity,random(414));
 const confirm=collection.ateliers.find(a=>a.code===deleting&&a.creator===collection.device&&!a.online);
 return <div key={isWeekPreview?language:undefined} className={settings.reduceMotion?'demo-shell motion-reduced':'demo-shell'} data-week-preview={isWeekPreview||undefined} data-language={language} data-swipe-scope="tabs" {...tabSwipe}>
 {isWeekPreview&&<WeekNotice/>}
 {view==='experience'&&active?(active.online?<SharedExperience key={active.code+accountRevision} entry={active} navigation={navigation} onScreenChange={setExperienceScreen} onManage={()=>go('list')} onAccount={()=>void openAccount()} onPosts={showPosts} onGlobal={day=>showGlobal(day)} onOpenAtelier={(code,day)=>{setCollection({...collection,selected:code});setNavigation(previous=>({screen:'home',openDay:day,revision:previous.revision+1}));go('experience');}} onShare={()=>{setSharing(active);go('share');}}/>:<Experience key={active.code} entry={active} navigation={navigation} onScreenChange={setExperienceScreen} onChange={change} onManage={()=>go('list')} onAccount={()=>void openAccount()} onPosts={showPosts} onGlobal={(day,sample)=>showGlobal(day,sample)}/>):<div className="app atelier-app">
  <header className="header"><button className="brand" aria-label="Schiild" onClick={()=>void openAccount()}><span className="brand-symbol"><i/><i/><i/></span>Schiild</button><button className="text-button" disabled={busy} onClick={()=>view==='delete-account'?go('settings'):visit('home')}>{t('common.back')}</button></header>
  {message&&<p className="shared-error" role="status">{message}</p>}
  {view==='discover'&&<DiscoverPage joined={visibleAteliers.map(entry=>entry.code)} onCode={code=>{setInput(code);setInvitation(null);go('join');}} onChoose={chooseDiscovered}/>}
  {view==='public-atelier'&&<PublicAtelierPage key={publicCode} code={publicCode} onJoin={()=>{setInput(publicCode);setInvitation(null);if(!participant){rememberAuthDestination('join',publicCode);go('auth');}else go('join');}}/>}
  {view==='posts'&&<DailyPostsPage collection={collection} initialSource={postSelection} onLocalReuse={reuseLocalPosts} onRefresh={()=>setAccountRevision(value=>value+1)} onBack={()=>visit('home')}/>}
  {view==='delete-account'&&account&&<DeleteAccountPage account={account} onDelete={deleteAccount} onWhatsAppComplete={acceptWhatsApp}/>}
  {view==='global'&&<GlobalPage selection={globalSelection} revision={accountRevision}/>}
  {view==='auth'&&<AuthPage language={language} onLanguage={changeLanguage} onComplete={acceptWhatsApp}/>}{view==='account-check'&&<p>{t('common.loading')}</p>}{view==='empty-archive'&&<ArchiveCalendar items={[]} currentDay={demoDay()} onOpen={()=>{}} onGlobal={item=>showGlobal(item.day)}/>}
  {view==='me'&&account&&<AccountPage key={account.username} account={account} collection={collection} onPosts={()=>showPosts()} onName={updateName} onArchive={()=>visit('archive')} onSettings={()=>go('settings')} onCustody={(code,day)=>{setCollection({...collection,selected:code});setNavigation(previous=>({screen:'home',openDay:day,revision:previous.revision+1}));go('experience');}}/>}
  {view==='settings'&&account&&<SettingsPage language={language} onLanguage={changeLanguage} value={settings} onChange={updateSettings} account={account} onAccount={()=>void openAccount()} onLogout={logout} onDelete={()=>go('delete-account')}/>}
  {(view==='list'||view==='experience')&&<section className="atelier-home"><h1>{t('home.title')}</h1><div className="atelier-list">{visibleAteliers.map(a=><div className="atelier-row" key={a.code} data-selected={a.code===collection.selected} data-code={a.code}><button className="atelier-select" disabled={busy} onClick={()=>{setCollection({...collection,selected:a.code});setNavigation(previous=>({screen:'home',revision:previous.revision+1}));go('experience');}}><span className="atelier-name"><AtelierNameLabel/><strong>{a.name}</strong></span><span className="mono">{a.online?t('create.capacity_label'):t('demo.shared.local')} {a.capacity}</span></button><div className="atelier-actions"><button disabled={busy} onClick={()=>{if(a.online){setSharing(a);go('share');}else void create(a);}}>{t('created.share')}</button><button disabled={busy||isWeekPreview} onClick={()=>void leave(a)}>{t('demo.atelier.leave')}</button>{a.creator===collection.device&&!a.online&&<button onClick={()=>setDeleting(a.code)}>{t('demo.atelier.delete')}</button>}</div></div>)}</div>{!visibleAteliers.length&&<p>{t('empty.atelier.body')}</p>}<button className="button" disabled={busy||isWeekPreview} onClick={()=>{setName('');setConcept('');setVisibility('private');setCapacity(12);go('create');}}>{t('create.title')}</button><button className="button secondary" disabled={busy} onClick={()=>go('discover')}>{t('demo.discover.join_public')}</button>{!isWeekPreview&&<a className="week-entry" href="/week/">{t('demo.week.entry')}</a>}{visibleAteliers.length>0&&<HelpDetails><p>{t('demo.atelier.leave_note')}</p><p>{t('demo.atelier.leave_creator')}</p><p>{t('demo.atelier.leave_slots')}</p></HelpDetails>}</section>}
  {view==='create'&&<section className="atelier-create"><h1>{t('create.title')}</h1><label className="field">{t('create.name_label')}<input maxLength={40} value={name} placeholder={t('create.name_ph')} onChange={e=>setName(e.target.value)}/></label><label className="field">{t('demo.concept.label')}<input maxLength={CONCEPT_LIMIT} value={concept} placeholder={t('demo.concept.default')} onChange={event=>setConcept(event.target.value)}/></label><VisibilityField value={visibility} disabled={busy} onChange={setVisibility}/><p className="wall-label">{t('create.capacity_label')}</p><div className="capacities">{[2,5,12,20].map(n=><button key={n} aria-pressed={capacity===n} onClick={()=>setCapacity(n)}>{n}</button>)}</div><div className="artboard capacity-preview">{preview.map(r=><div key={r.slot} style={{position:'absolute',left:`${r.x/128*100}%`,top:`${r.y/128*100}%`,width:`${r.w/128*100}%`,height:`${r.h/128*100}%`,border:'1px solid var(--strong)'}}/>)}</div><p className="mono">{t('create.capacity_avg',{px:Math.round(WORK_SIZE*WORK_SIZE/capacity)})}</p><p className="shared-note">{t('create.fixed.title')}</p><button className="button" disabled={!name.trim()||busy} onClick={()=>void create()}>{t(busy?'common.loading':'create.submit')}</button><HelpDetails><p>{t('create.capacity_explain',{n:capacity})}</p><p>{t('create.fixed.body')}</p></HelpDetails></section>}
  {view==='share'&&sharing&&<section className="atelier-share-page"><AtelierNameLabel/><h1>{sharing.name}</h1>{sharing.online&&<AtelierVisibility code={sharing.code}/>}<div className="invite-code"><span>{t('created.code_label')}</span><strong>{sharing.code}</strong></div><textarea aria-label={t('created.share')} readOnly value={inviteUrl(sharing)}/><button className="button" onClick={()=>void share(false)}>{t('created.share')}</button><button className="button secondary" onClick={()=>void share(true)}>{t('created.copy')}</button></section>}
  {view==='join'&&<section className="atelier-join"><h1>{t('demo.discover.open')}</h1><label className="field">{t('created.code_label')}<input placeholder={t('join.code_ph')} value={input} onChange={e=>lookup(e.target.value)} autoCapitalize="characters" spellCheck={false}/></label>{invitation?.name&&<div className="join-preview"><AtelierNameLabel/><h2>{invitation.name}</h2><AtelierConcept concept={invitation.concept}/><p>{t('join.preview.stats',{cap:invitation.capacity,n:(invitation as SharedPreview).members??1,total:(invitation as SharedPreview).total??0})}</p></div>}<p>{t(invitation&&!invitation.online?'join.tomorrow':'demo.shared.join_now')}</p><button className="button" disabled={busy||(participant?!invitation:!/^([A-Z0-9]{8})$/.test((parseInvite(input)?.code??input.trim()).toUpperCase()))} onClick={()=>void join()}>{t(busy?'common.loading':'join.submit')}</button><button className="text-button" onClick={()=>go('discover')}>{t('demo.discover.join_public')}</button></section>}
 </div>}
 {confirm&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-atelier-title"><h2 id="delete-atelier-title">{t('demo.atelier.delete')}</h2><p>{t('demo.atelier.delete_body',{name:confirm.name})}</p><button className="button" onClick={()=>{setCollection(removeAtelier(collection,confirm.code));setDeleting(null);setSharing(null);}}>{t('delete.confirm')}</button><button className="button secondary" onClick={()=>setDeleting(null)}>{t('delete.cancel')}</button></section></div>}
 <DemoNav active={view==='discover'||view==='join'||view==='public-atelier'?'discover':view==='global'?'global':view==='empty-archive'?'archive':view==='list'?'home':view==='experience'?(experienceScreen==='home'||experienceScreen==='archive'?experienceScreen:navigation.screen):''} onHome={()=>visit('home')} onGlobal={()=>showGlobal(demoDay())} onArchive={()=>visit('archive')} onDiscover={()=>go('discover')}/>
 </div>;
}
