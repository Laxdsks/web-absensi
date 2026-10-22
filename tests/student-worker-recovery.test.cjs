/* A bundled WebView document can reject ServiceWorkerContainer.getRegistration.
   Optional notification cleanup must never prevent saved identity/history rendering. */
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const{chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
for(const native of[false,true])test('saved student history survives unavailable web service workers '+(native?'in native shell':'in browser'),{timeout:45000},async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const name=new URL(req.url,'http://fixture').pathname.slice(1),file=name==='app/'?'app/index.html':name;if(file.includes('..')){res.writeHead(403).end();return;}try{const data=fs.readFileSync(path.join(root,file));res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);}catch(_){res.writeHead(503).end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/',browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage(),errors=[];
 try{
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.addInitScript(native=>{window.__workerAccess=0;navigator.serviceWorker.getRegistration=async()=>{window.__workerAccess++;throw new DOMException('The document is in an invalid state.','InvalidStateError');};if(native){window.Android={appRole:()=> 'student',isNativeApp:()=>true,locationAllowed:()=>true};localStorage.setItem('wa-student-onboarding-v1','complete');}},native);
  page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'app/?role=student');await page.locator('#login').waitFor();
  await page.evaluate(async()=>{const ctx={prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A'};await WA.change(s=>({...s,profile:{role:'student',device:'worker-fixture',account:{id:'worker-student',nim:'WORKER123',nama:'Mahasiswa Riwayat',approved:true,approval_status:'approved',ctx}},snapshot:{roster:[],documents:[],registrations:[],sessions:[{id:'recorded-session',scope:'fixture-scope',ctx,matkul:'Riwayat Tetap Tampil',slot:1,starts:Date.now()-300000,deadline:Date.now()-100000,version:1}],marks:[{nim:'WORKER123',session_id:'recorded-session',scope:'fixture-scope',slot:1,mark:'.',recorded_at:Date.now(),review_status:'final'}]}}));});
  await page.locator('#scanSession:not([disabled])').waitFor();await page.locator('[data-student-view=history]').click();await page.locator('.student-history-item').filter({hasText:'Riwayat Tetap Tampil'}).waitFor();
  assert.match(await page.locator('#history').innerText(),/Hadir/);assert.equal(await page.locator('#notice').getByText(/Tampilan belum dapat dibuka/).count(),0);
  if(native)assert.equal(await page.evaluate(()=>window.__workerAccess),0);else assert((await page.evaluate(()=>window.__workerAccess))>0);
  await page.locator('[data-student-view=attendance]').click();assert.match(await page.locator('.student-identity').innerText(),/WORKER123/);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
