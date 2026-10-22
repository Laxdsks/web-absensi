/* A single compressed photo, private storage, authenticated delivery and offline retry. */
(()=>{
'use strict';if(!window.WA)return;let flushing;
const MAX=220000,account=async()=>{const s=await WA.get();return s.profile?.account?.id;},key=(who,session)=>'evidence-local:'+who+':'+session;
async function compress(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024)throw Error('Pilih foto JPG, PNG, atau WEBP, maksimal 20 MB.');
 const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();if(img.naturalWidth<32||img.naturalHeight<32)throw Error('Foto terlalu kecil.');
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
  let blob;for(const quality of [.82,.68,.52,.38]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=MAX)break;}if(!blob||blob.size>MAX)throw Error('Foto masih terlalu besar. Pilih foto yang lebih sederhana.');
  const bytes=new Uint8Array(await blob.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''),image=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
  return {id:crypto.randomUUID(),hash,image,width:canvas.width,height:canvas.height,bytes:blob.size,uploaded:false,at:Date.now()};
 }finally{URL.revokeObjectURL(url);}
}
async function save(session,photo){const who=await account();if(!who)throw Error('Masuk sebagai mahasiswa terlebih dahulu.');await WA.change(()=>photo?{...photo,session,account:who}:null,key(who,session));await WA.change(value=>{const rows=(value||[]).filter(x=>x!==session);if(photo)rows.push(session);return rows.slice(-100);},'evidence-index:'+who);}
async function local(session){return WA.get(key(await account(),session));}
async function flush(){if(flushing)return flushing;return flushing=(async()=>{const s=await WA.get();if(!navigator.onLine||s.profile?.role!=='student'||!s.token||!s.profile.account.approved)return;const who=s.profile.account.id,items=await WA.get('evidence-index:'+who)||[];
 for(const session of items){const row=await WA.get(key(who,session));if(!row||row.uploaded||!row.ready)continue;try{const result=await WA.api('upload-evidence',{id:row.id,session,image:row.image},s.token);if((await WA.get()).profile?.account?.id!==who)return;if(result.hash!==row.hash)throw Error('Berkas foto belum cocok.');await WA.change(old=>old?.id===row.id?{...old,uploaded:true}:old,key(who,session));}catch(error){window.PresenEvidence.lastError=error.message;}}
 })().finally(()=>flushing=null);}
async function mount(form,session){if(!form||form.querySelector('[data-evidence]'))return;
 const box=document.createElement('div');box.dataset.evidence='';box.className='evidence-upload';box.innerHTML='<label>Foto bukti <span class="required-label">Wajib untuk sakit / izin</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-evidence-file></label><p class="small">Gunakan foto yang relevan. Hindari data medis atau orang lain yang tidak diperlukan.</p><div class="evidence-preview" hidden><img alt="Pratinjau foto bukti"><div class="p-actions"><button type="button" data-view-photo>Lihat foto</button><button type="button" data-remove-photo>Hapus foto</button></div></div><p role="status" aria-live="polite" class="small"></p>';form.querySelector('[type=submit],button.primary').before(box);
 let saving;const status=box.querySelector('[role=status]'),preview=box.querySelector('.evidence-preview'),input=box.querySelector('input'),reason=form.elements.reason;
 async function draw(){const row=await local(session.id);preview.hidden=!row;if(row)preview.querySelector('img').src=row.image;status.textContent=row?(row.uploaded?'Bukti tersimpan di server.':navigator.onLine?'Foto siap dikirim bersama keterangan.':'Foto tersimpan. Akan dikirim saat kembali online.'):'';}
 function toggle(){const required=form.elements.mark.value!=='.';box.hidden=!required;if(reason){reason.required=required;reason.closest('label').hidden=!required;}}
 input.onchange=()=>{saving=(async()=>{const file=input.files[0];if(!file)return;status.textContent='Menyiapkan foto…';try{await save(session.id,await compress(file));await draw();}catch(error){status.textContent=error.message;}finally{input.value='';}})();};
 box.querySelector('[data-view-photo]').onclick=async()=>{const row=await local(session.id);if(row)picture(row);};
 box.querySelector('[data-remove-photo]').onclick=async()=>{await save(session.id,null);await draw();};form.addEventListener('change',toggle);form._waitEvidence=()=>saving;toggle();await draw();
}
async function prepare(session,mark,form){await form?._waitEvidence?.();if(mark==='.')return [];if(form&&!form.elements.reason.value.trim())throw Error('Jelaskan alasan sakit atau izin sebelum mengirim.');const row=await local(session.id);if(!row)throw Error('Tambahkan satu foto bukti sebelum mengirim sakit atau izin.');await WA.change(old=>({...old,ready:true}),key(await account(),session.id));if(navigator.onLine)await flush();return [{id:row.id,hash:row.hash}];}
async function show(ref){const s=await WA.get(),who=s.profile?.account?.id;if(!who)throw Error('Masuk kembali untuk melihat foto.');let row=await WA.get('evidence-view:'+who+':'+ref.id);
 if((!row||row.hash!==ref.hash)&&s.profile.role==='student'){for(const session of await WA.get('evidence-index:'+who)||[]){const saved=await WA.get(key(who,session));if(saved?.id===ref.id&&saved.hash===ref.hash){row=saved;break;}}}
 if(!row||row.hash!==ref.hash){if(!navigator.onLine)throw Error('Foto belum tersimpan pada perangkat ini. Buka saat online.');row=await WA.api('read-evidence',{id:ref.id},s.token);if(row.hash!==ref.hash)throw Error('Foto bukti tidak sesuai dengan kiriman.');await WA.change(()=>row,'evidence-view:'+who+':'+ref.id);}
 return picture(row);
}
function picture(row){const d=PresenUI.dialog('Foto bukti','<p class="p-note">Lampiran pribadi dari mahasiswa, hanya untuk meninjau keterangan absensi.</p><img class="evidence-full" alt="Foto bukti dari mahasiswa"><div class="p-actions"><button type="button" data-photo-full>Layar penuh</button></div>');d.classList.add('p-screen-only','evidence-dialog');d.querySelector('img').src=row.image;d.querySelector('[data-photo-full]').onclick=()=>d.classList.toggle('p-evidence-fullscreen');return d;
}
window.PresenEvidence={compress,save,local,mount,prepare,flush,show,lastError:''};window.addEventListener('online',()=>void flush());WA.on(()=>void flush());
})();
