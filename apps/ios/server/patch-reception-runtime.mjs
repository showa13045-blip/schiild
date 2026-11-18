// Apply only this feature to the current backed-up Worker, keeping newer auth and chat intact.
export function patchReceptionRuntime(source){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Reception runtime anchor changed: '+before.slice(0,100));source=source.replace(before,after);};
 const publicRegistry=source.split('\n').find(line=>line.startsWith('var publicActions = '));if(!publicRegistry)throw Error('Public API registry changed');once(publicRegistry,publicRegistry+'\npublicActions.add("reception.info");');
 const actor=source.split('\n').find(line=>line.includes('const actor = this.review ? await reviewActor('));if(!actor)throw Error('Authenticated actor boundary changed');
 once(actor,actor+'\n        if(typeof body.action==="string"&&body.action.startsWith("reception.")){const receptionResult=await receptionService({storage:this.storage,ErrorClass:ApiError22,operatorConfig:this.env.MODERATION_CONFIG,review:this.review,dispatch:next=>this.fetch(new Request(request,{body:JSON.stringify(next)}))}).execute(body,actor);return receptionResult instanceof Response?receptionResult:Response.json(receptionResult);}');
 return 'import {receptionService} from "./atelier-reception-api.mjs";\n'+source;
}
