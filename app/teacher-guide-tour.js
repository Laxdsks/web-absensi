/* Injected after the shared chapter catalogue by build-offline.cjs. Teacher web only. */
(()=>{
'use strict';
if(student)return;
if(page==='index')groups.unshift(['Aplikasi mahasiswa: instal & gunakan',[
 step('Unduh atau bagikan APK','Pada bagian Unduh & bagikan Presen Go, tekan Unduh APK terbaru. Dosen dapat membagikan tautan melalui WhatsApp atau menu berbagi perangkat. Untuk berbagi file, unduh APK lalu pilih file tersebut.','#studentAppDownload','home'),
 step('Pasang di Android','Buka APK dari Unduhan. Jika Android meminta izin, aktifkan Izinkan dari sumber ini hanya untuk browser atau pengelola file yang digunakan, lalu pilih Instal. Izin pemasangan tersebut dapat dimatikan lagi setelah selesai.','#studentAppDownload','home'),
 step('Masuk ke kelas dosen','Buka Presen Go. Gunakan undangan kelas dari dosen agar data kelas terisi, lalu masukkan NIM dan nama sesuai daftar serta PIN akun mahasiswa. Pilih daftar jika belum memiliki akun dan tunggu persetujuan dosen. Jangan memakai akun administrator.','#studentAppDownload','home'),
 step('Izinkan kamera dan lokasi','Berikan izin kamera dan lokasi saat diminta. Aktifkan Lokasi/GPS perangkat sebelum mengirim absensi. Jika ditolak, buka Pengaturan Android → Aplikasi → Presen Go → Izin, lalu aktifkan izin yang diperlukan.','#studentAppDownload','home'),
 step('Absen QR atau wajah','Tunggu dosen membuka sesi pertemuan. Pilih QR lalu arahkan kamera ke seluruh kode terbaru dengan jelas; gunakan gambar QR jika tersedia. Untuk pilihan wajah, daftarkan wajah pemilik akun terlebih dahulu, lalu lakukan verifikasi saat sesi aktif. Keduanya merupakan pilihan cara absen.','#studentAppDownload','home'),
 step('Kirim dan periksa hasil','Ikuti konfirmasi di layar setelah pemindaian atau verifikasi, lalu periksa status berhasil serta riwayat pertemuan. Jika sesi sudah selesai, gunakan sesi baru dari dosen. Jika masih antre/offline, sambungkan internet dan periksa status sinkronisasi sebelum menganggap absensi diterima.','#studentAppDownload','home'),
 step('Sakit atau izin dengan bukti','Pilih Sakit atau Izin pada pertemuan yang sesuai. Isi alasan yang jelas dan lampirkan foto bukti sebelum dikirim. Dosen meninjau permohonan dari Pesan mahasiswa. QR balasan digunakan untuk pengajuan sakit/izin sesuai alur aplikasi, bukan pengganti lokasi yang dimatikan.','#studentAppDownload','home'),
 step('Perbarui tanpa menghapus data','Kembali ke bagian unduhan ini untuk mengambil APK terbaru. Pasang sebagai pembaruan pada aplikasi yang sama. Jangan hapus aplikasi atau data hanya untuk memperbarui. Jika Android menolak pembaruan, simpan pesan kesalahannya dan hubungi pengelola sebelum menghapus apa pun.','#studentAppDownload','home')
]]);

if(page==='index'){const appGroup=groups.find(g=>g[0]==='Aplikasi mahasiswa: instal & gunakan');if(appGroup)appGroup[1].splice(1,0,
 step('Buat nama & logo APK sendiri','Tekan Atur nama & logo APK. Isi nama, pilih gambar, geser untuk memotongnya, lalu atur ukuran serta bentuk logo. Pengaturan tersimpan di akun dosen.','[data-brand-editor]','home'),
 step('Simpan & buat APK','Tekan Simpan & buat APK. Proses antre dan penandatanganan dapat memerlukan beberapa menit. Jendela boleh ditutup; status serta tautan hasil tetap tersimpan.','[data-brand-editor]','home'),
 step('Bagikan APK khusus','Setelah status siap, unduh APK khusus atau bagikan tautannya ke WhatsApp dan aplikasi lain. Untuk berbagi file, unduh lalu pilih APK melalui Bagikan file APK. APK khusus dipasang terpisah dari Presen Go; pembaruan APK khusus berikutnya mempertahankan identitas aplikasinya.','#studentAppDownload','home')
);}

// Keep guidance consistent with the current account-backed workflow.
for(const [,steps] of groups)for(const s of steps){
 if(s.title==='Ekspor atau cetak')s.text='Word mengunduh DOCX dan Excel mengunduh XLSX dengan logo tertanam, teks, serta tabel yang dapat diedit. Pilih ukuran kertas dan orientasi; rekap nilai diekspor mendatar. Tanggal di Excel dibagi beberapa baris agar garis kotak tetap lurus. Pustaka ekspor dimuat saat pertama dipakai, jadi sambungkan internet pada penggunaan pertama.';
 if(s.title==='Isi identitas lembar')s.text='Ketuk identitas untuk mengedit. Perubahan disimpan di perangkat dan disinkronkan ke akun saat online. Gunakan kelas dan mata kuliah yang sama di perangkat lain.';
 if(s.title==='Tanggal pertemuan')s.text='Ketuk kotak tanggal untuk memilih atau mengedit tanggal DD/MM/TT. Teks ditampilkan miring tanpa memperbesar kotak tabel. Ukuran berlaku ke semua pertemuan secara bawaan; nonaktifkan pilihan itu jika ingin mengatur satu tanggal saja. Warna, tebal, miring, dan garis bawah ikut tersimpan untuk cetak.';
 if(s.title==='Riwayat kelas')s.text='Pilih prodi, tahun/periode, semester, kelas, mata kuliah, lalu pertemuan. Ringkasan mengikuti pilihan ini. Rekap mahasiswa menampilkan riwayat dalam kelas tersebut; ketuk catatan untuk melihat bukti dan lokasi.';
 if(s.title==='Alamat dan rute')s.text='Buka lokasi mahasiswa dan izinkan GPS; petunjuk jalan otomatis tampil dari posisi Anda ke titik absensinya. Pilih Cara pergi untuk mobil atau jalan kaki. Tombol Lihat jalan ke mahasiswa meminta GPS baru dan menampilkan rutenya. Pencarian tempat lain ada di Tujuan lain (opsional). Google menampilkan jalur, jarak, dan perkiraan waktu di jendela yang sama. Jika layanan peta interaktif tambahan sudah tersambung, ketuk ikon tempat lalu Rute ke sini. Lokasi target (mahasiswa) mengembalikan tujuan ke titik saat absen; tidak ada isian koordinat awal manual.';
 if(s.title==='Bantuan menu')s.text='Ketuk menu untuk langsung berpindah halaman. Pada komputer, arahkan kursor untuk membaca keterangan. Kelas dan mata kuliah tetap mengikuti pilihan Anda.';
 if(s.title==='Perubahan tersimpan')s.text='Perubahan tersimpan di perangkat sebelum berpindah halaman. Sinkronisasi berjalan di latar saat online. Tunggu antrean kosong sebelum membuka data pada perangkat lain.';
 if(['Setujui mahasiswa','Hapus akun percobaan','Terima & setujui'].includes(s.title)){s.prepare=undefined;s.target='#presenInboxLauncher';}
 if(s.title==='Terima & setujui')s.text='Buka Pesan mahasiswa untuk meninjau pendaftaran serta pengajuan sakit/izin dengan alasan dan foto. QR balasan digunakan hanya untuk sakit/izin.';
}
if(['index','data_siswa','absen','ujian'].includes(page))groups.splice(1,0,['Mata kuliah & perangkat',[
 step('Pilih mata kuliah','Pilih mata kuliah tersimpan untuk kelas ini. Pilihan yang sama digunakan oleh data mahasiswa, lembar absen, ujian, dan monitoring.','#teacherCourseSelect','sheet'),
 step('Tambah atau kelola','Ketuk Kelola untuk menambah mata kuliah sendiri atau menghapus pilihan dari daftar. Menghapus pilihan tidak menghapus riwayat absensi atau nilai.','#manageCourses','sheet'),
 step('Buka di perangkat lain','Masuk dengan akun yang sama, lalu pilih kelas dan mata kuliah yang sama. Logo kampus, tampilan, serta pilihan mata kuliah tersimpan di akun.','#courseControl','appearance')
]]);
const host=document.createElement('div');host.className='wa-guide wa-teacher-guide';
host.innerHTML=`<svg class="wa-guide-shade" hidden aria-hidden="true"><path fill-rule="evenodd"></path></svg>
<div class="wa-guide-target" hidden aria-hidden="true"></div>
<svg class="wa-guide-arrow" hidden aria-hidden="true"><defs><marker id="waGuideArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="white" stroke-width="1.5"/></marker></defs><path class="wa-guide-curve" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" marker-end="url(#waGuideArrowHead)"/></svg>
<div class="wa-guide-dock"><button type="button" class="wa-guide-open" aria-label="Buka panduan" aria-expanded="false"></button></div>
<section class="wa-guide-panel" hidden role="region" aria-label="Panduan interaktif">
 <div class="wa-guide-heading"><span>PANDUAN INTERAKTIF</span><button type="button" class="wa-guide-close" aria-label="Tutup panduan">×</button></div>
 <div class="wa-guide-body">
 <label class="wa-guide-topic-label">Topik panduan<select aria-label="Pilih panduan"></select></label>
 <div class="wa-guide-progress"><span></span></div>
 <div class="wa-guide-copy" aria-live="polite"><h3 tabindex="-1"></h3><p class="wa-guide-text"></p><p class="wa-guide-hint" hidden></p></div>
 <details class="wa-guide-example"><summary>Lihat contoh tampilan</summary><img alt="Contoh area yang dijelaskan"></details>

 <details class="wa-guide-status"><summary>Status & tombol bantuan</summary><p>Ketuk garis tipis di tepi layar untuk membuka panduan atau inspektor. Seret untuk memindahkannya ke kiri, kanan, atau posisi lain. Di tepi layar tombol kembali menjadi garis tipis. Posisi tersimpan pada browser ini.</p><p class="wa-guide-sync"></p><label><input type="checkbox" class="wa-guide-status-toggle"> Tampilkan status di halaman</label></details>
 </div>
 <div class="wa-guide-actions"><button type="button" class="wa-guide-prev">← Kembali</button><span class="wa-guide-count"></span><button type="button" class="wa-guide-next">Lanjut →</button></div>
</section>`;
document.body.append(host);
const q=s=>host.querySelector(s),dock=q('.wa-guide-dock'),panel=q('.wa-guide-panel'),frame=q('.wa-guide-target'),shade=q('.wa-guide-shade'),arrow=q('.wa-guide-arrow'),select=q('select');
let chapter=0,index=0,target=null,returnFocus=null,scheduled=0,generation=0,cleanups=[],preparing=null,lastDialog=null;
const edgeGuide=window.PresenEdgeTools.mount(q('.wa-guide-open'),{key:'guide',label:'Buka panduan',y:.55});
groups.forEach((g,i)=>select.add(new Option(g[0],i)));
const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
function viewport(){const v=window.visualViewport;return{x:v?.offsetLeft||0,y:v?.offsetTop||0,w:v?.width||innerWidth,h:v?.height||innerHeight};}
function dockPosition(){edgeGuide.position();}
function attach(){const dialog=[...document.querySelectorAll('dialog[open]')].filter(d=>!host.contains(d)).at(-1),parent=dialog||document.body;if(host.parentElement!==parent)parent.append(host);if(!panel.hidden&&host.showPopover){host.setAttribute('popover','manual');if(lastDialog!==dialog&&host.matches(':popover-open'))host.hidePopover();if(!host.matches(':popover-open'))host.showPopover();}lastDialog=dialog;}
function release(){for(const fn of cleanups.splice(0).reverse())try{fn();}catch(_){}preparing=null;}
function close(){generation++;panel.hidden=frame.hidden=true;shade.setAttribute('hidden','');arrow.setAttribute('hidden','');if(host.hasAttribute('popover')){if(host.matches(':popover-open'))host.hidePopover();host.removeAttribute('popover');}target=null;release();attach();dock.hidden=false;q('.wa-guide-open').setAttribute('aria-expanded','false');if(visible(returnFocus))returnFocus.focus({preventScroll:true});}
function rect(){
 if(!visible(target))return null;const topDialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(topDialog&&!topDialog.contains(target))return null;
 const v=viewport(),raw=target.getBoundingClientRect();let left=Math.max(v.x+8,raw.left-5),right=Math.min(v.x+v.w-8,raw.right+5),top=Math.max(v.y+8,raw.top-5),bottom=Math.min(v.y+v.h-8,raw.bottom+5);
 for(let p=target.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}
 const toolbar=document.getElementById('topToolbar');if(visible(toolbar)&&!toolbar.contains(target)&&getComputedStyle(toolbar).position==='fixed')top=Math.max(top,toolbar.getBoundingClientRect().bottom+6);
 // Large tables/forms are introduced at their top, leaving room for the explanation.
 bottom=Math.min(bottom,top+Math.min(170,v.h*.28));if(right-left<6||bottom-top<6)return null;return{left,right,top,bottom,width:right-left,height:bottom-top};
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function position(){
 dockPosition();if(panel.hidden)return;attach();const v=viewport(),r=rect(),gap=34,pad=12;q('.wa-guide-hint').hidden=!!r;panel.style.maxHeight=Math.min(430,v.h-24)+'px';panel.style.width=Math.min(352,v.w-24)+'px';
 const pw=panel.offsetWidth,ph=panel.offsetHeight;let x=v.x+(v.w-pw)/2,y=v.y+v.h-ph-pad,side='none';
 if(r){const below=v.y+v.h-r.bottom-pad,above=r.top-v.y-pad;
  if(below>=ph+gap){y=r.bottom+gap;x=clamp(r.left+(r.width-pw)/2,v.x+pad,v.x+v.w-pw-pad);side='below';}
  else if(above>=ph+gap){y=r.top-gap-ph;x=clamp(r.left+(r.width-pw)/2,v.x+pad,v.x+v.w-pw-pad);side='above';}
  else if(r.right+gap+pw<v.x+v.w-pad){x=r.right+gap;y=clamp(r.top,v.y+pad,v.y+v.h-ph-pad);side='right';}
  else if(r.left-gap-pw>v.x+pad){x=r.left-gap-pw;y=clamp(r.top,v.y+pad,v.y+v.h-ph-pad);side='left';}
  else{side=above>below?'above':'below';const available=Math.max(110,(side==='above'?above:below)-gap);panel.style.maxHeight=available+'px';const height=panel.offsetHeight;y=side==='above'?r.top-gap-height:r.bottom+gap;}
 }
 panel.style.left=x+'px';panel.style.top=clamp(y,v.y+pad,v.y+v.h-panel.offsetHeight-pad)+'px';panel.dataset.placement=side;
 shade.removeAttribute('hidden');frame.hidden=!r;arrow.toggleAttribute('hidden',!r);for(const svg of[shade,arrow])svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
 const outer=`M0 0H${innerWidth}V${innerHeight}H0Z`,hole=r?`M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`:'';shade.querySelector('path').setAttribute('d',outer+hole);
 if(r){frame.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const box=panel.getBoundingClientRect();let sx,sy,ex,ey;if(side==='below'||side==='above'){sx=clamp(r.left+r.width*.6,box.left+24,box.right-24);sy=side==='below'?box.top:box.bottom;ex=clamp(sx-12,r.left+6,r.right-6);ey=side==='below'?r.bottom+3:r.top-3;}else{sx=side==='right'?box.left:box.right;sy=clamp(r.top+r.height*.5,box.top+25,box.bottom-25);ex=side==='right'?r.right+3:r.left-3;ey=clamp(sy-10,r.top+5,r.bottom-5);}
  q('.wa-guide-curve').setAttribute('d',`M${sx},${sy} Q${(sx+ex)/2+12},${(sy+ey)/2} ${ex},${ey}`);
 }
}
function schedule(){if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;position();});}
function locate(s){
 const matches=[...document.querySelectorAll(s.target)];let el=matches.find(visible)||matches[0];
 for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open){p.open=true;cleanups.push(()=>p.open=false);}
 return el;
}
function prepare(s){
 if(preparing===s.prepare)return;release();preparing=s.prepare;
 const before=new Set(document.querySelectorAll('dialog[open]')),sidebar=document.getElementById('sidebar'),sideOpen=sidebar?.classList.contains('active')||sidebar?.classList.contains('open'),qr=document.getElementById('attendanceQRPanel'),qrHidden=qr?.hidden;
 try{s.prepare?.();}catch(_){}
 for(const dialog of document.querySelectorAll('dialog[open]'))if(!before.has(dialog))cleanups.push(()=>{if(dialog.open)dialog.close();});
 if(sidebar&&!sideOpen&&(sidebar.classList.contains('active')||sidebar.classList.contains('open')))cleanups.push(()=>window.toggleSidebar?.());
 if(qrHidden&&qr&&!qr.hidden)cleanups.push(()=>{if(!qr.hidden)document.getElementById('openAttendanceQR')?.click();});
}
function render(){
 const ticket=++generation,s=groups[chapter][1][index];select.value=String(chapter);prepare(s);attach();target=locate(s);
 q('h3').textContent=s.title;q('.wa-guide-text').textContent=s.text;q('img').src=new URL('guide-images/'+s.image+'.png',rootURL);q('.wa-guide-example').open=false;
 const available=visible(target);q('.wa-guide-hint').hidden=available;q('.wa-guide-hint').textContent='Area ini muncul setelah langkah sebelumnya selesai. Lihat contoh atau lanjutkan panduan; data Anda tidak diubah oleh panduan.';
 q('.wa-guide-count').textContent=`${index+1} / ${groups[chapter][1].length}`;q('.wa-guide-progress span').style.width=((index+1)/groups[chapter][1].length*100)+'%';q('.wa-guide-prev').disabled=index===0;q('.wa-guide-next').textContent=index===groups[chapter][1].length-1?'Selesai ✓':'Lanjut →';
 if(available){const item=target.matches('table,tbody')?target.querySelector('tr')||target:target;item.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});}
 q('.wa-guide-body').scrollTop=0;position();requestAnimationFrame(()=>{if(ticket===generation){position();q('h3').focus({preventScroll:true});}});
}
function open(which=chapter){returnFocus=document.activeElement;chapter=clamp(Number(which)||0,0,groups.length-1);index=0;panel.hidden=false;dock.hidden=true;q('.wa-guide-open').setAttribute('aria-expanded','true');window.PresenWorkspace?.close();render();}
q('.wa-guide-open').onclick=()=>open();q('.wa-guide-close').onclick=close;
select.onchange=()=>{chapter=Number(select.value);index=0;render();};q('.wa-guide-prev').onclick=()=>{index=Math.max(0,index-1);render();};q('.wa-guide-next').onclick=()=>{if(index===groups[chapter][1].length-1)close();else{index++;render();}};
const toggle=q('.wa-guide-status-toggle');toggle.checked=get('status')==='1';toggle.onchange=()=>{put('status',toggle.checked?'1':'0');document.documentElement.dataset.waShowStatus=toggle.checked?'1':'0';};

async function status(){let s;try{s=await window.WA?.get();}catch(_){}const pending=s?.outbox?.length||0;q('.wa-guide-dot').classList.toggle('pending',!navigator.onLine||pending>0);q('.wa-guide-sync').textContent=(navigator.onLine?'Online':'Offline')+' · '+pending+' perubahan menunggu sinkronisasi';}
void status();window.WA?.on(()=>void status());window.addEventListener('online',status);window.addEventListener('offline',status);
new MutationObserver(records=>{if(panel.hidden||records.every(r=>host.contains(r.target)))return;attach();target=[...document.querySelectorAll(groups[chapter][1][index].target)].find(visible)||target;schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','class']});
window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);q('.wa-guide-example').addEventListener('toggle',schedule);q('img').onload=schedule;
document.addEventListener('keydown',e=>{if(panel.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(!e.target.matches('input,select,textarea,[contenteditable=true]')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();q(e.key==='ArrowRight'?'.wa-guide-next':'.wa-guide-prev').click();}},true);
// Both the ribbon Panduan button and edge help use this one tour; no stacked legacy overlay.
document.addEventListener('click',e=>{if(e.target.closest('#tourBtnGuide,[onclick*="mulaiTurInteraktif"]')){e.preventDefault();e.stopImmediatePropagation();open(0);}},true);
window.mulaiTurInteraktif=()=>open(0);window.tutupTurInteraktif=close;
window.PresenTeacherGuide={open,close,groups:groups.map(g=>({title:g[0],steps:g[1].map(s=>({title:s.title,target:s.target}))}))};dockPosition();
})();
