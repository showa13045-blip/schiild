// DEMO ONLY. Public generated works, without membership or original photographs.
import React,{useEffect,useState} from 'react';
import {sharedRequest} from './shared-api';
import {t} from './copy';
import AtelierConcept from './AtelierConcept';
import ReportLink from './ReportLink';
import {isReviewMode} from './review-mode';
type PublicAtelier={code:string;name:string;concept:string;works:{day:string;index:number;concept:string}[]};
export default function PublicAtelierPage({code,onJoin}:{code:string;onJoin:()=>void}){
 const [room,setRoom]=useState<PublicAtelier|null>(null),[day,setDay]=useState(''),[image,setImage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setRoom(null);setError('');void sharedRequest<PublicAtelier>('public.atelier',{code},controller.signal).then(value=>{setRoom(value);setDay(value.works[0]?.day??'');}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t('error.server.body'));});return()=>controller.abort();},[code]);
 useEffect(()=>{setImage('');setError('');if(!day)return;const controller=new AbortController();void sharedRequest<{image:string}>('public.work',{code,day},controller.signal).then(value=>setImage(value.image)).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t('error.server.body'));});return()=>controller.abort();},[code,day]);
 return <section data-testid="public-atelier-page">{room&&<><h1>{room.name}</h1><AtelierConcept concept={room.concept}/>{room.works.length>0?<><label className="field">{t('archive.title')}<select value={day} onChange={event=>setDay(event.target.value)}>{room.works.map(work=><option key={work.day} value={work.day}>{work.day}</option>)}</select></label>{image?<img className="artboard" src={image} alt={`${room.name} ${day}`} style={{width:'100%',height:'auto',imageRendering:'pixelated'}}/>:!error&&<p role="status">{t('common.loading')}</p>}</>:<p>{t('demo.public.empty')}</p>}<button className="button" onClick={onJoin}>{t('join.submit')}</button></>}<ReportLink url={day?'/report/?target='+code+'&day='+day+(isReviewMode?'&mode=review':''):undefined}/>{!room&&!error&&<p>{t('common.loading')}</p>}{error&&<p className="error" role="alert">{error}</p>}</section>;
}
