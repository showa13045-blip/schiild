import React,{useEffect,useState} from 'react';
import {Experience} from '../App';
import {t} from './copy';
import {partition,random} from './engine';
import {COLLECTION,restore,newCode,inviteUrl,parseInvite,addAtelier,removeAtelier} from './ateliers';
import type {Collection,Invitation,Atelier} from './ateliers';
import type {State} from './model';

export default function AtelierApp(){
 const [collection,setCollection]=useState<Collection|null>(null),[view,setView]=useState('experience'),[name,setName]=useState(''),[capacity,setCapacity]=useState(12),[input,setInput]=useState(''),[invitation,setInvitation]=useState<Invitation|null>(null),[sharing,setSharing]=useState<Atelier|null>(null),[deleting,setDeleting]=useState<string|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{setCollection(restore());const incoming=parseInvite(location.hash);if(incoming){setInvitation(incoming);setInput(incoming.code);setView('join');}history.replaceState(null,'',location.pathname+location.search);},[]);
 useEffect(()=>{if(collection)try{localStorage.setItem(COLLECTION,JSON.stringify(collection));}catch{setMessage(t('error.server.title'));}},[collection]);
 if(!collection)return <div className="loading">{t('common.loading')}</div>;
 const active=collection.ateliers.find(a=>a.code===collection.selected);
 function change(state:State){setCollection(old=>old?{...old,ateliers:old.ateliers.map(a=>a.code===collection?.selected?{...a,state}:state.photo&&a.state.day===state.day&&a.activeFrom<=state.day&&!a.state.photo&&!a.state.ready?{...a,state:{...a.state,photo:state.photo,count:a.state.count+1}}:a)}:old);}
 function go(next:string){setMessage('');setView(next);window.scrollTo(0,0);}
 function create(){if(!name.trim())return;let code=newCode();while(collection!.ateliers.some(a=>a.code===code))code=newCode();const next=addAtelier(collection!,{code,name:name.trim(),capacity},true);setCollection(next);setSharing(next.ateliers.find(a=>a.code===code)!);go('share');}
 function lookup(value:string){setInput(value);setMessage('');const incoming=parseInvite(value);setInvitation(incoming??collection!.ateliers.find(a=>a.code===value.trim().toUpperCase())??null);}
 function join(){if(!invitation){setMessage(t('join.error.not_found'));return;}if(collection!.ateliers.some(a=>a.code===invitation.code)){setMessage(t('join.error.already'));return;}setCollection(addAtelier(collection!,invitation,false));setInvitation(null);go('experience');}
 async function share(copy:boolean){if(!sharing)return;const url=inviteUrl(sharing);try{if(!copy&&navigator.share)await navigator.share({title:sharing.name,url});else{await navigator.clipboard.writeText(copy?sharing.code:url);setMessage(t('common.done'));}}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setMessage(t('error.server.title'));}}
 const preview=partition(capacity,random(414));
 const confirm=collection.ateliers.find(a=>a.code===deleting&&a.creator===collection.device);
 return <>
 {view==='experience'&&active?<Experience key={active.code} entry={active} onChange={change} onManage={()=>go('list')}/>:<div className="app atelier-app">
  <header className="header"><span className="brand">Schiild</span><button className="text-button" onClick={()=>go(active?'experience':'list')}>{t('common.back')}</button></header>
  {view==='list'||view==='experience'?<section><h1>{t('home.title')}</h1><div className="atelier-list">{collection.ateliers.map(a=><div className="atelier-row" key={a.code}><button className="atelier-select" onClick={()=>{setCollection({...collection,selected:a.code});go('experience');}}><strong>{a.name}</strong><span className="mono">{t('create.capacity_label')} {a.capacity}</span></button><div className="atelier-actions"><button onClick={()=>{setSharing(a);go('share');}}>{t('created.share')}</button>{a.creator===collection.device&&<button onClick={()=>setDeleting(a.code)}>{t('demo.atelier.delete')}</button>}</div></div>)}</div><button className="button" onClick={()=>{setName('');setCapacity(12);go('create');}}>{t('create.title')}</button><button className="button secondary" onClick={()=>{setInvitation(null);setInput('');go('join');}}>{t('join.title')}</button></section>:null}
  {view==='create'&&<section><h1>{t('create.title')}</h1><label className="field">{t('create.name_label')}<input maxLength={40} value={name} placeholder={t('create.name_ph')} onChange={e=>setName(e.target.value)}/></label><p className="wall-label">{t('create.capacity_label')}</p><div className="capacities">{[2,5,12,20].map(n=><button key={n} aria-pressed={capacity===n} onClick={()=>setCapacity(n)}>{n}</button>)}</div><div className="artboard capacity-preview">{preview.map(r=><div key={r.slot} style={{position:'absolute',left:`${r.x/128*100}%`,top:`${r.y/128*100}%`,width:`${r.w/128*100}%`,height:`${r.h/128*100}%`,border:'1px solid var(--strong)'}}/>)}</div><p>{t('create.capacity_explain',{n:capacity})}</p><p className="mono">{t('create.capacity_avg',{px:Math.round(128*128/capacity)})}</p><h2>{t('create.fixed.title')}</h2><p>{t('create.fixed.body')}</p><button className="button" disabled={!name.trim()} onClick={create}>{t('create.submit')}</button></section>}
  {view==='share'&&sharing&&<section><h1>{sharing.name}</h1><p>{t('created.body')}</p><div className="invite-code"><span>{t('created.code_label')}</span><strong>{sharing.code}</strong></div><textarea aria-label={t('created.share')} readOnly value={inviteUrl(sharing)}/><button className="button" onClick={()=>void share(false)}>{t('created.share')}</button><button className="button secondary" onClick={()=>void share(true)}>{t('created.copy')}</button><p>{t('created.first_hint')}</p></section>}
  {view==='join'&&<section><h1>{t('join.title')}</h1><label className="field">{t('created.code_label')}<input placeholder={t('join.code_ph')} value={input} onChange={e=>lookup(e.target.value)} autoCapitalize="characters" spellCheck={false}/></label>{invitation&&<div className="join-preview"><h2>{invitation.name}</h2><p>{t('join.preview.stats',{cap:invitation.capacity,n:1,total:0})}</p></div>}<p>{t('join.tomorrow')}</p><button className="button" onClick={join}>{t('join.submit')}</button></section>}
 </div>}
 {message&&<div className="app" role="status">{message}</div>}
 {confirm&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-atelier-title"><h2 id="delete-atelier-title">{t('demo.atelier.delete')}</h2><p>{t('demo.atelier.delete_body',{name:confirm.name})}</p><button className="button" onClick={()=>{setCollection(removeAtelier(collection,confirm.code));setDeleting(null);setSharing(null);}}>{t('delete.confirm')}</button><button className="button secondary" onClick={()=>setDeleting(null)}>{t('delete.cancel')}</button></section></div>}
 </>;
}
