const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.WA_PLAYWRIGHT_PATH||'/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8000/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Print fixtures require a local server.');
test('moved signatures retain their screen positions in real attendance and exam PDFs',{timeout:120000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.WA_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
  await p.goto(BASE);await p.waitForFunction(()=>window.WA);
  const source=fs.readFileSync(path.join(__dirname,'../index.php'),'utf8');await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),source.match(/\$pass === '([^']+)'/)[1]);
  const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'8',kelas:'D',year:'2028/2029',period:'Genap'},course='Print position '+Date.now();
  await p.evaluate(async ctx=>{const old=(await WA.get()).snapshot.roster.filter(r=>WA.sameCtx(r,ctx));await WA.deleteStudents(ctx,old);for(let n=1;n<=32;n++)await WA.queue({type:'student-upsert',ctx,nim:'CPARITY'+String(n).padStart(3,'0'),nama:'MAHASISWA CONTOH '+n,jk:'L'});await WA.sync();},ctx);
  const out=process.env.WA_PRINT_EVIDENCE||path.join(__dirname,'results/sheet-print');fs.mkdirSync(out,{recursive:true});
  for(const sheet of ['absen','ujian'])await t.test(sheet+' wide margins and upward offsets fit the same PDF page',async()=>{
   await p.goto(BASE+sheet+'.php?'+new URLSearchParams({...ctx,matkul:course}));await p.waitForFunction(()=>window.WASheetReady);await p.locator('#sheetLayoutSettings').waitFor();
   const font=p.locator(sheet==='absen'?'#fontSizeSelect':'#examFontSize');await font.fill('6.5');await font.dispatchEvent('change');
   if(sheet==='absen')await p.selectOption('#marginTemplate','wide');
   let original;
   for(const y of [0,-40,-80]){
    await p.evaluate(y=>{document.querySelectorAll('#paperSheet .signature-box').forEach((box,i)=>{box.style.transform=`translate(${i?8:0}px, ${y+(i?8:0)}px)`;const fields=box.querySelectorAll('[contenteditable]');fields[0].textContent=i?'RIGHTSIGNATURE':'LEFTSIGNATURE';fields[fields.length-1].textContent=i?'RIGHTIDENTITY':'LEFTIDENTITY';});WAFitSheetText();},y);
    await p.waitForTimeout(200);
    const geometry=()=>{const paper=document.querySelector('#paperSheet'),r=paper.getBoundingClientRect(),scale=r.width/paper.offsetWidth;return [...paper.querySelectorAll('.signature-box')].map(box=>{const b=box.getBoundingClientRect();return{top:(b.top-r.top)/scale,bottom:(b.bottom-r.top)/scale,left:(b.left-r.left)/scale,stored:box.style.transform};});};
    const screen=await p.evaluate(geometry);if(y===0)original=screen;else assert(screen[0].top<original[0].top-5,'Moving up must move the block, not add invisible spacing');
    await p.emulateMedia({media:'print'});await p.evaluate(()=>WAFitSheetText());const print=await p.evaluate(geometry);
    for(let i=0;i<2;i++){
     assert(Math.abs(screen[i].top-print[i].top)<1,JSON.stringify({sheet,y,screen,print}));
     assert(Math.abs(screen[i].bottom-print[i].bottom)<1,JSON.stringify({sheet,y,screen,print}));
     assert.equal(screen[i].stored,print[i].stored,'Stored user offsets remain editable');
    }
    const file=path.join(out,sheet+'-position-'+Math.abs(y)+'.pdf');await p.pdf({path:file,preferCSSPageSize:true,printBackground:true});
    const xml=execFileSync('pdftotext',['-bbox',file,'-'],{encoding:'utf8'});assert.equal((xml.match(/<page\b/g)||[]).length,1,'Visible signatures must not be pushed to an extra print page');
    for(const [i,side] of ['LEFT','RIGHT'].entries()){
     const match=xml.match(new RegExp('<word[^>]*yMin="([\\d.]+)"[^>]*>'+side+'SIGNATURE</word>'));assert(match,'Signature label exists in PDF');
     assert(Math.abs(Number(match[1])-screen[i].top*.75)<4,'Real PDF signature position matches the visible sheet');
     assert(xml.includes('>'+side+'IDENTITY</word>'),'Identity remains with its signature');
    }
    await p.emulateMedia({media:'screen'});
   }
  });
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
