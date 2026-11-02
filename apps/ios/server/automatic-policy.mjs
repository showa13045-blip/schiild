// DEMO/iOS ONLY. Confidence thresholds are application policy, not validated accuracy.
export const AUTOMATIC_POLICY_VERSION='2026-11-02.local1';
export const AUTOMATIC_PROVIDER='xserver-local-onnx';
export const AUTOMATIC_RETRY=Symbol('automatic-rejected-photo-retry');
export const IMAGE_CATEGORIES=['sexual','gore'];
export const MODEL_REPOSITORY='OwenElliott/image-safety-classifier-s';
export const MODEL_REVISION='015042b0eab17f1b17f2986527386346fb0d94be';
export const AUTOMATIC_POLICY={version:AUTOMATIC_POLICY_VERSION,provider:AUTOMATIC_PROVIDER,model:MODEL_REPOSITORY,revision:MODEL_REVISION,safeThreshold:.8,rejectThreshold:.8,coverage:IMAGE_CATEGORIES,sources:['https://www.esafety.gov.au/industry/safety-by-design','https://huggingface.co/'+MODEL_REPOSITORY,'https://developer.apple.com/app-store/review/guidelines/#user-generated-content']};
export class AutomaticReviewError extends Error{
 constructor(code,retryAfterMs=30000){super(code);this.name='AutomaticReviewError';this.code=code;this.retryAfterMs=Math.min(3600000,Math.max(1000,retryAfterMs));}
}
export function classifyImageResult(value){
 const scores=value?.scores;
 if(value?.model!==MODEL_REPOSITORY||value.revision!==MODEL_REVISION||!scores||Object.keys(scores).sort().join(',')!=='clear,gore,sexual'||Object.values(scores).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(Object.values(scores).reduce((a,b)=>a+b,0)-1)>.01)throw new AutomaticReviewError('review_result_invalid');
 let reasons=IMAGE_CATEGORIES.filter(category=>scores[category]>=AUTOMATIC_POLICY.rejectThreshold);
 if(!reasons.length&&scores.clear<AUTOMATIC_POLICY.safeThreshold)reasons=['uncertain'];
 const decision=reasons.length?'reject':'allow';
 if(value.decision!==(decision==='allow'?'approved':'rejected')||!Array.isArray(value.reasons)||JSON.stringify([...value.reasons].sort())!==JSON.stringify([...reasons].sort()))throw new AutomaticReviewError('review_result_invalid');
 return {decision,reasons,scores,policyVersion:AUTOMATIC_POLICY_VERSION,provider:AUTOMATIC_PROVIDER};
}
export function canRetryPhoto(day,stamp=Date.now()){
 return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&new Date(stamp).toISOString().slice(0,10)===day;
}
