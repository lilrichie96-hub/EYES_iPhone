const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
   const page=await context.newPage(), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>{sessionStorage.setItem('eyes.anyway','1');HavenDNA.adopt(778123,'QA-eye')});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.EyesAbility?.diagnostics?.().satellite&&window.EyesArcade&&window.EyesPocket,{timeout:15000});
   const ids=await page.evaluate(()=>EyesAbility.diagnostics().available);
   // No reload or programmatic interrupt between these cycles: use the exact exit Melanie uses.
   for(let cycle=0;cycle<4;cycle++){
    const sat=page.locator('#abilitySatellite');
    await sat.waitFor({state:'visible'});
    const sr=await sat.boundingBox();
    await page.mouse.move(sr.x+sr.width/2,sr.y+sr.height/2);
    await page.mouse.down();await page.waitForTimeout(300);
    assert(await sat.isVisible(),name+' satellite vanished during held press');
    await page.mouse.up();
    await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN');
    await page.waitForTimeout(500);
    await page.locator('.ability-item[data-ability="arcade"]').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='ARCADE_ACTIVE'&&EyesArcade.diagnostics().game?.phase==='title',null,{timeout:15000});
    if(cycle===1){
      await page.getByRole('button',{name:'Play',exact:true}).tap();
      await page.waitForFunction(()=>EyesArcade.diagnostics().game?.phase==='playing',null,{timeout:10000});
      const stick=await page.locator('#arcadeStick').boundingBox();
      await page.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);
      await page.mouse.down();await page.mouse.move(stick.x+stick.width/2+15,stick.y+stick.height/2);await page.mouse.up();
    }
    await page.locator('#arcadeReturnToEye').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='IDLE'&&EyesAbility.owner()===null);
    assert(await page.locator('#arcade').isHidden());
    assert.equal(await page.evaluate(()=>document.querySelector('#home').classList.contains('arcade-owned')),false);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('arcade-open')),false);
    await sat.waitFor({state:'visible'});
    console.log(name+' real Arcade exit/reopen cycle '+(cycle+1)+' passed');
   }
   for(const id of ['arcade','pocket','weather',...(ids.includes('vision')?['vision']:[])]){
    assert(ids.includes(id),name+' missing '+id);
    await page.locator('#abilitySatellite').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN');
    await page.waitForTimeout(600);
    const item=page.locator('.ability-item[data-ability="'+id+'"]');
    const rect=await item.boundingBox();assert(rect);
    // Real down/up with a 250ms hold spans multiple paint frames. Then tap path separately.
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>EyesAbility.state()),'WHEEL_OPEN',name+' '+id+' wheel closed on pointerdown');
    await page.mouse.up();
    await page.waitForFunction(id=>EyesAbility.owner()===id,id,{timeout:5000});
    if(id==='arcade')await page.waitForFunction(()=>EyesAbility.state()==='ARCADE_ACTIVE'&&EyesArcade.diagnostics().game?.phase==='title',null,{timeout:15000});
    if(id==='pocket')await page.waitForFunction(()=>EyesAbility.state()==='POCKET_ACTIVE',null,{timeout:10000});
    if(id==='weather')await page.waitForFunction(()=>EyesAbility.state()==='WEATHER_ACTIVE',null,{timeout:10000});
    await page.evaluate(()=>EyesAbility.interrupt('qa'));
    await page.waitForFunction(()=>EyesAbility.state()==='IDLE');
    await page.waitForTimeout(500);
    await page.locator('#abilitySatellite').tap();
    await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN');
    await page.waitForTimeout(600);
    await item.tap();
    await page.waitForFunction(id=>EyesAbility.owner()===id,id,{timeout:5000});
    await page.evaluate(()=>EyesAbility.interrupt('qa'));
    await page.waitForFunction(()=>EyesAbility.state()==='IDLE');
    await page.waitForTimeout(500);
    console.log(name+' '+id+' held press and real touch tap passed');
   }
   await page.locator('#abilitySatellite').tap();
   await page.waitForFunction(()=>EyesAbility.state()==='WHEEL_OPEN');
   await page.locator('#eyesDock button[data-v="friends"]').tap();
   await page.waitForSelector('#eyesContact',{state:'visible'});
   assert.equal(await page.evaluate(()=>EyesAbility.state()),'IDLE');
   assert.equal(await page.evaluate(()=>HavenDNA.profile().name),'QA-eye');
   assert.deepEqual(errors,[]);
  } finally {await browser.close()}
 }
})().catch(e=>{console.error(e);process.exit(1)});
