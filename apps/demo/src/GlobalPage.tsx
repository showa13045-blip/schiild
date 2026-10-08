import React,{useEffect,useState} from 'react';
import {Icon} from '../App';
import {t} from './copy';
import {sharedRequest} from './shared-api';
import {dataUrl,globalPixels,synthetic} from './engine';
import {dayAfter} from './model';
import type {Work} from './model';
export type GlobalSelection={day:string;sample?:Work};
type GlobalWork={day:string;image:string|null;count:number;ateliers:number;cumulative?:number;final:boolean;x?:number;y?:number};
const PIXEL_SIZE=18;
export default function GlobalPage({selection,revision}:{selection:GlobalSelection;revision:number}){
 const [work,setWork]=useState<GlobalWork|null>(null),[error,setError]=useState(''),[zoom,setZoom]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let sequence=0;
  setWork(null);setError('');setZoom(false);
  if(selection.sample){const sample=selection.sample,seed=Number(selection.day.replaceAll('-',''));const made=sample.global??dataUrl(globalPixels(synthetic(seed),seed).pixels);setWork({day:sample.day,image:made,count:sample.count,ateliers:1,final:true,...(sample.global?{x:sample.x,y:sample.y}:{})});return()=>controller.abort();}
  async function refresh(){const request=++sequence;try{const next=await sharedRequest<GlobalWork>('global',{day:selection.day},controller.signal);if(!controller.signal.aborted&&request===sequence){setWork(next);setError('');}}catch(cause){if(!controller.signal.aborted&&request===sequence)setError(cause instanceof Error?cause.message:t('error.server.body'));}}
  void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&selection.day===new Date().toISOString().slice(0,10))void refresh();},5000);
  return()=>{controller.abort();clearInterval(timer);};
 },[selection.day,selection.sample,revision]);
 const day=selection.day,short=(value:string)=>`${Number(value.slice(5,7))}/${Number(value.slice(8))}`,mine=work?.x!==undefined&&work?.y!==undefined,x=work?.x??0,y=work?.y??0;
 return <section className="global-page" data-testid="global-page" data-day={day} style={{'--global-pixel-size':`${PIXEL_SIZE}px`} as React.CSSProperties}>
  <div className="wall-label">{t('global.label')}</div><h1>{day.replaceAll('-',' / ')}</h1><p className="window">{t('atelier.window',{start:short(day)+' 09:00',end:short(dayAfter(day))+' 09:00'})}</p>
  {selection.sample&&<p className="sample-note">{t('demo.global.sample')}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!work&&!error&&<p>{t('common.loading')}</p>}
  {work&&!work.image&&<p>{t('demo.global.empty')}</p>}
  {work?.image&&<>
   <div className="global-overview artboard"><img src={work.image} alt={t('global.label')}/>{mine&&<span className="pixel-marker" style={{left:`${x/256*100}%`,top:`${y/256*100}%`}}/>}</div>
   {mine?<><button className="pixel-link" onClick={()=>setZoom(!zoom)}><span>{t('global.your_pixel',{n:y*256+x+1})}</span><Icon kind="arrow"/></button><div className="zoom-stage" data-testid="global-zoom" data-zoom={zoom}><img src={work.image} alt={t('schiild.regions.mine')} style={{transformOrigin:`${(x+.5)/256*100}% ${(y+.5)/256*100}%`,transform:zoom?`translate(${(128-x-.5)/256*100}%, ${(128-y-.5)/256*100}%) scale(${PIXEL_SIZE})`:'scale(1)'}}/><span className={zoom?'zoom-target visible':'zoom-target'}/></div><div className="loupe-row"><div className="loupe"><img src={work.image} alt={t('schiild.regions.mine')} style={{left:-(x-4)*PIXEL_SIZE,top:-(y-4)*PIXEL_SIZE}}/><span/></div><div><p className="mono">{t('global.coords',{x,y})}</p><p className="muted">{t('schiild.regions.mine')}</p></div></div></>:<p>{t('demo.global.no_pixel')}</p>}
   <div className="stats"><div><span>{t('global.stat.posts')}</span><b>{work.count}</b></div><div><span>{t('global.stat.ateliers')}</span><b>{work.ateliers}</b></div>{work.cumulative!==undefined&&<div><span>{t('global.stat.cumulative')}</span><b>{work.cumulative}</b></div>}</div>
   {!work.final&&!selection.sample&&<p className="shared-note">{t('demo.global.live')}</p>}
  </>}
  <p className="quiet">{t('global.not_for_sale')}</p>
 </section>;
}
