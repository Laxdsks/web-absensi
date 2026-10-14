const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['127.0.0.1','localhost'].includes(new URL(BASE).hostname))throw Error('Account fixtures must only run on a local test server.');
test('teacher accounts isolate roster, documents, approvals, forged operations and resets',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const admin=await browser.newContext(),lecturer=await browser.newContext(),student=await browser.newContext();
 const a=await admin.newPage(),b=await lecturer.newPage(),c=await student.newPage();
 try{
  for(const context of[admin,lecturer,student])await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.abort());
  const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8'),passwords=[...source.matchAll(/\$pass === '([^']+)'/g)].map(x=>x[1]);
  for(const[p,username,password]of[[a,'M.Fadillah',passwords[0]],[b,'Zen',passwords[1]]]){
   await p.goto(BASE+'index.php');await p.waitForFunction(()=>!!window.WA);await p.evaluate(f=>WA.login('teacher',f),{username,password});
  }
  const ctx={jenjang:'S1',prodi:'Pendidikan Sejarah',semester:'5',kelas:'E'},suffix=Date.now(),nim='ISOL'+suffix,course='Isolation-'+suffix;
  for(const[p,nama]of[[a,'Admin only'],[b,'Lecturer only']]){
   await p.evaluate(async({ctx,nim,nama,course})=>{await WA.queue({type:'student-upsert',ctx,nim,nama,jk:'L'});await WA.sync();await WA.saveDocument(ctx,course,'grade',{data_nilai:[{nim,nama,skor_akhir:nama.startsWith('Admin')?91:71}]});await WA.sync();},{ctx,nim,nama,course});
  }
  let left=await a.evaluate(()=>WA.get()),right=await b.evaluate(()=>WA.get());
  assert.equal(left.snapshot.roster.find(x=>x.nim===nim).nama,'Admin only');assert.equal(right.snapshot.roster.find(x=>x.nim===nim).nama,'Lecturer only');
  assert.equal(left.snapshot.documents.find(x=>x.matkul===course).content.data_nilai[0].skor_akhir,91);assert.equal(right.snapshot.documents.find(x=>x.matkul===course).content.data_nilai[0].skor_akhir,71);
  const forged=await a.evaluate(async({ctx,nim})=>WA.api('sync',{operations:[{id:crypto.randomUUID(),type:'student-delete',ctx:{...ctx,owner:'dosen_01'},nim,resetEpoch:(await WA.get()).snapshot.resetEpoch||0}]}),{ctx,nim});assert.equal(forged.results[0].status,'error');
  await c.goto(BASE+'app/?role=student');await c.waitForFunction(()=>!!window.WA);const studentNim='REG'+suffix;
  await c.evaluate(f=>WA.login('student',f),{ctx:{...ctx,owner:'dosen_01'},nim:studentNim,nama:'Student lecturer only',jk:'P',pin:'123456',register:true});
  await a.evaluate(()=>WA.sync());await b.evaluate(()=>WA.sync());left=await a.evaluate(()=>WA.get());right=await b.evaluate(()=>WA.get());
  assert(!left.snapshot.registrations.some(x=>x.nim===studentNim));const account=right.snapshot.registrations.find(x=>x.nim===studentNim);assert(account);
  const badApproval=await a.evaluate(async id=>WA.api('sync',{operations:[{id:crypto.randomUUID(),type:'approve',account:id,resetEpoch:(await WA.get()).snapshot.resetEpoch||0}]}),account.id);assert.equal(badApproval.results[0].status,'error');
  await b.evaluate(async id=>{await WA.queue({type:'approve',account:id});await WA.sync();},account.id);await c.evaluate(()=>WA.sync());assert.equal((await c.evaluate(()=>WA.get())).profile.account.approved,true);
  for(const[p,own,other]of[[a,'Admin only','Lecturer only'],[b,'Lecturer only','Admin only']]){const u=BASE+'data_siswa.php?'+new URLSearchParams(ctx);const html=await p.evaluate(async u=>(await fetch(u)).text(),u);assert(html.includes(own));assert(!html.includes(other));}
  const alt={...ctx,year:'2027/2028',period:'Genap'};
  await a.evaluate(async({ctx,nim,course})=>{await WA.queue({type:'student-upsert',ctx,nim,nama:'Next academic year only',jk:'L'});await WA.sync();await WA.saveDocument(ctx,course,'grade',{data_nilai:[{nim,skor_akhir:55}]});await WA.sync();},{ctx:alt,nim,course});
  left=await a.evaluate(()=>WA.get());assert.equal(left.snapshot.roster.filter(x=>x.nim===nim).length,2);assert(left.snapshot.documents.some(x=>x.matkul===course&&x.ctx.year==='2027/2028'&&x.ctx.period==='Genap'));
  const ownCode=await a.evaluate(async({ctx,course})=>{const session=await WA.startSession(ctx,course,1,1);await WA.sync();return WA.qr('session',(await WA.get()).profile.certificate,'challenge',session.challenge);},{ctx,course});await assert.rejects(()=>c.evaluate(code=>WA.readQR(code),ownCode),/dosen.*lain/);
  await b.evaluate(async id=>{await WA.queue({type:'reject',account:id});await WA.sync();},account.id);await c.evaluate(()=>WA.sync());assert.equal((await c.evaluate(()=>WA.get())).profile.account.approval_status,'rejected');
  const adminBefore=(await a.evaluate(()=>WA.get())).snapshot.roster.length;
  await b.evaluate(()=>WA.api('reset-all-student-data',{confirmation:'HAPUS SEMUA MAHASISWA'}));await b.evaluate(()=>WA.sync());await a.evaluate(()=>WA.sync());
  assert.equal((await b.evaluate(()=>WA.get())).snapshot.roster.length,0);assert.equal((await a.evaluate(()=>WA.get())).snapshot.roster.length,adminBefore);
  for(const[context,nama]of[[ctx,'Admin only'],[alt,'Next academic year only']])await a.evaluate(async({ctx,nim,nama})=>{await WA.deleteStudents(ctx,[{nim,nama}]);await WA.sync();},{ctx:context,nim,nama});
 }finally{await browser.close();}
});
