/* Bang Motion principles adapted to short, accessible application interactions. */
(()=>{
'use strict';if(!window.WA||!window.PresenUI)return;const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let historyState,historyKey='',mounting=false;
// Keep common tasks first; preserve the original buttons, IDs and handlers.
function structureToolbar(){
 const toolbar=document.getElementById('topToolbar');if(!toolbar||toolbar.dataset.layoutReady)return;
 toolbar.dataset.layoutReady='1';toolbar.classList.add('p-ribbon');
 const create=(name,title)=>{const group=document.createElement('div');group.className='toolbar-group sheet-'+name;group.setAttribute('role','group');group.setAttribute('aria-label',title);const label=document.createElement('span');label.className='sheet-group-label';label.textContent=title;group.append(label);return group;};
 const primary=create('primary','Tindakan'),exports=create('exports','Unduh / cetak'),format=create('format','Teks & tampilan'),paper=create('paper','Kertas'),structure=create('structure','Struktur tabel');
 const actionbar=document.createElement('div');actionbar.className='sheet-actionbar';const tools=document.createElement('div');tools.className='sheet-tools';actionbar.append(primary,exports);tools.append(format,paper,structure);
 const structural=new Set(['tourBtnTambah','tourBtnHapus','tourBtnKolom','tourBtnHapusKolom','tourBtnHapusPermanen']);
 const old=[...toolbar.children].filter(el=>el.matches('.toolbar-group,.toolbar-row'));
 for(const group of old)for(const el of [...group.children]){
  const action=el.getAttribute('onclick')||'';
  if(/(?:exportWord|exportExcel|eksporWordUjian|eksporExcelUjian|cetakDokumen|cetakLembarUjian|toggleToolbar)\(/.test(action))exports.append(el);
  else if(structural.has(el.id)){structure.append(el);if(/Hapus/.test(el.id))el.classList.add('p-destructive');}
  else if(['tourBtnGuide','openAttendanceQR','tourBtnRekap'].includes(el.id)||/mulaiTurInteraktif\(/.test(action))primary.append(el);
  else if(el.matches('select'))paper.append(el);
  else format.append(el);
 }
 old.forEach(el=>el.remove());toolbar.append(actionbar,tools);
 if(primary.children.length===1)primary.remove();if(structure.children.length===1)structure.remove();if(paper.children.length===1)paper.remove();
 for(const button of exports.querySelectorAll('button')){
  if(/cetakDokumen|cetakLembarUjian/.test(button.getAttribute('onclick')||''))button.classList.add('p-primary-action');
  if(button.classList.contains('hide-toolbar-inline')){button.setAttribute('aria-label','Sembunyikan pita alat');button.title='Sembunyikan pita alat';for(const node of [...button.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){const span=document.createElement('span');span.className='sheet-hide-label';span.textContent=node.textContent;node.replaceWith(span);}}
 }
 const music=()=>{const button=document.getElementById('absensiMusicLauncher');if(button)exports.append(button);};music();document.addEventListener('DOMContentLoaded',music,{once:true});
}
structureToolbar();
function structureRoster(){
 const table=document.getElementById('tabelSiswa');if(!table)return;
 const parent=table.closest('.content-card'),search=document.getElementById('searchInput');
 const counter=document.createElement('p');counter.id='teacherRosterCount';counter.className='teacher-roster-count';counter.setAttribute('role','status');table.closest('.table-responsive').before(counter);
 const reset=document.getElementById('deleteAllStudentData');if(reset){const zone=document.createElement('details');zone.className='teacher-data-management';zone.innerHTML='<summary>Pengelolaan data permanen</summary><p>Reset menghapus seluruh data mahasiswa, akun, absensi, dan nilai pada akun dosen ini di semua prodi, semester, dan kelas. Data dosen lain tetap terpisah.</p>';zone.append(reset);parent.append(zone);}
 const card=document.getElementById('photoImportCard');if(card){
  const intro=card.querySelector(':scope > p');if(intro){const help=document.createElement('details');help.className='teacher-import-help';help.innerHTML='<summary>Cara impor & format berkas</summary>';intro.before(help);help.append(intro);}
  const steps=document.createElement('ol');steps.className='teacher-import-steps';steps.setAttribute('aria-label','Tahapan impor');steps.innerHTML='<li><span>1</span>Pilih berkas</li><li><span>2</span>Periksa hasil</li><li><span>3</span>Simpan daftar</li>';card.querySelector('h3').after(steps);
 }
 const update=()=>window.filterTabelSiswa?.();new MutationObserver(update).observe(table.tBodies[0],{childList:true});search?.addEventListener('input',update);update();
}
structureRoster();
// Animate each newly opened surface once. Closing and camera cleanup remain native.
const motionPreference=matchMedia('(prefers-reduced-motion:reduce)'),boundSurfaces=new WeakSet(),activeMotion=new Set();
function lift(el,tab=false){
 if(motionPreference.matches||!el?.animate)return;el.classList.add('p-depth-surface');
 const effect=el.animate(tab?[{transform:'translate3d(0,6px,0)'},{transform:'none'}]:[{transform:'perspective(1100px) translate3d(0,12px,0) rotateX(1.3deg) scale(.985)',opacity:.96},{transform:'none',opacity:1}],{duration:tab?160:220,easing:'cubic-bezier(.2,.75,.25,1)'});
 activeMotion.add(effect);effect.finished.catch(()=>{}).finally(()=>activeMotion.delete(effect));
}
motionPreference.addEventListener('change',()=>{if(motionPreference.matches)for(const effect of activeMotion)effect.cancel();});
function bindSurface(el){
 if(boundSurfaces.has(el))return;boundSurfaces.add(el);let wasOpen=false;
 const changed=()=>{const open=el.tagName==='DIALOG'?el.open:el.classList.contains('show')||el.classList.contains('active')||['flex','block','grid'].includes(el.style.display);if(open&&!wasOpen)lift(el.querySelector(':scope > .modal-content,:scope > .rekap-modal-content,:scope > .custom-modal-box')||el);wasOpen=open;};
 new MutationObserver(changed).observe(el,{attributes:true,attributeFilter:['open','class','style']});changed();
}
const surfaces='dialog,.custom-modal,.custom-modal-overlay,.rekap-modal-overlay';document.querySelectorAll(surfaces).forEach(bindSurface);
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches(surfaces))bindSurface(node);node.querySelectorAll?.(surfaces).forEach(bindSurface);}}).observe(document.body,{childList:true});
let navigationTimer;
function navigation(){
 clearTimeout(navigationTimer);document.documentElement.dataset.navigating='1';
 let bar=document.getElementById('presenNavigationProgress');if(!bar){bar=document.createElement('div');bar.id='presenNavigationProgress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Membuka halaman');document.body.append(bar);}bar.hidden=false;
 const done=()=>{clearTimeout(navigationTimer);delete document.documentElement.dataset.navigating;bar.hidden=true;};navigationTimer=setTimeout(done,8000);window.addEventListener('pagehide',done,{once:true});window.addEventListener('pageshow',done,{once:true});return done;
}
function studentFlow(){
 const panel=document.getElementById('studentAttendancePanel');if(!panel)return;
 let steps=panel.querySelector('.student-flow');if(!steps){steps=document.createElement('ol');steps.className='student-flow';steps.setAttribute('aria-label','Langkah absensi');for(const p of panel.querySelectorAll(':scope > p.small'))if(p.textContent==='Pilih QR atau wajah, lengkapi keterangan, lalu kirim.')p.remove();steps.innerHTML='<li data-flow="scan"><span>1</span>Pilih metode</li><li data-flow="fill"><span>2</span>Isi absen</li><li data-flow="sent"><span>3</span>Kirim</li>';panel.querySelector('.student-attendance-methods').before(steps);}
 const stage=document.querySelector('#studentSession #replyForm')?'fill':document.querySelector('#studentSession .present,#studentSession .absent,#studentSession .pending')?'sent':'scan';
 if(panel.dataset.flow!==stage){panel.dataset.flow=stage;steps.querySelectorAll('li').forEach(el=>{if(el.dataset.flow===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
 const scan=document.getElementById('scanSession'),text=stage==='scan'?'Pindai QR dosen':'Pindai QR lain';if(scan.textContent!==text)scan.textContent=text;scan.classList.toggle('student-scan-secondary',stage!=='scan');
}

// Page content stays visible. Dialogs and controls keep their own short motion;
// sync events must never fade the entire workspace out and back in.

function view(name){if(!['attendance','history','messages','account'].includes(name)||document.body.dataset.studentView===name)return;document.body.dataset.studentView=name;const heading=document.getElementById('studentPageTitle');if(heading)heading.textContent={attendance:'Absensi',history:'Riwayat',messages:'Pesan',account:'Akun'}[name];document.querySelectorAll('.student-bottom-nav button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.studentView===name)));if(name==='history'&&historyState)void history(historyState,true);const panel=document.getElementById({attendance:'studentAttendancePanel',history:'studentHistoryPanel',messages:'studentNotifications',account:'studentAccountPanel'}[name]);lift(panel,true);scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
async function faceStatus(){const box=document.getElementById('studentFaceSettings');if(!box)return;const enabled=await PresenFace.enrolled();box.querySelector('[data-face-state]').textContent=enabled?'Tersimpan · pilihan wajah siap digunakan':'Belum diaktifkan';box.querySelector('[data-face-enroll]').textContent=enabled?'Daftarkan ulang':'Daftarkan wajah';box.querySelector('[data-face-remove]').hidden=!enabled;}
async function mountStudent(){if(mounting)return;mounting=true;try{const main=document.getElementById('main'),s=await WA.get();if(!main||s.profile?.role!=='student'||!document.getElementById('studentAttendancePanel')){document.querySelector('.student-bottom-nav')?.remove();delete document.body.dataset.studentView;return;}
 if(!document.body.dataset.studentView)document.body.dataset.studentView='attendance';const title=document.getElementById('studentPageTitle');if(title)title.textContent={attendance:'Absensi',history:'Riwayat',messages:'Pesan',account:'Akun'}[document.body.dataset.studentView];let account=document.getElementById('studentAccountPanel');if(!account){account=document.createElement('section');account.id='studentAccountPanel';account.innerHTML='<h2>Akun & keamanan</h2><div id="studentFaceSettings"><div class="row"><div><h3>Verifikasi wajah</h3><p class="small" data-face-state></p></div>'+PresenUI.icon('users')+'</div><p class="small">Pencocokan akun sendiri. Data wajah terenkripsi hanya di perangkat ini.</p><div class="p-actions"><button type="button" data-face-enroll>Daftarkan wajah</button><button type="button" data-face-remove hidden>Hapus data wajah</button></div><p class="small" data-face-feedback role="status"></p></div>';main.append(account);account.querySelector('[data-face-enroll]').onclick=async e=>{e.target.disabled=true;try{await PresenFace.enroll();account.querySelector('[data-face-feedback]').textContent='Wajah tersimpan. Pilih Absen dengan wajah atau gunakan QR tanpa pemeriksaan wajah.';await faceStatus();}catch(error){account.querySelector('[data-face-feedback]').textContent=error.message;}finally{e.target.disabled=false;}};account.querySelector('[data-face-remove]').onclick=async()=>{if(confirm('Hapus data pencocokan wajah dari perangkat ini? Catatan absensi tetap tersimpan.')){await PresenFace.forget();await faceStatus();}};await faceStatus();}
 let summary=account.querySelector('.student-account-summary');if(!summary){summary=document.createElement('div');summary.className='student-account-summary';summary.innerHTML='<span class="student-account-mark">'+PresenUI.icon('users')+'</span><div><h2></h2><p class="small"></p></div>';account.prepend(summary);}summary.querySelector('h2').textContent=s.profile.account.nama;summary.querySelector('p').textContent=s.profile.account.nim+' · '+s.profile.account.ctx.prodi;
 let preferences=account.querySelector('.student-preferences');if(!preferences){preferences=document.createElement('div');preferences.className='student-preferences';preferences.innerHTML='<h3>Pemberitahuan</h3><p class="small">Pengingat sesi dan hasil persetujuan dosen.</p>';account.append(preferences);}for(const id of ['enableNotices','disableNotices']){const button=document.getElementById(id);if(button&&button.parentElement!==preferences)preferences.append(button);}
 if(!account.querySelector('[data-student-logout]')){const button=document.createElement('button');button.type='button';button.dataset.studentLogout='';button.className='student-logout';button.textContent='Keluar akun';button.onclick=()=>document.getElementById('logout')?.click();account.append(button);}
 const session=document.getElementById('studentSession');if(session&&!session.dataset.flowBound){session.dataset.flowBound='1';new MutationObserver(studentFlow).observe(session,{childList:true});}studentFlow();
 const actions=document.getElementById('studentAccountActions');if(actions&&actions.parentElement!==account)account.insertBefore(actions,account.querySelector('[data-student-logout]'));const notices=document.getElementById('studentNotifications');if(notices)notices.classList.add('student-message-panel');
 if(!document.querySelector('.student-bottom-nav')){const nav=document.createElement('nav');nav.className='student-bottom-nav p-screen-only';nav.setAttribute('aria-label','Menu mahasiswa');nav.innerHTML=[['attendance','qr','Absen'],['history','sheet','Riwayat'],['messages','bell','Pesan'],['account','users','Akun']].map(([id,icon,title])=>`<button type="button" data-student-view="${id}" aria-current="${document.body.dataset.studentView===id}">${PresenUI.icon(icon)}<span>${title}</span></button>`).join('');document.body.append(nav);}
 const messages=document.getElementById('studentMessages');if(messages)messages.onclick=()=>view('messages');
 }finally{mounting=false;}}
async function history(s,force=false){historyState=s;const host=document.getElementById('history');if(!host)return;const key=JSON.stringify(s.snapshot.marks);if(!force&&historyKey===key&&host.querySelector('form'))return;historyKey=key;const previous=host.querySelector('form')?Object.fromEntries(new FormData(host.querySelector('form'))):{};
 host.innerHTML='<form class="student-history-filters"><label>Dari<input type="date" name="from"></label><label>Sampai<input type="date" name="to"></label><label>Status<select name="mark"><option value="">Semua</option><option value=".">Hadir</option><option value="S">Sakit</option><option value="I">Izin</option><option value="A">Tidak hadir</option></select></label><label>Urutkan<select name="sort"><option value="new">Terbaru</option><option value="old">Terlama</option></select></label></form><div data-student-history-list></div>';
 const form=host.querySelector('form');for(const [name,value]of Object.entries(previous))if(form.elements[name])form.elements[name].value=value;form.onsubmit=e=>e.preventDefault();function draw(){const f=Object.fromEntries(new FormData(form)),rows=s.snapshot.marks.filter(x=>x.mark).map(x=>{const session=s.snapshot.sessions.find(t=>t.scope===x.scope&&t.slot===x.slot);return {...x,course:session?.matkul||'Mata kuliah',day:session?.day||WA.day(x.recorded_at||WA.now(s))};}).filter(x=>(!f.mark||x.mark===f.mark)&&(!f.from||x.day>=f.from)&&(!f.to||x.day<=f.to)).sort((a,b)=>f.sort==='old'?a.recorded_at-b.recorded_at:b.recorded_at-a.recorded_at);const list=host.querySelector('[data-student-history-list]');list.innerHTML=rows.map((x,i)=>`<details class="student-history-item"><summary><span><b>${E(x.course)}</b><small>${E(x.day)} · Pertemuan ${x.slot}</small></span><span class="status-pill">${E(x.mark==='.'?'Hadir':x.mark==='S'?'Sakit':x.mark==='I'?'Izin':'Tidak hadir')}</span></summary><p>${E(x.reason||'Tidak ada keterangan tambahan.')}</p><p class="small">${x.review_status==='pending'?'Menunggu dosen meninjau':x.review_status==='rejected'?'Keterangan ditolak dosen':'Tercatat'}${x.attachments?.length?(x.evidence_ready?' · Bukti diterima':' · Foto menunggu sinkronisasi'):''}</p>${(x.attachments||[]).map((ref,j)=>`<button type="button" data-photo-row="${i}" data-photo-ref="${j}">Lihat foto bukti</button>`).join('')}</details>`).join('')||'<p class="small">Belum ada riwayat pada pilihan ini.</p>';list.querySelectorAll('[data-photo-row]').forEach(b=>b.onclick=async()=>{try{await PresenEvidence.show(rows[b.dataset.photoRow].attachments[b.dataset.photoRef]);}catch(error){const p=document.createElement('p');p.className='small';p.textContent=error.message;b.after(p);}});}
 form.oninput=draw;draw();
}
const main=document.getElementById('main');if(main)new MutationObserver(()=>void mountStudent()).observe(main,{childList:true});window.addEventListener('presen-face-changed',()=>void faceStatus());WA.on(()=>{void mountStudent();});document.addEventListener('click',e=>{const target=e.target.closest('[data-student-view]');if(target&&target.tagName==='BUTTON')view(target.dataset.studentView);});window.PresenExperience={history,view,mountStudent,navigation};void mountStudent();
})();
