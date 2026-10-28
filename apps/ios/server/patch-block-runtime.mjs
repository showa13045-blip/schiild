// Patch only the backed-up deployed revision; retain newer authentication flows.
export function patchBlockRuntime(source){
 function once(old,value){if(source.split(old).length!==2)throw Error('Blocking runtime anchor changed');source=source.replace(old,value);}
 const old=source.split('\n').find(line=>line.includes('result = await contentSafety('));if(!old||!old.includes('.execute(body, actor, credential);'))throw Error('Content safety boundary changed');
 const error=old.match(/ErrorClass: ([\w$]+)/)?.[1];if(!error)throw Error('Error class missing');
 once(old,old.replace('result = await contentSafety(','const safe = contentSafety(').replace('.execute(body, actor, credential);',';')+'\n          result = await personalBlocks({store,storage:this.storage,images:workerImages,core:(next,token)=>safe.execute(next,actor,token),ErrorClass:'+error+'}).execute(body,actor,credential);');
 const deletion='const { writes, deletes, photoKeys } = removalChanges(rows, account, anonymousMember, attemptKeys, options);';
 once(deletion,'erasePersonalBlocks(storage,account.member,anonymousMember);\n        '+deletion);
 return 'import {personalBlocks,erasePersonalBlocks} from "./personal-blocks.mjs";\n'+source;
}
