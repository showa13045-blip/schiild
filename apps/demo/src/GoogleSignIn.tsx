// DEMO ONLY. Google returns an ID token; Cloudflare validates it and issues a demo session.
import React,{useEffect,useRef,useState} from 'react';
import {sharedRequest} from './shared-api';
import {t} from './copy';
type GoogleIdentity={initialize:(options:Record<string,unknown>)=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void;cancel:()=>void;disableAutoSelect:()=>void};
declare global{interface Window{google?:{accounts:{'id':GoogleIdentity}}}}
let loading:Promise<GoogleIdentity>|undefined;
function loadGoogle(){
 if(window.google?.accounts['id'])return Promise.resolve(window.google.accounts['id']);
 if(loading)return loading;
 loading=new Promise<GoogleIdentity>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  const timer=setTimeout(()=>finish(),15000);
  function finish(){clearTimeout(timer);if(window.google?.accounts['id'])resolve(window.google.accounts['id']);else{script.remove();loading=undefined;reject(Error(t('demo.google.unavailable')));}}
  script.onload=finish;script.onerror=finish;document.head.appendChild(script);
 });return loading;
}
export function googleLogout(){window.google?.accounts['id'].disableAutoSelect();}
export default function GoogleSignIn({linkedEmail,disabled,onAuthenticate}:{linkedEmail?:string;disabled:boolean;onAuthenticate:(idToken:string)=>Promise<void>}){
 const target=useRef<HTMLDivElement>(null),authenticate=useRef(onAuthenticate),locked=useRef(disabled),processing=useRef(false);
 authenticate.current=onAuthenticate;locked.current=disabled;
 const [visible,setVisible]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(linkedEmail)return;
  const controller=new AbortController();let disposed=false,identity:GoogleIdentity|undefined;
  setError('');setPending(false);
  async function prepare(){try{
   const config=await sharedRequest<{enabled:boolean;clientId?:string;nonce?:string}>('account.google.start',{},controller.signal);
   if(disposed)return;if(!config.enabled){setVisible(false);return;}setVisible(true);
   identity=await loadGoogle();if(disposed||!target.current)return;
   identity.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,button_auto_select:false,use_fedcm_for_button:true,color_scheme:'light',ux_mode:'popup',callback:async(response:{credential:string})=>{
    if(disposed||processing.current||locked.current)return;processing.current=true;setPending(true);setError('');
    try{await authenticate.current(response.credential);}catch(cause){if(!disposed){setError(cause instanceof Error?cause.message:t('demo.google.invalid'));target.current?.replaceChildren();}}
    finally{processing.current=false;if(!disposed)setPending(false);}
   }});
   target.current.replaceChildren();identity.renderButton(target.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',locale:'ja',width:Math.max(200,Math.min(320,target.current.clientWidth||window.innerWidth-64))});
  }catch(cause){if(!disposed){setVisible(true);setError(cause instanceof Error?cause.message:t('demo.google.unavailable'));}}}
  void prepare();return()=>{disposed=true;controller.abort();identity?.cancel();target.current?.replaceChildren();};
 },[attempt,linkedEmail]);
 if(linkedEmail)return <div className="google-auth"><p>{t('demo.google.linked')}</p><p className="google-email">{linkedEmail}</p></div>;
 return <div className="google-auth" hidden={!visible}>
  <p>{t('demo.google.title')}</p><p className="shared-note">{t('demo.google.note')}</p>
  <div ref={target} data-testid="google-sign-in" aria-busy={pending} style={{pointerEvents:disabled||pending?'none':'auto',opacity:(disabled||pending)?0.5:1}}/>
  {pending&&<p role="status">{t('common.loading')}</p>}
  {error&&<><p className="error" role="alert">{error}</p><button className="button secondary" disabled={disabled||pending} onClick={()=>setAttempt(value=>value+1)}>{t('demo.google.retry')}</button></>}
 </div>;
}
