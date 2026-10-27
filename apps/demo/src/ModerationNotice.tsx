import React,{useEffect,useState} from 'react';
import {moderationText} from './moderation-copy';
import {isReviewMode} from './review-mode';
import {sharedRequest} from './shared-api';
export default function ModerationNotice({status}:{status?:string}){return status&&status!=='approved'?<p role="status" className="moderation-notice">{moderationText(status==='rejected'?'rejected':'pending')} <a href="/support.html">Support</a></p>:null;}
export function ModerationAccess(){const [operator,setOperator]=useState(false);useEffect(()=>{const controller=new AbortController();void sharedRequest<{operator:boolean}>('moderation.capabilities',{},controller.signal).then(value=>setOperator(value.operator)).catch(()=>{});return()=>controller.abort();},[]);return operator?<p><a href={'/moderation/'+(isReviewMode?'?mode=review':'')}>{moderationText('operator')}</a></p>:null;}
