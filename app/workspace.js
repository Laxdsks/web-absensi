/* Read-only menu previews on the original teacher pages; full pages keep their own editors. */
(()=>{
'use strict';if(!window.PresenUI||document.getElementById('main'))return;
const page=location.pathname.split('/').pop(),pages={'index.php':['Beranda','grid'],'data_siswa.php':['Data mahasiswa','users'],'absen.php':['Lembar absen','sheet'],'ujian.php':['Lembar ujian','exam'],accounts:['Akun & sinkronisasi','bell']};
if(!pages[page])return;
const escape=value=>{const e=document.createElement('span');e.textContent=String(value??'');return e.innerHTML;};
function destination(el){if(el.hasAttribute('data-control'))return 'accounts';if(el.dataset.nav)return el.dataset.nav;if(el.tagName==='A'){const u=new URL(el.href,location.href);if(u.origin!==location.origin)return null;const name=u.pathname.split('/').pop();return pages[name]?name:null;}return null;}
const panel=document.createElement('section');panel.id='presenMenuPreview';panel.className='p-menu-preview p-screen-only';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Pratinjau menu');document.body.append(panel);
let active=null,sequence=0,hoverTimer,leaveTimer;
function close(){clearTimeout(hoverTimer);clearTimeout(leaveTimer);sequence++;panel.hidden=true;active?.setAttribute('aria-expanded','false');active=null;}
async function selection(){const state=await WA.get(),form=document.querySelector('.main-card form'),fields=form?Object.fromEntries(new FormData(form)):Object.fromEntries(new URLSearchParams(location.search));return {state,ctx:WA.ctx({...state.selection,...fields}),course:fields.matkul??state.selection?.matkul??''};}
function position(el){const r=el.getBoundingClientRect(),mount=el.closest('#topToolbar,.portal-header,.card-header-flex,.portal-quick'),bottom=mount?.getBoundingClientRect().bottom||r.bottom,w=Math.min(540,innerWidth-24);panel.style.width=w+'px';panel.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';panel.style.top=Math.min(bottom+10,Math.max(12,innerHeight-300))+'px';panel.style.maxHeight=Math.max(140,innerHeight-parseFloat(panel.style.top)-12)+'px';}
async function preview(el){
 if(document.body.classList.contains('wa-qr-open')||document.querySelector('dialog[open]')){close();return;}
 const dest=destination(el);if(!dest||!pages[dest])return;clearTimeout(leaveTimer);const request=++sequence;if(active!==el)active?.setAttribute('aria-expanded','false');active=el;el.setAttribute('aria-expanded','true');el.setAttribute('aria-controls',panel.id);
 panel.hidden=false;position(el);panel.innerHTML='<p class="p-subtitle">Memuat pratinjau…</p>';
 try{const {state,ctx,course}=await selection();if(request!==sequence)return;if(state.profile?.role!=='teacher'){close();return;}
 const roster=state.snapshot.roster.filter(r=>WA.sameCtx(r,ctx)),scope=await WA.scope(ctx,course);if(request!==sequence)return;
 const marks=state.snapshot.marks.filter(m=>m.scope===scope),docs=state.snapshot.documents.filter(d=>d.scope===scope),rows=roster.slice(0,3),[label,icon]=pages[dest];
 let content='';const table=(head,body)=>`<div class="p-preview-table"><table><thead><tr>${head.map(x=>'<th>'+escape(x)+'</th>').join('')}</tr></thead><tbody>${body||'<tr><td colspan="'+head.length+'">Belum ada mahasiswa di kelas ini.</td></tr>'}</tbody></table></div>`;
 if(dest==='data_siswa.php')content=table(['NIM','Nama','L/P'],rows.map(r=>`<tr><td>${escape(r.nim)}</td><td>${escape(r.nama)}</td><td>${escape(r.jk)}</td></tr>`).join(''));
 else if(dest==='absen.php'){const slots=[...new Set(marks.map(m=>m.slot))].sort((a,b)=>a-b).slice(-3);if(!slots.length)slots.push(1,2,3);content=table(['NIM','Nama',...slots.map(s=>'P'+s)],rows.map(r=>`<tr><td>${escape(r.nim)}</td><td>${escape(r.nama)}</td>${slots.map(slot=>'<td>'+escape(marks.find(m=>m.nim===r.nim&&m.slot===slot)?.mark||'—')+'</td>').join('')}</tr>`).join(''));}
 else if(dest==='ujian.php'){const grades=docs.find(d=>d.kind==='grade')?.content?.data_nilai||[];content=table(['NIM','Nama','Nilai'],rows.map(r=>`<tr><td>${escape(r.nim)}</td><td>${escape(r.nama)}</td><td>${escape(grades.find(g=>g.nim===r.nim)?.skor_akhir??'—')}</td></tr>`).join(''));}
 else if(dest==='accounts'){const accounts=(state.snapshot.registrations||[]).filter(r=>WA.sameCtx(r,ctx));content=`<div class="p-preview-metrics"><span><strong>${accounts.length}</strong>Akun kelas</span><span><strong>${state.outbox.length}</strong>Antrean sinkronisasi</span></div><p>Periksa pendaftaran mahasiswa, persetujuan dan status pengiriman.</p>`;}
 else content='<div class="p-preview-flow"><span>Pilih kelas</span><span>Data mahasiswa</span><span>Absensi & ujian</span></div><p>Kelas dan mata kuliah tetap dibawa saat membuka halaman.</p>';
 panel.innerHTML=`<div class="p-preview-heading"><h2>${PresenUI.icon(icon)}${escape(label)}</h2><button type="button" data-preview-close aria-label="Tutup pratinjau">${PresenUI.icon('close')}</button></div><p class="p-preview-context">${escape(ctx.prodi)} · Semester ${escape(ctx.semester)} · Kelas ${escape(ctx.kelas)}${course?' · '+escape(course):''}</p>${content}<div class="p-preview-footer"><small>${roster.length} mahasiswa${roster.length>3?' · 3 ditampilkan':''} · Data tersimpan</small><button type="button" class="p-primary" data-preview-open>Buka halaman penuh →</button></div>`;
 panel.querySelector('[data-preview-close]').onclick=close;panel.querySelector('[data-preview-open]').onclick=async()=>{close();try{if(dest==='accounts'){if(page==='index.php')window.toggleSidebar?.();else await PresenUI.navigate('index.php?view=accounts');}else await PresenUI.navigate(dest);}catch(error){PresenUI.dialog('Belum dapat berpindah','<p>'+escape(error.message||'Selesaikan penyimpanan terlebih dahulu.')+'</p>');}};position(el);
 }catch(error){if(request!==sequence)return;panel.innerHTML='<p>Pratinjau belum tersedia.</p><button type="button" data-preview-close>Tutup</button>';panel.querySelector('button').onclick=close;}
}
const toolbar=document.getElementById('topToolbar'),dataHeader=document.querySelector('.card-header-flex');
if(innerWidth<=768){document.getElementById('inspectorPanel')?.classList.add('minimized');window.sinkronkanPeganganPanel?.();}
if(page!=='index.php'){
 const nav=document.createElement('nav');nav.className='p-worknav p-screen-only';nav.setAttribute('aria-label','Navigasi utama');nav.innerHTML=Object.entries(pages).map(([name,[label,icon]])=>`<button type="button" ${name==='accounts'?'data-control':'data-nav="'+name+'"'} ${name===page?'aria-current="page"':''}>${PresenUI.icon(icon)}<span>${label}</span></button>`).join('')+'<button type="button" data-appearance>'+PresenUI.icon('settings')+'<span>Tampilan</span></button>';
 if(toolbar)toolbar.prepend(nav);else if(dataHeader)dataHeader.append(nav);
}
for(const el of document.querySelectorAll('#topToolbar button,#topToolbar a')){const text=el.textContent.trim();if(el.closest('.p-worknav'))continue;el.dataset.toolTone=/Hapus/.test(text)?'danger':/Word|Excel|Cetak/.test(text)?'export':'neutral';}
function menuTarget(e){const el=e.target.closest('.portal-nav [data-nav],.portal-nav [data-control],.portal-quick-grid [data-nav],.portal-quick-grid [data-control],.p-worknav button,.header-actions a,#topToolbar a');return el&&destination(el)?el:null;}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=menuTarget(e);if(el&&!el.contains(e.relatedTarget)){clearTimeout(hoverTimer);clearTimeout(leaveTimer);hoverTimer=setTimeout(()=>void preview(el),180);}});
document.addEventListener('pointerout',e=>{const el=menuTarget(e);if(el&&!el.contains(e.relatedTarget))leaveTimer=setTimeout(()=>{if(!panel.matches(':hover')&&!panel.contains(document.activeElement))close();},450);});
panel.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));panel.addEventListener('pointerleave',()=>{leaveTimer=setTimeout(close,450);});
document.addEventListener('click',e=>{const el=menuTarget(e);if(el?.tagName==='A'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();void preview(el);}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});document.addEventListener('click',e=>{if(active&&!panel.contains(e.target)&&!menuTarget(e)&&!e.target.closest('[data-preview-open]'))close();});
window.addEventListener('resize',()=>active&&position(active));window.addEventListener('scroll',()=>active&&position(active),true);
if(new URLSearchParams(location.search).get('view')==='accounts'&&page==='index.php')setTimeout(()=>window.toggleSidebar?.(),400);
new MutationObserver(()=>{if(document.body.classList.contains('wa-qr-open'))close();}).observe(document.body,{attributes:true,attributeFilter:['class']});
window.PresenWorkspace={preview,close};
})();
