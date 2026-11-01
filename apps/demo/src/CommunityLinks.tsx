import React from 'react';
import {communityCopy} from '../../ios/server/community-copy.mjs';
import {currentLanguage} from './language';
import {isReviewMode} from './review-mode';
import {isWeekPreview} from './preview-mode';
function href(path:string,values:Record<string,string>={}){return path+'?'+new URLSearchParams({...values,lang:currentLanguage(),...(isReviewMode?{mode:'review'}:{})});}
export function ChatLink({code,day}:{code:string;day:string}){return isWeekPreview?null:<a data-schiild-chat className="schiild-community-link" href={href('/chat/',{code,day})}>{communityCopy[currentLanguage()].chat}</a>;}
export function ProfileIconLink(){return isWeekPreview?null:<a data-schiild-profile-icon className="schiild-community-link" href={href('/profile-icon/')}>{communityCopy[currentLanguage()].icon}</a>;}
