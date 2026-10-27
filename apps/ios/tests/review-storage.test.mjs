import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewStorage} from '../../demo/src/review-mode.ts';
import {clearAccountStores} from '../../demo/src/account-storage.ts';
test('review logout and deletion cannot read or erase ordinary browser identities or drafts',()=>{
 const values=Object.create(null),store=new Proxy(values,{get(target,key){if(key==='getItem')return name=>target[name]??null;if(key==='setItem')return (name,value)=>{target[name]=String(value);};if(key==='removeItem')return name=>{delete target[name];};if(key==='key')return index=>Object.keys(target)[index]??null;if(key==='length')return Object.keys(target).length;return target[key];}});
 store.setItem('schiild.account.session.v2','ordinary-private-token');store.setItem('schiild.preferences.v2','ordinary-private-name');store.setItem('unrelated','keep');
 const review=reviewStorage(store);assert.equal(review.getItem('schiild.account.session.v2'),null);assert.deepEqual(Object.keys(review),[]);
 review.setItem('schiild.account.session.v2','review-token');review.setItem('schiild.preferences.v2','review-name');assert.equal(store.getItem('schiild.account.session.v2'),'ordinary-private-token');
 assert.equal(review.length,2);assert.equal(clearAccountStores([review]),true);assert.equal(review.length,0);assert.equal(store.getItem('schiild.account.session.v2'),'ordinary-private-token');assert.equal(store.getItem('schiild.preferences.v2'),'ordinary-private-name');assert.equal(store.getItem('unrelated'),'keep');
});
