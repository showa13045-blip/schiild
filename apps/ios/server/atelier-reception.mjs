// QR reception delegates membership and photos to the existing authenticated API.
// It never creates guest accounts, skips image review, or adds a GLOBAL submission.
import {randomBytes} from 'node:crypto';
export const receptionKeyValid=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export function receptionSchema(storage){storage.sql.exec('CREATE TABLE IF NOT EXISTS atelier_receptions(code TEXT PRIMARY KEY,reception_key TEXT UNIQUE,enabled INTEGER NOT NULL DEFAULT 0,route TEXT NOT NULL DEFAULT \'direct\',fanclub_url TEXT NOT NULL DEFAULT \'\',version INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)');}
export function receptionService({storage,ErrorClass,dispatch,operatorConfig,review=false,now=()=>Date.now()}){
 receptionSchema(storage);const rows=(query,...args)=>storage.sql.exec(query,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);},today=()=>new Date(now()).toISOString().slice(0,10);
 const json=key=>{const row=rows('SELECT data FROM rooms WHERE key=?',key)[0];return row?JSON.parse(row.data):null;};
 function live(actor){const account=actor?.account&&json('accounts/'+actor.account.username);if(!account||account.member!==actor.member)fail(401,'unauthorized');return account;}
 function operator(actor){let config;try{config=JSON.parse(operatorConfig??'null');}catch{}return config?.enabled===true&&config?.operators?.includes(actor.account?.username);}
 function managed(code,actor){live(actor);if(typeof code!=='string'||!/^[A-Z0-9]{8}$/.test(code))fail(400,'invalid');const room=json('rooms/'+code);if(!room?.official||room.creator!==actor.member&&!operator(actor))fail(404,'not_found');return room;}
 function settings(room){return rows('SELECT * FROM atelier_receptions WHERE code=?',room.code)[0]??{code:room.code,reception_key:null,enabled:0,route:'direct',fanclub_url:'',version:0};}
 function active(key,needOpen=false){if(!receptionKeyValid(key))fail(404,'reception_closed');const config=rows('SELECT * FROM atelier_receptions WHERE reception_key=?',key)[0],room=config&&json('rooms/'+config.code);if(!room?.official||needOpen&&!config.enabled)fail(404,'reception_closed');return {room,config};}
 function view(room,config){const day=today(),path='/collect/'+config.reception_key+'/photo/';return {key:config.reception_key,code:room.code,enabled:Boolean(config.enabled),name:room.name,concept:room.concept??'',day,windowStart:day+'T00:00:00.000Z',windowEnd:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString(),route:config.route,fanclubUrl:config.fanclub_url,version:config.version,receptionUrl:'https://schiild.app'+path,viewUrl:'https://schiild.app/atelier/'+room.code+'/',appUrl:'https://schiild.app/?'+new URLSearchParams({push:'atelier',code:room.code,day,ready:'0'})};}
 function url(value){if(value==='')return '';if(typeof value!=='string'||value.length>2000)fail(400,'reception_url_invalid');let result;try{result=new URL(value);}catch{fail(400,'reception_url_invalid');}if(result.protocol!=='https:'||result.username||result.password||result.port&&result.port!=='443'||result.hostname==='localhost'||result.hostname.endsWith('.localhost')||result.hostname==='schiild.app'||result.hostname==='www.schiild.app')fail(400,'reception_url_invalid');return result.href;}
 return {async execute(body,actor){
  if(review)fail(404,'not_found');
  if(body.action==='reception.destination'){const room=typeof body.code==='string'&&/^[A-Z0-9]{8}$/.test(body.code)&&json('rooms/'+body.code);if(!room?.official)fail(404,'not_found');return {code:room.code,name:room.name,url:'https://schiild.app/atelier/'+room.code+'/'};}
  if(body.action==='reception.info'){const {room,config}=active(body.key);return view(room,config);}
  live(actor);
  if(body.action==='reception.mine')return {items:rows("SELECT data FROM rooms WHERE key LIKE 'rooms/%' AND json_extract(data,'$.official')=1").map(row=>JSON.parse(row.data)).filter(room=>room.creator===actor.member).map(room=>({code:room.code,name:room.name}))};
  if(body.action==='reception.get'){const room=managed(body.code,actor),config=settings(room);return {...(config.reception_key?view(room,config):{code:room.code,name:room.name}),enabled:Boolean(config.enabled),route:config.route,fanclubUrl:config.fanclub_url,version:config.version};}
  if(body.action==='reception.save')return storage.transactionSync(()=>{
   const room=managed(body.code,actor),old=settings(room);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion!==old.version)fail(409,'reception_conflict');if(typeof body.enabled!=='boolean'||!['direct','fanclub'].includes(body.route)||body.rotate!==undefined&&typeof body.rotate!=='boolean')fail(400,'invalid');const fanclub=url(body.fanclubUrl??'');if(body.route==='fanclub'&&!fanclub)fail(400,'reception_url_invalid');
   const key=old.reception_key&&!body.rotate?old.reception_key:randomBytes(16).toString('hex'),stamp=new Date(now()).toISOString();storage.sql.exec('INSERT INTO atelier_receptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET reception_key=excluded.reception_key,enabled=excluded.enabled,route=excluded.route,fanclub_url=excluded.fanclub_url,version=excluded.version,updated_at=excluded.updated_at',room.code,key,body.enabled?1:0,body.route,fanclub,old.version+1,stamp);return {...view(room,settings(room)),enabled:body.enabled};
  });
  const {room,config}=active(body.key,['reception.join','reception.submit'].includes(body.action)),details=view(room,config),joined=room.members.includes(actor.member);
  if(body.action==='reception.status'){
   const recorded=room.days?.[today()],slot=(recorded?.members??room.members).indexOf(actor.member),hasQueue=rows("SELECT name FROM sqlite_master WHERE type='table' AND name='moderation_queue'").length,queued=hasQueue&&rows('SELECT status FROM moderation_queue WHERE member=? AND day=? AND target=?',actor.member,today(),room.code)[0];let retryNoticeKey=null;if(queued?.status==='rejected'&&rows("SELECT name FROM sqlite_master WHERE type='table' AND name='moderation_notices'").length)retryNoticeKey=rows("SELECT notice_key,targets FROM moderation_notices WHERE member=? AND day=? AND kind='photo' ORDER BY created_at DESC",actor.member,today()).find(row=>JSON.parse(row.targets).some(target=>target.target===room.code))?.notice_key??null;return {...details,joined,received:Boolean(queued&&queued.status!=='rejected'||slot>=0&&recorded?.posts?.[slot]&&recorded.posts[slot]!=='deleted-photo'),moderationStatus:queued?.status??null,retryNoticeKey};
  }
  if(body.action==='reception.join')return dispatch({action:'join',code:room.code});
  if(body.action==='reception.submit'){
   if(!joined)fail(403,'reception_join_required');if(body.day!==today())fail(409,'window_closed');
   // The recursive dispatch is the unchanged full authenticated posting pipeline:
   // consent, quota, image normalization, moderation, storage, notifications and generation.
   const response=await dispatch({action:'post',code:room.code,day:body.day,photo:body.photo,policyVersion:body.policyVersion,automaticConsentVersion:body.automaticConsentVersion,...(body.retryNoticeKey?{retryNoticeKey:body.retryNoticeKey}:{})});if(!response.ok)return response;const result=await response.json();return Response.json({...result,reception:details});
  }
  fail(400,'invalid');
 }};
}
