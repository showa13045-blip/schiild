import React,{useEffect,useRef,useState} from 'react';
import {Experience} from '../App';
import SharedExperience from './SharedExperience';
import {t} from './copy';
import {partition,random} from './engine';
import {COLLECTION,restore,inviteUrl,parseInvite,addAtelier,removeAtelier} from './ateliers';
import {sharedPreview,sharedRequest} from './shared-api';
import type {SharedPreview} from './shared-api';
import type {Collection,Invitation,Atelier} from './ateliers';
import type {State} from './model';

export default function AtelierApp(){
 const [collection,setCollection]=useState<Collection|null>(null),[view,setView]=useState('experience'),[name,setName]=useState(''),[capacity,setCapacity]=useState(12),[input,setInput]=useState(''),[invitation,setInvitation]=useState<Invitation|null>(null),[sharing,setSharing]=useState<Atelier|null>(null),[deleting,setDeleting]=useState<string|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{setCollection(restore());function receive(){const incoming=parseInvite(location.hash);if(incoming){setInvitation(incoming);setInput(incoming.online?incoming.code:location.href);setView('join');}history.replaceState(null,'',location.pathname+location.search);}receive();window.addEventListener('hashchange',receive);return()=>window.removeEventListener('hashchange',receive);},[]);
 useEffect(()=>{if(collection)try{localStorage.setItem(COLLECTION,JSON.stringify(collection));}catch{setMessage(t('error.server.title'));}},[collection]);
 useEffect(()=>{
  if(view!=='join'||!input)return;
  const incoming=parseInvite(input);
  if(incoming&&!incoming.online){setInvitation(incoming);return;}
  const code=(incoming?.code??input.trim()).toUpperCase();
  setInvitation(null);if(!/^[A-Z0-9]{8}$/.test(code))return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{void sharedPreview(code,controller.signal).then(value=>{setInvitation(value);setMessage('');}).catch(error=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:t('demo.shared.unavailable'));});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[input,view]);
 if(!collection)return <div className="loading">{t('common.loading')}</div>;
 const active=collection.ateliers.find(a=>a.code===collection.selected);
 function change(state:State){
  if(!collection)return;
  const next={...collection,ateliers:collection.ateliers.map(a=>a.code===collection.selected?{...a,state}:!a.online&&state.photo&&a.state.day===state.day&&a.activeFrom<=state.day&&!a.state.photo&&!a.state.ready?{...a,state:{...a.state,photo:state.photo,count:a.state.count+1}}:a)};
  localStorage.setItem(COLLECTION,JSON.stringify(next));setCollection(next);
 }
 function go(next:string){setMessage('');setView(next);window.scrollTo(0,0);}
 async function operation(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await task();}catch(error){setMessage(error instanceof Error?error.message:t('demo.shared.unavailable'));}finally{lock.current=false;setBusy(false);}}
 async function create(source?:Atelier){
  if(!source&&!name.trim())return;
  await operation(async()=>{
   const room=await sharedRequest('create',{name:source?.name??name.trim(),capacity:source?.capacity??capacity});
   const next=addAtelier(collection!,{code:room.code,name:room.name,capacity:room.capacity,online:true},true);
   setCollection(next);setSharing(next.ateliers.find(a=>a.code===room.code)!);go('share');
  });
 }
 function lookup(value:string){setInput(value);setMessage('');setInvitation(null);}
 async function join(){
  if(!invitation){setMessage(t('join.error.not_found'));return;}
  if(collection!.ateliers.some(a=>a.code===invitation.code)){setMessage(t('join.error.already'));return;}
  await operation(async()=>{
   let target=invitation;
   if(target.online){const room=await sharedRequest('join',{code:target.code});target={code:room.code,name:room.name,capacity:room.capacity,online:true};}
   setCollection(addAtelier(collection!,target,false));setInvitation(null);go('experience');
  });
 }
 async function share(copy:boolean){if(!sharing)return;const url=inviteUrl(sharing);try{if(!copy&&navigator.share)await navigator.share({title:sharing.name,url});else{await navigator.clipboard.writeText(copy?sharing.code:url);setMessage(t('common.done'));}}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setMessage(t('error.server.title'));}}
 const preview=partition(capacity,random(414));
 const confirm=collection.ateliers.find(a=>a.code===deleting&&a.creator===collection.device&&!a.online);
 return <>
 {view==='experience'&&active?(active.online?<SharedExperience key={active.code} entry={active} onManage={()=>go('list')} onShare={()=>{setSharing(active);go('share');}}/>:<Experience key={active.code} entry={active} onChange={change} onManage={()=>go('list')}/>):<div className="app atelier-app">
  <header className="header"><span className="brand">Schiild</span><button className="text-button" disabled={busy} onClick={()=>go(active?'experience':'list')}>{t('common.back')}</button></header>
  {message&&<p className="shared-error" role="status">{message}</p>}
  {(view==='list'||view==='experience')&&<section><h1>{t('home.title')}</h1><p>{t('demo.shared.create_note')}</p><div className="atelier-list">{collection.ateliers.map(a=><div className="atelier-row" key={a.code}><button className="atelier-select" onClick={()=>{setCollection({...collection,selected:a.code});go('experience');}}><strong>{a.name}</strong><span className="mono">{a.online?t('create.capacity_label'):t('demo.shared.local')} {a.capacity}</span></button><div className="atelier-actions"><button disabled={busy} onClick={()=>{if(a.online){setSharing(a);go('share');}else void create(a);}}>{t('created.share')}</button>{a.creator===collection.device&&!a.online&&<button onClick={()=>setDeleting(a.code)}>{t('demo.atelier.delete')}</button>}</div></div>)}</div><button className="button" disabled={busy} onClick={()=>{setName('');setCapacity(12);go('create');}}>{t('create.title')}</button><button className="button secondary" disabled={busy} onClick={()=>{setInvitation(null);setInput('');go('join');}}>{t('join.title')}</button></section>}
  {view==='create'&&<section><h1>{t('create.title')}</h1><p>{t('demo.shared.create_note')}</p><label className="field">{t('create.name_label')}<input maxLength={40} value={name} placeholder={t('create.name_ph')} onChange={e=>setName(e.target.value)}/></label><p className="wall-label">{t('create.capacity_label')}</p><div className="capacities">{[2,5,12,20].map(n=><button key={n} aria-pressed={capacity===n} onClick={()=>setCapacity(n)}>{n}</button>)}</div><div className="artboard capacity-preview">{preview.map(r=><div key={r.slot} style={{position:'absolute',left:`${r.x/128*100}%`,top:`${r.y/128*100}%`,width:`${r.w/128*100}%`,height:`${r.h/128*100}%`,border:'1px solid var(--strong)'}}/>)}</div><p>{t('create.capacity_explain',{n:capacity})}</p><p className="mono">{t('create.capacity_avg',{px:Math.round(128*128/capacity)})}</p><h2>{t('create.fixed.title')}</h2><p>{t('create.fixed.body')}</p><button className="button" disabled={!name.trim()||busy} onClick={()=>void create()}>{t(busy?'common.loading':'create.submit')}</button></section>}
  {view==='share'&&sharing&&<section><h1>{sharing.name}</h1><p>{t('demo.shared.share_note')}</p><div className="invite-code"><span>{t('created.code_label')}</span><strong>{sharing.code}</strong></div><textarea aria-label={t('created.share')} readOnly value={inviteUrl(sharing)}/><button className="button" onClick={()=>void share(false)}>{t('created.share')}</button><button className="button secondary" onClick={()=>void share(true)}>{t('created.copy')}</button><p>{t('demo.shared.join_now')}</p></section>}
  {view==='join'&&<section><h1>{t('join.title')}</h1><label className="field">{t('created.code_label')}<input placeholder={t('join.code_ph')} value={input} onChange={e=>lookup(e.target.value)} autoCapitalize="characters" spellCheck={false}/></label>{invitation?.name&&<div className="join-preview"><h2>{invitation.name}</h2><p>{t('join.preview.stats',{cap:invitation.capacity,n:(invitation as SharedPreview).members??1,total:(invitation as SharedPreview).total??0})}</p></div>}<p>{t(invitation&&!invitation.online?'join.tomorrow':'demo.shared.join_now')}</p><button className="button" disabled={busy} onClick={()=>void join()}>{t(busy?'common.loading':'join.submit')}</button></section>}
 </div>}
 {confirm&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-atelier-title"><h2 id="delete-atelier-title">{t('demo.atelier.delete')}</h2><p>{t('demo.atelier.delete_body',{name:confirm.name})}</p><button className="button" onClick={()=>{setCollection(removeAtelier(collection,confirm.code));setDeleting(null);setSharing(null);}}>{t('delete.confirm')}</button><button className="button secondary" onClick={()=>setDeleting(null)}>{t('delete.cancel')}</button></section></div>}
 </>;
}
