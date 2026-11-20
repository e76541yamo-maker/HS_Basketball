import assert from 'node:assert/strict';
import {chromium} from '../../HS-BaseSta/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.COURTSIDE_URL||'http://localhost:3108');
 await page.locator('#coach-tempo').selectOption('push');
 await page.locator('#analysis-details > summary').click();
 await page.locator('#analysis .analysis-context').filter({hasText:/12 次配對推演/}).waitFor();
 await page.locator('#simulate').click();
 await page.getByText('區段淨分分布・估計 128 次').waitFor();
 assert.match(await page.locator('#simulation').innerText(),/淨分 0\.35/);
 assert.match(await page.locator('#analysis').innerText(),/區段平均淨分 0\.35 分（128 次配對推演）/);
 assert.doesNotMatch(await page.locator('#analysis').innerText(),/12 次配對推演|1\.58/);
 const submitted=page.waitForRequest(r=>r.url().endsWith('/api/analyze'));
 await page.locator('#rewrite').click();
 const payload=(await submitted).postDataJSON();
 assert.match(payload.points.pro[0],/0\.35 分（128 次配對推演）/);
 await page.locator('#ai-points').getByText(/0\.35 分（128 次配對推演）/).waitFor();
 assert.equal(await page.locator('#source').innerText(),'Claude');
 console.log('LIVE CLAUDE UI PASS: 推進 128 次配對推演；區段平均淨分 0.35 分 matches the displayed rollout');
}finally{await browser.close();}
