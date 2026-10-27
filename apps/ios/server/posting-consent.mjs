import {POSTING_POLICY_VERSION,postingActions} from './posting-policy.mjs';
export async function acceptPostingPolicy(storage,body,auth,credential,ErrorClass){
 if(!postingActions.has(body.action))return;
 if(body.policyVersion!==POSTING_POLICY_VERSION)throw new ErrorClass(409,'posting_rules_required');
 const actor=await auth.identity(credential);if(!actor.account||!actor.sessionKey)throw new ErrorClass(401,'unauthorized');
 storage.sql.exec('CREATE TABLE IF NOT EXISTS posting_consents (member TEXT PRIMARY KEY, version TEXT NOT NULL, accepted_at TEXT NOT NULL)');
 storage.sql.exec('INSERT INTO posting_consents (member,version,accepted_at) VALUES (?,?,?) ON CONFLICT(member) DO UPDATE SET version=excluded.version,accepted_at=excluded.accepted_at',actor.member,POSTING_POLICY_VERSION,new Date().toISOString());
}
export function removeDeletedConsents(storage){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS posting_consents (member TEXT PRIMARY KEY, version TEXT NOT NULL, accepted_at TEXT NOT NULL)');
 storage.sql.exec("DELETE FROM posting_consents WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE key LIKE 'accounts/%' AND json_extract(data,'$.member')=posting_consents.member)");
}
