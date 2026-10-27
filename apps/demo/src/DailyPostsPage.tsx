import AtelierNameLabel from './AtelierNameLabel';
import {isWeekPreview} from './preview-mode.ts';
// DEMO ONLY. Reuse actual camera posts explicitly; never use dummy participant photos.
import PostingRules from './PostingRules';
import React,{useEffect,useState} from 'react';
import {t} from './copy';
import {shortDate} from './language';
import HelpDetails from './HelpDetails';
import {sharedRequest,sharedErrorMessage} from './shared-api';
import type {Collection} from './ateliers';
import {dayAfter} from './model';
import {isFreeConcept} from './concept';
import AtelierConcept from './AtelierConcept';
export type PostSelection={code:string;day:string;online:boolean};
type Source={code:string;name:string;day:string;online:boolean};
type Target={code:string;name:string;concept?:string;online:boolean;posted:boolean;status:string;day:string;active:boolean};
type Result={code:string;name?:string;done:boolean;error?:string;message?:string};
type RemotePosts={day:string;globalRecorded:boolean;sources:Omit<Source,'online'>[];targets:Omit<Target,'online'|'day'|'active'>[]};
const sourceKey=(value:{code:string;online:boolean})=>`${value.online?'shared':'local'}/${value.code}`;
export default function DailyPostsPage({collection,initialSource,onLocalReuse,onRefresh,onBack}:{collection:Collection;initialSource?:PostSelection;onLocalReuse:(day:string,photo:string,codes:string[])=>Result[];onRefresh:()=>void;onBack:()=>void}){
 const [remote,setRemote]=useState<RemotePosts|null>(null),[selected,setSelected]=useState(initialSource?sourceKey(initialSource):''),[photo,setPhoto]=useState<string|null>(null),[chosen,setChosen]=useState<string[]>([]),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<Result[]>([]);
 const [rulesAccepted,setRulesAccepted]=useState(false);
 const [chooseGlobal,setChooseGlobal]=useState(false);
 const localEntries=[...collection.ateliers,...(collection.departed??[])].filter(entry=>!entry.online);
 const sources:Source[]=[...(remote?.sources??[]).map(value=>({...value,online:true})),...localEntries.filter(entry=>entry.state.photo).map(entry=>({code:entry.code,name:entry.name,day:entry.state.day,online:false}))];
 const source=sources.find(value=>sourceKey(value)===selected&&(!initialSource||value.day===initialSource.day));
 const targets:Target[]=[...(remote?.targets??[]).map(value=>({...value,online:true,day:remote!.day,active:true})),...collection.ateliers.filter(entry=>!entry.online).map(entry=>({code:entry.code,name:entry.name,concept:entry.concept,online:false,posted:Boolean(entry.state.photo),status:entry.state.ready?'ready':'open',day:entry.state.day,active:entry.state.day>=entry.activeFrom}))].filter(target=>!initialSource||sourceKey(target)!==sourceKey(initialSource));
 const eligible=(target:Target)=>Boolean(source&&target.day===source.day&&target.active&&!target.posted&&target.status==='open'&&(!target.online||typeof target.concept==='string')&&isFreeConcept(target.concept));
 const chosenTargets=targets.filter(target=>chosen.includes(sourceKey(target))&&eligible(target));
 const globalEligible=Boolean(source&&remote?.day===source.day&&remote.globalRecorded===false),globalChosen=chooseGlobal&&globalEligible,canSubmit=chosenTargets.length>0||globalChosen;
 async function refresh(signal?:AbortSignal){const next=await sharedRequest<RemotePosts>('posts',{},signal);setRemote(next);}
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));});return()=>controller.abort();},[]);
 useEffect(()=>{
  setRulesAccepted(false);setPhoto(null);setChosen([]);setChooseGlobal(false);setConfirm(false);setError('');setResults([]);if(!source)return;
  const controller=new AbortController();
  if(!source.online){setPhoto(localEntries.find(entry=>entry.code===source.code)?.state.photo??null);return()=>controller.abort();}
  void sharedRequest<{photo:string}>('post.photo',{sourceCode:source.code,day:source.day},controller.signal).then(value=>setPhoto(value.photo)).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));});
  return()=>controller.abort();
 },[selected,source?.day]);
 async function submit(){
  if(!source||!photo||!canSubmit||!rulesAccepted||busy)return;setBusy(true);setError('');
  try{
   const next:Result[]=[],online=chosenTargets.filter(target=>target.online),local=chosenTargets.filter(target=>!target.online);
   if(globalChosen){try{await sharedRequest('global.record',{day:source.day,...(source.online?{sourceCode:source.code}:{photo})});next.push({code:'GLOBAL',name:t('demo.posts.global_target'),done:true});}catch(cause){next.push({code:'GLOBAL',name:t('demo.posts.global_target'),done:false,message:cause instanceof Error?cause.message:t('demo.shared.unavailable')});}}
   if(online.length&&source.online){const value=await sharedRequest<{results:Result[]}>('reuse',{sourceCode:source.code,day:source.day,codes:online.map(target=>target.code)});next.push(...value.results);}
   else for(const target of online){try{await sharedRequest('post',{code:target.code,day:source.day,photo,reuse:true});next.push({code:target.code,name:target.name,done:true});}catch(cause){next.push({code:target.code,name:target.name,done:false,message:cause instanceof Error?cause.message:t('demo.shared.unavailable')});}}
   if(local.length)next.push(...onLocalReuse(source.day,photo,local.map(target=>target.code)));
   setResults(next.map(result=>({...result,name:result.name??chosenTargets.find(target=>target.code===result.code)?.name??result.code})));setChosen([]);setChooseGlobal(false);setConfirm(false);onRefresh();
   try{await refresh();}catch(cause){setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
  }catch(cause){setError(cause instanceof Error?cause.message:t('demo.shared.unavailable'));}
  finally{setBusy(false);}
 }
 const short=shortDate;
 return <section className="daily-posts" data-testid="daily-posts" data-after-capture={Boolean(initialSource)}><h1>{t(initialSource?'demo.posts.targets':'demo.posts.title')}</h1>
  {!initialSource&&<label className="field">{t('demo.posts.source')}<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}><option value="">{t('demo.posts.choose')}</option>{sources.map(value=><option key={sourceKey(value)} value={sourceKey(value)}>{value.name} ／ {value.day}{!value.online?` ／ ${t('demo.shared.local')}`:''}</option>)}</select></label>}
  {!sources.length&&<p>{t(remote?'demo.posts.empty':'common.loading')}</p>}
  {source&&<><p className="window">{t('atelier.window',{start:short(source.day)+' 09:00',end:short(dayAfter(source.day))+' 09:00'})}</p>{photo?<img className="reuse-photo" src={photo} alt={t('demo.posts.photo',{name:source.name})}/>:<p>{t('common.loading')}</p>}{!initialSource&&<h2>{t('demo.posts.targets')}</h2>}
   <label className={`reuse-target global-target ${globalEligible?'':'unavailable'}`}><input type="checkbox" aria-label={t('demo.posts.global_target')} disabled={isWeekPreview||!globalEligible||busy} checked={globalChosen} onChange={event=>setChooseGlobal(event.target.checked)}/><span className="reuse-target-copy"><strong>{t('demo.posts.global_target')}</strong><small>{t(remote?.globalRecorded?'demo.posts.recorded':'demo.posts.global_rule')}</small></span></label>
   {targets.map(target=><label className={`reuse-target ${eligible(target)?'':'unavailable'}`} key={sourceKey(target)}><input type="checkbox" aria-label={target.name} disabled={isWeekPreview||!eligible(target)||busy} checked={chosen.includes(sourceKey(target))} onChange={event=>setChosen(values=>event.target.checked?[...values,sourceKey(target)]:values.filter(value=>value!==sourceKey(target)))}/><span className="reuse-target-copy"><AtelierNameLabel/><strong>{target.name}</strong><AtelierConcept concept={target.concept}/>{(target.posted||target.status!=='open'||!target.active||target.day!==source.day)&&<small>{t(target.posted?'demo.posts.recorded':target.status!=='open'?'demo.posts.closed':'demo.posts.other_day')}</small>}</span></label>)}
   <button className="button" disabled={isWeekPreview||busy||!photo||!canSubmit} onClick={()=>setConfirm(true)}>{t(globalChosen?'demo.posts.continue_global':'demo.posts.continue',{n:chosenTargets.length})}</button>
  </>}
  {results.length>0&&<div className="reuse-results" role="status">{results.map(result=><p key={result.code} className={result.done?'':'error'}>{result.done?t('demo.posts.done',{name:result.name??result.code}):`${result.name}：${result.message??sharedErrorMessage(result.error??'unavailable')}`}</p>)}</div>}
  {error&&<p className="error" role="alert">{error}</p>}
  {initialSource&&<button className="button secondary" disabled={busy} onClick={onBack}>{t('demo.shared.back')}</button>}
  <HelpDetails><p>{t('demo.posts.rule')}</p><p>{t('demo.posts.global_note')}</p></HelpDetails>
  {confirm&&source&&photo&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="reuse-title"><h2 id="reuse-title">{t('demo.posts.continue_global')}</h2><img className="confirm-photo" src={photo} alt={t('demo.posts.photo',{name:source.name})}/><p>{t('demo.posts.confirm')}</p><ul>{globalChosen&&<li>{t('demo.posts.global_target')}</li>}{chosenTargets.map(target=><li key={sourceKey(target)}>{target.name}</li>)}</ul><p>{t('demo.posts.irreversible')}</p><PostingRules checked={rulesAccepted} onChange={setRulesAccepted}/>{error&&<p className="error" role="alert">{error}</p>}<button className="button" disabled={busy||!canSubmit||!rulesAccepted} onClick={()=>void submit()}>{t(busy?'common.loading':'camera.confirm.submit')}</button><button className="button secondary" disabled={busy} onClick={()=>setConfirm(false)}>{t('camera.confirm.back')}</button></section></div>}
 </section>;
}
