/* Pocket Dimension for iPhone: IndexedDB, browser file picker, explicit portable backup. */
'use strict';
(function(){
const DB='eyes.pocket.ios.v1', STORE='keepsakes';
function database(){
 return new Promise((resolve,reject)=>{
  const q=indexedDB.open(DB,1);
  q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE,{keyPath:'id'})};
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function transaction(mode,action){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),s=tx.objectStore(STORE);let req;
  try{req=action(s)}catch(e){reject(e);return}
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);
 })}finally{db.close()}
}
const all=()=>transaction('readonly',s=>s.getAll());
const put=v=>transaction('readwrite',s=>s.put(v));
const remove=id=>transaction('readwrite',s=>s.delete(id));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),15000)}
function loadFile(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(file)})}
function render({body,notice,esc,on}){
 let view='list', selected=null;
 body.innerHTML='<div class="ea-space"><span class="ea-orb">✧</span></div><h2>Inside your Eye</h2><p>Your Eye keeps little things for you. Notes, links and pictures stay on this device unless you export them.</p><div class="ea-actions"><button id="ep-note">Write a thought</button><button id="ep-link">Keep a link</button><button id="ep-photo">Keep a photo</button></div><div class="ea-actions"><button id="ep-export">Export backup</button><button id="ep-import">Restore backup</button></div><input type="file" id="ep-pick" accept="image/*" hidden><input type="file" id="ep-backup" accept="application/json,.json" hidden><div id="ep-list"></div><p class="ea-mini">Important: iPhone web-app storage can be cleared by the browser or device. Export a backup for anything you want to keep long-term.</p>';
 const el=id=>body.querySelector('#'+id);
 async function refresh(){
  let items;try{items=(await all()).sort((a,b)=>b.created-a.created)}catch(e){notice('Pocket storage unavailable. Check Safari settings.');return}
  const out=el('ep-list');out.replaceChildren();
  if(!items.length){out.innerHTML='<div class="ea-empty">Nothing inside yet. Give your Eye something to remember.</div>';return}
  for(const item of items){
   const card=document.createElement('article');card.className='ea-card';
   const t=document.createElement('h3');t.textContent=item.title||({note:'Thought',link:'Saved link',image:'Photo'}[item.type]||'Keepsake');card.appendChild(t);
   const meta=document.createElement('p');meta.className='ea-mini';meta.textContent=new Date(item.created).toLocaleString();card.appendChild(meta);
   if(item.type==='image'&&item.data){const img=document.createElement('img');img.src=item.data;img.className='ea-photo';img.alt=item.title||'Saved photo';card.appendChild(img)}
   else {const p=document.createElement('p');p.textContent=(item.text||item.url||'').slice(0,450);card.appendChild(p)}
   const actions=document.createElement('div');actions.className='ea-actions';
   const take=document.createElement('button');take.textContent=item.type==='link'?'Open link':item.type==='image'?'Save image':'Copy text';
   take.onclick=async()=>{if(item.type==='link'){try{const u=new URL(item.url);if(!/^https?:$/.test(u.protocol))throw Error();window.open(u.href,'_blank','noopener,noreferrer')}catch(_){notice('Not a supported link.')}}else if(item.type==='image'){try{const blob=await (await fetch(item.data)).blob();download(blob,(item.title||'eye-picture').replace(/[^a-z0-9._-]/gi,'_')+'.png')}catch(_){notice('Could not save image.')}}else{try{await navigator.clipboard.writeText(item.text);notice('Copied.')}catch(_){notice('Clipboard unavailable.')}}};
   const del=document.createElement('button');del.textContent='Release';del.onclick=async()=>{if(!confirm('Release this keepsake from your Eye?'))return;await remove(item.id);refresh()};
   actions.append(take,del);card.append(actions);out.append(card);
  }
 }
 async function add(type){
  const title=prompt(type==='note'?'Name this thought:':'Name this link:','');
  if(title===null)return;
  let text='',url='';
  if(type==='note'){text=prompt('What should your Eye remember?','');if(text===null||!text.trim())return}
  else {url=prompt('Paste a web address (https://...)','https://');if(!url)return;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error()}catch(_){notice('Enter a valid http or https address.');return}}
  try{await put({id:uid(),type,title:title.trim().slice(0,90),text:text.slice(0,12000),url:url.slice(0,2000),created:Date.now()});await refresh();notice('Your Eye tucked it away.')}catch(e){notice('Could not save. Device storage may be full.')}
 }
 el('ep-note').onclick=()=>add('note');
 el('ep-link').onclick=()=>add('link');
 el('ep-photo').onclick=()=>el('ep-pick').click();
 el('ep-pick').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(!f.type.startsWith('image/')){notice('Choose an image.');return}
  if(f.size>4*1024*1024){notice('Choose an image smaller than 4 MB.');return}
  try{const data=await loadFile(f);await put({id:uid(),type:'image',title:f.name.slice(0,90),data,created:Date.now()});await refresh();notice('Your Eye kept the picture.')}
  catch(e){notice('Unable to keep this photo. Storage may be full.')}
  e.target.value='';
 };
 el('ep-export').onclick=async()=>{
  try{const rows=await all();download(new Blob([JSON.stringify({format:'eyes-pocket-ios-v1',items:rows,exported:new Date().toISOString()})],{type:'application/json'}),'EYES_Pocket_Backup.json');notice('Backup exported. Keep the file somewhere safe.')}
  catch(e){notice('Export failed.')}
 };
 el('ep-import').onclick=()=>el('ep-backup').click();
 el('ep-backup').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
   if(f.size>24*1024*1024)throw Error('Backup too big');
   const d=JSON.parse(await f.text());
   if(d.format!=='eyes-pocket-ios-v1'||!Array.isArray(d.items)||d.items.length>2000)throw Error('Not an EYES Pocket backup');
   const original=await all();const ids=new Set(original.map(x=>x.id));
   let count=0;
   for(const item of d.items){
    if(!item||!['note','link','image'].includes(item.type)||typeof item.id!=='string'||item.id.length>150||ids.has(item.id))continue;
    if(item.type==='image'&&(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(item.data||'')||item.data.length>7500000))continue;
    if(item.type==='link'&&!/^https?:\/\//i.test(item.url||''))continue;
    await put({id:item.id,type:item.type,title:String(item.title||'').slice(0,90),text:String(item.text||'').slice(0,12000),url:String(item.url||'').slice(0,2000),data:item.type==='image'?item.data:undefined,created:Number(item.created)||Date.now()});ids.add(item.id);count++;
   }
   await refresh();notice('Restored '+count+' keepsake'+(count===1?'':'s')+'. Your existing items were preserved.');
  }catch(err){notice('Could not restore: '+(err.message||'invalid backup'))}e.target.value='';
 };
 refresh();
 return ()=>{el('ep-pick').value='';el('ep-backup').value=''};
}
window.EyesIOSAbilities.register({id:'pocket',label:'Pocket Dimension',icon:'◈',open:render});
})();