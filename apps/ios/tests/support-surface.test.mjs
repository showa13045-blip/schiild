import test from 'node:test';
import assert from 'node:assert/strict';
import {supportSurface} from '../server/support-surface.mjs';
import {supportPages} from '../server/support-pages.mjs';
import {patchSupportLinks} from '../server/patch-support-links.mjs';
const files={pages:supportPages,scripts:{'/_expo/app.js':'web','/__ios/app.js':'ios'}};
test('support pages are public, isolated from accounts, and expose only the approved contact',async()=>{
 for(const path of Object.keys(supportPages)){
  const response=await supportSurface(new Request('https://schiild.app'+path,{headers:{'User-Agent':'SchiildNative/1.1'}}),()=>{throw Error('No account access');},files);
  assert.equal(response.status,200);const html=await response.text();assert(html.includes('schiild.app@gmail.com'));assert(!html.includes('info@pickleballnavi.jp'));assert(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
 }
});
test('support links update only the settings component and fail on unexpected revisions',()=>{
 const fragment='(0,b.jsx)("p",{children:(0,l.t)(\'demo.settings.privacy\')})',source='before '+fragment+' after';
 const result=patchSupportLinks(source);assert(result.startsWith('before '));assert(result.endsWith(' after'));assert(result.includes('/support.html'));assert(result.includes('/privacy.html'));
 assert.throws(()=>patchSupportLinks('unrelated'),/changed/);assert.throws(()=>patchSupportLinks(source+source),/changed/);
});
test('new HTML entrypoints reach updated web and iOS scripts while API requests are preserved',async()=>{
 for(const path of ['/_expo/app.js','/__ios/app.js']){
  const result=await supportSurface(new Request('https://schiild.app/'),()=>new Response('<script src="'+path+'"></script>',{headers:{'Content-Type':'text/html'}}),files);
  assert((await result.text()).includes(path+'?ui=20261027-support'));
 }
 const input=new Request('https://schiild.app/api/atelier',{method:'POST',body:'test'}),sentinel=new Response('original');assert.equal(await supportSurface(input,request=>{assert.equal(request,input);return sentinel;},files),sentinel);
});
