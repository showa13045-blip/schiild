// Guarded migration, restricted to the demo's deployed worker class.
/* eslint-disable schiild/product-copy -- Executable source expressions only. */
export function patchModerationRuntime(source){
 const start=source.indexOf('var AtelierDirectory = class extends DurableObject {'),end=source.indexOf('\nvar worker_default =',start);if(start<0||end<0)throw Error('Directory boundary changed');let module=source.slice(start,end);
 const once=(old,value)=>{if(module.split(old).length!==2)throw Error('Moderation directory changed: '+old.slice(0,100));module=module.replace(old,value);};
 const ErrorClass=module.match(/throw new ([\w$]+)\(400, "invalid"\)/)?.[1];if(!ErrorClass)throw Error('Error class missing');
 once('result = this.review ? await reviewAccountAction(this, body, credential, auth, '+ErrorClass+') : await auth.execute(body, credential);','result = body.action === "account.moderation.config" ? await moderatorReadiness(store,this.env.MODERATION_CONFIG,this.review) : this.review ? await reviewAccountAction(this, body, credential, auth, '+ErrorClass+') : await auth.execute(body, credential);');
 once('removeDeletedConsents(this.storage);','{removeDeletedConsents(this.storage);removeDeletedModeration(this.storage);}');
 once('result = await execute(body, credential);','result = await humanModeration({store,storage:this.storage,images:workerImages,core:execute,globalFactory:globalService,ErrorClass:'+ErrorClass+',config:this.env.MODERATION_CONFIG,review:this.review,notifications:Boolean(this.env.WEB_PUSH_CONFIG)}).execute(body,actor,credential);');
 source=source.slice(0,start)+module+source.slice(end);
 const marker='!value && !today.posts[n]';if(source.split(marker).length!==2)throw Error('Slot reservation source changed');source=source.replace(marker,marker+' && !today.pendingSlots?.[n]');
 return 'import {humanModeration,moderatorReadiness,removeDeletedModeration} from "./human-moderation.mjs";\n'+source;
}
