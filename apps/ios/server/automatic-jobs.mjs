// DEMO/iOS ONLY. Durable review jobs; no in-memory fire-and-forget approval.
import {createHash,randomBytes} from 'node:crypto';
import {AUTOMATIC_POLICY_VERSION,AutomaticReviewError} from './automatic-policy.mjs';
import {readAutomaticConfig,analyzeImage} from './automatic-provider.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function automaticSchema(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS automatic_reviews (review_key TEXT PRIMARY KEY, member TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, object_key TEXT NOT NULL, day TEXT, policy_version TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL, lease_token TEXT, created_at TEXT NOT NULL, completed_at TEXT, result TEXT, error_code TEXT, UNIQUE(member,kind,object_key,policy_version))');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS automatic_reviews_due ON automatic_reviews(status,available_at,lease_until)');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS moderation_notices (notice_key TEXT PRIMARY KEY, review_key TEXT NOT NULL UNIQUE, member TEXT NOT NULL, kind TEXT NOT NULL, day TEXT, reasons TEXT NOT NULL, targets TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)');
 storage.sql.exec('CREATE INDEX IF NOT EXISTS moderation_notices_member ON moderation_notices(member,created_at)');
}
export function eraseAutomaticReviews(storage,member){automaticSchema(storage);storage.sql.exec('DELETE FROM automatic_reviews WHERE member=?',member);storage.sql.exec('DELETE FROM moderation_notices WHERE member=?',member);if(storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='automatic_image_refs'").toArray().length)storage.sql.exec('DELETE FROM automatic_image_refs WHERE logical_key LIKE ?','photos/'+member+'/%');}
export function automaticJobs({storage,config,loadImage,applyDecision,isObsolete=()=>false,analyze=analyzeImage,schedule=async()=>{},now=()=>Date.now()}){
 automaticSchema(storage);const rows=(sql,...args)=>storage.sql.exec(sql,...args).toArray();
 const live=member=>Boolean(rows("SELECT key FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=?",member).length);
 const configured=()=>Boolean(readAutomaticConfig(config)?.enabled);
 async function enqueue({member,kind,source,objectKey,day=null,consentVersion}){
  if(!configured())throw new AutomaticReviewError('review_not_configured');
  if(!/^[a-f0-9]{64}$/.test(member)||!['photo','icon'].includes(kind)||!/^[a-f0-9]{64}$/.test(source)||typeof objectKey!=='string'||objectKey.length>256||consentVersion!==AUTOMATIC_POLICY_VERSION)throw new AutomaticReviewError('review_consent_required');
  if(!live(member))throw new AutomaticReviewError('review_account_deleted');
  const key=hash(JSON.stringify([member,kind,objectKey,AUTOMATIC_POLICY_VERSION]));
  storage.sql.exec("INSERT OR IGNORE INTO automatic_reviews VALUES(?,?,?,?,?,?,?,'queued',0,?,0,NULL,?,NULL,NULL,NULL)",key,member,kind,source,objectKey,day,AUTOMATIC_POLICY_VERSION,now(),new Date(now()).toISOString());
  const job=rows('SELECT * FROM automatic_reviews WHERE review_key=?',key)[0];
  if(job.status!=='complete')await schedule(Math.max(now()+50,job.available_at));
  return {key,status:job.status,result:job.result?JSON.parse(job.result):null};
 }
 async function drain(limit=2){
  if(!configured())return null;
  let handled=0;
  while(handled++<limit){
   const lease=randomBytes(16).toString('hex');
   const job=storage.transactionSync(()=>{
    const item=rows("SELECT * FROM automatic_reviews WHERE status<>'complete' AND available_at<=? AND lease_until<=? ORDER BY available_at,created_at,review_key LIMIT 1",now(),now())[0];if(!item)return null;
    if(!live(item.member)){storage.sql.exec('DELETE FROM automatic_reviews WHERE review_key=?',item.review_key);return {gone:true};}
    storage.sql.exec("UPDATE automatic_reviews SET status=?,attempts=attempts+?,lease_token=?,lease_until=? WHERE review_key=?",item.result?'applying':'running',item.result?0:1,lease,now()+90000,item.review_key);return {...item,attempts:item.attempts+(item.result?0:1),lease_token:lease};
   });
   if(!job)break;if(job.gone)continue;
   const current=()=>rows('SELECT * FROM automatic_reviews WHERE review_key=? AND lease_token=?',job.review_key,lease)[0];
   try{
    if(isObsolete(job)){storage.sql.exec("UPDATE automatic_reviews SET status='complete',completed_at=?,lease_until=0,lease_token=NULL WHERE review_key=? AND lease_token=?",new Date(now()).toISOString(),job.review_key,lease);continue;}
    let result=job.result?JSON.parse(job.result):null;
    if(!result){const bytes=await loadImage(job);if(!bytes)throw new AutomaticReviewError('review_image_missing');result=await analyze(Buffer.from(bytes),config);}
    if(!current()||!live(job.member))continue;
    storage.sql.exec("UPDATE automatic_reviews SET status='applying',result=?,error_code=NULL WHERE review_key=? AND lease_token=?",JSON.stringify(result),job.review_key,lease);
    // Persist the decision before applying it. Recovery never needs another AI call.
    await applyDecision(job,result,()=>Boolean(current()&&live(job.member)));
    if(current())storage.sql.exec("UPDATE automatic_reviews SET status='complete',completed_at=?,lease_until=0,lease_token=NULL,error_code=NULL WHERE review_key=? AND lease_token=?",new Date(now()).toISOString(),job.review_key,lease);
   }catch(error){
    if(!current())continue;
    const delay=Math.max(error instanceof AutomaticReviewError?error.retryAfterMs:30000,Math.min(3600000,30000*2**Math.min(6,Math.max(0,job.attempts-1))));
    storage.sql.exec("UPDATE automatic_reviews SET status=?,available_at=?,lease_until=0,lease_token=NULL,error_code=? WHERE review_key=? AND lease_token=?",current().result?'decided':'retry',now()+delay,error instanceof AutomaticReviewError?error.code:'review_apply_failed',job.review_key,lease);
   }
  }
  const next=rows("SELECT MIN(MAX(available_at,lease_until)) AS next FROM automatic_reviews WHERE status<>'complete'")[0]?.next;
  if(next!==null&&next!==undefined){const stamp=Math.max(now()+1000,next);await schedule(stamp);return stamp;}return null;
 }
 return {enqueue,drain,configured};
}
