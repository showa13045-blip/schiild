import React from 'react';
import {t} from './copy';
import type {Draft} from './draft';
import {dayAfter} from './model';
import AreaDisplay from './AreaDisplay';

export default function DraftPreview({draft,atelier,local=false,onClose}:{draft:Draft;atelier:string;local?:boolean;onClose:()=>void}){
 const short=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
 return <section className="draft-preview" data-testid="draft-preview"><div className="subheader"><button className="text-button" onClick={onClose}>{t('common.back')}</button><span className="wall-label">{t('demo.draft.label')}</span></div><h1>{t('demo.draft.title')}</h1><p>{atelier}</p><p className="mono">{draft.day.replaceAll('-',' / ')} ／ {t('demo.draft.count',{n:draft.count})}</p><p className="window">{t('atelier.window',{start:short(draft.day)+' 09:00',end:short(dayAfter(draft.day))+' 09:00'})}</p><img className="draft-art" src={draft.image} alt={t('demo.draft.title')}/>{draft.area&&<AreaDisplay area={draft.area}/>}<p className="shared-note">{t('demo.draft.note')}</p>{local&&<p className="shared-note">{t('demo.draft.samples')}</p>}<button className="button secondary" onClick={onClose}>{t('demo.shared.back')}</button></section>;
}
