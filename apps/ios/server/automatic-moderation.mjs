// DEMO/iOS ONLY. The operator policy and durable alarm own all AI verdicts.
// Client requests cannot approve images, submit scores, or extend a daily deadline.
import {createHash} from 'node:crypto';
import {automaticJobs,automaticSchema} from './automatic-jobs.mjs';
import {AUTOMATIC_POLICY,AUTOMATIC_POLICY_VERSION,AUTOMATIC_RETRY,canRetryPhoto} from './automatic-policy.mjs';
import {moderationConfig} from './human-moderation.mjs';
import {retractAutomaticPhoto} from './automatic-photo-state.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function automaticModeration({storage,store,images,core,publisher,ErrorClass,config,operatorConfig,review=false,notifications=false,schedule,analyze,now=()=>Date.now()}){
 automaticSchema(storage);const rows=(sql,...args)=>storage.sql.exec(sql,...args).toArray(),fail=(status,code)=>{throw new ErrorClass(status,code);};
 const operators=moderationConfig(operatorConfig,review)?.operators??[];
 const exists=member=>Boolean(rows("SELECT key FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=?",member).length);
 const live=actor=>{if(!actor?.account)fail(401,'unauthorized');const row=rows('SELECT data FROM rooms WHERE key=?','accounts/'+actor.account.username)[0];if(!row||JSON.parse(row.data).member!==actor.member)fail(401,'account_deleted');};
 const isObsolete=job=>job.kind==='icon'?!rows("SELECT icon_key FROM profile_icons WHERE icon_key=? AND member=? AND length(image)>0 AND status IN ('pending','provisional')",job.object_key.slice(5),job.member).length:!rows('SELECT queue_key FROM moderation_queue WHERE member=? AND photo_key=? AND source=?',job.member,job.object_key,job.source).length;
 function notice(job,result,targets){
  storage.sql.exec('INSERT OR IGNORE INTO moderation_notices VALUES(?,?,?,?,?,?,?,?,NULL)',hash('notice/'+job.review_key),job.review_key,job.member,job.kind,job.day,JSON.stringify(result.reasons),JSON.stringify(targets),new Date(now()).toISOString());
   if(notifications){const eventId=hash('automatic-result/'+job.review_key),stamp=now();storage.sql.exec('INSERT OR IGNORE INTO rooms VALUES(?,?,?)','push-events/'+eventId,JSON.stringify({eventId,kind:'moderation',day:job.day??new Date(stamp).toISOString().slice(0,10),recipients:[job.member],createdAt:stamp,expiresAt:stamp+86400000}),'1');}
 }
 async function applyDecision(job,result,current){
  if(!current())return;
  if(job.kind==='icon')return storage.transactionSync(()=>{
   if(!current())return;const key=job.object_key.slice(5),image=rows('SELECT * FROM profile_icons WHERE icon_key=? AND member=?',key,job.member)[0];if(!image||hash(image.image)!==job.source)return;
   if(!['provisional','pending'].includes(image.status))return;
   if(result.decision==='allow'){storage.sql.exec("DELETE FROM profile_icons WHERE member=? AND status='approved'",job.member);storage.sql.exec("UPDATE profile_icons SET status='approved',reviewed_at=?,reviewer=NULL WHERE icon_key=?",new Date(now()).toISOString(),key);}
   else{storage.sql.exec("UPDATE profile_icons SET image=?,status='rejected',reviewed_at=?,reviewer=NULL WHERE icon_key=?",Buffer.alloc(0),new Date(now()).toISOString(),key);notice(job,result,[]);}
  });
  if(result.decision==='reject'){
   const targets=await retractAutomaticPhoto({storage,store,images,job,current,now});
   if(targets!==false&&current())storage.transactionSync(()=>notice(job,result,targets));
  }
 }
 const jobs=automaticJobs({storage,config,now,schedule,analyze,isObsolete,applyDecision,loadImage:async job=>job.kind==='icon'?rows('SELECT image FROM profile_icons WHERE icon_key=? AND member=?',job.object_key.slice(5),job.member)[0]?.image:store.get(job.object_key,{type:'arrayBuffer'})});
 function retryPermission(body,actor){
  if(!body.retryNoticeKey)return body;
  if(typeof body.retryNoticeKey!=='string'||!/^[a-f0-9]{64}$/.test(body.retryNoticeKey))fail(400,'invalid');
  const item=rows('SELECT n.*,r.source FROM moderation_notices n JOIN automatic_reviews r ON n.review_key=r.review_key WHERE n.notice_key=? AND n.member=?',body.retryNoticeKey,actor.member)[0];
  if(!item||item.kind!=='photo'||body.day!==item.day)fail(403,'forbidden');if(!canRetryPhoto(item.day,now()))fail(409,'window_closed');
  return {...body,[AUTOMATIC_RETRY]:{member:actor.member,day:item.day,sources:[item.source],targets:JSON.parse(item.targets).map(v=>v.target)}};
 }
 async function publish(body,actor){
  const targets=body.action==='global.record'?['GLOBAL']:body.action==='reuse'?body.codes:[body.code];
  for(const target of targets??[]){
   const record=rows('SELECT * FROM moderation_queue WHERE member=? AND day=? AND target=?',actor.member,body.day,target)[0];if(!record||record.status==='rejected')continue;
   // Queue first. A process interruption cannot leave a public image without a review job.
   const job=await jobs.enqueue({member:actor.member,kind:'photo',source:record.source,objectKey:record.photo_key,day:record.day,consentVersion:body.automaticConsentVersion});
   if(job.result?.decision==='reject'){const latest=rows('SELECT * FROM automatic_reviews WHERE review_key=?',job.key)[0];await applyDecision(latest,job.result,()=>exists(actor.member));fail(409,'review_same_rejected_image');}
   if(record.status!=='approved')await publisher.publishForAutomatic(record);
   // A verdict may have arrived during an awaited image rebuild. Reapply it to the new target.
   const latest=rows('SELECT * FROM automatic_reviews WHERE review_key=?',job.key)[0];
   if(latest?.result&&JSON.parse(latest.result).decision==='reject')await applyDecision(latest,JSON.parse(latest.result),()=>Boolean(rows("SELECT key FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=?",actor.member).length));
  }
 }
 async function state(result,actor){
  const item=rows('SELECT q.status,r.status AS review_status,r.result FROM moderation_queue q LEFT JOIN automatic_reviews r ON r.member=q.member AND r.object_key=q.photo_key AND r.kind=\'photo\' WHERE q.member=? AND q.day=? AND q.target=? ORDER BY r.created_at DESC LIMIT 1',actor.member,result.day,result.code)[0];
  if(!item?.review_status)return result;
  return {...result,hasPhoto:item.status==='rejected'?false:result.hasPhoto,automaticReviewStatus:item.review_status,moderationStatus:item.status==='rejected'?'rejected':item.review_status==='complete'?undefined:'pending'};
 }
 return {drain:jobs.drain,configured:jobs.configured,async execute(body,actor,credential){
  if(!jobs.configured())return core(body,credential);
  if(!actor?.account&&!String(body.action).startsWith('automatic.')&&!['post','reuse','global.record','social.icon.submit'].includes(body.action))return core(body,credential);
  live(actor);
  if(body.action==='automatic.capabilities')return {enabled:true,operator:operators.includes(actor.account.username),policy:AUTOMATIC_POLICY,provisional:true};
  if(body.action==='automatic.status'){
   if(!operators.includes(actor.account.username))fail(403,'forbidden');
   return {policy:AUTOMATIC_POLICY,counts:rows('SELECT status,COUNT(*) AS count FROM automatic_reviews GROUP BY status'),errors:rows('SELECT review_key AS key,kind,day,error_code AS error,attempts,available_at AS retryAt FROM automatic_reviews WHERE error_code IS NOT NULL ORDER BY created_at DESC LIMIT 25')};
  }
  if(body.action==='automatic.notices')return {items:rows('SELECT notice_key AS key,kind,day,reasons,targets,created_at AS createdAt,read_at AS readAt FROM moderation_notices WHERE member=? ORDER BY created_at DESC,notice_key DESC LIMIT 100',actor.member).map(item=>({...item,reasons:JSON.parse(item.reasons),targets:JSON.parse(item.targets),canRetry:item.kind==='photo'&&canRetryPhoto(item.day,now()),deadline:item.day?new Date(Date.parse(item.day+'T00:00:00Z')+86400000).toISOString():null}))};
  if(body.action==='automatic.notice.read'){if(typeof body.key!=='string'||!/^[a-f0-9]{64}$/.test(body.key))fail(400,'invalid');storage.sql.exec('UPDATE moderation_notices SET read_at=? WHERE notice_key=? AND member=?',new Date(now()).toISOString(),body.key,actor.member);return {done:true};}
  const submitting=['post','reuse','global.record','social.icon.submit'].includes(body.action);
  if(submitting&&body.automaticConsentVersion!==AUTOMATIC_POLICY_VERSION)fail(400,'review_consent_required');
  body=retryPermission(body,actor);
  const result=await core(body,credential);
  if(['post','reuse','global.record'].includes(body.action)){await publish(body,actor);return body.action==='post'?state(await core({action:'state',code:body.code},credential),actor):{...result,moderationStatus:'pending'};}
  if(body.action==='social.icon.submit'){
   const image=rows('SELECT * FROM profile_icons WHERE icon_key=? AND member=?',result.key,actor.member)[0];if(!image)fail(409,'retry');
   await jobs.enqueue({member:actor.member,kind:'icon',source:hash(image.image),objectKey:'icon/'+image.icon_key,consentVersion:body.automaticConsentVersion});
   storage.sql.exec("UPDATE profile_icons SET status='provisional' WHERE icon_key=? AND member=? AND status='pending'",result.key,actor.member);return {...result,status:'pending',provisional:true};
  }
  if(body.action==='state')return state(result,actor);
  return result;
 }};
}
