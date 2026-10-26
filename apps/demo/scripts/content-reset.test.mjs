import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {contentResetSummary,resetRecordedContent} from '../cloudflare/content-reset.mjs';
function database(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE rooms(key TEXT PRIMARY KEY,data TEXT,etag TEXT);CREATE TABLE image_blobs(name TEXT PRIMARY KEY,byte_length INTEGER,sha256 TEXT);CREATE TABLE image_chunks(name TEXT,part INTEGER,bytes BLOB);CREATE TABLE photo_members(name TEXT,member TEXT);');
 const storage={sql:{exec(query,...args){const statement=db.prepare(query);if(/^SELECT/i.test(query))return {toArray:()=>statement.all(...args)};statement.run(...args);return {toArray:()=>[]};}},transactionSync(run){db.exec('BEGIN');try{const result=run();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const put=(key,value)=>db.prepare('INSERT INTO rooms VALUES (?,?,?)').run(key,JSON.stringify(value),'1');
 put('accounts/sample',{name:'Sample',member:'member',appleRefresh:'encrypted-test'});put('sessions/sample',{member:'member'});put('apple-identities/sample',{username:'sample'});put('push-preferences/sample',{enabled:true});
 put('rooms/ABCDEFGH',{code:'ABCDEFGH',name:'Studio',members:['member'],creator:'member',concept:'A',days:{'2026-10-27':{posts:{0:'photos/member/day/photo'},status:'ready'}}});
 put('globals/2026-10-27',{pixels:{member:{source:'photo'}}});put('push-events/sample',{type:'ready'});put('push-deliveries/sample',{done:true});
 db.prepare('INSERT INTO image_blobs VALUES (?,?,?)').run('photo',3,'test');db.prepare('INSERT INTO image_chunks VALUES (?,?,?)').run('photo',0,new Uint8Array([1,2,3]));db.prepare('INSERT INTO photo_members VALUES (?,?)').run('photo','member');
 return {db,storage};
}
test('content reset clears posts, generated art, GLOBAL and bytes, preserving identity and memberships',()=>{
 const {db,storage}=database();try{
  const before=contentResetSummary(storage),result=resetRecordedContent(storage,before.revision);
  assert.equal(before.posts,1);assert.equal(result.after.posts,0);assert.equal(result.after.days,0);assert.equal(result.after.globalDays,0);assert.equal(result.after.images,0);assert.equal(result.after.imageChunks,0);assert.equal(result.after.photoLinks,0);assert.equal(result.after.accounts,1);assert.equal(result.after.ateliers,1);assert.equal(result.after.protectedDigest,before.protectedDigest);
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM rooms WHERE key=?').get('rooms/ABCDEFGH').data).members,['member']);
  assert.equal(db.prepare("SELECT count(*) AS n FROM rooms WHERE key LIKE 'push-events/%' OR key LIKE 'push-deliveries/%'").get().n,0);
 }finally{db.close();}
});
test('content reset rejects a stale inspected revision without deleting anything',()=>{
 const {db,storage}=database();try{const before=contentResetSummary(storage);assert.throws(()=>resetRecordedContent(storage,'stale'),/content_changed/);assert.deepEqual(contentResetSummary(storage),before);}finally{db.close();}
});
