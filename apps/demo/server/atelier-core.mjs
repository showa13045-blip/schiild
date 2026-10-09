import {createHash, randomBytes, randomInt} from 'node:crypto';
import {partition, random, shuffle} from '../src/engine.ts';
import {globalService} from './global-service.mjs';
import {participants,memberCount,snapshotDays} from './membership.mjs';
import {listRecords} from './accounts.mjs';
import {dayArea,areaSummary} from './personal-area.mjs';

export class ApiError extends Error {
 constructor(status, code){super(code);this.status=status;this.code=code;}
}
const fail=(status,code)=>{throw new ApiError(status,code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const utcDay=now=>new Date(now).toISOString().slice(0,10);
const codePattern=/^[A-Z0-9]{8}$/;
const roomKey=code=>`rooms/${code}`;
const photoKey=(member,day,content)=>`photos/${member}/${day}/${content}`;

// The store contract uses strong reads and conditional writes. Never overwrite a
// room revision after another participant has changed it.
export function createAtelierService(store,{now=()=>Date.now(),images,memberForCredential=digest}={}){
 const global=globalService(store,{now,images});
 async function read(code){const entry=await store.getWithMetadata(roomKey(code),{type:'json'});if(!entry)fail(404,'not_found');return entry;}
 async function mutate(code,change){
  for(let attempt=0;attempt<12;attempt++){
   const {data,etag}=await read(code);const next=await change(snapshotDays(data));
   const result=await store.setJSON(roomKey(code),next,{onlyIfMatch:etag});
   if(result.modified)return next;
  }
  fail(409,'retry');
 }
 function daySeed(room,day){return parseInt(digest(`${room.code}/${day}/${room.seed}`).slice(0,7),16);}
 function current(room){const day=utcDay(now());return room.days[day]??{day,seed:daySeed(room,day),members:[...room.members],posts:{},status:'open'};}
 function authorize(room,member){const slot=room.members.indexOf(member);if(slot<0)fail(403,'forbidden');return slot;}
 async function ownPost(sourceCode,day,member){
  if(!codePattern.test(sourceCode))fail(404,'not_found');
  const {data:source}=await read(sourceCode),record=source.days[day],sourceSlot=record?participants(source,record).indexOf(member):-1;
  const key=sourceSlot>=0?record.posts[sourceSlot]:null;if(!key)fail(403,'source_forbidden');
  return key;
 }
 async function composeDay(room,today){
  return images.compose(partition(room.capacity,random(today.seed)),async rect=>{
   const key=today.posts[rect.slot];if(!key)return null;
   const photo=await store.get(key,{type:'arrayBuffer'});if(!photo)fail(503,'generation_failed');
   return photo;
  },today.seed);
 }
 function summary(room,member){
  const day=utcDay(now()),today=room.days[day],slot=authorize(room,member);
  return {code:room.code,name:room.name,capacity:room.capacity,members:memberCount(room),day,
   seed:today?.seed??daySeed(room,day),slot,postedSlots:Object.keys(today?.posts??{}).map(Number),
   hasPhoto:Boolean(today?.posts[slot]),canGenerate:room.creator===member,
   area:dayArea(room,today,member),status:today?.status??'open',works:Object.values(room.days).filter(d=>d.status==='ready').sort((a,b)=>b.day.localeCompare(a.day)).map(d=>({day:d.day,seed:d.seed,count:Object.keys(d.posts).length,index:d.index,custody:d.custodian===member?'self':'other',area:dayArea(room,d,member)}))};
 }
 return async function execute(body,credential){
  if(!credential||!/^[a-f0-9]{64}$/.test(credential))fail(401,'unauthorized');
  const member=memberForCredential(credential),action=body.action,code=String(body.code??'');
  if(action==='global')return global.view(String(body.day??utcDay(now())),member);
  if(action==='area')return areaSummary(await listRecords(store,'rooms/'),await listRecords(store,'globals/'),member);
  if(action==='posts'){
   const day=utcDay(now()),rows=await listRecords(store,'rooms/');
   const sources=rows.flatMap(({data:source})=>{const record=source.days[day],sourceSlot=record?participants(source,record).indexOf(member):-1;return sourceSlot>=0&&record.posts[sourceSlot]?[{code:source.code,name:source.name,day}]:[];});
   const targets=rows.filter(({data:target})=>target.members.includes(member)).map(({data:target})=>{const status=summary(target,member);return {code:target.code,name:target.name,posted:status.hasPhoto,status:status.status};});
   return {day,sources,targets};
  }
  if(action==='post.photo'){
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   const key=await ownPost(String(body.sourceCode??''),day,member),photo=await store.get(key,{type:'arrayBuffer'});if(!photo)fail(503,'unavailable');
   return {day,photo:`data:image/jpeg;base64,${Buffer.from(photo).toString('base64')}`};
  }
  if(action==='reuse'){
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   if(!Array.isArray(body.codes)||!body.codes.length||body.codes.length>20||new Set(body.codes).size!==body.codes.length||body.codes.some(value=>typeof value!=='string'||!codePattern.test(value)))fail(400,'invalid');
   await ownPost(String(body.sourceCode??''),day,member);
   const results=[];
   // Each target is immutable independently; partial failures are returned explicitly.
   for(const target of body.codes){try{const next=await execute({action:'post',code:target,day,sourceCode:body.sourceCode},credential);results.push({code:target,name:next.name,done:true});}catch(cause){results.push({code:target,done:false,error:cause instanceof ApiError?cause.code:'unavailable'});}}
   return {day,results};
  }
  if(action==='create'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>40||![2,5,12,20].includes(body.capacity))fail(400,'invalid');
   for(let attempt=0;attempt<8;attempt++){
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const nextCode=Array.from(randomBytes(8),n=>alphabet[n%32]).join('');
    const room={code:nextCode,name:body.name.trim(),capacity:body.capacity,creator:member,members:[member],seed:randomInt(2147483647),days:{}};
    const result=await store.setJSON(roomKey(nextCode),room,{onlyIfNew:true});
    if(result.modified)return summary(room,member);
   }
   fail(503,'retry');
  }
  if(!codePattern.test(code))fail(404,'not_found');
  if(action==='preview'){
   const {data:room}=await read(code);
   return {code,name:room.name,capacity:room.capacity,members:memberCount(room),total:Object.values(room.days).filter(d=>d.status==='ready').length};
  }
  if(action==='join'){
   const room=await mutate(code,room=>{
    if(room.members.includes(member))return room;
    if(memberCount(room)>=room.capacity)fail(409,'full');
    const today=current(room),previous=participants(room,today).indexOf(member);
    // A departed participant can return to their own recorded slot today.
    let slot=previous>=0&&!room.members[previous]?previous:room.members.findIndex((value,n)=>!value&&!today.posts[n]);
    if(slot<0){if(room.members.length>=room.capacity)fail(409,'slots_reserved');slot=room.members.length;}
    room.members[slot]=member;
    if(room.days[today.day])room.days[today.day].members[slot]=member;
    room.creator??=member;
    return room;
   });return summary(room,member);
  }
  if(action==='leave'){
   await mutate(code,room=>{
    const slot=room.members.indexOf(member);if(slot<0)return room;
    room.members[slot]=null;
    if(room.creator===member)room.creator=room.members.find(Boolean)??null;
    return room;
   });
   return {done:true,code};
  }
  let {data:room}=await read(code);const slot=authorize(room,member);
  if(action==='state')return summary(room,member);
  // DEMO ONLY: render a read-only snapshot, without sealing the day or saving it.
  if(action==='draft'){
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   const today=current(room);if(today.status!=='open')fail(409,'window_closed');
   const count=Object.keys(today.posts).length;if(!count)fail(409,'no_photos');
   const png=await composeDay(room,today);
   return {day,image:`data:image/png;base64,${Buffer.from(png).toString('base64')}`,count,area:dayArea(room,today,member),provisional:true};
  }
  if(action==='post'){
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   if(room.days[day]?.status&&room.days[day].status!=='open')fail(409,'window_closed');
   // DEMO ONLY: one immutable photo per atelier/day. Reuse is always explicit.
   let key;
   if(body.sourceCode!==undefined)key=await ownPost(String(body.sourceCode),day,member);
   else{
    if(typeof body.photo!=='string'||body.photo.length>4000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))fail(400,'image_invalid');
    const bytes=Buffer.from(body.photo.slice(body.photo.indexOf(',')+1),'base64');
    let normalized;
    try{
     normalized=await images.normalize(bytes);
    }catch(error){if(error instanceof ApiError)throw error;fail(400,'image_invalid');}
    key=photoKey(member,day,digest(normalized));
    if(room.days[day]?.posts[slot]&&room.days[day].posts[slot]!==key)fail(409,'already_recorded');
    if(!await store.get(key,{type:'arrayBuffer'}))await store.set(key,normalized.buffer.slice(normalized.byteOffset,normalized.byteOffset+normalized.byteLength),{onlyIfNew:true});
   }
   room=await mutate(code,room=>{
    if(utcDay(now())!==day)fail(409,'window_closed');
    const today=current(room);if(today.status!=='open')fail(409,'window_closed');
    const targetSlot=authorize(room,member);
    if(today.posts[targetSlot]&&today.posts[targetSlot]!==key)fail(409,'already_recorded');
    today.posts[targetSlot]=key;room.days[day]=today;return room;
   });
   const photo=await store.get(key,{type:'arrayBuffer'});if(!photo)fail(503,'unavailable');
   await global.record(day,member,code,photo);
   return summary(room,member);
  }
  if(action==='generate'){
   if(room.creator!==member)fail(403,'forbidden');
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   room=await mutate(code,room=>{
    const today=current(room);
    if(today.status==='ready'||today.status==='generating')return room;
    if(!Object.keys(today.posts).length)fail(409,'no_photos');
    today.status='generating';
    const contributors=Object.keys(today.posts).map(Number);
    today.custodian=participants(room,today)[contributors[randomInt(contributors.length)]];
    today.index=Object.values(room.days).filter(d=>d.status==='ready').length+1;
    room.days[day]=today;return room;
   });
   const today=room.days[day];
   if(today.status!=='ready'){
    const artifactKey=`works/${code}/${day}`;
    if(!await store.get(artifactKey,{type:'arrayBuffer'})){
     const png=await composeDay(room,today);
     await store.set(artifactKey,png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength),{onlyIfNew:true});
    }
    room=await mutate(code,room=>{room.days[day].status='ready';return room;});
   }
   return summary(room,member);
  }
  if(action==='work'){
   const work=room.days[String(body.day)];if(!work||work.status!=='ready')fail(404,'not_found');
   const bytes=await store.get(`works/${code}/${work.day}`,{type:'arrayBuffer'});if(!bytes)fail(503,'generation_failed');
   return {day:work.day,image:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,rects:partition(room.capacity,random(work.seed)),order:shuffle(Array.from({length:room.capacity},(_,n)=>n),random(work.seed+31)),count:Object.keys(work.posts).length,index:work.index,custody:work.custodian===member?'self':'other',area:dayArea(room,work,member),opened:false};
  }
  fail(400,'invalid');
 };
}
