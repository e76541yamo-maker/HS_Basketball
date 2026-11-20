import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true}),errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1080}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside.tracking.2015.v2')));
try {
 await page.goto('http://localhost:3000');await page.locator('[data-moment="start"]').click();
 await page.locator('#branch').click();const before=(await read()).state;
 assert.equal(await page.locator('.court-player').count(),10);
 await page.locator('[data-action^="pass:"]').first().click();await page.locator('#execute').click();
 let s=(await read()).state;assert.equal(s.mode,'simulation');assert.equal(s.turn,1);assert.notEqual(s.handler,before.handler);
 await page.locator('#undo').click();assert.equal((await read()).state.mode,'replay');
 await page.reload();assert.equal((await read()).state.turn,0);
 await page.locator('#resources [data-player]').first().click();await page.locator('#player-dialog').waitFor({state:'visible'});assert.match(await page.locator('#player-detail').innerText(),/實際・傳球目標分布/);await page.locator('#close-player').click();
 await page.locator('[data-branch="0"]').click();
 let decisions=0;
 while(!await page.locator('#execute').isDisabled()&&decisions<1600) {
  const old=(await read()).state;await page.locator('#execute').click();s=(await read()).state;
  assert.equal(s.turn,old.turn+(old.recordKind==='hold'?1:0));assert.ok(s.elapsed>=old.elapsed);assert.equal(s.mode,'replay');
  for(const t of ['CLE','GSW'])assert.ok(s.score[t]>=old.score[t]&&s.score[t]-old.score[t]<=3);
  decisions++;
 }
 assert.equal(s.phase,'final');assert.deepEqual(s.score,{CLE:83,GSW:89});
 console.log(`FULL HISTORICAL GAME: ${decisions} UI decisions; Q${s.quarter}; CLE ${s.score.CLE} – GSW ${s.score.GSW}; final`);
 await page.screenshot({path:'/home/ubuntu/shots/basketball-full-game.png',fullPage:true});
 await page.locator('[data-moment="key3"]').click();await page.locator('[data-action="shoot"]').click();assert.ok(await page.locator('#analysis .argument').nth(1).locator('.fact-chip').first().isVisible());
 await page.locator('#simulate').click();await page.locator('.simulation-result').waitFor({timeout:120000});assert.match(await page.locator('.simulation-result').innerText(),/實際動作模型/);assert.match(await page.locator('.simulation-result').innerText(),/6\.2%/);for(const risk of await page.locator('.risk').all()){const labels=await risk.locator('[data-remedy]').allTextContents();assert.ok(new Set(labels.map(s=>s.match(/終場分差 ([−\d.-]+)/)?.[1])).size>1);}console.log('ENDGAME UI: '+(await page.locator('.simulation-result').innerText()).replaceAll('\n',' | '));
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'/home/ubuntu/shots/basketball-desktop.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-remedy]').first().click();assert.equal((await read()).state.mode,'simulation');assert.ok((await read()).state.defensePlan);
 while(!await page.locator('#execute').isDisabled()) {await page.locator('[data-action="drive"]').click();await page.locator('#execute').click();}
 assert.equal((await read()).state.phase,'final');console.log('ALTERNATIVE: post-risk defensive remedy branch played to final');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-moment="key3"]').click();await page.locator('#resources [data-player]').last().click();await page.locator('#player-dialog').waitFor({state:'visible'});await page.locator('#close-player').click();await page.locator('[data-action="drive"]').click();
 await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/home/ubuntu/shots/basketball-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('BROWSER PASS: tracked positions / replay full game / alternative pass / undo / branches / reload / player distributions / worker / ranked risk remedy branch / mobile; console errors: 0');
 console.log('SCREENSHOTS: /home/ubuntu/shots/basketball-desktop.png /home/ubuntu/shots/basketball-mobile.png /home/ubuntu/shots/basketball-full-game.png');
} finally {await browser.close();}
