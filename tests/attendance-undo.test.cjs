const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8012/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Local fixtures only');
test('Undo/Redo retain live roster values, attendance and trailing blanks across sync and reload; repair old blank snapshots',{timeout:180000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const context=await browser.newContext({viewport:{width:1500,height:1100}});await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE);await p.waitForFunction(()=>window.WA);await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),fs.readFileSync('index.php','utf8').match(/\$pass === '([^']+)'/)[1]);
 const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'7',kelas:'E',year:'2026/2027',period:'Ganjil'},course='Undo regression '+Date.now(),prefix='CU'+Date.now(),students=[1,2,3].map(n=>({nim:prefix+n,nama:'MAHASISWA UNDO '+n,jk:n===2?'':'L'}));
 await p.evaluate(async({ctx,students})=>{await WA.deleteStudents(ctx,(await WA.get()).snapshot.roster.filter(row=>WA.sameCtx(row,ctx)));await WA.sync();for(const student of students)await WA.queue({type:'student-upsert',ctx,...student});await WA.sync();},{ctx,students});const url=BASE+'absen.php?'+new URLSearchParams({...ctx,matkul:course});await p.goto(url);await p.waitForFunction(()=>window.WASheetReady);await p.locator('#sheetLayoutSettings').waitFor();
 const read=()=>p.locator('#tbodySiswa tr:not(.page-preview-only)').evaluateAll(rows=>rows.map(r=>({no:r.cells[0].textContent,nim:r.cells[1].querySelector('input').value,name:r.cells[2].querySelector('input').value,mark:r.querySelector('.attendance-cell').value})));
 const close=()=>p.evaluate(()=>document.getElementById('customModalOverlay')?.classList.remove('show'));
 await p.locator('#tbodySiswa .attendance-cell').first().fill('.');await p.locator('#tbodySiswa .attendance-cell').first().dispatchEvent('input');await p.evaluate(()=>tambahSiswa());await p.evaluate(()=>tambahSiswa());await p.evaluate(async()=>{await WAFlush();await WA.sync();});const expected=await read();assert.equal(expected.length,5);assert.deepEqual(expected.slice(0,3).map(r=>r.nim),students.map(s=>s.nim));assert.equal(expected[0].mark,'.');
 // The hydrated live values originally had no HTML value attributes. Exercise
 // actual toolbar Undo/Redo, not just snapshot helpers.
 for(let cycle=0;cycle<3;cycle++){
  await p.locator('#uniRightBox').evaluate(e=>e.click());await p.evaluate(()=>ubahPosisiAktif('y',-5));await p.locator('#topToolbar button[onclick="undo()"]').click();await close();assert.deepEqual(await read(),expected,'Undo must preserve every live cell value and order');await p.locator('#topToolbar button[onclick="redo()"]').click();await close();assert.deepEqual(await read(),expected,'Redo preserves the same roster');
 }
 // Rapid repeated Undo/Redo must not open a blocking success or empty-history dialog.
 await p.evaluate(()=>{historyStack=[];redoStack=[];});
 await p.locator('#uniRightBox').evaluate(e=>e.click());
 await p.evaluate(()=>{for(let n=0;n<15;n++)ubahPosisiAktif('x',1);});
 for(const action of ['undo','redo']){for(let n=0;n<18;n++)await p.locator('#topToolbar button[onclick="'+action+'()"]').click();assert.equal(await p.locator('#customModalOverlay').evaluate(e=>e.classList.contains('show')),false,action+' must remain nonblocking even after history runs out');assert.deepEqual(await read(),expected);}
 await p.evaluate(async()=>{await WAFlush();await WA.sync();});await p.reload();await p.waitForFunction(()=>window.WASheetReady);assert.deepEqual(await read(),expected,'Refresh retains roster and reserve rows');
 // Simulate an already-saved damaged document from the old serializer: all
 // inputs empty, including five blank reserved rows before the recovered roster.
 await p.evaluate(async({ctx,course})=>{const state=await WA.get(),scope=await WA.scope(ctx,course),doc=state.snapshot.documents.find(d=>d.scope===scope&&d.kind==='attendance-sheet'),content=structuredClone(doc.content);content.table.rows.forEach(row=>{for(let i=1;i<row.length;i++)row[i]='';});await WA.saveDocument(ctx,course,'attendance-sheet',content);await WA.sync();},{ctx,course});await p.reload();await p.waitForFunction(()=>window.WASheetReady);const repaired=await read();assert.equal(repaired.length,5,'Reuse blank slots; do not append another roster');assert.deepEqual(repaired.slice(0,3).map(r=>r.nim),students.map(s=>s.nim));assert.equal(repaired[0].mark,'.','Attendance is restored from its student key');assert(repaired.slice(3).every(r=>!r.nim&&!r.name));
 await p.evaluate(async()=>{await WAFlush();await WA.sync();});await p.reload();await p.waitForFunction(()=>window.WASheetReady);assert.deepEqual(await read(),repaired);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
