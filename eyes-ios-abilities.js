/* EYES iPhone 2.5: browser-safe abilities. No native/Android APIs, no account migration. */
'use strict';
(function(root){
  const modules = new Map();
  let active = null, surface = null, clean = [], wheel = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const on = (node,event,handler,opts) => { node.addEventListener(event,handler,opts); clean.push(()=>node.removeEventListener(event,handler,opts)); };
  function dismiss(){
    if(active?.leave) try{active.leave()}catch(e){console.warn('[EYES] ability cleanup',e)}
    for(const f of clean.splice(0))try{f()}catch(_){}
    if(surface){surface.remove();surface=null}
    document.body.classList.remove('eyes-ability-active');
    active=null;
    if(wheel) wheel.hidden=true;
  }
  function shell(name){
    dismiss();
    document.body.classList.add('eyes-ability-active');
    surface=document.createElement('section');
    surface.className='eyes-ability-surface';
    surface.setAttribute('role','dialog');
    surface.setAttribute('aria-modal','true');
    surface.setAttribute('aria-label',name);
    surface.innerHTML='<div class="ea-header"><span class="ea-brand">EYES <small>/ '+esc(name)+'</small></span><canvas class="ea-living-eye" width="72" height="72" aria-hidden="true"></canvas><button class="ea-exit" type="button" aria-label="Return to your Eye">✕</button></div><div class="ea-content"></div><p class="ea-message" role="status" aria-live="polite"></p>';
    document.body.appendChild(surface);
    on(surface.querySelector('.ea-exit'),'click',dismiss);
    // The actual Eye accompanies every ability. Its DNA comes from the existing profile;
    // no second creature is created or saved.
    try {
      if(root.HavenEye&&root.HavenDNA?.has?.()){
        const canvas=surface.querySelector('.ea-living-eye');
        const eye=new root.HavenEye(root.HavenDNA.dna(),canvas);
        eye.resize();
        let frame=0,last=0;
        function tick(t){
          if(!surface?.isConnected)return;
          if(t-last>=65){eye.step(t,Math.min(.07,(t-last)/1000||.033));eye.draw(t);last=t}
          frame=requestAnimationFrame(tick);
        }
        frame=requestAnimationFrame(tick);
        clean.push(()=>cancelAnimationFrame(frame));
      }
    } catch(err){ console.warn('[EYES] mini Eye unavailable',err); }

    on(document,'keydown',e=>{if(e.key==='Escape')dismiss()});
    return surface.querySelector('.ea-content');
  }
  function notice(message){if(surface){const el=surface.querySelector('.ea-message');el.textContent=message||''}}
  function register(spec){
    if(!spec||!spec.id||typeof spec.open!=='function') throw Error('Invalid ability');
    modules.set(spec.id,spec);updateWheel();
  }
  function open(id){
    const spec=modules.get(id);if(!spec)return;
    const body=shell(spec.label);
    active={id,leave:null};
    try{const cleanup=spec.open({body,notice,esc,on,close:dismiss}); if(typeof cleanup==='function') active.leave=cleanup}
    catch(e){console.error('[EYES] ability failure',e);body.textContent='This ability could not start.';notice('Your Eye is okay. Close and try again.')}
    if(wheel)wheel.hidden=true;
  }
  function updateWheel(){
    const holder=document.querySelector('#eyesAbilityChoices');if(!holder)return;
    holder.replaceChildren();
    for(const spec of modules.values()){
      const b=document.createElement('button');b.type='button';b.className='ea-choice';
      b.innerHTML='<span class="ea-choice-icon">'+esc(spec.icon||'✦')+'</span><span>'+esc(spec.label)+'</span>';
      b.onclick=()=>open(spec.id);holder.appendChild(b);
    }
  }
  function mount(){
    if(document.querySelector('#eyesAbilityBeacon'))return;
    const b=document.createElement('button');b.id='eyesAbilityBeacon';b.type='button';b.textContent='✦';
    b.title='Open your Eye’s abilities';b.setAttribute('aria-label','Open EYES abilities');
    wheel=document.createElement('div');wheel.id='eyesAbilityWheel';wheel.hidden=true;
    wheel.innerHTML='<div class="ea-wheel-heading">Inside your Eye</div><div id="eyesAbilityChoices"></div>';
    document.body.append(b,wheel);
    b.addEventListener('click',()=>{if(active)dismiss();wheel.hidden=!wheel.hidden});
    document.addEventListener('pointerdown',event=>{if(!wheel.hidden&&!wheel.contains(event.target)&&event.target!==b)wheel.hidden=true});
    updateWheel();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  root.EyesIOSAbilities={register,open,close:dismiss,notice,escape:esc};
})(window);