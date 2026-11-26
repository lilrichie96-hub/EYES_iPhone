const {webkit,chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{sessionStorage.setItem('eyes.anyway','1');HavenDNA.adopt(778123,'QA-eye')});
 await page.reload({waitUntil:'domcontentloaded'});
 const ready=()=>page.waitForFunction(()=>EyesAbility.diagnostics().satellite&&EyesAbility.state()==='IDLE');
 await ready();
 assert.deepEqual(await page.evaluate(()=>EyesAbility.diagnostics().available),['vision','arcade','pocket','weather','contact','play']);
 const open=async id=>{await ready();await page.locator('#abilitySatellite').tap();await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN');await page.waitForTimeout(600);assert(await page.evaluate(()=>EyesAbility.diagnostics().wheel.fit),name+' six-ability layout');await page.locator('.ability-item[data-ability="'+id+'"]').tap()};
 for(let i=0;i<5;i++){await open('play');await page.waitForSelector('#eyesPlaytime');for(const id of ['firefly','catch','peekaboo','company']){await page.locator('.pt-chip[data-act="'+id+'"]').tap();await page.waitForFunction(id=>EyesPlaytime.active()===id,id);await page.mouse.move(195,420);await page.mouse.down();await page.mouse.move(230,380,{steps:6});await page.mouse.up();await page.locator('.pt-back').tap();await page.waitForFunction(()=>EyesPlaytime.active()==='pick')}await page.locator('.pt-close').tap();await ready();assert.equal(await page.locator('#eyesPlaytime').count(),0)}
 await open('play');await page.locator('.pt-chip[data-act="stare"]').tap();await page.waitForSelector('#stareMsg');await page.locator('#eyesPlay [data-done]').tap();await ready();
 for(let i=0;i<5;i++){await open('contact');await page.waitForSelector('#eyesContact',{state:'visible'});await page.evaluate(()=>EyesContact.close());await ready()}
 assert.equal(await page.evaluate(()=>HavenDNA.profile().name),'QA-eye');assert.deepEqual(errors,[]);console.log(name+' six abilities and repeated Play/Contact passed')
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exit(1)});
