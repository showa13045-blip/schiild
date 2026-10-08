// DEMO ONLY. Google authentication is independent of production M1–M4.
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {ApiError} from './atelier-core.mjs';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const validGoogleClient=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
export function googleVerifier(clientId,{keys=googleKeys,now=()=>Date.now()}={}){
 return async token=>{
  if(!validGoogleClient(clientId))throw new ApiError(503,'google_unavailable');
  if(typeof token!=='string'||token.length>8192)throw new ApiError(401,'google_invalid');
  try{
   const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],audience:clientId,issuer:['https://accounts.google.com','accounts.google.com'],requiredClaims:['sub','exp','iat','nonce','email','email_verified'],maxTokenAge:'1h',currentDate:new Date(now())});
   if(payload.aud!==clientId||(payload.azp!==undefined&&payload.azp!==clientId)||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||typeof payload.nonce!=='string'||payload.email_verified!==true||typeof payload.email!=='string'||payload.email.length>254)throw Error('claims');
   return {subject:payload.sub,nonce:payload.nonce,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,40):''};
  }catch{throw new ApiError(401,'google_invalid');}
 };
}
