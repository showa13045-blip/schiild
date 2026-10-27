import ModerationNotice from './ModerationNotice';
import ReportLink from './ReportLink';
import React,{useCallback,useEffect,useState} from 'react';
import {t} from './copy';
import {shortDate} from './language';
import {sharedRequest,SharedError} from './shared-api';
import {dataUrl,globalPixels,synthetic} from './engine';
import {dayAfter} from './model';
import type {Work} from './model';
import AreaDisplay from './AreaDisplay';
import GlobalExplorer from './GlobalExplorer';
import type {GlobalSchiil} from './global-schiils';
export type GlobalSelection={day:string;sample?:Work};
type GlobalWork={reportUrl?:string;moderationStatus?:string;day:string;image:string|null;schiilImage?:string;count:number;ateliers:number;final:boolean;x?:number;y?:number;positions?:number[];outputSize?:number;layoutRevision?:string};
export default function GlobalPage({selection,revision}:{selection:GlobalSelection;revision:number}){
 const [work,setWork]=useState<GlobalWork|null>(null),[error,setError]=useState(''),[zoom,setZoom]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let sequence=0;
  setWork(null);setError('');setZoom(false);
  if(selection.sample){const sample=selection.sample,seed=Number(selection.day.replaceAll('-',''));const made=sample.global??dataUrl(globalPixels(synthetic(seed),seed).pixels);setWork({day:sample.day,image:made,count:sample.count,ateliers:1,final:true,...(sample.global?{x:sample.x,y:sample.y}:{})});return()=>controller.abort();}
  async function refresh(){const request=++sequence;try{const next=await sharedRequest<GlobalWork>('global',{day:selection.day},controller.signal);if(!controller.signal.aborted&&request===sequence){setWork(next);setError('');}}catch(cause){if(!controller.signal.aborted&&request===sequence)setError(cause instanceof Error?cause.message:t('error.server.body'));}}
  void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&selection.day===new Date().toISOString().slice(0,10))void refresh();},5000);
  return()=>{controller.abort();clearInterval(timer);};
 },[selection.day,selection.sample,revision,reload]);
 const loadSchiils=useCallback(async(positions:number[],signal:AbortSignal)=>{
  try{return (await sharedRequest<{schiils:GlobalSchiil[]}>('global.schiils',{day:selection.day,positions,layoutRevision:work?.layoutRevision},signal)).schiils;}
  catch(cause){if(!signal.aborted&&cause instanceof SharedError&&cause.code==='retry')setReload(value=>value+1);throw cause;}
 },[selection.day,work?.layoutRevision]);
 const day=selection.day,short=shortDate,mine=work?.x!==undefined&&work?.y!==undefined,x=work?.x??0,y=work?.y??0,resolution=work?.outputSize||256,total=resolution*resolution;
 return <section className="global-page" data-testid="global-page" data-day={day}>
  <div className="wall-label">{t('global.label')}</div><h1>{day.replaceAll('-',' / ')}</h1><p className="window">{t('atelier.window',{start:short(day)+' 09:00',end:short(dayAfter(day))+' 09:00'})}</p>
  <ModerationNotice status={work?.moderationStatus}/>{selection.sample&&<p className="sample-note">{t('demo.global.sample')}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!work&&!error&&<p>{t('common.loading')}</p>}
  {work&&!work.image&&<p>{t('demo.global.empty')}</p>}
  {work?.image&&<>
   <div data-testid="global-zoom" data-zoom={zoom}><GlobalExplorer key={day+'/'+(work.layoutRevision??work.image)} image={work.image} detailImage={work.schiilImage} positions={work.positions} mine={mine?{x,y}:undefined} sample={Boolean(selection.sample)} resolution={resolution} loadSchiils={selection.sample?undefined:loadSchiils} onFocusMine={()=>setZoom(true)} onReset={()=>setZoom(false)}/></div>
   {!mine&&<p>{t('demo.global.no_pixel')}</p>}
   <div className="stats global-stats"><div><span>{t('global.stat.posts')}</span><b>{work.count}</b></div></div>
   <AreaDisplay global area={{pixels:mine?1:0,total,percent:(mine?1:0)/total*100}}/>
   {!work.final&&!selection.sample&&<p className="shared-note">{t('demo.global.live')}</p>}<ReportLink url={work.reportUrl}/>
  </>}
 </section>;
}
