import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
import {atelierResetSummary,resetAtelierContent} from '../cloudflare/atelier-reset.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT,etag TEXT);
 CREATE TABLE automatic_reviews(review_key TEXT PRIMARY KEY,kind TEXT);
 CREATE TABLE automatic_authorizations(review_key TEXT PRIMARY KEY,basis TEXT);
 CREATE TABLE moderation_notices(notice_key TEXT PRIMARY KEY,kind TEXT);
 CREATE TABLE profile_icons(icon_key TEXT PRIMARY KEY,image BLOB);
 CREATE TABLE image_blobs(name TEXT PRIMARY KEY,byte_length INTEGER,sha256 TEXT);
 CREATE TABLE image_chunks(name TEXT,part INTEGER,bytes BLOB,PRIMARY KEY(name,part));
 CREATE TABLE photo_members(name TEXT PRIMARY KEY,member TEXT);
 CREATE TABLE automatic_image_refs(image_name TEXT PRIMARY KEY,logical_key TEXT);
 CREATE TABLE atelier_chat(sequence INTEGER PRIMARY KEY,text TEXT);
 CREATE TABLE community_reports(report_key TEXT PRIMARY KEY,kind TEXT);
 CREATE TABLE content_reports(report_key TEXT PRIMARY KEY);
 CREATE TABLE removed_schiils(selection_key TEXT PRIMARY KEY);
 CREATE TABLE moderation_queue(queue_key TEXT PRIMARY KEY);
 CREATE TABLE future_account_settings(key TEXT PRIMARY KEY,value TEXT);`);
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);const rows=/^(SELECT|PRAGMA)/i.test(query)?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows};}},transactionSync(run){db.exec('BEGIN');try{const value=run();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const put=(key,value)=>db.prepare('INSERT INTO rooms VALUES(?,?,?)').run(key,JSON.stringify(value),'1');
 put('accounts/sample',{name:'Sample',member:'member',appleRefresh:'encrypted'});put('sessions/sample',{member:'member'});put('line-identities/sample',{username:'sample'});put('push-subscriptions/sample',{token:'device'});put('push-preferences/sample',{post:true});
 put('rooms/ABCDEFGH',{members:['member'],days:{'2026-11-04':{posts:{0:'photo'}}}});put('globals/2026-11-04',{pixels:{member:{source:'photo'}}});
 const iconEvent=createHash('sha256').update('automatic-result/icon-job').digest('hex');
 for(const [eventId,kind]of [['post-event','post'],['photo-event','moderation'],[iconEvent,'moderation']]){put('push-events/'+eventId,{eventId,kind});put('push-deliveries/'+eventId,{eventId});}
 for(const kind of ['photo','icon']){db.prepare('INSERT INTO automatic_reviews VALUES(?,?)').run(kind+'-job',kind);db.prepare('INSERT INTO automatic_authorizations VALUES(?,?)').run(kind+'-job','consent');db.prepare('INSERT INTO moderation_notices VALUES(?,?)').run(kind+'-notice',kind);db.prepare('INSERT INTO community_reports VALUES(?,?)').run(kind+'-report',kind==='photo'?'chat':'icon');}
 db.prepare('INSERT INTO profile_icons VALUES(?,?)').run('icon',new Uint8Array([7,8,9]));db.prepare('INSERT INTO image_blobs VALUES(?,?,?)').run('photo',3,'digest');db.prepare('INSERT INTO image_chunks VALUES(?,?,?)').run('photo',0,new Uint8Array([1,2,3]));db.exec("INSERT INTO photo_members VALUES('photo','member');INSERT INTO automatic_image_refs VALUES('photo','photos/member/day');INSERT INTO atelier_chat VALUES(1,'text');INSERT INTO content_reports VALUES('report');INSERT INTO removed_schiils VALUES('selection');INSERT INTO moderation_queue VALUES('queue');INSERT INTO future_account_settings VALUES('setting','keep')");
 return {db,storage,iconEvent};
}
test('atelier reset removes content, photos and stale jobs while retaining identity, icons and icon notifications',()=>{
 const {db,storage,iconEvent}=fixture();try{const before=atelierResetSummary(storage),{after}=resetAtelierContent(storage,before.revision);assert.equal(after.ateliers,0);assert.equal(after.globalDays,0);assert.equal(after.images,0);assert.equal(after.imageChunks,0);assert.equal(after.accounts,1);assert.equal(after.profileIcons,1);assert.equal(after.protectedDigest,before.protectedDigest);assert(Object.values(after.deleteCounts).every(value=>value===0));assert.deepEqual(Array.from(db.prepare('SELECT image FROM profile_icons').get().image),[7,8,9]);assert.equal(db.prepare('SELECT key FROM rooms WHERE key=?').get('push-events/'+iconEvent).key,'push-events/'+iconEvent);assert.deepEqual(db.prepare('SELECT review_key FROM automatic_reviews').all().map(row=>row.review_key),['icon-job']);assert.equal(db.prepare('SELECT value FROM future_account_settings').get().value,'keep');assert.equal(resetAtelierContent(storage,after.revision).after.revision,after.revision);}finally{db.close();}
});
test('stale revision or a concurrent binary edit prevents deletion atomically',()=>{
 const {db,storage}=fixture();try{const before=atelierResetSummary(storage);db.prepare('UPDATE image_chunks SET bytes=?').run(new Uint8Array([4,5,6]));const changed=atelierResetSummary(storage);assert.notEqual(changed.revision,before.revision);assert.throws(()=>resetAtelierContent(storage,before.revision),/content_changed/);assert.deepEqual(atelierResetSummary(storage),changed);}finally{db.close();}
});
test('an unexpected row deletion failure rolls back all atelier, image and job changes',()=>{
 const {db,storage}=fixture();try{const before=atelierResetSummary(storage);db.exec("CREATE TRIGGER retain_rooms BEFORE DELETE ON rooms WHEN OLD.key LIKE 'rooms/%' BEGIN SELECT RAISE(ABORT,'simulated_failure');END");assert.throws(()=>resetAtelierContent(storage,before.revision),/simulated_failure/);assert.deepEqual(atelierResetSummary(storage),before);}finally{db.close();}
});
