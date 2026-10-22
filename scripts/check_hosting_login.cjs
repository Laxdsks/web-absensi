// Exercise only authentication on the deployed site; never create attendance fixtures
// or record response bodies, snapshots, credentials, screenshots or browser storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'playwright');
const BASE=process.env.WA_VERIFY_URL||'https://datasiswasekolah.42web.io/';
if(!['datasiswasekolah.42web.io','127.0.0.1','localhost'].includes(new URL(BASE).hostname))throw Error('Unexpected verification host.');
const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8'),username=source.match(/\$user === '([^']+)'/)[1],password=source.match(/\$pass === '([^']+)'/)[1];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.WA_CHROMIUM_PATH?{executablePath:process.env.WA_CHROMIUM_PATH}:{})}),context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await context.route('**/app_api.php',async route=>{
  // Opening the live UI must not send pending push messages as a smoke-test side effect.
  if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='dispatch-push')await route.fulfill({json:{status:'success'}});
  else await route.continue();
 });
 let stage='open',accepted=false,initialized=false,loginHTTP=null,bootstrapHTTP=null;
 page.on('response',async r=>{
  if(r.request().method()!=='POST')return;
  const url=new URL(r.url());
  if(url.origin!==new URL(BASE).origin)return;
  if(url.pathname.endsWith('/index.php'))loginHTTP=r.status();
  if(url.pathname.endsWith('/app_api.php')&&r.request().postDataJSON()?.action==='bootstrap')bootstrapHTTP=r.status();
 });
 try{
  await page.goto(new URL('index.php?jenjang=S1&prodi=Pendidikan+Teknologi+Informasi&semester=1&kelas=A&matkul=Profesi+Pendidikan',BASE).href,{waitUntil:'load',timeout:60000});
  await page.locator('#authLogName').waitFor({timeout:60000});await page.waitForFunction(()=>!!window.WATeacher);
  // Observe the existing initializer without changing its behavior or logging data.
  await page.evaluate(()=>{const original=window.WATeacher.prepare;window.WATeacher.prepare=async(...args)=>{window.__loginAccepted=true;try{const value=await original(...args);window.__loginInitialized=true;return value;}catch(error){window.__loginInitFailure=error.name;throw error;}};});
  stage='submit';await page.locator('#authLogName').fill(username);await page.locator('#authLogPass').fill(password);
  await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:45000}),page.locator('#formLoginAuth .btn-submit').click()]);
  accepted=true;initialized=true;stage='verify';await page.locator('#authOverlay').waitFor({state:'hidden',timeout:30000});await page.waitForFunction(()=>!!window.WA);
  assert.equal(await page.evaluate(async()=>(await WA.get()).profile?.account?.id),'admin_01');
  assert.equal(await page.locator('#toggleLoginPassword').count(),1);
  console.log('Live browser login, account initialization, hidden login overlay and password visibility control verified; no attendance fixtures created.');
 }catch(error){
  try{const flags=await page.evaluate(()=>({accepted:!!window.__loginAccepted,initialized:!!window.__loginInitialized}));accepted||=flags.accepted;initialized||=flags.initialized;}catch(_){}
  console.error(JSON.stringify({stage,loginHTTP,bootstrapHTTP,accepted,initialized,errorType:error.name}));process.exitCode=1;
 }finally{
  try{await page.evaluate(async()=>{if(window.WA&&(await WA.get()).token)await WA.api('logout');});}catch(_){}
  await browser.close();
 }
})().catch(error=>{console.error('Browser verification failed: '+error.name);process.exitCode=1;});
