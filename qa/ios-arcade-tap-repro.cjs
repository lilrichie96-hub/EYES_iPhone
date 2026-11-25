const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
    const browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
    const page=await context.newPage(),exceptions=[];
    page.on('pageerror',e=>exceptions.push(e.message));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{sessionStorage.setItem('eyes.anyway','1');HavenDNA.adopt(778123,'QA-eye')});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.EyesAbility?.diagnostics?.().satellite && window.EyesArcade && document.getElementById('abilitySatellite')&&!document.getElementById('abilitySatellite').hidden,{timeout:15000});
    const sat=page.locator('#abilitySatellite');await sat.tap();
    await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN'&&document.querySelector('.ability-item[data-ability="arcade"]'),{timeout:3000});
    // EARLY TAP: call exactly the visible Arcade button before unfolding finishes.
    await page.evaluate(()=>document.querySelector('.ability-item[data-ability="arcade"]').click());
    assert.equal(await page.evaluate(()=>EyesAbility.owner()),'arcade',name+': first Arcade tap discarded');
    await page.waitForFunction(()=>EyesAbility.state()==='ARCADE_ACTIVE'&&EyesArcade.diagnostics().game?.phase==='title',{timeout:12000});
    assert(await page.locator('#arcadeCanvas').count()===1,'missing original Tunnelbug canvas');
    assert(await page.locator('#arcadeReturnToEye').isVisible(),'no safe exit from Arcade');
    await page.locator('#arcadeReturnToEye').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:6000});
    await page.locator('#eyesDock button[data-v="friends"]').tap();
    await page.waitForSelector('#eyesContact',{state:'visible',timeout:6000});
    console.log(name+' early satellite->Arcade->real Tunnelbug->Return->Eye Contact PASSED');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>EyesAbility?.diagnostics?.().satellite,{timeout:10000});
    // NETWORK FAILURE: make original Tunnelbug script unavailable. The opening
    // stage must release touches and restore the same Eye automatically.
    await page.route('**/tunnelbug.js',route=>route.abort('failed'));
    await page.locator('#abilitySatellite').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN'&&document.querySelector('.ability-item[data-ability="arcade"]'),{timeout:3000});
    await page.evaluate(()=>document.querySelector('.ability-item[data-ability="arcade"]').click());
    await page.waitForFunction(()=>EyesAbility.state()==='IDLE'&&EyesAbility.owner()===null,{timeout:8000});
    await page.locator('#eyesDock button[data-v="friends"]').tap();
    await page.waitForSelector('#eyesContact',{state:'visible',timeout:6000});
    assert.equal(await page.evaluate(()=>HavenDNA.profile().name),'QA-eye','Eye identity changed');
    assert.deepEqual(exceptions,[],name+' uncaught errors');
    console.log(name+' failed asset->no frozen screen->Eye Contact->identity PASSED');
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
