import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
const origin=process.env.DEMO_URL||'http://localhost:8085',username='test_'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'})));
const [page,guest,other]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
for(const current of [page,guest,other]){
 current.on('pageerror',error=>errors.push(error.message));
 current.on('response',async response=>{if(response.url().includes('/api/atelier')&&response.status()>=400){let code;try{code=(await response.json()).error;}catch{code='invalid_response';}console.log('API error',response.status(),code);}});
}
const nav=p=>p.locator('.nav');
async function global(p){assert.equal(await nav(p).getByRole('button',{name:'GLOBAL SCHIILD',exact:true}).count(),1);await nav(p).getByRole('button',{name:'GLOBAL SCHIILD',exact:true}).click();await p.getByTestId('global-page').waitFor();}
async function account(p){await p.getByRole('button',{name:'Schiild',exact:true}).click();await p.getByRole('heading',{name:'わたし',exact:true}).waitFor();}
async function record(p){await p.getByRole('button',{name:'このアトリエに1日1枚',exact:true}).click();await p.getByRole('button',{name:'次へ',exact:true}).click();await p.locator('.shutter:not([disabled])').waitFor();await p.locator('.shutter').click();await p.getByRole('button',{name:'確定する',exact:true}).click();await p.locator('.posted').waitFor();}
async function create(p,name){await p.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await p.getByRole('button',{name:'アトリエをつくる',exact:true}).click();await p.getByPlaceholder('アトリエの名前').fill(name);await p.getByRole('button',{name:'2',exact:true}).click();await p.getByRole('button',{name:'このアトリエをつくる',exact:true}).click();await p.locator('textarea').waitFor();return p.locator('textarea').inputValue();}
try{
 await mkdir('test-results',{recursive:true});await page.goto(origin);await page.getByTestId('today-board').waitFor();
 await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.locator('.archive-grid .archive-work').first().waitFor();assert.equal(await page.locator('.archive-grid article').count(),30);
 await page.locator('.archive-global').first().click();await page.locator('.sample-note').waitFor();assert.equal(await page.getByTestId('global-page').getAttribute('data-day'),await page.locator('.global-page h1').innerText().then(value=>value.replaceAll(' / ','-')));
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();
 const url=await create(page,'確認用の窓');await global(page);await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();
 await guest.goto(url);await guest.getByRole('heading',{name:'確認用の窓',exact:true}).waitFor();await guest.getByRole('button',{name:'参加する',exact:true}).click();await guest.getByTestId('today-board').waitFor();
 await record(page);await record(guest);
 await global(page);await page.locator('.global-overview img').waitFor();const common=await page.locator('.global-overview img').getAttribute('src');const day=await page.getByTestId('global-page').getAttribute('data-day');
 await page.locator('.pixel-link').click();assert.equal(await page.getByTestId('global-zoom').getAttribute('data-zoom'),'true');
 await global(guest);await guest.locator('.global-overview img').waitFor();assert.equal(await guest.locator('.global-overview img').getAttribute('src'),common);
 await other.goto(origin);await other.getByTestId('today-board').waitFor();await global(other);await other.locator('.global-overview img').waitFor();assert.equal(await other.locator('.global-overview img').getAttribute('src'),common);assert.equal(await other.locator('.pixel-link').count(),0);
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByTestId('reveal').waitFor();await page.getByRole('button',{name:'ひらく',exact:true}).last().click();
 await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.locator('.archive-global').click();assert.equal(await page.getByTestId('global-page').getAttribute('data-day'),day);
 await nav(guest).getByRole('button',{name:'アーカイブ',exact:true}).click();await guest.locator('.archive-global').waitFor({timeout:15000});await guest.locator('.archive-global').click();await guest.locator('.global-overview img').waitFor();assert.equal(await guest.locator('.global-overview img').getAttribute('src'),common);
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByRole('button',{name:'コードを共有する',exact:true}).click();await page.locator('textarea').waitFor();await global(page);
 await account(page);await page.getByRole('button',{name:'アカウントをつくる',exact:true}).first().click();await page.getByLabel('アカウントID',{exact:true}).fill(username);await page.getByLabel('表示名',{exact:true}).fill('確認用');await page.getByLabel('パスワード',{exact:true}).fill(password);await page.locator('form').getByRole('button',{name:'アカウントをつくる',exact:true}).click();await page.getByText('@'+username,{exact:false}).waitFor();
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByLabel('開封・ズームの演出を省略する',{exact:true}).check();await page.reload();await account(page);await page.getByRole('button',{name:'設定',exact:true}).click();assert(await page.getByLabel('開封・ズームの演出を省略する',{exact:true}).isChecked());
 await page.screenshot({path:'test-results/account-settings.png',fullPage:true});await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.getByRole('button',{name:'ログインする',exact:true}).last().waitFor();
 await account(other);await other.getByLabel('アカウントID',{exact:true}).fill(username);await other.getByLabel('パスワード',{exact:true}).fill(password);await other.locator('form').getByRole('button',{name:'ログインする',exact:true}).click();await other.getByText('@'+username,{exact:false}).waitFor();
 await nav(other).getByRole('button',{name:'アトリエ',exact:true}).click();await other.getByRole('button',{name:'ひらく',exact:true}).waitFor();await other.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await other.getByRole('button',{name:/あさ/}).first().click();await global(other);await other.locator('.pixel-link').waitFor();assert.equal(await other.locator('.global-overview img').getAttribute('src'),common);
 await other.screenshot({path:'test-results/global-shared.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Date-specific archive GLOBAL, samples, shared image for other custodians/outsiders, persistent navigation after sharing/switching, account registration/logout/cross-device restoration, persisted settings: passed');
}catch(error){console.log('Visible errors',await page.locator('[role=alert],[role=status]').allTextContents());await page.screenshot({path:'test-results/account-global-failure.png',fullPage:true});throw error;}finally{await browser.close();}
