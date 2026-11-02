// DEMO/iOS ONLY. Image inference executes on Xserver CPU. No paid or external AI API.
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {AutomaticReviewError,classifyImageResult,AUTOMATIC_POLICY_VERSION,AUTOMATIC_PROVIDER} from './automatic-policy.mjs';
export function readAutomaticConfig(value){
 try{
  const config=typeof value==='string'?JSON.parse(value):value;
  if(!config||typeof config.enabled!=='boolean')return null;
  if(!config.enabled)return {enabled:false,provider:AUTOMATIC_PROVIDER,policyVersion:AUTOMATIC_POLICY_VERSION};
  const url=new URL(config.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/schiild-image-review.cgi'||!(/^(?:[-a-z0-9]+\.)?(?:xsrv\.jp|pickleballnavi\.jp)$/.test(url.hostname))||typeof config.key!=='string'||!/^[a-f0-9]{64}$/.test(config.key))return null;
  return {enabled:true,provider:AUTOMATIC_PROVIDER,policyVersion:AUTOMATIC_POLICY_VERSION,endpoint:url.href,key:config.key};
 }catch{return null;}
}
export async function analyzeImage(bytes,value,{request=fetch,timeoutMs=20000,now=()=>Date.now(),nonce=()=>randomBytes(16).toString('hex')}={}){
 const config=readAutomaticConfig(value);
 if(!config?.enabled)throw new AutomaticReviewError('review_not_configured');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<4||bytes.byteLength>4*1024*1024)throw new AutomaticReviewError('review_image_invalid');
 const imageHash=createHash('sha256').update(bytes).digest('hex'),jobKey=createHash('sha256').update(AUTOMATIC_POLICY_VERSION+'\n'+imageHash).digest('hex');
 const body=JSON.stringify({action:'enqueue',job_key:jobKey,policy_version:AUTOMATIC_POLICY_VERSION,image_base64:Buffer.from(bytes).toString('base64')}),stamp=String(Math.floor(now()/1000)),requestNonce=nonce();
 const signed='schiild-image-review-v1\n'+stamp+'\n'+requestNonce+'\n'+createHash('sha256').update(body).digest('hex');
 let response;
 try{response=await request(config.endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json','X-Review-Timestamp':stamp,'X-Review-Nonce':requestNonce,'X-Review-Signature':createHmac('sha256',config.key).update(signed).digest('hex')},body});}
 catch{throw new AutomaticReviewError('review_transport_failed');}
 if(!response.ok){await response.body?.cancel();throw new AutomaticReviewError(response.status===401||response.status===403?'review_credentials_invalid':'review_service_failed');}
 let result;try{result=await response.json();}catch{throw new AutomaticReviewError('review_result_invalid');}
 if(result.job_key!==jobKey||result.image_hash!==imageHash||result.policy_version!==AUTOMATIC_POLICY_VERSION)throw new AutomaticReviewError('review_result_invalid');
 if(!['approved','rejected'].includes(result.status))throw new AutomaticReviewError(result.status==='failed'?'review_local_failed':'review_pending',10000);
 return classifyImageResult(result.result);
}
