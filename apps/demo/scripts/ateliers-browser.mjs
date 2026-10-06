import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const origin=process.env.DEMO_URL||'http://localhost:8085';
const errors=[];
const first=await browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'});
const second=await browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'});
const page=await first.newPage(),guest=await second.newPage();
for(const p of [page,guest])p.on('pageerror',e=>errors.push(e.message));
async function record(p){
 await p.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await p.getByRole('button',{name:'次へ',exact:true}).click();await p.locator('.shutter:not([disabled])').waitFor();await p.locator('.shutter').click();
 await p.getByText('今日のシールは一度きりです',{exact:true}).waitFor();await p.getByRole('button',{name:'確定する',exact:true}).click();await p.getByText('今日の1枚を記録しました。',{exact:true}).waitFor();
}
try{
 await page.goto(origin);await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await page.getByRole('button',{name:'アトリエをつくる',exact:true}).click();
 assert(await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).isDisabled());
 await page.getByPlaceholder('アトリエの名前').fill('ふたりの窓');await page.getByRole('button',{name:'2',exact:true}).click();
 await page.mouse.wheel(0,2000);await page.waitForFunction(()=>window.scrollY>0);
 await page.screenshot({path:'test-results/atelier-create.png',fullPage:true});
 await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).click();await page.locator('textarea').waitFor();
 const url=await page.locator('textarea').inputValue();assert(url.includes('#atelier='));assert(!url.includes('credential'));
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByText('参加 1人 ／ 定員 2人',{exact:true}).waitFor();
 await guest.goto(url);await guest.getByRole('heading',{name:'ふたりの窓',exact:true}).waitFor();await guest.getByRole('button',{name:'参加する',exact:true}).click();
 await guest.getByText('参加 2人 ／ 定員 2人',{exact:true}).waitFor();await guest.getByRole('button',{name:'1日に1枚だけ',exact:true}).waitFor();
 assert.equal(await guest.getByRole('button',{name:'シールトを生成する',exact:true}).count(),0);
 await record(page);await record(guest);await page.getByText('2 of 2 が今日を記録',{exact:true}).waitFor({timeout:15000});
 assert.equal(await page.locator('.today-tile.filled').count(),2);
 await page.getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByTestId('reveal').waitFor();
 await page.getByRole('button',{name:'ひらく',exact:true}).last().click();await page.getByTestId('reveal').locator('img').first().waitFor();
 const image=await page.getByTestId('reveal').locator('img').first().getAttribute('src');
 await guest.getByRole('button',{name:'ひらく',exact:true}).waitFor({timeout:15000});await guest.getByRole('button',{name:'ひらく',exact:true}).click();await guest.getByRole('button',{name:'ひらく',exact:true}).last().click();
 assert.equal(await guest.getByTestId('reveal').locator('img').first().getAttribute('src'),image);
 assert.equal(await guest.locator('input[type=file]').count(),0);
 await page.screenshot({path:'test-results/shared-reveal.png',fullPage:true});await guest.screenshot({path:'test-results/shared-guest.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'ひらく',exact:true}).waitFor();await page.getByRole('button',{name:'ひらく',exact:true}).click();assert.equal(await page.getByTestId('reveal').getAttribute('data-tiles'),'2');
 const outsider=await browser.newContext(),outside=await outsider.newPage();await outside.goto(url);await outside.getByRole('heading',{name:'ふたりの窓',exact:true}).waitFor();await outside.getByRole('button',{name:'参加する',exact:true}).click();await outside.getByText('このアトリエは定員に達しています。',{exact:true}).waitFor();await outsider.close();
 assert.deepEqual(errors,[]);console.log('Mobile document scrolling, shared creation, invitation, immediate participation, two camera uploads, synchronization, creator generation, identical persisted artifacts, reopen and capacity checks passed');
}finally{await browser.close();}
