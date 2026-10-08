import React from 'react';
import {Icon} from '../App';
import {t} from './copy';
export type Navigation={screen:'home'|'archive';revision:number;openDay?:string};

export default function DemoNav({active,onHome,onGlobal,onArchive}:{active:string;onHome:()=>void;onGlobal:()=>void;onArchive:()=>void}){
 return <nav className="nav" aria-label={t('home.title')}>
  <button className={active==='home'?'active':''} onClick={onHome}><Icon kind="grid"/><span>{t('home.title')}</span></button>
  <button className={active==='global'?'active':''} onClick={onGlobal}><Icon kind="global"/><span>{t('global.label')}</span></button>
  <button className={active==='archive'?'active':''} onClick={onArchive}><Icon kind="archive"/><span>{t('archive.title')}</span></button>
 </nav>;
}
