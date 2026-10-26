const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE=process.env.WA_TEST_URL||'http://127.0.0.1:8012/';
if(!['localhost','127.0.0.1'].includes(new URL(BASE).hostname))throw Error('Local print fixtures only');
test('exam identity lines follow entered digits and names after edits, reload, touch and actual PDF print',{timeout:90000},async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),p=await context.newPage();
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());
  await p.goto(BASE);await p.waitForFunction(()=>window.WA);
  await p.evaluate(password=>WA.login('teacher',{username:'M.Fadillah',password}),fs.readFileSync('index.php','utf8').match(/\$pass === '([^']+)'/)[1]);
  const url=BASE+'ujian.php?'+new URLSearchParams({prodi:'Pendidikan Teknologi Informasi',semester:'7',kelas:'E',year:'2033/2034',period:'Genap',matkul:'Identity line '+Date.now()});
  const ready=()=>p.waitForFunction(()=>document.documentElement.dataset.teacherPageState==='ready');
  await p.goto(url);await ready();
  const geometry=()=>[...document.querySelectorAll('.signature-box')].map(box=>{const line=box.querySelector('.signature-name').getBoundingClientRect(),identity=box.querySelector('.signature-identity'),range=document.createRange();range.selectNodeContents(identity);const content=range.getBoundingClientRect(),paper=document.querySelector('#paperSheet').getBoundingClientRect(),scale=paper.width/document.querySelector('#paperSheet').offsetWidth;return{width:line.width/scale,content:content.width/scale,box:box.getBoundingClientRect().width/scale,x:(line.x-paper.x)/scale,y:(line.bottom-paper.y)/scale};});
  for(const role of ['supervisor','lecturer']){await p.locator(`[data-edit-key=${role}-name]`).fill('');await p.locator(`[data-edit-key=${role}-nidn]`).fill('123');}
  const short=await p.evaluate(geometry);
  for(const [i,role]of ['supervisor','lecturer'].entries())await p.locator(`[data-edit-key=${role}-nidn]`).fill(i?'9080706050':'1002003004');
  const long=await p.evaluate(geometry);
  for(let i=0;i<2;i++){assert(long[i].width>short[i].width+10);assert(Math.abs(long[i].width-long[i].content)<1,'line follows identity content rather than full signature box');assert(long[i].width<long[i].box*.75);}
  for(const size of ['10','6.5']){await p.locator('#examFontSize').fill(size);await p.waitForTimeout(100);const lines=await p.evaluate(geometry);for(const line of lines)assert(Math.abs(line.width-line.content)<1,'font changes keep a fitted line');}
  await p.evaluate(()=>WAFlush());await p.waitForTimeout(500);await p.reload();await ready();assert.equal(await p.locator('[data-edit-key=supervisor-nidn]').textContent(),'1002003004');
  const screen=await p.evaluate(geometry);await p.emulateMedia({media:'print'});await p.evaluate(()=>WAFitSheetText());const print=await p.evaluate(geometry);
  for(let i=0;i<2;i++)assert(Math.abs(screen[i].width-print[i].width)<1,'screen and print line lengths agree');
  const out=path.join(__dirname,'results/exam-identity');fs.mkdirSync(out,{recursive:true});const file=path.join(out,'exam-identity.pdf');await p.pdf({path:file,preferCSSPageSize:true,printBackground:false});
  execFileSync('python3',['-c',`import fitz,json,sys
p=fitz.open(sys.argv[1]);lines=json.loads(sys.argv[2]);text=''.join(page.get_text() for page in p)
assert '1002003004' in text and '9080706050' in text
for line in lines:
 expected=line['width']*.75
 assert any(d['type']=='f' and d.get('fill') is not None and max(d['fill'])<.1 and abs(d['rect'].width-expected)<1 and .4<d['rect'].height<1.2 for page in p for d in page.get_drawings()), ('Fitted identity underline missing in PDF',expected)
`,file,JSON.stringify(print)],{encoding:'utf8'});
  await p.emulateMedia({media:'screen'});await p.locator('[data-edit-key=supervisor-name]').fill('DOSEN PENGAWAS UJIAN, M.Pd.');const named=await p.evaluate(geometry);assert(named[0].width>screen[0].width,'a longer name stays above its full underline');assert(named[0].width<=named[0].box+1);
  const touch=await browser.newContext({storageState:await context.storageState(),viewport:{width:393,height:852},isMobile:true,hasTouch:true});await touch.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin?r.continue():r.abort());const phone=await touch.newPage();await phone.goto(url);await phone.waitForFunction(()=>document.documentElement.dataset.teacherPageState==='ready');await phone.locator('[data-edit-key=lecturer-nidn]').fill('456');const mobile=await phone.evaluate(geometry);assert(Math.abs(mobile[1].width-mobile[1].content)<1);assert(mobile[1].width<print[1].width);
 }finally{await browser.close();}
});
