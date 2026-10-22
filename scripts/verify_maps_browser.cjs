// Read-only live checks. Store only screenshots of example maps and sanitized summaries.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'playwright');
const BASE=process.env.WA_VERIFY_URL||'https://datasiswasekolah.42web.io/';
if(!['datasiswasekolah.42web.io','localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Unexpected verification host.');
const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8');
const username=source.match(/\$user === '([^']+)'/)[1],password=source.match(/\$pass === '([^']+)'/)[1];
const output=process.env.WA_MAP_EVIDENCE||path.join(process.cwd(),'maps-evidence');fs.mkdirSync(output,{recursive:true});
const safe=text=>String(text).replace(/AIza[\w-]{20,}/g,'[REDACTED]').replace(/([?&](?:key|token|signature)=)[^&\s"<>]+/gi,'$1[REDACTED]');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.WA_CHROMIUM_PATH?{executablePath:process.env.WA_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000}}),page=await context.newPage(),report={modes:[],console:[]};
 await context.route('**/app_api.php',async route=>route.request().method()==='POST'&&route.request().postDataJSON()?.action==='dispatch-push'?route.fulfill({json:{status:'success'}}):route.continue());
 page.on('console',message=>{if(['error','warning'].includes(message.type()))report.console.push(safe(message.text()).slice(0,500));});
 let stage='login';
 try{
  await page.goto(new URL('index.php',BASE).href,{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>!!window.WATeacher);
  await page.locator('#authLogName').fill(username);await page.locator('#authLogPass').fill(password);
  await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:45000}),page.locator('#formLoginAuth .btn-submit').click()]);
  await page.locator('#authOverlay').waitFor({state:'hidden'});await page.waitForFunction(()=>!!window.PresenAppearance);
  stage='configuration';
  report.savedConfiguration=await page.evaluate(async()=>{const c=await WA.api('maps-config');return {embedConfigured:!!c.embedKey,javascriptConfigured:!!c.javascriptKey};});
  assert(report.savedConfiguration.embedConfigured,'Maps Embed key is not saved.');assert(!report.savedConfiguration.javascriptConfigured,'Optional paid JavaScript key must stay empty.');
  await page.locator('[data-appearance]').first().click();await page.locator('#pMapsTest').click();
  const iframe=page.locator('.p-maps-test-frame');await iframe.scrollIntoViewIfNeeded();
  for(const mode of ['place','directions','streetview']){
   stage=mode;
   const responsePromise=page.waitForResponse(r=>{const u=new URL(r.url());return u.hostname==='www.google.com'&&u.pathname==='/maps/embed/v1/'+mode;},{timeout:35000}).catch(()=>null);
   await page.locator('[data-map-mode="'+mode+'"]').click();
   const response=await responsePromise;
   await page.waitForTimeout(10000);await iframe.scrollIntoViewIfNeeded();
   const handle=await iframe.elementHandle(),frame=await handle.contentFrame();
   const details=frame?await frame.evaluate(()=>({title:document.title,text:document.body?.innerText.slice(0,2500)||'',bodyHeight:document.body?.getBoundingClientRect().height||0,canvas:document.querySelectorAll('canvas').length,images:[...document.images].filter(i=>i.complete&&i.naturalWidth>100).length,regions:[...document.querySelectorAll('[role=region],[role=application]')].map(n=>n.getAttribute('aria-label')||'').slice(0,6)})).catch(e=>({inspectionError:e.name})):{};
   const row={mode,http:response?.status()||null,box:await iframe.boundingBox(),...details};
   if(response&&!response.ok())row.httpError=safe((await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1000));
   row.text=safe(row.text||'');report.modes.push(row);
   await iframe.screenshot({path:path.join(output,mode+'.png')});
  }
  report.outerPageStayedOnWebsite=new URL(page.url()).origin===new URL(BASE).origin;
 }catch(error){report.failure={stage,type:error.name,message:safe(error.message).slice(0,500)};process.exitCode=1;}
 finally{
  try{await page.evaluate(()=>fetch('index.php',{method:'POST',credentials:'same-origin',body:new URLSearchParams({action:'logout_system'})}));}catch(_){}
  report.console=[...new Set(report.console)].slice(-15);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
 }
})().catch(error=>{console.error(safe(error.name));process.exitCode=1;});
