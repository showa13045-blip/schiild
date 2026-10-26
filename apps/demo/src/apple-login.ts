// iOS distribution client only. Apple returns a proof, never a Schiild session.
import {sharedRequest,saveSession,clearAccountBrowser} from './shared-api';
import type {Account} from './shared-api';
import {t} from './copy';
export type AppleProof={identityToken:string;code:string;state:string;name?:string};
declare global {interface Window {schiildApple?:{signIn:(options:{state:string;nonce:string;intent:string})=>Promise<AppleProof>}}}
export const nativeAppleAvailable=()=>typeof window!=='undefined'&&Boolean(window.schiildApple);
export async function beginApple(intent:'login'|'register'|'delete',confirmUsername?:string){
 if(!window.schiildApple)throw Error(t('demo.line.unavailable').replaceAll('LINE','Apple'));
 const challenge=await sharedRequest<{state:string;nonce:string}>('account.apple.start',{intent,confirmUsername});
 const proof=await window.schiildApple.signIn({...challenge,intent});
 if(proof.state!==challenge.state)throw Error(t('demo.line.invalid').replaceAll('LINE','Apple'));
 const result=await sharedRequest<{token:string;account:Account}|{deleted:true}>('account.apple',proof);
 if('deleted' in result){clearAccountBrowser();return result;}
 saveSession(result.token);location.replace(location.pathname);return result;
}
