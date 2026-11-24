/* Browser bridge for the actual EYES 4.4.9 Pocket Dimension.
   Android's native file operations are replaced with consent-based iPhone file picking,
   and IndexedDB blobs. Pocket's original animations, inventory and game logic are untouched.
   No system-wide share-in intent is claimed. */
'use strict';
(function(root){
 if(!root.EYES_IOS_ABILITIES)return;
 const DB='eyes.ios.pocket.files.v1',STORE='files';
 const QUEUE_KEY='eyes.ios.pocket.pending.v1';
 const PENDING=new Map();
 try{const old=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');if(Array.isArray(old))for(const item of old.slice(0,60)){if(item&&typeof item.id==='string')PENDING.set(item.id,{...item,b64:''})}}catch(e){}
 const saveQueue=()=>{try{localStorage.setItem(QUEUE_KEY,JSON.stringify([...PENDING.values()].map(({b64,...r})=>r)))}catch(e){}};
 const deliver=()=>{
  tell({type:'inbox'});
  // On WebKit, the receiver can still be loading its inventory when files finish saving.
  // Unacknowledged imports retry, and remain pending across browser restarts.
  for(const delay of [200,900,2500])setTimeout(()=>{if(PENDING.size && !document.hidden)tell({type:'inbox'})},delay);
 };

 let openDB=null, picker=null;
 const request=(r)=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
 const open=()=>openDB||(openDB=new Promise((ok,no)=>{
   const r=indexedDB.open(DB,1);
   r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};
   r.onsuccess=()=>ok(r.result);r.onerror=()=>{openDB=null;no(r.error)};
 }));
 const txn=async(mode,method,...args)=>{
  const db=await open();
  return new Promise((resolve,reject)=>{
   let result, tx;
   try{
    tx=db.transaction(STORE,mode);
    const req=tx.objectStore(STORE)[method](...args);
    req.onsuccess=()=>{result=req.result};
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(tx.error||Error('File transaction aborted'));
    tx.onerror=()=>reject(tx.error||Error('File storage unavailable'));
   }catch(e){reject(e)}
  });
 };
 const tell=m=>{try{root.EyesPocket?.fromNative?.(JSON.stringify(m))}catch(e){console.error('Pocket iOS callback',e)}};
 const id=()=>('ios_'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)).replace(/-/g,'')).slice(0,60);
 const bytesToBase64=async(blob)=>{const data=await new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>ok(f.result);f.onerror=()=>no(f.error);f.readAsDataURL(blob)});return String(data).split(',')[1]||''};
 const thumb=async(file)=>{
   if(!file.type.startsWith('image/'))return null;
   try{
     const bitmap=await createImageBitmap(file);
     const w=bitmap.width,h=bitmap.height,s=Math.min(280/w,280/h,1);
     const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
     c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();
     return {b64:await bytesToBase64(await new Promise(ok=>c.toBlob(ok,'image/jpeg',.75))),w,h};
   }catch(e){return null}
 };
 let input=null;
 async function importFile(file){
   if(!file)return;
   if(file.size>25*1024*1024){tell({type:'import-error',name:file.name,reason:'Choose a file smaller than 25 MB.'});return}
   const nid=id(),kind=file.type.startsWith('image/')?'image':'file',tiny=await thumb(file);
   try{
     await txn('readwrite','put',{id:nid,blob:file,name:file.name,mime:file.type,size:file.size,created:Date.now()});
     const rid=id().replace(/^ios_/,'');
     PENDING.set(rid,{id:rid,nid,kind,name:file.name,mime:file.type||'application/octet-stream',size:file.size,w:tiny?.w||0,h:tiny?.h||0,thumb:!!tiny,b64:tiny?.b64||'',created:Date.now(),source:'pick'});
     saveQueue();
     deliver();
   }catch(err){tell({type:'import-error',name:file.name,reason:'Could not save the file locally. Check available storage.'})}
 }
 function pick(kind){
   if(!input){input=document.createElement('input');input.type='file';input.style.display='none';document.body.append(input);input.addEventListener('change',async()=>{
     const file=input.files?.[0];input.value='';await importFile(file);
   })}
   input.accept=kind==='image'?'image/*':'*/*';
   input.click();return 'ok';
 }
 const urlFor=async nid=>{const row=await txn('readonly','get',nid);if(!row?.blob)throw Error('File not found');return {row,url:URL.createObjectURL(row.blob)}};
 const download=(url,name)=>{const a=document.createElement('a');a.href=url;a.download=name||'EYES-pocket';a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)};
 async function fileAction(action,nid,mime,name){
   try{
     const {row,url}=await urlFor(nid);
     if(action==='share'&&navigator.canShare?.({files:[new File([row.blob],name||row.name,{type:row.mime||'application/octet-stream'})]})){
       try{await navigator.share({files:[new File([row.blob],name||row.name,{type:row.mime||'application/octet-stream'})]})}
       catch(e){if(e.name!=='AbortError')throw e}
       URL.revokeObjectURL(url);
     }else if(action==='open'){
       const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
     }else download(url,name||row.name);
     tell({type:action==='saveAs'?'save':action,ok:true});
   }catch(e){tell({type:action==='saveAs'?'save':action,ok:false,error:'Could not access this file. Try exporting your Pocket backup.'})}
 }
 function parseIDs(str){try{const a=JSON.parse(str);return Array.isArray(a)?a:[]}catch(e){return []}}
 root.EyesPocketNative={
   pick,
   inbox:()=>JSON.stringify([...PENDING.values()].map(({b64,...r})=>r)),
   ack:(ids)=>{for(const id of parseIDs(ids))PENDING.delete(String(id));saveQueue();return 'ok'},
   thumb:nid=>[...PENDING.values()].find(r=>r.nid===nid)?.b64||'',
   preview:(req,nid)=>{txn('readonly','get',nid).then(async row=>{
     if(!row?.blob?.type.startsWith('image/'))return tell({type:'preview',req,ok:false});
     const tiny=await thumb(row.blob);
     tell({type:'preview',req,ok:!!tiny,data:tiny?.b64||''});
   }).catch(()=>tell({type:'preview',req,ok:false}));return 'ok'},
   copy:(text)=>{navigator.clipboard?.writeText(String(text)).catch(()=>{});return 'ok'},
   openLink:(link)=>{try{const u=new URL(link);if(['https:','http:'].includes(u.protocol))root.open(u.href,'_blank','noopener,noreferrer')}catch(e){}return 'ok'},
   shareText:(text)=>{if(navigator.share)navigator.share({text:String(text)}).catch(()=>{});else navigator.clipboard?.writeText(String(text));return 'ok'},
   open:(nid,mime,name)=>{fileAction('open',nid,mime,name);return 'ok'},
   share:(nid,mime,name)=>{fileAction('share',nid,mime,name);return 'ok'},
   saveAs:(nid,mime,name)=>{fileAction('saveAs',nid,mime,name);return 'ok'},
   remove:(nid)=>{txn('readwrite','delete',nid).catch(()=>{});return 'ok'},
   clear:()=>{txn('readwrite','clear').catch(()=>{});return 'ok'},
   usage:()=>JSON.stringify({bytes:0,free:0})
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(PENDING.size)deliver()},300),{once:true});
 else setTimeout(()=>{if(PENDING.size)deliver()},300);
 root.EyesIOSPocketFiles={all:async()=>{const d=await open();return request(d.transaction(STORE,'readonly').objectStore(STORE).getAll())},put:row=>txn('readwrite','put',row)};
})(window);