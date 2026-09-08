import {partition,random,render,synthetic,dataUrl,shuffle} from './engine';
import type {Rect} from './engine';
export type Work={day:string;image:string;rects:Rect[];order:number[];count:number;index:number;custody:'self'|'other';opened:boolean;global?:string;x?:number;y?:number};
export type State={version:1;day:string;seed:number;rects:Rect[];photo:string|null;count:number;works:Work[];winner:'self'|'other';ready:string|null};
export const STORAGE='schiild.demo.v1';
export const dayAfter=(day:string,n=1)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function initial(capacity=12,history=true):State{
 const day=new Date().toISOString().slice(0,10),seed=Date.now()%2147483647;
 const works:Work[]=Array.from({length:history?30:0},(_,n)=>{const artSeed=4100+n*137,rects=partition(12,random(artSeed)),count=7+n%6;return {day:dayAfter(day,-n-1),image:dataUrl(render(rects,rects.map((_,k)=>k<count?synthetic(artSeed+k*33):null),artSeed)),rects,order:shuffle(rects.map(r=>r.slot),random(artSeed)),count,index:30-n,custody:n%4?'other':'self',opened:true};});
 return {version:1,day,seed,rects:partition(capacity,random(seed)),photo:null,count:history?2:0,works,winner:'self',ready:null};
}
export function load():State{try{const raw=localStorage.getItem(STORAGE);if(raw){const state=JSON.parse(raw) as State;if(state.version===1&&state.works?.length>=30&&state.rects?.length===12)return state;}}catch{/* Unavailable storage is reported by save; do not crash the experience. */}return initial();}
export function save(state:State){localStorage.setItem(STORAGE,JSON.stringify(state));}
export const REVEAL={start:120,interval:230,recordDelay:500,recordFade:500,custodyDelay:1000,custodyFade:600};
export function revealTimes(count:number){const last=REVEAL.start+(count-1)*REVEAL.interval;return {last,record:last+REVEAL.recordDelay,custody:last+REVEAL.recordDelay+REVEAL.custodyDelay};}
