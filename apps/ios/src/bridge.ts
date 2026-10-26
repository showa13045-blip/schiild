// First-party content only. Camera remains the live in-app getUserMedia flow in WKWebView.
export const nativeBridge=`(()=>{
 if(location.origin==='https://schiild.app'&&window.top===window&&Boolean(window.__schiildNativeInstalled)===false){
 window.__schiildNativeInstalled=true;
 const pending=new Map();let sequence=0;
 const call=(action,value)=>new Promise((resolve,reject)=>{
  const requestId='native-'+(++sequence);const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('native_timeout'));},action==='apple'?180000:30000);
  pending.set(requestId,{resolve,reject,timer});
  window.ReactNativeWebView.postMessage(JSON.stringify({action,requestId,...value}));
 });
 window.addEventListener('schiild-native-result',event=>{const value=event.detail,entry=pending.get(value?.requestId);if(entry===undefined)return;pending.delete(value.requestId);clearTimeout(entry.timer);if(value.ok)entry.resolve(value.result);else entry.reject(new DOMException('Cancelled','AbortError'));});
 window.schiildApple={signIn:value=>call('apple',value)};
 Object.defineProperty(navigator,'share',{configurable:true,value:value=>call('share',{text:value.text||'',title:value.title,url:value.url})});
 if(navigator.clipboard)Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:text=>call('clipboard',{text})});
 }})();true;`;
export function bridgeResult(requestId:string,ok:boolean,result?:unknown){
 return `window.dispatchEvent(new CustomEvent('schiild-native-result',{detail:${JSON.stringify({requestId,ok,result})}}));true;`;
}
