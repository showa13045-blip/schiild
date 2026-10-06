import {createHash, randomBytes, randomInt} from 'node:crypto';
import sharp from 'sharp';
import {partition, random, render, shuffle} from '../src/engine.ts';

export class ApiError extends Error {
 constructor(status, code){super(code);this.status=status;this.code=code;}
}
const fail=(status,code)=>{throw new ApiError(status,code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const utcDay=now=>new Date(now).toISOString().slice(0,10);
const codePattern=/^[A-Z0-9]{8}$/;
const roomKey=code=>`rooms/${code}`;
const photoKey=(member,day)=>`photos/${member}/${day}`;

// The store contract uses strong reads and conditional writes. Never overwrite a
// room revision after another participant has changed it.
export function createAtelierService(store,{now=()=>Date.now()}={}){
 async function read(code){const entry=await store.getWithMetadata(roomKey(code),{type:'json'});if(!entry)fail(404,'not_found');return entry;}
 async function mutate(code,change){
  for(let attempt=0;attempt<12;attempt++){
   const {data,etag}=await read(code);const next=await change(data);
   const result=await store.setJSON(roomKey(code),next,{onlyIfMatch:etag});
   if(result.modified)return next;
  }
  fail(409,'retry');
 }
 function daySeed(room,day){return parseInt(digest(`${room.code}/${day}/${room.seed}`).slice(0,7),16);}
 function current(room){const day=utcDay(now());return room.days[day]??{day,seed:daySeed(room,day),posts:{},status:'open'};}
 function authorize(room,member){const slot=room.members.indexOf(member);if(slot<0)fail(403,'forbidden');return slot;}
 function summary(room,member){
  const day=utcDay(now()),today=room.days[day],slot=authorize(room,member);
  return {code:room.code,name:room.name,capacity:room.capacity,members:room.members.length,day,
   seed:today?.seed??daySeed(room,day),slot,postedSlots:Object.keys(today?.posts??{}).map(Number),
   hasPhoto:Boolean(today?.posts[slot]),canGenerate:room.creator===member,
   status:today?.status??'open',works:Object.values(room.days).filter(d=>d.status==='ready').sort((a,b)=>b.day.localeCompare(a.day)).map(d=>({day:d.day,seed:d.seed,count:Object.keys(d.posts).length,index:d.index,custody:d.custodian===member?'self':'other'}))};
 }
 return async function execute(body,credential){
  if(!credential||!/^[a-f0-9]{64}$/.test(credential))fail(401,'unauthorized');
  const member=digest(credential),action=body.action,code=String(body.code??'');
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
   return {code,name:room.name,capacity:room.capacity,members:room.members.length,total:Object.values(room.days).filter(d=>d.status==='ready').length};
  }
  if(action==='join'){
   const room=await mutate(code,room=>{
    if(room.members.includes(member))return room;
    if(room.members.length>=room.capacity)fail(409,'full');
    room.members.push(member);return room;
   });return summary(room,member);
  }
  let {data:room}=await read(code);const slot=authorize(room,member);
  if(action==='state')return summary(room,member);
  if(action==='post'){
   const day=utcDay(now());if(body.day!==day)fail(409,'window_closed');
   if(room.days[day]?.status&&room.days[day].status!=='open')fail(409,'window_closed');
   // A single image per credential and UTC day is shared across its ateliers.
   const key=photoKey(member,day);let saved=await store.get(key,{type:'arrayBuffer'});
   if(!saved){
    if(typeof body.photo!=='string'||body.photo.length>4000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))fail(400,'image_invalid');
    const bytes=Buffer.from(body.photo.slice(body.photo.indexOf(',')+1),'base64');
    let normalized;
    try{
     const image=sharp(bytes,{limitInputPixels:1080*1080}),metadata=await image.metadata();
     if(metadata.width!==1080||metadata.height!==1080||metadata.format!=='jpeg')fail(400,'image_invalid');
     normalized=await image.jpeg({quality:85}).toBuffer();
    }catch(error){if(error instanceof ApiError)throw error;fail(400,'image_invalid');}
    await store.set(key,normalized.buffer.slice(normalized.byteOffset,normalized.byteOffset+normalized.byteLength),{onlyIfNew:true});
   }
   room=await mutate(code,room=>{
    const today=current(room);if(today.status!=='open')fail(409,'window_closed');
    today.posts[authorize(room,member)]=key;room.days[day]=today;return room;
   });return summary(room,member);
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
    today.custodian=room.members[contributors[randomInt(contributors.length)]];
    today.index=Object.values(room.days).filter(d=>d.status==='ready').length+1;
    room.days[day]=today;return room;
   });
   const today=room.days[day];
   if(today.status!=='ready'){
    const artifactKey=`works/${code}/${day}`;
    if(!await store.get(artifactKey,{type:'arrayBuffer'})){
     const rects=partition(room.capacity,random(today.seed));
     const sources=await Promise.all(rects.map(async rect=>{
      const key=today.posts[rect.slot];if(!key)return null;
      const photo=await store.get(key,{type:'arrayBuffer'});if(!photo)fail(503,'generation_failed');
      const {data,info}=await sharp(Buffer.from(photo)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      return {width:info.width,height:info.height,data:new Uint8ClampedArray(data)};
     }));
     const pixels=render(rects,sources,today.seed);
     const png=await sharp(Buffer.from(pixels.data),{raw:{width:128,height:128,channels:4}}).png().toBuffer();
     await store.set(artifactKey,png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength),{onlyIfNew:true});
    }
    room=await mutate(code,room=>{room.days[day].status='ready';return room;});
   }
   return summary(room,member);
  }
  if(action==='work'){
   const work=room.days[String(body.day)];if(!work||work.status!=='ready')fail(404,'not_found');
   const bytes=await store.get(`works/${code}/${work.day}`,{type:'arrayBuffer'});if(!bytes)fail(503,'generation_failed');
   return {day:work.day,image:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,rects:partition(room.capacity,random(work.seed)),order:shuffle(Array.from({length:room.capacity},(_,n)=>n),random(work.seed+31)),count:Object.keys(work.posts).length,index:work.index,custody:work.custodian===member?'self':'other',opened:false};
  }
  fail(400,'invalid');
 };
}
