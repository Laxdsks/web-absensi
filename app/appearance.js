/* One appearance panel; keeps existing wallpaper keys and source image pixels. */
(()=>{
'use strict';
const student=!!document.getElementById('main'),home=!!document.querySelector('.portal-hero');
const key=n=>'custom_bg_wallpaper'+(n?'_'+n:'');
let wallpaperImage='',wallpaperTicket=0;
let panel=document.getElementById('uploadBgFile')?.closest('.form-group');
const storage=document.createElement('div');storage.id='presenAppearanceStorage';storage.hidden=true;document.body.append(storage);
if(panel){panel.classList.add('p-wallpaper-settings');storage.append(panel);}
function controls(){
 if(panel)return panel;
 panel=document.createElement('section');panel.className='p-wallpaper-settings';panel.innerHTML='<h3>Latar aplikasi</h3><label>Foto latar<input id="uploadBgFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Ukuran wallpaper<select id="bgFitMode"><option value="cover">Otomatis memenuhi layar</option><option value="contain">Tampilkan seluruh foto</option><option value="auto">Ukuran asli</option><option value="manual">Ukuran manual</option></select></label><div id="bgManualScaleWrap"><label>Skala <span id="bgScaleValue"></span><input id="bgScaleRange" type="range" min="1" max="1000" value="100"></label></div><label>Geser kiri / kanan <span id="bgPositionXValue"></span><input id="bgPositionX" type="range" min="0" max="100" value="50"></label><label>Geser atas / bawah <span id="bgPositionYValue"></span><input id="bgPositionY" type="range" min="0" max="100" value="50"></label><small id="bgQualityHint"></small><button id="pClearWallpaper" type="button">Hapus foto latar</button>';storage.append(panel);return panel;
}
function saved(n,fallback){const v=localStorage.getItem(key(n));return v===null?fallback:v;}
function apply(){
 const image=wallpaperImage||saved('',''),width=Number(saved('width',0)),height=Number(saved('height',0)),hero=document.querySelector('.portal-hero');
 let mode=saved('mode','cover');if(!['cover','contain','auto','manual'].includes(mode))mode='cover';
 const maxScale=1000;
 const scale=Math.max(1,Math.min(maxScale,Number(saved('scale',100))||100)),x=Math.max(0,Math.min(100,Number(saved('x',50))||0)),y=Math.max(0,Math.min(100,Number(saved('y',50))||0));
 const valid=/^data:image\/(png|jpeg|webp);base64,/.test(image);
 const size=mode==='manual'?scale+'% auto':mode==='auto'?'auto':mode,position=x+'% '+y+'%';
 if(hero){hero.style.backgroundImage=valid?`url("${image}")`:'';hero.style.backgroundSize=size;hero.style.backgroundPosition=position;hero.style.backgroundRepeat='no-repeat';hero.style.minHeight=valid&&mode==='cover'?'100dvh':'';}
 if(home){document.body.style.backgroundImage='';document.body.classList.toggle('has-custom-wallpaper',valid);}
 else{document.body.style.backgroundImage=valid?`url("${image}")`:'';document.body.style.backgroundSize=size;document.body.style.backgroundPosition=position;document.body.style.backgroundRepeat='no-repeat';document.body.style.backgroundAttachment='fixed';}
 const p=controls();p.querySelector('#bgFitMode').value=mode;p.querySelector('#bgScaleRange').max=String(maxScale);p.querySelector('#bgScaleRange').value=String(scale);p.querySelector('#bgScaleValue').textContent=scale+'%';p.querySelector('#bgManualScaleWrap').style.display=mode==='manual'?'block':'none';
 for(const [axis,value] of [['X',x],['Y',y]]){p.querySelector('#bgPosition'+axis).value=String(value);p.querySelector('#bgPosition'+axis+'Value').textContent=value+'%';}
 p.querySelector('#bgQualityHint').textContent=(width&&height?`Foto asli: ${width} × ${height}px. `:'')+'Mode penuh dapat memperbesar foto kecil. Skala manual hingga 1000%; pembesaran tidak menambah ketajaman. Kertas cetak tetap putih.';
}
async function rasterFile(file,limit=15*1024*1024){
 if(!file||!file.type.startsWith('image/')||file.size>limit)throw Error('Pilih gambar maksimal 15 MB.');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Gambar tidak dapat dibaca.'));r.readAsDataURL(file);});
 const img=new Image();img.src=data;await img.decode();
 if(!img.naturalWidth||!img.naturalHeight)throw Error('Ukuran gambar tidak valid.');
 let value=data;if(!/^data:image\/(png|jpeg|webp);base64,/.test(data)){const c=document.createElement('canvas');const scale=Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);value=c.toDataURL('image/png');}
 return {data:value,img};
}
async function upload(e,status){
 const ticket=++wallpaperTicket;
 try{const file=e.target.files[0];if(!file)return;status.textContent='Membaca foto latar…';const {data,img}=await rasterFile(file);if(ticket!==wallpaperTicket)return;
 try{localStorage.setItem(key(''),data);localStorage.removeItem(key('db'));}
 catch(error){if(!window.WA)throw error;await WA.change(()=>data,'wallpaper-source');localStorage.setItem(key('db'),'1');const c=document.createElement('canvas'),scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);try{localStorage.setItem(key(''),c.toDataURL('image/jpeg',.65));}catch(_){localStorage.removeItem(key(''));}}
 wallpaperImage=data;localStorage.setItem(key('width'),String(img.naturalWidth));localStorage.setItem(key('height'),String(img.naturalHeight));apply();status.textContent='Foto latar aplikasi disimpan.';
 }catch(error){status.textContent=error.name==='QuotaExceededError'?'Penyimpanan perangkat penuh. Kosongkan ruang lalu coba lagi.':error.message||'Foto belum dapat disimpan.';}
}
function applyBrand(){const image=localStorage.getItem('presen-brand-image')||'',size=Math.max(24,Math.min(80,Number(localStorage.getItem('presen-brand-size'))||48)),src=/^data:image\/(png|jpeg|webp);base64,/.test(image)?image:new URL('icon-192.png',document.currentScript?.src||new URL('app/appearance.js',document.baseURI)).href;
 document.querySelectorAll('.p-worknav').forEach(nav=>{if(!nav.querySelector('.p-workspace-brand')){const mark=document.createElement('img');mark.className='p-workspace-brand p-screen-only';mark.alt='Logo aplikasi';nav.prepend(mark);}});
 document.querySelectorAll('.portal-brand>img,.p-workspace-brand').forEach(img=>{img.src=src;img.style.width=(img.classList.contains('p-workspace-brand')?Math.min(36,size):size)+'px';img.style.height=img.style.width;img.style.objectFit='contain';});
}

function open(){
 window.PresenWorkspace?.close();
 const existing=document.getElementById('presenAppearanceDialog');if(existing){existing.focus();return existing;}
 const d=PresenUI.dialog('Tampilan aplikasi','<p class="p-subtitle">Tema, warna dan latar dalam satu pengaturan.</p><div class="p-appearance-colors"><label>Tema<select id="pTheme"><option value="putih">Putih</option><option value="malam">Malam</option><option value="samudra">Samudra</option><option value="senja">Senja</option></select></label><label>Warna utama<input id="pAccent" type="color"></label></div><button type="button" id="pDefaultColors">Warna bawaan</button><section class="p-brand-settings"><h3>Logo aplikasi / kampus</h3><img id="pBrandPreview" alt="Pratinjau logo" width="56" height="56" style="object-fit:contain"><label>Ganti logo<input id="pBrandFile" type="file" accept="image/*"></label><label>Ukuran logo <input id="pBrandSize" type="range" min="24" max="80" value="48"></label><button id="pBrandReset" type="button">Pulihkan logo bawaan</button></section><div class="p-wallpaper-mount"></div><section class="p-maps-settings" hidden><h3>Google Maps</h3><p>Aktifkan Maps Embed API untuk rute dan panorama dalam jendela. Maps JavaScript API dipakai untuk memilih titik pada peta. Batasi kunci ke alamat website ini.</p><label>Kunci browser Google Maps<input id="pMapsKey" type="password" autocomplete="off"></label><button id="pMapsSave" type="button">Simpan pengaturan peta</button></section><p role="status" aria-live="polite"></p>');d.id='presenAppearanceDialog';
 const theme=d.querySelector('#pTheme'),accent=d.querySelector('#pAccent'),status=d.querySelector('[role=status]');theme.value=document.documentElement.dataset.theme||'putih';theme.onchange=()=>PresenUI.setTheme(theme.value);accent.value=localStorage.getItem('presen-accent')||'#2463dc';accent.oninput=()=>{localStorage.setItem('presen-accent',accent.value);PresenUI.accent(accent.value);};d.querySelector('#pDefaultColors').onclick=()=>{localStorage.removeItem('presen-accent');for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);for(const n of ['--hero-accent','--hero-on-accent'])document.body.style.removeProperty(n);status.textContent='Warna bawaan dipulihkan.';};
 {const p=controls();d.querySelector('.p-wallpaper-mount').append(p);const file=p.querySelector('#uploadBgFile');file.accept='image/*';p.querySelector('#bgScaleRange').max='1000';file.onchange=e=>void upload(e,status);
 for(const [id,n,event] of [['bgFitMode','mode','change'],['bgScaleRange','scale','input'],['bgPositionX','x','input'],['bgPositionY','y','input']]){const el=p.querySelector('#'+id);el.removeAttribute('on'+event);el['on'+event]=()=>{try{localStorage.setItem(key(n),el.value);apply();}catch(_){status.textContent='Pengaturan belum dapat disimpan.';}};}
 const clear=p.querySelector('#pClearWallpaper')||p.querySelector('button[onclick*="removeBgWallpaper"]');clear.id='pClearWallpaper';clear.removeAttribute('onclick');clear.onclick=()=>{wallpaperTicket++;wallpaperImage='';void window.WA?.change(()=>null,'wallpaper-source');for(const n of ['','width','height','mode','scale','x','y','db'])localStorage.removeItem(key(n));file.value='';apply();status.textContent='Foto latar dihapus.';};
 d.addEventListener('close',()=>storage.append(p));apply();
 }
 void (async()=>{try{const state=await window.WA?.get();if(state?.profile?.role!=='teacher'||state.profile.account?.role!=='admin')return;const section=d.querySelector('.p-maps-settings'),config=await WA.api('maps-config');section.hidden=false;section.querySelector('#pMapsKey').value=config.embedKey||'';section.querySelector('#pMapsSave').onclick=async()=>{try{await WA.api('set-maps-config',{key:section.querySelector('#pMapsKey').value.trim()});status.textContent='Pengaturan Google Maps disimpan. Buka kembali jendela peta untuk menerapkannya.';}catch(error){status.textContent=error.message;}};}catch(_){}})();
 const preview=d.querySelector('#pBrandPreview'),brandFile=d.querySelector('#pBrandFile'),brandSize=d.querySelector('#pBrandSize');
 const previewBrand=()=>{applyBrand();preview.src=document.querySelector('.portal-brand>img,.p-workspace-brand')?.src||new URL('app/icon-192.png',document.baseURI).href;};brandSize.value=localStorage.getItem('presen-brand-size')||'48';previewBrand();
 brandFile.onchange=async()=>{try{const {img}=await rasterFile(brandFile.files[0]);const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);localStorage.setItem('presen-brand-image',c.toDataURL('image/png'));previewBrand();status.textContent='Logo aplikasi disimpan.';}catch(error){status.textContent=error.message||'Logo belum dapat disimpan.';}};
 brandSize.oninput=()=>{localStorage.setItem('presen-brand-size',brandSize.value);applyBrand();};d.querySelector('#pBrandReset').onclick=()=>{localStorage.removeItem('presen-brand-image');localStorage.removeItem('presen-brand-size');brandFile.value='';brandSize.value='48';previewBrand();status.textContent='Logo bawaan dipulihkan.';};
 return d;
}
{controls();apply();applyBrand();window.addEventListener('resize',apply);window.addEventListener('load',()=>{apply();applyBrand();});if(saved('db','')==='1'&&window.WA){const ticket=wallpaperTicket;void WA.get('wallpaper-source').then(data=>{if(ticket===wallpaperTicket&&data){wallpaperImage=data;apply();}});}}
window.PresenAppearance={open,apply};
})();
