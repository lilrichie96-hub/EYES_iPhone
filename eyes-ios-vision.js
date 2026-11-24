/* EYES Vision for iPhone: permission-gated camera, photos, optional QR recognition. */
'use strict';
(function(){
function open({body,notice,esc}){
 let stream=null, detector=null, frameId=0, scanning=false, preview=null, output=null;
 body.innerHTML='<h2>Vision</h2><p>Your Eye can look through your camera while Vision is open. Nothing is uploaded.</p><div class="ea-camera"><video id="ev-video" autoplay muted playsinline aria-label="Live camera preview"></video></div><div class="ea-actions"><button id="ev-start">Open Eye</button><button id="ev-photo" disabled>Capture image</button><button id="ev-qr" disabled>Scan QR</button></div><div id="ev-output" class="ea-card" hidden></div><p class="ea-mini">Camera access requires Safari permission. Closing Vision stops every camera track. QR scanning depends on browser support; photo capture still works when it is unavailable.</p>';
 const el=id=>body.querySelector('#'+id), video=el('ev-video');
 const stop=()=>{scanning=false;if(frameId){cancelAnimationFrame(frameId);frameId=0}if(stream){for(const t of stream.getTracks())t.stop();stream=null}video.pause();video.srcObject=null;el('ev-photo').disabled=true;el('ev-qr').disabled=true;el('ev-start').textContent='Open Eye'};
 async function start(){
  if(!navigator.mediaDevices?.getUserMedia){notice('Camera access is unavailable. Open the installed EYES app in Safari over HTTPS.');return}
  stop();notice('Asking permission to open Vision…');
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
   video.srcObject=stream;await video.play();
   el('ev-start').textContent='Close camera';el('ev-photo').disabled=false;el('ev-qr').disabled=false;notice('Your Eye is looking. Camera stays on only in Vision.');
  }catch(err){stop();notice(err.name==='NotAllowedError'?'Camera permission was denied. Enable it in Safari settings and retry.':'Unable to open camera: '+(err.message||'unknown error'))}
 }
 el('ev-start').onclick=()=>{if(stream){stop();notice('Camera closed.')}else start()};
 el('ev-photo').onclick=async()=>{
  if(!stream||!video.videoWidth)return;
  const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;
  c.getContext('2d').drawImage(video,0,0,c.width,c.height);
  c.toBlob(async blob=>{
   if(!blob){notice('Could not capture this frame.');return}
   const area=el('ev-output');area.hidden=false;area.replaceChildren();
   const img=document.createElement('img');img.className='ea-photo';img.src=URL.createObjectURL(blob);img.alt='Captured Vision photo';
   const p=document.createElement('p');p.className='ea-mini';p.textContent='Saved only when you choose an action.';
   const a=document.createElement('a');a.href=img.src;a.download='EYES_Vision_'+Date.now()+'.jpg';a.textContent='Save photo';a.className='ea-card';a.style.display='inline-block';
   const share=document.createElement('button');share.textContent='Share photo';share.style.margin='8px';
   share.onclick=async()=>{try{const f=new File([blob],'EYES_Vision.jpg',{type:'image/jpeg'});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else notice('Sharing files is unavailable here. Use Save photo instead.')}catch(e){if(e.name!=='AbortError')notice('Share failed.')}};
   area.append(img,p,a,share);notice('Captured. Save or share when you’re ready.');
  },'image/jpeg',.85);
 };
 async function check(){
  if(!scanning||!stream||document.visibilityState==='hidden')return;
  try{const found=await detector.detect(video);if(found&&found.length){
   scanning=false;
   const value=String(found[0].rawValue||'').slice(0,2048),target=el('ev-output');target.hidden=false;target.replaceChildren();
   const p=document.createElement('p');p.textContent='QR code: '+value;target.appendChild(p);
   const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(value).then(()=>notice('Copied.')).catch(()=>notice('Clipboard unavailable'));target.appendChild(copy);
   try{const url=new URL(value);if(['https:','http:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open web link';link.style.padding='12px';target.appendChild(link)}}catch(_){}
   notice('QR code found. Links are never opened automatically.');
   return;
  }}catch(e){scanning=false;notice('QR scanning stopped: '+(e.message||'decoder unavailable'));return}
  frameId=requestAnimationFrame(()=>setTimeout(check,400));
 }
 el('ev-qr').onclick=async()=>{
  if(!stream)return;
  if(!('BarcodeDetector' in window)){notice('QR live decoding is not supported by this Safari version. You can still take photos.');return}
  try{detector=new BarcodeDetector({formats:['qr_code']});scanning=true;notice('Looking for a QR code…');check()}catch(e){notice('QR detection is unavailable on this device.')}
 };
 const vis=()=>{if(document.visibilityState==='hidden'){stop();notice('Camera stopped when EYES left the screen.')}};
 document.addEventListener('visibilitychange',vis);
 return ()=>{document.removeEventListener('visibilitychange',vis);stop();const a=el('ev-output');if(a)for(const img of a.querySelectorAll('img[src^="blob:"]'))URL.revokeObjectURL(img.src)};
}
window.EyesIOSAbilities.register({id:'vision',label:'Vision',icon:'◎',open});
})();