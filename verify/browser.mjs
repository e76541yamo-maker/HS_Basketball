import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1080}});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside.2002.v1')));
try {
  await page.goto('http://localhost:3000');
  await page.locator('[data-moment="start"]').click();
  await page.locator('[data-action^="pass:"]').first().click();
  const before=await read();
  await page.locator('#execute').click();
  let saved=await read();
  assert.equal(saved.state.turn,1); assert.notEqual(saved.state.handler,before.state.handler);
  await page.locator('#undo').click(); assert.equal((await read()).state.turn,0);
  await page.locator('#branch').click(); assert.equal((await read()).branches.length,1);
  await page.locator('#resources [data-player="LAL0"]').click();
  await page.locator('#player-dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#player-detail').innerText(),/25.2/);
  await page.locator('#close-player').click();
  await page.locator('[data-timeout="LAL"]').click(); assert.equal((await read()).state.timeouts.LAL,5);
  await page.locator('#resources .bench').first().locator('summary').click();
  await page.locator('#resources .bench').first().locator('[data-player]').first().click();
  await page.locator('#sub-in').click(); assert.notDeepEqual((await read()).state.lineups.LAL,before.state.lineups.LAL);
  await page.locator('[data-layer="offense"]').selectOption('motion');
  await page.locator('[data-action="post"]').click();
  await page.locator('#execute').click(); assert.equal((await read()).state.sets.LAL,'motion');
  await page.reload(); assert.equal((await read()).state.turn,1);
  await page.locator('[data-load="0"]').click(); assert.equal((await read()).state.turn,0);

  // Real UI clicks only; localStorage is read, never injected.
  await page.locator('[data-moment="start"]').click();
  let turns=0;
  while(!(await page.locator('#execute').isDisabled()) && turns<1500) {
    if(turns%4===0) await page.locator('[data-action^="pass:"]').first().click();
    else if(turns%4===1) await page.locator('[data-action="screen"]').click();
    else if(turns%4===2) await page.locator('[data-action="drive"]').click();
    else await page.locator('[data-action="three"]').click();
    const old=(await read()).state;
    await page.locator('#execute').click();
    const now=(await read()).state;
    assert.equal(now.turn,old.turn+1); assert.ok(now.elapsed>old.elapsed);
    for(const t of ['LAL','SAC']) assert.ok(now.score[t]>=old.score[t]&&now.score[t]-old.score[t]<=4);
    turns++;
  }
  saved=await read(); assert.equal(saved.state.phase,'final'); assert.notEqual(saved.state.score.LAL,saved.state.score.SAC); assert.equal(saved.state.clock,0);
  console.log(`FULL GAME: ${turns} UI decisions; Q${saved.state.quarter}; LAL ${saved.state.score.LAL} – SAC ${saved.state.score.SAC}; final`);
  await page.screenshot({path:'/home/ubuntu/shots/basketball-full-game.png',fullPage:true});

  await page.locator('[data-moment="g4"]').click();
  await page.locator('[data-layer="offense"]').selectOption('triangle');
  await page.locator('[data-action="three"]').click();
  await page.locator('#analysis .argument').first().locator('summary').first().click();
  await page.locator('#simulate').click();
  await page.locator('.simulation-result').waitFor({timeout:30000});
  assert.match(await page.locator('.simulation-result').innerText(),/80 次完整比賽/);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'/home/ubuntu/shots/basketball-desktop.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-moment="ot"]').click();
  await page.locator('#resources [data-player="SAC3"]').click();
  await page.locator('#player-dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#player-detail').innerText(),/Mike Bibby/);
  await page.locator('#close-player').click();
  await page.locator('#execute').click();
  assert.equal((await read()).state.turn,1);
  await page.locator('[data-moment="g4"]').click();
  await page.locator('[data-action="three"]').click();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/home/ubuntu/shots/basketball-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('BROWSER PASS: pass / undo / branch / reload / player popover / substitution / timeout / manager layers / worker / full game / mobile; console errors: 0');
  console.log('SCREENSHOTS: /home/ubuntu/shots/basketball-desktop.png /home/ubuntu/shots/basketball-mobile.png /home/ubuntu/shots/basketball-full-game.png');
} finally { await browser.close(); }
