import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const origin=process.env.DEMO_URL||'http://localhost:8085';
const errors=[];
const first=await browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'});
const second=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await first.newPage(),guest=await second.newPage();
for(const p of [page,guest])p.on('pageerror',e=>errors.push(e.message));
async function manage(p){await p.getByRole('button',{name:'アトリエ ＋',exact:true}).click();}
async function advance(p){await p.getByRole('button',{name:'Schiild',exact:true}).click({clickCount:3});await p.getByRole('button',{name:/次へ.*00:15 UTC/}).click();}
try{
 await page.goto(origin);await manage(page);
 assert.equal(await page.getByRole('button',{name:'アトリエを削除する',exact:true}).count(),0);
 await page.getByRole('button',{name:/あさ.*CAPACITY/}).click();
 await page.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await page.getByRole('button',{name:'次へ',exact:true}).click();await page.locator('.shutter:not([disabled])').click();await page.getByRole('button',{name:'確定する',exact:true}).click();await page.locator('.posted').waitFor();await manage(page);
 await page.getByRole('button',{name:'アトリエをつくる',exact:true}).click();
 assert(await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).isDisabled());
 await page.getByPlaceholder('アトリエの名前').fill('午後の窓');await page.getByRole('button',{name:'5',exact:true}).click();
 assert.equal(await page.locator('.capacity-preview>div').count(),5);
 await page.screenshot({path:'test-results/atelier-create.png',fullPage:true});
 await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).click();
 const url=await page.locator('textarea').inputValue();assert(url.includes('#invite='));assert(!url.includes('creator'));
 await page.getByRole('button',{name:'戻る',exact:true}).click();assert.equal(await page.locator('.today-tile').count(),5);await page.locator('.posted').waitFor();
 assert(await page.evaluate(()=>{const a=JSON.parse(localStorage.getItem('schiild.demo.ateliers.v2')).ateliers;return a[0].state.photo===a[1].state.photo&&a[1].state.photo!==null;}));
 await page.reload();await page.getByRole('heading',{name:'午後の窓',exact:true}).waitFor();
 await guest.goto(url);await guest.getByRole('heading',{name:'午後の窓',exact:true}).waitFor();
 await guest.getByRole('button',{name:'参加する',exact:true}).click();
 await guest.getByText('参加すると、明日からあなたの区画が加わります。今日のシールトには反映されません。',{exact:true}).waitFor();
 assert.equal(await guest.getByRole('button',{name:'1日に1枚だけ',exact:true}).count(),0);
 await manage(guest);assert.equal(await guest.getByRole('button',{name:'アトリエを削除する',exact:true}).count(),0);
 await guest.getByRole('button',{name:/午後の窓.*CAPACITY/}).click();await advance(guest);await advance(guest);
 await guest.getByRole('button',{name:'1日に1枚だけ',exact:true}).waitFor();
 await manage(page);await page.screenshot({path:'test-results/atelier-list.png',fullPage:true});
 await page.getByRole('button',{name:'コードで参加する',exact:true}).click();await page.getByPlaceholder('8文字のコード').fill('ZZZZZZZZ');await page.getByRole('button',{name:'参加する',exact:true}).click();await page.getByText('このコードのアトリエは見つかりませんでした。',{exact:true}).waitFor();
 await page.getByPlaceholder('8文字のコード').fill(url);await page.getByRole('button',{name:'参加する',exact:true}).click();await page.getByText('すでに参加しています。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'戻る',exact:true}).click();await manage(page);
 await page.getByRole('button',{name:'アトリエを削除する',exact:true}).click();await page.getByRole('button',{name:'やめる',exact:true}).click();assert.equal(await page.locator('.atelier-row').count(),2);
 await page.getByRole('button',{name:'アトリエを削除する',exact:true}).click();await page.getByRole('button',{name:'削除する',exact:true}).click();assert.equal(await page.locator('.atelier-row').count(),1);
 await page.reload();assert.equal(await page.getByRole('heading',{name:'あさ',exact:true}).count(),1);
 await guest.reload();await guest.getByRole('heading',{name:'午後の窓',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Ateliers: creation, capacity, persistence, cross-context invitation, next-day participation, duplicate/invalid code, creator-only deletion and cancellation passed');
}finally{await browser.close();}
