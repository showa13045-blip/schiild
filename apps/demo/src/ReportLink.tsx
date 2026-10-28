import React from 'react';
import {reportCopy} from '../../ios/server/report-copy.mjs';
import {blockCopy} from '../../ios/server/block-copy.mjs';
import {currentLanguage} from './language';
import {isReviewMode} from './review-mode';
import {isWeekPreview} from './preview-mode';
export default function ReportLink({url}:{url?:string}){if(isWeekPreview||!url?.startsWith('/report/?'))return null;const language=currentLanguage();return <p style={{margin:'24px 0 8px',fontSize:13}}><a href={url+'&lang='+language+(isReviewMode&&!url.includes('mode=review')?'&mode=review':'')}>{blockCopy[language].action}</a></p>;}
export function BlockedAccess(){if(isWeekPreview)return null;const language=currentLanguage();return <a data-schiild-blocks-access style={{display:'block',margin:'20px 0',color:'inherit',textUnderlineOffset:4}} href={'/blocked/?lang='+language+(isReviewMode?'&mode=review':'')}>{blockCopy[language].manage}</a>;}
export function ReportsAccess(){const language=currentLanguage();return <a href={'/reports/'+(isReviewMode?'?mode=review':'')}>{reportCopy[language][15]}</a>;}
