import React from 'react';
import {currentLanguage} from './language';
import {postingCopy,POSTING_POLICY_VERSION} from '../../ios/server/posting-policy.mjs';
export {POSTING_POLICY_VERSION};
export default function PostingRules({checked,onChange}:{checked:boolean;onChange:(value:boolean)=>void}){
 const copy=postingCopy[currentLanguage()];
 return <div className="posting-rules"><details><summary>{copy.title}</summary><p>{copy.summary}</p><a href={'/posting-rules.html?lang='+currentLanguage()} target="_blank" rel="noreferrer">{copy.title}</a></details><label style={{display:'flex',gap:12,alignItems:'flex-start',margin:'20px 0',lineHeight:1.7}}><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)} style={{flex:'0 0 auto',width:20,height:20,marginTop:4}}/><span>{copy.agree}</span></label></div>;
}
