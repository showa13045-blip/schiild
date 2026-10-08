import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.DEMO_URL||'http://localhost:8085';
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:390,height:844},permissions:['camera'],reducedMotion:'reduce'})));
const [page,guest]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
for(const current of [page,guest])current.on('pageerror',error=>errors.push(error.message));
const nav=p=>p.locator('.nav');
async function record(p){await p.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await p.getByRole('button',{name:'次へ',exact:true}).click();await p.locator('.shutter:not([disabled])').waitFor();await p.locator('.shutter').click();await p.getByRole('button',{name:'確定する',exact:true}).click();await p.locator('.posted').waitFor();}
async function preview(p,n){await p.getByRole('button',{name:'今日のシールトを仮生成する',exact:true}).click();await p.getByTestId('draft-preview').waitFor();await p.getByText(`仮生成時の投稿 ${n}枚`,{exact:false}).waitFor();return p.locator('.draft-art').getAttribute('src');}
async function back(p){await p.getByRole('button',{name:'アトリエに戻る',exact:true}).click();await p.getByTestId('today-board').waitFor();}
try{
 await mkdir('test-results',{recursive:true});await page.goto(origin);await page.getByTestId('today-board').waitFor();
 const before=await page.evaluate(()=>localStorage.getItem('schiild.demo.ateliers.v2'));await preview(page,2);await page.getByText('ひとりで試すアトリエでは、サンプルの参加者の写真も使います。',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('schiild.demo.ateliers.v2')),before);
 await page.reload();await page.getByTestId('today-board').waitFor();assert.equal(await page.getByTestId('draft-preview').count(),0);await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.locator('.archive-work').first().waitFor();assert.equal(await page.locator('.archive-work').count(),30);await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();
 await page.getByRole('button',{name:'アトリエ ＋',exact:true}).click();await page.getByRole('button',{name:'アトリエをつくる',exact:true}).click();await page.getByPlaceholder('アトリエの名前').fill('仮生成の窓');await page.getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'このアトリエをつくる',exact:true}).click();await page.locator('textarea').waitFor();const url=await page.locator('textarea').inputValue();
 await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();await page.getByTestId('today-board').waitFor();assert.equal(await page.getByRole('button',{name:'今日のシールトを仮生成する',exact:true}).isDisabled(),true);
 await guest.goto(url);await guest.getByRole('heading',{name:'仮生成の窓',exact:true}).waitFor();await guest.getByRole('button',{name:'参加する',exact:true}).click();await guest.getByTestId('today-board').waitFor();await record(page);
 const first=await preview(page,1);await page.screenshot({path:'test-results/draft-shared.png',fullPage:true});await back(page);
 await guest.getByRole('button',{name:'今日のシールトを仮生成する',exact:true}).waitFor();await guest.waitForFunction(()=>!document.querySelector('.draft-actions .button')?.disabled);assert.equal(await preview(guest,1),first);await back(guest);await record(guest);
 await page.waitForFunction(()=>document.querySelectorAll('.today-tile.filled').length===2);const second=await preview(page,2);assert.notEqual(second,first);await back(page);
 await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.getByRole('heading',{name:'アーカイブ',exact:true}).waitFor();assert.equal(await page.locator('.archive-row').count(),0);await nav(page).getByRole('button',{name:'アトリエ',exact:true}).click();
 // A preview failure stays on today's screen and shows no replacement image.
 await page.route('**/*atelier',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='draft')await route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':new URL(origin).origin},json:{error:'generation_failed'}});else await route.continue();});await page.getByRole('button',{name:'今日のシールトを仮生成する',exact:true}).click();await page.getByRole('alert').filter({hasText:'仮生成できませんでした。'}).waitFor();assert.equal(await page.locator('.draft-art').count(),0);assert.equal(await page.locator('.today-tile.filled').count(),2);await page.unroute('**/*atelier');
 await preview(page,2);await page.reload();await page.getByTestId('today-board').waitFor();assert.equal(await page.locator('.draft-art').count(),0);assert.equal(await page.locator('.today-tile.filled').count(),2);
 await page.getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'シールトを生成する',exact:true}).click();await page.getByTestId('reveal').waitFor();await page.getByRole('button',{name:'ひらく',exact:true}).last().click();await page.getByTestId('reveal').locator('img').first().waitFor();assert.equal(await page.getByTestId('reveal').locator('img').first().getAttribute('src'),second);
 await nav(page).getByRole('button',{name:'アーカイブ',exact:true}).click();await page.locator('.archive-row').waitFor();assert.equal(await page.locator('.archive-row').count(),1);assert.deepEqual(errors,[]);
 console.log('Temporary local/shared previews, non-creator access, repeat with new posts, untouched archives, failure recovery, reload discard and formal generation: passed');
}finally{await browser.close();}
