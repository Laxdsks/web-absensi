const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['127.0.0.1','localhost'].includes(new URL(BASE).hostname))throw Error('Login checks run only on the isolated local server.');
test('administrator signs in with the updated ID and password without a full-name field',{timeout:90000},async t=>{
 const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8'),password=source.match(/\$pass === '([^']+)'/)[1];
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:393,height:852}}),p=await context.newPage();
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.abort());
 try{
  await t.test('the old password and removed alias do not grant administrator access',async()=>{
   for(const fields of [{username:'M.Fadillah',password:password.slice(0,-1)},{username:'Fall',password}]){
    const response=await context.request.post(BASE+'index.php',{form:{action:'login_privat',...fields}});assert.equal((await response.json()).status,'error');
   }
  });
  await p.goto(BASE+'index.php');await p.waitForFunction(()=>window.WA);
  await t.test('the mobile login has only ID and password; registration retains its profile fields',async()=>{
   assert.equal(await p.locator('#authLogDisplayName').count(),0);assert.equal(await p.locator('#formLoginAuth input').count(),2);assert.equal(await p.locator('#formRegisterTeacher [name=display_name]').count(),1);assert.equal(await p.locator('#formRegisterTeacher [name=avatar_file]').count(),1);assert.equal(await p.locator('#formRegisterTeacher [name=role]').count(),1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  });
  await t.test('UI login succeeds and keeps the existing administrator identity',async()=>{
   await p.locator('#authLogName').fill('M.Fadillah');await p.locator('#authLogPass').fill(password);await Promise.all([p.waitForNavigation({waitUntil:'load'}),p.locator('#formLoginAuth .btn-submit').click()]);await p.locator('#authOverlay').waitFor({state:'hidden'});await p.waitForFunction(()=>window.WA);const account=await p.evaluate(async()=>(await WA.api('snapshot')).snapshot.profile.account);assert.equal(account.id,'admin_01');assert.equal(account.username,'M.Fadillah');assert.equal(account.role,'admin');
  });
  await t.test('older clients cannot make an extra display-name field a login requirement',async()=>{
   const response=await context.request.post(BASE+'index.php',{form:{action:'login_privat',username:'M.Fadillah',password,display_name:'Outdated cached display name'}}),result=await response.json();assert.equal(result.status,'success');assert.equal(result.user,'M.Fadillah');
  });
 }finally{await browser.close();}
});
