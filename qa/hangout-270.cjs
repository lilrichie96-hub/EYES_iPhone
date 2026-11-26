const {webkit,chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true});
 try{
 const ps=[];
 for(let i=0;i<2;i++){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
 const code='HL1-'+(i?'A':'B').repeat(43), seed=i?778124:778123, me=i?'Moss':'QA-eye', other=i?'QA-eye':'Moss';
 await ctx.addInitScript(({code,seed,me,other})=>{
 if(!sessionStorage.getItem('seeded')){
 localStorage.setItem('haven.dna.v1',JSON.stringify({v:1,seed,name:me,born:Date.now()-86400000*3}));
 localStorage.setItem('eyes.friends.v1',JSON.stringify({myId:'testid'+code.slice(-4).repeat(4),friends:[{code,peer:'peer'+code.slice(-6),caps:['ack','duel','presence','duel2','hangout'],cursor:null,nonces:[],missed:[],profile:{v:1,seed:seed===778123?778124:778123,name:other,stage:0,branch:null,mutations:[],born:1700000000000},addedAt:1700000000000,stats:{},firsts:{}}],native:{stats:{},firsts:{}},upgrades:[]}));
 localStorage.setItem('eyes.hangout.hint.v1','1');sessionStorage.setItem('seeded','1');sessionStorage.setItem('eyes.anyway','1');
 }
 window.__out=[];window.__L={};let F;
 Object.defineProperty(window,'EyesFriends',{configurable:true,get(){return F},set(v){F=v;const on=v.on.bind(v);v.on=(n,fn)=>{(window.__L[n]=window.__L[n]||[]).push(fn);return on(n,fn)};v.hangout=(f,h)=>{window.__out.push(JSON.stringify(h));return Promise.resolve(true)};v.connection=()=> 'online';v.presence=()=>({tier:'online'})}});
 window.__deliver=s=>{const f=EyesFriends.list()[0];for(const fn of window.__L.hangout||[])fn(f,JSON.parse(s),Date.now())};
 },{code,seed,me,other});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.EyesHangout&&window.EyesContact&&EyesFriends.list().length===1);
 ps.push({page,errors});
 }
 const A=ps[0].page,B=ps[1].page;
 const pump=async(ms)=>{const end=Date.now()+ms;do{for(const [from,to] of [[A,B],[B,A]]){const out=await from.evaluate(()=>window.__out.splice(0));for(const m of out)await to.evaluate(m=>window.__deliver(m),m)}await new Promise(r=>setTimeout(r,80))}while(Date.now()<end)};
 await A.evaluate(()=>EyesContact.meet(EyesFriends.list()[0].code));
 await A.locator('.ec-hangout-slot button').first().tap();
 await pump(1200);
 const accept=B.getByRole('button',{name:/accept|join|hang out/i}).last();await accept.tap();await pump(6000);
 for(const p of [A,B]){await p.waitForSelector('.eh-nudge',{state:'visible'});assert.equal(await p.locator('.eh-n').count(),3)}
 const session=async p=>p.evaluate(()=>{const s=EyesHangout._debug.session();return {phase:s.phase,v:s.v,seed:s.seed}});
 const a=await session(A),b=await session(B);assert.equal(a.phase,'live');assert.equal(b.phase,'live');assert.equal(a.seed,b.seed);
 await A.locator('.eh-n').filter({hasText:'Surprise'}).tap();await pump(4000);
 for(const p of [A,B]){assert.equal(await p.evaluate(()=>EyesHangout._debug.play().act.kind),'discover')}
 for(const {page,errors} of ps){await page.evaluate(()=>EyesContact.close());assert.deepEqual(errors,[])}
 console.log(name+' real Hangout invitation, three controls and synchronized Surprise passed');
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exit(1)});
