// DEMO ONLY. Silent brand opening. The separately exported PV is never loaded here.
import {isReviewMode} from './review-mode';
import React,{useEffect,useState} from 'react';
import AtelierApp from './AtelierApp';
import {preferences} from './preferences';
import {t} from './copy';
import {activateLanguage,readLanguage} from './language';
import './opening.css';
export default function Entry(){
 activateLanguage(readLanguage());
 const [assemble]=useState(()=>new URLSearchParams(location.search).get('opening')==='assemble');
 const [visible,setVisible]=useState(true),[reduced]=useState(()=>preferences().reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const timer=setTimeout(()=>setVisible(false),reduced?600:assemble?3000:2000);return()=>clearTimeout(timer);},[assemble,reduced]);
 return <><div inert={visible||undefined} aria-hidden={visible||undefined}>{isReviewMode&&<aside style={{padding:12,textAlign:'center',fontSize:12,borderBottom:'1px solid #eee'}}>App Review · Isolated test data · <a href="/">Exit</a></aside>}<AtelierApp/></div>{visible&&<section className={'brand-opening'+(assemble?' assemble':'')+(reduced?' reduced':'')} aria-label="Schiild" data-testid="brand-opening"><div className="opening-lockup"><span className="opening-symbol" aria-hidden="true"><i/><i/><i/></span><h1>Schiild</h1></div><button className="opening-close" onClick={()=>setVisible(false)}>{t('common.close')}</button></section>}</>;
}
