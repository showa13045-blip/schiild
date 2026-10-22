import React from 'react';
import {t} from './copy';
import LanguageSelect from './LanguageSelect';
import type {Language} from './language';
import LineSignIn from './LineSignIn';
import WhatsAppSignIn from './WhatsAppSignIn';
import type {WhatsAppResult} from './WhatsAppSignIn';
import {w} from './whatsapp-copy';
export default function AuthPage({language,onLanguage,onComplete}:{language:Language;onLanguage:(value:Language)=>void;onComplete:(value:WhatsAppResult)=>void}){
 return <section className="account-page auth-page" data-testid="auth-page"><h1>{t('demo.auth.title')}</h1><p>{w('authRequired')}</p><LineSignIn allowRegistration/><WhatsAppSignIn onComplete={onComplete}/><LanguageSelect value={language} onChange={onLanguage}/></section>;
}
