import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeUI} from '../server/native-ui.mjs';
import {nativeMessage} from '../src/policy.ts';
test('iOS UI is opt-in and never replaces the ordinary web or week example',async()=>{
 const files={'index.html':'ios-ui','_expo/test.js':'script'},native={'user-agent':'iPhone SchiildNative/1.1'};
 assert.equal(nativeUI(new Request('https://schiild.app/'),files),null);
 assert.equal(nativeUI(new Request('https://schiild.app/',{headers:{'user-agent':'SchiildNative/1.0'}}),files),null);
 assert.equal(nativeUI(new Request('https://schiild.app/week/',{headers:native}),files),null);
 const response=nativeUI(new Request('https://schiild.app/?auth=line',{headers:native}),files);assert.equal(await response.text(),'ios-ui');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Vary'),'User-Agent');
 assert.equal(nativeUI(new Request('https://schiild.app/api/atelier',{method:'POST',headers:native}),files),null);
 const js=nativeUI(new Request('https://schiild.app/__ios/_expo/test.js'),files);assert.match(js.headers.get('Content-Type'),/javascript/);
});
test('native Apple bridge accepts bounded challenges, never arbitrary token or callback destinations',()=>{
 const message={action:'apple',requestId:'native-1',nonce:'a'.repeat(64),state:'b'.repeat(64),intent:'login'};
 assert(nativeMessage(JSON.stringify(message)));
 for(const invalid of [{...message,state:'wrong'},{...message,nonce:''},{...message,intent:'link-other-account'},{...message,requestId:'script()'}])assert.equal(nativeMessage(JSON.stringify(invalid)),null);
});
