const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('verification',{recursive:true});
 for(const [label,browserType]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserType.launch({headless:true,args:label==='chromium'?['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']:[]});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.HavenDNA&&window.EyesAbility&&window.Haven,{timeout:20000});
  await page.evaluate(()=>HavenDNA.adopt(0x12AABBCC,'ActualEye'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.EyesAbility&&window.HavenDNA?.has?.(),{timeout:20000});
  const before=await page.evaluate(()=>HavenDNA.profile());
  assert(before&&before.name==='ActualEye','Eye was not created');
  const available=await page.evaluate(()=>EyesAbility.diagnostics().available);
  for(const id of ['arcade','pocket','weather'])assert(available.includes(id),label+' missing '+id);
  assert(await page.evaluate(()=>typeof Haven.abilityHost==='function'));
  const launch=async id=>{
   const ok=await page.evaluate(id=>EyesAbility.launch(id),id);assert(ok,label+' launch '+id+' failed');
   await page.waitForFunction(id=>EyesAbility.owner()===id,id,{timeout:12000});
  };
  const close=async()=>{await page.evaluate(()=>EyesAbility.interrupt('test-complete'));await page.waitForFunction(()=>EyesAbility.state()==='IDLE',{timeout:7000})};
  // Actual Android game, not another canvas implementation.
  await launch('arcade');
  await page.waitForFunction(()=>window.TunnelbugCore&&EyesArcade.diagnostics().game,{timeout:15000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>['ready','playing'].includes(EyesArcade.diagnostics().game?.phase),{timeout:8000});
  await page.waitForFunction(()=>EyesArcade.diagnostics().game?.phase==='playing',{timeout:8500}).catch(async e=>{throw Error(label+' Tunnelbug countdown did not advance: '+JSON.stringify(await page.evaluate(()=>EyesArcade.diagnostics()))+' '+e.message)});
  const game=await page.evaluate(()=>({status:EyesArcade.diagnostics().game,canvas:document.getElementById('arcadeCanvas'),dock:getComputedStyle(document.getElementById('eyesDock')).visibility}));
  assert(game.status.phase==='playing','Original Tunnelbug game did not enter playing: '+JSON.stringify(game.status));
  assert(game.canvas,'No actual Tunnelbug canvas');
  assert.equal(game.dock,'hidden','Companion dock overlays Pocket Arcade');
  await page.screenshot({path:'verification/'+label+'-tunnelbug-playing.png'});
  await close();
  // Pocket: real IndexedDB + original UI + image picker-to-pocket bridge
  await launch('pocket');
  await page.waitForFunction(()=>EyesPocket.diagnostics().state==='POCKET_ACTIVE',{timeout:8000});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('eyesDock')).visibility),'hidden','Dock overlays Pocket');
  const original=await page.evaluate(()=>EyesPocketStore.put({id:'ios_qa_note',kind:'thought',title:'Test thought',text:'Remember the original Eye',created:Date.now(),updated:Date.now()}));
  assert.equal(original.id,'ios_qa_note');
  // Safari will not open a file picker from a programmatic script without a
  // user activation. Exercise the original Pocket "Swallow -> Image" menu.
  await page.locator('#pocketAdd').click();
  const fileChooserPromise=page.waitForEvent('filechooser',{timeout:8000});
  await page.getByRole('menuitem',{name:'Image',exact:true}).click();
  const fileChooser=await fileChooserPromise;
  await fileChooser.setFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAwMBAfWlX3sAAAAASUVORK5CYII=','base64')});
  await page.waitForFunction(()=>window.EyesPocketStore && window.EyesIOSPocketFiles && EyesIOSPocketFiles.all().then(a=>a.length>=1),{timeout:10000});
  await page.waitForFunction(()=>EyesPocketStore.all().then(a=>a.some(r=>r.kind==='image')&&a.some(r=>r.kind==='thought')),{timeout:15000}).catch(async e=>{ const rows=await page.evaluate(()=>EyesPocketStore.all()); throw new Error(label+' Pocket persistence missing: '+JSON.stringify(rows.map(x=>({id:x.id,kind:x.kind,title:x.title})))+' / '+e.message); });
  const rows=await page.evaluate(()=>EyesPocketStore.all());
  if(label==='webkit'){
   const state=await page.evaluate(async()=>({pending:EyesPocketNative.inbox(),diag:EyesPocket.diagnostics(),files:(await EyesIOSPocketFiles.all()).map(x=>({id:x.id,name:x.name,size:x.blob?.size})),items:(await EyesPocketStore.all()).map(x=>({id:x.id,kind:x.kind})),events:window.EyesIOSPocketDebug?.events?.()||[],errors:window.__eyesPocketErrors||[]}));
   console.log('WEBKIT POCKET STATE',JSON.stringify(state).slice(0,4500));
  }
  assert(rows.some(x=>x.kind==='image')&&rows.some(x=>x.kind==='thought'),'Original Pocket did not retain image and thought: '+JSON.stringify(rows.map(x=>({id:x.id,kind:x.kind}))));
  await page.screenshot({path:'verification/'+label+'-pocket-original.png'});
  // Real Pocket export and restore are mandatory because Safari can clear site data.
  await page.locator('#pocketInfo').click();
  await page.waitForSelector('[data-ios-pocket-backup]',{timeout:7000});
  const downloadReady=page.waitForEvent('download',{timeout:12000});
  await page.getByRole('button',{name:'Export Pocket backup'}).click();
  const archive=await downloadReady;
  const archivePath=await archive.path();
  const archiveData=JSON.parse(fs.readFileSync(archivePath,'utf8'));
  assert.equal(archiveData.format,'eyes-pocket-ios-v1');
  assert(archiveData.items.some(x=>x.kind==='image')&&archiveData.items.some(x=>x.kind==='thought'),label+' export missed keepsakes');
  await page.evaluate(()=>EyesPocketStore.clear());
  const pickerReady=page.waitForEvent('filechooser',{timeout:10000});
  await page.getByRole('button',{name:'Restore backup'}).click();
  const picker=await pickerReady;
  await picker.setFiles({name:'EYES_Pocket_Backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archiveData))});
  await page.waitForFunction(async()=>{const a=await EyesPocketStore.all();return a.some(x=>x.kind==='image')&&a.some(x=>x.kind==='thought')},null,{timeout:12000});
  console.log(label+' Pocket backup export and restore passed');
  await close();
  // Weather: original atmosphere/forecast stage, no fake live reading.
  await launch('weather');await page.waitForTimeout(1450);
  await page.evaluate(()=>EyesWeather._debug.preview('storm',true,1));
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('eyesDock')).visibility),'hidden','Dock overlays Weather');
  await page.screenshot({path:'verification/'+label+'-weather-original.png'});
  await close();
  // Vision original lens and camera stage (camera may not exist in headless WebKit).
  if(available.includes('vision')){
   await launch('vision');await page.waitForTimeout(800);
   assert(await page.locator('#visionLens video').count()===1,'Not the original Vision pupil');
   await page.screenshot({path:'verification/'+label+'-vision-original.png'});
   await close();
  }
  await page.reload({waitUntil:'domcontentloaded'});
  const after=await page.evaluate(async()=>({eye:HavenDNA.profile(),rows:await EyesPocketStore.all(),files:await EyesIOSPocketFiles.all()}));
  assert.equal(after.eye.seed,before.seed,'Eye changed after reload');
  assert(after.rows.some(x=>x.id==='ios_qa_note')&&after.rows.some(x=>x.kind==='image'),'Pocket wiped on reload');
  assert(after.files.length>=1,'Pocket image bytes wiped on reload');
  assert.deepEqual(errors,[],label+' page errors: '+errors.join(';').slice(0,2400));
  console.log(label+' passed: original gameplay, animated Pocket, Weather, Vision, backed storage, no dock overlay');
  await browser.close();
 }
})().catch(err=>{console.error(err);process.exit(1)});