// DEMO ONLY. The week example has an isolated, in-memory browser session.
// It never reads, erases or writes the normal demo's account or local records.
import {isReviewMode,reviewStorage} from './review-mode.ts';
export const isWeekPreview=typeof location!=='undefined'&&location.pathname==='/week/';
export const WEEK_LAST_DAY='2026-10-19';
export const demoDay=()=>isWeekPreview?WEEK_LAST_DAY:new Date().toISOString().slice(0,10);
function memoryStorage():Storage{
 const values:Record<string,string>=Object.create(null);
 return new Proxy(values,{
  get(target,key){
   if(key==='getItem')return (name:string)=>target[name]??null;
   if(key==='setItem')return (name:string,value:string)=>{target[name]=String(value);};
   if(key==='removeItem')return (name:string)=>{delete target[name];};
   if(key==='clear')return ()=>{for(const name of Object.keys(target))delete target[name];};
   if(key==='key')return (index:number)=>Object.keys(target)[index]??null;
   if(key==='length')return Object.keys(target).length;
   return target[key as string];
  },
 }) as unknown as Storage;
}
const local=memoryStorage(),session=memoryStorage();
export const browserStorage=()=>isWeekPreview?local:isReviewMode?reviewStorage(localStorage):localStorage;
export const browserSessionStorage=()=>isWeekPreview?session:isReviewMode?reviewStorage(sessionStorage):sessionStorage;
