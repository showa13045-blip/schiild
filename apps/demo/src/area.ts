// DEMO ONLY. Count recorded image cells; exclude preloaded sample history.
import type {Rect} from './engine';
import type {Collection} from './ateliers';
export type Area={pixels:number;total:number;percent:number;rect?:Rect};
export type AreaSummary={global:{pixels:number;days:number};atelier:{pixels:number;days:number};ateliers:{code:string;name:string;pixels:number;days:number;joined:boolean}[]};
export function rectArea(rect?:Rect):Area{const total=16384,pixels=rect?rect.w*rect.h:0;return {pixels,total,percent:pixels/total*100,...(rect?{rect}:{})};}
export function localAreas(collection:Collection):AreaSummary{
 const globalDays=new Set<string>();
 const ateliers=[...collection.ateliers,...(collection.departed??[])].filter(entry=>!entry.online).map(entry=>{
  const days=new Map<string,number>();
  for(const work of entry.state.works){const pixels=work.area?.pixels??(work.global?rectArea(work.rects.find(rect=>rect.slot===0)).pixels:0);if(pixels){days.set(work.day,pixels);globalDays.add(work.day);}}
  if(entry.state.photo){days.set(entry.state.day,rectArea(entry.state.rects.find(rect=>rect.slot===0)).pixels);globalDays.add(entry.state.day);}
  return {code:entry.code,name:entry.name,pixels:[...days.values()].reduce((sum,value)=>sum+value,0),days:days.size,joined:collection.ateliers.some(value=>value.code===entry.code)};
 }).filter(entry=>entry.days>0);
 return {global:{pixels:globalDays.size,days:globalDays.size},atelier:{pixels:ateliers.reduce((sum,entry)=>sum+entry.pixels,0),days:ateliers.reduce((sum,entry)=>sum+entry.days,0)},ateliers};
}
