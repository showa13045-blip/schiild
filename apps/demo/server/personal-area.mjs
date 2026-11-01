// DEMO ONLY. Area means allocated image pixels, never a financial or legal right.
import {atelierRects} from '../src/atelier-layout.ts';
import {participants} from './membership.mjs';
import {workSize} from '../src/resolution.ts';
export function dayArea(room,day,member){
 const size=workSize(day),total=size*size,scale=size/128,slot=day?participants(room,day).indexOf(member):-1;
 const rect=slot>=0&&day?.posts[slot]?atelierRects(room,day).find(value=>value.slot===slot):undefined;
 const pixels=rect?rect.w*rect.h*scale*scale:0;
 return {pixels,total,percent:pixels/total*100,...(rect?{rect}:{})};
}
export function areaSummary(rooms,globals,member){
 const dates=new Set(globals.filter(row=>row.data.pixels[member]).map(row=>row.data.day));
 const ateliers=rooms.map(({data:room})=>{
  let pixels=0,days=0;
  for(const day of Object.values(room.days)){const area=dayArea(room,day,member);if(area.pixels){pixels+=area.pixels;days++;}}
  return {code:room.code,name:room.name,pixels,days,joined:room.members.includes(member)};
 }).filter(room=>room.days>0);
 return {global:{pixels:dates.size,days:dates.size},atelier:{pixels:ateliers.reduce((n,room)=>n+room.pixels,0),days:ateliers.reduce((n,room)=>n+room.days,0)},ateliers};
}
