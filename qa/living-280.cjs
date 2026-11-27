const {webkit,chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
 await ctx.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('haven.dna.v1',JSON.stringify({v:1,seed:778123,name:'QA-eye',born:Date.now()-86400000*3}));sessionStorage.setItem('seeded','1');sessionStorage.setItem('eyes.anyway','1')}});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.EyesLiving&&window.EyesAbility&&EyesAbility.state()==='IDLE');
 await p.waitForTimeout(1200);
 const defs=await p.evaluate(()=>EyesLiving._debug.defs());assert(defs.length>=26);assert(defs.filter(x=>x.group==='rare').length>=12);
 const played=await p.evaluate(()=>{EyesLiving._debug.quietNow();EyesLiving._debug.hold(600000);return EyesLiving._debug.play('firefly',{})});assert(played);
 await p.waitForFunction(()=>EyesLiving.diagnostics().current?.u>0.1);
 await p.evaluate(()=>EyesAbility.open());await p.waitForTimeout(500);
 assert.equal(await p.evaluate(()=>EyesLiving.diagnostics().current),null);
 await p.evaluate(()=>EyesAbility.close());await p.waitForTimeout(700);
 assert.equal(await p.evaluate(()=>EyesAbility.state()),'IDLE');
 assert.deepEqual(errors,[]);console.log(name+' 26+ behaviors, 12+ rare, firefly and ability interruption passed');
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exit(1)});
