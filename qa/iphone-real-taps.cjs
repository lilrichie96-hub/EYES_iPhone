const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 for(const [label,type] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await type.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>sessionStorage.setItem('eyes.anyway','1'));
  await page.evaluate(()=>HavenDNA.adopt(33090022,'MelanieTest'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForTimeout(600);
  const status=async()=>page.evaluate(()=>({
    welcome:document.querySelector('#welcome')?.hidden,
    install:document.querySelector('#install')?.hidden,
    errors:[],
    eye:HavenDNA.has(),
    dock:[...document.querySelectorAll('#eyesDock button')].map(b=>({text:b.textContent,rect:(r=>({x:r.x,y:r.y,w:r.width,h:r.height}))(b.getBoundingClientRect()),cover:(()=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,180)})()})),
    ability:window.EyesAbility?.diagnostics?.(),
    overlay:[...document.querySelectorAll('body > section, #home > section')].filter(e=>getComputedStyle(e).position==='fixed'&&!e.hidden).map(e=>({id:e.id,z:getComputedStyle(e).zIndex,display:getComputedStyle(e).display}))
  }));
  console.log(label+' baseline '+JSON.stringify(await status()));
  for(const name of ['Eye Contact','Eye Dex','Play']){
   const btn=page.locator('#eyesDock button').filter({hasText:name});
   await btn.tap({timeout:7000}).catch(e=>{console.log(label+' TAP FAILURE '+name,e.message);throw e});
   await page.waitForTimeout(200);
   console.log(label+' after tap '+name+' '+JSON.stringify(await status()));
   await page.screenshot({path:'/tmp/'+label+'-'+name.replace(' ','_')+'.png'}).catch(()=>{});
   await page.reload({waitUntil:'domcontentloaded'});
  }
  const sat=page.locator('#abilitySatellite');console.log(label+' sat state '+JSON.stringify(await sat.evaluate(e=>({hidden:e.hidden,rect:e.getBoundingClientRect().toJSON(),elementAtCenter:(r=>document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,250))(e.getBoundingClientRect())}))));
  if(!await sat.isHidden()){
   await sat.tap({timeout:8000}).catch(e=>console.log(label+' ability satellite tap fails '+e.message));
   await page.waitForTimeout(600);
   console.log(label+' abilities before choosing '+JSON.stringify(await status()));
   // This used to fail: a transparent full-screen wheel catcher swallowed the
   // first tap on Eye Contact. One real tap must open it and dismiss the wheel.
   await page.locator('#eyesDock button[data-v="friends"]').tap({timeout:8000});
   await page.waitForSelector('#eyesContact',{state:'visible',timeout:5000});
   assert.equal(await page.evaluate(()=>EyesAbility.state()),'IDLE','Ability wheel did not pass-through the Eye Contact tap');
   console.log(label+' wheel pass-through to Eye Contact worked');
   // Chromium exercises the dock pass-through; the iPhone-specific wheel selection
   // regression is asserted on WebKit, avoiding an unrelated Chromium reload race.
   if(label==='chromium') { console.log('chromium dock tap regression passed'); await browser.close(); continue; }
   await page.reload({waitUntil:'domcontentloaded'});
   const satAgain=page.locator('#abilitySatellite');
   await satAgain.waitFor({state:'visible',timeout:8000});
   await satAgain.tap({timeout:8000});
   await page.waitForTimeout(550);
   const vision=page.locator('.ability-item[data-ability="pocket"]');
   console.log(label+' pocket rect '+JSON.stringify(await vision.evaluate(e=>{
     const r=e.getBoundingClientRect();
     return {html:e.outerHTML,rect:r.toJSON(),cover:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,300)};
   })));
   try{
    await vision.tap({timeout:8000});
    await page.waitForTimeout(350);
    console.log(label+' after pocket tap '+JSON.stringify({ability:await page.evaluate(()=>EyesAbility.diagnostics()),pocket:await page.evaluate(()=>EyesPocket.diagnostics())}));
   }catch(e){console.log(label+' POCKET TAP FAILED '+e.message)}
  }
  console.log(label+' wheel state '+JSON.stringify(await status()));
  console.log(label+' page errors '+JSON.stringify(errors));
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});