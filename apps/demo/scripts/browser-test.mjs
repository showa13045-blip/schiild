import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.DEMO_BROWSER?{executablePath:process.env.DEMO_BROWSER}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});
const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
await mkdir('test-results',{recursive:true});
async function panel(){await page.getByRole('button',{name:'Schiild',exact:true}).click({clickCount:3});await page.getByRole('dialog').waitFor();}
try{
 await page.goto('http://localhost:8085');await page.getByTestId('today-board').waitFor();
 await page.getByRole('button',{name:'アーカイブ',exact:true}).click();assert.equal(await page.locator('.archive-grid button').count(),30);await page.screenshot({path:'test-results/archive.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'アトリエ',exact:true}).click();await page.screenshot({path:'test-results/home.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await page.getByRole('button',{name:'次へ',exact:true}).click();await page.locator('.shutter:not([disabled])').waitFor();await page.locator('.shutter').click();await page.getByText('今日のシールは一度きりです',{exact:true}).waitFor();
 await page.screenshot({path:'test-results/confirm.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'確定する',exact:true}).click();await page.locator('.posted').waitFor();await page.reload();await page.locator('.posted').waitFor();
 assert.equal(await page.locator('input[type=file]').count(),0);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('schiild.demo.ateliers.v2')).ateliers[0].state.count===10);await panel();await page.getByRole('button',{name:/次へ.*00:15 UTC/}).click();await page.getByTestId('reveal').waitFor();assert.equal(await page.locator('.reveal-board img').count(),0);
 await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));await page.getByRole('button',{name:'ひらく',exact:true}).last().click();
 await page.clock.runFor(119);assert.equal(await page.getByTestId('reveal').getAttribute('data-tiles'),'0');
 await page.clock.runFor(1);assert.equal(await page.getByTestId('reveal').getAttribute('data-tiles'),'1');
 await page.clock.runFor(2530);assert.equal(await page.getByTestId('reveal').getAttribute('data-tiles'),'12');assert.equal(await page.getByTestId('reveal').getAttribute('data-record'),'false');
 await page.clock.runFor(500);assert.equal(await page.getByTestId('reveal').getAttribute('data-record'),'true');assert.equal(await page.getByTestId('reveal').getAttribute('data-custody'),'false');
 await page.clock.runFor(1000);assert.equal(await page.getByTestId('reveal').getAttribute('data-custody'),'true');await page.clock.runFor(600);await page.screenshot({path:'test-results/reveal.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'GLOBAL SCHIILD',exact:true}).first().click();await page.locator('.pixel-link').click();await page.clock.runFor(3000);await page.screenshot({path:'test-results/global.png',fullPage:true,animations:'disabled'});assert.equal(await page.getByTestId('global-zoom').getAttribute('data-zoom'),'true');
 await panel();await page.getByRole('button',{name:'ゆきさんが預かります',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'ひらく',exact:true}).click();await page.clock.runFor(10);await page.locator('.reveal-board').click();await page.locator('.reveal-board').click();await page.clock.runFor(10);assert.equal(await page.getByTestId('reveal').getAttribute('data-custody'),'true');
 await page.getByRole('button',{name:'アーカイブ',exact:true}).click();assert.equal(await page.locator('.archive-grid button').count(),31);await page.locator('.archive-grid button').first().click();assert.equal(await page.getByTestId('reveal').getAttribute('data-tiles'),'12');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'アトリエ',exact:true}).click();await page.screenshot({path:'test-results/desktop.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith('http://localhost:8085/')||url.startsWith('data:')));console.log('Camera, confirmation, persistence, 30-day archive, three reveal beats, skip, replay, lottery, global zoom and no external requests: passed');
 const denied=await browser.newContext({viewport:{width:390,height:844}});const deniedPage=await denied.newPage();await deniedPage.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});await deniedPage.goto('http://localhost:8085');await deniedPage.getByRole('button',{name:'1日に1枚だけ',exact:true}).click();await deniedPage.getByRole('button',{name:'次へ',exact:true}).click();await deniedPage.getByText('カメラが使えません',{exact:true}).waitFor();await deniedPage.screenshot({path:'test-results/denied.png',fullPage:true,animations:'disabled'});console.log('Camera denial: passed');await denied.close();
}finally{await browser.close();}

