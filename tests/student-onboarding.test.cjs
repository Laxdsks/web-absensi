const{test}=require('node:test'),assert=require('node:assert/strict');
const{chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Onboarding test requires the local server.');
test('native student onboarding requires location and explains scoped storage',async()=>{
 const browser=await chromium.launch({executablePath:process.env.WA_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext({permissions:['geolocation'],geolocation:{latitude:-8.536,longitude:118.462,accuracy:30}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await context.addInitScript(()=>{window.Android={appRole:()=> 'student',isNativeApp:()=>true};});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
  await page.goto(BASE+'app/?role=student');await page.locator('#studentOnboardingContinue').waitFor();
  assert.match(await page.locator('#main').innerText(),/lokasi.*absensi/i);assert.match(await page.locator('#main').innerText(),/tidak memerlukan izin penyimpanan umum/i);
  await context.clearPermissions();await page.locator('#studentOnboardingContinue').click();await page.locator('#studentOnboardingContinue').waitFor();assert.match(await page.locator('#setupStatus').innerText(),/Izin lokasi ditolak/i);assert.equal(await page.locator('#login').count(),0);
  await context.grantPermissions(['geolocation']);await page.locator('#studentOnboardingContinue').click();await page.locator('#login').waitFor();assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
