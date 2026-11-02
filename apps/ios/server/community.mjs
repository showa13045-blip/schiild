// DEMO/iOS ONLY. Membership is checked from SQLite for every request, never from the client.
import {createHash,randomBytes} from 'node:crypto';
import {moderationConfig} from './human-moderation.mjs';
import {REPORT_REASONS} from './content-safety.mjs';
import {officialAteliers} from './official-ateliers.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function communitySchema(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS atelier_chat (sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_key TEXT NOT NULL UNIQUE, code TEXT NOT NULL, day TEXT NOT NULL, member TEXT NOT NULL, nonce TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(member,nonce))');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS atelier_chat_room ON atelier_chat(code,day,sequence)');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS atelier_chat_member ON atelier_chat(member,created_at)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS profile_icons (icon_key TEXT PRIMARY KEY, member TEXT NOT NULL, image BLOB NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT, reviewer TEXT)');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS profile_icons_member ON profile_icons(member,status)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS community_reports (report_key TEXT PRIMARY KEY, kind TEXT NOT NULL, target_key TEXT NOT NULL, reporter TEXT, reason TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, reviewer TEXT, reviewed_at TEXT, UNIQUE(kind,target_key,reporter))');
}
// Called inside the existing account-deletion transaction. A failed deletion rolls back all of it.
export function eraseCommunity(storage,member){
 communitySchema(storage);
 storage.sql.exec('DELETE FROM atelier_chat WHERE member=?',member);
 storage.sql.exec('DELETE FROM profile_icons WHERE member=?',member);
 storage.sql.exec('DELETE FROM community_reports WHERE reporter=?',member);
 storage.sql.exec('UPDATE community_reports SET reviewer=NULL WHERE reviewer=?',member);
 storage.sql.exec('UPDATE profile_icons SET reviewer=NULL WHERE reviewer=?',member);
 storage.sql.exec("DELETE FROM community_reports WHERE (kind='chat' AND NOT EXISTS (SELECT 1 FROM atelier_chat WHERE message_key=target_key)) OR (kind='icon' AND NOT EXISTS (SELECT 1 FROM profile_icons WHERE icon_key=target_key))");
}
// The filter is deliberately limited; reports and operator removal remain available.
export function acceptsChatText(text,extra=[]){
 if(typeof text!=='string'||!text.trim()||[...text].length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text))return false;
 const folded=text.normalize('NFKC').toLocaleLowerCase().replace(/[\u200b-\u200d\ufeff]/gu,'');
 const phrases=['kill yourself','child porn','児童ポルノ','自殺しろ','죽어버려','아동 포르노','pornographie infantile','pornografia infantil','pornografia minorile','kinderporno','pornografi anak','बाल अश्लील','រូបអាសអាភាសកុមារ',...extra.filter(term=>typeof term==='string'&&term.length>1).slice(0,100)];
 return !phrases.some(term=>folded.includes(term.normalize('NFKC').toLocaleLowerCase()));
}
export function community({storage,core,ErrorClass,config:value,review=false,normalizeIcon,now=()=>Date.now()}){
 const fail=(status,code)=>{throw new ErrorClass(status,code);},rows=(query,...args)=>storage.sql.exec(query,...args).toArray();
 communitySchema(storage);
 const config=moderationConfig(value,review),operator=actor=>Boolean(config?.enabled&&config.operators.includes(actor.account?.username));
 function live(actor){if(!actor?.account)fail(401,'unauthorized');const raw=rows('SELECT data FROM rooms WHERE key=?','accounts/'+actor.account.username)[0];if(!raw||JSON.parse(raw.data).member!==actor.member)fail(401,'account_deleted');return JSON.parse(raw.data);}
 function room(body,actor){live(actor);if(typeof body.code!=='string'||!/^[A-Z0-9]{8}$/.test(body.code)||typeof body.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.day)||!Number.isFinite(Date.parse(body.day+'T00:00:00Z'))||new Date(body.day+'T00:00:00Z').toISOString().slice(0,10)!==body.day)fail(400,'invalid');const raw=rows('SELECT data FROM rooms WHERE key=?','rooms/'+body.code)[0],record=raw&&JSON.parse(raw.data),today=new Date(now()).toISOString().slice(0,10);if(!record||!record.members.includes(actor.member)||body.day>today||body.day!==today&&!record.days[body.day]&&!rows('SELECT message_key FROM atelier_chat WHERE code=? AND day=? LIMIT 1',body.code,body.day).length)fail(404,'not_found');return record;}
 const blocked=(viewer,target)=>Boolean(rows("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").length&&rows('SELECT block_key FROM personal_blocks WHERE viewer_member=? AND target_member=?',viewer,target).length);
 const icon=member=>rows("SELECT icon_key,image FROM profile_icons WHERE member=? AND status='approved'",member)[0];
 const dataURL=bytes=>'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');
 function selected(body,actor){const record=room(body,actor);if(typeof body.messageKey!=='string'||!/^[a-f0-9]{32}$/.test(body.messageKey))fail(400,'invalid');const item=rows('SELECT * FROM atelier_chat WHERE message_key=? AND code=? AND day=?',body.messageKey,body.code,body.day)[0];if(!item||item.status!=='visible'||blocked(actor.member,item.member))fail(404,'not_found');return {record,item};}
 function admin(actor){live(actor);if(!operator(actor))fail(403,'forbidden');}
 function ready(){if(!config?.enabled)fail(503,'moderation_unavailable');}
 return {async execute(body,actor,credential){
  if(typeof body.action!=='string'||!body.action.startsWith('social.'))return core(body,credential);
  const action=body.action;
  if(action==='social.official.public')return officialAteliers({storage,ErrorClass,isOperator:operator}).execute(body,actor);
  live(actor);
  if(action.startsWith('social.official.'))return officialAteliers({storage,ErrorClass,isOperator:operator}).execute(body,actor);
  if(action==='social.capabilities')return {operator:operator(actor)};
  if(action==='social.chat.list'){
   const record=room(body,actor);let before=Number.MAX_SAFE_INTEGER;if(body.before!==undefined){if(!Number.isSafeInteger(body.before)||body.before<1)fail(400,'invalid');before=body.before;}
   // Filtering happens before LIMIT, so blocked messages cannot starve a page.
   const hasBlocks=rows("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_blocks'").length;
   const list=rows("SELECT * FROM atelier_chat c WHERE code=? AND day=? AND sequence<? AND status='visible'"+(hasBlocks?' AND NOT EXISTS (SELECT 1 FROM personal_blocks b WHERE b.viewer_member=? AND b.target_member=c.member)':'')+' ORDER BY sequence DESC LIMIT 31',body.code,body.day,before,...(hasBlocks?[actor.member]:[]));
   const items=list.slice(0,30).reverse().map(item=>{const mapping=rows('SELECT data FROM rooms WHERE key=?','members/'+item.member)[0],name=mapping&&JSON.parse(mapping.data).username,profile=name&&rows('SELECT data FROM rooms WHERE key=?','accounts/'+name)[0],image=icon(item.member);return {key:item.message_key,sequence:item.sequence,text:item.text,createdAt:item.created_at,self:item.member===actor.member,name:profile?JSON.parse(profile.data).name:'',icon:image?dataURL(image.image):null,iconKey:image?.icon_key??null};});
   return {name:record.name,day:body.day,items,nextCursor:list.length>30?items[0].sequence:null};
  }
  if(action==='social.chat.send')return storage.transactionSync(()=>{
   room(body,actor);ready();if(typeof body.nonce!=='string'||!/^[a-f0-9]{32}$/.test(body.nonce)||!acceptsChatText(body.text,config.chatBlockedTerms??[]))fail(400,'chat_invalid');
   const previous=rows('SELECT * FROM atelier_chat WHERE member=? AND nonce=?',actor.member,body.nonce)[0];if(previous){if(previous.code!==body.code||previous.day!==body.day||previous.text!==body.text.trim())fail(409,'retry');return {key:previous.message_key};}
   const last=rows('SELECT created_at FROM atelier_chat WHERE member=? ORDER BY sequence DESC LIMIT 1',actor.member)[0];if(last&&now()-Date.parse(last.created_at)<3000||rows('SELECT COUNT(*) AS n FROM atelier_chat WHERE member=? AND created_at>?',actor.member,new Date(now()-3600000).toISOString())[0].n>=120)fail(429,'chat_limited');
   const key=randomBytes(16).toString('hex');storage.sql.exec("INSERT INTO atelier_chat(message_key,code,day,member,nonce,text,status,created_at) VALUES(?,?,?,?,?,?,'visible',?)",key,body.code,body.day,actor.member,body.nonce,body.text.trim(),new Date(now()).toISOString());return {key};
  });
  if(action==='social.chat.block')return storage.transactionSync(()=>{
   const {item}=selected(body,actor);if(item.member===actor.member)fail(400,'block_self');
   storage.sql.exec('CREATE TABLE IF NOT EXISTS personal_blocks (block_key TEXT PRIMARY KEY, viewer_member TEXT NOT NULL, target_member TEXT NOT NULL, target TEXT NOT NULL, day TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(viewer_member,target_member))');
   storage.sql.exec('INSERT OR IGNORE INTO personal_blocks VALUES(?,?,?,?,?,?,?,?)',randomBytes(16).toString('hex'),actor.member,item.member,'CHAT',body.day,0,0,new Date(now()).toISOString());return {done:true};
  });
  if(action==='social.report')return storage.transactionSync(()=>{
   const {item}=selected(body,actor);if(!REPORT_REASONS.includes(body.reason)||!['chat','icon'].includes(body.kind))fail(400,'invalid');const image=body.kind==='icon'?icon(item.member):null;if(body.kind==='icon'&&(!image||image.icon_key!==body.iconKey))fail(409,'retry');
   storage.sql.exec("INSERT OR IGNORE INTO community_reports VALUES(?,?,?,?,?,'open',?,NULL,NULL)",randomBytes(16).toString('hex'),body.kind,image?.icon_key??item.message_key,actor.member,body.reason,new Date(now()).toISOString());return {done:true};
  });
  if(action==='social.icon.me'){const own=rows('SELECT icon_key,image,status FROM profile_icons WHERE member=? ORDER BY created_at DESC,icon_key',actor.member);return {items:own.map(item=>({key:item.icon_key,status:item.status,image:item.status==='rejected'?null:dataURL(item.image)}))};}
  if(action==='social.icon.remove')return storage.transactionSync(()=>{live(actor);storage.sql.exec('DELETE FROM profile_icons WHERE member=?',actor.member);storage.sql.exec("DELETE FROM community_reports WHERE kind='icon' AND NOT EXISTS (SELECT 1 FROM profile_icons WHERE icon_key=target_key)");return {done:true};});
  if(action==='social.icon.submit'){
   ready();if(typeof body.photo!=='string'||body.photo.length>2000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))fail(400,'image_invalid');let image;try{image=await normalizeIcon(Buffer.from(body.photo.split(',')[1],'base64'));}catch{fail(400,'image_invalid');}if(image.length>32768)fail(400,'image_invalid');
   return storage.transactionSync(()=>{live(actor);const last=rows("SELECT created_at FROM profile_icons WHERE member=? AND status='pending'",actor.member)[0];if(last&&now()-Date.parse(last.created_at)<10000)fail(429,'chat_limited');storage.sql.exec("DELETE FROM profile_icons WHERE member=? AND status<>'approved'",actor.member);const key=randomBytes(16).toString('hex');storage.sql.exec("INSERT INTO profile_icons VALUES(?,?,?,'pending',?,NULL,NULL)",key,actor.member,image,new Date(now()).toISOString());return {key,status:'pending'};});
  }
  if(action==='social.review.list'){
   admin(actor);let cursor=body.cursor??0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>10000000)fail(400,'invalid');
   const list=rows("SELECT icon_key AS key,'icon' AS kind,created_at FROM profile_icons WHERE status='pending' UNION ALL SELECT report_key AS key,'report' AS kind,created_at FROM community_reports WHERE status='open' ORDER BY created_at,key LIMIT 26 OFFSET ?",cursor);
   return {items:list.slice(0,25),nextCursor:list.length>25?cursor+25:null};
  }
  if(action==='social.review.preview'){
   admin(actor);if(typeof body.key!=='string'||!/^[a-f0-9]{32}$/.test(body.key))fail(400,'invalid');if(body.kind==='icon'){const image=rows('SELECT image,status FROM profile_icons WHERE icon_key=?',body.key)[0];if(!image)fail(404,'not_found');return {kind:'icon',image:dataURL(image.image),status:image.status};}
   const report=rows('SELECT * FROM community_reports WHERE report_key=?',body.key)[0];if(!report)fail(404,'not_found');const target=report.kind==='chat'?rows('SELECT text,code,day,status FROM atelier_chat WHERE message_key=?',report.target_key)[0]:rows('SELECT image,status FROM profile_icons WHERE icon_key=?',report.target_key)[0];return {kind:report.kind,reason:report.reason,text:target?.text??'',code:target?.code??'',day:target?.day??'',image:target?.image?dataURL(target.image):null,status:report.status};
  }
  if(action==='social.review.decide')return storage.transactionSync(()=>{
   admin(actor);if(typeof body.key!=='string'||!/^[a-f0-9]{32}$/.test(body.key)||!['approve','reject','remove','dismiss'].includes(body.decision))fail(400,'invalid');const at=new Date(now()).toISOString();
   if(body.kind==='icon'){
    if(!['approve','reject'].includes(body.decision))fail(400,'invalid');const image=rows("SELECT * FROM profile_icons WHERE icon_key=? AND status='pending'",body.key)[0];if(!image)fail(409,'retry');
    const account=rows("SELECT key FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=?",image.member);if(!account.length)fail(409,'retry');
    if(body.decision==='approve'){storage.sql.exec("DELETE FROM profile_icons WHERE member=? AND status='approved'",image.member);storage.sql.exec("UPDATE profile_icons SET status='approved',reviewed_at=?,reviewer=? WHERE icon_key=?",at,actor.member,body.key);}else storage.sql.exec("UPDATE profile_icons SET image=?,status='rejected',reviewed_at=?,reviewer=? WHERE icon_key=?",Buffer.alloc(0),at,actor.member,body.key);
   }else{
    if(body.kind!=='report'||!['remove','dismiss'].includes(body.decision))fail(400,'invalid');const report=rows("SELECT * FROM community_reports WHERE report_key=? AND status='open'",body.key)[0];if(!report)fail(409,'retry');if(body.decision==='remove'){if(report.kind==='chat')storage.sql.exec("UPDATE atelier_chat SET text='',status='removed' WHERE message_key=?",report.target_key);else storage.sql.exec('DELETE FROM profile_icons WHERE icon_key=?',report.target_key);}
    storage.sql.exec('UPDATE community_reports SET status=?,reviewer=?,reviewed_at=? WHERE report_key=?',body.decision,actor.member,at,body.key);
   }return {done:true};
  });
  fail(400,'invalid');
 }};
}
