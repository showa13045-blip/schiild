// The native bridge is available only to the first-party HTTPS application.
export const APP_ORIGIN='https://schiild.app';
export const APP_CALLBACK='schiild://auth/line';
export function isAppURL(value:string){
 try{const url=new URL(value);return url.origin===APP_ORIGIN&&!url.username&&!url.password;}catch{return false;}
}
export function lineAuthorization(value:string){
 try{
  const url=new URL(value),state=url.searchParams.get('state');
  if(url.origin!=='https://access.line.me'||url.pathname!=='/oauth2/v2.1/authorize'||url.username||url.password||
   url.searchParams.get('client_id')!=='2012141224'||url.searchParams.get('redirect_uri')!==APP_ORIGIN+'/?auth=line'||
   url.searchParams.get('response_type')!=='code'||!state||!/^[a-f0-9]{64}$/.test(state))return null;
  return {url:url.href,state};
 }catch{return null;}
}
export function lineReturn(value:string,state:string){
 try{
  const url=new URL(value);
  if(url.protocol!=='schiild:'||url.hostname!=='auth'||url.pathname!=='/line'||url.searchParams.get('state')!==state)return null;
  const code=url.searchParams.get('code'),denied=url.searchParams.get('error');
  if((!code&&!denied)||(code&&code.length>2048)||url.username||url.password)return null;
  const result=new URL('/?auth=line',APP_ORIGIN);result.searchParams.set('state',state);
  if(code)result.searchParams.set('code',code);else result.searchParams.set('error','access_denied');
  return result.href;
 }catch{return null;}
}
export function externalURL(value:string){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export type AppleMessage={requestId:string;action:'apple';state:string;nonce:string;intent:'login'|'register'|'delete'};
export type NativeMessage=AppleMessage|{requestId:string;action:'share'|'clipboard';text:string;url?:string;title?:string};
export function nativeMessage(data:string):NativeMessage|null{
 if(data.length>12000)return null;
 try{const value=JSON.parse(data);if(!value||!/^native-[0-9]+$/.test(value.requestId))return null;
  if(value.action==='apple')return /^[a-f0-9]{64}$/.test(value.state??'')&&/^[a-f0-9]{64}$/.test(value.nonce??'')&&['login','register','delete'].includes(value.intent)?value:null;
  if(!['share','clipboard'].includes(value.action)||typeof value.text!=='string'||value.text.length>4096)return null;
  if(value.url!==undefined&&(!isAppURL(value.url)||value.url.length>4096))return null;
  if(value.title!==undefined&&(typeof value.title!=='string'||value.title.length>128))return null;
  return value;
 }catch{return null;}
}
