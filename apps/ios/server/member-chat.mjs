// Daily atelier chat only. Every operation rechecks the live account and membership in SQLite.
import {createHash,randomBytes} from 'node:crypto';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyValid=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export function isMemberChatVisible(storage,event,viewer){
 if(!storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='atelier_chat'").toArray().length)return false;
 const item=storage.sql.exec("SELECT member FROM atelier_chat WHERE message_key=? AND code=? AND day=? AND status='visible'",event.messageKey,event.code,event.day).toArray()[0];if(!item)return false;
 return !viewer||!storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").toArray().length||!storage.sql.exec('SELECT block_key FROM personal_blocks WHERE viewer_member=? AND target_member=?',viewer,item.member).toArray().length;
}
export function memberChatSchema(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS atelier_chat (sequence INTEGER PRIMARY KEY AUTOINCREMENT,message_key TEXT NOT NULL UNIQUE,code TEXT NOT NULL,day TEXT NOT NULL,member TEXT NOT NULL,nonce TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(member,nonce))');
 const columns=storage.sql.exec('PRAGMA table_info(atelier_chat)').toArray().map(row=>row.name);
 for(const [name,type]of [['reply_key','TEXT'],['edited_at','TEXT'],['version','INTEGER NOT NULL DEFAULT 1'],['announcement','INTEGER NOT NULL DEFAULT 0']])if(!columns.includes(name))storage.sql.exec('ALTER TABLE atelier_chat ADD COLUMN '+name+' '+type);
 storage.sql.exec('CREATE INDEX IF NOT EXISTS atelier_chat_room ON atelier_chat(code,day,sequence)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS chat_changes (revision INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL,day TEXT NOT NULL,message_key TEXT NOT NULL)');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS chat_changes_room ON chat_changes(code,day,revision)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS chat_operations (member TEXT NOT NULL,nonce TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(member,nonce))');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS chat_confirmations (ticket TEXT PRIMARY KEY,member TEXT NOT NULL,code TEXT NOT NULL,day TEXT NOT NULL,text_hash TEXT NOT NULL,audience_hash TEXT NOT NULL,expires_at INTEGER NOT NULL)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS chat_notices (notice_key TEXT PRIMARY KEY,member TEXT NOT NULL,message_key TEXT NOT NULL,code TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(member,message_key))');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS chat_notices_member ON chat_notices(member,created_at)');
 storage.sql.exec("CREATE TRIGGER IF NOT EXISTS chat_change_update AFTER UPDATE OF text,status ON atelier_chat WHEN OLD.text<>NEW.text OR OLD.status<>NEW.status BEGIN INSERT INTO chat_changes(code,day,message_key) VALUES(NEW.code,NEW.day,NEW.message_key); DELETE FROM chat_notices WHERE message_key=NEW.message_key AND NEW.status<>'visible'; UPDATE rooms SET data=json_set(data,'$.recipients',json('[]'),'$.complete',json('true')),etag=CAST(etag AS INTEGER)+1 WHERE key LIKE 'push-events/%' AND json_extract(data,'$.kind')='chatAnnouncement' AND json_extract(data,'$.messageKey')=NEW.message_key AND NEW.status<>'visible'; END");
 storage.sql.exec('CREATE TRIGGER IF NOT EXISTS chat_change_delete AFTER DELETE ON atelier_chat BEGIN INSERT INTO chat_changes(code,day,message_key) VALUES(OLD.code,OLD.day,OLD.message_key); DELETE FROM chat_notices WHERE message_key=OLD.message_key; END');
}
export function eraseMemberChat(storage,member){
 memberChatSchema(storage);
 storage.sql.exec('DELETE FROM chat_operations WHERE member=?',member);
 storage.sql.exec('DELETE FROM chat_confirmations WHERE member=?',member);
 storage.sql.exec('DELETE FROM chat_notices WHERE member=?',member);
 storage.sql.exec('DELETE FROM chat_notices WHERE NOT EXISTS (SELECT 1 FROM atelier_chat WHERE message_key=chat_notices.message_key)');
 // Remove erased recipients and withdrawn announcements from the existing durable outbox.
 for(const row of storage.sql.exec("SELECT key,data,etag FROM rooms WHERE key LIKE 'push-events/%' AND json_extract(data,'$.kind')='chatAnnouncement'").toArray()){
  const event=JSON.parse(row.data);event.recipients=event.recipients.filter(value=>value!==member);
  if(!storage.sql.exec('SELECT message_key FROM atelier_chat WHERE message_key=?',event.messageKey).toArray().length)event.recipients=[];
  storage.sql.exec('UPDATE rooms SET data=?,etag=? WHERE key=?',JSON.stringify(event),String(Number(row.etag)+1),row.key);
 }
}
export function memberChat({storage,ErrorClass,isOperator=()=>false,acceptsText,now=()=>Date.now(),notifications=false}){
 memberChatSchema(storage);
 const rows=(query,...args)=>storage.sql.exec(query,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);};
 const json=key=>{const row=rows('SELECT data FROM rooms WHERE key=?',key)[0];return row?JSON.parse(row.data):null;};
 function account(actor){const current=actor?.account&&json('accounts/'+actor.account.username);if(!current||current.member!==actor.member)fail(401,'unauthorized');return current;}
 function scope(body,actor){
  account(actor);if(typeof body.code!=='string'||typeof body.day!=='string'||!/^[A-Z0-9]{8}$/.test(body.code)||!/^\d{4}-\d{2}-\d{2}$/.test(body.day)||!Number.isFinite(Date.parse(body.day+'T00:00:00Z'))||new Date(body.day+'T00:00:00Z').toISOString().slice(0,10)!==body.day)fail(400,'invalid');
  const room=json('rooms/'+body.code),today=new Date(now()).toISOString().slice(0,10);
  if(!room||(!room.members.includes(actor.member)&&!isOperator(actor))||body.day>today||body.day!==today&&!room.days?.[body.day]&&!rows('SELECT message_key FROM atelier_chat WHERE code=? AND day=? LIMIT 1',body.code,body.day).length)fail(404,'not_found');return room;
 }
 const blocked=(viewer,target)=>rows("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").length&&rows('SELECT block_key FROM personal_blocks WHERE viewer_member=? AND target_member=?',viewer,target).length;
 const revision=body=>rows('SELECT COALESCE(MAX(revision),0) AS n FROM chat_changes WHERE code=? AND day=?',body.code,body.day)[0].n;
 function target(body,actor,allowRemoved=false){scope(body,actor);if(!keyValid(body.messageKey))fail(400,'invalid');const item=rows('SELECT * FROM atelier_chat WHERE message_key=? AND code=? AND day=?',body.messageKey,body.code,body.day)[0];if(!item||!allowRemoved&&item.status!=='visible'||blocked(actor.member,item.member))fail(404,'chat_message_missing');return item;}
 function person(member){const mapping=json('members/'+member),profile=mapping?.username&&json('accounts/'+mapping.username);return profile?.member===member?profile:null;}
 function itemView(item,actor){
  if(item.status!=='visible'||blocked(actor.member,item.member))return {key:item.message_key,sequence:item.sequence,removed:true,version:item.version};
  const profile=person(item.member),hasIcons=rows("SELECT name FROM sqlite_master WHERE type='table' AND name='profile_icons'").length;
  const image=hasIcons&&rows("SELECT icon_key,image FROM profile_icons WHERE member=? AND status IN ('approved','provisional') ORDER BY created_at DESC,icon_key DESC LIMIT 1",item.member)[0];
  let reply=null;if(item.reply_key){const origin=rows('SELECT * FROM atelier_chat WHERE message_key=? AND code=? AND day=?',item.reply_key,item.code,item.day)[0];reply=origin&&origin.status==='visible'&&!blocked(actor.member,origin.member)?{key:origin.message_key,authorKey:digest(['chat',origin.member]),name:person(origin.member)?.name??'',text:origin.text.slice(0,240)}:{key:item.reply_key,removed:true};}
  const room=json('rooms/'+item.code);
  return {key:item.message_key,sequence:item.sequence,authorKey:digest(['chat',item.member]),text:item.text,createdAt:item.created_at,editedAt:item.edited_at,version:item.version,self:item.member===actor.member,name:profile?.name??'',icon:image?'data:image/jpeg;base64,'+Buffer.from(image.image).toString('base64'):null,iconKey:image?.icon_key??null,reply,announcement:Boolean(item.announcement),canDelete:item.member===actor.member||room?.creator===actor.member||isOperator(actor)};
 }
 const visibility=(actor)=>rows("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").length?{sql:' AND NOT EXISTS (SELECT 1 FROM personal_blocks b WHERE b.viewer_member=? AND b.target_member=c.member)',args:[actor.member]}:{sql:'',args:[]};
 function readPage(body,actor){
  const room=scope(body,actor),filter=visibility(actor);let list,older=null,newer=null;
  if(body.around!==undefined){
   const anchor=target({...body,messageKey:body.around},actor);
   const previous=rows("SELECT * FROM atelier_chat c WHERE code=? AND day=? AND status='visible' AND sequence<=?"+filter.sql+' ORDER BY sequence DESC LIMIT 16',body.code,body.day,anchor.sequence,...filter.args).reverse();
   const next=rows("SELECT * FROM atelier_chat c WHERE code=? AND day=? AND status='visible' AND sequence>?"+filter.sql+' ORDER BY sequence ASC LIMIT 15',body.code,body.day,anchor.sequence,...filter.args);list=[...previous,...next];
  }else{
   if(body.before!==undefined&&body.after!==undefined)fail(400,'invalid');const after=body.after!==undefined,cursor=after?body.after:body.before??Number.MAX_SAFE_INTEGER;
   if(!Number.isSafeInteger(cursor)||cursor<0||!after&&cursor<1)fail(400,'invalid');
   list=rows("SELECT * FROM atelier_chat c WHERE code=? AND day=? AND status='visible' AND sequence"+(after?'>':'<')+'?'+filter.sql+' ORDER BY sequence '+(after?'ASC':'DESC')+' LIMIT 30',body.code,body.day,cursor,...filter.args);if(!after)list.reverse();
  }
  if(list.length){if(rows("SELECT sequence FROM atelier_chat c WHERE code=? AND day=? AND status='visible' AND sequence<?"+filter.sql+' LIMIT 1',body.code,body.day,list[0].sequence,...filter.args).length)older=list[0].sequence;if(rows("SELECT sequence FROM atelier_chat c WHERE code=? AND day=? AND status='visible' AND sequence>?"+filter.sql+' LIMIT 1',body.code,body.day,list.at(-1).sequence,...filter.args).length)newer=list.at(-1).sequence;}
  return {name:room.name,day:body.day,items:list.map(item=>itemView(item,actor)),nextCursor:older,newerCursor:newer,revision:revision(body),canAnnounce:room.creator===actor.member};
 }
 const audience=room=>rows("SELECT DISTINCT m.value AS member FROM json_each(?) m JOIN rooms mapping ON mapping.key='members/'||m.value JOIN rooms a ON a.key='accounts/'||json_extract(mapping.data,'$.username') WHERE json_extract(a.data,'$.member')=m.value ORDER BY m.value",JSON.stringify(room.members)).map(row=>row.member);
 function content(body){if(!acceptsText(body.text))fail(400,'chat_invalid');if(body.replyKey!=null&&!keyValid(body.replyKey))fail(400,'invalid');return body.text.trim();}
 function operation(body,actor,fn){return storage.transactionSync(()=>{
  scope(body,actor);if(!keyValid(body.nonce))fail(400,'invalid');
  const requestHash=digest([body.action,body.code,body.day,body.text?.trim(),body.replyKey??null,body.announcement===true,body.messageKey,body.expectedVersion]);
  const prior=rows('SELECT * FROM chat_operations WHERE member=? AND nonce=?',actor.member,body.nonce)[0];if(prior){if(prior.request_hash!==requestHash)fail(409,'chat_conflict');return JSON.parse(prior.result);}
  const result=fn();storage.sql.exec('INSERT INTO chat_operations VALUES(?,?,?,?)',actor.member,body.nonce,requestHash,JSON.stringify(result));return result;
 });}
 function changed(body,key){storage.sql.exec('INSERT INTO chat_changes(code,day,message_key) VALUES(?,?,?)',body.code,body.day,key);}
 function notices(actor,before){account(actor);if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))fail(400,'invalid');
  const filter=visibility(actor),list=rows('SELECT n.*,c.status,c.sequence FROM chat_notices n JOIN atelier_chat c ON c.message_key=n.message_key JOIN rooms r ON r.key=?||n.code WHERE n.member=? AND c.status=\'visible\' AND EXISTS (SELECT 1 FROM json_each(json_extract(r.data,\'$.members\')) WHERE value=?) AND c.sequence<?'+filter.sql+' ORDER BY c.sequence DESC LIMIT 31','rooms/',actor.member,actor.member,before??Number.MAX_SAFE_INTEGER,...filter.args);
  return {items:list.slice(0,30).map(item=>({key:item.notice_key,code:item.code,day:item.day,messageKey:item.message_key,createdAt:item.created_at,readAt:item.read_at})),nextCursor:list.length>30?list[29].sequence:null};
 }
 return {execute(body,actor){
  if(body.action==='social.announcements.list')return notices(actor,body.before);
  if(body.action==='social.announcements.read')return storage.transactionSync(()=>{account(actor);if(!keyValid(body.noticeKey))fail(400,'invalid');const notice=rows('SELECT * FROM chat_notices WHERE notice_key=? AND member=?',body.noticeKey,actor.member)[0];if(!notice)fail(404,'not_found');scope(notice,actor);target({...notice,messageKey:notice.message_key},actor);storage.sql.exec('UPDATE chat_notices SET read_at=? WHERE notice_key=? AND member=?',new Date(now()).toISOString(),notice.notice_key,actor.member);return {done:true};});
  if(body.action==='social.chat.list')return readPage(body,actor);
  if(body.action==='social.chat.sync'){
   scope(body,actor);if(!Number.isSafeInteger(body.since)||body.since<0)fail(400,'invalid');
   const changes=rows('SELECT * FROM chat_changes WHERE code=? AND day=? AND revision>? ORDER BY revision LIMIT 101',body.code,body.day,body.since),page=changes.slice(0,100),keys=[...new Set(page.map(item=>item.message_key))];
   const items=keys.map(key=>{const item=rows('SELECT * FROM atelier_chat WHERE message_key=? AND code=? AND day=?',key,body.code,body.day)[0];return item?itemView(item,actor):{key,removed:true};});
   const hiddenAuthors=rows("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").length?rows('SELECT target_member FROM personal_blocks WHERE viewer_member=?',actor.member).map(row=>digest(['chat',row.target_member])):[];
   return {items,hiddenAuthors,revision:page.at(-1)?.revision??revision(body),more:changes.length>100,canAnnounce:json('rooms/'+body.code).creator===actor.member};
  }
  if(body.action==='social.chat.prepare')return storage.transactionSync(()=>{
   const room=scope(body,actor);if(room.creator!==actor.member)fail(403,'forbidden');const text=content(body);if(body.replyKey)target({...body,messageKey:body.replyKey},actor);
   const recipients=audience(room),ticket=randomBytes(16).toString('hex');storage.sql.exec('DELETE FROM chat_confirmations WHERE expires_at<?',now());storage.sql.exec('INSERT INTO chat_confirmations VALUES(?,?,?,?,?,?,?)',ticket,actor.member,body.code,body.day,digest([text,body.replyKey??null]),digest(recipients),now()+120000);return {ticket,count:recipients.length,text};
  });
  if(body.action==='social.chat.send')return operation(body,actor,()=>{
   const room=scope(body,actor),text=content(body);
   // Legacy nonces remain idempotent, including retries of messages sent before this release.
   const previous=rows('SELECT * FROM atelier_chat WHERE member=? AND nonce=?',actor.member,body.nonce)[0];if(previous){if(previous.code!==body.code||previous.day!==body.day||previous.text!==text||body.replyKey||body.announcement)fail(409,'chat_conflict');return {key:previous.message_key};}
   if(body.replyKey)target({...body,messageKey:body.replyKey},actor);
   const recipients=body.announcement===true?audience(room):[];
   if(body.announcement===true){if(room.creator!==actor.member)fail(403,'forbidden');const confirmation=rows('SELECT * FROM chat_confirmations WHERE ticket=? AND member=? AND code=? AND day=?',body.confirmation??'',actor.member,body.code,body.day)[0];if(!confirmation||confirmation.expires_at<now()||confirmation.text_hash!==digest([text,body.replyKey??null])||confirmation.audience_hash!==digest(recipients))fail(409,'chat_audience_changed');}
   const last=rows('SELECT created_at FROM atelier_chat WHERE member=? ORDER BY sequence DESC LIMIT 1',actor.member)[0];if(last&&now()-Date.parse(last.created_at)<3000||rows('SELECT COUNT(*) AS n FROM atelier_chat WHERE member=? AND created_at>?',actor.member,new Date(now()-3600000).toISOString())[0].n>=120)fail(429,'chat_limited');
   const key=randomBytes(16).toString('hex'),stamp=new Date(now()).toISOString();storage.sql.exec("INSERT INTO atelier_chat(message_key,code,day,member,nonce,text,status,created_at,reply_key,announcement) VALUES(?,?,?,?,?,?,'visible',?,?,?)",key,body.code,body.day,actor.member,body.nonce,text,stamp,body.replyKey??null,body.announcement===true?1:0);changed(body,key);
   if(body.announcement===true){for(const member of recipients)storage.sql.exec('INSERT INTO chat_notices VALUES(?,?,?,?,?,?,NULL)',randomBytes(16).toString('hex'),member,key,body.code,body.day,stamp);if(notifications){const eventId=digest(['chatAnnouncement',key]);storage.sql.exec('INSERT INTO rooms(key,data,etag) VALUES(?,?,?)','push-events/'+eventId,JSON.stringify({eventId,kind:'chatAnnouncement',messageKey:key,code:body.code,day:body.day,recipients,createdAt:now(),expiresAt:now()+86400000}),'1');}storage.sql.exec('DELETE FROM chat_confirmations WHERE ticket=?',body.confirmation);}
   return {key};
  });
  if(['social.chat.edit','social.chat.delete'].includes(body.action))return operation(body,actor,()=>{
   const item=target(body,actor,true),room=scope(body,actor),edit=body.action==='social.chat.edit';
   if(edit?item.member!==actor.member:item.member!==actor.member&&room.creator!==actor.member&&!isOperator(actor))fail(403,'forbidden');
   if(item.status!=='visible'||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion!==item.version)fail(409,'chat_conflict');
   if(edit){const text=content(body);if(text===item.text)return {key:item.message_key,version:item.version};storage.sql.exec('UPDATE atelier_chat SET text=?,edited_at=?,version=version+1 WHERE message_key=? AND version=?',text,new Date(now()).toISOString(),item.message_key,item.version);}
   else {storage.sql.exec("UPDATE atelier_chat SET text='',status='removed',version=version+1 WHERE message_key=? AND version=?",item.message_key,item.version);storage.sql.exec('DELETE FROM chat_notices WHERE message_key=?',item.message_key);const eventKey='push-events/'+digest(['chatAnnouncement',item.message_key]),event=json(eventKey);if(event)storage.sql.exec('UPDATE rooms SET data=?,etag=CAST(etag AS INTEGER)+1 WHERE key=?',JSON.stringify({...event,recipients:[],complete:true}),eventKey);}
   return {key:item.message_key,version:item.version+1};
  });
  fail(400,'invalid');
 }};
}
