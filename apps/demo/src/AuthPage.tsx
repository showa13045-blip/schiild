import React from 'react';
import {t} from './copy';
import LanguageSelect from './LanguageSelect';
import type {Language} from './language';
import LineSignIn from './LineSignIn';
import AppleSignIn from './AppleSignIn';
import WhatsAppSignIn from './WhatsAppSignIn';
import {isReviewMode} from './review-mode';
import ReviewSignIn from './ReviewSignIn';
import {nativeAppleAvailable} from './apple-login';
export default function AuthPage({language,onLanguage}:{language:Language;onLanguage:(value:Language)=>void}){
 if(isReviewMode)return <ReviewSignIn/>;
 return <section className="account-page auth-page" data-testid="auth-page"><h1>{t('demo.auth.title')}</h1>{!nativeAppleAvailable()&&<p>{t('demo.auth.line_required')}</p>}<LineSignIn required allowRegistration/><WhatsAppSignIn/><AppleSignIn/><p><a href="/review/?login=1">App Review</a></p><LanguageSelect value={language} onChange={onLanguage}/></section>;
}
