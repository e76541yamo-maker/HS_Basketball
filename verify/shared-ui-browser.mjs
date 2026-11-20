import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';

const browser=await chromium.launch(),url=process.env.COURTSIDE_URL||'http://localhost:3107';
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile-390',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,isMobile:name==='mobile-390',hasTouch:name==='mobile-390'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const shot=surface=>page.screenshot({path:'/home/ubuntu/shots/basketball-shared-'+name+'-'+surface+'.png'});
  await page.goto(url);await page.evaluate(()=>document.fonts.ready);
  await page.locator('#execute').waitFor();
  assert.equal(await page.locator('#analysis-details').getAttribute('open'),null);
  assert.equal(await page.locator('#plan-comparison tr').count(),3);
  assert.match(await page.locator('#plan-comparison').innerText(),/12 次配對推演/);
  assert.match(await page.locator('#plan-comparison').innerText(),/約略相同/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
  const fixed=await page.evaluate(()=>{
   const top=document.querySelector('#status-strip').getBoundingClientRect(),btn=document.querySelector('#execute').getBoundingClientRect();
   return {top:top.top,x:btn.x,y:btn.y,bottom:btn.bottom,scroll:scrollY,tappable:document.elementFromPoint(btn.x+btn.width/2,btn.y+btn.height/2)?.id};
  });
  assert.equal(fixed.top,0);assert.equal(fixed.scroll,0);assert.equal(fixed.tappable,'execute');assert.ok(fixed.bottom<=viewport.height);
  await shot('decision');
  await page.locator('#simulate').click();
  await page.getByText(/128 次配對推演/).waitFor({timeout:90000});
  assert.equal(await page.locator('#analysis-details').getAttribute('open'),null);
  await page.locator('#execute').click();
  assert.match(await page.locator('#feedback').innerText(),/本段回饋.*淨分.*主要事件.*下一個停點/s);
  await shot('segment');
  while(!await page.locator('#execute').isDisabled())await page.locator('#execute').click();
  assert.match(await page.locator('#review').innerText(),/賽後復盤.*終場 CLE 83 – 89 GSW/s);
  await shot('review');
  await page.locator('#tutorial').click();
  assert.match(await page.locator('#tutorial-content').innerText(),/開場要加快節奏嗎.*白話術語表/s);
  await shot('tutorial');
  await page.locator('#teach-possession').click();
  assert.match(await page.locator('#tutorial-content').innerText(),/最後 1:19.*搶投三分/s);
  await page.locator('#start-tutorial').click();
  assert.equal(await page.locator('#play-mode').inputValue(),'possession');
  assert.match(await page.locator('#status-strip').innerText(),/CLE 77 – 83 GSW.*CLE 勝率/s);
  await page.locator('#simulate').click();
  await page.getByText(/512 次配對推演/).waitFor({timeout:90000});
  assert.match(await page.locator('#plan-comparison').innerText(),/CLE 終場推演勝出比例.*95% 信賴區間/s);
  await page.locator('#execute').click();
  assert.match(await page.locator('#status-strip').innerText(),/GSW.*CLE 勝率/s);
  assert.deepEqual(errors,[]);
  console.log('SHARED UI PASS:',name,'fixed controls, three-plan previews and rollouts, feedback, review, both tutorials; console errors: 0');
  await page.close();
 }
}finally{await browser.close();}
