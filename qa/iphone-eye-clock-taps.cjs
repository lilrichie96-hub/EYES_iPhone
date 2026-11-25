const {webkit,chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage(),exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{sessionStorage.setItem('eyes.anyway','1');HavenDNA.adopt(7700123,'TestEye')});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.EyesAbility && window.EyesSocial && document.getElementById('coreHit')?.onclick,{timeout:10000});
  assert(await page.evaluate(()=>HavenDNA.profile().name==='TestEye'));
  await page.locator('#clock').tap();
  assert.equal(await page.locator('#eyesIOSClockCard').count(),1,name+': clock click did not open panel');
  assert.match(await page.locator('#eyesIOSClockCard').textContent(),/iPhone Clock app/);
  await page.locator('#eyesIOSClockCard button').tap();
  assert.equal(await page.locator('#eyesIOSClockCard').count(),0);
  await page.locator('#coreHit').tap();
  await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN',{timeout:6000});
  await page.waitForSelector('.ability-item[data-ability="pocket"]',{state:'visible',timeout:8000});
  await page.locator('.ability-item[data-ability="pocket"]').tap();
  await page.waitForFunction(()=>EyesAbility.owner()==='pocket',{timeout:7000});
  await page.evaluate(()=>EyesAbility.interrupt('test'));
  await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:7000});
  await page.locator('#eyesDock button[data-v="friends"]').tap();
  await page.waitForSelector('#eyesContact',{state:'visible',timeout:6000});
  const dna=await page.evaluate(()=>HavenDNA.profile());
  assert.equal(dna.name,'TestEye');
  assert.deepEqual(exceptions,[],name+' errors');
  console.log(name+': clock, Eye, real Pocket wheel, bottom Eye Contact, preserved Eye all PASSED');
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});