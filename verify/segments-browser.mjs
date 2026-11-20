import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true}),errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1080}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside.possession.2015.v3')));
const url=process.env.COURTSIDE_URL||'http://localhost:3107';
try{
 const openAnalysis=()=>page.locator('#analysis-details:not([open]) > summary').click();
 await page.goto(url);assert.equal(await page.locator('#play-mode').inputValue(),'segment');
 await page.locator('.start-panel > summary').click();
 assert.equal(await page.locator('[data-segment]').count(),8);assert.match(await page.locator('#situation').innerText(),/第一階段/);
 for(const team of ['CLE','GSW']){
  await page.locator('#coach-team').selectOption(team);await page.locator('[data-segment="0"]').click();
  let decisions=0;
  while(!await page.locator('#execute').isDisabled()&&decisions<60){await page.locator('#execute').click();decisions++;}
  const s=(await read()).state;assert.equal(s.phase,'final');assert.deepEqual(s.score,{CLE:83,GSW:89});
  console.log('SEGMENT HISTORICAL UI:',team,decisions,'decisions; CLE 83–GSW 89; final');
  await page.locator('#review-restart').click();
 }
 await page.locator('[data-segment="0"]').click();await page.locator('#coach-team').selectOption('CLE');
 const start=(await read()).state;
 await page.locator('#coach-tempo').selectOption('push');await page.locator('#coach-defense').selectOption('blitz');
 const target=await page.locator('#coach-target option').nth(1).getAttribute('value');await page.locator('#coach-target').selectOption(target);
 await page.locator('#coach-timeout').check();
 await page.locator('#coach-lineup-details > summary').click();
 const selected=page.locator('[data-coach-player]:checked');const out=await selected.first().getAttribute('data-coach-player');
 await page.locator('[data-coach-player="'+out+'"]').uncheck();assert.equal(await page.locator('#execute').isDisabled(),true);
 const incoming=await page.locator('[data-coach-player]:not(:checked):not(:disabled)').last().getAttribute('data-coach-player');
 await page.locator('[data-coach-player="'+incoming+'"]').check();assert.equal(await page.locator('#execute').isDisabled(),false);
 await openAnalysis();await page.locator('#value-model').selectOption('impact');await page.locator('#wp-model').selectOption('brownian');
 assert.equal(await page.locator('.model-table tbody tr').count(),3);assert.equal(await page.locator('.model-table thead th').count(),7);
 await page.reload();await openAnalysis();await page.locator('.start-panel > summary').click();assert.equal(await page.locator('#coach-tempo').inputValue(),'push');assert.equal(await page.locator('#coach-defense').inputValue(),'blitz');assert.equal(await page.locator('#coach-target').inputValue(),target);
 await page.locator('#simulate').click();await page.locator('.segment-histogram').waitFor({timeout:120000});
 assert.equal(await page.locator('[data-segment-remedy]').count(),4);assert.match(await page.locator('.simulation-result').innerText(),/百分位/);
 await page.locator('[data-segment-remedy]').first().click();
 await page.locator('#simulate').click();await page.locator('.segment-histogram').waitFor({timeout:120000});
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'/home/ubuntu/shots/basketball-segment.png',fullPage:true});
 await page.locator('#branch').click();await page.locator('#execute').click();
 let s=(await read()).state;assert.equal(s.mode,'simulation');assert.equal(s.timeouts.CLE,start.timeouts.CLE-1);assert.ok(s.turn>start.turn+1);
 await page.locator('#undo').click();assert.equal((await read()).state.mode,'replay');
 await page.locator('[data-branch="0"]').click();await page.locator('[data-coach-action="run"]').click();await page.locator('#execute').click();
 let turns=0;
 while(!await page.locator('#execute').isDisabled()&&turns++<150){
  if(await page.locator('[data-coach-action="run"]').count())await page.locator('[data-coach-action="run"]').click();
  else if(await page.locator('[data-action]:not([data-action="replay"])').count())await page.locator('[data-action]:not([data-action="replay"])').first().click();
  await page.locator('#execute').click();
 }
 assert.equal((await read()).state.phase,'final');console.log('SEGMENT ALTERNATIVE UI: complete simulated game');
 await page.locator('#review-restart').click();
 await page.locator('[data-segment-clutch]').click();
 if((await read()).state.possession==='CLE')await page.locator('#execute').click();
 assert.equal((await read()).state.possession,'GSW');assert.equal(await page.locator('#clock-call').isDisabled(),true);
 const opponentDefense=(await read()).state.plans.GSW.defense;
 await page.locator('#simulate').click();await page.locator('[data-remedy]').first().waitFor({timeout:120000});
 assert.match(await page.locator('.simulation-result').innerText(),/視角 CLE/);
 assert.match(await page.locator('.risk').first().innerText(),/對手得分/);
 await page.locator('[data-remedy]').first().click();
 const remedied=(await read()).state;assert.equal(remedied.plans.GSW.defense,opponentDefense);assert.equal(remedied.plans.CLE.defense,remedied.coach.defense);
 console.log('SEGMENT CLUTCH REMEDY: managed CLE perspective; applying remedy preserves GSW defense');
 await page.locator('[data-segment-clutch]').click();
 if((await read()).state.possession==='CLE')await page.locator('#execute').click();
 assert.equal(await page.locator('#defense-call').isEnabled(),true);await page.locator('#defense-call').selectOption('intentional');
 await page.locator('#execute').click();assert.equal((await read()).state.mode,'simulation');
 console.log('SEGMENT CLUTCH UI: trailing managed defense exposes and executes intentional foul');
 await page.locator('[data-segment="0"]').click();await page.setViewportSize({width:390,height:844});
 await page.locator('#coach-tempo').selectOption('slow');await page.locator('#simulate').click();await page.locator('.segment-histogram').waitFor({timeout:120000});
 await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/home/ubuntu/shots/basketball-segment-mobile.png',fullPage:true});
 await page.locator('[data-segment="0"]').click();await page.locator('[data-coach-action="replay"]').click();
 await page.locator('#play-mode').selectOption('possession');
 await page.locator('[data-action="transition"]').click();await page.locator('#execute').click();
 assert.equal((await read()).state.mode,'simulation');assert.equal((await read()).state.coach.execute,'replay');
 await page.locator('#play-mode').selectOption('segment');
 assert.equal(await page.locator('[data-coach-action="replay"]').count(),0);
 assert.equal(await page.locator('[data-coach-action="run"]').evaluate(el=>el.classList.contains('selected')),true);
 const expected=await page.evaluate(async()=>{
  const {runSegment}=await import('/src/segments.js');return runSegment(JSON.parse(localStorage.getItem('courtside.possession.2015.v3')).state);
 });
 await page.locator('#execute').click();const continued=(await read()).state;
 assert.equal(continued.mode,'simulation');assert.deepEqual(continued.score,expected.score);assert.deepEqual(continued.timeouts,expected.timeouts);assert.equal(continued.clock,expected.clock);
 console.log('SEGMENT MODE SWITCH: stale replay choice continues simulation without overwriting branch score/resources');
 await page.locator('#play-mode').selectOption('possession');await page.reload();assert.equal(await page.locator('#play-mode').inputValue(),'possession');
 assert.deepEqual(errors,[]);
 console.log('SEGMENT BROWSER PASS: both teams / history / coached full game / lineup / tempo / target / timeout / models / histogram / remedies / undo / branches / reload / mobile / persisted mode; console errors: 0');
}finally{await browser.close();}
