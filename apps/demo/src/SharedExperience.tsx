import ModerationNotice from './ModerationNotice';
import {browserStorage,isWeekPreview} from './preview-mode.ts';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Camera,Reveal} from '../App';
import type {Navigation} from './DemoNav';
import {t} from './copy';
import {shortDate} from './language';
import {partition,random} from './engine';
import {dayAfter} from './model';
import type {Work} from './model';
import type {Atelier} from './ateliers';
import {fetchWork,sharedRequest} from './shared-api';
import type {Account,SharedState} from './shared-api';
import DraftPreview from './DraftPreview';
import type {Draft} from './draft';
import AreaDisplay from './AreaDisplay';
import ArchiveCalendar from './ArchiveCalendar';
import type {ArchiveEntry,DayAtelierWork} from './ArchiveCalendar';
import HelpDetails from './HelpDetails';
import AtelierConcept from './AtelierConcept';
import {CONCEPT_LIMIT} from './concept';
import ActionIconButton from './ActionIconButton';
import type {PostSelection} from './DailyPostsPage';

export default function SharedExperience({entry,onManage,onShare,onAccount,onPosts,onGlobal,onOpenAtelier,navigation,onScreenChange}:{entry:Atelier;onManage:()=>void;onShare:()=>void;onAccount:()=>void;onPosts:(source:PostSelection)=>void;onGlobal:(day:string)=>void;onOpenAtelier:(code:string,day:string)=>void;navigation:Navigation;onScreenChange:(screen:string)=>void}){
 const [state,setState]=useState<SharedState|null>(null),[error,setError]=useState(''),[screen,setScreen]=useState('home'),[work,setWork]=useState<Work|null>(null),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[cameraDay,setCameraDay]=useState<string|null>(null);
 const [editingConcept,setEditingConcept]=useState(false),[conceptDraft,setConceptDraft]=useState(''),[conceptError,setConceptError]=useState('');
 useEffect(()=>onScreenChange(screen),[screen,onScreenChange]);
 const sequence=useRef(0),mounted=useRef(true),lock=useRef(false);
 const archiveCodes=useRef<Record<string,string>>({}),[archiveItems,setArchiveItems]=useState<ArchiveEntry[]|null>(null);
 const loadArchiveImage=useCallback(async(day:string,signal:AbortSignal)=>(await sharedRequest<Work>('work',{code:archiveCodes.current[day]??entry.code,day},signal)).image,[entry.code]);
 useEffect(()=>{if(screen!=='archive')return;const controller=new AbortController();void (async()=>{const {account}=await sharedRequest<{account:Account|null}>('account.me',{},controller.signal);if(!account)return;const states=await Promise.all(account.ateliers.map(room=>sharedRequest<SharedState>('state',{code:room.code},controller.signal))),days=new Map<string,ArchiveEntry>(),codes:Record<string,string>={};for(const room of states.sort((a,b)=>a.code===entry.code?-1:b.code===entry.code?1:a.code.localeCompare(b.code)))for(const work of room.works)if(!days.has(work.day)){days.set(work.day,work);codes[work.day]=room.code;}if(!controller.signal.aborted){archiveCodes.current=codes;setArchiveItems([...days.values()].sort((a,b)=>b.day.localeCompare(a.day)));}})().catch(()=>{});return()=>controller.abort();},[screen,entry.code]);
 const loadDayWorks=useCallback(async(day:string,signal:AbortSignal):Promise<DayAtelierWork[]>=>{
  const {account}=await sharedRequest<{account:Account|null}>('account.me',{},signal),rooms=[...(account?.ateliers??[entry])].sort((a,b)=>a.code===entry.code?-1:b.code===entry.code?1:a.code.localeCompare(b.code));
  const results=await Promise.all(rooms.map(async room=>{const state=await sharedRequest<SharedState>('state',{code:room.code},signal);if(!state.works.some(work=>work.day===day))return null;const work=await sharedRequest<Work>('work',{code:room.code,day},signal);return {...work,code:room.code,name:room.name};}));
  return results.filter((work):work is NonNullable<typeof work>=>work!==null);
 },[entry.code]);
 const [draft,setDraft]=useState<Draft|null>(null),draftController=useRef<AbortController|null>(null);
 async function refresh(){
  const request=++sequence.current;
  try{const next=await sharedRequest('state',{code:entry.code});if(mounted.current&&request===sequence.current){setState(next);setError('');}}
  catch(cause){if(mounted.current&&request===sequence.current)setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
 }
 useEffect(()=>{
  mounted.current=true;void refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!lock.current)void refresh();},5000);
  const resume=()=>{if(document.visibilityState==='visible'&&!lock.current)void refresh();};
  document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;sequence.current++;draftController.current?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
 },[entry.code]);
 function go(next:string){if(next==='camera')setCameraDay(state?.day??null);setScreen(next);window.scrollTo(0,0);}
 async function post(photo:string){
  const current=state;if(!current)return;
  lock.current=true;sequence.current++;
  try{const next=await sharedRequest('post',{code:entry.code,day:cameraDay??current.day,photo});setState(next);setError('');onPosts({code:entry.code,day:next.day,online:true});}
  finally{lock.current=false;}
 }
 async function open(day:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const next=await fetchWork(entry.code,day);next.opened=browserStorage().getItem(`schiild.shared.opened.${entry.code}.${day}`)==='true';setWork(next);go('work');}
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
 function closeConcept(){setEditingConcept(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-testid=concept-edit]')?.focus());}
 async function saveConcept(){
  if(!state||lock.current)return;lock.current=true;setBusy(true);setConceptError('');sequence.current++;
  try{const next=await sharedRequest('concept.update',{code:entry.code,day:state.day,concept:conceptDraft});setState(next);closeConcept();}
  catch(cause){setConceptError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
  finally{lock.current=false;setBusy(false);}
 }
 async function preview(){
  if(!state||lock.current)return;lock.current=true;setBusy(true);setError('');sequence.current++;
  const controller=new AbortController();draftController.current=controller;
  try{const next=await sharedRequest<Draft>('draft',{code:entry.code,day:state.day},controller.signal);if(mounted.current){setDraft(next);go('draft');await refresh();}}
  catch(cause){if(mounted.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:t('demo.draft.failed'));}
  finally{lock.current=false;if(mounted.current)setBusy(false);draftController.current=null;}
 }
 useEffect(()=>{if(draft&&state&&(draft.day!==state.day||state.status!=='open')){setDraft(null);go('home');}},[draft,state?.day,state?.status]);
 useEffect(()=>{if(navigation.openDay)void open(navigation.openDay);else go(navigation.screen);},[navigation.revision]);
 const short=shortDate;
 const rects=state?partition(state.capacity,random(state.seed)):[];
 return <div className={screen==='archive'?'app archive-app':'app'} data-tab-screen={screen}><header className="header"><button className="brand" aria-label="Schiild" onClick={onAccount}><span className="brand-symbol"><i/><i/><i/></span>Schiild</button><button className="text-button" onClick={onManage}>{t('home.title')} ＋</button></header>
  <main>{error&&<div className="shared-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>void refresh()}>{t('demo.shared.refresh')}</button></div>}
  {!state?<p>{t('common.loading')}</p>:<>
   {screen==='home'&&<section><div className="eyebrow">{t('home.title')}</div><div className="atelier-heading"><div className="title-row"><h1>{state.name}</h1></div><AtelierConcept concept={state.concept} disabled={busy} onEdit={state.canGenerate?()=>{setConceptDraft(state.defaultConcept??state.concept??'');setConceptError('');setEditingConcept(true);}:undefined}/>{state.canGenerate&&state.status!=='open'&&state.defaultConcept!==state.concept&&<p className="concept-upcoming">{t('demo.concept.upcoming',{concept:state.defaultConcept||t('demo.concept.default')})}</p>}</div><div className="atelier-share"><ActionIconButton kind="share" label={t('created.share')} showLabel onClick={onShare}/></div><p className="shared-note">{t('demo.shared.members',{n:state.members,cap:state.capacity})}</p>
    <div className="artboard today-board" data-testid="today-board">{rects.map(rect=><div key={rect.slot} className={`today-tile ${state.postedSlots.includes(rect.slot)?'filled':''}`} style={{left:`${rect.x/128*100}%`,top:`${rect.y/128*100}%`,width:`${rect.w/128*100}%`,height:`${rect.h/128*100}%`,background:state.postedSlots.includes(rect.slot)?'var(--strong)':undefined}}/>)}</div>
    <div className="today-details"><span className="mono">{state.day.replaceAll('-',' / ')}</span><span className="recorded mono">{t('atelier.recorded',{n:state.postedSlots.length,cap:state.capacity})}</span></div>
    <p className="window">{t('atelier.window',{start:short(state.day)+' 09:00',end:short(dayAfter(state.day))+' 09:00'})}</p>
    <AreaDisplay area={state.area}/><ModerationNotice status={state.moderationStatus}/>
    <div className="shared-actions">
     {state.status==='ready'?<ActionIconButton kind="open" label={t('reveal.open')} disabled={busy} onClick={()=>void open(state.day)}/>:<>
      {state.hasPhoto?state.moderationStatus?null:<div className="posted"><p>{t('demo.shared.saved')}</p></div>:state.status==='open'&&<button className="button" disabled={isWeekPreview} onClick={()=>go('camera')}>{t('onboarding.1.title')}</button>}
      {state.canGenerate&&state.postedSlots.length>0?<><button className="button secondary" disabled={busy} onClick={()=>setConfirm(true)}>{t(state.status==='generating'?'common.retry':'demo.shared.generate')}</button></>:state.hasPhoto&&<p className="shared-status">{t('demo.shared.wait_short')}</p>}
     </>}
     {state.status==='open'&&<div className="draft-actions"><p className="wall-label">{t('demo.draft.label')}</p><button className="button secondary" disabled={busy||state.postedSlots.length===0} onClick={()=>void preview()}>{t(busy?'demo.draft.loading':'demo.draft.generate')}</button></div>}
    </div>
    <div className="section-heading"><h2>{t('atelier.past')}</h2><button className="text-button" onClick={()=>go('archive')}>{t('archive.title')}</button></div>
    <div className="atelier-list">{state.works.slice(0,3).map(item=><button className="atelier-select" key={item.day} disabled={busy} onClick={()=>void open(item.day)}><span className="mono">{item.day}</span><span className="mono">{t('schiild.label',{index:item.index})}</span></button>)}</div>
    <HelpDetails><p>{t('demo.posts.rule')}</p><p>{t('demo.shared.generate_note')}</p>{state.hasPhoto&&!state.canGenerate&&!state.moderationStatus&&<p>{t('demo.shared.wait')}</p>}<p>{t('demo.draft.empty')}</p></HelpDetails>
   </section>}
   {screen==='camera'&&<Camera shared day={cameraDay??state.day} atelier={state.name} concept={state.concept} onBack={()=>go('home')} onSubmit={post}/>}
   {screen==='draft'&&draft&&<DraftPreview draft={draft} atelier={state.name} onClose={()=>{setDraft(null);go('home');}}/>}
   {screen==='work'&&work&&<Reveal shared key={work.day} atelier={state.name} work={work} onOpened={()=>{try{browserStorage().setItem(`schiild.shared.opened.${entry.code}.${work.day}`,'true');}catch{/* Viewing remains possible when local storage is full. */}}} onNext={()=>onGlobal(work.day)}/>}
   {screen==='archive'&&<ArchiveCalendar items={archiveItems??state.works} currentDay={state.day} atelier={state.name} busy={busy} loadImage={loadArchiveImage} loadDayWorks={loadDayWorks} onOpenAtelier={onOpenAtelier} onOpen={item=>void open(item.day)} onGlobal={item=>onGlobal(item.day)}/>}
  </>}
  </main>
  {editingConcept&&state&&<div className="modal-shade"><section className="dialog concept-dialog" role="dialog" aria-modal="true" aria-labelledby="concept-title" onKeyDown={event=>{if(event.key==='Escape'&&!busy)closeConcept();}}><h2 id="concept-title">{t('demo.concept.edit')}</h2><form onSubmit={event=>{event.preventDefault();void saveConcept();}}><label className="field">{t('demo.concept.input')}<input autoFocus maxLength={CONCEPT_LIMIT} value={conceptDraft} disabled={busy} placeholder={t('demo.concept.default')} onChange={event=>setConceptDraft(event.target.value)}/></label>{state.status!=='open'&&<p>{t('demo.concept.next_day')}</p>}{conceptError&&<p className="error" role="alert">{conceptError}</p>}<button type="submit" className="button" disabled={busy}>{t(busy?'common.loading':'common.done')}</button><button type="button" className="button secondary" disabled={busy} onClick={closeConcept}>{t('common.cancel')}</button></form></section></div>}
  {confirm&&state&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="generate-title"><h2 id="generate-title">{t('demo.shared.generate_confirm')}</h2><p>{t('demo.shared.generate_body',{n:state.postedSlots.length})}</p>{error&&<p className="shared-error" role="alert">{error}</p>}<button className="button" disabled={busy} onClick={()=>void generate()}>{t(busy?'common.loading':'demo.shared.generate')}</button><button className="button secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('delete.cancel')}</button></section></div>}
 </div>;
}
