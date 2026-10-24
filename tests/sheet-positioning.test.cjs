const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {chromium}=require('/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8012/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Local fixtures only');
test('all visible sheet blocks move through inspector and arrows, preserve independent positions, and reload',{timeout:180000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const context=await browser.newContext({viewport:{width:1500,height:1100}});await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE);await p.waitForFunction(()=>window.WA);await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),fs.readFileSync('index.php','utf8').match(/\$pass === '([^']+)'/)[1]);
 const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'6',kelas:'C',year:'2026/2027',period:'Genap',matkul:'Position test '+Date.now()};
 for(const page of ['absen','ujian']){
  await p.goto(BASE+page+'.php?'+new URLSearchParams(ctx));await p.waitForFunction(()=>window.WASheetReady);await p.locator('#sheetLayoutSettings').waitFor();
  const ids=await p.locator('#paperSheet .selectable-element[id]').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>e.id));assert(ids.length>=8);
  for(const id of ids){
   await p.locator('#'+id).evaluate(el=>el.click());await p.locator('#'+id).focus();const before=await p.locator('#'+id).boundingBox();await p.keyboard.press('Shift+ArrowUp');await p.waitForTimeout(160);let after=await p.locator('#'+id).boundingBox();assert(Math.abs(after.y-before.y+5)<.3,JSON.stringify({page,id,before,after,selected:await p.evaluate(()=>selectedElement?.id),transform:await p.locator('#'+id).evaluate(e=>e.style.transform)}));
   await p.locator('#inspectorPanel button[onclick*="\'y\'"][onclick*="-3"]').evaluate(el=>el.click());await p.waitForTimeout(160);after=await p.locator('#'+id).boundingBox();const step=3;assert(Math.abs(after.y-before.y+5+step)<.3,page+' '+id+' inspector up');
   await p.locator('#'+id).focus();await p.keyboard.press('Shift+ArrowDown');await p.keyboard.press('Shift+ArrowRight');await p.waitForTimeout(160);assert.match(await p.locator('#'+id).evaluate(e=>e.style.transform),/translate\(5px,/);
   await p.evaluate(()=>resetPosisiAktif());await p.evaluate(()=>document.getElementById('customModalOverlay')?.classList.remove('show'));await p.waitForTimeout(160);
  }
  const right=page==='absen'?'uniRightBox':'examLecturerBox',left=page==='absen'?'uniLeftBox':'examSupervisorBox';await p.locator('#'+right).evaluate(e=>e.click());const before=await p.locator('#'+right).boundingBox(),other=await p.locator('#'+left).boundingBox();
  await p.evaluate(()=>ubahPosisiAktif('y',-60));await p.waitForTimeout(100);const after=await p.locator('#'+right).boundingBox();assert(Math.abs(after.y-before.y+60)<.3,'No invisible upward clamp');assert(Math.abs((await p.locator('#'+left).boundingBox()).y-other.y)<.3,'Neighbour remains in place');
  await p.evaluate(async()=>{await WAFlush();await WA.sync();});await p.reload();await p.waitForFunction(()=>window.WASheetReady);assert.equal(await p.locator('#'+right).evaluate(e=>e.style.transform),'translate(0px, -60px)');
  await p.emulateMedia({media:'print'});await p.evaluate(()=>pastikanJarakTandaTangan());assert.equal(await p.locator('#'+right).evaluate(e=>e.style.getPropertyValue('--wa-signature-offset')),'0px');await p.emulateMedia({media:'screen'});
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
