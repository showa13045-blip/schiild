import AtelierNameLabel from './AtelierNameLabel';
import React from 'react';
import {t} from './copy';
import {shortDate} from './language';
import type {Draft} from './draft';
import {dayAfter} from './model';
import AreaDisplay from './AreaDisplay';
import HelpDetails from './HelpDetails';
import AtelierConcept from './AtelierConcept';

export default function DraftPreview({draft,atelier,local=false,onClose}:{draft:Draft;atelier:string;local?:boolean;onClose:()=>void}){
 const short=shortDate;
 return <section className="draft-preview" data-testid="draft-preview"><div className="subheader"><button className="text-button" onClick={onClose}>{t('common.back')}</button></div><h1>{t('demo.draft.title')}</h1><div className="draft-atelier-name"><AtelierNameLabel/><p>{atelier}</p></div><AtelierConcept concept={draft.concept}/><p className="mono">{draft.day.replaceAll('-',' / ')} ／ {t('demo.draft.count',{n:draft.count})}</p><p className="window">{t('atelier.window',{start:short(draft.day)+' 09:00',end:short(dayAfter(draft.day))+' 09:00'})}</p><img className="draft-art" src={draft.image} alt={t('demo.draft.title')}/>{draft.area&&<AreaDisplay area={draft.area}/>}<HelpDetails label="demo.help.draft"><p>{t('demo.draft.note')}</p>{local&&<p>{t('demo.draft.samples')}</p>}</HelpDetails><button className="button secondary" onClick={onClose}>{t('demo.shared.back')}</button></section>;
}
