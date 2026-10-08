// Mock only the external Google provider; verify actual signed tokens through the demo account service.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {accounts} from '../server/accounts.mjs';
import {googleVerifier} from '../server/google-identity.mjs';
import {memoryStore} from '../server/memory-store.mjs';
import {createAtelierService} from '../server/atelier-core.mjs';
const origin='http://localhost:8085',client='123456789-browser.apps.googleusercontent.com',store=memoryStore();
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='browser';
const auth=accounts(store,{googleClientId:client,verifyGoogle:googleVerifier(client,{keys:createLocalJWKSet({keys:[jwk]})})});
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{})});
await mkdir('test-results',{recursive:true});const errors=[];
async function context(){
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.exposeFunction('mockGoogleToken',async nonce=>new SignJWT({nonce,email:'browser@gmail.com',email_verified:true,name:'あさ'}).setProtectedHeader({alg:'RS256',kid:'browser'}).setSubject('browser-google-person').setIssuer('https://accounts.google.com').setAudience(client).setIssuedAt().setExpirationTime('5m').sign(privateKey));
 await ctx.addInitScript(()=>{
  let options;window.google={accounts:{'id':{initialize(value){options=value;},renderButton(element){const button=document.createElement('button');button.textContent='Googleで続行';button.onclick=async()=>{await options.callback({credential:await window.mockGoogleToken(window.googleInvalid?'wrong-nonce':options.nonce)});};element.append(button);},cancel(){},disableAutoSelect(){window.googleSignedOut=true;}}}};
 });
 await ctx.route('**/.netlify/functions/atelier',async route=>{
  const request=route.request(),body=request.postDataJSON(),credential=request.headers().authorization?.replace(/^Bearer /,'');
  try{let result;if(body.action.startsWith('account.'))result=await auth.execute(body,credential);else{const actor=await auth.identity(credential);result=await createAtelierService(store,{memberForCredential:()=>actor.member})(body,credential);}await route.fulfill({json:result});}
  catch(cause){await route.fulfill({status:cause.status??503,json:{error:cause.code??'unavailable'}});}
 });return ctx;
}
const ctx=await context(),page=await ctx.newPage();page.on('pageerror',cause=>errors.push(cause.message));
try{
 await page.goto(origin);await page.getByTestId('today-board').waitFor();
 await page.getByRole('button',{name:'Schiild',exact:true}).click();
 await page.getByRole('button',{name:'アカウントをつくる',exact:true}).first().click();
 await page.getByLabel('アカウントID',{exact:true}).fill('google_browser_member');await page.getByLabel('パスワード',{exact:true}).fill('browser-password-29');
 await page.locator('form').getByRole('button',{name:'アカウントをつくる',exact:true}).click();await page.getByText('@google_browser_member',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Googleで続行',exact:true}).waitFor();await page.evaluate(()=>{window.googleInvalid=true;});
 await page.getByRole('button',{name:'Googleで続行',exact:true}).click();await page.getByText('Googleの認証を確認できませんでした。もう一度ログインしてください。',{exact:true}).waitFor();
 await page.evaluate(()=>{window.googleInvalid=false;});await page.getByRole('button',{name:'Googleログインを再読み込みする',exact:true}).click();
 await page.getByRole('button',{name:'Googleで続行',exact:true}).click();await page.getByText('browser@gmail.com',{exact:true}).waitFor();
 assert.equal(await page.getByText('@google_browser_member',{exact:false}).count(),1);await page.screenshot({path:'test-results/google-account.png',fullPage:true});
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.getByRole('button',{name:'Googleで続行',exact:true}).waitFor();assert(await page.evaluate(()=>window.googleSignedOut));
 const otherCtx=await context(),other=await otherCtx.newPage();other.on('pageerror',cause=>errors.push(cause.message));await other.goto(origin);await other.getByTestId('today-board').waitFor();await other.getByRole('button',{name:'Schiild',exact:true}).click();
 await other.getByRole('button',{name:'Googleで続行',exact:true}).click();await other.getByText('@google_browser_member',{exact:false}).waitFor();await other.reload();await other.getByRole('button',{name:'Schiild',exact:true}).click();await other.getByText('browser@gmail.com',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Google sign-in button, invalid nonce recovery, existing account linkage, logout and cross-device session restoration: passed');
}catch(cause){await page.screenshot({path:'test-results/google-failure.png',fullPage:true});throw cause;}finally{await browser.close();}
