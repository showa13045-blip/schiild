// DEMO ONLY. One average-color pixel per participant and UTC day. No production generator.
import {createHash} from 'node:crypto';
import {ApiError} from './atelier-core.mjs';
import {listRecords} from './accounts.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const dayKey=day=>`globals/${day}`;
export function globalService(store,{images,now=()=>Date.now()}={}){
 async function record(day,member,code,photo){
  const key=dayKey(day),color=await images.mean(photo);
  for(let attempt=0;attempt<20;attempt++){
   const row=await store.getWithMetadata(key,{type:'json'}),data=row?.data??{day,pixels:{},ateliers:[]};
   if(!data.pixels[member]){
    const occupied=new Set(Object.values(data.pixels).map(pixel=>pixel.position));let position=parseInt(digest(`${day}/${member}`).slice(0,8),16)%65536;
    while(occupied.has(position)){position=(position+1)%65536;if(occupied.size>=65536)throw new ApiError(503,'global_full');}
    data.pixels[member]={position,color};
   }
   if(!data.ateliers.includes(code))data.ateliers.push(code);
   const result=await store.setJSON(key,data,row?{onlyIfMatch:row.etag}:{onlyIfNew:true});if(result.modified)return;
  }
  throw new ApiError(409,'retry');
 }
 async function bootstrap(day){
  const rows=await listRecords(store,'rooms/'),seen=new Set();
  for(const {data:room} of rows){const posts=room.days[day]?.posts??{};for(const [slot,key] of Object.entries(posts)){
   const member=room.members[Number(slot)];if(seen.has(`${member}/${room.code}`))continue;seen.add(`${member}/${room.code}`);
   const existing=(await store.getWithMetadata(dayKey(day),{type:'json'}))?.data;
   if(existing?.pixels[member]&&existing.ateliers.includes(room.code))continue;
   const photo=await store.get(key,{type:'arrayBuffer'});if(photo)await record(day,member,room.code,photo);
  }}
 }
 async function view(day,member){
  const today=new Date(now()).toISOString().slice(0,10);
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||day>today)throw new ApiError(400,'invalid');
  await bootstrap(day);
  const row=await store.getWithMetadata(dayKey(day),{type:'json'});if(!row)return {day,image:null,count:0,ateliers:0,final:day<today};
  const data=row.data,revision=digest(JSON.stringify(data)),key=`global/${day}/${revision}`;
  let bytes=await store.get(key,{type:'arrayBuffer'});
  if(!bytes){const made=await images.global(Object.values(data.pixels));await store.set(key,made,{onlyIfNew:true});bytes=await store.get(key,{type:'arrayBuffer'});}
  if(!bytes)throw new ApiError(503,'unavailable');
  const mine=data.pixels[member],all=await listRecords(store,'globals/');
  return {day,image:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,count:Object.keys(data.pixels).length,ateliers:data.ateliers.length,cumulative:all.reduce((n,row)=>n+Object.keys(row.data.pixels).length,0),final:day<today,...(mine?{x:mine.position%256,y:Math.floor(mine.position/256)}:{})};
 }
 return {record,view};
}
