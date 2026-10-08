import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
const origin=process.env.DEMO_URL||'http://localhost:8085',username='leave_'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'})));
const [page,guest,other]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
for(const p of [page,guest,other])p.on('pageerror',e=>errors.push(e.message));
const row=(p,code)=>p.locator(`.atelier-row[data-code="${code}"]`);
const nav=p=>p.locator('.nav');
async function record(p){await p.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await p.getByRole('button',{name:'次へ',exact:true}).click();await p.locator('.shutter:not([disabled])').waitFor();await p.locator('.shutter').click();await p.getByRole('button',{name:'確定する',exact:true}).click();await p.locator('.posted').waitFor();}
async function join(p,url){await p.goto(url);await p.getByRole('heading',{name:'抜けても残る窓',exact:true}).waitFor();await p.getByRole('button',{name:'参加する',exact:true}).click();}
async function global(p){await nav(p).getByRole('button',{name:'GLOBAL SCHIILD',exact:true}).click();await p.locator('.global-overview img').waitFor();return p.locator('.global-overview img').getAttribute('src');}
try{
 await mkdir('test-results',{recursive:true});await page.goto(origin);await page.getByTestId('today-board').waitFor();await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await page.getByRole('button',{name:'アトリエをつくる',exact:true}).click();
 await page.getByPlaceholder('アトリエの名前').fill('抜けても残る窓');await page.getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).click();await page.locator('textarea').waitFor();
 const url=await page.locator('textarea').inputValue(),code=url.split('#atelier=')[1];
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByTestId('today-board').waitFor();await join(guest,url);await guest.getByTestId('today-board').waitFor();await record(page);await record(guest);
 const image=await global(page);
 await page.getByRole('button',{name:'Schiild',exact:true}).click();await page.getByRole('button',{name:'アカウントをつくる',exact:true}).first().click();await page.getByLabel('アカウントID',{exact:true}).fill(username);await page.getByLabel('パスワード',{exact:true}).fill(password);await page.locator('form').getByRole('button',{name:'アカウントをつくる',exact:true}).click();await page.getByText('@'+username,{exact:false}).waitFor();
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await row(page,code).waitFor();await page.screenshot({path:'test-results/atelier-leave.png',fullPage:true});
 await row(page,code).getByRole('button',{name:'アトリエを抜ける',exact:true}).click();await row(page,code).waitFor({state:'detached'});await page.reload();await page.getByTestId('today-board').waitFor();await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();assert.equal(await row(page,code).count(),0);
 assert.equal(await global(page),image);
 await guest.getByRole('button',{name:'シールトを生成する',exact:true}).waitFor({timeout:15000});assert.equal(await guest.locator('.today-tile.filled').count(),2);
 await join(other,url);await other.getByText('今日の投稿済み区画が残っているため、翌日から参加できます。',{exact:true}).waitFor();
 await guest.getByRole('button',{name:'シールトを生成する',exact:true}).click();await guest.getByRole('dialog').getByRole('button',{name:'シールトを生成する',exact:true}).click();await guest.getByRole('button',{name:'ひらく',exact:true}).last().click();await guest.getByTestId('reveal').locator('img').first().waitFor();const art=await guest.getByTestId('reveal').locator('img').first().getAttribute('src');
 await join(page,url);await page.getByRole('button',{name:'ひらく',exact:true}).waitFor();await page.getByRole('button',{name:'ひらく',exact:true}).click();await page.getByRole('button',{name:'ひらく',exact:true}).last().click();await page.getByTestId('reveal').locator('img').first().waitFor();assert.equal(await page.getByTestId('reveal').locator('img').first().getAttribute('src'),art);assert.equal(await global(page),image);
 // Remove this active membership again and log in on a separate browser.
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await row(page,code).getByRole('button',{name:'アトリエを抜ける',exact:true}).click();await row(page,code).waitFor({state:'detached'});
 await other.getByRole('button',{name:'Schiild',exact:true}).click();await other.getByLabel('アカウントID',{exact:true}).fill(username);await other.getByLabel('パスワード',{exact:true}).fill(password);await other.locator('form').getByRole('button',{name:'ログインする',exact:true}).click();await other.getByText('@'+username,{exact:false}).waitFor();await nav(other).getByRole('button',{name:'アトリエ',exact:true}).click();await other.getByRole('button',{name:'アトリエ ＋',exact:true}).click();assert.equal(await row(other,code).count(),0);
 // Leaving the final local atelier does not delete its sample history.
 await row(page,'ASADEMO1').getByRole('button',{name:'アトリエを抜ける',exact:true}).click();await row(page,'ASADEMO1').waitFor({state:'detached'});await nav(page).getByRole('button',{name:'GLOBAL SCHIILD',exact:true}).click();await page.getByTestId('global-page').waitFor();await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByRole('button',{name:'コードで参加する',exact:true}).click();await page.getByPlaceholder('8文字のコード').fill('ASADEMO1');await page.getByRole('heading',{name:'あさ',exact:true}).waitFor();await page.getByRole('button',{name:'参加する',exact:true}).click();await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.locator('.archive-work').first().waitFor();assert.equal(await page.locator('.archive-work').count(),30);
 assert.deepEqual(errors,[]);console.log('Leave from selection, preserved posted tiles/GLOBAL/artifacts, creator handoff, reserved daily slot, rejoin, account restoration, last atelier and local history: passed');
}finally{await browser.close();}
