const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8012/';
if(!['127.0.0.1','localhost'].includes(new URL(BASE).hostname))throw Error('Login recovery fixtures require the isolated local server.');
const password=fs.readFileSync(require('node:path').join(__dirname,'../index.php'),'utf8').match(/\$pass === '([^']+)'/)[1];
test('login recovers from pending guest initialization and reports synchronization failures accurately',{timeout:90000},async t=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 async function page(){const c=await browser.newContext({viewport:{width:393,height:852}});await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());return c.newPage();}
 async function fill(p){await p.waitForFunction(()=>!!window.WATeacher);await p.locator('#authLogName').fill('M.Fadillah');await p.locator('#authLogPass').fill(password);}
 try{
  await t.test('a pending guest bootstrap cannot reject a subsequent successful login',async()=>{
   const p=await page();let release,held=false;const ready=new Promise(r=>release=r);
   await p.route('**/app_api.php',async route=>{if(route.request().postDataJSON()?.action==='bootstrap'&&!held){held=true;await ready;await route.fulfill({status:401,json:{status:'error',message:'Masuk dengan akun dosen terlebih dahulu.'}});}else await route.continue();});
   p.on('response',r=>{if(r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/index.php'))release();});
   await p.goto(BASE+'index.php?jenjang=S1&prodi=Pendidikan+Teknologi+Informasi&semester=1&kelas=A&matkul=Profesi+Pendidikan');await fill(p);assert(held);
   await Promise.all([p.waitForNavigation({waitUntil:'load',timeout:10000}),p.locator('#formLoginAuth .btn-submit').click()]);
   await p.locator('#authOverlay').waitFor({state:'hidden'});assert.equal((await p.evaluate(()=>WA.get())).profile.account.id,'admin_01');await p.context().close();
  });
  await t.test('the password eye reveals and hides the same password without submitting',async()=>{
   const p=await page();await p.goto(BASE+'index.php');await fill(p);let posts=0;p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/index.php'))posts++;});
   const eye=p.locator('#toggleLoginPassword');assert.equal(await eye.getAttribute('aria-label'),'Tampilkan kata sandi');assert.equal(await p.locator('#authLogPass').getAttribute('type'),'password');await eye.click();assert.equal(await p.locator('#authLogPass').getAttribute('type'),'text');assert.equal(await eye.getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#authLogPass').inputValue(),password);
   await p.getByRole('button',{name:'Sembunyikan kata sandi',exact:true}).click();assert.equal(await p.locator('#authLogPass').getAttribute('type'),'password');assert.equal(posts,0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.context().close();
  });
  await t.test('bootstrap failure keeps the form retryable and a retry succeeds without clearing device data',async()=>{
   const p=await page();let signedIn=false,blocked=true;
   p.on('response',r=>{if(r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/index.php'))signedIn=true;});
   await p.route('**/app_api.php',async route=>{if(signedIn&&blocked&&route.request().postDataJSON()?.action==='bootstrap')await route.fulfill({status:503,json:{status:'error',message:'Sinkronisasi uji sementara tidak tersedia.'}});else await route.continue();});
   await p.goto(BASE+'index.php');await fill(p);await p.locator('#formLoginAuth .btn-submit').click();await p.getByText('Login diterima, tetapi sinkronisasi belum siap: Sinkronisasi uji sementara tidak tersedia.',{exact:true}).waitFor();assert(await p.locator('#formLoginAuth .btn-submit').isEnabled());assert.equal(await p.locator('#authLogPass').inputValue(),password);
   blocked=false;await Promise.all([p.waitForNavigation({waitUntil:'load'}),p.locator('#authLogPass').press('Enter')]);await p.locator('#authOverlay').waitFor({state:'hidden'});assert.equal((await p.evaluate(()=>WA.get())).profile.account.id,'admin_01');await p.context().close();
  });
  await t.test('a bearer left by another account cannot override the newly authenticated PHP session',async()=>{
   const p=await page();await p.goto(BASE+'index.php');await fill(p);await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),password);const oldToken=(await p.evaluate(()=>WA.get())).token;
   const lecturerPassword=[...fs.readFileSync(require('node:path').join(__dirname,'../index.php'),'utf8').matchAll(/\$pass === '([^']+)'/g)][1][1];
   await p.evaluate(password=>WA.login('teacher',{username:'Zen',password}),lecturerPassword);
   const result=await p.evaluate(async token=>WA.api('bootstrap',{pubkey:(await WA.keys()).pub},token),oldToken);
   assert.equal(result.snapshot.profile.account.id,'dosen_01');assert.equal(result.snapshot.profile.account.role,'teacher');assert.equal((await p.evaluate(()=>WA.get())).profile.account.id,'dosen_01');await p.context().close();
  });
  await t.test('a non-JSON server error is distinguished from an incorrect password and can be retried',async()=>{
   const p=await page();await p.goto(BASE+'index.php');await fill(p);
   await p.route('**/index.php',async route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'text/html',body:'<h1>Temporary hosting failure</h1>'}):route.continue());
   await p.locator('#formLoginAuth .btn-submit').click();await p.getByText('Server mengirim respons login yang tidak terbaca (HTTP 503). Coba lagi sebentar.',{exact:true}).waitFor();assert(await p.locator('#formLoginAuth .btn-submit').isEnabled());assert.equal((await p.evaluate(()=>WA.get())).profile,null);assert.equal(await p.locator('#authOverlay').isVisible(),true);await p.context().close();
  });
 }finally{await browser.close();}
});
