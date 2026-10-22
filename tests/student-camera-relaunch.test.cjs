const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Camera fixtures require a local server.');
test('camera decodes the lecturer QR, evidence is required, and a saved student survives relaunch',{timeout:180000},async t=>{
 const subtest=t.test.bind(t);t.test=async(name,fn)=>{let failure;await subtest(name,async()=>{try{await fn();}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 const out=path.join(__dirname,'results/student-camera');fs.mkdirSync(out,{recursive:true});const feed=path.join(out,'camera.y4m');
 execFileSync('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=white:s=1280x720:r=30','-vf','setsar=1','-frames:v','2','-pix_fmt','yuv420p',feed]);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+feed]}),teacher=await browser.newContext(),student=await browser.newContext({viewport:{width:393,height:852},permissions:['camera','geolocation'],geolocation:{latitude:-8.536,longitude:118.462,accuracy:20}}),tp=await teacher.newPage();let sp=await student.newPage();const errors=[];
 for(const c of [teacher,student])await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
 await student.addInitScript(()=>{window.Android={appRole:()=> 'student',isNativeApp:()=>true,locationAllowed:()=>true,getBatteryPercent:()=>80};localStorage.setItem('wa-student-onboarding-v1','complete');const geo=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);navigator.geolocation.getCurrentPosition=(ok,err,options)=>geo(p=>ok({coords:p.coords,timestamp:Date.now()}),err,options);});
 tp.on('pageerror',e=>errors.push(e.message));sp.on('pageerror',e=>errors.push(e.message));
 const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'6',kelas:'D'},suffix=Date.now(),nim='CAM'+suffix,course='Camera '+suffix;
 try{
  await tp.goto(BASE);await tp.waitForFunction(()=>window.WA);const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8');await tp.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),source.match(/\$pass === '([^']+)'/)[1]);
  await tp.evaluate(async row=>{await WA.queue({type:'student-upsert',ctx:row,...row});await WA.sync();},{...ctx,nim,nama:'Mahasiswa Kamera Uji',jk:'L'});
  await sp.goto(BASE+'app/?role=student');await sp.locator('#login').waitFor();await sp.evaluate(fields=>WA.login('student',fields),{register:true,ctx,nim,nama:'Mahasiswa Kamera Uji',jk:'L',pin:'654321'});
  await tp.evaluate(async nim=>{await WA.sync();const id=(await WA.get()).snapshot.registrations.find(x=>x.nim===nim).id;await WA.queue({type:'approve',account:id});await WA.sync();},nim);await sp.evaluate(()=>WA.sync());await sp.locator('#scanSession:not([disabled])').waitFor();
  const {session,legacy,compact}=await tp.evaluate(async({ctx,course})=>{const session=await WA.startSession(ctx,course,1,15);await WA.sync();const legacy=WA.qr('session',(await WA.get()).profile.certificate,'challenge',session.challenge);return{session,legacy,compact:await WA.compactQR(legacy)};},{ctx,course});
  await t.test('signed compact QR is smaller, tampering is rejected and legacy QR still works',async()=>{
   assert(compact.startsWith('WA2:'));assert(compact.length<legacy.length*.85,JSON.stringify({legacy:legacy.length,compact:compact.length}));
   for(const code of [legacy,compact])assert.equal((await sp.evaluate(code=>WA.readQR(code),code)).challenge.id,session.id);
   await assert.rejects(()=>sp.evaluate(code=>WA.readQR(code.slice(0,-12)+'AAAAAAAAAAAA'),compact),/QR|tanda tangan/i);
   const forged=await tp.evaluate(async code=>{const w=WA.decode(code.slice(4)),[body,sig]=w.challenge.split('.');w.challenge=WA.encode({...WA.decode(body),slot:16})+'.'+sig;return WA.compactQR('WA1:'+WA.encode(w));},legacy);await assert.rejects(()=>sp.evaluate(code=>WA.readQR(code),forged),/tanda tangan/i);
  });
  await t.test('actual camera frames decode and close the scanner without submitting attendance early',async()=>{
   const png=await sp.evaluate(async code=>{const image=new Image();image.src=URL.createObjectURL(await WAQRFiles.png(code));await image.decode();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1280,720);g.imageSmoothingEnabled=false;g.drawImage(image,440,160,400,400);return canvas.toDataURL('image/png').split(',')[1];},compact);
   const image=path.join(out,'computer-qr.png');fs.writeFileSync(image,Buffer.from(png,'base64'));execFileSync('ffmpeg',['-y','-loglevel','error','-i',image,'-vf','fps=30,setsar=1,format=yuv420p','-frames:v','2',feed]);
   await sp.locator('#scanSession').click();try{await sp.locator('#scanner').waitFor({state:'hidden',timeout:20000});}catch(error){console.error(await sp.evaluate(()=>({status:document.querySelector('#scanStatus').textContent,video:[document.querySelector('#camera').videoWidth,document.querySelector('#camera').videoHeight,document.querySelector('#camera').readyState]})));await sp.screenshot({path:path.join(out,'camera-failure.png'),fullPage:true});throw error;}await sp.locator('#replyForm').waitFor();assert.match(await sp.locator('.student-scan-receipt').innerText(),/QR berhasil dibaca/);assert.equal(await sp.locator('#camera').evaluate(e=>e.srcObject),null);
   assert(!(await sp.evaluate(()=>WA.get())).snapshot.marks.some(m=>m.session_id===session.id));await sp.screenshot({path:path.join(out,'after-scan.png'),fullPage:true});
  });
  await t.test('sickness requires a reason and photo, provides full photo preview, then reaches the lecturer',async()=>{
   await sp.locator('#replyForm [name=mark]').selectOption('S');assert(await sp.locator('#replyForm [name=reason]').evaluate(e=>e.required));await sp.locator('#replyForm [name=reason]').fill('Sedang beristirahat karena sakit.');await sp.locator('#replyForm [type=submit]').click();await sp.locator('#notice').getByText(/foto bukti/).waitFor();
   await sp.locator('[data-evidence-file]').setInputFiles({name:'bukti.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(out,'computer-qr.png'))});await sp.locator('[data-view-photo]').waitFor();await sp.locator('[data-view-photo]').click();await sp.locator('.evidence-dialog .evidence-full').waitFor();await sp.locator('.evidence-dialog>.p-close').click();
   // Saved form/photo must survive navigation before submission as well.
   await sp.reload();await sp.locator('#replyForm').waitFor();assert.equal(await sp.locator('#replyForm [name=reason]').inputValue(),'Sedang beristirahat karena sakit.');await sp.locator('[data-view-photo]').waitFor();await sp.locator('#replyForm [type=submit]').click();
   await sp.waitForFunction(async id=>(await WA.get()).snapshot.marks.some(m=>m.session_id===id&&m.mark==='S'),session.id);await tp.waitForFunction(async id=>{await WA.sync();return (await WA.get()).snapshot.marks.some(m=>m.session_id===id);},session.id);
   const mark=(await tp.evaluate(()=>WA.get())).snapshot.marks.find(m=>m.session_id===session.id&&m.nim===nim);assert.equal(mark.review_status,'pending');assert.equal(mark.evidence_ready,true);assert.equal(mark.attachments.length,1);assert.equal((await tp.evaluate(id=>WA.api('read-evidence',{id}),mark.attachments[0].id)).hash,mark.attachments[0].hash);
  });
  await t.test('closing, reopening, damaged optional drafts and offline reload retain the logged-in UI and history',async()=>{
   await sp.evaluate(async()=>{const s=await WA.get();localStorage.setItem('wa-student-draft-'+s.profile.device,'{broken');await WA.prepareOffline();});
   await sp.close();sp=await student.newPage();sp.on('pageerror',e=>errors.push(e.message));await sp.goto(BASE+'app/?role=student');await sp.locator('#scanSession').waitFor();assert.match(await sp.locator('.student-identity').innerText(),new RegExp(nim));
   await student.setOffline(true);await sp.reload();await sp.locator('#scanSession').waitFor();await sp.locator('[data-student-view=history]').click();await sp.locator('.student-history-item').waitFor();assert.match(await sp.locator('#history').innerText(),/Sakit/);await sp.locator('.student-history-item summary').first().click();await sp.locator('[data-photo-row]').first().click();await sp.locator('.evidence-full').waitFor();await sp.locator('.evidence-dialog>.p-close').click();await sp.screenshot({path:path.join(out,'reopened-offline-history.png'),fullPage:true});await student.setOffline(false);
  });
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({legacyBytes:legacy.length,compactBytes:compact.length,cameraFrameDecoded:true,closedAfterScan:true,evidenceDelivered:true,reopenedOffline:true,physicalPhoneTested:false},null,2));
 }finally{await browser.close();}
});
