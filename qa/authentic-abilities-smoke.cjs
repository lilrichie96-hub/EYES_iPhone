const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('verification',{recursive:true});
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
  const page=await ctx.newPage();
  const exceptions=[];
  page.on('pageerror',e=>exceptions.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error'&&/Uncaught|TypeError|ReferenceError/.test(m.text()))exceptions.push(m.text())});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.HavenDNA&&window.Haven&&window.EyesAbility&&window.EyesArcade&&window.EyesPocket&&window.EyesWeather&&window.EyesVision,{timeout:18000});
  await page.evaluate(()=>HavenDNA.adopt(123456789,'TestEye'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.EyesAbility&&window.HavenDNA?.has?.(),{timeout:18000});
  const data=await page.evaluate(()=>({
   available:EyesAbility.diagnostics().available,
   host:typeof Haven.abilityHost==='function',
   art:typeof window.EyesArcade==='object',
   web:!!window.EYES_WEB,
   io:!!window.EYES_IOS_ABILITIES
  }));
  assert(data.io&&data.web&&data.host&&data.art,JSON.stringify(data));
  for(const id of ['arcade','pocket','weather'])assert(data.available.includes(id),engineName+' missing '+id+': '+JSON.stringify(data.available));
  if(engineName==='chromium')assert(data.available.includes('vision'),'Vision should be available when browser camera API exists');
  await page.waitForTimeout(500);
  await page.screenshot({path:'verification/'+engineName+'-idle.png'});
  const launch=async(name,waitFor)=>{
   const r=await page.evaluate(id=>EyesAbility.launch(id),name);
   assert.equal(r,true,'Failed launching '+name+' on '+engineName+' '+JSON.stringify(await page.evaluate(()=>EyesAbility.diagnostics())));
   await page.waitForFunction(id=>EyesAbility.owner()===id,waitFor,{timeout:10000});
  };
  await launch('arcade','arcade');
  await page.waitForFunction(()=>window.TunnelbugCore&&window.EyesArcade?.diagnostics?.().loaded.includes('tunnelbug.js'),{timeout:15000});
  await page.waitForTimeout(2500);
  const a=await page.evaluate(()=>({state:EyesArcade.diagnostics().state,game:EyesArcade.diagnostics().game,canvas:!!document.querySelector('#arcade canvas'),wheel:EyesAbility.diagnostics().state}));
  assert(a.canvas&&a.game,engineName+' original Tunnelbug did not start: '+JSON.stringify(a));
  await page.screenshot({path:'verification/'+engineName+'-tunnelbug.png'});
  await page.evaluate(()=>EyesAbility.interrupt('qa-switch'));
  await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:8000});
  await launch('pocket','pocket');
  await page.waitForTimeout(1800);
  assert(await page.locator('#pocket').count()===1,engineName+' original Pocket DOM absent');
  const pocket=await page.evaluate(()=>EyesPocket.diagnostics());
  assert(pocket.state==='POCKET_ACTIVE'||pocket.state==='POCKET_OPENING',JSON.stringify(pocket));
  await page.screenshot({path:'verification/'+engineName+'-pocket.png'});
  await page.evaluate(()=>EyesAbility.interrupt('qa-switch'));
  await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:8000});
  await launch('weather','weather');
  await page.waitForTimeout(1600);
  await page.evaluate(()=>EyesWeather._debug.preview('storm',true,1));
  await page.waitForTimeout(1200);
  assert(await page.locator('#weather').count()===1,engineName+' original Weather DOM absent');
  await page.screenshot({path:'verification/'+engineName+'-weather.png'});
  await page.evaluate(()=>EyesAbility.interrupt('qa-switch'));
  await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:8000});
  if(data.available.includes('vision')){
   await launch('vision','vision');
   await page.waitForTimeout(500);
   assert(await page.locator('#visionLens video').count()===1,engineName+' original camera-pupil video absent');
   await page.screenshot({path:'verification/'+engineName+'-vision.png'});
   await page.evaluate(()=>EyesAbility.interrupt('qa-close'));
  }
  const relevant=exceptions.filter(x=>/EyesAbility|EyesArcade|EyesPocket|EyesWeather|EyesVision|tunnelbug|TypeError|ReferenceError|SyntaxError/i.test(x));
  assert.deepEqual(relevant,[],engineName+' page exceptions: '+relevant.join('\n').slice(0,3000));
  console.log(engineName+' passed: same ability state machine, original Tunnelbug, Pocket, Weather, Vision and screenshots');
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});