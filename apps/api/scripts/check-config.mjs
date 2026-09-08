import {access} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
const required=['DATABASE_URL','REDIS_URL','S3_BUCKET','AWS_REGION','GOOGLE_CLOUD_PROJECT','GEN_EXECUTABLE','GEN_WASM','GEN_PALETTE','MODERATION_URL','MODERATION_TOKEN'];
let missing=0;
for(const name of required){
 let ready=Boolean(process.env[name]?.trim());
 if(ready&&name.startsWith('GEN_')){ready=isAbsolute(process.env[name]);if(ready)try{await access(process.env[name]);}catch{ready=false;}}
 if(ready&&['DATABASE_URL','REDIS_URL','MODERATION_URL'].includes(name)){try{const protocol=new URL(process.env[name]).protocol;ready=name==='MODERATION_URL'?protocol==='https:':name==='REDIS_URL'?['redis:','rediss:'].includes(protocol):['postgres:','postgresql:'].includes(protocol);}catch{ready=false;}}
 console.log(`${name}: ${ready?'configured':'missing or invalid'}`);if(!ready)missing++;
}
console.log('Credentials and remote connectivity are not verified by this offline check.');
process.exitCode=missing?1:0;
