/* Teacher-only adapter for the legacy appearance controls. Student assets stay separate. */
(()=>{'use strict';
const pendingAppearance=document.querySelector('script[src*="app/appearance.js"]');if(pendingAppearance)pendingAppearance.src=pendingAppearance.src.replace('/appearance.js','/teacher-appearance.js');
const fields=['presen-theme','presen-accent','presen-brand-image','presen-brand-size','custom_bg_wallpaper','custom_bg_wallpaper_width','custom_bg_wallpaper_height','custom_bg_wallpaper_mode','custom_bg_wallpaper_scale','custom_bg_wallpaper_x','custom_bg_wallpaper_y'];
const managed=new Set([...fields,'custom_bg_wallpaper_db']);
const proto=Storage.prototype,rawGet=proto.getItem,rawSet=proto.setItem,rawRemove=proto.removeItem;
const legacy=Object.fromEntries(fields.map(k=>[k,rawGet.call(localStorage,k)]).filter(([,v])=>v!==null));
const legacyDB=rawGet.call(localStorage,'custom_bg_wallpaper_db')==='1',legacyBinding=rawGet.call(localStorage,'presen-appearance-owner');
const initialOwner=WA.get().then(s=>s.profile?.role==='teacher'?s.profile.account.id:null);
const legacyBackup=(async()=>{const previous=await initialOwner,who=previous&&(legacyBinding===previous||!legacyBinding&&previous==='admin_01')?previous:null;const old={...legacy};if(legacyDB)old.custom_bg_wallpaper=await WA.get('wallpaper-source')||old.custom_bg_wallpaper;const key=who?'teacher-appearance-legacy:'+who:'teacher-appearance-unclaimed';if(meaningful(old))await WA.change(previous=>({...previous,...old}),key);})();
let owner=null,record=null,ready=false,applying=false,timer,sending=null,error='',observed=0,refreshing=false,pendingSerial=0;
const namespaced=k=>'pa:'+owner+':'+k,cacheKey=id=>'teacher-appearance:'+id;
const empty=()=>({revision:0,settings:{},versions:{},pending:{},legacyChecked:false});
function value(k){return rawGet.call(localStorage,namespaced(k));}
function put(k,v){if(v===null||v===undefined)rawRemove.call(localStorage,namespaced(k));else rawSet.call(localStorage,namespaced(k),String(v));}
function marker(k){try{return JSON.parse(rawGet.call(localStorage,namespaced('pending:'+k))||'null');}catch(_){return null;}}
function changed(k){if(!ready||applying||!owner)return;k=k==='custom_bg_wallpaper_db'?'custom_bg_wallpaper':k;rawSet.call(localStorage,namespaced('pending:'+k),JSON.stringify({id:crypto.randomUUID(),baseVersion:record.pending[k]?.baseVersion??record.versions[k]??0}));dirty.add(k);clearTimeout(timer);timer=setTimeout(()=>void capture().then(flush).catch(fail),180);}
const dirty=new Set();
proto.getItem=function(k){return this===localStorage&&managed.has(String(k))?(owner?value(String(k)):null):rawGet.call(this,k);};
proto.setItem=function(k,v){if(this===localStorage&&managed.has(String(k))){if(owner){rawSet.call(this,namespaced(String(k)),String(v));changed(String(k));}return;}return rawSet.call(this,k,v);};
proto.removeItem=function(k){if(this===localStorage&&managed.has(String(k))){if(owner){rawRemove.call(this,namespaced(String(k)));changed(String(k));}return;}return rawRemove.call(this,k);};
function fail(e){error=e.message||'Tampilan belum tersinkron.';status();}
async function persist(){if(owner&&record)await WA.change(()=>record,cacheKey(owner));}
async function normalizeImage(data,kind='wallpaper'){
 if(data===null||data==='')return null;
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw Error('Gunakan gambar PNG, JPG, atau WebP.');
 const image=new Image();image.src=data;await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)throw Error('Gunakan gambar maksimal 24 megapiksel.');
 if(data.length<=1400000)return data;
 const canvas=document.createElement('canvas');let scale=Math.min(1,(kind==='wallpaper'?2048:768)/Math.max(image.naturalWidth,image.naturalHeight));
 for(let n=0;n<5;n++){canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const encoded=canvas.toDataURL('image/webp',.9-n*.07);if(encoded.length<=1400000)return encoded;scale*=.8;}
 throw Error('Gambar terlalu besar untuk disinkronkan. Gunakan gambar yang lebih kecil.');
}
const stageTickets=new Map();
async function stage(k,v,intent=marker(k)){
 const target=record,identity=owner,ticket=(stageTickets.get(k)||0)+1,baseVersion=intent?.baseVersion??target?.pending[k]?.baseVersion??target?.versions[k]??0;stageTickets.set(k,ticket);
 if(['presen-brand-image','custom_bg_wallpaper'].includes(k)&&v)v=await normalizeImage(v,k==='presen-brand-image'?'brand':'wallpaper');
 if(owner!==identity||record!==target||stageTickets.get(k)!==ticket)return;
 if(record.pending[k]?.value===v){if(intent)record.pending[k].marker=intent.id;return;}if(!record.pending[k]&&((record.settings[k]??null)===v)){if(intent?.id===marker(k)?.id)rawRemove.call(localStorage,namespaced('pending:'+k));return;}
 record.pending[k]={value:v,baseVersion,serial:++pendingSerial,marker:intent?.id};
}
let captureChain=Promise.resolve();
function capture(){const task=captureChain.catch(()=>{}).then(captureNow);captureChain=task;return task;}
async function captureNow(){
 if(!ready||applying||!record)return;const mine=owner,keys=[...dirty];dirty.clear();
 for(const k of keys){let v=value(k);if(k==='custom_bg_wallpaper'&&value('custom_bg_wallpaper_db')==='1')v=await WA.get('wallpaper-source')||v;if(mine!==owner)return;await stage(k,v);if(mine!==owner)return;}
 await persist();status();
}
function combined(){return {...record?.settings,...Object.fromEntries(Object.entries(record?.pending||{}).map(([k,p])=>[k,p.value]))};}
async function render(){
 if(!owner||!record)return;applying=true;try{
  const settings=combined();for(const k of fields)try{put(k,settings[k]??null);}catch(e){if(k==='custom_bg_wallpaper'){put('custom_bg_wallpaper_db','1');}else throw e;}
  // The optional large-image store is replaced for this account before it can be read.
  const image=settings.custom_bg_wallpaper||null;await WA.change(()=>image,'wallpaper-source');
  if(value('custom_bg_wallpaper')===image)put('custom_bg_wallpaper_db',null);
  const theme=settings['presen-theme']||'putih';document.documentElement.dataset.theme=theme;await WA.change(()=>theme,'theme');
  for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);for(const n of ['--hero-accent','--hero-on-accent'])document.body.style.removeProperty(n);
  if(settings['presen-accent'])window.PresenUI?.accent(settings['presen-accent']);
  await window.PresenAppearance?.reloadAccount?.();
 }finally{applying=false;}status();
}
async function flush(){
 clearTimeout(timer);await capture();if(sending)return sending;
 const mine=owner;error='';sending=(async()=>{
  if(!mine||!record||!navigator.onLine)return;
  const s=await WA.get();if(s.profile?.role!=='teacher'||s.profile.account.id!==mine)return;
  for(const [key,entry]of Object.entries(record.pending)){
   if(entry.conflict)continue;const result=await WA.api('appearance-save',{key,value:entry.value,baseVersion:entry.baseVersion},s.token);if(owner!==mine||(await WA.get()).profile?.account?.id!==mine)return;
   const remote=result.appearance;record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;
   const current=record.pending[key];if(result.conflict){if(current)current.conflict=true;}
   else{if(current?.serial===entry.serial)delete record.pending[key];else if(current)current.baseVersion=record.versions[key]||0;const intent=marker(key);if(intent?.id===entry.marker)rawRemove.call(localStorage,namespaced('pending:'+key));else if(intent)rawSet.call(localStorage,namespaced('pending:'+key),JSON.stringify({...intent,baseVersion:record.versions[key]||0}));}
   await persist();status();
  }
 })().catch(fail).finally(()=>{sending=null;status();if(!error&&navigator.onLine&&Object.values(record?.pending||{}).some(p=>!p.conflict))timer=setTimeout(()=>void flush(),200);});status();await sending;
}
async function pull(){
 if(!ready||applying||sending||refreshing||!navigator.onLine||!owner)return;refreshing=true;const mine=owner;
 try{await capture();const s=await WA.get();if(s.profile?.account?.id!==mine||s.profile.role!=='teacher')return;const response=await WA.api('appearance-read',{},s.token);if(owner!==mine)return;const remote=response.appearance;
  if(remote.revision!==record.revision){record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;await persist();await render();}
 }catch(e){fail(e);}finally{refreshing=false;}
}
function meaningful(settings){return !!(settings['presen-brand-image']||settings.custom_bg_wallpaper||settings['presen-accent']||settings['presen-theme']&&settings['presen-theme']!=='putih');}
async function prepare(s){
 if(s.profile?.role!=='teacher'){await guest();return;}
 await legacyBackup;ready=false;owner=s.profile.account.id;record=await WA.get(cacheKey(owner))||empty();record.pending||={};pendingSerial=Math.max(0,...Object.values(record.pending).map(x=>x.serial||0));
 for(const k of fields){const intent=marker(k);if(!intent)continue;let local=value(k);if(k==='custom_bg_wallpaper'&&value('custom_bg_wallpaper_db')==='1'&&(await initialOwner)===owner)local=await WA.get('wallpaper-source')||local;await stage(k,local,intent);}
 let remote;try{if(navigator.onLine)remote=(await WA.api('appearance-read',{},s.token)).appearance;}catch(e){error=e.message;}
 if(remote){record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;}
 const old=await WA.get('teacher-appearance-legacy:'+owner)||{...legacy};
 const eligible=!!await WA.get('teacher-appearance-legacy:'+owner)||!legacyBinding&&(await initialOwner)===owner&&owner==='admin_01';
 if(eligible&&meaningful(old))for(const[k,v]of Object.entries(old))if(!record.versions[k]&&!Object.hasOwn(record.settings,k)&&!record.pending[k])await stage(k,v);
 record.legacyChecked=true;
 // Shared legacy keys must never expose the lecturer's images to student/guest pages.
 for(const k of managed)rawRemove.call(localStorage,k);rawSet.call(localStorage,'presen-appearance-owner',owner);
 await persist();await render();ready=true;status();void flush();
}
async function guest(){await legacyBackup;ready=false;owner=null;record=null;dirty.clear();for(const k of managed)rawRemove.call(localStorage,k);document.documentElement.dataset.theme='putih';for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);await window.PresenAppearance?.reloadAccount?.();}
async function useCampusBrand(){
 if(!ready||!owner)throw Error('Masuk sebagai dosen terlebih dahulu.');
 const image=new Image();image.src=new URL('assets/logo-stkip-yapis-dompu.png',WA.ROOT).href;await image.decode();const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);localStorage.setItem('presen-brand-image',canvas.toDataURL('image/png'));await window.PresenAppearance?.reloadAccount?.();await flush();
}
function status(){

 const panel=document.getElementById('presenAppearanceDialog');if(!panel)return;const brand=panel.querySelector('.p-brand-settings');if(brand&&!brand.querySelector('#pCampusBrand')){const button=document.createElement('button');button.type='button';button.id='pCampusBrand';button.textContent='Gunakan logo kampus STKIP Yapis Dompu';button.onclick=async()=>{button.disabled=true;try{await useCampusBrand();}catch(e){fail(e);}finally{button.disabled=false;}};brand.querySelector('h3')?.after(button);}let box=panel.querySelector('#appearanceAccountSync');if(!box){box=document.createElement('section');box.id='appearanceAccountSync';box.className='p-appearance-account';box.innerHTML='<p role="status" id="appearanceAccountStatus"></p><button type="button" id="appearanceSyncNow">Sinkronkan tampilan</button><button type="button" id="appearanceKeepLocal" hidden>Pakai perubahan perangkat ini</button><button type="button" id="appearanceUseAccount" hidden>Pakai tampilan akun</button><p><small>Logo, tema, warna, dan wallpaper mengikuti akun ini di perangkat lain. Pengaturan kelas dan lembar tetap terpisah.</small></p>';panel.querySelector('.p-subtitle')?.after(box);box.querySelector('#appearanceSyncNow').onclick=()=>void flush().then(pull).catch(fail);box.querySelector('#appearanceKeepLocal').onclick=()=>void resolveConflicts(true);box.querySelector('#appearanceUseAccount').onclick=()=>void resolveConflicts(false);}
 const pending=Object.values(record?.pending||{}),conflict=pending.some(p=>p.conflict);box.querySelector('#appearanceAccountStatus').textContent=error||conflict?'Tampilan belum tersinkron: '+(error||'pengaturan ini berubah di perangkat lain. Pilih salinan yang ingin digunakan.'):pending.length?(navigator.onLine?'Menyinkronkan tampilan ke akun…':'Tampilan tersimpan di perangkat · menunggu internet'):'Tampilan tersimpan di akun · tersedia di perangkat lain';box.querySelector('#appearanceKeepLocal').hidden=box.querySelector('#appearanceUseAccount').hidden=!conflict;
}
async function resolveConflicts(keep){for(const[k,p]of Object.entries(record.pending))if(p.conflict){if(keep){p.baseVersion=record.versions[k]||0;delete p.conflict;}else delete record.pending[k];}error='';await persist();await render();await flush();}
const originalLogout=WA.logout;WA.logout=async(...args)=>{await flush();const previous=owner;ready=false;const result=await originalLogout(...args);if(result!==false)await guest();else{owner=previous;ready=true;}return result;};
WA.on(()=>{if(!ready||applying)return;void WA.get().then(s=>{if(s.profile?.role!=='teacher'||s.profile.account.id!==owner){void guest();return;}if(Number(s.snapshot.appearance?.revision)>observed)void pull();});});
window.addEventListener('online',()=>void flush().then(pull));window.addEventListener('focus',()=>void pull());document.addEventListener('visibilitychange',()=>{if(document.hidden)void flush();else void pull();});
new MutationObserver(()=>{if(document.getElementById('presenAppearanceDialog')&&(!document.getElementById('appearanceAccountSync')||!document.getElementById('pCampusBrand')))status();}).observe(document.body,{childList:true,subtree:true});
window.PresenTeacherPreferences={prepare,guest,flush,pull,saveLocal:capture,normalizeImage,useCampusBrand,get ready(){return ready;}};
})();
