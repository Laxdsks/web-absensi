const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8012/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Loopback fixtures only.');
test('Google Embed routes use fresh GPS, support named destinations, remove manual origin and preserve attendance coordinates',{timeout:120000},async t=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:1280,height:1000},permissions:['geolocation'],geolocation:{latitude:-6.2,longitude:106.8,accuracy:3000}}),p=await c.newPage(),scripts=[],errors=[];
 let saved;const ctx={jenjang:'S1',prodi:'Pendidikan Sejarah',semester:'5',kelas:'A'},course='Destination route fixture',nim='MAP-DEST-TEST';
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='maps.googleapis.com'){scripts.push(u.pathname);return route.abort();}if(u.hostname==='www.google.com')return route.fulfill({contentType:'text/html',body:'<p>Google Embed fixture: route URL verified; live Google rendering is not mocked as a success.</p>'});return u.origin===new URL(BASE).origin?route.continue():route.abort();});
  await c.addInitScript(()=>{
   let seq=0;const watchers=new Map();window.mapTestGPS={latitude:-6.2,longitude:106.8,accuracy:3000};
   const fix=()=>({coords:{...window.mapTestGPS},timestamp:Date.now()});
   navigator.geolocation.getCurrentPosition=(ok,err,options)=>{window.mapGPSOptions=options;setTimeout(()=>ok(fix()),0);};
   navigator.geolocation.watchPosition=(ok,err,options)=>{window.mapGPSOptions=options;const id=++seq;watchers.set(id,ok);setTimeout(()=>{if(watchers.has(id))ok(fix());},0);return id;};
   navigator.geolocation.clearWatch=id=>{window.mapClearedWatches=(window.mapClearedWatches||0)+1;watchers.delete(id);};
   window.mapSetGPS=value=>{window.mapTestGPS=value;for(const ok of watchers.values())setTimeout(()=>ok(fix()),0);};
  });
  const setGeo=value=>p.evaluate(value=>window.mapSetGPS(value),value);
  await p.goto(BASE);await p.waitForFunction(()=>window.WA);
  await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),fs.readFileSync('index.php','utf8').match(/\$pass === '([^']+)'/)[1]);
  saved=await p.evaluate(async()=>{const old=await WA.api('maps-config');await WA.api('set-maps-config',{key:'local_test_embed_key_123456789',javascriptKey:''});return old;});
  await p.goto(BASE+'absen.php?'+new URLSearchParams({...ctx,matkul:course}));await p.waitForFunction(()=>window.WASheetReady);
  await p.evaluate(async({ctx,nim,course})=>{const scope=await WA.scope(ctx,course);await WA.change(s=>({...s,token:null,selection:{...ctx,matkul:course},outbox:[],snapshot:{...s.snapshot,roster:[{...ctx,id:99991,nim,nama:'Mahasiswa tujuan',jk:'L'}],sessions:[],documents:[],marks:[{scope,nim,slot:1,mark:'.',location:{lat:-8.54059,lon:118.43617,accuracy:41,at:Date.now()}}]}}));},{ctx,nim,course});
  await p.locator('.p-location-icon').click();await p.waitForFunction(()=>document.querySelector('.p-map-frame iframe')?.src.includes('/maps/embed/v1/'));
  const before=p.url(),recorded=await p.evaluate(async()=>(await WA.get()).snapshot.marks[0].location),frame=p.locator('.p-map-frame iframe'),url=async()=>new URL(await frame.getAttribute('src'));
  await t.test('manual latitude/longitude and alternate origin controls are gone',async()=>{
   assert.equal(await p.locator('#pMapManual,.p-map-manual,input[name=lat],input[name=lon]').count(),0);
   assert.equal((await url()).pathname,'/maps/embed/v1/place');assert.equal(await p.locator('#pMapRoute').innerText(),'Lihat jalan ke mahasiswa');assert.deepEqual(scripts,[]);
  });
  await t.test('coarse GPS cannot generate a misleading route',async()=>{
   await p.locator('#pMapRoute').click();await p.locator('.p-map-status').getByText(/kurang teliti/).waitFor();assert.equal((await url()).pathname,'/maps/embed/v1/place');assert.equal(await p.locator('.p-map-origin').isVisible(),false);assert.deepEqual(await p.evaluate(()=>mapGPSOptions),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  await t.test('nearby positions are identified without inventing a road distance',async()=>{
   await setGeo({latitude:-8.5406,longitude:118.4362,accuracy:15});await p.locator('#pMapRoute').click();await p.locator('.p-map-status').getByText(/sama atau berdekatan/).waitFor();assert.equal((await url()).pathname,'/maps/embed/v1/place');
  });
  await t.test('valid GPS automatically opens the student road route inside Google Embed and follows travel mode',async()=>{
   await setGeo({latitude:-8.53,longitude:118.43,accuracy:15});await p.locator('#pMapReset').click();await p.waitForFunction(()=>document.querySelector('.p-map-frame iframe').src.includes('/directions'));assert.match(await p.locator('#pMapRoute').innerText(),/Lihat jalan ke mahasiswa/);await p.locator('.p-map-status').getByText(/Garis perjalanan/).waitFor();let u=await url();assert.equal(u.pathname,'/maps/embed/v1/directions');assert.equal(u.searchParams.get('origin'),'-8.53,118.43');assert.equal(u.searchParams.get('destination'),'-8.54059,118.43617');assert.equal(u.searchParams.get('language'),'id');await p.locator('#pMapTravel').selectOption('walking');assert.equal((await url()).searchParams.get('mode'),'walking');assert.equal(p.url(),before);
  });
  await t.test('named place search becomes an explicit route destination and GPS refresh preserves it',async()=>{
   await p.locator('.p-map-search-options>summary').click();await p.locator('#pMapDestination').fill('Toko Roti Contoh, Dompu');await p.locator('#pMapSearch').click();assert.equal((await url()).pathname,'/maps/embed/v1/search');assert.equal((await url()).searchParams.get('q'),'Toko Roti Contoh, Dompu');assert.match(await p.locator('.p-map-destination').innerText(),/Toko Roti Contoh, Dompu/);await p.locator('#pMapRoute').click();await p.locator('.p-map-status').getByText(/Garis perjalanan/).waitFor();assert.equal((await url()).searchParams.get('destination'),'Toko Roti Contoh, Dompu');
   await setGeo({latitude:-8.528,longitude:118.431,accuracy:15});await p.locator('#pMapLocate').click();await p.waitForFunction(()=>new URL(document.querySelector('.p-map-frame iframe').src).searchParams.get('origin')==='-8.528,118.431');assert.equal((await url()).searchParams.get('origin'),'-8.528,118.431');assert.equal((await url()).searchParams.get('destination'),'Toko Roti Contoh, Dompu');assert.equal((await url()).searchParams.get('mode'),'walking');
   await p.locator('#pMapExplore').click();assert.match(await p.locator('.p-map-status').innerText(),/Maps JavaScript/);assert.deepEqual(scripts,[],'Embed-only never tries an additional billable API');
  });
  await t.test('a late GPS callback cannot replace a newly chosen search view',async()=>{
   await p.evaluate(()=>{window.originalMapGet=navigator.geolocation.getCurrentPosition;navigator.geolocation.getCurrentPosition=ok=>{window.resolveMapGPS=()=>ok({coords:window.mapTestGPS,timestamp:Date.now()});};});
   await p.locator('#pMapRoute').click();await p.waitForFunction(()=>window.resolveMapGPS);
   await p.locator('#pMapDestination').fill('Kampus Contoh, Dompu');await p.locator('#pMapSearch').click();
   await p.evaluate(()=>{window.resolveMapGPS();navigator.geolocation.getCurrentPosition=window.originalMapGet;});
   await p.waitForFunction(()=>!document.querySelector('#pMapRoute').disabled);
   assert.equal((await url()).pathname,'/maps/embed/v1/search');assert.equal((await url()).searchParams.get('q'),'Kampus Contoh, Dompu');
  });
  await t.test('returning to the student clears the place destination; distant GPS requires confirmation',async()=>{
   await p.locator('.p-map-link').click();assert.equal(await p.locator('#pMapDestination').inputValue(),'');assert.equal((await url()).searchParams.get('q'),'-8.54059,118.43617');await setGeo({latitude:-6.2,longitude:106.8,accuracy:20});await p.locator('#pMapRoute').click();await p.locator('#pMapConfirm').waitFor();assert.match(await p.locator('.p-map-status').innerText(),/100 km/);assert.equal((await url()).pathname,'/maps/embed/v1/place');await p.locator('#pMapConfirm').click();assert.equal((await url()).searchParams.get('origin'),'-6.2,106.8');assert.equal((await url()).searchParams.get('destination'),'-8.54059,118.43617');
  });
  await t.test('Street View, reset, phone layout, offline and close preserve the student location',async()=>{
   await p.locator('#pMapStreet').click();let u=await url();assert.equal(u.pathname,'/maps/embed/v1/streetview');assert.equal(u.searchParams.get('location'),'-8.54059,118.43617');assert.equal(u.searchParams.get('radius'),'500');assert(!(await frame.getAttribute('sandbox')).includes('allow-top-navigation'));
   await p.locator('#pMapReset').click();assert.equal(await p.locator('#pMapTravel').inputValue(),'driving');assert.equal(await p.locator('#pMapDestination').inputValue(),'');assert.equal((await url()).searchParams.get('q'),'-8.54059,118.43617');assert.deepEqual(await p.evaluate(async()=>(await WA.get()).snapshot.marks[0].location),recorded);
   await p.setViewportSize({width:393,height:852});await p.locator('#pMapFullscreen').click();const box=await p.locator('.p-map-dialog').boundingBox();assert(box.width<=393);assert(await p.locator('.p-map-origin').evaluate(el=>el.hidden||el.scrollHeight<=el.clientHeight+1),'phone metadata is not compressed or clipped');assert.equal(await p.locator('#pMapManual').count(),0);await p.screenshot({path:'tests/results/map-destination-phone.png'});
   await p.emulateMedia({media:'print'});assert.equal(await p.locator('.p-map-dialog').isVisible(),false);await p.emulateMedia({media:'screen'});
   await p.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});assert.match(await p.locator('.p-map-status').innerText(),/offline/);assert.equal(await frame.getAttribute('src'),null);await p.locator('.p-map-dialog>.p-close').click();assert((await p.evaluate(()=>window.mapClearedWatches||0))>0);assert.deepEqual(errors,[]);
  });
 }finally{if(saved)try{await p.evaluate(config=>WA.api('set-maps-config',{key:config.embedKey,javascriptKey:config.javascriptKey}),saved);}catch(_){}await browser.close();}
});
