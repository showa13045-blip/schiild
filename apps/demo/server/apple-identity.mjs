// DEMO/iOS ONLY. The App Store Connect build key is never used for authentication.
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createRemoteJWKSet,importPKCS8,SignJWT,jwtVerify} from 'jose';
const issuer='https://appleid.apple.com',clientId='app.schiild.mobile';
const keys=createRemoteJWKSet(new URL(issuer+'/auth/keys'),{timeoutDuration:10000,cooldownDuration:30000});
export const appleDigest=value=>createHash('sha256').update(value).digest('hex');
export function readAppleConfig(value){
 try{const config=JSON.parse(value);return config.clientId===clientId&&/^[A-Z0-9]{10}$/.test(config.teamId)&&/^[A-Z0-9]{10}$/.test(config.keyId)&&/^[a-f0-9]{64}$/.test(config.encryptionKey)&&config.privateKey?.includes('BEGIN PRIVATE KEY')?config:null;}catch{return null;}
}
export function sealAppleToken(token,config,subject){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),iv);cipher.setAAD(Buffer.from(subject));
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return Buffer.concat([iv,encrypted,cipher.getAuthTag()]).toString('base64url');
}
export function openAppleToken(value,config,subject){
 const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw Error('apple_invalid');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(config.encryptionKey,'hex'),bytes.subarray(0,12));decipher.setAAD(Buffer.from(subject));decipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
}
export function appleIdentity(config,{fetcher=fetch,now=()=>Date.now(),jwks=keys}={}){
 async function clientSecret(){const time=Math.floor(now()/1000);return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:config.keyId}).setIssuer(config.teamId).setSubject(clientId).setAudience(issuer).setIssuedAt(time).setExpirationTime(time+300).sign(await importPKCS8(config.privateKey,'ES256'));}
 async function post(endpoint,values){const response=await fetcher(issuer+endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:await clientSecret(),...values})});if(!response.ok)throw Error('apple_invalid');return response;}
 async function verify(token,nonce,createdAt){
  const {payload}=await jwtVerify(token,jwks,{issuer,audience:clientId,algorithms:['RS256'],requiredClaims:['sub','nonce','exp','iat'],maxTokenAge:300,clockTolerance:5,currentDate:new Date(now())});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||payload.nonce!==nonce||payload.iat*1000<createdAt-5000)throw Error('apple_invalid');
  return payload;
 }
 return {
  async authorize({identityToken,code,nonce,createdAt}){
   const native=await verify(identityToken,nonce,createdAt),response=await post('/auth/token',{grant_type:'authorization_code',code}),grant=await response.json();
   if(typeof grant.id_token!=='string'||typeof grant.refresh_token!=='string'||grant.refresh_token.length>8192)throw Error('apple_invalid');
   const validated=await verify(grant.id_token,nonce,createdAt);if(native.sub!==validated.sub)throw Error('apple_invalid');
   return {subject:appleDigest(clientId+'/'+validated.sub),refreshToken:grant.refresh_token};
  },
  async revoke(token){await post('/auth/revoke',{token,token_type_hint:'refresh_token'});}
 };
}
