import {applicationDefault,initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getMessaging} from 'firebase-admin/messaging';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadBsp} from '@schiild/shared/bsp';
import {generationSeed} from './lottery.js';
import type {Authenticator,ObjectStore,Engine,GenerationInput,PushSender,Moderator} from './ports.js';
import {ApiError} from './errors.js';
const exec=promisify(execFile);
export function firebase(){return getApps()[0]??initializeApp({credential:applicationDefault()});}
export class FirebaseAuth implements Authenticator {async verify(token:string){const value=await getAuth(firebase()).verifyIdToken(token,true);return {uid:value.uid};}}
export class FirebasePush implements PushSender {async send(token:string,data:Record<string,string>){await getMessaging(firebase()).send({token,data});}}
export class S3Store implements ObjectStore {
 private client:S3Client;
 constructor(private bucket:string){this.client=new S3Client({region:process.env.AWS_REGION??'ap-northeast-1'});}
 async put(key:string,bytes:Buffer,contentType:string){await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:contentType}));}
 async get(key:string){const r=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));if(!r.Body)throw new Error('missing_object');return Buffer.from(await r.Body.transformToByteArray());}
 async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));}
}
export class UnconfiguredModerator implements Moderator {async review(_bytes:Buffer):Promise<'approved'|'rejected'>{throw new ApiError(503,'moderation_unconfigured');}}
export class RustEngine implements Engine {
 private layoutPromise:ReturnType<typeof loadBsp>|undefined;
 constructor(private store:ObjectStore,private executable:string,private wasmPath:string,private palettePath:string){}
 private async temporary<T>(action:(directory:string)=>Promise<T>){const parent=await realpath(tmpdir()),directory=await mkdtemp(join(parent,'schiild-gen-'));try{return await action(directory);}finally{if(dirname(resolve(directory))!==parent)throw new Error('invalid_temporary_path');await rm(directory,{recursive:true,force:true});}}
 async prepare(bytes:Buffer){return this.temporary(async directory=>{const input=join(directory,'photo.jpg'),out=join(directory,'out');await writeFile(input,bytes);await exec(this.executable,['--prepare-image',input,'--out',out],{timeout:60000});const record=JSON.parse(await readFile(join(out,'bucket-means.json'),'utf8'));return Object.values(record.images)[0] as number[];});}
 async layout(atelierId:string,day:string,hashes:string[],capacity:number){this.layoutPromise??=readFile(this.wasmPath).then(bytes=>loadBsp(bytes));const layout=await this.layoutPromise;return layout(generationSeed(atelierId,day,hashes),capacity);}
 async generate(atelierId:string,day:string,capacity:number,index:number,inputs:GenerationInput[],global:boolean){return this.temporary(async directory=>{
  const inputDir=join(directory,'input'),out=join(directory,'output');await mkdir(inputDir);
  const manifest=[];const means:Record<string,number[]>={};
  for(const input of inputs){const name=`${input.slotIndex}.jpg`;manifest.push({user_id:input.userId,slot_index:input.slotIndex,image:name,image_sha256:input.hash});if(!global)await writeFile(join(inputDir,name),await this.store.get(input.imageKey));else means[input.hash]=input.mean;}
  await writeFile(join(inputDir,'manifest.json'),JSON.stringify(manifest));
  const args=['--atelier-id',atelierId,'--date',day,'--capacity',String(capacity),'--schiild-index',String(index),'--input-dir',inputDir,'--palette',this.palettePath,'--out',out];
  if(global){const cache=join(directory,'means.json');await writeFile(cache,JSON.stringify({schema:'schiild-bucket-mean-v1',images:means}));args.push('--render-tier','bucket','--prepared-bucket',cache);}
  await exec(this.executable,args,{timeout:14*60000,maxBuffer:1024*1024});
  return {image:await readFile(join(out,'schiild.png')),thumbnail:await readFile(join(out,'thumbnail.png')),state:await readFile(join(out,'state.json')),seed:(await readFile(join(out,'used_seed.txt'),'utf8')).trim(),metadata:JSON.parse(await readFile(join(out,'metadata.json'),'utf8')),regions:JSON.parse(await readFile(join(out,'region_map.json'),'utf8'))};
 });}
}
