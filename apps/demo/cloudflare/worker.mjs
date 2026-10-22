// DEMO ONLY. No production M1–M4 dependencies. All application logic runs here.
import {DurableObject} from 'cloudflare:workers';
import {ApiError,createAtelierService} from '../server/atelier-core.mjs';
import {workerImages} from './images.mjs';
import {metadataStore} from './metadata-store.mjs';
import {xserverImages} from './xserver-store.mjs';
import {siteRequest} from './site.mjs';
import {sqliteImages} from './sqlite-images.mjs';
import {accounts} from '../server/accounts.mjs';
import {actorForAction} from '../server/access-policy.mjs';
import {validGoogleClient} from '../server/google-identity.mjs';
import {readLineConfig,validLineConfig} from '../server/line-identity.mjs';
import {readWhatsAppConfig} from '../server/whatsapp-accounts.mjs';
import {notificationService,readPushConfig} from '../server/notifications.mjs';
export class AtelierDirectory extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.env=env;this.storage=ctx.storage;
  this.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (key TEXT PRIMARY KEY, data TEXT NOT NULL, etag TEXT NOT NULL)');
 }
 services(){
  // The legacy branch is for migration/rollback tests only. The deployed backend is SQLite.
  const images=this.env.IMAGE_BACKEND==='durable-sqlite'?sqliteImages(this.storage):xserverImages({url:this.env.XSERVER_STORAGE_URL,secret:this.env.XSERVER_STORAGE_SECRET});
  const store=metadataStore(this.storage,images,{notificationEvents:Boolean(readPushConfig(this.env.WEB_PUSH_CONFIG))});
  return {store,push:notificationService(store,{requireLine:true,config:this.env.WEB_PUSH_CONFIG,images:workerImages})};
 }
 async importImage(name,bytes,expected){return sqliteImages(this.storage).importImage(name,bytes,expected);}
 async imageInfo(name){return sqliteImages(this.storage).info(name);}
 async tick(){
  if(this.draining)return;this.draining=true;
  try{const {push}=this.services();try{await push.finalizeGlobal();}finally{const next=await push.drain();if(next){const current=await this.storage.getAlarm();if(!current||current>next)await this.storage.setAlarm(next);}}}finally{this.draining=false;}
 }
 async alarm(){await this.tick();}
 async receiveWhatsApp(payload){
  const {store}=this.services();
  const auth=accounts(store,{requireLine:true,whatsappConfig:readWhatsAppConfig(this.env.WHATSAPP_LOGIN_CONFIG)});
  return auth.receiveWhatsApp(payload);
 }
 async fetch(request){
  try{
   let body;try{body=await request.json();}catch{throw new ApiError(400,'invalid');}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'invalid');
   const {store,push}=this.services(),lineConfig=readLineConfig(this.env.LINE_LOGIN_CONFIG),auth=accounts(store,{requireLine:true,images:workerImages,googleClientId:this.env.GOOGLE_CLIENT_ID,lineConfig,whatsappConfig:readWhatsAppConfig(this.env.WHATSAPP_LOGIN_CONFIG)}),credential=request.headers.get('authorization')?.replace(/^Bearer /,'');
   let result;
   if(typeof body.action==='string'&&body.action.startsWith('account.')){
    // Disabled feature discovery must not consume password-login/deletion attempts.
    const authAttempt=['account.login','account.register','account.google','account.delete','account.line','account.whatsapp.start','account.whatsapp.complete'].includes(body.action)||body.action==='account.google.start'&&validGoogleClient(this.env.GOOGLE_CLIENT_ID)||body.action==='account.line.start'&&validLineConfig(lineConfig);
    if(authAttempt&&this.env.AUTH_RATE_LIMITER&&!((await this.env.AUTH_RATE_LIMITER.limit({key:request.headers.get('X-Demo-IP')??'local'})).success))throw new ApiError(429,'login_limited');
    result=await auth.execute(body,credential);
   }else{
    const actor=await actorForAction(auth,body.action,credential);
    if(typeof body.action==='string'&&body.action.startsWith('push.'))result=await push.execute(body,actor);
    else{const execute=createAtelierService(store,{images:workerImages,memberForCredential:()=>actor.member,publicOnly:!actor.account});result=await execute(body,credential);}
   }
   if(push.enabled&&!await this.storage.getAlarm())await this.storage.setAlarm(Date.now()+1000);
   return Response.json(result);
  }catch(error){return Response.json({error:error instanceof ApiError?error.code:'unavailable'},{status:error instanceof ApiError?error.status:503});}
 }
}
export default {fetch:siteRequest,async scheduled(_event,env,ctx){const stub=env.ATELIERS.get(env.ATELIERS.idFromName('shared-demo-v1'));ctx.waitUntil(stub.tick());}};
