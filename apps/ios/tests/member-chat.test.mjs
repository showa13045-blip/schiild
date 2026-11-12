import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createECDH} from 'node:crypto';import {Script} from 'node:vm';
import {memberChat,memberChatSchema,eraseMemberChat,isMemberChatVisible} from '../server/member-chat.mjs';
import {community,eraseCommunity,acceptsChatText} from '../server/community.mjs';
import {memberChatCopy,chatAnnouncementPayload} from '../server/member-chat-copy.mjs';
import {memberChatScript,memberChatHtml} from '../server/member-chat-pages.mjs';
import {memberChatSurface,memberChatInboxScript} from '../server/member-chat-surface.mjs';
import {metadataStore} from '../../demo/cloudflare/metadata-store.mjs';import {notificationService} from '../../demo/server/notifications.mjs';
import {notificationURL} from '../src/policy.ts';
function fixture(){
 const db=new DatabaseSync(':memory:'),storage={sql:{exec(query,...args){const stmt=db.prepare(query);if(/^\s*(SELECT|PRAGMA)/i.test(query))return {toArray:()=>stmt.all(...args)};stmt.run(...args);return {toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
 db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT NOT NULL,etag TEXT NOT NULL)');let clock=Date.parse('2026-11-12T10:00:00Z'),counter=0;const now=()=>clock,scope={code:'ABCDEFGH',day:'2026-11-12'},people={};
 class ChatError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
 const put=(key,data)=>db.prepare('INSERT INTO rooms VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,etag=CAST(rooms.etag AS INTEGER)+1').run(key,JSON.stringify(data),'1');
 for(const name of ['host','member','outsider','moderator','pending']){const person={username:name,member:(Object.keys(people).length+1).toString().repeat(64),name:name,lineSubject:'local-only'};people[name]={member:person.member,account:person,sessionKey:'sessions/'+name};put('accounts/'+name,person);put('members/'+person.member,{username:name});put('sessions/'+name,{username:name,member:person.member,expires:clock+3600000});}
 put('rooms/'+scope.code,{...scope,name:'Local atelier',members:[people.host.member,people.member.member],creator:people.host.member,days:{},pendingMembers:[people.pending.member]});put('rooms/ABCDEFGJ',{code:'ABCDEFGJ',name:'Other',members:[people.outsider.member],creator:people.outsider.member,days:{}});
 const chat=memberChat({storage,ErrorClass:ChatError,isOperator:actor=>actor.account.username==='moderator',acceptsText:acceptsChatText,now,notifications:true});
 const call=(who,action,body={})=>chat.execute({action,...scope,...body},people[who]??{member:'guest',account:null});
 const nonce=()=>String(++counter).padStart(32,'0'),send=(who,text,extra={})=>{clock+=4000;return call(who,'social.chat.send',{text,nonce:nonce(),...extra});};
 return {db,storage,people,put,call,nonce,send,scope,now,ChatError,advance(){clock+=4000;},record(){return JSON.parse(db.prepare('SELECT data FROM rooms WHERE key=?').get('rooms/'+scope.code).data);},close:()=>db.close()};
}
test('members, creator and administrator are authorized per operation; outsiders, pending and departed members are rejected',()=>{
 const f=fixture();try{
  for(const who of ['host','member','moderator'])assert.equal(f.call(who,'social.chat.list').items.length,0);
  for(const who of ['outsider','pending',null])for(const action of ['social.chat.list','social.chat.sync','social.chat.send','social.chat.edit','social.chat.delete','social.chat.prepare'])assert.throws(()=>f.call(who,action,{since:0,text:'Private',nonce:f.nonce(),messageKey:'a'.repeat(32),expectedVersion:1}),e=>[401,404].includes(e.status));
  const message=f.send('member','Only for members');assert.throws(()=>f.call('host','social.chat.list',{code:'ABCDEFGJ'}),e=>e.status===404);
  const record=f.record();record.members=record.members.filter(member=>member!==f.people.member.member);f.put('rooms/'+f.scope.code,record);
  for(const action of ['social.chat.list','social.chat.sync','social.chat.send','social.chat.edit','social.chat.delete'])assert.throws(()=>f.call('member',action,{since:0,text:'After leaving',nonce:f.nonce(),messageKey:message.key,expectedVersion:1}),e=>e.status===404);
  f.db.prepare('DELETE FROM rooms WHERE key=?').run('accounts/host');assert.throws(()=>f.call('host','social.chat.list'),e=>e.status===401);
 }finally{f.close();}
});
test('send, quote, edit and delete are idempotent and version checked; cross-room replies and other-person editing are refused',()=>{
 const f=fixture();try{
  const nonce=f.nonce(),first=f.send('member','https://example.com <script>safe text</script>',{nonce});assert.deepEqual(f.call('member','social.chat.send',{nonce,text:'https://example.com <script>safe text</script>'}),first);assert.throws(()=>f.call('member','social.chat.send',{nonce,text:'Changed request'}),e=>e.status===409);
  const reply=f.send('host','A reply',{replyKey:first.key});assert.equal(f.call('host','social.chat.list').items[1].reply.key,first.key);
  const elsewhere=f.send('outsider','Elsewhere',{code:'ABCDEFGJ'});assert.throws(()=>f.send('host','Cross-room',{replyKey:elsewhere.key}),e=>e.status===404);
  assert.throws(()=>f.call('host','social.chat.edit',{messageKey:first.key,text:'No',nonce:f.nonce(),expectedVersion:1}),e=>e.status===403);
  const edit={messageKey:first.key,text:'Updated',nonce:f.nonce(),expectedVersion:1},result=f.call('member','social.chat.edit',edit);assert.deepEqual(f.call('member','social.chat.edit',edit),result);assert.throws(()=>f.call('member','social.chat.edit',{...edit,nonce:f.nonce()}),e=>e.code==='chat_conflict');
  assert.equal(f.call('host','social.chat.list').items[1].reply.text,'Updated');assert(f.call('host','social.chat.list').items[0].editedAt);
  // Retrying the original send after an edit cannot create a second message.
  assert.deepEqual(f.call('member','social.chat.send',{nonce,text:'https://example.com <script>safe text</script>'}),first);
  const removal={messageKey:first.key,nonce:f.nonce(),expectedVersion:2};f.call('host','social.chat.delete',removal);f.call('host','social.chat.delete',removal);const list=f.call('host','social.chat.list');assert.equal(list.items.length,1);assert.equal(list.items[0].key,reply.key);assert(list.items[0].reply.removed);assert.equal(f.call('host','social.chat.sync',{since:0}).items.find(item=>item.key===first.key).removed,true);
  const modRemoval={messageKey:reply.key,nonce:f.nonce(),expectedVersion:1};f.call('moderator','social.chat.delete',modRemoval);assert.equal(f.call('member','social.chat.list').items.length,0);
 }finally{f.close();}
});
test('only creator confirms announcements; live audience and atomic outbox prevent duplicate notices on retries or edits',()=>{
 const f=fixture();try{
  assert.throws(()=>f.call('member','social.chat.prepare',{text:'No'}),e=>e.status===403);assert.throws(()=>f.send('member','No',{announcement:true}),e=>e.status===403);
  const prepared=f.call('host','social.chat.prepare',{text:'Announcement'});assert.equal(prepared.count,2);
  const draft={text:'Announcement',nonce:f.nonce(),announcement:true,confirmation:prepared.ticket},sent=f.call('host','social.chat.send',draft);assert.deepEqual(f.call('host','social.chat.send',draft),sent);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM chat_notices').get().n,2);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE key LIKE 'push-events/%'").get().n,1);
  assert.equal(f.call('member','social.announcements.list').items[0].messageKey,sent.key);f.call('member','social.announcements.read',{noticeKey:f.call('member','social.announcements.list').items[0].key});assert(f.call('member','social.announcements.list').items[0].readAt);
  f.call('host','social.chat.edit',{messageKey:sent.key,text:'Edited announcement',expectedVersion:1,nonce:f.nonce()});f.send('member','Ordinary message');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM chat_notices').get().n,2);
  const stale=f.call('host','social.chat.prepare',{text:'Audience changes'}),record=f.record();record.members.pop();f.put('rooms/'+f.scope.code,record);assert.throws(()=>f.send('host','Audience changes',{announcement:true,confirmation:stale.ticket}),e=>e.code==='chat_audience_changed');assert.equal(f.call('member','social.announcements.list').items.length,0);
  f.call('host','social.chat.delete',{messageKey:sent.key,expectedVersion:2,nonce:f.nonce()});assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM chat_notices').get().n,0);const event=JSON.parse(f.db.prepare("SELECT data FROM rooms WHERE key LIKE 'push-events/%'").get().data);assert.equal(event.recipients.length,0);
 }finally{f.close();}
});
test('history is bounded, chronological and supports around/forward cursors; changes and blocks do not leak authors',()=>{
 const f=fixture();try{
  const sent=[];for(let index=0;index<75;index++)sent.push(f.send(index%2?'member':'host','Message '+index));
  const latest=f.call('host','social.chat.list'),older=f.call('host','social.chat.list',{before:latest.nextCursor});assert.equal(latest.items.length,30);assert.equal(older.items.length,30);assert(older.items.at(-1).sequence<latest.items[0].sequence);
  const focus=f.call('host','social.chat.list',{around:sent[20].key});assert(focus.items.some(item=>item.key===sent[20].key));assert(focus.newerCursor);assert(f.call('host','social.chat.list',{after:focus.newerCursor}).items[0].sequence>focus.items.at(-1).sequence);
  f.db.exec('CREATE TABLE personal_blocks(block_key TEXT PRIMARY KEY,viewer_member TEXT,target_member TEXT)');f.db.prepare('INSERT INTO personal_blocks VALUES(?,?,?)').run('local',f.people.host.member,f.people.member.member);const filtered=f.call('host','social.chat.list');assert(filtered.items.every(item=>item.self));assert.equal(filtered.items.length,30);assert(!JSON.stringify(filtered).includes(f.people.host.member));
  const sync=f.call('host','social.chat.sync',{since:0});assert(sync.hiddenAuthors.length);assert(sync.items.some(item=>item.removed));assert.throws(()=>f.call('host','social.chat.list',{before:-1}),e=>e.status===400);
 }finally{f.close();}
});
test('blocking an announcement author hides the inbox item and suppresses queued push delivery',()=>{
 const f=fixture();try{const confirm=f.call('host','social.chat.prepare',{text:'Private'}),sent=f.call('host','social.chat.send',{text:'Private',announcement:true,confirmation:confirm.ticket,nonce:f.nonce()});f.db.exec('CREATE TABLE personal_blocks(block_key TEXT PRIMARY KEY,viewer_member TEXT,target_member TEXT)');f.db.prepare('INSERT INTO personal_blocks VALUES(?,?,?)').run('local',f.people.member.member,f.people.host.member);assert.equal(f.call('member','social.announcements.list').items.length,0);assert.equal(isMemberChatVisible(f.storage,{...f.scope,messageKey:sent.key},f.people.member.member),false);}finally{f.close();}
});
test('legacy migration and operator removal are visible to sync; account deletion erases chat data and inbox atomically',()=>{
 const f=fixture();try{
  const prepared=f.call('host','social.chat.prepare',{text:'Remove me'}),message=f.call('host','social.chat.send',{text:'Remove me',announcement:true,confirmation:prepared.ticket,nonce:f.nonce()});
  f.db.prepare("UPDATE atelier_chat SET text='',status='removed' WHERE message_key=?").run(message.key);assert(f.call('member','social.chat.sync',{since:0}).items[0].removed);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM chat_notices').get().n,0);
  f.advance();const fresh=f.send('member','Erase');eraseCommunity(f.storage,f.people.member.member);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM chat_operations WHERE member=?').get(f.people.member.member).n,0);assert(f.call('host','social.chat.sync',{since:0}).items.find(item=>item.key===fresh.key).removed);
  memberChatSchema(f.storage);eraseMemberChat(f.storage,f.people.member.member);
 }finally{f.close();}
});
test('announcement delivery reuses existing push outbox with generic private payloads and no real sends',async()=>{
 const f=fixture();try{
  const prepared=f.call('host','social.chat.prepare',{text:'Private announcement body'});f.call('host','social.chat.send',{text:'Private announcement body',announcement:true,confirmation:prepared.ticket,nonce:f.nonce()});
  const ec=createECDH('prime256v1');ec.generateKeys();const config={subject:'mailto:test@example.com',publicKey:ec.getPublicKey().toString('base64url'),privateKey:Buffer.from(ec.getPrivateKey().toString('hex').padStart(64,'0'),'hex').toString('base64url')},store=metadataStore(f.storage,{}),delivered=[];
  f.put('push-subscriptions/local',{member:f.people.member.member,sessionKey:f.people.member.sessionKey,subscription:{endpoint:'https://fcm.googleapis.com/local-test'},registeredAt:f.now()-10000,language:'ja'});f.put('push-preferences/'+f.people.member.member,{member:f.people.member.member,preferences:{chatAnnouncement:true},enabledSince:{chatAnnouncement:0}});
  const service=notificationService(store,{config,now:f.now,send:async(_subscription,payload)=>{delivered.push(payload);return {status:201};}});await service.drain();await service.drain();assert.equal(delivered.length,1);assert(!JSON.stringify(delivered).includes('Private announcement body'));assert.match(delivered[0].url,/#chat=ABCDEFGH\./);
  const second=f.call('host','social.chat.prepare',{text:'Exit before delivery'});f.advance();f.call('host','social.chat.send',{text:'Exit before delivery',announcement:true,confirmation:second.ticket,nonce:f.nonce()});const record=f.record();record.members=[f.people.host.member];f.put('rooms/'+f.scope.code,record);await service.drain();assert.equal(delivered.length,1);
  record.members.push(f.people.member.member);f.put('rooms/'+f.scope.code,record);const third=f.call('host','social.chat.prepare',{text:'Deleted author'});f.advance();f.call('host','social.chat.send',{text:'Deleted author',announcement:true,confirmation:third.ticket,nonce:f.nonce()});const deletionStore=metadataStore(f.storage,{}, {beforeAccountRemoval:(_storage,member)=>eraseCommunity(_storage,member)});await deletionStore.deleteAccount(f.people.host.account,'d'.repeat(64),[]);await service.drain();assert.equal(delivered.length,1);
 }finally{f.close();}
});
test('localized client scripts are syntactically valid, safe text only, CSP protected and do not change unrelated routes',async()=>{
 new Script(memberChatScript);new Script(memberChatInboxScript);assert(!memberChatScript.includes('innerHTML'));assert(!memberChatScript.includes('insertAdjacentHTML'));assert(memberChatHtml.includes('interactive-widget=resizes-content'));for(const row of Object.values(memberChatCopy))assert.deepEqual(Object.keys(row),Object.keys(memberChatCopy.en));assert.equal(Object.keys(memberChatCopy).length,10);
 const untouched=Response.json({keep:true}),original=async()=>untouched;assert.equal(await memberChatSurface(new Request('https://schiild.app/api/atelier',{method:'POST'}),original),untouched);
 const page=await memberChatSurface(new Request('https://schiild.app/chat/'),original);assert.equal(page.status,200);assert(!page.headers.get('Content-Security-Policy').includes("script-src 'unsafe-inline'"));assert((await page.text()).includes('/community/chat-v2.js'));assert.equal((await memberChatSurface(new Request('https://schiild.app/chat/',{method:'POST'}),original)).status,405);
 const payload=chatAnnouncementPayload({eventId:'event',messageKey:'a'.repeat(32),code:'ABCDEFGH',day:'2026-11-12'},'ja');assert(payload.body);assert(!payload.body.includes('ABCDEFGH'));assert.equal(notificationURL(payload.url),'https://schiild.app'+payload.url);
});
