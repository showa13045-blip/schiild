import React from 'react';
import {t} from './copy';
import type {Area,AreaSummary} from './area';
const number=(value:number)=>value.toLocaleString('ja-JP');
export default function AreaDisplay({area,global=false}:{area:Area;global?:boolean}){
 return <div className="personal-area" data-testid={global?'global-area':'atelier-area'} data-pixels={area.pixels}>
  <span>{t('demo.area.mine')}</span><strong>{number(area.pixels)} px</strong><span className="mono">{t('demo.area.ratio',{total:number(area.total),percent:area.percent.toLocaleString('ja-JP',{maximumFractionDigits:global?4:2})})}</span>
 </div>;
}
export function AreaTotals({value,local=false}:{value:AreaSummary;local?:boolean}){
 return <section className="area-totals" data-testid={local?'local-area-totals':'area-totals'}>
  <h2>{t(local?'demo.area.local':'demo.area.total')}</h2><div className="stats">
   <div><span>{t('demo.area.global_total')}</span><b data-testid="global-total">{number(value.global.pixels)} px</b><span>{t('demo.area.days',{n:value.global.days})}</span></div>
   <div><span>{t('demo.area.atelier_total')}</span><b data-testid="atelier-total">{number(value.atelier.pixels)} px</b><span>{t('demo.area.records',{n:value.atelier.days})}</span></div>
  </div><p className="shared-note">{t('demo.area.total_note')}</p>
  {value.ateliers.map(entry=><div className="area-atelier" key={entry.code}><span>{entry.name}{!entry.joined&&<small>{t('demo.area.left')}</small>}</span><strong>{number(entry.pixels)} px</strong><span className="mono">{t('demo.area.days',{n:entry.days})}</span></div>)}
 </section>;
}
