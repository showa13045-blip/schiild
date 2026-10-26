// Distribution-client routing only. This module never signs in a user or issues a session.
const origin='https://schiild.app',cookieName='__Host-schiild_native_line';
const redirect=(url,cookie)=>new Response(null,{status:302,headers:{Location:url,'Set-Cookie':cookie,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const cookie=value=>`${cookieName}=${value}; Path=/; Max-Age=${value?300:0}; Secure; HttpOnly; SameSite=Lax`;
export function nativeSurface(request){
 const url=new URL(request.url);if(url.origin!==origin||request.method!=='GET')return null;
 if(url.pathname==='/native-auth/line'){
  let authorization;try{authorization=new URL(url.searchParams.get('authorize'));}catch{return new Response('Invalid request',{status:400});}
  const state=authorization.searchParams.get('state'),nonce=authorization.searchParams.get('nonce'),challenge=authorization.searchParams.get('code_challenge');
  if(authorization.origin!=='https://access.line.me'||authorization.pathname!=='/oauth2/v2.1/authorize'||authorization.hash||authorization.username||authorization.password||
   authorization.searchParams.get('client_id')!=='2012141224'||authorization.searchParams.get('redirect_uri')!==origin+'/?auth=line'||
   authorization.searchParams.get('response_type')!=='code'||authorization.searchParams.get('scope')!=='openid profile'||
   authorization.searchParams.get('code_challenge_method')!=='S256'||!state||!/^[a-f0-9]{64}$/.test(state)||!nonce||!/^[a-f0-9]{64}$/.test(nonce)||!challenge||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return new Response('Invalid request',{status:400});
  return redirect(authorization.href,cookie(state));
 }
 if(url.pathname==='/'&&url.searchParams.get('auth')==='line'){
  const state=url.searchParams.get('state'),stored=(request.headers.get('Cookie')??'').split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!state||!/^[a-f0-9]{64}$/.test(state)||stored!==state)return null;
  const code=url.searchParams.get('code'),error=url.searchParams.has('error');if((!code&&!error)||(code&&code.length>2048))return null;
  const callback=new URL('schiild://auth/line');callback.searchParams.set('state',state);
  if(code)callback.searchParams.set('code',code);else callback.searchParams.set('error','access_denied');
  return redirect(callback.href,cookie(''));
 }
 return null;
}
