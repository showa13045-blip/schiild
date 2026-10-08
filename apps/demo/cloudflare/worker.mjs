// DEMO ONLY. No production M1–M4 dependencies. All application logic runs here.
import {DurableObject} from 'cloudflare:workers';
import {ApiError,createAtelierService} from '../server/atelier-core.mjs';
import {workerImages} from './images.mjs';
import {metadataStore} from './metadata-store.mjs';
import {xserverImages} from './xserver-store.mjs';
import {gateway} from './gateway.mjs';
import {accounts} from '../server/accounts.mjs';
export class AtelierDirectory extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.env=env;this.storage=ctx.storage;
  this.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (key TEXT PRIMARY KEY, data TEXT NOT NULL, etag TEXT NOT NULL)');
 }
 async fetch(request){
  try{
   let body;try{body=await request.json();}catch{throw new ApiError(400,'invalid');}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'invalid');
   const images=xserverImages({url:this.env.XSERVER_STORAGE_URL,secret:this.env.XSERVER_STORAGE_SECRET});
   const store=metadataStore(this.storage,images),auth=accounts(store),credential=request.headers.get('authorization')?.replace(/^Bearer /,'');
   let result;
   if(typeof body.action==='string'&&body.action.startsWith('account.')){
    if(['account.login','account.register'].includes(body.action)&&this.env.AUTH_RATE_LIMITER&&!((await this.env.AUTH_RATE_LIMITER.limit({key:request.headers.get('X-Demo-IP')??'local'})).success))throw new ApiError(429,'login_limited');
    result=await auth.execute(body,credential);
   }else{
    const actor=await auth.identity(credential);
    const execute=createAtelierService(store,{images:workerImages,memberForCredential:()=>actor.member});
    result=await execute(body,credential);
   }
   return Response.json(result);
  }catch(error){return Response.json({error:error instanceof ApiError?error.code:'unavailable'},{status:error instanceof ApiError?error.status:503});}
 }
}
export default {fetch:gateway};
