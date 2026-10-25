/* Course choices belong to the teacher and class, across browsers and devices. */
(()=>{'use strict';
if(!window.WA)return;
function catalogue(s,c){
 const entries=new Map();
 for(const row of [...(s.snapshot.sessions||[]),...(s.snapshot.documents||[])])if(row.matkul?.trim()&&WA.sameCtx(row.ctx,c))entries.set(row.matkul,{matkul:row.matkul,hidden:false,updatedAt:Number(row.updated_at||row.starts)||0});
 for(const row of s.snapshot.courses||[])if(WA.sameCtx(row.ctx,c))entries.set(row.matkul,row);
 for(const op of s.outbox||[])if(/^course-/.test(op.type)&&WA.sameCtx(op.ctx,c)&&op.matkul)entries.set(op.matkul,{matkul:op.matkul,hidden:op.type==='course-hide',updatedAt:Date.now()});
 return [...entries.values()].filter(row=>!row.hidden).sort((a,b)=>b.updatedAt-a.updatedAt||a.matkul.localeCompare(b.matkul));
}
function resolve(s,c,requested,local=''){
 if(requested?.trim())return requested.trim();
 const choices=catalogue(s,c),pending=(s.outbox||[]).filter(o=>/^course-(select|upsert)$/.test(o.type)&&WA.sameCtx(o.ctx,c)).at(-1),selected=pending?.matkul??s.snapshot.courseSelections?.find(x=>WA.sameCtx(x.ctx,c))?.matkul;
 return choices.find(x=>x.matkul===selected)?.matkul||choices.find(x=>x.matkul===local)?.matkul||choices[0]?.matkul||'';
}
async function remember(c,name){
 const s=await WA.get();if(s.profile?.role!=='teacher')return;
 const selected=(s.outbox||[]).filter(o=>/^course-(select|upsert)$/.test(o.type)&&WA.sameCtx(o.ctx,c)).at(-1)?.matkul??s.snapshot.courseSelections?.find(x=>WA.sameCtx(x.ctx,c))?.matkul;
 if(selected!==name&&name)await WA.queue({type:'course-select',ctx:c,matkul:name});
}
async function refreshOfflineReader(){
 // Older workers request an unversioned teacher runtime when reopening offline.
 const script=document.querySelector('script[src*="runtime-teacher-"]');if(!navigator.onLine||!window.caches||!script)return;
 try{for(const key of await caches.keys()){if(!key.startsWith('wa-public-'))continue;const cache=await caches.open(key),response=await cache.match(script.src);if(response){const url=new URL(script.src);url.search='';await cache.put(url.href,response);}}}catch(_){/* Online navigation remains available when storage is full. */}
}
let mounted=false,current='',page='',baseCtx,root,select,status,hidden;
function context(){if(page!=='index')return baseCtx;const form=document.querySelector('.main-card form');return WA.ctx({...baseCtx,...Object.fromEntries(new FormData(form))});}
async function refresh(){if(!mounted)return;const s=await WA.get();if(s.profile?.role!=='teacher'){root.hidden=true;return;}root.hidden=false;const c=context(),rows=catalogue(s,c);if(page==='index')current=resolve(s,c,'',WA.sameCtx(c,s.selection||c)?s.selection?.matkul:'');const names=rows.map(x=>x.matkul);if(current&&!names.includes(current))names.unshift(current);select.replaceChildren(new Option(names.length?'Pilih mata kuliah':'Belum ada mata kuliah',''));for(const name of names)select.add(new Option(name,name));select.value=current;select.options[0].disabled=!!names.length;if(hidden)hidden.value=current;const pending=s.outbox.some(o=>/^course-/.test(o.type));status.textContent=pending?'Pilihan tersimpan di perangkat · menunggu sinkronisasi':current?'Tersimpan di akun · digunakan pada absen, ujian, dan rekap nilai':'Tambah mata kuliah atau pilih dari data tersimpan.';}
async function choose(name){
 name=String(name||'').trim();const c=context();await window.WAFlush?.();await remember(c,name);await WA.change(s=>({...s,selection:{...c,matkul:name}}));if(navigator.onLine)await WA.sync();current=name;
 if(page==='index'){await refresh();return;}
 const url=new URL(location.href);for(const[k,v]of Object.entries({...c,matkul:name}))url.searchParams.set(k,v);
 if(window.AbsensiUIAudio?.navigateApplication)window.AbsensiUIAudio.navigateApplication(url.href);else location.assign(url.href);
}
function showError(message){status.textContent=message;window.showToast?.(message,'error');}
async function manage(){
 const dialog=PresenUI.dialog('Mata kuliah kelas ini','<p>Daftar ini tersimpan khusus di akun dan kelas Anda. Menghapus pilihan dari daftar tidak menghapus absen atau nilai; tambahkan nama yang sama untuk membukanya kembali.</p><form id="courseAddForm"><label for="courseNewName">Nama mata kuliah</label><input id="courseNewName" name="name" maxlength="180" required placeholder="Misalnya Profesi Pendidikan" autocomplete="off"><button type="submit">Tambah & gunakan</button></form><div id="courseList"></div><p id="courseNotice" role="status"></p>');dialog.classList.add('p-course-dialog');
 const notice=dialog.querySelector('#courseNotice');
 async function paint(){const s=await WA.get(),list=dialog.querySelector('#courseList');list.replaceChildren();for(const row of catalogue(s,context())){const item=document.createElement('div');item.className='p-course-row';const use=document.createElement('button'),remove=document.createElement('button');use.type=remove.type='button';use.textContent=row.matkul;use.setAttribute('aria-label','Gunakan '+row.matkul);use.onclick=()=>void run(async()=>{dialog.close();await choose(row.matkul);});remove.textContent='Hapus';remove.setAttribute('aria-label','Hapus pilihan '+row.matkul);remove.onclick=()=>void run(async()=>{await window.WAFlush?.();await WA.queue({type:'course-hide',ctx:context(),matkul:row.matkul});if(navigator.onLine)await WA.sync();if(row.matkul===current){const next=catalogue(await WA.get(),context())[0]?.matkul||'';dialog.close();await choose(next);}else{await paint();await refresh();notice.textContent='Pilihan dihapus dari daftar. Absen dan nilai tetap tersimpan.';}});item.append(use,remove);list.append(item);}if(!list.children.length)list.textContent='Belum ada mata kuliah tersimpan untuk kelas ini.';}
 async function run(fn){try{await fn();}catch(error){notice.textContent=error.message;}}
 dialog.querySelector('form').onsubmit=e=>{e.preventDefault();void run(async()=>{const name=dialog.querySelector('#courseNewName').value.trim();if(!name)throw Error('Isi nama mata kuliah.');await window.WAFlush?.();await WA.queue({type:'course-upsert',ctx:context(),matkul:name});dialog.close();await choose(name);});};await paint();
}
async function mount(c,name,which){
 if(mounted||!['index','data_siswa','absen','ujian'].includes(which))return;mounted=true;current=name;page=which;baseCtx=c;
 const style=document.createElement('style');style.textContent='.p-course-control{grid-column:1/-1;width:100%;display:grid;align-content:start;gap:6px;min-width:0;flex:0 0 auto;padding:8px 0;text-align:left}.p-course-control>label{margin:0!important;font-size:12px;font-weight:600;line-height:1.4}.p-course-actions{display:flex;gap:8px;align-items:center;min-width:0}.p-course-actions select{flex:1;min-width:0;width:100%;max-width:460px}.p-course-actions select,.p-course-actions button,.p-course-dialog input,.p-course-dialog button{font:inherit;min-height:40px;border:1px solid var(--ui-border,#526173);border-radius:9px;padding:8px 12px;background:var(--ui-input,#172b40);color:var(--ui-text,#f8fafc)}.p-course-control small{display:block;margin:0;font-size:11px;line-height:1.5;color:var(--ui-muted,#a5b5c5)}.p-course-dialog{max-width:620px!important}.p-course-dialog form{display:grid;gap:10px;margin:18px 0}.p-course-row{display:flex;gap:8px;margin:8px 0}.p-course-row button:first-child{flex:1;text-align:left;white-space:normal;overflow-wrap:anywhere}.p-course-dialog p{line-height:1.6}.p-course-dialog input{width:100%}@media print{.p-course-control{display:none!important}}';document.head.append(style);
 root=document.createElement('section');root.className='p-course-control p-screen-only';root.id='courseControl';root.innerHTML='<label for="teacherCourseSelect">Mata kuliah</label><div class="p-course-actions"><select id="teacherCourseSelect" aria-label="Mata kuliah tersimpan"></select><button type="button" id="manageCourses">Kelola</button></div><small role="status"></small>';
 select=root.querySelector('select');status=root.querySelector('small');select.onchange=()=>void choose(select.value).catch(e=>showError(e.message));root.querySelector('button').onclick=()=>void manage().catch(e=>showError(e.message));
 const form=document.querySelector('.main-card form');if(page==='index'&&form){form.querySelector('[type=submit]').before(root);hidden=document.createElement('input');hidden.type='hidden';hidden.name='matkul';form.append(hidden);for(const field of form.querySelectorAll('select:not(#teacherCourseSelect)'))field.addEventListener('change',()=>void refresh());}
 else{const toolbar=document.querySelector('#topToolbar');if(toolbar){const nav=toolbar.querySelector('.p-worknav');if(nav)nav.after(root);else toolbar.prepend(root);}else (document.querySelector('.card-header-flex')||document.body).append(root);}
 const field=document.querySelector('[data-app-course]');if(field){field.contentEditable='false';field.title='Pilih atau tambah mata kuliah melalui menu Mata kuliah';field.onclick=()=>void manage();}
 WA.on(()=>void refresh());await refresh();await refreshOfflineReader();
}
window.PresenCourses={catalogue,resolve,remember,mount,choose,manage,setCurrent:name=>{current=name;void refresh();}};
})();
