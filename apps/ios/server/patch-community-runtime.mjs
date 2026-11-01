// Additive migration of the backed-up live revision. Never replace newer authentication modules.
export function patchCommunityRuntime(source){
 const once=(old,value)=>{if(source.split(old).length!==2)throw Error('Community runtime anchor changed: '+old.slice(0,60));source=source.replace(old,value);};
 const line=source.split('\n').find(line=>line.includes('result = await personalBlocks('));
 if(!line||!line.includes('.execute(body, actor, credential);'))throw Error('Personal blocking boundary changed');
 const error=line.match(/ErrorClass: ([\w$]+)/)?.[1];if(!error)throw Error('Error class missing');
 once('await acceptPostingPolicy(this.storage, body, auth, credential, '+error+');','applyRequestedOfficialAteliers(this.storage,this.review);\n      await acceptPostingPolicy(this.storage, body, auth, credential, '+error+');');
 once(line,line.replace('result = await personalBlocks(','const personal = flexiblePersonalBlocks(').replace('.execute(body, actor, credential);',';')+'\n          result = await community({storage:this.storage,core:(next,token)=>personal.execute(next,actor,token),ErrorClass:'+error+',config:this.env.MODERATION_CONFIG,review:this.review,normalizeIcon:normalizeProfileIcon}).execute(body,actor,credential);');
 const executeLine=source.split('\n').find(line=>line.includes('const execute = createAtelierService('));if(!executeLine)throw Error('Atelier service boundary changed');
 once(executeLine,executeLine.replace('const execute = createAtelierService(','const flexibleExecute = flexibleAtelierService(')+'\n          const execute=async (...args)=>{try{return await flexibleExecute(...args);}catch(cause){if(cause instanceof FlexibleApiError)throw new '+error+'(cause.status,cause.code);throw cause;}};');
 once('const approved = humanModeration(','const approved = flexibleHumanModeration(');
 once('const safe = contentSafety(','const safe = flexibleContentSafety(');
 const publicLine=source.split('\n').find(line=>line.startsWith('var publicActions = '));if(!publicLine)throw Error('Public action registry changed');once(publicLine,publicLine+'\npublicActions.add("social.official.public");');
 once('erasePersonalBlocks(storage, account.member, anonymousMember);','erasePersonalBlocks(storage, account.member, anonymousMember);\n      eraseCommunity(storage,account.member);');
 return 'import {community,eraseCommunity} from "./community.mjs";\nimport {applyRequestedOfficialAteliers} from "./official-bootstrap.mjs";\nimport {normalizeProfileIcon} from "./profile-icon-image.mjs";\nimport {createAtelierService as flexibleAtelierService,ApiError as FlexibleApiError} from "../../demo/server/atelier-core.mjs";\nimport {humanModeration as flexibleHumanModeration} from "./human-moderation.mjs";\nimport {contentSafety as flexibleContentSafety} from "./content-safety.mjs";\nimport {personalBlocks as flexiblePersonalBlocks} from "./personal-blocks.mjs";\n'+source;
}
