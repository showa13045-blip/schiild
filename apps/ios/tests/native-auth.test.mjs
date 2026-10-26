import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_ORIGIN,isAppURL,lineAuthorization,lineReturn,nativeMessage,externalURL} from '../src/policy.ts';
import {nativeSurface} from '../server/native-surface.mjs';
const state='a'.repeat(64);
const auth=new URL('https://access.line.me/oauth2/v2.1/authorize');auth.search=new URLSearchParams({client_id:'2012141224',redirect_uri:APP_ORIGIN+'/?auth=line',response_type:'code',scope:'openid profile',state,nonce:'b'.repeat(64),code_challenge:'c'.repeat(43),code_challenge_method:'S256'}).toString();
test('native bridge accepts only first-party HTTPS content',()=>{
 for(const url of [APP_ORIGIN+'/',APP_ORIGIN+'/week/'])assert(isAppURL(url));
 for(const url of ['http://schiild.app/','https://schiild.app.evil.test/','https://user@schiild.app/','javascript:alert(0)','schiild://auth/line'])assert(!isAppURL(url));
 assert.equal(externalURL('javascript:alert(0)'),null);
});
test('LINE return requires the same state and fixed app callback',()=>{
 assert(lineAuthorization(auth.href));
 assert.equal(lineAuthorization(auth.href.replace('2012141224','999')),null);
 const callback='schiild://auth/line?state='+state+'&code=one-use-code';
 assert.equal(new URL(lineReturn(callback,state)).searchParams.get('code'),'one-use-code');
 assert.equal(lineReturn(callback,'d'.repeat(64)),null);
 assert.equal(lineReturn(callback.replace('auth/line','other/line'),state),null);
});
test('native share and clipboard messages have bounded fields and app-only links',()=>{
 const message={requestId:'native-1',action:'share',text:'Schiild',url:APP_ORIGIN+'/?invite=ABCDEFGH'};
 assert(nativeMessage(JSON.stringify(message)));
 assert.equal(nativeMessage(JSON.stringify({...message,url:'https://evil.test'})),null);
 assert.equal(nativeMessage(JSON.stringify({...message,action:'arbitrary-script'})),null);
 assert.equal(nativeMessage('a'.repeat(12001)),null);
});
test('relay validates OAuth destination, sets short HttpOnly cookie, and preserves existing web flow',()=>{
 const relay=new URL('/native-auth/line',APP_ORIGIN);relay.searchParams.set('authorize',auth.href);
 const start=nativeSurface(new Request(relay));assert.equal(start.status,302);assert.equal(start.headers.get('Location'),auth.href);
 const cookie=start.headers.get('Set-Cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);assert.match(cookie,/Max-Age=300/);
 const callback=APP_ORIGIN+'/?auth=line&state='+state+'&code=one-use-code';
 assert.equal(nativeSurface(new Request(callback)),null);
 const result=nativeSurface(new Request(callback,{headers:{Cookie:cookie.split(';')[0]}}));
 assert.equal(result.status,302);assert.equal(new URL(result.headers.get('Location')).protocol,'schiild:');assert.match(result.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal(result.headers.get('Cache-Control'),'no-store');
 const bad=new URL(relay);bad.searchParams.set('authorize',auth.href.replace('access.line.me','evil.test'));assert.equal(nativeSurface(new Request(bad)).status,400);
 assert.equal(nativeSurface(new Request('https://evil.test/native-auth/line')),null);
});
