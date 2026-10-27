/* Location controls stay outside the attendance grid and outside every export. */
(()=>{
'use strict';if(!window.WA)return;
const body=document.getElementById('tbodySiswa'),paper=document.getElementById('paperSheet'),layer=document.createElement('div');layer.className='p-location-layer p-screen-only';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:20';if(paper&&body){paper.classList.add('p-location-host');paper.append(layer);}let pending=false;
function valid(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.accuracy)&&Number.isFinite(p.at)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&p.accuracy>=0;}
function metres(a,b){const rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon),h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
let googleLoading;
function googleMapLibrary(key){
 if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
 if(googleLoading)return googleLoading;
 googleLoading=new Promise((resolve,reject)=>{const callback='presenGoogleMapReady',script=document.createElement('script');let timer;const fail=()=>{clearTimeout(timer);delete window[callback];script.remove();googleLoading=null;reject(Error('Peta interaktif belum tersedia. Gunakan pencarian tujuan atau periksa Maps JavaScript API.'));};window[callback]=()=>{clearTimeout(timer);delete window[callback];resolve(window.google.maps);};const url=new URL('https://maps.googleapis.com/maps/api/js');url.search=new URLSearchParams({key,callback,loading:'async',v:'weekly'});script.src=url;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;timer=setTimeout(fail,15000);document.head.append(script);});
 return googleLoading;
}
let explorerLoading;
function explorerModule(){if(window.PresenMapExplorer)return Promise.resolve(window.PresenMapExplorer);if(explorerLoading)return explorerLoading;explorerLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('app/map-explorer.js',WA.ROOT).href;script.onload=()=>resolve(window.PresenMapExplorer);script.onerror=()=>{explorerLoading=null;reject(Error('Penjelajah tempat belum dapat dimuat.'));};document.head.append(script);});return explorerLoading;}
const addressFields=['formatted','road','village','district','city','province','postcode','country','rt','rw'];
function normalizeAddress(value){if(!value||typeof value!=='object'||typeof value.formatted!=='string'||!value.formatted.trim())return null;const out=Object.fromEntries(addressFields.filter(k=>typeof value[k]==='string'&&value[k].trim()).map(k=>[k,value[k].slice(0,k==='formatted'?800:160)]));for(const field of ['rt','rw']){const match=out.formatted.match(new RegExp('\\b'+field+'[.\\s:-]*(\\d{1,3})','i'));if(!out[field]&&match)out[field]=match[1];}return out;}
function addressText(address){const a=normalizeAddress(address);return a?a.formatted+((a.rt||a.rw)?' · RT '+(a.rt||'tidak tersedia')+' / RW '+(a.rw||'tidak tersedia'):' · RT/RW tidak tersedia dari penyedia peta'):'Alamat belum tersedia. Koordinat tetap tersimpan.';}
const addressPending=new Map();
async function address(p,lookup=false){
 if(!valid(p))return null;const own=normalizeAddress(p.address);if(own)return own;const state=await WA.get();if(state.profile?.role!=='teacher')return null;const owner=state.profile.account.id,key='location-address:'+owner,coordinate=p.lat.toFixed(6)+','+p.lon.toFixed(6),saved=await WA.get(key)||{},cached=normalizeAddress(saved[coordinate]);if(cached)return cached;if(!lookup||!navigator.onLine)return null;
 const pendingKey=owner+':'+coordinate;if(addressPending.has(pendingKey))return addressPending.get(pendingKey);
 const task=(async()=>{const config=await WA.api('maps-config');if(!config.javascriptKey)return null;const g=await googleMapLibrary(config.javascriptKey),result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Pencarian alamat melewati batas waktu. Koordinat tetap tersedia.')),8000);new g.Geocoder().geocode({location:{lat:p.lat,lng:p.lon}},(rows,status)=>{clearTimeout(timer);status==='OK'&&rows?.[0]?resolve(rows[0]):reject(Error('Alamat belum tersedia dari Google Maps.'));});});const part=type=>result.address_components?.find(x=>x.types.includes(type))?.long_name||'',out=normalizeAddress({formatted:result.formatted_address,road:[part('route'),part('street_number')].filter(Boolean).join(' '),village:part('administrative_area_level_4')||part('sublocality_level_1'),district:part('administrative_area_level_3')||part('locality'),city:part('administrative_area_level_2'),province:part('administrative_area_level_1'),postcode:part('postal_code'),country:part('country')});if(out&&(await WA.get()).profile?.account.id===owner){await WA.change(old=>Object.fromEntries([...Object.entries(old||{}).filter(([id])=>id!==coordinate),[coordinate,out]].slice(-200)),key);window.dispatchEvent(new Event('presen-address-resolved'));}return out;})().finally(()=>addressPending.delete(pendingKey));addressPending.set(pendingKey,task);return task;
}
async function show(nim,scope,context,slot){
 window.PresenWorkspace?.close();
 const state=await WA.get();if(state.profile?.role!=='teacher')return;
 const params=Object.fromEntries(new URLSearchParams(location.search)),ctx=WA.ctx(context||{...state.selection,...params}),student=state.snapshot.roster.find(x=>x.nim===nim&&WA.sameCtx(x,ctx));
 const marks=state.snapshot.marks.filter(x=>x.nim===nim&&x.scope===scope&&valid(x.location)).sort((a,b)=>b.location.at-a.location.at);
 const d=PresenUI.dialog('Lokasi & rute perjalanan',`<p class="p-location-name"></p><p class="p-note">Petunjuk jalan dari posisi Anda sekarang ke lokasi absensi mahasiswa.</p>
 <div class="p-map-toolbar"><label>Pertemuan<select id="pMapMeeting"></select></label><button type="button" id="pMapFullscreen" aria-pressed="false">${PresenUI.icon('expand')}Layar penuh</button></div>
 <div class="p-map-route-controls"><button type="button" id="pMapRoute">Lihat jalan ke mahasiswa</button><button type="button" id="pMapLocate">Perbarui lokasi saya</button><label>Cara pergi<select id="pMapTravel"><option value="driving">Mobil / kendaraan</option><option value="walking">Jalan kaki</option><option value="bicycling">Sepeda</option><option value="transit">Transportasi umum</option></select></label></div>
 <details class="p-map-search-options"><summary>Tujuan lain (opsional)</summary><form class="p-map-search"><label for="pMapDestination">Cari tujuan lain</label><div><input id="pMapDestination" type="search" maxlength="200" placeholder="Nama tempat dan kota, atau alamat lengkap" autocomplete="off"><button type="submit" id="pMapSearch">Cari di peta</button></div></form></details>
 <p class="p-map-destination" role="status"></p><div class="p-map-summary"></div><p class="p-map-place" role="status"></p><p class="p-map-origin" role="status" hidden></p><p class="p-map-status" role="status"></p><button type="button" id="pMapConfirm" hidden>GPS saya benar, tampilkan rute</button>
 <div class="p-map-frame"><iframe title="Peta lokasi di Google Maps" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms" allowfullscreen></iframe><div class="p-route-map" aria-label="Peta interaktif untuk memilih tujuan perjalanan" hidden></div></div>
 <div class="p-map-actions"><button type="button" class="p-map-link">${PresenUI.icon('pin')}Lokasi target (mahasiswa)</button><button type="button" id="pMapExplore">Jelajahi tempat &amp; foto</button><button type="button" id="pMapStreet">360° · Street View</button><button type="button" id="pMapReset">Reset peta</button><button type="button" id="pMapRetry">Muat ulang peta</button></div>`);
 d.classList.add('p-screen-only','p-map-dialog');d.querySelector('.p-location-name').textContent=(student?.nama||nim)+' · '+nim;
 const select=d.querySelector('#pMapMeeting'),iframe=d.querySelector('iframe'),status=d.querySelector('.p-map-status'),mapElement=d.querySelector('.p-route-map'),originLabel=d.querySelector('.p-map-origin'),confirm=d.querySelector('#pMapConfirm'),routeButton=d.querySelector('#pMapRoute'),search=d.querySelector('.p-map-search'),input=d.querySelector('#pMapDestination'),travel=d.querySelector('#pMapTravel');
 d.querySelector('#pMapExplore').disabled=true;
 let explorer=null,origin=null,destination=null,mode='point',key='',javascriptKey='',watchId=null,configReady=false,gpsEpoch=0,viewEpoch=0,addressEpoch=0,lastRoutePoint=null,lastRouteAt=0,confirmedFarPoint=null,gpsPromise=null,intentEpoch=0,autoStudentRoute=true;
 const current=()=>marks.find(m=>String(m.slot)===select.value)?.location;
 const coordinates=p=>p.lat+','+p.lon;
 const target=()=>destination||{...current(),name:'Lokasi mahasiswa · '+(student?.nama||nim),student:true};
 const targetQuery=()=>target().query||coordinates(target());
 const embed=(type,fields)=>{const url=new URL('https://www.google.com/maps/embed/v1/'+type);url.search=new URLSearchParams({key,language:'id',...fields});return url.href;};
 const pointURL=p=>key?embed('place',{q:coordinates(p),zoom:'16'}):'https://www.google.com/maps?q='+encodeURIComponent(coordinates(p))+'&z=16&output=embed';
 function frame(){mapElement.hidden=true;iframe.hidden=!navigator.onLine;}
 function destinationLabel(){const t=target();d.querySelector('.p-map-destination').textContent='Tujuan perjalanan: '+t.name;routeButton.textContent=t.student?'Lihat jalan ke mahasiswa':'Lihat jalan ke tujuan ini';}
 function describeOrigin(){if(!origin){originLabel.hidden=true;return;}originLabel.hidden=false;originLabel.textContent='Dari lokasi saya (akurasi GPS ±'+Math.round(origin.accuracy)+' m) ke '+target().name;}
 function stopWatch(){if(watchId!==null){navigator.geolocation?.clearWatch(watchId);watchId=null;}gpsEpoch++;}
 function disposeExplorer(){viewEpoch++;explorer?.dispose();explorer=null;mapElement.replaceChildren();}
 function needsKey(){status.textContent='Rute Google Embed belum tersambung. Masukkan kunci Maps Embed API melalui Tampilan → Google Maps. Lokasi absensi tetap tersimpan.';}
 async function place(p){const id=++addressEpoch;try{const result=await address(p,!!javascriptKey);if(id===addressEpoch&&d.open)d.querySelector('.p-map-place').textContent=result?addressText(result):'Alamat rinci mengikuti peta Google. Koordinat absensi tetap tersimpan; RT/RW tidak ditebak.';}catch(_){if(id===addressEpoch&&d.open)d.querySelector('.p-map-place').textContent='Alamat belum dapat dimuat. Koordinat absensi tetap tersedia.';}}
 function showPoint(){if(!current())return;mode='point';frame();iframe.title='Lokasi mahasiswa di Google Maps';if(navigator.onLine)iframe.src=pointURL(current());else iframe.removeAttribute('src');status.textContent=navigator.onLine?(autoStudentRoute?'Mendeteksi posisi Anda untuk menampilkan jalan ke mahasiswa. Izinkan lokasi saat browser meminta.':'Tekan Lihat jalan ke mahasiswa untuk menampilkan jalur dari posisi Anda.'):'Sedang offline. Peta dan rute memerlukan internet.';}
 function showSearch(){if(!destination?.query)return;mode='search';frame();iframe.title='Pencarian tujuan perjalanan di Google Maps';if(!navigator.onLine){iframe.removeAttribute('src');status.textContent='Pencarian tempat memerlukan internet.';return;}if(!key){iframe.src='https://www.google.com/maps?q='+encodeURIComponent(destination.query)+'&output=embed';needsKey();return;}iframe.src=embed('search',{q:destination.query});status.textContent='Hasil pencarian Google untuk '+destination.name+'. Pastikan nama dan kotanya sesuai, lalu tekan Lihat jalan ke tujuan ini. Tujuan rute mengikuti nama/alamat pada kotak pencarian.';}
 function gpsPoint(position){const c=position.coords,p={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,at:position.timestamp};if(!valid(p)||Date.now()-p.at>60000||p.at>Date.now()+10000)throw Error('Lokasi perangkat sudah lama atau tidak valid.');if(p.accuracy>200)throw Error('Lokasi perangkat kurang teliti (±'+Math.round(p.accuracy)+' m).');return p;}
 function gpsError(error){if(!d.open)return;if(!origin)originLabel.hidden=true;status.textContent=(error.code===1?'Izin lokasi belum diberikan. Izinkan lokasi situs ini di pengaturan browser.':error.message||'Lokasi perangkat belum tersedia.')+' Aktifkan GPS lalu tekan Perbarui lokasi saya.';if(error.code===1)stopWatch();}
 function drawRoute(){
  autoStudentRoute=false;
  if(!origin||!current()||!d.open)return;
  const t=target();if(Number.isFinite(t.lat)&&metres(origin,t)>100000&&(!confirmedFarPoint||metres(origin,confirmedFarPoint)>1000)){
   confirm.hidden=false;status.textContent='GPS Anda terdeteksi lebih dari 100 km dari tujuan. Jika lokasinya keliru, tekan Perbarui lokasi saya. Jika benar, tekan GPS saya benar, tampilkan rute.';return;
  }
  confirm.hidden=true;mode='route';describeOrigin();frame();
  if(!navigator.onLine){iframe.removeAttribute('src');status.textContent='Rute memerlukan internet.';return;}
  if(Number.isFinite(t.lat)&&metres(origin,t)<=Math.max(30,origin.accuracy+(t.accuracy||0))){iframe.src=pointURL(t);status.textContent='Lokasi Anda dan tujuan sama atau berdekatan ('+Math.round(metres(origin,t))+' m). Selisihnya masih dalam perkiraan akurasi GPS; rute jalan belum diperlukan.';return;}
  if(!key){iframe.src=pointURL(current());needsKey();return;}
  lastRoutePoint={...origin};lastRouteAt=Date.now();iframe.title='Rute dari lokasi saya ke '+t.name;iframe.src=embed('directions',{origin:coordinates(origin),destination:targetQuery(),mode:travel.value});
  status.textContent='Rute ke '+t.name+'. Garis perjalanan, jarak jalan, dan perkiraan waktu ditampilkan oleh Google di dalam peta. Ikuti jalur pada peta sesuai cara pergi yang dipilih.';
 }
 function acceptGPS(position,automatic=false){origin=gpsPoint(position);describeOrigin();if(autoStudentRoute&&mode==='point'&&!destination){drawRoute();return;}if(mode==='route'&&(!automatic||!lastRoutePoint||Date.now()-lastRouteAt>=15000&&metres(origin,lastRoutePoint)>=30))drawRoute();}
 function startWatch(){
  if(!configReady||!d.open||!current()||document.hidden||watchId!==null||!navigator.onLine)return;
  if(!navigator.geolocation){gpsError(Error('Lokasi perangkat tidak didukung.'));return;}
  const id=gpsEpoch;watchId=navigator.geolocation.watchPosition(position=>{if(id!==gpsEpoch||!d.open||document.hidden)return;try{acceptGPS(position,true);}catch(error){gpsError(error);}},error=>{if(id===gpsEpoch)gpsError(error);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 }
 async function refreshGPS(route=false){
  if(route)autoStudentRoute=false;
  if(!current())return;if(!navigator.onLine){status.textContent='Peta dan rute memerlukan internet.';return;}
  const id=gpsEpoch,intent=++intentEpoch;routeButton.disabled=true;d.querySelector('#pMapLocate').disabled=true;status.textContent='Mendeteksi lokasi perangkat Anda… Izinkan akses lokasi saat browser meminta.';
  try{
   if(!navigator.geolocation)throw Error('Lokasi perangkat tidak didukung.');
   if(!gpsPromise)gpsPromise=new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0})).finally(()=>{gpsPromise=null;});
   const position=await gpsPromise;
   if(id!==gpsEpoch||!d.open)return;origin=gpsPoint(position);describeOrigin();
   if(intent===intentEpoch){if(route||mode==='route')drawRoute();else status.textContent='Lokasi Anda siap. Tekan Lihat jalan ke mahasiswa untuk melihat petunjuk jalan.';}
   startWatch();
  }catch(error){if(id===gpsEpoch&&d.open&&intent===intentEpoch)gpsError(error);}finally{if(d.open&&!gpsPromise){routeButton.disabled=false;d.querySelector('#pMapLocate').disabled=false;}}
 }
 function choose(place){
  const lat=Number(place?.lat),lon=Number(place?.lon??place?.lng);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
  destination=place.student?null:{lat,lon,accuracy:0,at:Date.now(),name:String(place.name||'Tempat terpilih').slice(0,200),placeId:place.id||''};input.value=destination?.name||'';confirm.hidden=true;lastRoutePoint=null;destinationLabel();describeOrigin();void refreshGPS(true);
 }
 async function explore(){
  autoStudentRoute=false;intentEpoch++;
  if(!current()||!navigator.onLine){status.textContent='Penjelajahan tempat memerlukan internet.';return;}
  if(!javascriptKey){status.textContent='Klik ikon Google untuk melihat detail bawaan Google. Untuk membuat rute di jendela ini, isi nama tempat beserta kota pada Cari tujuan lain. Menghubungkan pilihan ikon langsung ke web memerlukan Maps JavaScript; nama/foto tambahan memakai Places API, dengan kuota dan kemungkinan biaya tersendiri.';return;}
  mode='explore';if(explorer){iframe.hidden=true;mapElement.hidden=false;return;}
  const id=++viewEpoch;status.textContent='Memuat peta interaktif tempat…';
  try{
   const [g,module]=await Promise.all([googleMapLibrary(javascriptKey),explorerModule()]);if(id!==viewEpoch||!d.open||mode!=='explore')return;
   iframe.hidden=true;mapElement.hidden=false;
   const instance=await module.mount({host:mapElement,g,target:current(),name:student?.nama||nim,onRoute:choose,onStatus:text=>{if(id===viewEpoch&&d.open&&mode==='explore')status.textContent=text;}});
   if(id!==viewEpoch||!d.open)instance.dispose();else explorer=instance;
  }catch(error){if(id===viewEpoch&&d.open){showPoint();status.textContent=error.message;}}
 }
 function street(){
  autoStudentRoute=false;intentEpoch++;
  confirm.hidden=true;if(!current()||!navigator.onLine){status.textContent='Panorama 360° memerlukan internet.';return;}
  if(mode==='explore'&&explorer){explorer.street();return;}
  const t=target();if(!Number.isFinite(t.lat)){status.textContent='Untuk panorama tempat hasil pencarian, pilih 360° pada peta Google tempat tersebut. Lokasi mahasiswa tetap tersedia lewat Lokasi target (mahasiswa).';return;}
  mode='street';frame();if(!key){needsKey();return;}iframe.title='Panorama 360° di sekitar '+t.name;iframe.src=embed('streetview',{location:coordinates(t),radius:'500',source:'outdoor'});status.textContent='Panorama jalan terdekat hingga 500 m dari '+t.name+'. Ketersediaan mengikuti cakupan Street View Google.';
 }
 function update(){
  autoStudentRoute=true;d.querySelector('.p-map-search-options').open=false;intentEpoch++;stopWatch();disposeExplorer();origin=null;destination=null;lastRoutePoint=null;confirmedFarPoint=null;confirm.hidden=true;input.value='';originLabel.hidden=true;
  const p=current();if(!p)return;destinationLabel();
  d.querySelector('.p-map-summary').textContent=new Date(p.at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB · akurasi ±'+Math.round(p.accuracy)+' m · '+(Number.isFinite(p.battery)?'Baterai '+p.battery+'% · ':'')+p.lat.toFixed(5)+', '+p.lon.toFixed(5);
  d.querySelector('.p-map-place').textContent='Alamat mengikuti lokasi mahasiswa yang tersimpan.';void place(p);showPoint();startWatch();
 }
 for(const mark of marks){const option=document.createElement('option');option.value=String(mark.slot);option.textContent='Pertemuan '+mark.slot;select.append(option);}
 routeButton.onclick=()=>void refreshGPS(true);d.querySelector('#pMapLocate').onclick=()=>void refreshGPS(false);
 search.onsubmit=e=>{e.preventDefault();const query=input.value.trim();if(query.length<3){status.textContent='Isi nama tempat beserta kota, atau alamat lengkap (minimal 3 karakter).';input.focus();return;}autoStudentRoute=false;intentEpoch++;disposeExplorer();destination={query,name:query};confirm.hidden=true;lastRoutePoint=null;destinationLabel();describeOrigin();showSearch();};
 d.querySelector('.p-map-link').onclick=()=>{autoStudentRoute=false;d.querySelector('.p-map-search-options').open=false;intentEpoch++;disposeExplorer();destination=null;input.value='';confirm.hidden=true;lastRoutePoint=null;destinationLabel();describeOrigin();showPoint();};
 confirm.onclick=()=>{if(origin){confirmedFarPoint={...origin};drawRoute();}};
 d.querySelector('#pMapExplore').onclick=()=>void explore();d.querySelector('#pMapStreet').onclick=street;
 d.querySelector('#pMapReset').onclick=()=>{travel.value='driving';d.querySelector('.p-map-frame').scrollTop=0;update();};
 travel.onchange=()=>{if(mode==='route'&&origin)drawRoute();};select.onchange=update;
 d.querySelector('#pMapRetry').onclick=()=>{if(mode==='route'&&origin)drawRoute();else if(mode==='street')street();else if(mode==='search')showSearch();else if(mode==='explore')void explore();else showPoint();};
 const fullscreen=d.querySelector('#pMapFullscreen');fullscreen.onclick=()=>{const active=d.classList.toggle('p-map-fullscreen');fullscreen.setAttribute('aria-pressed',String(active));fullscreen.innerHTML=PresenUI.icon('expand')+(active?'Ukuran normal':'Layar penuh');};
 const visibility=()=>{if(document.hidden)stopWatch();else startWatch();};
 const connection=()=>{if(navigator.onLine){if(mode==='route'&&origin)drawRoute();else if(mode==='search')showSearch();else if(mode==='street')street();else if(mode==='explore')void explore();else showPoint();startWatch();}else{stopWatch();frame();iframe.removeAttribute('src');status.textContent='Sedang offline. Lokasi absensi tetap tersimpan; peta dan rute memerlukan internet.';}};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('online',connection);window.addEventListener('offline',connection);
 const resetDialog=()=>d.close();window.addEventListener('wa-global-reset',resetDialog);
 d.addEventListener('close',()=>{stopWatch();disposeExplorer();addressEpoch++;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('wa-global-reset',resetDialog);iframe.removeAttribute('src');});
 if(slot&&marks.some(x=>x.slot===slot))select.value=String(slot);
 if(marks.length)update();else{select.disabled=true;iframe.hidden=true;status.textContent='Lokasi tidak tersedia untuk mahasiswa ini.';for(const button of d.querySelectorAll('.p-map-actions button,.p-map-route-controls button,.p-map-search button'))button.disabled=true;}
 try{const config=await WA.api('maps-config');key=config.embedKey||'';javascriptKey=config.javascriptKey||'';}catch(_){}
 configReady=true;d.querySelector('#pMapExplore').disabled=!current();if(d.open&&current()){if(mode==='point')showPoint();else if(mode==='search')showSearch();else if(mode==='route'&&origin)drawRoute();startWatch();}
}
async function render(){
 pending=false;if(!body||!paper||matchMedia('print').matches)return;
 if(!window.PresenUI||!window.WASheetReady)return;const s=await WA.get();if(s.profile?.role!=='teacher')return;
 const params=Object.fromEntries(new URLSearchParams(location.search)),ctx=WA.ctx({...s.selection,...params}),scope=await WA.scope(ctx,params.matkul??s.selection?.matkul??''),used=new Set(),availableNims=new Set(s.snapshot.marks.filter(m=>m.scope===scope&&valid(m.location)).map(m=>m.nim)),buttons=new Map([...layer.children].map(b=>[b.dataset.nim,b]));
 const pr=paper.getBoundingClientRect(),scale=pr.width/paper.offsetWidth||1;
 // Old saved sheets may still carry the row-number positioning class. A location
 // control must never change a grid cell's containing block, including in print.
 body.querySelectorAll('.p-location-row-number').forEach(cell=>cell.classList.remove('p-location-row-number'));
 for(const row of body.querySelectorAll('tr:not(.page-preview-only)')){
  const nim=row.cells[1]?.querySelector('input')?.value,cell=row.cells[2],input=cell?.querySelector('.name-input');if(!cell||!input)continue;
  const available=availableNims.has(nim);input.classList.toggle('p-location-name-input',available);if(!available)continue;
  used.add(nim);let b=buttons.get(nim);
  if(!b){b=document.createElement('button');b.type='button';b.dataset.nim=nim;b.className='p-location-icon p-screen-only';b.innerHTML=PresenUI.icon('pin');b.style.pointerEvents='auto';layer.append(b);}
  const name=input.value||nim;b.setAttribute('aria-label','Lihat lokasi absensi '+name);b.title='Lihat lokasi absensi '+name;
  const r=cell.getBoundingClientRect(),size=Math.max(8,Math.min(18,r.height/scale-4));
  b.style.setProperty('--location-size',size+'px');b.style.left=((r.right-pr.left)/scale-size-3)+'px';b.style.right='auto';b.style.top=((r.top+r.height/2-pr.top)/scale)+'px';
  b.onclick=e=>{e.stopPropagation();void show(nim,scope);};
 }
 for(const b of [...layer.children])if(!used.has(b.dataset.nim))b.remove();
}

function schedule(){if(!pending){pending=true;requestAnimationFrame(()=>void render());}}
if(body&&paper){new MutationObserver(schedule).observe(body,{childList:true,subtree:true});WA.on(schedule);window.addEventListener('presen-ui-ready',schedule);window.addEventListener('resize',schedule);window.addEventListener('afterprint',schedule);window.addEventListener('scroll',schedule,true);new ResizeObserver(schedule).observe(paper);new MutationObserver(schedule).observe(paper,{attributes:true,attributeFilter:['style','class']});setTimeout(schedule,500);}window.PresenLocations={render,valid,open:show,address,addressText,normalizeAddress};
})();
