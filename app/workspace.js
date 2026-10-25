/* Shared teacher navigation with brief, non-blocking menu descriptions. */
(()=>{
'use strict';
if(!window.PresenUI||document.getElementById('main'))return;
const page=location.pathname.split('/').pop()||'index.php',pages={
 'index.php':['Beranda','grid','Klik untuk membuka halaman awal.'],
 'data_siswa.php':['Data mahasiswa','users','Atur, impor, dan koreksi daftar mahasiswa kelas ini.'],
 'absen.php':['Lembar absen','sheet','Isi kehadiran, kelola QR, dan buka rekap nilai.'],
 'ujian.php':['Lembar ujian','exam','Lihat daftar ujian dan nilai mahasiswa.'],
 accounts:['Akun & sinkronisasi','bell','Tinjau pendaftaran mahasiswa dan status sinkronisasi.']
};
if(!pages[page])return;
const esc=s=>{const e=document.createElement('span');e.textContent=String(s??'');return e.innerHTML;};
function dest(el){if(el.hasAttribute('data-control'))return'accounts';if(el.dataset.nav)return el.dataset.nav;if(el.tagName==='A'){const u=new URL(el.href,location.href);if(u.origin!==location.origin)return null;const n=u.pathname.split('/').pop();return pages[n]?n:null;}return null;}
function label(el){if(el.hasAttribute('data-monitoring'))return 'Cari riwayat, foto bukti, keterangan, dan lokasi absensi.';const id=dest(el);return id&&pages[id][2];}
const tip=document.createElement('div');tip.className='p-menu-tip p-screen-only';tip.id='presenMenuTip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
let focused=null,timer;
function hide(){clearTimeout(timer);tip.hidden=true;focused?.removeAttribute('aria-describedby');focused=null;}
function rects(el){const r=el.getBoundingClientRect(),w=Math.min(280,innerWidth-24),h=Math.min(84,Math.max(50,tip.scrollHeight||60)),gap=9;return[
 {x:r.right+gap,y:r.top+(r.height-h)/2},{x:r.left-w-gap,y:r.top+(r.height-h)/2},
 {x:r.left+(r.width-w)/2,y:r.top-h-gap},{x:r.left+(r.width-w)/2,y:r.bottom+gap}
].map(v=>({...v,w,h}));}
function show(el){const text=label(el);if(!text)return;focused=el;tip.textContent=text;tip.hidden=false;el.setAttribute('aria-describedby',tip.id);const candidates=rects(el),targets=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(x=>x!==el&&x.getClientRects().length&&!tip.contains(x));const score=r=>{let n=(r.x<8||r.y<8||r.x+r.w>innerWidth-8||r.y+r.h>innerHeight-8)?1000:0;for(const t of targets){const b=t.getBoundingClientRect();if(r.x<b.right&&r.x+r.w>b.left&&r.y<b.bottom&&r.y+r.h>b.top)n+=Math.max(1,Math.min(r.x+r.w,b.right)-Math.max(r.x,b.left))*Math.max(1,Math.min(r.y+r.h,b.bottom)-Math.max(r.y,b.top));}return n;};candidates.sort((a,b)=>score(a)-score(b));const r=candidates[0];tip.style.left=Math.max(8,Math.min(innerWidth-r.w-8,r.x))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-r.h-8,r.y))+'px';}
function target(e){return e.target.closest('.portal-nav [data-nav],.portal-nav [data-control],.portal-nav [data-monitoring],.portal-quick-grid [data-nav],.portal-quick-grid [data-control],.p-worknav button,.header-actions a,#topToolbar a');}
if(page!=='index.php'){
 const nav=document.createElement('nav');nav.className='p-worknav p-screen-only';nav.setAttribute('aria-label','Navigasi utama');
 nav.innerHTML=Object.entries(pages).filter(([name])=>name!=='accounts').map(([name,[title,icon]])=>`<button type="button" ${name==='accounts'?'data-control':'data-nav="'+name+'"'} ${name===page?'aria-current="page"':''} title="${esc(pages[name][2])}">${PresenUI.icon(icon)}<span>${esc(title)}</span></button>`).join('')+'<button type="button" data-appearance title="Atur tema, warna, dan latar aplikasi">'+PresenUI.icon('settings')+'<span>Tampilan</span></button>';
 const toolbar=document.getElementById('topToolbar'),dataHeader=document.querySelector('.card-header-flex');
 if(toolbar){toolbar.prepend(nav);toolbar.querySelectorAll('a[href]').forEach(a=>{if(dest(a))a.remove();});}
 else if(dataHeader){dataHeader.append(nav);dataHeader.querySelectorAll('.header-actions a[href]').forEach(a=>{if(dest(a))a.remove();});}
}
if(innerWidth<=768){document.getElementById('inspectorPanel')?.classList.add('minimized');window.sinkronkanPeganganPanel?.();}
for(const el of document.querySelectorAll('.portal-nav [data-nav],.portal-nav [data-control],.portal-nav [data-monitoring],.portal-quick-grid [data-nav],.portal-quick-grid [data-control],.p-worknav button,.header-actions a,#topToolbar a')){const text=label(el);if(text){el.title=text;el.setAttribute('aria-label',(dest(el)==='index.php'?'Beranda':pages[dest(el)]?.[0]||'Menu')+'. '+text);}}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=target(e);if(!el||el.contains(e.relatedTarget))return;clearTimeout(timer);timer=setTimeout(()=>show(el),220);});
document.addEventListener('pointerout',e=>{const el=target(e);if(el&&!el.contains(e.relatedTarget))timer=setTimeout(hide,160);});
tip.addEventListener('pointerenter',()=>clearTimeout(timer));tip.addEventListener('pointerleave',hide);
document.addEventListener('focusin',e=>{const el=target(e);if(el){clearTimeout(timer);show(el);}});document.addEventListener('focusout',e=>{if(target(e))timer=setTimeout(hide,160);});
document.addEventListener('click',e=>{if(!tip.contains(e.target)&&!target(e))hide();});document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
window.addEventListener('resize',()=>focused&&show(focused));window.addEventListener('scroll',()=>focused&&show(focused),true);
window.PresenWorkspace={close:hide,open:async target=>{hide();if(target==='accounts'){await window.PresenInbox?.open();return;}if(target===page)return;await PresenUI.navigate(target);}};
if(new URLSearchParams(location.search).get('view')==='accounts'&&page==='index.php')setTimeout(()=>window.toggleSidebar?.(),400);
})();
