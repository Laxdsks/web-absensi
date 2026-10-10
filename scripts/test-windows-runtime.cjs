/* Run the packaged desktop app offline on an isolated CI runner; never log into hosting. */
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const executable=path.resolve('dist/windows/win-unpacked/Presen Desk.exe'),port=19339;
let child,socket,next=0;const pending=new Map();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
  const until=Date.now()+60000;
  while(Date.now()<until){
    try{const targets=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json()),page=targets.find(x=>x.type==='page');
      if(page){socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
        socket.onclose=()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Desktop target closed.'));}pending.clear();};socket.onmessage=event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}};return;}
    }catch(_){}await pause(500);
  }throw Error('Packaged desktop app did not expose its test debugging port.');
}
function command(method,params={},timeout=20000){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Desktop command timed out: '+method));},timeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression,timeout=20000){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(result.exceptionDetails)throw Error(result.exceptionDetails.text+' '+(result.exceptionDetails.exception?.description||''));return result.result?.value;}
async function wait(expression){const until=Date.now()+30000;while(Date.now()<until){try{if(await evaluate(expression))return;}catch(_){}await pause(200);}throw Error('Desktop UI did not reach the expected state.');}
async function launch(){
  // A deliberately unavailable local proxy simulates disconnection for Chromium and net.fetch.
  child=spawn(executable,[`--remote-debugging-port=${port}`,'--proxy-server=http://127.0.0.1:9'],{stdio:'ignore'});
  await connect();await wait("typeof WA!=='undefined'");
}
async function close(){
  const exited=new Promise(resolve=>child.once('exit',resolve));
  const requested=evaluate('window.close()').catch(error=>{if(!/Desktop target closed/.test(error.message))throw error;});
  await Promise.race([requested,exited]);await Promise.race([exited,pause(20000).then(()=>{throw Error('Desktop app failed to close after saving.');})]);socket.close();
}
(async()=>{
  assert(fs.existsSync(executable));await launch();await wait("document.body.innerText.toLowerCase().includes('masuk ke sistem')");
  await evaluate(`WA.change(s=>({...s,token:null,profile:{role:'teacher',device:crypto.randomUUID(),account:{nama:'CI offline'}},snapshot:{roster:[{jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A',id:1,nim:'C1234567890123',nama:'CI mahasiswa',jk:'L'}],sessions:[],marks:[],documents:[],registrations:[]},outbox:[],selection:null}))`);
  const url='https://datasiswasekolah.42web.io/absen.php?prodi=Pendidikan%20Teknologi%20Informasi&semester=1&kelas=A&matkul=CI-offline';
  await command('Page.navigate',{url});await wait("window.WASheetReady===true&&!!document.querySelector('.attendance-cell')");
  await evaluate("(()=>{const el=document.querySelector('.attendance-cell');el.value='.';el.dispatchEvent(new Event('input',{bubbles:true}));})()");
  // Close before the debounce expires; the native close handler must flush the draft.
  await close();await launch();await command('Page.navigate',{url});await wait("window.WASheetReady===true&&document.querySelector('.attendance-cell')?.value==='.'");
  assert.equal(await evaluate("(async()=>{const s=await WA.get();return s.outbox.some(o=>o.type==='mark'&&o.mark==='.')})()"),true);
  await command('Page.navigate',{url:'https://datasiswasekolah.42web.io/data_siswa.php?prodi=Pendidikan%20Teknologi%20Informasi&semester=1&kelas=A'});await wait("window.WASheetReady===true&&typeof buatWorkerDaftar==='function'");
  const photo=require('../tests/fixtures/attendance-photo.cjs'),result=await evaluate('('+photo.toString()+')()',180000);assert.equal(result.rows.length,21,JSON.stringify(result));assert.deepEqual(result.rows.map(r=>r.nim),Array.from({length:21},(_,i)=>'C722202401'+String(i+1).padStart(3,'0')));assert(result.rows.every(r=>r.nama));assert(result.enabled);
  console.log('Presen Desk: real JPEG import reads all 21 prefixed NIMs in the offline packaged desktop app.');
  await command('Page.navigate',{url});await wait("window.WASheetReady===true&&!!document.querySelector('.attendance-cell')");
  await evaluate("(async()=>{const el=document.querySelector('.attendance-cell');el.dispatchEvent(new Event('input',{bubbles:true}));await WAFlush();})()");
  await command('Page.navigate',{url:'https://datasiswasekolah.42web.io/data_siswa.php?prodi=Pendidikan%20Teknologi%20Informasi&semester=1&kelas=A'});await wait("window.WASheetReady===true&&document.querySelector('#tabelSiswa .student-row')");
  await evaluate("window.confirm=()=>true;document.querySelector('#tabelSiswa .btn-danger').click()");await wait("(async()=>!(await WA.get()).snapshot.roster.length)()");await close();await launch();await command('Page.navigate',{url});await wait("window.WASheetReady===true");assert.equal(await evaluate("document.querySelectorAll('#tbodySiswa .nim-input').length"),0);assert.equal(await evaluate("bukaRekapNilai();document.querySelectorAll('#tbodyRekapNilai tr').length"),0);
  await command('Page.navigate',{url:'https://datasiswasekolah.42web.io/ujian.php?prodi=Pendidikan%20Teknologi%20Informasi&semester=1&kelas=A&matkul=CI-offline'});await wait("window.WASheetReady===true");assert.equal(await evaluate("document.querySelectorAll('#examTableBlock tbody tr').length"),0);
  console.log('Presen Desk: offline roster deletion survives native restart; saved attendance, recap and exam do not restore the removed student.');
  await evaluate("WA.change(s=>{const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A'};s.snapshot.roster=Array.from({length:21},(_,i)=>({...ctx,id:i+1,nim:'BULK'+i,nama:'CI bulk '+i,jk:'L'}));s.snapshot.roster.push({...ctx,kelas:'B',id:22,nim:'OTHER',nama:'Kelas lain',jk:'P'});return s;})");
  await command('Page.navigate',{url:'https://datasiswasekolah.42web.io/data_siswa.php?prodi=Pendidikan%20Teknologi%20Informasi&semester=1&kelas=A'});await wait("window.WASheetReady===true&&document.querySelectorAll('#tabelSiswa .student-row').length===21");
  await evaluate("window.confirm=()=>true;document.querySelector('a[href*=hapus_semua]').click()");await close();await launch();await command('Page.navigate',{url});await wait("window.WASheetReady===true");assert.equal(await evaluate("document.querySelectorAll('#tbodySiswa .nim-input').length"),0);assert.equal(await evaluate("(async()=>{const s=await WA.get();return s.snapshot.roster.length===1&&s.snapshot.roster[0].nim==='OTHER'&&s.outbox.filter(o=>o.type==='student-delete'&&o.nim.startsWith('BULK')).length===21})()"),true);
  console.log('Presen Desk: immediate native close after bulk delete retains all 21 deletions and leaves another class unchanged.');
  await close();console.log('Presen Desk: packaged Windows app launches offline; immediate native close retains attendance across restart.');
})().catch(error=>{if(child&&!child.killed)child.kill();if(socket)socket.close();console.error(error.message);process.exitCode=1;});
