import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true}),errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1080}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside.possession.2015.v3')));
try{
 await page.goto('http://localhost:3000');await page.locator('[data-moment="start"]').click();
 await page.locator('#branch').click();const before=(await read()).state;
 await page.locator('.tracking-view summary').click();assert.equal(await page.locator('.court-player').count(),10);
 await page.locator('#track-next').click();assert.equal((await read()).state.turn,before.turn);assert.equal((await read()).state.cursor,before.cursor);
 await page.locator('[data-action="roll"]').click();assert.ok((await page.locator('#distribution').innerText()).includes('估計'));
 await page.locator('#clock-call').selectOption('hold');await page.locator('#defense-call').selectOption('blitz');
 await page.locator('#execute').click();let s=(await read()).state;assert.equal(s.mode,'simulation');assert.ok(s.turn>=1);
 await page.locator('#undo').click();assert.equal((await read()).state.mode,'replay');
 await page.reload();assert.equal((await read()).state.turn,0);
 await page.locator('#resources [data-player]').first().click();assert.ok(await page.locator('#player-dialog').isVisible());assert.match(await page.locator('#player-detail').innerText(),/年度平均得分/);await page.locator('#close-player').click();
 await page.locator('#timeout').click();assert.equal((await read()).state.timeouts.CLE,7);await page.locator('#undo').click();
 const oldLineup=(await read()).state.lineups.CLE;
 await page.locator('#substitute').click();assert.notDeepEqual((await read()).state.lineups.CLE,oldLineup);await page.locator('#undo').click();
 await page.locator('[data-branch="0"]').click();
 let decisions=0,automatic=0,inside=0;const reasons=new Set();
 while(!await page.locator('#execute').isDisabled()&&decisions<300){
  const old=(await read()).state;old.decisionReasons.forEach(x=>reasons.add(x));
  await page.locator('#execute').click();s=(await read()).state;
  assert.ok(s.turn>=old.turn);assert.equal(s.mode,'replay');
  if(s.turn>old.turn+1)automatic++;if(s.turn===old.turn)inside++;
  for(const t of ['CLE','GSW'])assert.ok(s.score[t]>=old.score[t]);
  decisions++;
 }
 assert.equal(s.phase,'final');assert.equal(s.turn,193);assert.deepEqual(s.score,{CLE:83,GSW:89});assert.equal(s.clock,0);assert.ok(automatic>0&&inside>0);
 for(const reason of ['節次開始','進球','犯規','換人窗口','暫停','違例'])assert.ok(reasons.has(reason),reason);
 console.log('FULL HISTORICAL GAME: '+decisions+' UI manager windows; 193 possessions; CLE 83 – GSW 89; final; automatic runs '+automatic+'; same-possession dead-ball windows '+inside);
 await page.screenshot({path:'/home/ubuntu/shots/basketball-full-game.png',fullPage:true});
 await page.locator('[data-moment="key3"]').click();s=(await read()).state;assert.deepEqual(s.score,{CLE:77,GSW:83});assert.equal(s.clock,79);
 assert.equal(await page.locator('#team-state .lineup button').count(),10);assert.ok(await page.locator('.foul-trouble').count()>0);
 await page.locator('[data-action="spotup"]').click();assert.ok(await page.locator('#analysis .argument').nth(1).locator('.fact-chip').first().isVisible());
 await page.locator('#simulate').click();await page.locator('.simulation-result').waitFor({timeout:120000});assert.match(await page.locator('.simulation-result').innerText(),/實際選擇代理模型/);
 assert.ok(await page.locator('[data-remedy]').count()>0);
 for(const risk of await page.locator('.risk').all()){const labels=await risk.locator('[data-remedy]').allTextContents();assert.ok(new Set(labels.map(s=>s.match(/終場分差 ([−\d.-]+)/)?.[1])).size>1);}
 console.log('ENDGAME UI: '+(await page.locator('.simulation-result').innerText()).replaceAll('\n',' | '));
 await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/home/ubuntu/shots/basketball-desktop.png',fullPage:true});
 await page.locator('[data-remedy]').first().click();assert.equal((await read()).state.mode,'simulation');
 let branchTurns=0;
 while(!await page.locator('#execute').isDisabled()&&branchTurns<200){await page.locator('#execute').click();branchTurns++;}
 assert.equal((await read()).state.phase,'final');console.log('ALTERNATIVE: risk-remedy possession branch played to final');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-moment="key3"]').click();await page.locator('[data-action="transition"]').click();
 await page.locator('#resources [data-player]').last().click();assert.ok(await page.locator('#player-dialog').isVisible());await page.locator('#close-player').click();
 await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/home/ubuntu/shots/basketball-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('BROWSER PASS: complete possession replay / every dead-ball type / final-five decisions / actual and simulated auto-advance / tracking steps do not advance turns / play types / clock and defense layers / timeout / substitutions / foul-trouble lineups / undo / branches / reload / player popovers / worker / ranked remedies / mobile; console errors: 0');
 console.log('SCREENSHOTS: /home/ubuntu/shots/basketball-desktop.png /home/ubuntu/shots/basketball-mobile.png /home/ubuntu/shots/basketball-full-game.png');
}finally{await browser.close();}
