import {createHash,createHmac} from 'node:crypto';
const validKey=key=>/^(photos\/[a-f0-9]{64}\/\d{4}-\d{2}-\d{2}|works\/[A-Z0-9]{8}\/\d{4}-\d{2}-\d{2})$/.test(key);
// Xserver holds binary images only. Metadata stays in Durable Objects.
export function xserverImages({url,secret,fetcher=fetch,now=()=>Date.now(),allowLocal=false}){
 const endpoint=new URL(url);if(endpoint.protocol!=='https:'&&!(allowLocal&&endpoint.hostname==='127.0.0.1'))throw Error('storage_configuration');
 if(!/^[a-f0-9]{64}$/.test(secret??''))throw Error('storage_configuration');
 async function request(method,key,data){
  if(!validKey(key))throw Error('storage_key');
  const target=new URL(endpoint);target.searchParams.set('key',key);
  const bytes=data?Buffer.from(data):Buffer.alloc(0),timestamp=String(Math.floor(now()/1000));
  const digest=createHash('sha256').update(bytes).digest('hex');
  const signature=createHmac('sha256',secret).update(`${method}\n${key}\n${timestamp}\n${digest}`).digest('hex');
  // Workers support manual redirects; never forward the signature to a redirect.
  const response=await fetcher(target,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'X-Schiild-Time':timestamp,'X-Schiild-Signature':signature,'Content-Type':'application/octet-stream'},...(method==='PUT'?{body:bytes}:{})});
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw Error('storage_unavailable');
  if(method==='GET'){if(Number(response.headers.get('content-length'))>3000000)throw Error('storage_size');const bytes=await response.arrayBuffer();if(bytes.byteLength>3000000)throw Error('storage_size');return bytes;}
  return {modified:response.status===201};
 }
 return {get:(key)=>request('GET',key),set:(key,data)=>request('PUT',key,data)};
}
