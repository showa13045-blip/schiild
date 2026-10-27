// Guard the deployed revision instead of replacing newer authentication code.
export function patchSafetyRuntime(source){
 const start=source.indexOf('var AtelierDirectory = class extends DurableObject {'),end=source.indexOf('\nvar worker_default =',start);if(start<0||end<0)throw Error('Directory boundary changed');let module=source.slice(start,end);
 const once=(old,value)=>{if(module.split(old).length!==2)throw Error('Safety directory changed');module=module.replace(old,value);};
 const old=module.split('\n').find(line=>line.includes('result = await humanModeration('));if(!old)throw Error('Moderation call missing');const error=old.match(/ErrorClass: ([\w$]+)/)?.[1];if(!error)throw Error('Error class missing');
 once(old,old.replace('result = await humanModeration(','const approved = humanModeration(').replace('.execute(body, actor, credential);',';')+'\n          result = await contentSafety({store,storage:this.storage,images:workerImages,core:(next,token)=>approved.execute(next,actor,token),globalFactory:globalService,ErrorClass:'+error+',config:this.env.MODERATION_CONFIG,review:this.review}).execute(body,actor,credential);');
 once('removeDeletedModeration(this.storage);','removeDeletedModeration(this.storage);anonymizeDeletedReports(this.storage);');
 return 'import {contentSafety,anonymizeDeletedReports} from "./content-safety.mjs";\n'+source.slice(0,start)+module+source.slice(end);
}
export function patchSafetyUI(source){
 function inModule(term,change){const index=source.indexOf(term);if(index<0||source.indexOf(term,index+term.length)>=0)throw Error('UI marker missing or repeated: '+term);const start=source.lastIndexOf('__d(',index),end=source.indexOf('\n__d(',index);if(start<0||end<0)throw Error('UI module boundary missing');source=source.slice(0,start)+change(source.slice(start,end))+source.slice(end);}
 inModule('"data-testid":"reveal"',module=>{const after=module.slice(module.indexOf('"data-testid":"reveal"')),work=after.match(/src:([\w$]+)\.image/)?.[1];if(!work)throw Error('Reveal work missing');return module.replace('"data-testid":"reveal"','"data-testid":"reveal","data-report-url":'+work+'.reportUrl');});
 inModule('"data-testid":"global-page"',module=>{const work=module.match(/([\w$]+)\.layoutRevision\?\?\1\.image/)?.[1];if(!work)throw Error('GLOBAL work missing');return module.replace('"data-testid":"global-page"','"data-testid":"global-page","data-report-url":'+work+'?.reportUrl');});
 inModule('"data-testid":"public-atelier-page"',module=>{const match=module.match(/\('public.work',\{code:([\w$]+),day:([\w$]+)\}/);if(!match)throw Error('Public work identity missing');return module.replace('"data-testid":"public-atelier-page"','"data-testid":"public-atelier-page","data-report-url":'+match[2]+'?"/report/?target="+'+match[1]+'+"&day="+'+match[2]+'+(location.pathname.startsWith("/review/")?"&mode=review":""):undefined');});
 inModule('"data-testid":"archive-carousel"',module=>module.replace(/className:"calendar-slide","data-code":([\w$]+)\.code/,(_,item)=>'className:"calendar-slide","data-report-url":'+item+'.reportUrl,"data-code":'+item+'.code'));
 return source;
}
