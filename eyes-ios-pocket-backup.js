/* iOS Pocket backups, attached to Android's original Pocket privacy/about screen.
   Never stores or uploads anything outside the user's explicit export/import action. */
'use strict';
(function(root){
 if(!root.EYES_IOS_ABILITIES)return;
 const FORMAT='eyes-pocket-ios-v1';
 const toData=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>no(r.error);r.readAsDataURL(blob)});
 function fromData(data){
  if(typeof data!=='string'||!/^data:[\w.+/-]+;base64,/.test(data))throw Error('Invalid archived file');
  const [head,b64]=data.split(',');
  const raw=atob(b64);const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return new Blob([bytes],{type:head.slice(5,-7)});
 }
 const show=msg=>{const note=document.getElementById('pocketNote');if(note){note.textContent=msg;note.hidden=false;}else alert(msg)};
 async function exportBackup(){
  const store=root.EyesPocketStore,files=root.EyesIOSPocketFiles;
  if(!store||!files)throw Error('Pocket storage unavailable');
  const items=await store.all();
  const blobs=await files.all();
  if(blobs.length>250||items.length>2000)throw Error('Too many items for one backup; export fewer first');
  const packed=[];
  for(const row of blobs){if(!row||typeof row.id!=='string')continue;packed.push({id:row.id,name:row.name,mime:row.mime,created:row.created,data:await toData(row.blob)})}
  const thumbs=[];
  for(const item of items)if(item.thumb){const blob=await store.thumb(item.id);if(blob)thumbs.push({id:item.id,data:await toData(blob)})}
  const json=JSON.stringify({format:FORMAT,version:1,exported:new Date().toISOString(),items,files:packed,thumbs});
  if(json.length>130e6)throw Error('Backup exceeds the browser export limit');
  const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='EYES_Pocket_Backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  show('Pocket backup exported. Save it somewhere safe.');
 }
 async function importBackup(file){
  if(!file||file.size>130e6)throw Error('That backup is too large for iPhone');
  const data=JSON.parse(await file.text());
  if(data.format!==FORMAT||!Array.isArray(data.items)||!Array.isArray(data.files)||!Array.isArray(data.thumbs))throw Error('Not a supported EYES Pocket backup');
  if(data.items.length>2000||data.files.length>250||data.thumbs.length>2000)throw Error('Backup exceeds safety limits');
  const store=root.EyesPocketStore,files=root.EyesIOSPocketFiles;
  const restored=new Map();
  for(const entry of data.files){
    if(!entry||typeof entry.id!=='string'||!/^ios_[a-z0-9]{6,60}$/.test(entry.id))continue;
    if(typeof entry.data!=='string'||entry.data.length>45e6)continue;
    const blob=fromData(entry.data);
    const all=await files.all();
    if(!all.some(x=>x.id===entry.id))await files.put({id:entry.id,name:String(entry.name||'file').slice(0,120),mime:String(entry.mime||'application/octet-stream').slice(0,100),blob,created:Number(entry.created)||Date.now()});
    restored.set(entry.id,true);
  }
  const thumbs=new Map(data.thumbs.filter(x=>x&&typeof x.id==='string'&&typeof x.data==='string').map(x=>[x.id,x.data]));
  let count=0;
  for(const it of data.items){
    if(!it||typeof it.id!=='string'||it.id.length>100||!['thought','link','image','file'].includes(it.kind))continue;
    if(await store.has(it.id))continue;
    if(it.nid&&!restored.has(it.nid)){const all=await files.all();if(!all.some(r=>r.id===it.nid))continue}
    const copy={...it,id:it.id,title:String(it.title||'').slice(0,150),text:String(it.text||'').slice(0,14000),created:Number(it.created)||Date.now()};
    const t=thumbs.get(it.id);
    await store.put(copy,t&&t.length<1e6?fromData(t):null);count++;
  }
  show('Restored '+count+' keepsakes. Close and reopen Pocket to refresh.');
 }
 function installUI(){
  const panel=document.querySelector('#pocketLayer .pk-about');
  if(!panel||panel.querySelector('[data-ios-pocket-backup]'))return;
  const wrap=document.createElement('div');wrap.dataset.iosPocketBackup='1';wrap.className='pk-composer-row';
  const ex=document.createElement('button');ex.type='button';ex.className='pk-btn';ex.textContent='Export Pocket backup';
  const im=document.createElement('button');im.type='button';im.className='pk-btn';im.textContent='Restore backup';
  const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;
  ex.onclick=()=>{ex.disabled=true;exportBackup().catch(e=>show('Backup failed: '+e.message)).finally(()=>ex.disabled=false)};
  im.onclick=()=>picker.click();
  picker.onchange=async()=>{try{await importBackup(picker.files?.[0])}catch(e){show('Restore failed: '+e.message)}finally{picker.value=''}};
  wrap.append(ex,im,picker);panel.append(wrap);
 }
 const obs=new MutationObserver(()=>installUI());
 const ready=()=>obs.observe(document.body,{subtree:true,childList:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})(window);