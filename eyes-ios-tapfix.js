/* EYES iPhone 2.5.2: make the Eye and clock respond to touches.
 * Native Android inbox/alarm calls are no-ops in Safari.
 * Keep the real original Ability Wheel and preserve DNA/pairings.
 */
'use strict';
(function(){
 const $=id=>document.getElementById(id);
 function presentClock(){
  let panel=$('eyesIOSClockCard');
  if(panel){panel.remove();return}
  const d=new Date();
  panel=document.createElement('section');
  panel.id='eyesIOSClockCard';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','false');
  panel.setAttribute('aria-label','Time and date');
  const title=document.createElement('h2');
  title.textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  const date=document.createElement('p');
  date.textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const hint=document.createElement('p');
  hint.className='eye-ios-clock-hint';
  hint.textContent='Alarms are managed in the iPhone Clock app. Safari cannot open Android alarm settings.';
  const close=document.createElement('button');
  close.type='button';close.textContent='Close';
  close.setAttribute('aria-label','Close time and date');
  close.onclick=()=>panel.remove();
  panel.append(title,date,hint,close);
  document.body.appendChild(panel);
 }
 function wire(){
  if(!window.EYES_WEB)return;
  const eye=$('coreHit'),clock=$('clock');
  if(eye){
   // Deliberately replace Android's inbox action. The iPhone version has no
   // Android notification inbox, so the old click handler did nothing.
   eye.onclick=()=>{
    if($('eyesIOSClockCard'))$('eyesIOSClockCard').remove();
    const a=window.EyesAbility;
    if(a){
     if(a.state()==='WHEEL_OPEN')a.close();
     else a.open();
    }
   };
   eye.setAttribute('aria-label','Your Eye. Open the Ability Wheel');
   eye.setAttribute('aria-controls','abilityWheel');
   eye.setAttribute('aria-haspopup','menu');
   eye.onkeydown=e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();eye.click()}
   };
  }
  if(clock){
   clock.onclick=presentClock;
   clock.setAttribute('aria-label','Show the current time and date');
   clock.removeAttribute('disabled');
  }
  document.addEventListener('pointerdown',event=>{
   const card=$('eyesIOSClockCard');
   if(card&&!card.contains(event.target)&&event.target!==clock)card.remove();
  },true);
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape')$('eyesIOSClockCard')?.remove();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});
 else wire();
})();