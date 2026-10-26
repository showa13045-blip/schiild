import React from 'react';
import {currentLanguage} from './language';
import {t} from './copy';
// ISO 639 "id" refers to the Indonesian locale.
// eslint-disable-next-line schiild/domain-names
const labels={ja:'お問い合わせ',en:'Support',ko:'문의',fr:'Assistance',nl:'Ondersteuning',es:'Ayuda',it:'Assistenza',id:'Bantuan',km:'ជំនួយ',hi:'सहायता'};
export default function SupportLinks(){return <p className="support-links"><a href="/privacy.html">{t('settings.privacy')}</a>{' · '}<a href="/support.html">{labels[currentLanguage()]}</a></p>;}
