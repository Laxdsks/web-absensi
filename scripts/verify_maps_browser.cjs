// Read-only live checks. Store only screenshots of example maps and sanitized summaries.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'playwright');
const BASE=process.env.WA_VERIFY_URL||'https://datasiswasekolah.42web.io/';
if(!['datasiswasekolah.42web.io','localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Unexpected verification host.');
const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8');
const username=source.match(/\$user === '([^']+)'/)[1],password=source.match(/\$pass === '([^']+)'/)[1];
const output=process.env.WA_MAP_EVIDENCE||path.join(process.cwd(),'maps-evidence');fs.mkdirSync(output,{recursive:true});
const samples=(process.env.WA_MAP_SAMPLES||'place,directions,streetview,streetview-reference').split(',');
assert(samples.every(x=>['place','search','directions','streetview','streetview-reference','streetview-nearby'].includes(x)),'Unknown map sample.');
const safe=text=>String(text).replaceAll(password,'[REDACTED_PASSWORD]').replace(/AIza[\w-]{20,}/g,'[REDACTED]').replace(/([?&](?:key|token|signature)=)[^&\s"<>]+/gi,'$1[REDACTED]');
(async()=>{
 // This disposable CI browser has no GPU. Software WebGL is enabled only for
 // this trusted Google-map diagnostic, never as a setting on users' browsers.
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.WA_CHROMIUM_PATH?{executablePath:process.env.WA_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000}}),page=await context.newPage(),report={modes:[],console:[],failedResources:[]};
 await context.route('**/app_api.php',async route=>route.request().method()==='POST'&&route.request().postDataJSON()?.action==='dispatch-push'?route.fulfill({json:{status:'success'}}):route.continue());
 page.on('console',message=>{if(['error','warning'].includes(message.type()))report.console.push(safe(message.text()).slice(0,500));});
 page.on('response',response=>{if(response.status()>=400){const u=new URL(response.url());report.failedResources.push({status:response.status(),host:u.hostname,path:safe(u.pathname).slice(0,240)});}});
 let stage='login';
 try{
  await page.goto(new URL('index.php',BASE).href,{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>!!window.WATeacher);
  await page.locator('#authLogName').fill(username);await page.locator('#authLogPass').fill(password);
  await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:45000}),page.locator('#formLoginAuth .btn-submit').click()]);
  await page.locator('#authOverlay').waitFor({state:'hidden'});await page.waitForFunction(()=>!!window.PresenAppearance);
  stage='configuration';
  report.savedConfiguration=await page.evaluate(async()=>{const c=await WA.api('maps-config');return {embedConfigured:!!c.embedKey,javascriptConfigured:!!c.javascriptKey};});
  assert(report.savedConfiguration.embedConfigured,'Maps Embed key is not saved.');
  await page.evaluate(()=>{PresenAppearance.open();});await page.locator('#pMapsTest').click();
  const iframe=page.locator('.p-maps-test-frame');await iframe.scrollIntoViewIfNeeded();
  for(const mode of samples){
   stage=mode;
   const apiMode=mode.startsWith('streetview')?'streetview':mode;
   const responsePromise=page.waitForResponse(r=>{const u=new URL(r.url());return u.hostname==='www.google.com'&&u.pathname==='/maps/embed/v1/'+apiMode;},{timeout:35000}).catch(()=>null);
   if(['streetview-reference','streetview-nearby'].includes(mode))await iframe.evaluate((element,sample)=>{const old=new URL(element.src),u=new URL('https://www.google.com/maps/embed/v1/streetview');u.search=new URLSearchParams({key:old.searchParams.get('key'),language:'id',location:sample==='streetview-nearby'?'-8.54059,118.43617':'46.414382,10.013988',...(sample==='streetview-nearby'?{radius:'500',source:'outdoor'}:{})});element.src=u.href;},mode);
   else if(mode==='search')await iframe.evaluate(element=>{const old=new URL(element.src),u=new URL('https://www.google.com/maps/embed/v1/search');u.search=new URLSearchParams({key:old.searchParams.get('key'),language:'id',q:'Royal Futsal Dompu'});element.src=u.href;});
   else await page.locator('[data-map-mode="'+mode+'"]').click();
   const response=await responsePromise;
   await page.waitForTimeout(apiMode==='streetview'?20000:10000);await iframe.scrollIntoViewIfNeeded();
   const handle=await iframe.elementHandle(),frame=await handle.contentFrame();
   const details=frame?await frame.evaluate(()=>({title:document.title,text:document.body?.innerText.slice(0,2500)||'',bodyHeight:document.body?.getBoundingClientRect().height||0,canvas:document.querySelectorAll('canvas').length,images:[...document.images].filter(i=>i.complete&&i.naturalWidth>100).length,regions:[...document.querySelectorAll('[role=region],[role=application]')].map(n=>n.getAttribute('aria-label')||'').slice(0,6)})).catch(e=>({inspectionError:e.name})):{};
   const row={mode,http:response?.status()||null,box:await iframe.boundingBox(),...details};
   if(response&&!response.ok())row.httpError=safe((await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1000));
   row.text=safe(row.text||'');report.modes.push(row);
   await iframe.screenshot({path:path.join(output,mode+'.png')});
   console.log('Maps sample '+mode+': HTTP '+(row.http||'unknown')+'; canvases='+(row.canvas||0)+'; map images='+(row.images||0));
   if(mode==='search')assert(response?.ok()&&!/Google Maps Platform rejected|API project is not authorized|invalid API key|BillingNotEnabled/i.test(row.text||''),'Google Embed search was not accepted.');
  }
  report.outerPageStayedOnWebsite=new URL(page.url()).origin===new URL(BASE).origin;
 }catch(error){report.failure={stage,type:error.name,message:safe(error.message).slice(0,500)};process.exitCode=1;}
 finally{
  try{await page.evaluate(()=>fetch('index.php',{method:'POST',credentials:'same-origin',body:new URLSearchParams({action:'logout_system'})}));}catch(_){}
  report.console=[...new Set(report.console)].slice(-15);
  const sanitized=safe(JSON.stringify(report,null,2));fs.writeFileSync(path.join(output,'report.json'),sanitized);console.log(sanitized);await browser.close();
 }
})().catch(error=>{console.error(safe(error.name));process.exitCode=1;});
