const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const engines=[['chromium',chromium],['webkit',webkit]];
  for(const [name,engine] of engines){
    const browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:40000});
    await page.waitForSelector('#eyesAbilityBeacon',{timeout:15000});
    await page.click('#eyesAbilityBeacon');
    const buttons=page.locator('#eyesAbilityChoices button');
    assert.equal(await buttons.count(),4,name+' ability wheel count');
    await page.getByRole('button',{name:/Pocket Dimension/}).click();
    assert.equal(await page.locator('.eyes-ability-surface').count(),1);
    await page.locator('#ep-note').click();
    page.once('dialog',d=>d.accept('First thought'));
    // Follow-up dialog handled in independent handler in separate page context.
    await page.locator('.ea-exit').click();
    await page.click('#eyesAbilityBeacon');
    await page.getByRole('button',{name:/Pocket Arcade/}).click();
    await page.waitForSelector('#ea-game');
    await page.locator('[data-dir="1"]').click();
    await page.locator('#ea-pause').click();
    assert.match(await page.locator('#ea-pause').textContent(),/Resume/);
    await page.locator('.ea-exit').click();
    await page.click('#eyesAbilityBeacon');
    await page.getByRole('button',{name:/Weather Organ/}).click();
    assert.equal(await page.locator('#ew-city').count(),1);
    await page.locator('.ea-exit').click();
    await page.click('#eyesAbilityBeacon');
    await page.getByRole('button',{name:/Vision/}).click();
    assert.equal(await page.locator('#ev-video').count(),1);
    await page.locator('.ea-exit').click();
    assert.equal(await page.locator('.eyes-ability-surface').count(),0);
    const relevant=errors.filter(x=>/eyes-ios|EyesIOSAbilities|Unexpected token|Cannot read properties/i.test(x));
    assert.deepEqual(relevant,[],name+' browser script errors');
    await browser.close();
    process.stdout.write(name+' iPhone abilities smoke test passed\n');
  }
})().catch(e=>{console.error(e);process.exit(1)});