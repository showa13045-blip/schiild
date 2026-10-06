import React,{useEffect,useRef,useState} from 'react';
import {Camera,Reveal,Icon} from '../App';
import {t} from './copy';
import {partition,random} from './engine';
import {dayAfter} from './model';
import type {Work} from './model';
import type {Atelier} from './ateliers';
import {fetchWork,sharedRequest} from './shared-api';
import type {SharedState} from './shared-api';

export default function SharedExperience({entry,onManage,onShare}:{entry:Atelier;onManage:()=>void;onShare:()=>void}){
 const [state,setState]=useState<SharedState|null>(null),[error,setError]=useState(''),[screen,setScreen]=useState('home'),[work,setWork]=useState<Work|null>(null),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[cameraDay,setCameraDay]=useState<string|null>(null);
 const sequence=useRef(0),mounted=useRef(true),lock=useRef(false);
 async function refresh(){
  const request=++sequence.current;
  try{const next=await sharedRequest('state',{code:entry.code});if(mounted.current&&request===sequence.current){setState(next);setError('');}}
  catch(cause){if(mounted.current&&request===sequence.current)setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
 }
 useEffect(()=>{
  mounted.current=true;document.documentElement.lang='ja';void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!lock.current)void refresh();},5000);
  const resume=()=>{if(document.visibilityState==='visible'&&!lock.current)void refresh();};
  document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;sequence.current++;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
 },[entry.code]);
 function go(next:string){if(next==='camera')setCameraDay(state?.day??null);setScreen(next);window.scrollTo(0,0);}
 async function post(photo:string){
  const current=state;if(!current)return;
  lock.current=true;sequence.current++;
  try{const next=await sharedRequest('post',{code:entry.code,day:cameraDay??current.day,photo});setState(next);setError('');go('home');}
  finally{lock.current=false;}
 }
 async function open(day:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const next=await fetchWork(entry.code,day);next.opened=localStorage.getItem(`schiild.shared.opened.${entry.code}.${day}`)==='true';setWork(next);go('work');}
  catch(cause){setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
  finally{lock.current=false;setBusy(false);}
 }
 async function generate(){
  if(!state||lock.current)return;lock.current=true;setBusy(true);setError('');sequence.current++;
  try{
   const next=await sharedRequest('generate',{code:entry.code,day:state.day});setState(next);setConfirm(false);
   const made=await fetchWork(entry.code,state.day);setWork(made);go('work');
  }catch(cause){setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
  finally{lock.current=false;setBusy(false);}
 }
 const short=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
 const rects=state?partition(state.capacity,random(state.seed)):[];
 return <div className="app"><header className="header"><span className="brand"><span className="brand-symbol"><i/><i/><i/></span>Schiild</span><button className="text-button" onClick={onManage}>{t('home.title')} ＋</button></header>
  <main>{error&&<div className="shared-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>void refresh()}>{t('demo.shared.refresh')}</button></div>}
  {!state?<p>{t('common.loading')}</p>:<>
   {screen==='home'&&<section><div className="eyebrow">{t('home.title')}</div><div className="title-row"><h1>{state.name}</h1></div><p className="shared-note">{t('demo.shared.members',{n:state.members,cap:state.capacity})}</p>
    <div className="artboard today-board" data-testid="today-board">{rects.map(rect=><div key={rect.slot} className={`today-tile ${state.postedSlots.includes(rect.slot)?'filled':''}`} style={{left:`${rect.x/128*100}%`,top:`${rect.y/128*100}%`,width:`${rect.w/128*100}%`,height:`${rect.h/128*100}%`,background:state.postedSlots.includes(rect.slot)?'var(--strong)':undefined}}/>)}</div>
    <div className="today-details"><span className="mono">{state.day.replaceAll('-',' / ')}</span><span className="recorded mono">{t('atelier.recorded',{n:state.postedSlots.length,cap:state.capacity})}</span></div>
    <p className="window">{t('atelier.window',{start:short(state.day)+' 09:00',end:short(dayAfter(state.day))+' 09:00'})}</p>
    <div className="shared-actions">
     {state.status==='ready'?<button className="button" disabled={busy} onClick={()=>void open(state.day)}>{t('reveal.open')}</button>:<>
      {state.hasPhoto?<div className="posted"><p>{t('demo.shared.saved')}</p></div>:state.status==='open'&&<button className="button" onClick={()=>go('camera')}>{t('onboarding.1.title')}</button>}
      {state.canGenerate&&state.postedSlots.length>0?<><p className="shared-note">{t('demo.shared.generate_note')}</p><button className="button secondary" disabled={busy} onClick={()=>setConfirm(true)}>{t(state.status==='generating'?'common.retry':'demo.shared.generate')}</button></>:<p className="shared-note">{t(state.hasPhoto?'demo.shared.wait':'demo.shared.before_photo')}</p>}
     </>}
    </div>
    <div className="section-heading"><h2>{t('atelier.past')}</h2><button className="text-button" onClick={()=>go('archive')}>{t('archive.title')}</button></div>
    <div className="atelier-list">{state.works.slice(0,3).map(item=><button className="atelier-select" key={item.day} disabled={busy} onClick={()=>void open(item.day)}><span className="mono">{item.day}</span><span className="mono">{t('schiild.label',{index:item.index})}</span></button>)}</div>
   </section>}
   {screen==='camera'&&<Camera shared day={cameraDay??state.day} atelier={state.name} onBack={()=>go('home')} onSubmit={post}/>}
   {screen==='work'&&work&&<Reveal shared key={work.day} atelier={state.name} work={work} onOpened={()=>{try{localStorage.setItem(`schiild.shared.opened.${entry.code}.${work.day}`,'true');}catch{/* Viewing remains possible when local storage is full. */}}} onNext={()=>go('home')}/>}
   {screen==='archive'&&<section><h1>{t('archive.title')}</h1><div className="stats"><div><span>{t('archive.total')}</span><b>{state.works.length}</b></div></div><p className="archive-note">{t('archive.note')}</p>{state.works.map(item=><button className="atelier-select" key={item.day} disabled={busy} onClick={()=>void open(item.day)}><span className="mono">{item.day}</span><span className="mono">{t('schiild.label',{index:item.index})}</span></button>)}</section>}
  </>}
  </main><nav className="nav"><button onClick={()=>go('home')} className={screen==='home'?'active':''}><Icon kind="grid"/><span>{t('home.title')}</span></button><button onClick={onShare}><Icon kind="arrow"/><span>{t('created.share')}</span></button><button onClick={()=>go('archive')} className={screen==='archive'?'active':''}><Icon kind="archive"/><span>{t('archive.title')}</span></button></nav>
  {confirm&&state&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="generate-title"><h2 id="generate-title">{t('demo.shared.generate_confirm')}</h2><p>{t('demo.shared.generate_body',{n:state.postedSlots.length})}</p>{error&&<p className="shared-error" role="alert">{error}</p>}<button className="button" disabled={busy} onClick={()=>void generate()}>{t(busy?'common.loading':'demo.shared.generate')}</button><button className="button secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('delete.cancel')}</button></section></div>}
 </div>;
}
