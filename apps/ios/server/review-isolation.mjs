// App Review only. A separate named Durable Object contains all review identities,
// memberships, original photos, artworks and sessions. Ordinary data is never reset.
import {createHash,timingSafeEqual} from 'node:crypto';
export const REVIEW_OBJECT_NAME='app-store-review-v1';
const digest=value=>createHash('sha256').update(value).digest('hex');
// Cloudflare defines ctx.id as the platform object identifier.
// eslint-disable-next-line schiild/domain-names
export function isReviewObject(ctx,env){return Boolean(ctx.id&&env.ATELIERS&&ctx.id.toString()===env.ATELIERS.idFromName(REVIEW_OBJECT_NAME).toString());}
export async function reviewAccountAction(directory,body,credential,auth,ErrorClass){
 const fail=(status,code)=>{throw new ErrorClass(status,code);};
 if(body.action==='account.review.login'){
  if(directory.env.AUTH_RATE_LIMITER&&!(await directory.env.AUTH_RATE_LIMITER.limit({key:'review/'+(directory.reviewIP??'local')})).success)fail(429,'login_limited');
  let config;try{config=JSON.parse(directory.env.APP_REVIEW_CONFIG??'null');}catch{fail(503,'unavailable');}
  const entry=Array.isArray(config?.users)?config.users.find(user=>user.username===body.username):null;
  if(typeof body.password!=='string'||body.password.length<12||body.password.length>128||!entry||!/^[a-f0-9]{64}$/.test(entry.passwordHash)||!timingSafeEqual(Buffer.from(digest(body.password)),Buffer.from(entry.passwordHash)))fail(401,'login_invalid');
  const {store}=directory.services();
  if(!await store.getWithMetadata('accounts/'+entry.username,{type:'json'}))return auth.execute({action:'account.register',username:entry.username,password:body.password,name:entry.name??'Reviewer'},credential);
  return auth.execute({action:'account.login',username:entry.username,password:body.password},credential);
 }
 if(/^account\.(?:line|apple|whatsapp|google)/.test(body.action)){
  if(/(?:\.config|google\.start)$/.test(body.action))return {enabled:false};
  fail(403,'forbidden');
 }
 if(!['account.me','account.logout','account.update','account.delete'].includes(body.action))fail(403,'forbidden');
 // Password deletion in this isolated environment also removes original photos.
 if(body.action==='account.delete'){
  const actor=await auth.identity(credential);if(!actor.account)fail(401,'unauthorized');
  // The core transaction's purge flag is set by the guarded runtime patch.
 }
 return auth.execute(body,credential);
}
export async function reviewActor(auth,action,credential,ErrorClass){
 const actor=await auth.identity(credential);
 if(actor?.account&&actor.sessionKey)return actor;
 throw new ErrorClass(401,'unauthorized');
}
export async function reviewGateway(request,env,fetchOriginal){
 const url=new URL(request.url);if(url.pathname!=='/api/review')return null;
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return Response.json({error:'forbidden'},{status:403});
 // Keep the ordinary gateway's size limits, bearer validation and IP rate limits.
 // Only its fixed object name is remapped. No caller-controlled object selection.
 const namespace={idFromName:name=>env.ATELIERS.idFromName(name==='shared-demo-v1'?REVIEW_OBJECT_NAME:name),get:object=>env.ATELIERS.get(object)};
 url.pathname='/api/atelier';
 return fetchOriginal(new Request(url,request),{...env,ATELIERS:namespace});
}
