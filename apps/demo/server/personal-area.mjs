// DEMO ONLY. Area means allocated image pixels, never a financial or legal right.
import {partition,random} from '../src/engine.ts';
import {participants} from './membership.mjs';
export function dayArea(room,day,member){
 const total=128*128,slot=day?participants(room,day).indexOf(member):-1;
 const rect=slot>=0&&day?.posts[slot]?partition(room.capacity,random(day.seed)).find(value=>value.slot===slot):undefined;
 const pixels=rect?rect.w*rect.h:0;
 return {pixels,total,percent:pixels/total*100,...(rect?{rect}:{})};
}
export function areaSummary(rooms,globals,member){
 const dates=new Set(globals.filter(row=>row.data.pixels[member]).map(row=>row.data.day));
 const ateliers=rooms.map(({data:room})=>{
  let pixels=0,days=0;
  for(const day of Object.values(room.days)){const area=dayArea(room,day,member);if(area.pixels){pixels+=area.pixels;days++;dates.add(day.day);}}
  return {code:room.code,name:room.name,pixels,days,joined:room.members.includes(member)};
 }).filter(room=>room.days>0);
 return {global:{pixels:dates.size,days:dates.size},atelier:{pixels:ateliers.reduce((n,room)=>n+room.pixels,0),days:ateliers.reduce((n,room)=>n+room.days,0)},ateliers};
}
