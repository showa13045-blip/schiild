import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {clearAccountStores,ACCOUNT_ERASE_EVENT} from '../src/account-storage.ts';
const source=await readFile(new URL('../src/shared-api.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const memory=()=>{const data=Object.create(null);return new Proxy(data,{get(target,key){if(key==='getItem')return key=>target[key]??null;if(key==='setItem')return (key,value)=>target[key]=String(value);if(key==='removeItem')return key=>delete target[key];return target[key];}});};
 const storage=memory(),session=memory(),events=[],exports={};let complete;storage.setItem('schiild.account.session.v2','a'.repeat(64));
 vm.runInNewContext(compiled,{exports,process:{env:{}},Event,Date,DOMException,window:{dispatchEvent:event=>events.push(event.type)},fetch:()=>new Promise(resolve=>complete=resolve),require(name){if(name==='./preview-mode.ts')return {isWeekPreview:false,browserStorage:()=>storage,browserSessionStorage:()=>session};if(name==='./account-storage.ts')return {clearAccountStores,ACCOUNT_ERASE_EVENT};if(name==='./copy')return {t:key=>key};if(name==='./whatsapp-copy')return {w:key=>key,whatsappError:key=>key};throw Error('Unexpected module '+name);}});
 return {api:exports,events,storage,session,fail(error){complete({ok:false,json:async()=>({error})});},succeed(body){complete({ok:true,json:async()=>body});}};
}
test('a delayed deleted/expired response for an old session cannot erase a freshly signed-in account',async()=>{
 for(const code of ['account_deleted','session_expired','unauthorized','line_required']){
  const f=fixture(),pending=f.api.sharedRequest('account.me');
  f.api.saveSession('b'.repeat(64));f.fail(code);await assert.rejects(pending);
  assert.deepEqual(f.events,[]);assert.equal(f.api.currentSession(),'b'.repeat(64));
 }
});
test('deletion of the current session still invalidates the browser exactly once',async()=>{
 const f=fixture();for(let n=0;n<2;n++){const pending=f.api.sharedRequest('account.me');f.fail('account_deleted');await assert.rejects(pending);}
 assert.deepEqual(f.events,['schiild:account-deleted']);
});

test('deletion erases saved names, tab drafts and credentials and rejects a delayed successful profile response',async()=>{
 const f=fixture();f.storage.setItem('schiild.preferences.v2',JSON.stringify({name:'Private old name'}));f.session.setItem('schiild.line.pending','old proof');f.storage.setItem('unrelated','keep');f.session.setItem('unrelated','keep');
 const pending=f.api.sharedRequest('account.update',{name:'Private old name'});
 assert.equal(f.api.clearAccountBrowser(false),true);f.succeed({account:{name:'Private old name',username:'old_account'}});
 await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(f.api.currentSession(),null);
 assert.equal(f.storage.getItem('schiild.preferences.v2'),null);assert.equal(f.session.getItem('schiild.line.pending'),null);assert.equal(f.storage.getItem('unrelated'),'keep');assert.equal(f.session.getItem('unrelated'),'keep');
});

test('a successful old profile cannot overwrite another account after sign-in',async()=>{
 const f=fixture(),pending=f.api.sharedRequest('account.me');f.api.saveSession('b'.repeat(64));f.succeed({account:{name:'Old name'}});await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(f.api.currentSession(),'b'.repeat(64));
});

test('another tab clears its own drafts without erasing the fresh guest credential shared after deletion',async()=>{
 const f=fixture();f.session.setItem('schiild.old-name','private');
 const token=f.api.currentSession();assert.equal(f.api.clearAccountBrowser(false,false),true);assert.equal(f.api.currentSession(),token);assert.equal(f.session.getItem('schiild.old-name'),null);
});
test('public provider availability remains usable after identity reset',async()=>{
 for(const action of ['account.line.config','account.whatsapp.config']){
  const f=fixture(),pending=f.api.sharedRequest(action);f.api.clearAccountBrowser(false);f.succeed({enabled:true});assert.equal((await pending).enabled,true);
 }
});
