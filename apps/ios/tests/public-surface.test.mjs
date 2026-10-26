import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSurface} from '../server/public-surface.mjs';
const files={path:'/_expo/static/js/web/index-old.js',script:'/* replacement */',css:'.copy{display:flex}'};
test('public adjustments preserve native, API and fictional data requests',async()=>{
 for(const [path,agent] of [['/','SchiildNative/1.1'],['/api/atelier','browser'],['/week/world.json','browser'],['/__ios/index.html','browser']]){
  const input=new Request('https://schiild.app'+path,{headers:{'User-Agent':agent}}),sentinel=new Response('original');let calls=0;
  const result=await publicSurface(input,async request=>{calls++;assert.equal(request,input);return sentinel;},files);assert.equal(result,sentinel);assert.equal(calls,1);
 }
});
test('public HTML invalidates old cached entrypoints and changes only the intended script and style',async()=>{
 const input=new Request('https://schiild.app/week/',{headers:{'If-None-Match':'stale'}});
 const result=await publicSurface(input,async request=>{assert.equal(request.headers.has('If-None-Match'),false);return new Response('<head></head><script src="'+files.path+'"></script><p>Original WhatsApp UI</p>',{headers:{'Content-Type':'text/html','ETag':'old','Cache-Control':'public, max-age=999'}});},files);
 assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.has('ETag'),false);const html=await result.text();assert(html.includes(files.path+'?ui=20261027-copy-id'));assert(html.includes('Original WhatsApp UI'));assert(html.includes(files.css));
 const script=await publicSurface(new Request('https://schiild.app'+files.path+'?ui=20261027-copy-id'),async()=>{throw Error('not required');},files);assert.equal(await script.text(),files.script);
});
