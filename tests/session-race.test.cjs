/* A delayed server response must not restore an account after local logout. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Fixtures must remain local.');
for(const result of ['success','expired'])test('late '+result+' sync does not restore or expire a logged-out student',{timeout:45000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext(),page=await context.newPage(),errors=[];
 let release,started;const gate=new Promise(r=>release=r),requested=new Promise(r=>started=r);
 const snapshot={profile:{role:'student',device:'race-device',account:{nama:'Uji sesi lama',nim:'RACE001',approved:true,ctx:{jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A'}}},roster:[],marks:[],sessions:[],documents:[],registrations:[],tag:'old-result',serverTime:Date.now()};
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(BASE).origin)return route.abort();
  if(url.pathname.endsWith('/app_api.php')&&req.method()==='POST'){
   const action=req.postDataJSON().action;if(action==='snapshot'){started();await gate;return route.fulfill({status:result==='expired'?401:200,contentType:'application/json',body:JSON.stringify(result==='expired'?{status:'error',code:'AUTH_REQUIRED',message:'Sesi lama berakhir.'}:{status:'success',snapshot})});}
   if(action==='logout')return route.fulfill({contentType:'application/json',body:'{"status":"success"}'});
   return route.fulfill({status:503,contentType:'application/json',body:'{"status":"error"}'});
  }
  return route.continue();
 });
 try{
  await page.goto(BASE+'app/?role=student');await page.locator('#login').waitFor();
  await page.evaluate(snapshot=>WA.change(s=>({...s,token:'old-race-token',profile:snapshot.profile,snapshot})),snapshot);
  await page.locator('#deleteMyAccount').waitFor();await page.evaluate(()=>{window.pendingRaceSync=WA.sync();});await requested;
  await page.evaluate(()=>WA.logout());await page.locator('#login').waitFor();release();await page.evaluate(()=>window.pendingRaceSync);
  const state=await page.evaluate(()=>WA.get());assert.equal(state.profile,null,'a late response must not restore the old identity');assert.equal(state.token,null);assert(!state.authExpired,'a revoked old token must not expire a new empty session');assert.deepEqual(state.snapshot.roster,[]);
  await page.locator('#login').waitFor();assert.deepEqual(errors,[]);
 }finally{release();await browser.close();}
});

test('a sync requested during an older fetch waits for the fresh attendance result',{timeout:45000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext(),page=await context.newPage();
 const release=[],start=[],gates=[0,1].map(i=>new Promise(r=>release[i]=r)),requested=[0,1].map(i=>new Promise(r=>start[i]=r));let count=0;
 const snapshot={profile:{role:'student',device:'queued-device',account:{nama:'Uji sinkronisasi',nim:'SYNC001',approved:true,ctx:{jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A'}}},roster:[],marks:[],sessions:[],documents:[],registrations:[],tag:'first',serverTime:Date.now()};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(BASE).origin)return route.abort();
  if(url.pathname.endsWith('/app_api.php')&&req.method()==='POST'){
   const i=count++;if(i<2){start[i]();await gates[i];}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'success',snapshot:{...snapshot,tag:i?'fresh':'first',marks:i?[{scope:'test-scope',slot:1,nim:'SYNC001',mark:'.'}]:[]}})});
  }
  return route.continue();
 });
 try{
  await page.goto(BASE+'app/?role=student');await page.locator('#login').waitFor();await page.evaluate(snapshot=>WA.change(s=>({...s,token:'queued-race-token',profile:snapshot.profile,snapshot})),snapshot);
  await page.evaluate(()=>{window.firstSync=WA.sync();});await requested[0];await page.evaluate(()=>{window.queuedFinished=false;window.queuedSync=WA.sync().then(()=>{window.queuedFinished=true;});});release[0]();await requested[1];
  assert.equal(await page.evaluate(()=>window.queuedFinished),false,'the refresh must still wait while the newer attendance response is held');
  release[1]();await page.evaluate(()=>window.queuedSync);assert.equal((await page.evaluate(()=>WA.get())).snapshot.marks[0].mark,'.');
 }finally{release.forEach(r=>r());await browser.close();}
});
