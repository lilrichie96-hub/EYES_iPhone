const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
const browser=await engine.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{sessionStorage.setItem('eyes.anyway','1');HavenDNA.adopt(778123,'QA-eye')});
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.EyesAbility?.diagnostics?.().satellite && window.EyesArcade && document.getElementById('abilitySatellite')&&!document.getElementById('abilitySatellite').hidden,{timeout:15000});
await page.locator('#abilitySatellite').tap();
await page.waitForSelector('.ability-item[data-ability="arcade"]',{state:'visible',timeout:3000});
const before=await page.evaluate(()=>({state:EyesAbility.diagnostics(),arcade:EyesArcade.diagnostics()}));
console.log(name+' immediate wheel state '+JSON.stringify(before).slice(0,1900));
await page.locator('.ability-item[data-ability="arcade"]').tap();
await page.waitForTimeout(300);
const rightAfter=await page.evaluate(()=>({state:EyesAbility.diagnostics(),arcade:EyesArcade.diagnostics()}));
console.log(name+' after arcade tap '+JSON.stringify(rightAfter).slice(0,1900));
await page.waitForTimeout(2600);
const later=await page.evaluate(()=>({state:EyesAbility.diagnostics(),arcade:EyesArcade.diagnostics(),arcadeStage:document.getElementById('arcade')?.getBoundingClientRect().toJSON(),button:document.elementFromPoint(200,815)?.outerHTML?.slice(0,170)}));
console.log(name+' later '+JSON.stringify(later).slice(0,2800));
console.log(name+' errors '+JSON.stringify(errors).slice(0,1600));
await browser.close();
}
})().catch(e=>{console.error(e);process.exit(1)});
