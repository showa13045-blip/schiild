import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HttpModerator,configuredModerator} from '../dist/moderation.js';
import {UnconfiguredModerator} from '../dist/adapters.js';
const bytes=Buffer.from('synthetic jpeg bytes'),hash=createHash('sha256').update(bytes).digest('hex');
const result=(extra={})=>new Response(JSON.stringify({schema:'schiild-moderation-v1',image_sha256:hash,decision:'approved',...extra}),{headers:{'content-type':'application/json'}});
const unavailable=error=>error.getStatus?.()===503;
test('moderation transport binds the verdict to submitted bytes and preserves official reasons',async()=>{
 let sent;
 const gateway=new HttpModerator('https://moderation.example.test/review','fixture-token',async(url,options)=>{sent={url,options};return result();});
 assert.deepEqual(await gateway.review(bytes),{decision:'approved'});
 assert.equal(sent.options.headers['x-image-sha256'],hash);assert.equal(sent.options.headers.authorization,'Bearer fixture-token');assert.equal(sent.options.redirect,'error');assert.deepEqual(Buffer.from(sent.options.body),bytes);
 const denied=new HttpModerator('https://moderation.example.test/review','fixture-token',async()=>result({decision:'rejected',reason:'person'}));assert.deepEqual(await denied.review(bytes),{decision:'rejected',reason:'person'});
});
test('moderation fails closed for missing config, HTTP errors, wrong hash, invalid verdict and oversized replies',async()=>{
 await assert.rejects(configuredModerator({},new UnconfiguredModerator()).review(bytes),unavailable);
 assert.throws(()=>configuredModerator({MODERATION_URL:'https://example.test'},new UnconfiguredModerator()));
 assert.throws(()=>new HttpModerator('http://example.test','token'));
 for(const request of [
  async()=>new Response('',{status:503}),async()=>result({image_sha256:'00'.repeat(32)}),async()=>result({decision:'unknown'}),async()=>result({decision:'rejected'}),
  async()=>result({decision:'rejected',reason:'unmapped'}),async()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
  async()=>new Response('x'.repeat(17000),{headers:{'content-type':'application/json'}}),async()=>{throw Error('network');}
 ])await assert.rejects(new HttpModerator('https://example.test','token',request).review(bytes),unavailable);
});
test('moderation aborts a stalled request',async()=>{
 const request=async(_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('timeout')));});
 const timer=setTimeout(()=>{},200);
 try{await assert.rejects(new HttpModerator('https://example.test','token',request,20).review(bytes),unavailable);}finally{clearTimeout(timer);}
});
