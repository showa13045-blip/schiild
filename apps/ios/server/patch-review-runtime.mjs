/* eslint-disable schiild/product-copy -- Guarded executable source expressions, not UI copy. */
// Guarded additive migration of the backed-up deployed revision, not an older checkout.
export function patchReviewRuntime(source){
 const once=(old,value)=>{if(source.split(old).length!==2)throw Error('Review runtime source changed: '+old.slice(0,80));source=source.replace(old,value);};
 const start=source.indexOf('var AtelierDirectory = class extends DurableObject {'),end=source.indexOf('\nvar worker_default =',start);
 if(start<0||end<0)throw Error('Directory boundary missing');
 let module=source.slice(start,end);
 const change=(old,value)=>{if(module.split(old).length!==2)throw Error('Directory changed: '+old.slice(0,80));module=module.replace(old,value);};
 change('this.env = env;','this.review = isReviewObject(ctx,env);\n    this.env = this.review ? {...env,LINE_LOGIN_CONFIG:undefined,WHATSAPP_LOGIN_CONFIG:undefined,APPLE_LOGIN_CONFIG:undefined,GOOGLE_CLIENT_ID:undefined,WEB_PUSH_CONFIG:undefined} : env;');
 const flagCount=module.split('requireLine: true').length-1;if(flagCount!==3)throw Error('Auth options changed');
 module=module.replaceAll('requireLine: true','requireLine: !this.review');
 change('let result;','let result;\n      this.reviewIP=request.headers.get("X-Demo-IP");\n      await acceptPostingPolicy(this.storage,body,auth,credential,ApiError2);');
 change('result = await auth.execute(body, credential);','result = this.review ? await reviewAccountAction(this,body,credential,auth,ApiError2) : await auth.execute(body, credential);\n        if(result?.deleted || body.action==="account.delete"&&result?.done)removeDeletedConsents(this.storage);');
 change('const actor = await actorForAction(auth, body.action, credential);','const actor = this.review ? await reviewActor(auth,body.action,credential,ApiError2) : await actorForAction(auth, body.action, credential);');
 source=source.slice(0,start)+module+source.slice(end);
 // Core account deletion must purge originals for review password accounts too.
 once('if (requireLine) await prepareOriginalDeletion2(store, actor.account, images);','await prepareOriginalDeletion2(store, actor.account, images);');
 once('{ purgePhotos: requireLine });','{ purgePhotos: true });');
 return 'import {isReviewObject,reviewAccountAction,reviewActor} from "./review-isolation.mjs";\nimport {acceptPostingPolicy,removeDeletedConsents} from "./posting-consent.mjs";\n'+source;
}
