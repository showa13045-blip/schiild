// DEMO ONLY. Reconcile tabs and pages restored by Android Chrome's back/forward cache.
import {isReviewMode} from './review-mode.ts';
import {ACCOUNT_ERASE_EVENT} from './account-storage.ts';
export function watchAccountLifecycle({target,document,readSession,onChange,onResume,onErase}:{target:Window;document:Document;readSession:()=>string|null;onChange:()=>void;onResume:()=>void;onErase?:()=>void}){
 let session=readSession();
 function check(){const next=readSession();if(next!==session){session=next;onChange();return true;}return false;}
 const storage=(event:StorageEvent)=>{if(isReviewMode&&event.key!==null&&!event.key.startsWith('schiild.review.'))return;const key=isReviewMode&&event.key?event.key.slice('schiild.review.'.length):event.key;if(key===ACCOUNT_ERASE_EVENT&&event.newValue&&!readSession()){session=null;onErase?.();return;}if(key===null||key==='schiild.account.session.v2')check();};
 const resume=()=>{if(document.visibilityState==='visible'&&!check())onResume();};
 const pageshow=(event:PageTransitionEvent)=>{if(event.persisted)resume();};
 target.addEventListener('storage',storage);target.addEventListener('pageshow',pageshow);target.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
 return ()=>{target.removeEventListener('storage',storage);target.removeEventListener('pageshow',pageshow);target.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
}
