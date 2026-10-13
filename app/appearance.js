/* One appearance panel; keeps existing wallpaper keys and source image pixels. */
(()=>{
'use strict';
const student=!!document.getElementById('main'),home=!!document.querySelector('.portal-hero');
const key=n=>'custom_bg_wallpaper'+(n?'_'+n:'');
let panel=document.getElementById('uploadBgFile')?.closest('.form-group');
const storage=document.createElement('div');storage.id='presenAppearanceStorage';storage.hidden=true;document.body.append(storage);
if(panel){panel.classList.add('p-wallpaper-settings');storage.append(panel);}
function controls(){
 if(panel)return panel;
 panel=document.createElement('section');panel.className='p-wallpaper-settings';panel.innerHTML='<h3>Latar beranda</h3><label>Foto latar<input id="uploadBgFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Ukuran wallpaper<select id="bgFitMode"><option value="cover">Otomatis memenuhi layar</option><option value="contain">Tampilkan seluruh foto</option><option value="auto">Ukuran asli</option><option value="manual">Ukuran manual</option></select></label><div id="bgManualScaleWrap"><label>Skala <span id="bgScaleValue"></span><input id="bgScaleRange" type="range" min="1" max="200" value="100"></label></div><label>Geser kiri / kanan <span id="bgPositionXValue"></span><input id="bgPositionX" type="range" min="0" max="100" value="50"></label><label>Geser atas / bawah <span id="bgPositionYValue"></span><input id="bgPositionY" type="range" min="0" max="100" value="50"></label><small id="bgQualityHint"></small><button id="pClearWallpaper" type="button">Hapus foto latar</button>';storage.append(panel);return panel;
}
function saved(n,fallback){const v=localStorage.getItem(key(n));return v===null?fallback:v;}
function apply(){
 const image=saved('',''),width=Number(saved('width',0)),height=Number(saved('height',0)),hero=document.querySelector('.portal-hero');
 let mode=saved('mode','cover');if(!['cover','contain','auto','manual'].includes(mode))mode='cover';
 const targetWidth=hero?.clientWidth||innerWidth,targetHeight=hero?.clientHeight||innerHeight;
 if(image&&mode==='cover'&&width&&height&&(width<targetWidth||height<targetHeight)){mode='auto';localStorage.setItem(key('mode'),mode);}
 const maxScale=width&&height?Math.max(1,Math.min(200,Math.floor(width/Math.max(1,targetWidth)*100))):200;
 const scale=Math.max(1,Math.min(maxScale,Number(saved('scale',100))||100)),x=Math.max(0,Math.min(100,Number(saved('x',50))||0)),y=Math.max(0,Math.min(100,Number(saved('y',50))||0));
 const valid=/^data:image\/(png|jpeg|webp);base64,/.test(image);
 if(hero){hero.style.backgroundImage=valid?`url("${image}")`:'';hero.style.backgroundSize=mode==='manual'?scale+'% auto':mode==='auto'?'auto':mode;hero.style.backgroundPosition=x+'% '+y+'%';hero.style.backgroundRepeat='no-repeat';}
 if(home){document.body.style.backgroundImage='';document.body.classList.toggle('has-custom-wallpaper',valid);}
 const p=controls();p.querySelector('#bgFitMode').value=mode;p.querySelector('#bgScaleRange').max=String(maxScale);p.querySelector('#bgScaleRange').value=String(scale);p.querySelector('#bgScaleValue').textContent=scale+'%';p.querySelector('#bgManualScaleWrap').style.display=mode==='manual'?'block':'none';
 for(const [axis,value] of [['X',x],['Y',y]]){p.querySelector('#bgPosition'+axis).value=String(value);p.querySelector('#bgPosition'+axis+'Value').textContent=value+'%';}
 p.querySelector('#bgQualityHint').textContent=(width&&height?`Foto asli: ${width} × ${height}px. `:'')+'Foto kecil tidak diperbesar otomatis. Pengaturan berlaku pada latar beranda, kertas tetap putih.';
}
async function upload(e,status){
 try{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Pilih PNG, JPG atau WebP maksimal 3 MB.');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Gambar tidak dapat dibaca.'));r.readAsDataURL(file);});const img=new Image();img.src=data;await img.decode();
 // Store source first: if quota is exhausted the previous image remains intact.
 localStorage.setItem(key(''),data);localStorage.setItem(key('width'),String(img.naturalWidth));localStorage.setItem(key('height'),String(img.naturalHeight));apply();status.textContent='Foto latar beranda disimpan.';
 }catch(error){status.textContent=error.message||'Foto belum dapat disimpan.';}
}
function open(){
 window.PresenWorkspace?.close();
 const existing=document.getElementById('presenAppearanceDialog');if(existing){existing.focus();return existing;}
 const d=PresenUI.dialog('Tampilan aplikasi','<p class="p-subtitle">Tema, warna dan latar dalam satu pengaturan.</p><div class="p-appearance-colors"><label>Tema<select id="pTheme"><option value="putih">Putih</option><option value="malam">Malam</option><option value="samudra">Samudra</option><option value="senja">Senja</option></select></label><label>Warna utama<input id="pAccent" type="color"></label></div><button type="button" id="pDefaultColors">Warna bawaan</button><div class="p-wallpaper-mount"></div><p role="status" aria-live="polite"></p>');d.id='presenAppearanceDialog';
 const theme=d.querySelector('#pTheme'),accent=d.querySelector('#pAccent'),status=d.querySelector('[role=status]');theme.value=document.documentElement.dataset.theme||'putih';theme.onchange=()=>PresenUI.setTheme(theme.value);accent.value=localStorage.getItem('presen-accent')||'#2463dc';accent.oninput=()=>{localStorage.setItem('presen-accent',accent.value);PresenUI.accent(accent.value);};d.querySelector('#pDefaultColors').onclick=()=>{localStorage.removeItem('presen-accent');for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);for(const n of ['--hero-accent','--hero-on-accent'])document.body.style.removeProperty(n);status.textContent='Warna bawaan dipulihkan.';};
 if(!student){const p=controls();d.querySelector('.p-wallpaper-mount').append(p);const file=p.querySelector('#uploadBgFile');file.accept='image/png,image/jpeg,image/webp';file.onchange=e=>void upload(e,status);
 for(const [id,n,event] of [['bgFitMode','mode','change'],['bgScaleRange','scale','input'],['bgPositionX','x','input'],['bgPositionY','y','input']]){const el=p.querySelector('#'+id);el.removeAttribute('on'+event);el['on'+event]=()=>{try{localStorage.setItem(key(n),el.value);apply();}catch(_){status.textContent='Pengaturan belum dapat disimpan.';}};}
 const clear=p.querySelector('#pClearWallpaper')||p.querySelector('button[onclick*="removeBgWallpaper"]');clear.id='pClearWallpaper';clear.removeAttribute('onclick');clear.onclick=()=>{for(const n of ['','width','height','mode','scale','x','y'])localStorage.removeItem(key(n));file.value='';apply();status.textContent='Foto latar dihapus.';};
 d.addEventListener('close',()=>storage.append(p));apply();
 }return d;
}
if(!student){controls();apply();window.addEventListener('resize',apply);window.addEventListener('load',apply);}
window.PresenAppearance={open,apply};
})();
