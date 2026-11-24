/* EYES Pocket Arcade for iPhone: self-contained original Tunnelbug-style digger.
   No native audio, no background loop. Runs only while open. */
'use strict';
(function(){
const WIDTH=18,HEIGHT=18,CELL=18,DIRS=[[0,-1],[0,1],[-1,0],[1,0]];
function launch({body,notice,on}){
 let raf=0,playing=false,last=0,player={x:9,y:1},mob=[],tiles=[],gems=0,lives=3,points=0,tick=0,key=null,round=1,paused=false;
 body.innerHTML='<h2>Pocket Arcade</h2><p>The Eye makes room for a tiny digging game. Collect the crystals. Avoid anything that moves underground.</p><canvas id="ea-game" class="ea-arcade-screen" width="324" height="324" role="img" aria-label="Tunnelbug: collect crystals using arrow controls"></canvas><div class="ea-row"><span id="ea-score">Score 0</span><span id="ea-life">♥ ♥ ♥</span><span id="ea-round">Depth 1</span></div><div class="ea-pad"><span></span><button data-dir="0" aria-label="Up">↑</button><span></span><button data-dir="2" aria-label="Left">←</button><button data-dir="1" aria-label="Down">↓</button><button data-dir="3" aria-label="Right">→</button></div><div class="ea-actions"><button id="ea-pulse">✦ Stun</button><button id="ea-restart">New run</button><button id="ea-pause">Pause</button></div><p class="ea-mini">Touch arrows or swipe on the arcade screen. Stun nearby creatures. Pauses automatically when EYES is hidden.</p>';
 const cv=body.querySelector('#ea-game'),ctx=cv.getContext('2d'), el=id=>body.querySelector('#'+id), hud=()=>{el('ea-score').textContent='Score '+points;el('ea-life').textContent='♥ '.repeat(Math.max(0,lives));el('ea-round').textContent='Depth '+round};
 let power=0;
 function reset(){
  tiles=Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>{
   if(x===0||y===0||x===WIDTH-1||y===HEIGHT-1)return '#';
   if(y<4&&x>=7&&x<=11)return ' ';
   return Math.random()<.13?'#':Math.random()<.12?'*':'d';
  }));
  player={x:9,y:1};tiles[1][9]=' ';mob=[];
  for(let i=0;i<Math.min(3+round,8);i++){
   let tries=40,x,y;do{x=2+Math.floor(Math.random()*14);y=7+Math.floor(Math.random()*9)}while((tiles[y][x]==='#'||(x===9&&y===1))&&--tries>0);
   tiles[y][x]=' ';mob.push({x,y,stun:0});
  }
  gems=tiles.flat().filter(v=>v==='*').length;if(gems===0){tiles[8][8]='*';gems=1}
  hud();
 }
 function restart(){points=0;lives=3;round=1;power=0;paused=false;playing=true;reset();notice('Dig!');start()}
 function move(d){
  if(!playing||paused)return;const [dx,dy]=DIRS[d],x=player.x+dx,y=player.y+dy;
  if(!tiles[y]||!tiles[y][x]||tiles[y][x]==='#')return;
  const cell=tiles[y][x];player={x,y};tiles[y][x]=' ';
  if(cell==='*'){points+=100;gems--;if(gems<=0){round++;points+=300;reset();notice('A deeper pocket opened.');return}}
  else if(cell==='d')points+=2;
  collide();hud();draw();
 }
 function collide(){
  for(const e of mob)if(e.x===player.x&&e.y===player.y&&e.stun<=0){
   lives--;player={x:9,y:1};
   if(lives<=0){playing=false;notice('Your Eye needs a rest. Score '+points+'. Start a new run.');cancelAnimationFrame(raf)}
   else notice('Ouch! '+lives+' hearts left.');
   break;
  }
 }
 function advance(){
  for(const e of mob){if(e.stun>0){e.stun--;continue}
   const opts=DIRS.map(([dx,dy])=>({x:e.x+dx,y:e.y+dy})).filter(p=>tiles[p.y]?.[p.x]!==undefined&&tiles[p.y][p.x]!=='#');
   if(!opts.length)continue;
   opts.sort((a,b)=>(Math.abs(a.x-player.x)+Math.abs(a.y-player.y))-(Math.abs(b.x-player.x)+Math.abs(b.y-player.y)));
   const next=Math.random()<.7?opts[0]:opts[Math.floor(Math.random()*opts.length)];
   e.x=next.x;e.y=next.y;
  }
  collide();hud();
 }
 function draw(){
  ctx.fillStyle='#09141c';ctx.fillRect(0,0,324,324);
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
   const v=tiles[y][x],px=x*CELL,py=y*CELL;
   ctx.fillStyle=v==='#'?'#243d48':v==='d'?'#244551':'#09131d';ctx.fillRect(px,py,CELL-1,CELL-1);
   if(v==='d'){ctx.fillStyle='#315a69';ctx.fillRect(px+3,py+4,4,2);ctx.fillRect(px+10,py+12,4,2)}
   if(v==='*'){ctx.fillStyle='#8eeefc';ctx.beginPath();ctx.moveTo(px+9,py+2);ctx.lineTo(px+15,py+9);ctx.lineTo(px+9,py+16);ctx.lineTo(px+3,py+9);ctx.fill()}
  }
  for(const e of mob){
   ctx.fillStyle=e.stun?'#687886':'#e79879';ctx.beginPath();ctx.arc(e.x*CELL+9,e.y*CELL+9,7,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#111d26';ctx.fillRect(e.x*CELL+5,e.y*CELL+7,2,2);ctx.fillRect(e.x*CELL+11,e.y*CELL+7,2,2);
  }
  ctx.fillStyle='#a2d9f2';ctx.beginPath();ctx.arc(player.x*CELL+9,player.y*CELL+9,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#102b36';ctx.fillRect(player.x*CELL+5,player.y*CELL+7,3,3);ctx.fillRect(player.x*CELL+11,player.y*CELL+7,3,3);
  if(power>0){ctx.strokeStyle='#91e7ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(player.x*CELL+9,player.y*CELL+9,power,0,Math.PI*2);ctx.stroke()}
  if(paused||!playing){ctx.fillStyle='#09131cba';ctx.fillRect(0,0,324,324);ctx.fillStyle='#dcfaff';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(paused?'PAUSED':'GAME OVER',162,160)}
 }
 function stun(){
  if(!playing||paused)return;power=28;let count=0;
  for(const e of mob)if(Math.abs(e.x-player.x)+Math.abs(e.y-player.y)<=3){e.stun=7;count++}
  notice(count?'The Eye pulsed through the tunnels.':'Nothing close enough to stun.');
  setTimeout(()=>{power=0;draw()},220);draw();
 }
 function frame(t){
  if(!playing||paused||document.visibilityState==='hidden'){raf=0;return}
  if(!last)last=t;
  if(t-last>500){advance();last=t}
  draw();raf=requestAnimationFrame(frame);
 }
 function start(){if(!raf&&playing&&!paused){last=0;raf=requestAnimationFrame(frame)}}
 for(const b of body.querySelectorAll('[data-dir]'))on(b,'pointerdown',e=>{e.preventDefault();move(Number(b.dataset.dir))});
 let startTouch=null;
 on(cv,'touchstart',e=>{const t=e.touches[0];startTouch={x:t.clientX,y:t.clientY}},{passive:true});
 on(cv,'touchend',e=>{if(!startTouch)return;const t=e.changedTouches[0],dx=t.clientX-startTouch.x,dy=t.clientY-startTouch.y;startTouch=null;if(Math.hypot(dx,dy)<12)return;move(Math.abs(dx)>Math.abs(dy)?(dx>0?3:2):(dy>0?1:0))},{passive:true});
 const onkey=e=>{const m={ArrowUp:0,ArrowDown:1,ArrowLeft:2,ArrowRight:3};if(m[e.key]!==undefined){e.preventDefault();move(m[e.key])}if(e.key===' ')stun()};
 on(document,'keydown',onkey);
 el('ea-pulse').onclick=stun;el('ea-restart').onclick=restart;el('ea-pause').onclick=()=>{paused=!paused;el('ea-pause').textContent=paused?'Resume':'Pause';if(!paused)start();draw()};
 const vis=()=>{if(document.visibilityState==='hidden'){paused=true;el('ea-pause').textContent='Resume';if(raf)cancelAnimationFrame(raf);raf=0}};
 on(document,'visibilitychange',vis);
 restart();
 return ()=>{playing=false;cancelAnimationFrame(raf)};
}
window.EyesIOSAbilities.register({id:'arcade',label:'Pocket Arcade',icon:'▣',open:launch});
})();