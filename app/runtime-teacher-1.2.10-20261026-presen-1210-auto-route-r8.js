if(!window.PresenTeacherBundleExecuted){window.PresenTeacherBundleExecuted=true;
/* app/core.js */
try {
/* Local records and outbox are committed together. No password or PIN is saved. */
(() => {
'use strict';
const ROOT=new URL('../',document.currentScript.src), enc=new TextEncoder(), dec=new TextDecoder();
const fresh=()=>({token:null,profile:null,snapshot:{roster:[],sessions:[],marks:[],documents:[],registrations:[]},outbox:[],selection:null});
let activeOwner='admin_01'; let opening, syncing, dispatching, bootstrapping, syncAgain=false, documentWrite=Promise.resolve(); const inFlight=new Set(); const listeners=new Set(), channel=typeof BroadcastChannel==='function'?new BroadcastChannel('wa-records'):null;
function db(){return opening ||=new Promise((resolve,reject)=>{const r=indexedDB.open('web-absensi-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function get(key='state'){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('records').objectStore('records').get(key);r.onsuccess=()=>{const value=r.result??(key==='state'?fresh():null);if(key==='state')activeOwner=value?.profile?.role==='teacher'?(value.profile.account?.id||'admin_01'):(value?.profile?.account?.ctx?.owner||'admin_01');resolve(value);};r.onerror=()=>reject(r.error);});}
async function change(fn,key='state'){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('records','readwrite'),store=t.objectStore('records'),r=store.get(key);let result;r.onsuccess=()=>{try{result=fn(r.result??(key==='state'?fresh():null));store.put(result,key);}catch(e){reject(e);t.abort();}};t.oncomplete=()=>{if(key==='state')emit();resolve(result);};t.onerror=()=>reject(t.error);});}
function emit(){listeners.forEach(fn=>fn());channel?.postMessage('changed');window.dispatchEvent(new Event('wa-changed'));}channel?.addEventListener('message',()=>{listeners.forEach(fn=>fn());window.dispatchEvent(new Event('wa-changed'));});
const b64=bytes=>btoa(Array.from(new Uint8Array(bytes),v=>String.fromCharCode(v)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const encode=obj=>b64(enc.encode(JSON.stringify(obj)));const decode=s=>JSON.parse(dec.decode(unb64(s)));
const academicYear=c=>c.year||'2026/2027',academicPeriod=c=>c.period||(Number(c.semester)%2?'Ganjil':'Genap');
const ctx=c=>({jenjang:'S1',prodi:c.prodi,semester:String(c.semester),kelas:String(c.kelas).replace(/^Kelas /,'').toUpperCase(),...((c.owner||activeOwner)!=='admin_01'?{owner:c.owner||activeOwner}:{}),...(academicYear(c)!=='2026/2027'||academicPeriod(c)!==(Number(c.semester)%2?'Ganjil':'Genap')?{year:academicYear(c),period:academicPeriod(c)}:{})});
const sameCtx=(a,b)=>JSON.stringify(ctx(a))===JSON.stringify(ctx(b));
async function scope(c,course=''){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify([ctx(c),course.trim()])))),v=>v.toString(16).padStart(2,'0')).join('');}
async function keys(){let value=await get('keys');if(!value){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);value={privateKey:pair.privateKey,pub:b64(await crypto.subtle.exportKey('spki',pair.publicKey))};await change(old=>old||value,'keys');value=await get('keys');}return value;}
async function seal(data){const k=await keys(),body=encode(data),sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k.privateKey,enc.encode(body));return body+'.'+b64(sig);}
async function open(envelope,pub){if(typeof envelope!=='string'||envelope.length>23000)throw Error('Kode QR tidak valid.');const [body,sig,extra]=envelope.split('.');if(extra||!body||!sig)throw Error('Kode QR tidak valid.');const key=await crypto.subtle.importKey('spki',unb64(pub),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64(sig),enc.encode(body)))throw Error('Tanda tangan QR tidak cocok.');return decode(body);}
async function api(action,data={},token){const state=await get(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),window.PresenTeacherStartup?.ready===false&&["snapshot","sync","appearance-read"].includes(action)?1800:20000);try{const response=await fetch(new URL('app_api.php',ROOT),{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-App-Request':'1',...(token??state.token?{'Authorization':'Bearer '+(token??state.token)}:{})},body:JSON.stringify({action,...data}),credentials:'same-origin'});let result;try{result=await response.json();}catch(_){throw Error('Server belum dapat dihubungi. Periksa sambungan internet.');}if(!response.ok||result.status!=='success'){const error=Error(result.message||'Permintaan belum berhasil.');error.code=result.code;throw error;}return result;}catch(error){if(controller.signal.aborted)throw Error('Sinkronisasi terlalu lama. Periksa koneksi lalu coba lagi; data tetap tersimpan.');throw error;}finally{clearTimeout(timer);}}
function accountKey(profile){return profile?.role+':'+(profile?.account?.id||profile?.device||'');}
async function archiveAccount(){const s=await get();if(s.profile)await change(()=>s,'account-state:'+accountKey(s.profile));}
async function adoptAccount(result){const previous=await get();const switched=previous.profile&&accountKey(previous.profile)!==accountKey(result.snapshot.profile);if(switched)await archiveAccount();const saved=switched?await get('account-state:'+accountKey(result.snapshot.profile)):previous;activeOwner=result.snapshot.profile.role==='teacher'?(result.snapshot.profile.account.id||'admin_01'):(result.snapshot.profile.account.ctx.owner||'admin_01');result.snapshot.receivedAt=Date.now();await change(()=>({...fresh(),...(saved?.profile?saved:{}),token:result.token,profile:result.snapshot.profile,snapshot:result.snapshot,outbox:saved?.profile&&accountKey(saved.profile)===accountKey(result.snapshot.profile)?saved.outbox:[]}));}
async function login(role,fields){if(!navigator.onLine)throw Error('Masuk pertama kali memerlukan internet.');const k=await keys();let result;if(role==='teacher'){const body=new URLSearchParams({action:'login_privat',username:fields.username,password:fields.password});const response=await fetch(new URL('index.php',ROOT),{method:'POST',body,credentials:'same-origin'});const content=await response.json();if(content.status!=='success')throw Error(content.message||content.msg||'Nama atau kata sandi tidak cocok.');result=await api('bootstrap',{pubkey:k.pub});}else result=await api(fields.register?'register':'student-login',{...fields,ctx:ctx(fields.ctx),pubkey:k.pub});await adoptAccount(result);void prepareOffline();return result;}
async function bootstrap({renew=false}={}){if(bootstrapping){if(!renew)return bootstrapping;try{await bootstrapping;}catch(_){/* The guest request may have started before login. */}}const request=(async()=>{const k=await keys(),result=await api('bootstrap',{pubkey:k.pub},'');await adoptAccount(result);return result;})();bootstrapping=request;try{return await request;}finally{if(bootstrapping===request)bootstrapping=null;}}
function applyOp(s,o){const p=s.snapshot;
if(o.type==='session'){const i=p.sessions.findIndex(x=>x.id===o.session.id);if(i<0)p.sessions.push(o.session);else p.sessions[i]=o.session;if(o.session.deadline>now(s))p.marks=p.marks.filter(m=>!(m.scope===o.session.scope&&m.slot===o.session.slot&&m.source==='automatic'));}
if(o.type==='student-upsert'||o.type==='student-delete'){const i=p.roster.findIndex(x=>sameCtx(x,o.ctx)&&x.nim===o.nim);if(o.type==='student-delete'){if(i>=0)p.roster.splice(i,1);}else{const row={...ctx(o.ctx),nim:o.nim,nama:o.nama,jk:o.jk,id:i>=0?p.roster[i].id:o.id};if(i<0)p.roster.push(row);else p.roster[i]=row;}}
if(o.type==='mark'||o.type==='review'||(o.type==='reply'&&o.localMark)){const row=o.localMark||{scope:o.scope,slot:o.slot,nim:o.nim,mark:o.mark,reason:o.reason||'',source:'manual',review_status:o.review_status||'final',revision:o.baseRevision||0,recorded_at:Date.now()};const i=p.marks.findIndex(x=>x.scope===row.scope&&x.slot===row.slot&&x.nim===row.nim);if(i<0)p.marks.push(row);else p.marks[i]={...p.marks[i],...row};}
if(o.type==='document'){const row={scope:o.scope,kind:o.kind,ctx:o.ctx,matkul:o.matkul,content:o.content,revision:o.baseRevision||0};const i=p.documents.findIndex(x=>x.scope===o.scope&&x.kind===o.kind);if(i<0)p.documents.push(row);else p.documents[i]=row;}
}
async function queue(op){op={...op,id:op.id||crypto.randomUUID()};if(op.ctx)op.ctx=ctx(op.ctx);if(op.ctx&&op.matkul!==undefined)op.scope=await scope(op.ctx,op.matkul);await change(s=>{if(s.profile?.role!=='teacher')throw Error('Masuk dengan akun dosen.');op.resetEpoch=s.snapshot.resetEpoch||0;if(!s.outbox.some(x=>x.id===op.id)){s.outbox.push(op);applyOp(s,op);}return s;});void sync();return op;}
function dispatchPush(s){if(s.profile?.role!=='teacher'||dispatching||!s.snapshot.sessions.some(x=>x.deadline>now(s)))return;dispatching=api('dispatch-push',{},s.token).catch(()=>{}).finally(()=>{dispatching=null;});}
// Delete the selected roster and enqueue its operations in one durable transaction.
async function deleteStudents(c,students){const operations=students.map(student=>({id:student.deleteId||crypto.randomUUID(),type:'student-delete',ctx:ctx(c),nim:student.nim,base:{nama:student.nama}}));await change(s=>{if(s.profile?.role!=='teacher')throw Error('Masuk dengan akun dosen.');for(const op of operations){op.resetEpoch=s.snapshot.resetEpoch||0;if(!s.outbox.some(o=>o.id===op.id))s.outbox.push(op);applyOp(s,op);}return s;});void sync();return operations;}
function clearResetDrafts(){for(const key of Object.keys(localStorage))if(key.startsWith('wa-sheet-draft-')||key.startsWith('wa-delete-draft-'))localStorage.removeItem(key);}
async function sync(){window.WA.lastError='';if(syncing){syncAgain=true;await syncing;return syncing;}syncAgain=false;syncing=(async()=>{const s=await get();if(!s.token||!navigator.onLine)return;try{const active=s.outbox.filter(o=>!o.problem).slice(0,100);active.forEach(o=>inFlight.add(o.id));const r=await api(active.length?'sync':'snapshot',active.length?{operations:active.slice(0,100)}:{knownTag:s.snapshot.tag||''},s.token);if((await get()).token!==s.token)return;dispatchPush(s);if(r.unchanged){if(Math.abs(now(s)-Number(r.serverTime))>1000)await change(current=>{if(current.token!==s.token)return current;current.snapshot.serverTime=r.serverTime;current.snapshot.receivedAt=Date.now();return current;});return;}const reset=r.resetRequired||Number(r.snapshot?.resetEpoch??0)>Number(s.snapshot.resetEpoch??0);if(reset){r.snapshot.receivedAt=Date.now();await change(current=>{if(current.token!==s.token)return current;current.snapshot=r.snapshot;current.profile=r.snapshot.profile;current.outbox=[];return current;});clearResetDrafts();window.dispatchEvent(new Event('wa-global-reset'));return;}await change(current=>{if(current.token!==s.token)return current;const results=new Map((r.results||[]).map(x=>[x.id,x]));current.outbox=current.outbox.filter(o=>results.get(o.id)?.status!=='success');for(const o of current.outbox){const result=results.get(o.id);if(result&&['conflict','error'].includes(result.status))o.problem=result;}r.snapshot.receivedAt=Date.now();current.snapshot=r.snapshot;current.profile=r.snapshot.profile;for(const o of current.outbox){const predecessor=active.find(a=>results.get(a.id)?.status==='success'&&a.type===o.type&&a.scope===o.scope&&(o.type==='document'?a.kind===o.kind:o.type==='mark'?a.nim===o.nim&&a.slot===o.slot:false));if(predecessor&&!results.has(o.id)&&!o.problem){const remote=o.type==='document'?r.snapshot.documents.find(x=>x.scope===o.scope&&x.kind===o.kind):r.snapshot.marks.find(x=>x.scope===o.scope&&x.nim===o.nim&&x.slot===o.slot);o.baseRevision=remote?.revision||0;}applyOp(current,o);}return current;});}catch(e){if((await get()).token!==s.token)return;if(e.code==='AUTH_REQUIRED'){await change(current=>{if(current.token===s.token)current.authExpired=true;return current;});}window.WA.lastError=e.message;}finally{inFlight.clear();}})().finally(()=>{syncing=null;if(syncAgain){syncAgain=false;void sync();}});return syncing;}
async function resolve(id,keep){await change(s=>{const o=s.outbox.find(x=>x.id===id);if(!o)return s;if(keep){o.id=crypto.randomUUID();o.baseRevision=o.problem.revision??o.problem.remote?.revision??0;if(o.base&&o.problem.remote)o.base={nama:o.problem.remote.nama};delete o.problem;}else s.outbox=s.outbox.filter(x=>x.id!==id);return s;});await sync();}
function saveDocument(c,course,kind,content){const write=documentWrite.catch(()=>{}).then(async()=>{const sc=await scope(c,course);await change(s=>{if(s.profile?.role!=='teacher')throw Error('Masuk dengan akun dosen.');let o=s.outbox.find(o=>o.type==='document'&&o.scope===sc&&o.kind===kind&&!o.problem&&!inFlight.has(o.id));if(o)o.content=content;else{const old=s.snapshot.documents.find(x=>x.scope===sc&&x.kind===kind);o={id:crypto.randomUUID(),type:'document',ctx:ctx(c),matkul:course,scope:sc,kind,content,baseRevision:old?.revision||0,resetEpoch:s.snapshot.resetEpoch||0};s.outbox.push(o);}applyOp(s,o);return s;});void sync();});documentWrite=write;return write;}

function now(s){return Date.now()+(s?.snapshot?.serverTime&&s?.snapshot?.receivedAt?s.snapshot.serverTime-s.snapshot.receivedAt:0);}
function day(t=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);}
async function startSession(c,course,slot,minutes,options={}){if(!course.trim())throw Error('Isi mata kuliah untuk sesi absen ini.');if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw Error('Isi durasi antara 1 dan 1440 menit.');const s=await get(),sc=await scope(c,course),old=s.snapshot.sessions.find(x=>x.scope===sc&&x.slot===Number(slot)),t=now(s);if(old&&old.day!==day(t))throw Error('Pertemuan ini sudah digunakan. Pilih pertemuan berikutnya.');if(old&&old.teacher_id!==s.profile.device)throw Error('Reset dilakukan dari perangkat pembuat QR.');const deadline=t+minutes*60000;if(day(t)!==day(deadline))throw Error('Batas absen harus berakhir pada tanggal yang sama.');const data={v:2,...(options.evidence===false?{}:{evidence:1}),type:'session',device:s.profile.device,id:old?.id||crypto.randomUUID(),ctx:ctx(c),matkul:course.trim(),slot:Number(slot),starts:t,deadline,ends:deadline,version:(old?.version||0)+1,nonce:b64(crypto.getRandomValues(new Uint8Array(24))).replaceAll('-','a').replaceAll('_','b')};data.nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');const challenge=await seal(data),session={...data,scope:sc,day:day(t),challenge,teacher_id:s.profile.device,roster:s.snapshot.roster.filter(x=>sameCtx(x,c)).map(x=>x.nim)};await queue({type:'session',challenge,session});return session;}
function qr(type,certificate,field,envelope){return 'WA1:'+encode({type,certificate,[field]:envelope});}
// Lossless transport only: original signed bodies are reconstructed byte for byte.
const qrAlphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function qrBytes(bytes){let out='';for(let i=0;i<bytes.length;i+=2){let n=bytes[i]*(i+1<bytes.length?256:1)+(bytes[i+1]||0);out+=qrAlphabet[n%45]+qrAlphabet[Math.floor(n/45)%45];if(i+1<bytes.length)out+=qrAlphabet[Math.floor(n/2025)];}return out;}
function unqrBytes(text){const bytes=[];for(let i=0;i<text.length;i+=3){const n=text.slice(i,i+3),v=[...n].map(c=>qrAlphabet.indexOf(c));if(v.length<2||v.some(x=>x<0))throw Error('QR tidak valid.');const value=v[0]+v[1]*45+(v[2]||0)*2025;if(v.length===3){if(value>65535)throw Error('QR tidak valid.');bytes.push(value>>8,value&255);}else{if(value>255)throw Error('QR tidak valid.');bytes.push(value);}}return new Uint8Array(bytes);}
async function compactQR(code){
 if(!code.startsWith('WA1:')||!globalThis.CompressionStream)return code;
 try{const w=decode(code.slice(4)),split=value=>{const [body,sig]=value.split('.');return[dec.decode(unb64(body)),sig];},data=JSON.stringify([w.type,split(w.certificate),split(w.challenge||w.reply)]),bytes=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());return 'WA2:'+qrBytes(bytes)+':';}catch(_){return code;}
}
async function expandQR(code){
 if(!code?.startsWith('WA2:'))return code;
 if(code.length>14000||!globalThis.DecompressionStream)throw Error('QR ringkas memerlukan Presen Go 1.2.3 atau lebih baru. Minta dosen memilih QR kompatibel.');
 try{if(!code.endsWith(':'))throw Error('QR tidak lengkap.');const reader=new Blob([unqrBytes(code.slice(4,-1))]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();let size=0,parts=[];try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>14000)throw Error('QR terlalu panjang.');parts.push(value);}}finally{await reader.cancel();}const [type,certificate,envelope]=JSON.parse(await new Blob(parts).text()),join=parts=>encodeBody(parts[0])+'.'+parts[1];if(!['session','reply'].includes(type))throw Error('QR tidak valid.');return qr(type,join(certificate),type==='session'?'challenge':'reply',join(envelope));}catch(_){throw Error('QR ringkas tidak valid. Pindai ulang kode dosen.');}
}
function encodeBody(text){return b64(enc.encode(text));}
function quickQR(session){return `WA3:${session.id}:${session.version}:${session.nonce||decode(session.challenge.split('.')[0]).nonce}`.toUpperCase();}
async function resolveQuickQR(code){
 const match=/^WA3:([0-9A-F-]{36}):([1-9][0-9]*):([0-9A-F]{48})$/.exec(code);if(!match)throw Error('QR cepat tidak valid.');
 const [,rawId,rawVersion,rawNonce]=match,id=rawId.toLowerCase(),version=Number(rawVersion),nonce=rawNonce.toLowerCase(),s=await get();
 if(s.profile?.role!=='student'||!s.profile.account.approved)throw Error('Masuk sebagai mahasiswa yang sudah disetujui dosen.');
 const cached=s.snapshot.sessions.find(x=>x.id===id&&x.version===version);
 if(cached?.teacher_pub){const challenge=await open(cached.challenge,cached.teacher_pub);if(challenge.id===id&&challenge.version===version&&challenge.nonce===nonce&&challenge.device===cached.teacher_id){assertSession(challenge,s,true);return {challenge,identity:{role:'teacher',account:cached.ctx.owner,device:cached.teacher_id,pub:cached.teacher_pub}};}}
 if(!navigator.onLine)throw Error('QR cepat ini belum tersimpan. Hubungkan internet atau minta dosen memilih QR lengkap untuk offline.');
 const result=await api('resolve-session-qr',{id,version,nonce});if(!result.code?.startsWith('WA1:'))throw Error('Sesi belum dapat dibuka.');const read=await readQR(result.code);
 if(read.challenge?.id!==id||read.challenge.version!==version||read.challenge.nonce!==nonce)throw Error('QR tidak cocok dengan sesi dosen.');return read;
}
async function readQR(code){if(typeof code==='string')code=code.trim();if(/^wa3:/i.test(code||''))return resolveQuickQR(code.toUpperCase());code=await expandQR(code);if(!code?.startsWith('WA1:')||code.length>14000)throw Error('Gunakan QR dari aplikasi absensi.');const s=await get(),w=decode(code.slice(4)),identity=await open(w.certificate,s.profile.serverPublicKey);if(!identity.approved)throw Error('Pendaftaran mahasiswa belum disetujui.');if(w.type==='session'&&identity.role==='teacher'){if(s.profile.role==='student'&&identity.account!==(s.profile.account.ctx.owner||'admin_01'))throw Error('QR ini milik dosen penanggung jawab lain.');const challenge=await open(w.challenge,identity.pub);if(challenge.device!==identity.device||challenge.type!=='session')throw Error('Kode sesi tidak cocok.');if(s.profile.role==='student'&&!sameCtx(challenge.ctx,s.profile.account.ctx))throw Error('QR ini berasal dari kelas lain.');return {identity,challenge,wrapper:w};}if(w.type==='reply'&&identity.role==='student'){if(s.profile.role==='teacher'&&(identity.ctx?.owner||'admin_01')!==(s.profile.account.id||'admin_01'))throw Error('Mahasiswa ini terdaftar pada dosen lain.');const reply=await open(w.reply,identity.pub);if(reply.device!==identity.device||reply.type!=='reply')throw Error('Balasan tidak cocok.');return {identity,reply,wrapper:w};}throw Error('Jenis QR tidak cocok.');}
// Shared session guard for QR, face, restored drafts, and final submission.
function sessionRecord(session,s){const known=s.snapshot.sessions.find(x=>x.id===session.id);if(known&&known.version<session.version)return null;return s.snapshot.marks.find(m=>(m.session_id===session.id||m.scope===(session.scope||known?.scope)&&m.slot===session.slot)&&m.nim===s.profile.account.nim&&m.mark&&!(m.source==='automatic'&&session.deadline>now(s)))||null;}
function assertSession(challenge,s,allowRecorded=false){
 if(!challenge||!s.profile?.account?.approved||s.authExpired)throw Error('Akun mahasiswa perlu disetujui dosen terlebih dahulu.');
 if(!sameCtx(challenge.ctx,s.profile.account.ctx))throw Error('Sesi tidak sesuai dengan kelas Anda.');
 const time=now(s),known=s.snapshot.sessions.find(x=>x.id===challenge.id);
 if(known&&known.version>challenge.version)throw Error('QR sudah diganti dosen. Pindai QR terbaru.');
 if(time<challenge.starts)throw Error('Sesi absensi belum dimulai.');
 if(time>=challenge.deadline||day(time)!==day(challenge.starts))throw Error('Sesi absensi selesai. Pindai QR pertemuan terbaru dari dosen.');
 if(!allowRecorded&&sessionRecord(challenge,s))throw Error('Absensi pertemuan ini sudah tercatat. Pindai QR pertemuan berikutnya atau lihat Riwayat.');
 return challenge;
}
async function faceSession(id,version){
 const s=await get(),account=s.profile?.account,session=s.snapshot.sessions.find(x=>x.id===id),time=now(s);
 if(s.profile?.role!=='student'||!account?.approved||s.authExpired)throw Error('Akun mahasiswa perlu disetujui dosen terlebih dahulu.');
 if(!session?.teacher_pub||!sameCtx(session.ctx,account.ctx)||(session.ctx.owner||'admin_01')!==(account.ctx.owner||'admin_01'))throw Error('Sesi wajah tidak sesuai dengan kelas atau dosen Anda.');
 const challenge=await open(session.challenge,session.teacher_pub);
 if(challenge.type!=='session'||challenge.id!==session.id||challenge.device!==session.teacher_id||challenge.version!==session.version||version!=null&&challenge.version!==version||!sameCtx(challenge.ctx,account.ctx))throw Error('Sesi sudah diperbarui. Sinkronkan dan pilih sesi kembali.');
 assertSession(challenge,s);
 if(s.snapshot.marks.some(m=>m.scope===session.scope&&m.slot===session.slot&&m.nim===account.nim&&m.mark&&m.source!=='automatic'))throw Error('Absensi sesi ini sudah tercatat. Periksa Riwayat.');
 return challenge;
}
function locationData(value,at){if(value==null)return null;if(!['lat','lon','accuracy','at'].every(k=>Number.isFinite(value[k]))||Math.abs(value.lat)>90||Math.abs(value.lon)>180||value.accuracy<0||value.accuracy>100000||!Number.isFinite(at)||Math.abs(value.at-at)>300000)throw Error('Lokasi QR tidak valid atau terlalu lama. Ambil lokasi kembali.');const address=value.address&&typeof value.address==='object'?Object.fromEntries(['formatted','road','village','district','city','province','postcode','country','rt','rw'].filter(k=>typeof value.address[k]==='string').map(k=>[k,value.address[k].slice(0,k==='formatted'?800:160)])):null;return {lat:value.lat,lon:value.lon,accuracy:value.accuracy,at:value.at,...(address?.formatted?{address}:{}),...(Number.isFinite(value.battery)&&value.battery>=0&&value.battery<=100?{battery:Math.round(value.battery)}:{})};}
async function reply(challenge,mark,reason,location,details={}){const s=await get();assertSession(challenge,s);if(!s.profile?.account.approved)throw Error('Menunggu persetujuan dosen.');if(day(now(s))!==day(challenge.starts)||now(s)<challenge.starts||now(s)>challenge.deadline)throw Error('Waktu absen sudah berakhir atau belum dimulai.');if(!['.','S','I'].includes(mark)||mark!=='.'&&!reason.trim())throw Error('Isi alasan sakit atau izin.');if(!location)throw Error('Aktifkan lokasi untuk mengirim absensi ke dosen.');const attachments=details.attachments||[];if(attachments.length>1||attachments.some(x=>!/^[-a-f0-9]{36}$/.test(x.id)||!/^[-a-f0-9]{64}$/.test(x.hash)))throw Error('Bukti foto tidak valid.');if(mark!=='.'&&challenge.evidence&&!attachments.length)throw Error('Lampirkan foto bukti sakit atau izin.');const method=details.method==='face'?'face':'qr';if(method==='face'){await faceSession(challenge.id,challenge.version);const v=details.verification;if(v?.status!=='matched'||v.session!==challenge.id||v.version!==challenge.version||v.account!==s.profile.account.id||Math.abs(now(s)-v.at)>300000)throw Error('Cocokkan wajah kembali untuk sesi ini.');}const envelope=await seal({v:2,method,...(attachments.length?{attachments}:{}),...(details.verification?{verification:details.verification}:{}),type:'reply',device:s.profile.device,session:challenge.id,nonce:challenge.nonce,mark,reason:reason.trim(),location:locationData(location,now(s)),at:now(s)});return qr('reply',s.profile.certificate,'reply',envelope);}
async function submitReply(code){const r=await api('sync',{operations:[{id:crypto.randomUUID(),type:'reply',code}]});const result=r.results[0];if(result.status!=='success')throw Error(result.message||'Absen belum diterima.');r.snapshot.receivedAt=Date.now();await change(s=>({...s,profile:r.snapshot.profile,snapshot:r.snapshot}));return result;}
async function receive(code){const s=await get(),{identity,reply:r}=await readQR(code),session=s.snapshot.sessions.find(x=>x.id===r.session),t=now(s);if(!session)throw Error('Sesi QR tidak ditemukan pada perangkat dosen.');const challenge=await open(session.challenge,s.profile.device===session.teacher_id?(await keys()).pub:session.teacher_pub);if(!['.','S','I'].includes(r.mark)||r.mark!=='.'&&!r.reason?.trim())throw Error('Keterangan mahasiswa tidak valid.');if(challenge.nonce!==r.nonce)throw Error('Kode sudah direset. Gunakan QR terbaru.');if(!sameCtx(identity.ctx,session.ctx)||!session.roster.includes(identity.nim)||!s.snapshot.roster.some(x=>x.nim===identity.nim&&sameCtx(x,session.ctx)))throw Error('Mahasiswa tidak terdaftar di kelas ini.');if(day(t)!==session.day||t<session.starts||t>session.deadline)throw Error('Batas waktu absen telah berakhir.');const old=s.snapshot.marks.find(x=>x.scope===session.scope&&x.slot===session.slot&&x.nim===identity.nim);if(old&&old.mark&&old.source!=='automatic')throw Error('Mahasiswa ini sudah tercatat '+old.mark+'.');if(r.mark!=='.'&&challenge.evidence&&!r.attachments?.length)throw Error('Lampirkan foto bukti sakit atau izin.');if(r.method==='face'&&(r.verification?.method!=='local-face-v1'||r.verification.status!=='matched'||r.verification.session!==session.id||r.verification.version!==session.version||r.verification.account!==identity.account||!Number.isFinite(r.verification.at)||Math.abs(r.verification.at-r.at)>300000))throw Error('Pencocokan wajah tidak sesuai dengan sesi ini.');r.location=locationData(r.location,r.at);const receipt=await seal({type:'receipt',device:s.profile.device,code,at:t});return queue({type:'reply',code,receipt,localMark:{scope:session.scope,slot:session.slot,nim:identity.nim,mark:r.mark,reason:r.reason,location:r.location,attachments:r.attachments||[],verification:r.verification||null,evidence_ready:false,source:(r.method==='face'?'face':'qr')+'-offline',review_status:r.mark==='.'?'final':'pending',recorded_at:t,session_id:session.id}});}
async function finalize(){await change(s=>{if(s.profile?.role!=='teacher')return s;for(const session of s.snapshot.sessions){if(session.starts>now(s)||session.deadline>now(s))continue;for(const nim of session.roster){const index=s.snapshot.marks.findIndex(x=>x.scope===session.scope&&x.slot===session.slot&&x.nim===nim);if(index>=0&&s.snapshot.marks[index].mark)continue;const mark={scope:session.scope,slot:session.slot,nim,mark:'A',reason:'Batas waktu absen telah berakhir.',source:'automatic',review_status:'final',revision:index>=0?s.snapshot.marks[index].revision:0,recorded_at:session.deadline,session_id:session.id};if(index>=0)s.snapshot.marks[index]=mark;else s.snapshot.marks.push(mark);}}return s;});}

async function deleteAccount(fields){if(!navigator.onLine)throw Error('Hubungkan internet untuk menghapus akun.');await window.WAFlush?.();await sync();const s=await get();if(s.outbox.length)throw Error('Selesaikan sinkronisasi sebelum menghapus akun atau data.');const result=await api('delete-account',fields);if(s.profile.role==='student'){window.Android?.stopWatch?.();await logout(true);}else await sync();return result;}

async function logout(serverRevoked=false){const s=await get();if(s.outbox.length&&!confirm('Ada perubahan yang belum tersinkron. Keluar tetap menghapus salinan perangkat. Lanjutkan?'))return false;if(serverRevoked){}else if(navigator.onLine){try{await api('logout');}catch(_){await change(()=>s.token,'revocation');}}else await change(()=>s.token,'revocation');const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('records','readwrite'),store=t.objectStore('records');store.delete('state');store.delete('keys');const who=s.profile?.account?.id;if(who){const keys=store.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result)if(key==='location-address:'+who||key==='face-vault:'+who||key==='evidence-index:'+who||String(key).startsWith('evidence-local:'+who+':')||String(key).startsWith('evidence-view:'+who+':'))store.delete(key);};}if(serverRevoked)store.delete('revocation');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});for(const key of Object.keys(localStorage))if(/^(wa-|absen-|ujian_|sheet-signatures-|custom_|absensi)/.test(key))localStorage.removeItem(key);const names=await caches.keys();await Promise.all(names.filter(x=>x.startsWith('wa-private')).map(x=>caches.delete(x)));emit();return true;}
// Notifications are optional: an unavailable worker must never block account/history rendering.
async function clearWebNotification(tag){if(window.Android?.appRole?.()==='student'||!('serviceWorker'in navigator))return;try{const reg=await navigator.serviceWorker.getRegistration();if(reg)for(const notice of await reg.getNotifications({tag}))notice.close();}catch(_){/* Native/bundled documents may reject web service-worker access. */}}
let offlineRegistration;
async function prepareOffline(options={}){if(window.Android?.appRole?.()==='student')return true;if(!('serviceWorker'in navigator))return false;try{const reg=await navigator.serviceWorker.register(new URL('teacher-sw.js',ROOT),{scope:ROOT.pathname,updateViaCache:'none'});
 async function send(){const role=(await get()).profile?.role||new URLSearchParams(location.search).get('role')||'teacher';reg.active?.postMessage({type:'prepare',role,bundled:!!(window.Android||window.AbsensiDesktop),full:options.full===true});}
 if(offlineRegistration!==reg){offlineRegistration=reg;const watched=new WeakSet();function watch(worker){if(!worker||watched.has(worker))return;watched.add(worker);worker.addEventListener('statechange',()=>{if(worker.state==='activated')void send();});}reg.addEventListener('updatefound',()=>watch(reg.installing));watch(reg.installing);watch(reg.waiting);navigator.serviceWorker.addEventListener('controllerchange',()=>void send());}
 await navigator.serviceWorker.ready;await send();if(navigator.storage?.persist)await navigator.storage.persist();return true;
 }catch(_){return false;}}

window.WA={ROOT,get,change,ctx,academicYear,academicPeriod,sameCtx,scope,keys,seal,open,encode,decode,api,login,bootstrap,queue,deleteStudents,sync,resolve,saveDocument,now,day,startSession,qr,compactQR,quickQR,readQR,assertSession,sessionRecord,faceSession,reply,receive,submitReply,finalize,logout,deleteAccount,prepareOffline,clearWebNotification,on:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
window.addEventListener('online',async()=>{const revoke=await get('revocation');if(revoke){try{await api('logout',{},revoke);await change(()=>null,'revocation');}catch(_){}}void sync();});
})();

} catch(error) {console.error("Teacher module app/core.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/teacher-performance.js */
try {
/* One visible-page refresh loop; optional offline tools are an explicit download. */
(()=>{'use strict';if(!window.WA)return;let timer;
function start(){if(timer)return;timer=setInterval(()=>{if(navigator.onLine&&!document.hidden)void WA.sync();},10000);}
window.PresenTeacherWork={start};start();if(!document.getElementById('teacherTools'))void WA.prepareOffline();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void WA.sync();});
let downloading=false;
function mount(){const panel=document.getElementById('presenAppearanceDialog');if(!panel||panel.querySelector('#teacherOfflineTools'))return;const section=document.createElement('details');section.id='teacherOfflineTools';section.innerHTML='<summary>Fitur tambahan saat offline</summary><p>Halaman dan data yang dibuka disimpan otomatis. Untuk menggunakan seluruh fitur impor tanpa internet, unduh paket tambahan sekitar 48 MB saat koneksi memadai.</p><button type="button" id="teacherOfflineDownload">Unduh semua fitur untuk offline</button><p role="status" id="teacherOfflineStatus"></p>';panel.append(section);section.querySelector('button').onclick=async e=>{if(!navigator.onLine){section.querySelector('[role=status]').textContent='Sambungkan internet untuk mengunduh fitur tambahan.';return;}e.target.disabled=true;downloading=true;section.querySelector('[role=status]').textContent='Mengunduh fitur tambahan. Halaman tetap dapat digunakan.';if(!await WA.prepareOffline({full:true})){downloading=false;e.target.disabled=false;section.querySelector('[role=status]').textContent='Persiapan offline belum tersedia di browser ini. Fitur online tetap dapat digunakan.';}};}
new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});navigator.serviceWorker?.addEventListener('message',e=>{if(!downloading)return;const status=document.getElementById('teacherOfflineStatus'),button=document.getElementById('teacherOfflineDownload');if(e.data?.type==='offline-progress'&&status)status.textContent='Mengunduh fitur tambahan · '+Math.round(e.data.done/e.data.total*100)+'%';if(e.data?.type==='offline-error'||e.data?.type==='offline-ready'&&e.data.full){downloading=false;if(status)status.textContent=e.data.type==='offline-error'?'Unduhan belum selesai. Sambungkan internet lalu coba lagi.':'Fitur tambahan siap digunakan saat offline.';if(button)button.disabled=false;}});
})();

} catch(error) {console.error("Teacher module app/teacher-performance.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/teacher-preferences.js */
try {
/* Teacher-only adapter for the legacy appearance controls. Student assets stay separate. */
(()=>{'use strict';
const pendingAppearance=document.querySelector('script[src*="app/appearance.js"]');if(pendingAppearance)pendingAppearance.src=pendingAppearance.src.replace('/appearance.js','/teacher-appearance.js');
const fields=['presen-theme','presen-accent','presen-brand-image','presen-brand-size','custom_bg_wallpaper','custom_bg_wallpaper_width','custom_bg_wallpaper_height','custom_bg_wallpaper_mode','custom_bg_wallpaper_scale','custom_bg_wallpaper_x','custom_bg_wallpaper_y'];
const managed=new Set([...fields,'custom_bg_wallpaper_db']);
const proto=Storage.prototype,rawGet=proto.getItem,rawSet=proto.setItem,rawRemove=proto.removeItem;
const legacy=Object.fromEntries(fields.map(k=>[k,rawGet.call(localStorage,k)]).filter(([,v])=>v!==null));
const legacyDB=rawGet.call(localStorage,'custom_bg_wallpaper_db')==='1',legacyBinding=rawGet.call(localStorage,'presen-appearance-owner');
const initialOwner=WA.get().then(s=>s.profile?.role==='teacher'?s.profile.account.id:null);
const legacyBackup=(async()=>{const previous=await initialOwner,who=previous&&(legacyBinding===previous||!legacyBinding&&previous==='admin_01')?previous:null;const old={...legacy};if(legacyDB)old.custom_bg_wallpaper=await WA.get('wallpaper-source')||old.custom_bg_wallpaper;const key=who?'teacher-appearance-legacy:'+who:'teacher-appearance-unclaimed';if(meaningful(old))await WA.change(previous=>({...previous,...old}),key);})();
let owner=null,record=null,ready=false,applying=false,timer,sending=null,error='',observed=0,refreshing=false,pendingSerial=0;
const namespaced=k=>'pa:'+owner+':'+k,cacheKey=id=>'teacher-appearance:'+id;
const empty=()=>({revision:0,settings:{},versions:{},pending:{},legacyChecked:false});
function value(k){return rawGet.call(localStorage,namespaced(k));}
function put(k,v){if(v===null||v===undefined)rawRemove.call(localStorage,namespaced(k));else rawSet.call(localStorage,namespaced(k),String(v));}
function marker(k){try{return JSON.parse(rawGet.call(localStorage,namespaced('pending:'+k))||'null');}catch(_){return null;}}
function changed(k){if(!ready||applying||!owner)return;k=k==='custom_bg_wallpaper_db'?'custom_bg_wallpaper':k;rawSet.call(localStorage,namespaced('pending:'+k),JSON.stringify({id:crypto.randomUUID(),baseVersion:record.pending[k]?.baseVersion??record.versions[k]??0}));dirty.add(k);clearTimeout(timer);timer=setTimeout(()=>void capture().then(flush).catch(fail),180);}
const dirty=new Set();
proto.getItem=function(k){return this===localStorage&&managed.has(String(k))?(owner?value(String(k)):null):rawGet.call(this,k);};
proto.setItem=function(k,v){if(this===localStorage&&managed.has(String(k))){if(owner&&(value(String(k))!==String(v)||String(k)==='custom_bg_wallpaper_db')){rawSet.call(this,namespaced(String(k)),String(v));changed(String(k));}return;}return rawSet.call(this,k,v);};
proto.removeItem=function(k){if(this===localStorage&&managed.has(String(k))){if(owner&&value(String(k))!==null){rawRemove.call(this,namespaced(String(k)));changed(String(k));}return;}return rawRemove.call(this,k);};
function fail(e){error=e.message||'Tampilan belum tersinkron.';status();}
async function persist(){if(owner&&record)await WA.change(()=>record,cacheKey(owner));}
async function normalizeImage(data,kind='wallpaper'){
 if(data===null||data==='')return null;
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw Error('Gunakan gambar PNG, JPG, atau WebP.');
 const image=new Image();image.src=data;await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)throw Error('Gunakan gambar maksimal 24 megapiksel.');
 if(data.length<=1400000)return data;
 const canvas=document.createElement('canvas');let scale=Math.min(1,(kind==='wallpaper'?2048:768)/Math.max(image.naturalWidth,image.naturalHeight));
 for(let n=0;n<5;n++){canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const encoded=canvas.toDataURL('image/webp',.9-n*.07);if(encoded.length<=1400000)return encoded;scale*=.8;}
 throw Error('Gambar terlalu besar untuk disinkronkan. Gunakan gambar yang lebih kecil.');
}
const stageTickets=new Map();
async function stage(k,v,intent=marker(k)){
 const target=record,identity=owner,ticket=(stageTickets.get(k)||0)+1,baseVersion=intent?.baseVersion??target?.pending[k]?.baseVersion??target?.versions[k]??0;stageTickets.set(k,ticket);
 if(['presen-brand-image','custom_bg_wallpaper'].includes(k)&&v)v=await normalizeImage(v,k==='presen-brand-image'?'brand':'wallpaper');
 if(owner!==identity||record!==target||stageTickets.get(k)!==ticket)return;
 if(record.pending[k]?.value===v){if(intent)record.pending[k].marker=intent.id;return;}if(!record.pending[k]&&((record.settings[k]??null)===v)){if(intent?.id===marker(k)?.id)rawRemove.call(localStorage,namespaced('pending:'+k));return;}
 record.pending[k]={value:v,baseVersion,serial:++pendingSerial,marker:intent?.id};
}
let captureChain=Promise.resolve();
function capture(){const task=captureChain.catch(()=>{}).then(captureNow);captureChain=task;return task;}
async function captureNow(){
 if(!ready||applying||!record)return;const mine=owner,keys=[...dirty];dirty.clear();if(!keys.length)return;
 for(const k of keys){let v=value(k);if(k==='custom_bg_wallpaper'&&value('custom_bg_wallpaper_db')==='1')v=await WA.get('wallpaper-source')||v;if(mine!==owner)return;await stage(k,v);if(mine!==owner)return;}
 await persist();status();
}
function combined(){return {...record?.settings,...Object.fromEntries(Object.entries(record?.pending||{}).map(([k,p])=>[k,p.value]))};}
async function render(){
 if(!owner||!record)return;applying=true;try{
  const settings=combined();for(const k of fields)try{put(k,settings[k]??null);}catch(e){if(k==='custom_bg_wallpaper'){put('custom_bg_wallpaper_db','1');}else throw e;}
  // The optional large-image store is replaced for this account before it can be read.
  const image=settings.custom_bg_wallpaper||null;await WA.change(()=>image,'wallpaper-source');
  if(value('custom_bg_wallpaper')===image)put('custom_bg_wallpaper_db',null);
  const theme=settings['presen-theme']||'putih';document.documentElement.dataset.theme=theme;await WA.change(()=>theme,'theme');
  for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);for(const n of ['--hero-accent','--hero-on-accent'])document.body.style.removeProperty(n);
  if(settings['presen-accent'])window.PresenUI?.accent(settings['presen-accent']);
  await window.PresenAppearance?.reloadAccount?.();
 }finally{applying=false;}status();
}
async function flush(){
 clearTimeout(timer);await capture();if(sending)return sending;if(!Object.values(record?.pending||{}).some(p=>!p.conflict))return;
 const mine=owner;error='';sending=(async()=>{
  if(!mine||!record||!navigator.onLine)return;
  const s=await WA.get();if(s.profile?.role!=='teacher'||s.profile.account.id!==mine)return;
  for(const [key,entry]of Object.entries(record.pending)){
   if(entry.conflict)continue;const result=await WA.api('appearance-save',{key,value:entry.value,baseVersion:entry.baseVersion},s.token);if(owner!==mine||(await WA.get()).profile?.account?.id!==mine)return;
   const remote=result.appearance;record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;
   const current=record.pending[key];if(result.conflict){if(current)current.conflict=true;}
   else{if(current?.serial===entry.serial)delete record.pending[key];else if(current)current.baseVersion=record.versions[key]||0;const intent=marker(key);if(intent?.id===entry.marker)rawRemove.call(localStorage,namespaced('pending:'+key));else if(intent)rawSet.call(localStorage,namespaced('pending:'+key),JSON.stringify({...intent,baseVersion:record.versions[key]||0}));}
   await persist();status();
  }
 })().catch(fail).finally(()=>{sending=null;status();if(!error&&navigator.onLine&&Object.values(record?.pending||{}).some(p=>!p.conflict))timer=setTimeout(()=>void flush(),200);});status();await sending;
}
async function pull(){
 if(!ready||applying||sending||refreshing||!navigator.onLine||!owner)return;refreshing=true;const mine=owner;
 try{await capture();const s=await WA.get();if(s.profile?.account?.id!==mine||s.profile.role!=='teacher')return;const response=await WA.api('appearance-read',{},s.token);if(owner!==mine)return;const remote=response.appearance;
  if(remote.revision!==record.revision){record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;await persist();await render();}
 }catch(e){fail(e);}finally{refreshing=false;}
}
function meaningful(settings){return !!(settings['presen-brand-image']||settings.custom_bg_wallpaper||settings['presen-accent']||settings['presen-theme']&&settings['presen-theme']!=='putih');}
async function prepare(s){
 if(s.profile?.role!=='teacher'){await guest();return;}
 await legacyBackup;ready=false;owner=s.profile.account.id;record=await WA.get(cacheKey(owner))||empty();record.pending||={};pendingSerial=Math.max(0,...Object.values(record.pending).map(x=>x.serial||0));
 for(const k of fields){const intent=marker(k);if(!intent)continue;let local=value(k);if(k==='custom_bg_wallpaper'&&value('custom_bg_wallpaper_db')==='1'&&(await initialOwner)===owner)local=await WA.get('wallpaper-source')||local;await stage(k,local,intent);}
 let remote;try{if(navigator.onLine&&!(record.legacyChecked&&record.revision===Number(s.snapshot.appearance?.revision)&&!meaningful(legacy)))remote=(await WA.api('appearance-read',{},s.token)).appearance;}catch(e){error=e.message;}
 if(remote){record.settings=remote.settings||{};record.versions=remote.versions||{};record.revision=remote.revision;observed=remote.revision;}
 const old=await WA.get('teacher-appearance-legacy:'+owner)||{...legacy};
 const eligible=!!await WA.get('teacher-appearance-legacy:'+owner)||!legacyBinding&&(await initialOwner)===owner&&owner==='admin_01';
 if(eligible&&meaningful(old))for(const[k,v]of Object.entries(old))if(!record.versions[k]&&!Object.hasOwn(record.settings,k)&&!record.pending[k])await stage(k,v);
 record.legacyChecked=true;
 // Shared legacy keys must never expose the lecturer's images to student/guest pages.
 for(const k of managed)rawRemove.call(localStorage,k);rawSet.call(localStorage,'presen-appearance-owner',owner);
 await persist();await render();ready=true;status();void flush();
}
async function guest(){await legacyBackup;ready=false;owner=null;record=null;dirty.clear();for(const k of managed)rawRemove.call(localStorage,k);document.documentElement.dataset.theme='putih';for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);await window.PresenAppearance?.reloadAccount?.();}
async function useCampusBrand(){
 if(!ready||!owner)throw Error('Masuk sebagai dosen terlebih dahulu.');
 const image=new Image();image.src=new URL('assets/logo-stkip-yapis-dompu.png',WA.ROOT).href;await image.decode();const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);localStorage.setItem('presen-brand-image',canvas.toDataURL('image/png'));await window.PresenAppearance?.reloadAccount?.();await flush();
}
function status(){

 const panel=document.getElementById('presenAppearanceDialog');if(!panel)return;const brand=panel.querySelector('.p-brand-settings');if(brand&&!brand.querySelector('#pCampusBrand')){const button=document.createElement('button');button.type='button';button.id='pCampusBrand';button.textContent='Gunakan logo kampus STKIP Yapis Dompu';button.onclick=async()=>{button.disabled=true;try{await useCampusBrand();}catch(e){fail(e);}finally{button.disabled=false;}};brand.querySelector('h3')?.after(button);}let box=panel.querySelector('#appearanceAccountSync');if(!box){box=document.createElement('section');box.id='appearanceAccountSync';box.className='p-appearance-account';box.innerHTML='<p role="status" id="appearanceAccountStatus"></p><button type="button" id="appearanceSyncNow">Sinkronkan tampilan</button><button type="button" id="appearanceKeepLocal" hidden>Pakai perubahan perangkat ini</button><button type="button" id="appearanceUseAccount" hidden>Pakai tampilan akun</button><p><small>Logo, tema, warna, dan wallpaper mengikuti akun ini di perangkat lain. Pengaturan kelas dan lembar tetap terpisah.</small></p>';panel.querySelector('.p-subtitle')?.after(box);box.querySelector('#appearanceSyncNow').onclick=()=>void flush().then(pull).catch(fail);box.querySelector('#appearanceKeepLocal').onclick=()=>void resolveConflicts(true);box.querySelector('#appearanceUseAccount').onclick=()=>void resolveConflicts(false);}
 const pending=Object.values(record?.pending||{}),conflict=pending.some(p=>p.conflict);box.querySelector('#appearanceAccountStatus').textContent=error||conflict?'Tampilan belum tersinkron: '+(error||'pengaturan ini berubah di perangkat lain. Pilih salinan yang ingin digunakan.'):pending.length?(navigator.onLine?'Menyinkronkan tampilan ke akun…':'Tampilan tersimpan di perangkat · menunggu internet'):'Tampilan tersimpan di akun · tersedia di perangkat lain';box.querySelector('#appearanceKeepLocal').hidden=box.querySelector('#appearanceUseAccount').hidden=!conflict;
}
async function resolveConflicts(keep){for(const[k,p]of Object.entries(record.pending))if(p.conflict){if(keep){p.baseVersion=record.versions[k]||0;delete p.conflict;}else delete record.pending[k];}error='';await persist();await render();await flush();}
const originalLogout=WA.logout;WA.logout=async(...args)=>{await flush();const previous=owner;ready=false;const result=await originalLogout(...args);if(result!==false)await guest();else{owner=previous;ready=true;}return result;};
WA.on(()=>{if(!ready||applying)return;void WA.get().then(s=>{if(s.profile?.role!=='teacher'||s.profile.account.id!==owner){void guest();return;}if(Number(s.snapshot.appearance?.revision)>observed)void pull();});});
window.addEventListener('online',()=>void flush().then(pull));window.addEventListener('focus',()=>void pull());document.addEventListener('visibilitychange',()=>{if(document.hidden)void flush();else void pull();});
new MutationObserver(()=>{if(document.getElementById('presenAppearanceDialog')&&(!document.getElementById('appearanceAccountSync')||!document.getElementById('pCampusBrand')))status();}).observe(document.body,{childList:true,subtree:true});
window.PresenTeacherPreferences={prepare,guest,flush,pull,saveLocal:capture,normalizeImage,useCampusBrand,get ready(){return ready;}};
})();

} catch(error) {console.error("Teacher module app/teacher-preferences.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/courses.js */
try {
/* Course choices belong to the teacher and class, across browsers and devices. */
(()=>{'use strict';
if(!window.WA)return;
function catalogue(s,c){
 const entries=new Map();
 for(const row of [...(s.snapshot.sessions||[]),...(s.snapshot.documents||[])])if(row.matkul?.trim()&&WA.sameCtx(row.ctx,c))entries.set(row.matkul,{matkul:row.matkul,hidden:false,updatedAt:Number(row.updated_at||row.starts)||0});
 for(const row of s.snapshot.courses||[])if(WA.sameCtx(row.ctx,c))entries.set(row.matkul,row);
 for(const op of s.outbox||[])if(/^course-/.test(op.type)&&WA.sameCtx(op.ctx,c)&&op.matkul)entries.set(op.matkul,{matkul:op.matkul,hidden:op.type==='course-hide',updatedAt:Date.now()});
 return [...entries.values()].filter(row=>!row.hidden).sort((a,b)=>b.updatedAt-a.updatedAt||a.matkul.localeCompare(b.matkul));
}
function resolve(s,c,requested,local=''){
 if(requested?.trim())return requested.trim();
 const choices=catalogue(s,c),pending=(s.outbox||[]).filter(o=>/^course-(select|upsert)$/.test(o.type)&&WA.sameCtx(o.ctx,c)).at(-1),selected=pending?.matkul??s.snapshot.courseSelections?.find(x=>WA.sameCtx(x.ctx,c))?.matkul;
 return choices.find(x=>x.matkul===selected)?.matkul||choices.find(x=>x.matkul===local)?.matkul||choices[0]?.matkul||'';
}
async function remember(c,name){
 const s=await WA.get();if(s.profile?.role!=='teacher')return;
 const selected=(s.outbox||[]).filter(o=>/^course-(select|upsert)$/.test(o.type)&&WA.sameCtx(o.ctx,c)).at(-1)?.matkul??s.snapshot.courseSelections?.find(x=>WA.sameCtx(x.ctx,c))?.matkul;
 if(selected!==name&&name)await WA.queue({type:'course-select',ctx:c,matkul:name});
}
async function refreshOfflineReader(){
 // Older workers request an unversioned teacher runtime when reopening offline.
 const script=document.querySelector('script[src*="runtime-teacher-"]');if(!navigator.onLine||!window.caches||!script)return;
 try{for(const key of await caches.keys()){if(!key.startsWith('wa-public-'))continue;const cache=await caches.open(key),response=await cache.match(script.src);if(response){const url=new URL(script.src);url.search='';await cache.put(url.href,response);}}}catch(_){/* Online navigation remains available when storage is full. */}
}
let mounted=false,current='',page='',baseCtx,root,select,status,hidden;
function context(){if(page!=='index')return baseCtx;const form=document.querySelector('.main-card form');return WA.ctx({...baseCtx,...Object.fromEntries(new FormData(form))});}
async function refresh(){if(!mounted)return;const s=await WA.get();if(s.profile?.role!=='teacher'){root.hidden=true;return;}root.hidden=false;const c=context(),rows=catalogue(s,c);if(page==='index')current=resolve(s,c,'',WA.sameCtx(c,s.selection||c)?s.selection?.matkul:'');const names=rows.map(x=>x.matkul);if(current&&!names.includes(current))names.unshift(current);select.replaceChildren(new Option(names.length?'Pilih mata kuliah':'Belum ada mata kuliah',''));for(const name of names)select.add(new Option(name,name));select.value=current;select.options[0].disabled=!!names.length;if(hidden)hidden.value=current;const pending=s.outbox.some(o=>/^course-/.test(o.type));status.textContent=pending?'Pilihan tersimpan di perangkat · menunggu sinkronisasi':current?'Tersimpan di akun · digunakan pada absen, ujian, dan rekap nilai':'Tambah mata kuliah atau pilih dari data tersimpan.';}
async function choose(name){
 name=String(name||'').trim();const c=context();await window.WAFlush?.();await remember(c,name);await WA.change(s=>({...s,selection:{...c,matkul:name}}));if(navigator.onLine)await WA.sync();current=name;
 if(page==='index'){await refresh();return;}
 const url=new URL(location.href);for(const[k,v]of Object.entries({...c,matkul:name}))url.searchParams.set(k,v);
 if(window.AbsensiUIAudio?.navigateApplication)window.AbsensiUIAudio.navigateApplication(url.href);else location.assign(url.href);
}
function showError(message){status.textContent=message;window.showToast?.(message,'error');}
async function manage(){
 const dialog=PresenUI.dialog('Mata kuliah kelas ini','<p>Daftar ini tersimpan khusus di akun dan kelas Anda. Menghapus pilihan dari daftar tidak menghapus absen atau nilai; tambahkan nama yang sama untuk membukanya kembali.</p><form id="courseAddForm"><label for="courseNewName">Nama mata kuliah</label><input id="courseNewName" name="name" maxlength="180" required placeholder="Misalnya Profesi Pendidikan" autocomplete="off"><button type="submit">Tambah & gunakan</button></form><div id="courseList"></div><p id="courseNotice" role="status"></p>');dialog.classList.add('p-course-dialog');
 const notice=dialog.querySelector('#courseNotice');
 async function paint(){const s=await WA.get(),list=dialog.querySelector('#courseList');list.replaceChildren();for(const row of catalogue(s,context())){const item=document.createElement('div');item.className='p-course-row';const use=document.createElement('button'),remove=document.createElement('button');use.type=remove.type='button';use.textContent=row.matkul;use.setAttribute('aria-label','Gunakan '+row.matkul);use.onclick=()=>void run(async()=>{dialog.close();await choose(row.matkul);});remove.textContent='Hapus';remove.setAttribute('aria-label','Hapus pilihan '+row.matkul);remove.onclick=()=>void run(async()=>{await window.WAFlush?.();await WA.queue({type:'course-hide',ctx:context(),matkul:row.matkul});if(navigator.onLine)await WA.sync();if(row.matkul===current){const next=catalogue(await WA.get(),context())[0]?.matkul||'';dialog.close();await choose(next);}else{await paint();await refresh();notice.textContent='Pilihan dihapus dari daftar. Absen dan nilai tetap tersimpan.';}});item.append(use,remove);list.append(item);}if(!list.children.length)list.textContent='Belum ada mata kuliah tersimpan untuk kelas ini.';}
 async function run(fn){try{await fn();}catch(error){notice.textContent=error.message;}}
 dialog.querySelector('form').onsubmit=e=>{e.preventDefault();void run(async()=>{const name=dialog.querySelector('#courseNewName').value.trim();if(!name)throw Error('Isi nama mata kuliah.');await window.WAFlush?.();await WA.queue({type:'course-upsert',ctx:context(),matkul:name});dialog.close();await choose(name);});};await paint();
}
async function mount(c,name,which){
 if(mounted||!['index','data_siswa','absen','ujian'].includes(which))return;mounted=true;current=name;page=which;baseCtx=c;
 const style=document.createElement('style');style.textContent='.p-course-control{grid-column:1/-1;width:100%;display:grid;align-content:start;gap:6px;min-width:0;flex:0 0 auto;padding:8px 0;text-align:left}.p-course-control>label{margin:0!important;font-size:12px;font-weight:600;line-height:1.4}.p-course-actions{display:flex;gap:8px;align-items:center;min-width:0}.p-course-actions select{flex:1;min-width:0;width:100%;max-width:460px}.p-course-actions select,.p-course-actions button,.p-course-dialog input,.p-course-dialog button{font:inherit;min-height:40px;border:1px solid var(--ui-border,#526173);border-radius:9px;padding:8px 12px;background:var(--ui-input,#172b40);color:var(--ui-text,#f8fafc)}.p-course-control small{display:block;margin:0;font-size:11px;line-height:1.5;color:var(--ui-muted,#a5b5c5)}.p-course-dialog{max-width:620px!important}.p-course-dialog form{display:grid;gap:10px;margin:18px 0}.p-course-row{display:flex;gap:8px;margin:8px 0}.p-course-row button:first-child{flex:1;text-align:left;white-space:normal;overflow-wrap:anywhere}.p-course-dialog p{line-height:1.6}.p-course-dialog input{width:100%}@media print{.p-course-control{display:none!important}}';document.head.append(style);
 root=document.createElement('section');root.className='p-course-control p-screen-only';root.id='courseControl';root.innerHTML='<label for="teacherCourseSelect">Mata kuliah</label><div class="p-course-actions"><select id="teacherCourseSelect" aria-label="Mata kuliah tersimpan"></select><button type="button" id="manageCourses">Kelola</button></div><small role="status"></small>';
 select=root.querySelector('select');status=root.querySelector('small');select.onchange=()=>void choose(select.value).catch(e=>showError(e.message));root.querySelector('button').onclick=()=>void manage().catch(e=>showError(e.message));
 const form=document.querySelector('.main-card form');if(page==='index'&&form){form.querySelector('[type=submit]').before(root);hidden=document.createElement('input');hidden.type='hidden';hidden.name='matkul';form.append(hidden);for(const field of form.querySelectorAll('select:not(#teacherCourseSelect)'))field.addEventListener('change',()=>void refresh());}
 else{const toolbar=document.querySelector('#topToolbar');if(toolbar){const nav=toolbar.querySelector('.p-worknav');if(nav)nav.after(root);else toolbar.prepend(root);}else (document.querySelector('.card-header-flex')||document.body).append(root);}
 const field=document.querySelector('[data-app-course]');if(field){field.contentEditable='false';field.title='Pilih atau tambah mata kuliah melalui menu Mata kuliah';field.onclick=()=>void manage();}
 WA.on(()=>void refresh());await refresh();await refreshOfflineReader();
}
window.PresenCourses={catalogue,resolve,remember,mount,choose,manage,setCurrent:name=>{current=name;void refresh();}};
})();

} catch(error) {console.error("Teacher module app/courses.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/vendor/qr.js */
try {
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

} catch(error) {console.error("Teacher module app/vendor/qr.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/vendor/scan.js */
try {
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["jsQR"] = factory();
	else
		root["jsQR"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 3);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var BitMatrix = /** @class */ (function () {
    function BitMatrix(data, width) {
        this.width = width;
        this.height = data.length / width;
        this.data = data;
    }
    BitMatrix.createEmpty = function (width, height) {
        return new BitMatrix(new Uint8ClampedArray(width * height), width);
    };
    BitMatrix.prototype.get = function (x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }
        return !!this.data[y * this.width + x];
    };
    BitMatrix.prototype.set = function (x, y, v) {
        this.data[y * this.width + x] = v ? 1 : 0;
    };
    BitMatrix.prototype.setRegion = function (left, top, width, height, v) {
        for (var y = top; y < top + height; y++) {
            for (var x = left; x < left + width; x++) {
                this.set(x, y, !!v);
            }
        }
    };
    return BitMatrix;
}());
exports.BitMatrix = BitMatrix;


/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var GenericGFPoly_1 = __webpack_require__(2);
function addOrSubtractGF(a, b) {
    return a ^ b; // tslint:disable-line:no-bitwise
}
exports.addOrSubtractGF = addOrSubtractGF;
var GenericGF = /** @class */ (function () {
    function GenericGF(primitive, size, genBase) {
        this.primitive = primitive;
        this.size = size;
        this.generatorBase = genBase;
        this.expTable = new Array(this.size);
        this.logTable = new Array(this.size);
        var x = 1;
        for (var i = 0; i < this.size; i++) {
            this.expTable[i] = x;
            x = x * 2;
            if (x >= this.size) {
                x = (x ^ this.primitive) & (this.size - 1); // tslint:disable-line:no-bitwise
            }
        }
        for (var i = 0; i < this.size - 1; i++) {
            this.logTable[this.expTable[i]] = i;
        }
        this.zero = new GenericGFPoly_1.default(this, Uint8ClampedArray.from([0]));
        this.one = new GenericGFPoly_1.default(this, Uint8ClampedArray.from([1]));
    }
    GenericGF.prototype.multiply = function (a, b) {
        if (a === 0 || b === 0) {
            return 0;
        }
        return this.expTable[(this.logTable[a] + this.logTable[b]) % (this.size - 1)];
    };
    GenericGF.prototype.inverse = function (a) {
        if (a === 0) {
            throw new Error("Can't invert 0");
        }
        return this.expTable[this.size - this.logTable[a] - 1];
    };
    GenericGF.prototype.buildMonomial = function (degree, coefficient) {
        if (degree < 0) {
            throw new Error("Invalid monomial degree less than 0");
        }
        if (coefficient === 0) {
            return this.zero;
        }
        var coefficients = new Uint8ClampedArray(degree + 1);
        coefficients[0] = coefficient;
        return new GenericGFPoly_1.default(this, coefficients);
    };
    GenericGF.prototype.log = function (a) {
        if (a === 0) {
            throw new Error("Can't take log(0)");
        }
        return this.logTable[a];
    };
    GenericGF.prototype.exp = function (a) {
        return this.expTable[a];
    };
    return GenericGF;
}());
exports.default = GenericGF;


/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var GenericGF_1 = __webpack_require__(1);
var GenericGFPoly = /** @class */ (function () {
    function GenericGFPoly(field, coefficients) {
        if (coefficients.length === 0) {
            throw new Error("No coefficients.");
        }
        this.field = field;
        var coefficientsLength = coefficients.length;
        if (coefficientsLength > 1 && coefficients[0] === 0) {
            // Leading term must be non-zero for anything except the constant polynomial "0"
            var firstNonZero = 1;
            while (firstNonZero < coefficientsLength && coefficients[firstNonZero] === 0) {
                firstNonZero++;
            }
            if (firstNonZero === coefficientsLength) {
                this.coefficients = field.zero.coefficients;
            }
            else {
                this.coefficients = new Uint8ClampedArray(coefficientsLength - firstNonZero);
                for (var i = 0; i < this.coefficients.length; i++) {
                    this.coefficients[i] = coefficients[firstNonZero + i];
                }
            }
        }
        else {
            this.coefficients = coefficients;
        }
    }
    GenericGFPoly.prototype.degree = function () {
        return this.coefficients.length - 1;
    };
    GenericGFPoly.prototype.isZero = function () {
        return this.coefficients[0] === 0;
    };
    GenericGFPoly.prototype.getCoefficient = function (degree) {
        return this.coefficients[this.coefficients.length - 1 - degree];
    };
    GenericGFPoly.prototype.addOrSubtract = function (other) {
        var _a;
        if (this.isZero()) {
            return other;
        }
        if (other.isZero()) {
            return this;
        }
        var smallerCoefficients = this.coefficients;
        var largerCoefficients = other.coefficients;
        if (smallerCoefficients.length > largerCoefficients.length) {
            _a = [largerCoefficients, smallerCoefficients], smallerCoefficients = _a[0], largerCoefficients = _a[1];
        }
        var sumDiff = new Uint8ClampedArray(largerCoefficients.length);
        var lengthDiff = largerCoefficients.length - smallerCoefficients.length;
        for (var i = 0; i < lengthDiff; i++) {
            sumDiff[i] = largerCoefficients[i];
        }
        for (var i = lengthDiff; i < largerCoefficients.length; i++) {
            sumDiff[i] = GenericGF_1.addOrSubtractGF(smallerCoefficients[i - lengthDiff], largerCoefficients[i]);
        }
        return new GenericGFPoly(this.field, sumDiff);
    };
    GenericGFPoly.prototype.multiply = function (scalar) {
        if (scalar === 0) {
            return this.field.zero;
        }
        if (scalar === 1) {
            return this;
        }
        var size = this.coefficients.length;
        var product = new Uint8ClampedArray(size);
        for (var i = 0; i < size; i++) {
            product[i] = this.field.multiply(this.coefficients[i], scalar);
        }
        return new GenericGFPoly(this.field, product);
    };
    GenericGFPoly.prototype.multiplyPoly = function (other) {
        if (this.isZero() || other.isZero()) {
            return this.field.zero;
        }
        var aCoefficients = this.coefficients;
        var aLength = aCoefficients.length;
        var bCoefficients = other.coefficients;
        var bLength = bCoefficients.length;
        var product = new Uint8ClampedArray(aLength + bLength - 1);
        for (var i = 0; i < aLength; i++) {
            var aCoeff = aCoefficients[i];
            for (var j = 0; j < bLength; j++) {
                product[i + j] = GenericGF_1.addOrSubtractGF(product[i + j], this.field.multiply(aCoeff, bCoefficients[j]));
            }
        }
        return new GenericGFPoly(this.field, product);
    };
    GenericGFPoly.prototype.multiplyByMonomial = function (degree, coefficient) {
        if (degree < 0) {
            throw new Error("Invalid degree less than 0");
        }
        if (coefficient === 0) {
            return this.field.zero;
        }
        var size = this.coefficients.length;
        var product = new Uint8ClampedArray(size + degree);
        for (var i = 0; i < size; i++) {
            product[i] = this.field.multiply(this.coefficients[i], coefficient);
        }
        return new GenericGFPoly(this.field, product);
    };
    GenericGFPoly.prototype.evaluateAt = function (a) {
        var result = 0;
        if (a === 0) {
            // Just return the x^0 coefficient
            return this.getCoefficient(0);
        }
        var size = this.coefficients.length;
        if (a === 1) {
            // Just the sum of the coefficients
            this.coefficients.forEach(function (coefficient) {
                result = GenericGF_1.addOrSubtractGF(result, coefficient);
            });
            return result;
        }
        result = this.coefficients[0];
        for (var i = 1; i < size; i++) {
            result = GenericGF_1.addOrSubtractGF(this.field.multiply(a, result), this.coefficients[i]);
        }
        return result;
    };
    return GenericGFPoly;
}());
exports.default = GenericGFPoly;


/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var binarizer_1 = __webpack_require__(4);
var decoder_1 = __webpack_require__(5);
var extractor_1 = __webpack_require__(11);
var locator_1 = __webpack_require__(12);
function scan(matrix) {
    var locations = locator_1.locate(matrix);
    if (!locations) {
        return null;
    }
    for (var _i = 0, locations_1 = locations; _i < locations_1.length; _i++) {
        var location_1 = locations_1[_i];
        var extracted = extractor_1.extract(matrix, location_1);
        var decoded = decoder_1.decode(extracted.matrix);
        if (decoded) {
            return {
                binaryData: decoded.bytes,
                data: decoded.text,
                chunks: decoded.chunks,
                version: decoded.version,
                location: {
                    topRightCorner: extracted.mappingFunction(location_1.dimension, 0),
                    topLeftCorner: extracted.mappingFunction(0, 0),
                    bottomRightCorner: extracted.mappingFunction(location_1.dimension, location_1.dimension),
                    bottomLeftCorner: extracted.mappingFunction(0, location_1.dimension),
                    topRightFinderPattern: location_1.topRight,
                    topLeftFinderPattern: location_1.topLeft,
                    bottomLeftFinderPattern: location_1.bottomLeft,
                    bottomRightAlignmentPattern: location_1.alignmentPattern,
                },
            };
        }
    }
    return null;
}
var defaultOptions = {
    inversionAttempts: "attemptBoth",
};
function jsQR(data, width, height, providedOptions) {
    if (providedOptions === void 0) { providedOptions = {}; }
    var options = defaultOptions;
    Object.keys(options || {}).forEach(function (opt) {
        options[opt] = providedOptions[opt] || options[opt];
    });
    var shouldInvert = options.inversionAttempts === "attemptBoth" || options.inversionAttempts === "invertFirst";
    var tryInvertedFirst = options.inversionAttempts === "onlyInvert" || options.inversionAttempts === "invertFirst";
    var _a = binarizer_1.binarize(data, width, height, shouldInvert), binarized = _a.binarized, inverted = _a.inverted;
    var result = scan(tryInvertedFirst ? inverted : binarized);
    if (!result && (options.inversionAttempts === "attemptBoth" || options.inversionAttempts === "invertFirst")) {
        result = scan(tryInvertedFirst ? binarized : inverted);
    }
    return result;
}
jsQR.default = jsQR;
exports.default = jsQR;


/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var BitMatrix_1 = __webpack_require__(0);
var REGION_SIZE = 8;
var MIN_DYNAMIC_RANGE = 24;
function numBetween(value, min, max) {
    return value < min ? min : value > max ? max : value;
}
// Like BitMatrix but accepts arbitry Uint8 values
var Matrix = /** @class */ (function () {
    function Matrix(width, height) {
        this.width = width;
        this.data = new Uint8ClampedArray(width * height);
    }
    Matrix.prototype.get = function (x, y) {
        return this.data[y * this.width + x];
    };
    Matrix.prototype.set = function (x, y, value) {
        this.data[y * this.width + x] = value;
    };
    return Matrix;
}());
function binarize(data, width, height, returnInverted) {
    if (data.length !== width * height * 4) {
        throw new Error("Malformed data passed to binarizer.");
    }
    // Convert image to greyscale
    var greyscalePixels = new Matrix(width, height);
    for (var x = 0; x < width; x++) {
        for (var y = 0; y < height; y++) {
            var r = data[((y * width + x) * 4) + 0];
            var g = data[((y * width + x) * 4) + 1];
            var b = data[((y * width + x) * 4) + 2];
            greyscalePixels.set(x, y, 0.2126 * r + 0.7152 * g + 0.0722 * b);
        }
    }
    var horizontalRegionCount = Math.ceil(width / REGION_SIZE);
    var verticalRegionCount = Math.ceil(height / REGION_SIZE);
    var blackPoints = new Matrix(horizontalRegionCount, verticalRegionCount);
    for (var verticalRegion = 0; verticalRegion < verticalRegionCount; verticalRegion++) {
        for (var hortizontalRegion = 0; hortizontalRegion < horizontalRegionCount; hortizontalRegion++) {
            var sum = 0;
            var min = Infinity;
            var max = 0;
            for (var y = 0; y < REGION_SIZE; y++) {
                for (var x = 0; x < REGION_SIZE; x++) {
                    var pixelLumosity = greyscalePixels.get(hortizontalRegion * REGION_SIZE + x, verticalRegion * REGION_SIZE + y);
                    sum += pixelLumosity;
                    min = Math.min(min, pixelLumosity);
                    max = Math.max(max, pixelLumosity);
                }
            }
            var average = sum / (Math.pow(REGION_SIZE, 2));
            if (max - min <= MIN_DYNAMIC_RANGE) {
                // If variation within the block is low, assume this is a block with only light or only
                // dark pixels. In that case we do not want to use the average, as it would divide this
                // low contrast area into black and white pixels, essentially creating data out of noise.
                //
                // Default the blackpoint for these blocks to be half the min - effectively white them out
                average = min / 2;
                if (verticalRegion > 0 && hortizontalRegion > 0) {
                    // Correct the "white background" assumption for blocks that have neighbors by comparing
                    // the pixels in this block to the previously calculated black points. This is based on
                    // the fact that dark barcode symbology is always surrounded by some amount of light
                    // background for which reasonable black point estimates were made. The bp estimated at
                    // the boundaries is used for the interior.
                    // The (min < bp) is arbitrary but works better than other heuristics that were tried.
                    var averageNeighborBlackPoint = (blackPoints.get(hortizontalRegion, verticalRegion - 1) +
                        (2 * blackPoints.get(hortizontalRegion - 1, verticalRegion)) +
                        blackPoints.get(hortizontalRegion - 1, verticalRegion - 1)) / 4;
                    if (min < averageNeighborBlackPoint) {
                        average = averageNeighborBlackPoint;
                    }
                }
            }
            blackPoints.set(hortizontalRegion, verticalRegion, average);
        }
    }
    var binarized = BitMatrix_1.BitMatrix.createEmpty(width, height);
    var inverted = null;
    if (returnInverted) {
        inverted = BitMatrix_1.BitMatrix.createEmpty(width, height);
    }
    for (var verticalRegion = 0; verticalRegion < verticalRegionCount; verticalRegion++) {
        for (var hortizontalRegion = 0; hortizontalRegion < horizontalRegionCount; hortizontalRegion++) {
            var left = numBetween(hortizontalRegion, 2, horizontalRegionCount - 3);
            var top_1 = numBetween(verticalRegion, 2, verticalRegionCount - 3);
            var sum = 0;
            for (var xRegion = -2; xRegion <= 2; xRegion++) {
                for (var yRegion = -2; yRegion <= 2; yRegion++) {
                    sum += blackPoints.get(left + xRegion, top_1 + yRegion);
                }
            }
            var threshold = sum / 25;
            for (var xRegion = 0; xRegion < REGION_SIZE; xRegion++) {
                for (var yRegion = 0; yRegion < REGION_SIZE; yRegion++) {
                    var x = hortizontalRegion * REGION_SIZE + xRegion;
                    var y = verticalRegion * REGION_SIZE + yRegion;
                    var lum = greyscalePixels.get(x, y);
                    binarized.set(x, y, lum <= threshold);
                    if (returnInverted) {
                        inverted.set(x, y, !(lum <= threshold));
                    }
                }
            }
        }
    }
    if (returnInverted) {
        return { binarized: binarized, inverted: inverted };
    }
    return { binarized: binarized };
}
exports.binarize = binarize;


/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var BitMatrix_1 = __webpack_require__(0);
var decodeData_1 = __webpack_require__(6);
var reedsolomon_1 = __webpack_require__(9);
var version_1 = __webpack_require__(10);
// tslint:disable:no-bitwise
function numBitsDiffering(x, y) {
    var z = x ^ y;
    var bitCount = 0;
    while (z) {
        bitCount++;
        z &= z - 1;
    }
    return bitCount;
}
function pushBit(bit, byte) {
    return (byte << 1) | bit;
}
// tslint:enable:no-bitwise
var FORMAT_INFO_TABLE = [
    { bits: 0x5412, formatInfo: { errorCorrectionLevel: 1, dataMask: 0 } },
    { bits: 0x5125, formatInfo: { errorCorrectionLevel: 1, dataMask: 1 } },
    { bits: 0x5E7C, formatInfo: { errorCorrectionLevel: 1, dataMask: 2 } },
    { bits: 0x5B4B, formatInfo: { errorCorrectionLevel: 1, dataMask: 3 } },
    { bits: 0x45F9, formatInfo: { errorCorrectionLevel: 1, dataMask: 4 } },
    { bits: 0x40CE, formatInfo: { errorCorrectionLevel: 1, dataMask: 5 } },
    { bits: 0x4F97, formatInfo: { errorCorrectionLevel: 1, dataMask: 6 } },
    { bits: 0x4AA0, formatInfo: { errorCorrectionLevel: 1, dataMask: 7 } },
    { bits: 0x77C4, formatInfo: { errorCorrectionLevel: 0, dataMask: 0 } },
    { bits: 0x72F3, formatInfo: { errorCorrectionLevel: 0, dataMask: 1 } },
    { bits: 0x7DAA, formatInfo: { errorCorrectionLevel: 0, dataMask: 2 } },
    { bits: 0x789D, formatInfo: { errorCorrectionLevel: 0, dataMask: 3 } },
    { bits: 0x662F, formatInfo: { errorCorrectionLevel: 0, dataMask: 4 } },
    { bits: 0x6318, formatInfo: { errorCorrectionLevel: 0, dataMask: 5 } },
    { bits: 0x6C41, formatInfo: { errorCorrectionLevel: 0, dataMask: 6 } },
    { bits: 0x6976, formatInfo: { errorCorrectionLevel: 0, dataMask: 7 } },
    { bits: 0x1689, formatInfo: { errorCorrectionLevel: 3, dataMask: 0 } },
    { bits: 0x13BE, formatInfo: { errorCorrectionLevel: 3, dataMask: 1 } },
    { bits: 0x1CE7, formatInfo: { errorCorrectionLevel: 3, dataMask: 2 } },
    { bits: 0x19D0, formatInfo: { errorCorrectionLevel: 3, dataMask: 3 } },
    { bits: 0x0762, formatInfo: { errorCorrectionLevel: 3, dataMask: 4 } },
    { bits: 0x0255, formatInfo: { errorCorrectionLevel: 3, dataMask: 5 } },
    { bits: 0x0D0C, formatInfo: { errorCorrectionLevel: 3, dataMask: 6 } },
    { bits: 0x083B, formatInfo: { errorCorrectionLevel: 3, dataMask: 7 } },
    { bits: 0x355F, formatInfo: { errorCorrectionLevel: 2, dataMask: 0 } },
    { bits: 0x3068, formatInfo: { errorCorrectionLevel: 2, dataMask: 1 } },
    { bits: 0x3F31, formatInfo: { errorCorrectionLevel: 2, dataMask: 2 } },
    { bits: 0x3A06, formatInfo: { errorCorrectionLevel: 2, dataMask: 3 } },
    { bits: 0x24B4, formatInfo: { errorCorrectionLevel: 2, dataMask: 4 } },
    { bits: 0x2183, formatInfo: { errorCorrectionLevel: 2, dataMask: 5 } },
    { bits: 0x2EDA, formatInfo: { errorCorrectionLevel: 2, dataMask: 6 } },
    { bits: 0x2BED, formatInfo: { errorCorrectionLevel: 2, dataMask: 7 } },
];
var DATA_MASKS = [
    function (p) { return ((p.y + p.x) % 2) === 0; },
    function (p) { return (p.y % 2) === 0; },
    function (p) { return p.x % 3 === 0; },
    function (p) { return (p.y + p.x) % 3 === 0; },
    function (p) { return (Math.floor(p.y / 2) + Math.floor(p.x / 3)) % 2 === 0; },
    function (p) { return ((p.x * p.y) % 2) + ((p.x * p.y) % 3) === 0; },
    function (p) { return ((((p.y * p.x) % 2) + (p.y * p.x) % 3) % 2) === 0; },
    function (p) { return ((((p.y + p.x) % 2) + (p.y * p.x) % 3) % 2) === 0; },
];
function buildFunctionPatternMask(version) {
    var dimension = 17 + 4 * version.versionNumber;
    var matrix = BitMatrix_1.BitMatrix.createEmpty(dimension, dimension);
    matrix.setRegion(0, 0, 9, 9, true); // Top left finder pattern + separator + format
    matrix.setRegion(dimension - 8, 0, 8, 9, true); // Top right finder pattern + separator + format
    matrix.setRegion(0, dimension - 8, 9, 8, true); // Bottom left finder pattern + separator + format
    // Alignment patterns
    for (var _i = 0, _a = version.alignmentPatternCenters; _i < _a.length; _i++) {
        var x = _a[_i];
        for (var _b = 0, _c = version.alignmentPatternCenters; _b < _c.length; _b++) {
            var y = _c[_b];
            if (!(x === 6 && y === 6 || x === 6 && y === dimension - 7 || x === dimension - 7 && y === 6)) {
                matrix.setRegion(x - 2, y - 2, 5, 5, true);
            }
        }
    }
    matrix.setRegion(6, 9, 1, dimension - 17, true); // Vertical timing pattern
    matrix.setRegion(9, 6, dimension - 17, 1, true); // Horizontal timing pattern
    if (version.versionNumber > 6) {
        matrix.setRegion(dimension - 11, 0, 3, 6, true); // Version info, top right
        matrix.setRegion(0, dimension - 11, 6, 3, true); // Version info, bottom left
    }
    return matrix;
}
function readCodewords(matrix, version, formatInfo) {
    var dataMask = DATA_MASKS[formatInfo.dataMask];
    var dimension = matrix.height;
    var functionPatternMask = buildFunctionPatternMask(version);
    var codewords = [];
    var currentByte = 0;
    var bitsRead = 0;
    // Read columns in pairs, from right to left
    var readingUp = true;
    for (var columnIndex = dimension - 1; columnIndex > 0; columnIndex -= 2) {
        if (columnIndex === 6) { // Skip whole column with vertical alignment pattern;
            columnIndex--;
        }
        for (var i = 0; i < dimension; i++) {
            var y = readingUp ? dimension - 1 - i : i;
            for (var columnOffset = 0; columnOffset < 2; columnOffset++) {
                var x = columnIndex - columnOffset;
                if (!functionPatternMask.get(x, y)) {
                    bitsRead++;
                    var bit = matrix.get(x, y);
                    if (dataMask({ y: y, x: x })) {
                        bit = !bit;
                    }
                    currentByte = pushBit(bit, currentByte);
                    if (bitsRead === 8) { // Whole bytes
                        codewords.push(currentByte);
                        bitsRead = 0;
                        currentByte = 0;
                    }
                }
            }
        }
        readingUp = !readingUp;
    }
    return codewords;
}
function readVersion(matrix) {
    var dimension = matrix.height;
    var provisionalVersion = Math.floor((dimension - 17) / 4);
    if (provisionalVersion <= 6) { // 6 and under dont have version info in the QR code
        return version_1.VERSIONS[provisionalVersion - 1];
    }
    var topRightVersionBits = 0;
    for (var y = 5; y >= 0; y--) {
        for (var x = dimension - 9; x >= dimension - 11; x--) {
            topRightVersionBits = pushBit(matrix.get(x, y), topRightVersionBits);
        }
    }
    var bottomLeftVersionBits = 0;
    for (var x = 5; x >= 0; x--) {
        for (var y = dimension - 9; y >= dimension - 11; y--) {
            bottomLeftVersionBits = pushBit(matrix.get(x, y), bottomLeftVersionBits);
        }
    }
    var bestDifference = Infinity;
    var bestVersion;
    for (var _i = 0, VERSIONS_1 = version_1.VERSIONS; _i < VERSIONS_1.length; _i++) {
        var version = VERSIONS_1[_i];
        if (version.infoBits === topRightVersionBits || version.infoBits === bottomLeftVersionBits) {
            return version;
        }
        var difference = numBitsDiffering(topRightVersionBits, version.infoBits);
        if (difference < bestDifference) {
            bestVersion = version;
            bestDifference = difference;
        }
        difference = numBitsDiffering(bottomLeftVersionBits, version.infoBits);
        if (difference < bestDifference) {
            bestVersion = version;
            bestDifference = difference;
        }
    }
    // We can tolerate up to 3 bits of error since no two version info codewords will
    // differ in less than 8 bits.
    if (bestDifference <= 3) {
        return bestVersion;
    }
}
function readFormatInformation(matrix) {
    var topLeftFormatInfoBits = 0;
    for (var x = 0; x <= 8; x++) {
        if (x !== 6) { // Skip timing pattern bit
            topLeftFormatInfoBits = pushBit(matrix.get(x, 8), topLeftFormatInfoBits);
        }
    }
    for (var y = 7; y >= 0; y--) {
        if (y !== 6) { // Skip timing pattern bit
            topLeftFormatInfoBits = pushBit(matrix.get(8, y), topLeftFormatInfoBits);
        }
    }
    var dimension = matrix.height;
    var topRightBottomRightFormatInfoBits = 0;
    for (var y = dimension - 1; y >= dimension - 7; y--) { // bottom left
        topRightBottomRightFormatInfoBits = pushBit(matrix.get(8, y), topRightBottomRightFormatInfoBits);
    }
    for (var x = dimension - 8; x < dimension; x++) { // top right
        topRightBottomRightFormatInfoBits = pushBit(matrix.get(x, 8), topRightBottomRightFormatInfoBits);
    }
    var bestDifference = Infinity;
    var bestFormatInfo = null;
    for (var _i = 0, FORMAT_INFO_TABLE_1 = FORMAT_INFO_TABLE; _i < FORMAT_INFO_TABLE_1.length; _i++) {
        var _a = FORMAT_INFO_TABLE_1[_i], bits = _a.bits, formatInfo = _a.formatInfo;
        if (bits === topLeftFormatInfoBits || bits === topRightBottomRightFormatInfoBits) {
            return formatInfo;
        }
        var difference = numBitsDiffering(topLeftFormatInfoBits, bits);
        if (difference < bestDifference) {
            bestFormatInfo = formatInfo;
            bestDifference = difference;
        }
        if (topLeftFormatInfoBits !== topRightBottomRightFormatInfoBits) { // also try the other option
            difference = numBitsDiffering(topRightBottomRightFormatInfoBits, bits);
            if (difference < bestDifference) {
                bestFormatInfo = formatInfo;
                bestDifference = difference;
            }
        }
    }
    // Hamming distance of the 32 masked codes is 7, by construction, so <= 3 bits differing means we found a match
    if (bestDifference <= 3) {
        return bestFormatInfo;
    }
    return null;
}
function getDataBlocks(codewords, version, ecLevel) {
    var ecInfo = version.errorCorrectionLevels[ecLevel];
    var dataBlocks = [];
    var totalCodewords = 0;
    ecInfo.ecBlocks.forEach(function (block) {
        for (var i = 0; i < block.numBlocks; i++) {
            dataBlocks.push({ numDataCodewords: block.dataCodewordsPerBlock, codewords: [] });
            totalCodewords += block.dataCodewordsPerBlock + ecInfo.ecCodewordsPerBlock;
        }
    });
    // In some cases the QR code will be malformed enough that we pull off more or less than we should.
    // If we pull off less there's nothing we can do.
    // If we pull off more we can safely truncate
    if (codewords.length < totalCodewords) {
        return null;
    }
    codewords = codewords.slice(0, totalCodewords);
    var shortBlockSize = ecInfo.ecBlocks[0].dataCodewordsPerBlock;
    // Pull codewords to fill the blocks up to the minimum size
    for (var i = 0; i < shortBlockSize; i++) {
        for (var _i = 0, dataBlocks_1 = dataBlocks; _i < dataBlocks_1.length; _i++) {
            var dataBlock = dataBlocks_1[_i];
            dataBlock.codewords.push(codewords.shift());
        }
    }
    // If there are any large blocks, pull codewords to fill the last element of those
    if (ecInfo.ecBlocks.length > 1) {
        var smallBlockCount = ecInfo.ecBlocks[0].numBlocks;
        var largeBlockCount = ecInfo.ecBlocks[1].numBlocks;
        for (var i = 0; i < largeBlockCount; i++) {
            dataBlocks[smallBlockCount + i].codewords.push(codewords.shift());
        }
    }
    // Add the rest of the codewords to the blocks. These are the error correction codewords.
    while (codewords.length > 0) {
        for (var _a = 0, dataBlocks_2 = dataBlocks; _a < dataBlocks_2.length; _a++) {
            var dataBlock = dataBlocks_2[_a];
            dataBlock.codewords.push(codewords.shift());
        }
    }
    return dataBlocks;
}
function decodeMatrix(matrix) {
    var version = readVersion(matrix);
    if (!version) {
        return null;
    }
    var formatInfo = readFormatInformation(matrix);
    if (!formatInfo) {
        return null;
    }
    var codewords = readCodewords(matrix, version, formatInfo);
    var dataBlocks = getDataBlocks(codewords, version, formatInfo.errorCorrectionLevel);
    if (!dataBlocks) {
        return null;
    }
    // Count total number of data bytes
    var totalBytes = dataBlocks.reduce(function (a, b) { return a + b.numDataCodewords; }, 0);
    var resultBytes = new Uint8ClampedArray(totalBytes);
    var resultIndex = 0;
    for (var _i = 0, dataBlocks_3 = dataBlocks; _i < dataBlocks_3.length; _i++) {
        var dataBlock = dataBlocks_3[_i];
        var correctedBytes = reedsolomon_1.decode(dataBlock.codewords, dataBlock.codewords.length - dataBlock.numDataCodewords);
        if (!correctedBytes) {
            return null;
        }
        for (var i = 0; i < dataBlock.numDataCodewords; i++) {
            resultBytes[resultIndex++] = correctedBytes[i];
        }
    }
    try {
        return decodeData_1.decode(resultBytes, version.versionNumber);
    }
    catch (_a) {
        return null;
    }
}
function decode(matrix) {
    if (matrix == null) {
        return null;
    }
    var result = decodeMatrix(matrix);
    if (result) {
        return result;
    }
    // Decoding didn't work, try mirroring the QR across the topLeft -> bottomRight line.
    for (var x = 0; x < matrix.width; x++) {
        for (var y = x + 1; y < matrix.height; y++) {
            if (matrix.get(x, y) !== matrix.get(y, x)) {
                matrix.set(x, y, !matrix.get(x, y));
                matrix.set(y, x, !matrix.get(y, x));
            }
        }
    }
    return decodeMatrix(matrix);
}
exports.decode = decode;


/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable:no-bitwise
var BitStream_1 = __webpack_require__(7);
var shiftJISTable_1 = __webpack_require__(8);
var Mode;
(function (Mode) {
    Mode["Numeric"] = "numeric";
    Mode["Alphanumeric"] = "alphanumeric";
    Mode["Byte"] = "byte";
    Mode["Kanji"] = "kanji";
    Mode["ECI"] = "eci";
})(Mode = exports.Mode || (exports.Mode = {}));
var ModeByte;
(function (ModeByte) {
    ModeByte[ModeByte["Terminator"] = 0] = "Terminator";
    ModeByte[ModeByte["Numeric"] = 1] = "Numeric";
    ModeByte[ModeByte["Alphanumeric"] = 2] = "Alphanumeric";
    ModeByte[ModeByte["Byte"] = 4] = "Byte";
    ModeByte[ModeByte["Kanji"] = 8] = "Kanji";
    ModeByte[ModeByte["ECI"] = 7] = "ECI";
    // StructuredAppend = 0x3,
    // FNC1FirstPosition = 0x5,
    // FNC1SecondPosition = 0x9,
})(ModeByte || (ModeByte = {}));
function decodeNumeric(stream, size) {
    var bytes = [];
    var text = "";
    var characterCountSize = [10, 12, 14][size];
    var length = stream.readBits(characterCountSize);
    // Read digits in groups of 3
    while (length >= 3) {
        var num = stream.readBits(10);
        if (num >= 1000) {
            throw new Error("Invalid numeric value above 999");
        }
        var a = Math.floor(num / 100);
        var b = Math.floor(num / 10) % 10;
        var c = num % 10;
        bytes.push(48 + a, 48 + b, 48 + c);
        text += a.toString() + b.toString() + c.toString();
        length -= 3;
    }
    // If the number of digits aren't a multiple of 3, the remaining digits are special cased.
    if (length === 2) {
        var num = stream.readBits(7);
        if (num >= 100) {
            throw new Error("Invalid numeric value above 99");
        }
        var a = Math.floor(num / 10);
        var b = num % 10;
        bytes.push(48 + a, 48 + b);
        text += a.toString() + b.toString();
    }
    else if (length === 1) {
        var num = stream.readBits(4);
        if (num >= 10) {
            throw new Error("Invalid numeric value above 9");
        }
        bytes.push(48 + num);
        text += num.toString();
    }
    return { bytes: bytes, text: text };
}
var AlphanumericCharacterCodes = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "A", "B", "C", "D", "E", "F", "G", "H",
    "I", "J", "K", "L", "M", "N", "O", "P", "Q",
    "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    " ", "$", "%", "*", "+", "-", ".", "/", ":",
];
function decodeAlphanumeric(stream, size) {
    var bytes = [];
    var text = "";
    var characterCountSize = [9, 11, 13][size];
    var length = stream.readBits(characterCountSize);
    while (length >= 2) {
        var v = stream.readBits(11);
        var a = Math.floor(v / 45);
        var b = v % 45;
        bytes.push(AlphanumericCharacterCodes[a].charCodeAt(0), AlphanumericCharacterCodes[b].charCodeAt(0));
        text += AlphanumericCharacterCodes[a] + AlphanumericCharacterCodes[b];
        length -= 2;
    }
    if (length === 1) {
        var a = stream.readBits(6);
        bytes.push(AlphanumericCharacterCodes[a].charCodeAt(0));
        text += AlphanumericCharacterCodes[a];
    }
    return { bytes: bytes, text: text };
}
function decodeByte(stream, size) {
    var bytes = [];
    var text = "";
    var characterCountSize = [8, 16, 16][size];
    var length = stream.readBits(characterCountSize);
    for (var i = 0; i < length; i++) {
        var b = stream.readBits(8);
        bytes.push(b);
    }
    try {
        text += decodeURIComponent(bytes.map(function (b) { return "%" + ("0" + b.toString(16)).substr(-2); }).join(""));
    }
    catch (_a) {
        // failed to decode
    }
    return { bytes: bytes, text: text };
}
function decodeKanji(stream, size) {
    var bytes = [];
    var text = "";
    var characterCountSize = [8, 10, 12][size];
    var length = stream.readBits(characterCountSize);
    for (var i = 0; i < length; i++) {
        var k = stream.readBits(13);
        var c = (Math.floor(k / 0xC0) << 8) | (k % 0xC0);
        if (c < 0x1F00) {
            c += 0x8140;
        }
        else {
            c += 0xC140;
        }
        bytes.push(c >> 8, c & 0xFF);
        text += String.fromCharCode(shiftJISTable_1.shiftJISTable[c]);
    }
    return { bytes: bytes, text: text };
}
function decode(data, version) {
    var _a, _b, _c, _d;
    var stream = new BitStream_1.BitStream(data);
    // There are 3 'sizes' based on the version. 1-9 is small (0), 10-26 is medium (1) and 27-40 is large (2).
    var size = version <= 9 ? 0 : version <= 26 ? 1 : 2;
    var result = {
        text: "",
        bytes: [],
        chunks: [],
        version: version,
    };
    while (stream.available() >= 4) {
        var mode = stream.readBits(4);
        if (mode === ModeByte.Terminator) {
            return result;
        }
        else if (mode === ModeByte.ECI) {
            if (stream.readBits(1) === 0) {
                result.chunks.push({
                    type: Mode.ECI,
                    assignmentNumber: stream.readBits(7),
                });
            }
            else if (stream.readBits(1) === 0) {
                result.chunks.push({
                    type: Mode.ECI,
                    assignmentNumber: stream.readBits(14),
                });
            }
            else if (stream.readBits(1) === 0) {
                result.chunks.push({
                    type: Mode.ECI,
                    assignmentNumber: stream.readBits(21),
                });
            }
            else {
                // ECI data seems corrupted
                result.chunks.push({
                    type: Mode.ECI,
                    assignmentNumber: -1,
                });
            }
        }
        else if (mode === ModeByte.Numeric) {
            var numericResult = decodeNumeric(stream, size);
            result.text += numericResult.text;
            (_a = result.bytes).push.apply(_a, numericResult.bytes);
            result.chunks.push({
                type: Mode.Numeric,
                text: numericResult.text,
            });
        }
        else if (mode === ModeByte.Alphanumeric) {
            var alphanumericResult = decodeAlphanumeric(stream, size);
            result.text += alphanumericResult.text;
            (_b = result.bytes).push.apply(_b, alphanumericResult.bytes);
            result.chunks.push({
                type: Mode.Alphanumeric,
                text: alphanumericResult.text,
            });
        }
        else if (mode === ModeByte.Byte) {
            var byteResult = decodeByte(stream, size);
            result.text += byteResult.text;
            (_c = result.bytes).push.apply(_c, byteResult.bytes);
            result.chunks.push({
                type: Mode.Byte,
                bytes: byteResult.bytes,
                text: byteResult.text,
            });
        }
        else if (mode === ModeByte.Kanji) {
            var kanjiResult = decodeKanji(stream, size);
            result.text += kanjiResult.text;
            (_d = result.bytes).push.apply(_d, kanjiResult.bytes);
            result.chunks.push({
                type: Mode.Kanji,
                bytes: kanjiResult.bytes,
                text: kanjiResult.text,
            });
        }
    }
    // If there is no data left, or the remaining bits are all 0, then that counts as a termination marker
    if (stream.available() === 0 || stream.readBits(stream.available()) === 0) {
        return result;
    }
}
exports.decode = decode;


/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

// tslint:disable:no-bitwise
Object.defineProperty(exports, "__esModule", { value: true });
var BitStream = /** @class */ (function () {
    function BitStream(bytes) {
        this.byteOffset = 0;
        this.bitOffset = 0;
        this.bytes = bytes;
    }
    BitStream.prototype.readBits = function (numBits) {
        if (numBits < 1 || numBits > 32 || numBits > this.available()) {
            throw new Error("Cannot read " + numBits.toString() + " bits");
        }
        var result = 0;
        // First, read remainder from current byte
        if (this.bitOffset > 0) {
            var bitsLeft = 8 - this.bitOffset;
            var toRead = numBits < bitsLeft ? numBits : bitsLeft;
            var bitsToNotRead = bitsLeft - toRead;
            var mask = (0xFF >> (8 - toRead)) << bitsToNotRead;
            result = (this.bytes[this.byteOffset] & mask) >> bitsToNotRead;
            numBits -= toRead;
            this.bitOffset += toRead;
            if (this.bitOffset === 8) {
                this.bitOffset = 0;
                this.byteOffset++;
            }
        }
        // Next read whole bytes
        if (numBits > 0) {
            while (numBits >= 8) {
                result = (result << 8) | (this.bytes[this.byteOffset] & 0xFF);
                this.byteOffset++;
                numBits -= 8;
            }
            // Finally read a partial byte
            if (numBits > 0) {
                var bitsToNotRead = 8 - numBits;
                var mask = (0xFF >> bitsToNotRead) << bitsToNotRead;
                result = (result << numBits) | ((this.bytes[this.byteOffset] & mask) >> bitsToNotRead);
                this.bitOffset += numBits;
            }
        }
        return result;
    };
    BitStream.prototype.available = function () {
        return 8 * (this.bytes.length - this.byteOffset) - this.bitOffset;
    };
    return BitStream;
}());
exports.BitStream = BitStream;


/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftJISTable = {
    0x20: 0x0020,
    0x21: 0x0021,
    0x22: 0x0022,
    0x23: 0x0023,
    0x24: 0x0024,
    0x25: 0x0025,
    0x26: 0x0026,
    0x27: 0x0027,
    0x28: 0x0028,
    0x29: 0x0029,
    0x2A: 0x002A,
    0x2B: 0x002B,
    0x2C: 0x002C,
    0x2D: 0x002D,
    0x2E: 0x002E,
    0x2F: 0x002F,
    0x30: 0x0030,
    0x31: 0x0031,
    0x32: 0x0032,
    0x33: 0x0033,
    0x34: 0x0034,
    0x35: 0x0035,
    0x36: 0x0036,
    0x37: 0x0037,
    0x38: 0x0038,
    0x39: 0x0039,
    0x3A: 0x003A,
    0x3B: 0x003B,
    0x3C: 0x003C,
    0x3D: 0x003D,
    0x3E: 0x003E,
    0x3F: 0x003F,
    0x40: 0x0040,
    0x41: 0x0041,
    0x42: 0x0042,
    0x43: 0x0043,
    0x44: 0x0044,
    0x45: 0x0045,
    0x46: 0x0046,
    0x47: 0x0047,
    0x48: 0x0048,
    0x49: 0x0049,
    0x4A: 0x004A,
    0x4B: 0x004B,
    0x4C: 0x004C,
    0x4D: 0x004D,
    0x4E: 0x004E,
    0x4F: 0x004F,
    0x50: 0x0050,
    0x51: 0x0051,
    0x52: 0x0052,
    0x53: 0x0053,
    0x54: 0x0054,
    0x55: 0x0055,
    0x56: 0x0056,
    0x57: 0x0057,
    0x58: 0x0058,
    0x59: 0x0059,
    0x5A: 0x005A,
    0x5B: 0x005B,
    0x5C: 0x00A5,
    0x5D: 0x005D,
    0x5E: 0x005E,
    0x5F: 0x005F,
    0x60: 0x0060,
    0x61: 0x0061,
    0x62: 0x0062,
    0x63: 0x0063,
    0x64: 0x0064,
    0x65: 0x0065,
    0x66: 0x0066,
    0x67: 0x0067,
    0x68: 0x0068,
    0x69: 0x0069,
    0x6A: 0x006A,
    0x6B: 0x006B,
    0x6C: 0x006C,
    0x6D: 0x006D,
    0x6E: 0x006E,
    0x6F: 0x006F,
    0x70: 0x0070,
    0x71: 0x0071,
    0x72: 0x0072,
    0x73: 0x0073,
    0x74: 0x0074,
    0x75: 0x0075,
    0x76: 0x0076,
    0x77: 0x0077,
    0x78: 0x0078,
    0x79: 0x0079,
    0x7A: 0x007A,
    0x7B: 0x007B,
    0x7C: 0x007C,
    0x7D: 0x007D,
    0x7E: 0x203E,
    0x8140: 0x3000,
    0x8141: 0x3001,
    0x8142: 0x3002,
    0x8143: 0xFF0C,
    0x8144: 0xFF0E,
    0x8145: 0x30FB,
    0x8146: 0xFF1A,
    0x8147: 0xFF1B,
    0x8148: 0xFF1F,
    0x8149: 0xFF01,
    0x814A: 0x309B,
    0x814B: 0x309C,
    0x814C: 0x00B4,
    0x814D: 0xFF40,
    0x814E: 0x00A8,
    0x814F: 0xFF3E,
    0x8150: 0xFFE3,
    0x8151: 0xFF3F,
    0x8152: 0x30FD,
    0x8153: 0x30FE,
    0x8154: 0x309D,
    0x8155: 0x309E,
    0x8156: 0x3003,
    0x8157: 0x4EDD,
    0x8158: 0x3005,
    0x8159: 0x3006,
    0x815A: 0x3007,
    0x815B: 0x30FC,
    0x815C: 0x2015,
    0x815D: 0x2010,
    0x815E: 0xFF0F,
    0x815F: 0x005C,
    0x8160: 0x301C,
    0x8161: 0x2016,
    0x8162: 0xFF5C,
    0x8163: 0x2026,
    0x8164: 0x2025,
    0x8165: 0x2018,
    0x8166: 0x2019,
    0x8167: 0x201C,
    0x8168: 0x201D,
    0x8169: 0xFF08,
    0x816A: 0xFF09,
    0x816B: 0x3014,
    0x816C: 0x3015,
    0x816D: 0xFF3B,
    0x816E: 0xFF3D,
    0x816F: 0xFF5B,
    0x8170: 0xFF5D,
    0x8171: 0x3008,
    0x8172: 0x3009,
    0x8173: 0x300A,
    0x8174: 0x300B,
    0x8175: 0x300C,
    0x8176: 0x300D,
    0x8177: 0x300E,
    0x8178: 0x300F,
    0x8179: 0x3010,
    0x817A: 0x3011,
    0x817B: 0xFF0B,
    0x817C: 0x2212,
    0x817D: 0x00B1,
    0x817E: 0x00D7,
    0x8180: 0x00F7,
    0x8181: 0xFF1D,
    0x8182: 0x2260,
    0x8183: 0xFF1C,
    0x8184: 0xFF1E,
    0x8185: 0x2266,
    0x8186: 0x2267,
    0x8187: 0x221E,
    0x8188: 0x2234,
    0x8189: 0x2642,
    0x818A: 0x2640,
    0x818B: 0x00B0,
    0x818C: 0x2032,
    0x818D: 0x2033,
    0x818E: 0x2103,
    0x818F: 0xFFE5,
    0x8190: 0xFF04,
    0x8191: 0x00A2,
    0x8192: 0x00A3,
    0x8193: 0xFF05,
    0x8194: 0xFF03,
    0x8195: 0xFF06,
    0x8196: 0xFF0A,
    0x8197: 0xFF20,
    0x8198: 0x00A7,
    0x8199: 0x2606,
    0x819A: 0x2605,
    0x819B: 0x25CB,
    0x819C: 0x25CF,
    0x819D: 0x25CE,
    0x819E: 0x25C7,
    0x819F: 0x25C6,
    0x81A0: 0x25A1,
    0x81A1: 0x25A0,
    0x81A2: 0x25B3,
    0x81A3: 0x25B2,
    0x81A4: 0x25BD,
    0x81A5: 0x25BC,
    0x81A6: 0x203B,
    0x81A7: 0x3012,
    0x81A8: 0x2192,
    0x81A9: 0x2190,
    0x81AA: 0x2191,
    0x81AB: 0x2193,
    0x81AC: 0x3013,
    0x81B8: 0x2208,
    0x81B9: 0x220B,
    0x81BA: 0x2286,
    0x81BB: 0x2287,
    0x81BC: 0x2282,
    0x81BD: 0x2283,
    0x81BE: 0x222A,
    0x81BF: 0x2229,
    0x81C8: 0x2227,
    0x81C9: 0x2228,
    0x81CA: 0x00AC,
    0x81CB: 0x21D2,
    0x81CC: 0x21D4,
    0x81CD: 0x2200,
    0x81CE: 0x2203,
    0x81DA: 0x2220,
    0x81DB: 0x22A5,
    0x81DC: 0x2312,
    0x81DD: 0x2202,
    0x81DE: 0x2207,
    0x81DF: 0x2261,
    0x81E0: 0x2252,
    0x81E1: 0x226A,
    0x81E2: 0x226B,
    0x81E3: 0x221A,
    0x81E4: 0x223D,
    0x81E5: 0x221D,
    0x81E6: 0x2235,
    0x81E7: 0x222B,
    0x81E8: 0x222C,
    0x81F0: 0x212B,
    0x81F1: 0x2030,
    0x81F2: 0x266F,
    0x81F3: 0x266D,
    0x81F4: 0x266A,
    0x81F5: 0x2020,
    0x81F6: 0x2021,
    0x81F7: 0x00B6,
    0x81FC: 0x25EF,
    0x824F: 0xFF10,
    0x8250: 0xFF11,
    0x8251: 0xFF12,
    0x8252: 0xFF13,
    0x8253: 0xFF14,
    0x8254: 0xFF15,
    0x8255: 0xFF16,
    0x8256: 0xFF17,
    0x8257: 0xFF18,
    0x8258: 0xFF19,
    0x8260: 0xFF21,
    0x8261: 0xFF22,
    0x8262: 0xFF23,
    0x8263: 0xFF24,
    0x8264: 0xFF25,
    0x8265: 0xFF26,
    0x8266: 0xFF27,
    0x8267: 0xFF28,
    0x8268: 0xFF29,
    0x8269: 0xFF2A,
    0x826A: 0xFF2B,
    0x826B: 0xFF2C,
    0x826C: 0xFF2D,
    0x826D: 0xFF2E,
    0x826E: 0xFF2F,
    0x826F: 0xFF30,
    0x8270: 0xFF31,
    0x8271: 0xFF32,
    0x8272: 0xFF33,
    0x8273: 0xFF34,
    0x8274: 0xFF35,
    0x8275: 0xFF36,
    0x8276: 0xFF37,
    0x8277: 0xFF38,
    0x8278: 0xFF39,
    0x8279: 0xFF3A,
    0x8281: 0xFF41,
    0x8282: 0xFF42,
    0x8283: 0xFF43,
    0x8284: 0xFF44,
    0x8285: 0xFF45,
    0x8286: 0xFF46,
    0x8287: 0xFF47,
    0x8288: 0xFF48,
    0x8289: 0xFF49,
    0x828A: 0xFF4A,
    0x828B: 0xFF4B,
    0x828C: 0xFF4C,
    0x828D: 0xFF4D,
    0x828E: 0xFF4E,
    0x828F: 0xFF4F,
    0x8290: 0xFF50,
    0x8291: 0xFF51,
    0x8292: 0xFF52,
    0x8293: 0xFF53,
    0x8294: 0xFF54,
    0x8295: 0xFF55,
    0x8296: 0xFF56,
    0x8297: 0xFF57,
    0x8298: 0xFF58,
    0x8299: 0xFF59,
    0x829A: 0xFF5A,
    0x829F: 0x3041,
    0x82A0: 0x3042,
    0x82A1: 0x3043,
    0x82A2: 0x3044,
    0x82A3: 0x3045,
    0x82A4: 0x3046,
    0x82A5: 0x3047,
    0x82A6: 0x3048,
    0x82A7: 0x3049,
    0x82A8: 0x304A,
    0x82A9: 0x304B,
    0x82AA: 0x304C,
    0x82AB: 0x304D,
    0x82AC: 0x304E,
    0x82AD: 0x304F,
    0x82AE: 0x3050,
    0x82AF: 0x3051,
    0x82B0: 0x3052,
    0x82B1: 0x3053,
    0x82B2: 0x3054,
    0x82B3: 0x3055,
    0x82B4: 0x3056,
    0x82B5: 0x3057,
    0x82B6: 0x3058,
    0x82B7: 0x3059,
    0x82B8: 0x305A,
    0x82B9: 0x305B,
    0x82BA: 0x305C,
    0x82BB: 0x305D,
    0x82BC: 0x305E,
    0x82BD: 0x305F,
    0x82BE: 0x3060,
    0x82BF: 0x3061,
    0x82C0: 0x3062,
    0x82C1: 0x3063,
    0x82C2: 0x3064,
    0x82C3: 0x3065,
    0x82C4: 0x3066,
    0x82C5: 0x3067,
    0x82C6: 0x3068,
    0x82C7: 0x3069,
    0x82C8: 0x306A,
    0x82C9: 0x306B,
    0x82CA: 0x306C,
    0x82CB: 0x306D,
    0x82CC: 0x306E,
    0x82CD: 0x306F,
    0x82CE: 0x3070,
    0x82CF: 0x3071,
    0x82D0: 0x3072,
    0x82D1: 0x3073,
    0x82D2: 0x3074,
    0x82D3: 0x3075,
    0x82D4: 0x3076,
    0x82D5: 0x3077,
    0x82D6: 0x3078,
    0x82D7: 0x3079,
    0x82D8: 0x307A,
    0x82D9: 0x307B,
    0x82DA: 0x307C,
    0x82DB: 0x307D,
    0x82DC: 0x307E,
    0x82DD: 0x307F,
    0x82DE: 0x3080,
    0x82DF: 0x3081,
    0x82E0: 0x3082,
    0x82E1: 0x3083,
    0x82E2: 0x3084,
    0x82E3: 0x3085,
    0x82E4: 0x3086,
    0x82E5: 0x3087,
    0x82E6: 0x3088,
    0x82E7: 0x3089,
    0x82E8: 0x308A,
    0x82E9: 0x308B,
    0x82EA: 0x308C,
    0x82EB: 0x308D,
    0x82EC: 0x308E,
    0x82ED: 0x308F,
    0x82EE: 0x3090,
    0x82EF: 0x3091,
    0x82F0: 0x3092,
    0x82F1: 0x3093,
    0x8340: 0x30A1,
    0x8341: 0x30A2,
    0x8342: 0x30A3,
    0x8343: 0x30A4,
    0x8344: 0x30A5,
    0x8345: 0x30A6,
    0x8346: 0x30A7,
    0x8347: 0x30A8,
    0x8348: 0x30A9,
    0x8349: 0x30AA,
    0x834A: 0x30AB,
    0x834B: 0x30AC,
    0x834C: 0x30AD,
    0x834D: 0x30AE,
    0x834E: 0x30AF,
    0x834F: 0x30B0,
    0x8350: 0x30B1,
    0x8351: 0x30B2,
    0x8352: 0x30B3,
    0x8353: 0x30B4,
    0x8354: 0x30B5,
    0x8355: 0x30B6,
    0x8356: 0x30B7,
    0x8357: 0x30B8,
    0x8358: 0x30B9,
    0x8359: 0x30BA,
    0x835A: 0x30BB,
    0x835B: 0x30BC,
    0x835C: 0x30BD,
    0x835D: 0x30BE,
    0x835E: 0x30BF,
    0x835F: 0x30C0,
    0x8360: 0x30C1,
    0x8361: 0x30C2,
    0x8362: 0x30C3,
    0x8363: 0x30C4,
    0x8364: 0x30C5,
    0x8365: 0x30C6,
    0x8366: 0x30C7,
    0x8367: 0x30C8,
    0x8368: 0x30C9,
    0x8369: 0x30CA,
    0x836A: 0x30CB,
    0x836B: 0x30CC,
    0x836C: 0x30CD,
    0x836D: 0x30CE,
    0x836E: 0x30CF,
    0x836F: 0x30D0,
    0x8370: 0x30D1,
    0x8371: 0x30D2,
    0x8372: 0x30D3,
    0x8373: 0x30D4,
    0x8374: 0x30D5,
    0x8375: 0x30D6,
    0x8376: 0x30D7,
    0x8377: 0x30D8,
    0x8378: 0x30D9,
    0x8379: 0x30DA,
    0x837A: 0x30DB,
    0x837B: 0x30DC,
    0x837C: 0x30DD,
    0x837D: 0x30DE,
    0x837E: 0x30DF,
    0x8380: 0x30E0,
    0x8381: 0x30E1,
    0x8382: 0x30E2,
    0x8383: 0x30E3,
    0x8384: 0x30E4,
    0x8385: 0x30E5,
    0x8386: 0x30E6,
    0x8387: 0x30E7,
    0x8388: 0x30E8,
    0x8389: 0x30E9,
    0x838A: 0x30EA,
    0x838B: 0x30EB,
    0x838C: 0x30EC,
    0x838D: 0x30ED,
    0x838E: 0x30EE,
    0x838F: 0x30EF,
    0x8390: 0x30F0,
    0x8391: 0x30F1,
    0x8392: 0x30F2,
    0x8393: 0x30F3,
    0x8394: 0x30F4,
    0x8395: 0x30F5,
    0x8396: 0x30F6,
    0x839F: 0x0391,
    0x83A0: 0x0392,
    0x83A1: 0x0393,
    0x83A2: 0x0394,
    0x83A3: 0x0395,
    0x83A4: 0x0396,
    0x83A5: 0x0397,
    0x83A6: 0x0398,
    0x83A7: 0x0399,
    0x83A8: 0x039A,
    0x83A9: 0x039B,
    0x83AA: 0x039C,
    0x83AB: 0x039D,
    0x83AC: 0x039E,
    0x83AD: 0x039F,
    0x83AE: 0x03A0,
    0x83AF: 0x03A1,
    0x83B0: 0x03A3,
    0x83B1: 0x03A4,
    0x83B2: 0x03A5,
    0x83B3: 0x03A6,
    0x83B4: 0x03A7,
    0x83B5: 0x03A8,
    0x83B6: 0x03A9,
    0x83BF: 0x03B1,
    0x83C0: 0x03B2,
    0x83C1: 0x03B3,
    0x83C2: 0x03B4,
    0x83C3: 0x03B5,
    0x83C4: 0x03B6,
    0x83C5: 0x03B7,
    0x83C6: 0x03B8,
    0x83C7: 0x03B9,
    0x83C8: 0x03BA,
    0x83C9: 0x03BB,
    0x83CA: 0x03BC,
    0x83CB: 0x03BD,
    0x83CC: 0x03BE,
    0x83CD: 0x03BF,
    0x83CE: 0x03C0,
    0x83CF: 0x03C1,
    0x83D0: 0x03C3,
    0x83D1: 0x03C4,
    0x83D2: 0x03C5,
    0x83D3: 0x03C6,
    0x83D4: 0x03C7,
    0x83D5: 0x03C8,
    0x83D6: 0x03C9,
    0x8440: 0x0410,
    0x8441: 0x0411,
    0x8442: 0x0412,
    0x8443: 0x0413,
    0x8444: 0x0414,
    0x8445: 0x0415,
    0x8446: 0x0401,
    0x8447: 0x0416,
    0x8448: 0x0417,
    0x8449: 0x0418,
    0x844A: 0x0419,
    0x844B: 0x041A,
    0x844C: 0x041B,
    0x844D: 0x041C,
    0x844E: 0x041D,
    0x844F: 0x041E,
    0x8450: 0x041F,
    0x8451: 0x0420,
    0x8452: 0x0421,
    0x8453: 0x0422,
    0x8454: 0x0423,
    0x8455: 0x0424,
    0x8456: 0x0425,
    0x8457: 0x0426,
    0x8458: 0x0427,
    0x8459: 0x0428,
    0x845A: 0x0429,
    0x845B: 0x042A,
    0x845C: 0x042B,
    0x845D: 0x042C,
    0x845E: 0x042D,
    0x845F: 0x042E,
    0x8460: 0x042F,
    0x8470: 0x0430,
    0x8471: 0x0431,
    0x8472: 0x0432,
    0x8473: 0x0433,
    0x8474: 0x0434,
    0x8475: 0x0435,
    0x8476: 0x0451,
    0x8477: 0x0436,
    0x8478: 0x0437,
    0x8479: 0x0438,
    0x847A: 0x0439,
    0x847B: 0x043A,
    0x847C: 0x043B,
    0x847D: 0x043C,
    0x847E: 0x043D,
    0x8480: 0x043E,
    0x8481: 0x043F,
    0x8482: 0x0440,
    0x8483: 0x0441,
    0x8484: 0x0442,
    0x8485: 0x0443,
    0x8486: 0x0444,
    0x8487: 0x0445,
    0x8488: 0x0446,
    0x8489: 0x0447,
    0x848A: 0x0448,
    0x848B: 0x0449,
    0x848C: 0x044A,
    0x848D: 0x044B,
    0x848E: 0x044C,
    0x848F: 0x044D,
    0x8490: 0x044E,
    0x8491: 0x044F,
    0x849F: 0x2500,
    0x84A0: 0x2502,
    0x84A1: 0x250C,
    0x84A2: 0x2510,
    0x84A3: 0x2518,
    0x84A4: 0x2514,
    0x84A5: 0x251C,
    0x84A6: 0x252C,
    0x84A7: 0x2524,
    0x84A8: 0x2534,
    0x84A9: 0x253C,
    0x84AA: 0x2501,
    0x84AB: 0x2503,
    0x84AC: 0x250F,
    0x84AD: 0x2513,
    0x84AE: 0x251B,
    0x84AF: 0x2517,
    0x84B0: 0x2523,
    0x84B1: 0x2533,
    0x84B2: 0x252B,
    0x84B3: 0x253B,
    0x84B4: 0x254B,
    0x84B5: 0x2520,
    0x84B6: 0x252F,
    0x84B7: 0x2528,
    0x84B8: 0x2537,
    0x84B9: 0x253F,
    0x84BA: 0x251D,
    0x84BB: 0x2530,
    0x84BC: 0x2525,
    0x84BD: 0x2538,
    0x84BE: 0x2542,
    0x889F: 0x4E9C,
    0x88A0: 0x5516,
    0x88A1: 0x5A03,
    0x88A2: 0x963F,
    0x88A3: 0x54C0,
    0x88A4: 0x611B,
    0x88A5: 0x6328,
    0x88A6: 0x59F6,
    0x88A7: 0x9022,
    0x88A8: 0x8475,
    0x88A9: 0x831C,
    0x88AA: 0x7A50,
    0x88AB: 0x60AA,
    0x88AC: 0x63E1,
    0x88AD: 0x6E25,
    0x88AE: 0x65ED,
    0x88AF: 0x8466,
    0x88B0: 0x82A6,
    0x88B1: 0x9BF5,
    0x88B2: 0x6893,
    0x88B3: 0x5727,
    0x88B4: 0x65A1,
    0x88B5: 0x6271,
    0x88B6: 0x5B9B,
    0x88B7: 0x59D0,
    0x88B8: 0x867B,
    0x88B9: 0x98F4,
    0x88BA: 0x7D62,
    0x88BB: 0x7DBE,
    0x88BC: 0x9B8E,
    0x88BD: 0x6216,
    0x88BE: 0x7C9F,
    0x88BF: 0x88B7,
    0x88C0: 0x5B89,
    0x88C1: 0x5EB5,
    0x88C2: 0x6309,
    0x88C3: 0x6697,
    0x88C4: 0x6848,
    0x88C5: 0x95C7,
    0x88C6: 0x978D,
    0x88C7: 0x674F,
    0x88C8: 0x4EE5,
    0x88C9: 0x4F0A,
    0x88CA: 0x4F4D,
    0x88CB: 0x4F9D,
    0x88CC: 0x5049,
    0x88CD: 0x56F2,
    0x88CE: 0x5937,
    0x88CF: 0x59D4,
    0x88D0: 0x5A01,
    0x88D1: 0x5C09,
    0x88D2: 0x60DF,
    0x88D3: 0x610F,
    0x88D4: 0x6170,
    0x88D5: 0x6613,
    0x88D6: 0x6905,
    0x88D7: 0x70BA,
    0x88D8: 0x754F,
    0x88D9: 0x7570,
    0x88DA: 0x79FB,
    0x88DB: 0x7DAD,
    0x88DC: 0x7DEF,
    0x88DD: 0x80C3,
    0x88DE: 0x840E,
    0x88DF: 0x8863,
    0x88E0: 0x8B02,
    0x88E1: 0x9055,
    0x88E2: 0x907A,
    0x88E3: 0x533B,
    0x88E4: 0x4E95,
    0x88E5: 0x4EA5,
    0x88E6: 0x57DF,
    0x88E7: 0x80B2,
    0x88E8: 0x90C1,
    0x88E9: 0x78EF,
    0x88EA: 0x4E00,
    0x88EB: 0x58F1,
    0x88EC: 0x6EA2,
    0x88ED: 0x9038,
    0x88EE: 0x7A32,
    0x88EF: 0x8328,
    0x88F0: 0x828B,
    0x88F1: 0x9C2F,
    0x88F2: 0x5141,
    0x88F3: 0x5370,
    0x88F4: 0x54BD,
    0x88F5: 0x54E1,
    0x88F6: 0x56E0,
    0x88F7: 0x59FB,
    0x88F8: 0x5F15,
    0x88F9: 0x98F2,
    0x88FA: 0x6DEB,
    0x88FB: 0x80E4,
    0x88FC: 0x852D,
    0x8940: 0x9662,
    0x8941: 0x9670,
    0x8942: 0x96A0,
    0x8943: 0x97FB,
    0x8944: 0x540B,
    0x8945: 0x53F3,
    0x8946: 0x5B87,
    0x8947: 0x70CF,
    0x8948: 0x7FBD,
    0x8949: 0x8FC2,
    0x894A: 0x96E8,
    0x894B: 0x536F,
    0x894C: 0x9D5C,
    0x894D: 0x7ABA,
    0x894E: 0x4E11,
    0x894F: 0x7893,
    0x8950: 0x81FC,
    0x8951: 0x6E26,
    0x8952: 0x5618,
    0x8953: 0x5504,
    0x8954: 0x6B1D,
    0x8955: 0x851A,
    0x8956: 0x9C3B,
    0x8957: 0x59E5,
    0x8958: 0x53A9,
    0x8959: 0x6D66,
    0x895A: 0x74DC,
    0x895B: 0x958F,
    0x895C: 0x5642,
    0x895D: 0x4E91,
    0x895E: 0x904B,
    0x895F: 0x96F2,
    0x8960: 0x834F,
    0x8961: 0x990C,
    0x8962: 0x53E1,
    0x8963: 0x55B6,
    0x8964: 0x5B30,
    0x8965: 0x5F71,
    0x8966: 0x6620,
    0x8967: 0x66F3,
    0x8968: 0x6804,
    0x8969: 0x6C38,
    0x896A: 0x6CF3,
    0x896B: 0x6D29,
    0x896C: 0x745B,
    0x896D: 0x76C8,
    0x896E: 0x7A4E,
    0x896F: 0x9834,
    0x8970: 0x82F1,
    0x8971: 0x885B,
    0x8972: 0x8A60,
    0x8973: 0x92ED,
    0x8974: 0x6DB2,
    0x8975: 0x75AB,
    0x8976: 0x76CA,
    0x8977: 0x99C5,
    0x8978: 0x60A6,
    0x8979: 0x8B01,
    0x897A: 0x8D8A,
    0x897B: 0x95B2,
    0x897C: 0x698E,
    0x897D: 0x53AD,
    0x897E: 0x5186,
    0x8980: 0x5712,
    0x8981: 0x5830,
    0x8982: 0x5944,
    0x8983: 0x5BB4,
    0x8984: 0x5EF6,
    0x8985: 0x6028,
    0x8986: 0x63A9,
    0x8987: 0x63F4,
    0x8988: 0x6CBF,
    0x8989: 0x6F14,
    0x898A: 0x708E,
    0x898B: 0x7114,
    0x898C: 0x7159,
    0x898D: 0x71D5,
    0x898E: 0x733F,
    0x898F: 0x7E01,
    0x8990: 0x8276,
    0x8991: 0x82D1,
    0x8992: 0x8597,
    0x8993: 0x9060,
    0x8994: 0x925B,
    0x8995: 0x9D1B,
    0x8996: 0x5869,
    0x8997: 0x65BC,
    0x8998: 0x6C5A,
    0x8999: 0x7525,
    0x899A: 0x51F9,
    0x899B: 0x592E,
    0x899C: 0x5965,
    0x899D: 0x5F80,
    0x899E: 0x5FDC,
    0x899F: 0x62BC,
    0x89A0: 0x65FA,
    0x89A1: 0x6A2A,
    0x89A2: 0x6B27,
    0x89A3: 0x6BB4,
    0x89A4: 0x738B,
    0x89A5: 0x7FC1,
    0x89A6: 0x8956,
    0x89A7: 0x9D2C,
    0x89A8: 0x9D0E,
    0x89A9: 0x9EC4,
    0x89AA: 0x5CA1,
    0x89AB: 0x6C96,
    0x89AC: 0x837B,
    0x89AD: 0x5104,
    0x89AE: 0x5C4B,
    0x89AF: 0x61B6,
    0x89B0: 0x81C6,
    0x89B1: 0x6876,
    0x89B2: 0x7261,
    0x89B3: 0x4E59,
    0x89B4: 0x4FFA,
    0x89B5: 0x5378,
    0x89B6: 0x6069,
    0x89B7: 0x6E29,
    0x89B8: 0x7A4F,
    0x89B9: 0x97F3,
    0x89BA: 0x4E0B,
    0x89BB: 0x5316,
    0x89BC: 0x4EEE,
    0x89BD: 0x4F55,
    0x89BE: 0x4F3D,
    0x89BF: 0x4FA1,
    0x89C0: 0x4F73,
    0x89C1: 0x52A0,
    0x89C2: 0x53EF,
    0x89C3: 0x5609,
    0x89C4: 0x590F,
    0x89C5: 0x5AC1,
    0x89C6: 0x5BB6,
    0x89C7: 0x5BE1,
    0x89C8: 0x79D1,
    0x89C9: 0x6687,
    0x89CA: 0x679C,
    0x89CB: 0x67B6,
    0x89CC: 0x6B4C,
    0x89CD: 0x6CB3,
    0x89CE: 0x706B,
    0x89CF: 0x73C2,
    0x89D0: 0x798D,
    0x89D1: 0x79BE,
    0x89D2: 0x7A3C,
    0x89D3: 0x7B87,
    0x89D4: 0x82B1,
    0x89D5: 0x82DB,
    0x89D6: 0x8304,
    0x89D7: 0x8377,
    0x89D8: 0x83EF,
    0x89D9: 0x83D3,
    0x89DA: 0x8766,
    0x89DB: 0x8AB2,
    0x89DC: 0x5629,
    0x89DD: 0x8CA8,
    0x89DE: 0x8FE6,
    0x89DF: 0x904E,
    0x89E0: 0x971E,
    0x89E1: 0x868A,
    0x89E2: 0x4FC4,
    0x89E3: 0x5CE8,
    0x89E4: 0x6211,
    0x89E5: 0x7259,
    0x89E6: 0x753B,
    0x89E7: 0x81E5,
    0x89E8: 0x82BD,
    0x89E9: 0x86FE,
    0x89EA: 0x8CC0,
    0x89EB: 0x96C5,
    0x89EC: 0x9913,
    0x89ED: 0x99D5,
    0x89EE: 0x4ECB,
    0x89EF: 0x4F1A,
    0x89F0: 0x89E3,
    0x89F1: 0x56DE,
    0x89F2: 0x584A,
    0x89F3: 0x58CA,
    0x89F4: 0x5EFB,
    0x89F5: 0x5FEB,
    0x89F6: 0x602A,
    0x89F7: 0x6094,
    0x89F8: 0x6062,
    0x89F9: 0x61D0,
    0x89FA: 0x6212,
    0x89FB: 0x62D0,
    0x89FC: 0x6539,
    0x8A40: 0x9B41,
    0x8A41: 0x6666,
    0x8A42: 0x68B0,
    0x8A43: 0x6D77,
    0x8A44: 0x7070,
    0x8A45: 0x754C,
    0x8A46: 0x7686,
    0x8A47: 0x7D75,
    0x8A48: 0x82A5,
    0x8A49: 0x87F9,
    0x8A4A: 0x958B,
    0x8A4B: 0x968E,
    0x8A4C: 0x8C9D,
    0x8A4D: 0x51F1,
    0x8A4E: 0x52BE,
    0x8A4F: 0x5916,
    0x8A50: 0x54B3,
    0x8A51: 0x5BB3,
    0x8A52: 0x5D16,
    0x8A53: 0x6168,
    0x8A54: 0x6982,
    0x8A55: 0x6DAF,
    0x8A56: 0x788D,
    0x8A57: 0x84CB,
    0x8A58: 0x8857,
    0x8A59: 0x8A72,
    0x8A5A: 0x93A7,
    0x8A5B: 0x9AB8,
    0x8A5C: 0x6D6C,
    0x8A5D: 0x99A8,
    0x8A5E: 0x86D9,
    0x8A5F: 0x57A3,
    0x8A60: 0x67FF,
    0x8A61: 0x86CE,
    0x8A62: 0x920E,
    0x8A63: 0x5283,
    0x8A64: 0x5687,
    0x8A65: 0x5404,
    0x8A66: 0x5ED3,
    0x8A67: 0x62E1,
    0x8A68: 0x64B9,
    0x8A69: 0x683C,
    0x8A6A: 0x6838,
    0x8A6B: 0x6BBB,
    0x8A6C: 0x7372,
    0x8A6D: 0x78BA,
    0x8A6E: 0x7A6B,
    0x8A6F: 0x899A,
    0x8A70: 0x89D2,
    0x8A71: 0x8D6B,
    0x8A72: 0x8F03,
    0x8A73: 0x90ED,
    0x8A74: 0x95A3,
    0x8A75: 0x9694,
    0x8A76: 0x9769,
    0x8A77: 0x5B66,
    0x8A78: 0x5CB3,
    0x8A79: 0x697D,
    0x8A7A: 0x984D,
    0x8A7B: 0x984E,
    0x8A7C: 0x639B,
    0x8A7D: 0x7B20,
    0x8A7E: 0x6A2B,
    0x8A80: 0x6A7F,
    0x8A81: 0x68B6,
    0x8A82: 0x9C0D,
    0x8A83: 0x6F5F,
    0x8A84: 0x5272,
    0x8A85: 0x559D,
    0x8A86: 0x6070,
    0x8A87: 0x62EC,
    0x8A88: 0x6D3B,
    0x8A89: 0x6E07,
    0x8A8A: 0x6ED1,
    0x8A8B: 0x845B,
    0x8A8C: 0x8910,
    0x8A8D: 0x8F44,
    0x8A8E: 0x4E14,
    0x8A8F: 0x9C39,
    0x8A90: 0x53F6,
    0x8A91: 0x691B,
    0x8A92: 0x6A3A,
    0x8A93: 0x9784,
    0x8A94: 0x682A,
    0x8A95: 0x515C,
    0x8A96: 0x7AC3,
    0x8A97: 0x84B2,
    0x8A98: 0x91DC,
    0x8A99: 0x938C,
    0x8A9A: 0x565B,
    0x8A9B: 0x9D28,
    0x8A9C: 0x6822,
    0x8A9D: 0x8305,
    0x8A9E: 0x8431,
    0x8A9F: 0x7CA5,
    0x8AA0: 0x5208,
    0x8AA1: 0x82C5,
    0x8AA2: 0x74E6,
    0x8AA3: 0x4E7E,
    0x8AA4: 0x4F83,
    0x8AA5: 0x51A0,
    0x8AA6: 0x5BD2,
    0x8AA7: 0x520A,
    0x8AA8: 0x52D8,
    0x8AA9: 0x52E7,
    0x8AAA: 0x5DFB,
    0x8AAB: 0x559A,
    0x8AAC: 0x582A,
    0x8AAD: 0x59E6,
    0x8AAE: 0x5B8C,
    0x8AAF: 0x5B98,
    0x8AB0: 0x5BDB,
    0x8AB1: 0x5E72,
    0x8AB2: 0x5E79,
    0x8AB3: 0x60A3,
    0x8AB4: 0x611F,
    0x8AB5: 0x6163,
    0x8AB6: 0x61BE,
    0x8AB7: 0x63DB,
    0x8AB8: 0x6562,
    0x8AB9: 0x67D1,
    0x8ABA: 0x6853,
    0x8ABB: 0x68FA,
    0x8ABC: 0x6B3E,
    0x8ABD: 0x6B53,
    0x8ABE: 0x6C57,
    0x8ABF: 0x6F22,
    0x8AC0: 0x6F97,
    0x8AC1: 0x6F45,
    0x8AC2: 0x74B0,
    0x8AC3: 0x7518,
    0x8AC4: 0x76E3,
    0x8AC5: 0x770B,
    0x8AC6: 0x7AFF,
    0x8AC7: 0x7BA1,
    0x8AC8: 0x7C21,
    0x8AC9: 0x7DE9,
    0x8ACA: 0x7F36,
    0x8ACB: 0x7FF0,
    0x8ACC: 0x809D,
    0x8ACD: 0x8266,
    0x8ACE: 0x839E,
    0x8ACF: 0x89B3,
    0x8AD0: 0x8ACC,
    0x8AD1: 0x8CAB,
    0x8AD2: 0x9084,
    0x8AD3: 0x9451,
    0x8AD4: 0x9593,
    0x8AD5: 0x9591,
    0x8AD6: 0x95A2,
    0x8AD7: 0x9665,
    0x8AD8: 0x97D3,
    0x8AD9: 0x9928,
    0x8ADA: 0x8218,
    0x8ADB: 0x4E38,
    0x8ADC: 0x542B,
    0x8ADD: 0x5CB8,
    0x8ADE: 0x5DCC,
    0x8ADF: 0x73A9,
    0x8AE0: 0x764C,
    0x8AE1: 0x773C,
    0x8AE2: 0x5CA9,
    0x8AE3: 0x7FEB,
    0x8AE4: 0x8D0B,
    0x8AE5: 0x96C1,
    0x8AE6: 0x9811,
    0x8AE7: 0x9854,
    0x8AE8: 0x9858,
    0x8AE9: 0x4F01,
    0x8AEA: 0x4F0E,
    0x8AEB: 0x5371,
    0x8AEC: 0x559C,
    0x8AED: 0x5668,
    0x8AEE: 0x57FA,
    0x8AEF: 0x5947,
    0x8AF0: 0x5B09,
    0x8AF1: 0x5BC4,
    0x8AF2: 0x5C90,
    0x8AF3: 0x5E0C,
    0x8AF4: 0x5E7E,
    0x8AF5: 0x5FCC,
    0x8AF6: 0x63EE,
    0x8AF7: 0x673A,
    0x8AF8: 0x65D7,
    0x8AF9: 0x65E2,
    0x8AFA: 0x671F,
    0x8AFB: 0x68CB,
    0x8AFC: 0x68C4,
    0x8B40: 0x6A5F,
    0x8B41: 0x5E30,
    0x8B42: 0x6BC5,
    0x8B43: 0x6C17,
    0x8B44: 0x6C7D,
    0x8B45: 0x757F,
    0x8B46: 0x7948,
    0x8B47: 0x5B63,
    0x8B48: 0x7A00,
    0x8B49: 0x7D00,
    0x8B4A: 0x5FBD,
    0x8B4B: 0x898F,
    0x8B4C: 0x8A18,
    0x8B4D: 0x8CB4,
    0x8B4E: 0x8D77,
    0x8B4F: 0x8ECC,
    0x8B50: 0x8F1D,
    0x8B51: 0x98E2,
    0x8B52: 0x9A0E,
    0x8B53: 0x9B3C,
    0x8B54: 0x4E80,
    0x8B55: 0x507D,
    0x8B56: 0x5100,
    0x8B57: 0x5993,
    0x8B58: 0x5B9C,
    0x8B59: 0x622F,
    0x8B5A: 0x6280,
    0x8B5B: 0x64EC,
    0x8B5C: 0x6B3A,
    0x8B5D: 0x72A0,
    0x8B5E: 0x7591,
    0x8B5F: 0x7947,
    0x8B60: 0x7FA9,
    0x8B61: 0x87FB,
    0x8B62: 0x8ABC,
    0x8B63: 0x8B70,
    0x8B64: 0x63AC,
    0x8B65: 0x83CA,
    0x8B66: 0x97A0,
    0x8B67: 0x5409,
    0x8B68: 0x5403,
    0x8B69: 0x55AB,
    0x8B6A: 0x6854,
    0x8B6B: 0x6A58,
    0x8B6C: 0x8A70,
    0x8B6D: 0x7827,
    0x8B6E: 0x6775,
    0x8B6F: 0x9ECD,
    0x8B70: 0x5374,
    0x8B71: 0x5BA2,
    0x8B72: 0x811A,
    0x8B73: 0x8650,
    0x8B74: 0x9006,
    0x8B75: 0x4E18,
    0x8B76: 0x4E45,
    0x8B77: 0x4EC7,
    0x8B78: 0x4F11,
    0x8B79: 0x53CA,
    0x8B7A: 0x5438,
    0x8B7B: 0x5BAE,
    0x8B7C: 0x5F13,
    0x8B7D: 0x6025,
    0x8B7E: 0x6551,
    0x8B80: 0x673D,
    0x8B81: 0x6C42,
    0x8B82: 0x6C72,
    0x8B83: 0x6CE3,
    0x8B84: 0x7078,
    0x8B85: 0x7403,
    0x8B86: 0x7A76,
    0x8B87: 0x7AAE,
    0x8B88: 0x7B08,
    0x8B89: 0x7D1A,
    0x8B8A: 0x7CFE,
    0x8B8B: 0x7D66,
    0x8B8C: 0x65E7,
    0x8B8D: 0x725B,
    0x8B8E: 0x53BB,
    0x8B8F: 0x5C45,
    0x8B90: 0x5DE8,
    0x8B91: 0x62D2,
    0x8B92: 0x62E0,
    0x8B93: 0x6319,
    0x8B94: 0x6E20,
    0x8B95: 0x865A,
    0x8B96: 0x8A31,
    0x8B97: 0x8DDD,
    0x8B98: 0x92F8,
    0x8B99: 0x6F01,
    0x8B9A: 0x79A6,
    0x8B9B: 0x9B5A,
    0x8B9C: 0x4EA8,
    0x8B9D: 0x4EAB,
    0x8B9E: 0x4EAC,
    0x8B9F: 0x4F9B,
    0x8BA0: 0x4FA0,
    0x8BA1: 0x50D1,
    0x8BA2: 0x5147,
    0x8BA3: 0x7AF6,
    0x8BA4: 0x5171,
    0x8BA5: 0x51F6,
    0x8BA6: 0x5354,
    0x8BA7: 0x5321,
    0x8BA8: 0x537F,
    0x8BA9: 0x53EB,
    0x8BAA: 0x55AC,
    0x8BAB: 0x5883,
    0x8BAC: 0x5CE1,
    0x8BAD: 0x5F37,
    0x8BAE: 0x5F4A,
    0x8BAF: 0x602F,
    0x8BB0: 0x6050,
    0x8BB1: 0x606D,
    0x8BB2: 0x631F,
    0x8BB3: 0x6559,
    0x8BB4: 0x6A4B,
    0x8BB5: 0x6CC1,
    0x8BB6: 0x72C2,
    0x8BB7: 0x72ED,
    0x8BB8: 0x77EF,
    0x8BB9: 0x80F8,
    0x8BBA: 0x8105,
    0x8BBB: 0x8208,
    0x8BBC: 0x854E,
    0x8BBD: 0x90F7,
    0x8BBE: 0x93E1,
    0x8BBF: 0x97FF,
    0x8BC0: 0x9957,
    0x8BC1: 0x9A5A,
    0x8BC2: 0x4EF0,
    0x8BC3: 0x51DD,
    0x8BC4: 0x5C2D,
    0x8BC5: 0x6681,
    0x8BC6: 0x696D,
    0x8BC7: 0x5C40,
    0x8BC8: 0x66F2,
    0x8BC9: 0x6975,
    0x8BCA: 0x7389,
    0x8BCB: 0x6850,
    0x8BCC: 0x7C81,
    0x8BCD: 0x50C5,
    0x8BCE: 0x52E4,
    0x8BCF: 0x5747,
    0x8BD0: 0x5DFE,
    0x8BD1: 0x9326,
    0x8BD2: 0x65A4,
    0x8BD3: 0x6B23,
    0x8BD4: 0x6B3D,
    0x8BD5: 0x7434,
    0x8BD6: 0x7981,
    0x8BD7: 0x79BD,
    0x8BD8: 0x7B4B,
    0x8BD9: 0x7DCA,
    0x8BDA: 0x82B9,
    0x8BDB: 0x83CC,
    0x8BDC: 0x887F,
    0x8BDD: 0x895F,
    0x8BDE: 0x8B39,
    0x8BDF: 0x8FD1,
    0x8BE0: 0x91D1,
    0x8BE1: 0x541F,
    0x8BE2: 0x9280,
    0x8BE3: 0x4E5D,
    0x8BE4: 0x5036,
    0x8BE5: 0x53E5,
    0x8BE6: 0x533A,
    0x8BE7: 0x72D7,
    0x8BE8: 0x7396,
    0x8BE9: 0x77E9,
    0x8BEA: 0x82E6,
    0x8BEB: 0x8EAF,
    0x8BEC: 0x99C6,
    0x8BED: 0x99C8,
    0x8BEE: 0x99D2,
    0x8BEF: 0x5177,
    0x8BF0: 0x611A,
    0x8BF1: 0x865E,
    0x8BF2: 0x55B0,
    0x8BF3: 0x7A7A,
    0x8BF4: 0x5076,
    0x8BF5: 0x5BD3,
    0x8BF6: 0x9047,
    0x8BF7: 0x9685,
    0x8BF8: 0x4E32,
    0x8BF9: 0x6ADB,
    0x8BFA: 0x91E7,
    0x8BFB: 0x5C51,
    0x8BFC: 0x5C48,
    0x8C40: 0x6398,
    0x8C41: 0x7A9F,
    0x8C42: 0x6C93,
    0x8C43: 0x9774,
    0x8C44: 0x8F61,
    0x8C45: 0x7AAA,
    0x8C46: 0x718A,
    0x8C47: 0x9688,
    0x8C48: 0x7C82,
    0x8C49: 0x6817,
    0x8C4A: 0x7E70,
    0x8C4B: 0x6851,
    0x8C4C: 0x936C,
    0x8C4D: 0x52F2,
    0x8C4E: 0x541B,
    0x8C4F: 0x85AB,
    0x8C50: 0x8A13,
    0x8C51: 0x7FA4,
    0x8C52: 0x8ECD,
    0x8C53: 0x90E1,
    0x8C54: 0x5366,
    0x8C55: 0x8888,
    0x8C56: 0x7941,
    0x8C57: 0x4FC2,
    0x8C58: 0x50BE,
    0x8C59: 0x5211,
    0x8C5A: 0x5144,
    0x8C5B: 0x5553,
    0x8C5C: 0x572D,
    0x8C5D: 0x73EA,
    0x8C5E: 0x578B,
    0x8C5F: 0x5951,
    0x8C60: 0x5F62,
    0x8C61: 0x5F84,
    0x8C62: 0x6075,
    0x8C63: 0x6176,
    0x8C64: 0x6167,
    0x8C65: 0x61A9,
    0x8C66: 0x63B2,
    0x8C67: 0x643A,
    0x8C68: 0x656C,
    0x8C69: 0x666F,
    0x8C6A: 0x6842,
    0x8C6B: 0x6E13,
    0x8C6C: 0x7566,
    0x8C6D: 0x7A3D,
    0x8C6E: 0x7CFB,
    0x8C6F: 0x7D4C,
    0x8C70: 0x7D99,
    0x8C71: 0x7E4B,
    0x8C72: 0x7F6B,
    0x8C73: 0x830E,
    0x8C74: 0x834A,
    0x8C75: 0x86CD,
    0x8C76: 0x8A08,
    0x8C77: 0x8A63,
    0x8C78: 0x8B66,
    0x8C79: 0x8EFD,
    0x8C7A: 0x981A,
    0x8C7B: 0x9D8F,
    0x8C7C: 0x82B8,
    0x8C7D: 0x8FCE,
    0x8C7E: 0x9BE8,
    0x8C80: 0x5287,
    0x8C81: 0x621F,
    0x8C82: 0x6483,
    0x8C83: 0x6FC0,
    0x8C84: 0x9699,
    0x8C85: 0x6841,
    0x8C86: 0x5091,
    0x8C87: 0x6B20,
    0x8C88: 0x6C7A,
    0x8C89: 0x6F54,
    0x8C8A: 0x7A74,
    0x8C8B: 0x7D50,
    0x8C8C: 0x8840,
    0x8C8D: 0x8A23,
    0x8C8E: 0x6708,
    0x8C8F: 0x4EF6,
    0x8C90: 0x5039,
    0x8C91: 0x5026,
    0x8C92: 0x5065,
    0x8C93: 0x517C,
    0x8C94: 0x5238,
    0x8C95: 0x5263,
    0x8C96: 0x55A7,
    0x8C97: 0x570F,
    0x8C98: 0x5805,
    0x8C99: 0x5ACC,
    0x8C9A: 0x5EFA,
    0x8C9B: 0x61B2,
    0x8C9C: 0x61F8,
    0x8C9D: 0x62F3,
    0x8C9E: 0x6372,
    0x8C9F: 0x691C,
    0x8CA0: 0x6A29,
    0x8CA1: 0x727D,
    0x8CA2: 0x72AC,
    0x8CA3: 0x732E,
    0x8CA4: 0x7814,
    0x8CA5: 0x786F,
    0x8CA6: 0x7D79,
    0x8CA7: 0x770C,
    0x8CA8: 0x80A9,
    0x8CA9: 0x898B,
    0x8CAA: 0x8B19,
    0x8CAB: 0x8CE2,
    0x8CAC: 0x8ED2,
    0x8CAD: 0x9063,
    0x8CAE: 0x9375,
    0x8CAF: 0x967A,
    0x8CB0: 0x9855,
    0x8CB1: 0x9A13,
    0x8CB2: 0x9E78,
    0x8CB3: 0x5143,
    0x8CB4: 0x539F,
    0x8CB5: 0x53B3,
    0x8CB6: 0x5E7B,
    0x8CB7: 0x5F26,
    0x8CB8: 0x6E1B,
    0x8CB9: 0x6E90,
    0x8CBA: 0x7384,
    0x8CBB: 0x73FE,
    0x8CBC: 0x7D43,
    0x8CBD: 0x8237,
    0x8CBE: 0x8A00,
    0x8CBF: 0x8AFA,
    0x8CC0: 0x9650,
    0x8CC1: 0x4E4E,
    0x8CC2: 0x500B,
    0x8CC3: 0x53E4,
    0x8CC4: 0x547C,
    0x8CC5: 0x56FA,
    0x8CC6: 0x59D1,
    0x8CC7: 0x5B64,
    0x8CC8: 0x5DF1,
    0x8CC9: 0x5EAB,
    0x8CCA: 0x5F27,
    0x8CCB: 0x6238,
    0x8CCC: 0x6545,
    0x8CCD: 0x67AF,
    0x8CCE: 0x6E56,
    0x8CCF: 0x72D0,
    0x8CD0: 0x7CCA,
    0x8CD1: 0x88B4,
    0x8CD2: 0x80A1,
    0x8CD3: 0x80E1,
    0x8CD4: 0x83F0,
    0x8CD5: 0x864E,
    0x8CD6: 0x8A87,
    0x8CD7: 0x8DE8,
    0x8CD8: 0x9237,
    0x8CD9: 0x96C7,
    0x8CDA: 0x9867,
    0x8CDB: 0x9F13,
    0x8CDC: 0x4E94,
    0x8CDD: 0x4E92,
    0x8CDE: 0x4F0D,
    0x8CDF: 0x5348,
    0x8CE0: 0x5449,
    0x8CE1: 0x543E,
    0x8CE2: 0x5A2F,
    0x8CE3: 0x5F8C,
    0x8CE4: 0x5FA1,
    0x8CE5: 0x609F,
    0x8CE6: 0x68A7,
    0x8CE7: 0x6A8E,
    0x8CE8: 0x745A,
    0x8CE9: 0x7881,
    0x8CEA: 0x8A9E,
    0x8CEB: 0x8AA4,
    0x8CEC: 0x8B77,
    0x8CED: 0x9190,
    0x8CEE: 0x4E5E,
    0x8CEF: 0x9BC9,
    0x8CF0: 0x4EA4,
    0x8CF1: 0x4F7C,
    0x8CF2: 0x4FAF,
    0x8CF3: 0x5019,
    0x8CF4: 0x5016,
    0x8CF5: 0x5149,
    0x8CF6: 0x516C,
    0x8CF7: 0x529F,
    0x8CF8: 0x52B9,
    0x8CF9: 0x52FE,
    0x8CFA: 0x539A,
    0x8CFB: 0x53E3,
    0x8CFC: 0x5411,
    0x8D40: 0x540E,
    0x8D41: 0x5589,
    0x8D42: 0x5751,
    0x8D43: 0x57A2,
    0x8D44: 0x597D,
    0x8D45: 0x5B54,
    0x8D46: 0x5B5D,
    0x8D47: 0x5B8F,
    0x8D48: 0x5DE5,
    0x8D49: 0x5DE7,
    0x8D4A: 0x5DF7,
    0x8D4B: 0x5E78,
    0x8D4C: 0x5E83,
    0x8D4D: 0x5E9A,
    0x8D4E: 0x5EB7,
    0x8D4F: 0x5F18,
    0x8D50: 0x6052,
    0x8D51: 0x614C,
    0x8D52: 0x6297,
    0x8D53: 0x62D8,
    0x8D54: 0x63A7,
    0x8D55: 0x653B,
    0x8D56: 0x6602,
    0x8D57: 0x6643,
    0x8D58: 0x66F4,
    0x8D59: 0x676D,
    0x8D5A: 0x6821,
    0x8D5B: 0x6897,
    0x8D5C: 0x69CB,
    0x8D5D: 0x6C5F,
    0x8D5E: 0x6D2A,
    0x8D5F: 0x6D69,
    0x8D60: 0x6E2F,
    0x8D61: 0x6E9D,
    0x8D62: 0x7532,
    0x8D63: 0x7687,
    0x8D64: 0x786C,
    0x8D65: 0x7A3F,
    0x8D66: 0x7CE0,
    0x8D67: 0x7D05,
    0x8D68: 0x7D18,
    0x8D69: 0x7D5E,
    0x8D6A: 0x7DB1,
    0x8D6B: 0x8015,
    0x8D6C: 0x8003,
    0x8D6D: 0x80AF,
    0x8D6E: 0x80B1,
    0x8D6F: 0x8154,
    0x8D70: 0x818F,
    0x8D71: 0x822A,
    0x8D72: 0x8352,
    0x8D73: 0x884C,
    0x8D74: 0x8861,
    0x8D75: 0x8B1B,
    0x8D76: 0x8CA2,
    0x8D77: 0x8CFC,
    0x8D78: 0x90CA,
    0x8D79: 0x9175,
    0x8D7A: 0x9271,
    0x8D7B: 0x783F,
    0x8D7C: 0x92FC,
    0x8D7D: 0x95A4,
    0x8D7E: 0x964D,
    0x8D80: 0x9805,
    0x8D81: 0x9999,
    0x8D82: 0x9AD8,
    0x8D83: 0x9D3B,
    0x8D84: 0x525B,
    0x8D85: 0x52AB,
    0x8D86: 0x53F7,
    0x8D87: 0x5408,
    0x8D88: 0x58D5,
    0x8D89: 0x62F7,
    0x8D8A: 0x6FE0,
    0x8D8B: 0x8C6A,
    0x8D8C: 0x8F5F,
    0x8D8D: 0x9EB9,
    0x8D8E: 0x514B,
    0x8D8F: 0x523B,
    0x8D90: 0x544A,
    0x8D91: 0x56FD,
    0x8D92: 0x7A40,
    0x8D93: 0x9177,
    0x8D94: 0x9D60,
    0x8D95: 0x9ED2,
    0x8D96: 0x7344,
    0x8D97: 0x6F09,
    0x8D98: 0x8170,
    0x8D99: 0x7511,
    0x8D9A: 0x5FFD,
    0x8D9B: 0x60DA,
    0x8D9C: 0x9AA8,
    0x8D9D: 0x72DB,
    0x8D9E: 0x8FBC,
    0x8D9F: 0x6B64,
    0x8DA0: 0x9803,
    0x8DA1: 0x4ECA,
    0x8DA2: 0x56F0,
    0x8DA3: 0x5764,
    0x8DA4: 0x58BE,
    0x8DA5: 0x5A5A,
    0x8DA6: 0x6068,
    0x8DA7: 0x61C7,
    0x8DA8: 0x660F,
    0x8DA9: 0x6606,
    0x8DAA: 0x6839,
    0x8DAB: 0x68B1,
    0x8DAC: 0x6DF7,
    0x8DAD: 0x75D5,
    0x8DAE: 0x7D3A,
    0x8DAF: 0x826E,
    0x8DB0: 0x9B42,
    0x8DB1: 0x4E9B,
    0x8DB2: 0x4F50,
    0x8DB3: 0x53C9,
    0x8DB4: 0x5506,
    0x8DB5: 0x5D6F,
    0x8DB6: 0x5DE6,
    0x8DB7: 0x5DEE,
    0x8DB8: 0x67FB,
    0x8DB9: 0x6C99,
    0x8DBA: 0x7473,
    0x8DBB: 0x7802,
    0x8DBC: 0x8A50,
    0x8DBD: 0x9396,
    0x8DBE: 0x88DF,
    0x8DBF: 0x5750,
    0x8DC0: 0x5EA7,
    0x8DC1: 0x632B,
    0x8DC2: 0x50B5,
    0x8DC3: 0x50AC,
    0x8DC4: 0x518D,
    0x8DC5: 0x6700,
    0x8DC6: 0x54C9,
    0x8DC7: 0x585E,
    0x8DC8: 0x59BB,
    0x8DC9: 0x5BB0,
    0x8DCA: 0x5F69,
    0x8DCB: 0x624D,
    0x8DCC: 0x63A1,
    0x8DCD: 0x683D,
    0x8DCE: 0x6B73,
    0x8DCF: 0x6E08,
    0x8DD0: 0x707D,
    0x8DD1: 0x91C7,
    0x8DD2: 0x7280,
    0x8DD3: 0x7815,
    0x8DD4: 0x7826,
    0x8DD5: 0x796D,
    0x8DD6: 0x658E,
    0x8DD7: 0x7D30,
    0x8DD8: 0x83DC,
    0x8DD9: 0x88C1,
    0x8DDA: 0x8F09,
    0x8DDB: 0x969B,
    0x8DDC: 0x5264,
    0x8DDD: 0x5728,
    0x8DDE: 0x6750,
    0x8DDF: 0x7F6A,
    0x8DE0: 0x8CA1,
    0x8DE1: 0x51B4,
    0x8DE2: 0x5742,
    0x8DE3: 0x962A,
    0x8DE4: 0x583A,
    0x8DE5: 0x698A,
    0x8DE6: 0x80B4,
    0x8DE7: 0x54B2,
    0x8DE8: 0x5D0E,
    0x8DE9: 0x57FC,
    0x8DEA: 0x7895,
    0x8DEB: 0x9DFA,
    0x8DEC: 0x4F5C,
    0x8DED: 0x524A,
    0x8DEE: 0x548B,
    0x8DEF: 0x643E,
    0x8DF0: 0x6628,
    0x8DF1: 0x6714,
    0x8DF2: 0x67F5,
    0x8DF3: 0x7A84,
    0x8DF4: 0x7B56,
    0x8DF5: 0x7D22,
    0x8DF6: 0x932F,
    0x8DF7: 0x685C,
    0x8DF8: 0x9BAD,
    0x8DF9: 0x7B39,
    0x8DFA: 0x5319,
    0x8DFB: 0x518A,
    0x8DFC: 0x5237,
    0x8E40: 0x5BDF,
    0x8E41: 0x62F6,
    0x8E42: 0x64AE,
    0x8E43: 0x64E6,
    0x8E44: 0x672D,
    0x8E45: 0x6BBA,
    0x8E46: 0x85A9,
    0x8E47: 0x96D1,
    0x8E48: 0x7690,
    0x8E49: 0x9BD6,
    0x8E4A: 0x634C,
    0x8E4B: 0x9306,
    0x8E4C: 0x9BAB,
    0x8E4D: 0x76BF,
    0x8E4E: 0x6652,
    0x8E4F: 0x4E09,
    0x8E50: 0x5098,
    0x8E51: 0x53C2,
    0x8E52: 0x5C71,
    0x8E53: 0x60E8,
    0x8E54: 0x6492,
    0x8E55: 0x6563,
    0x8E56: 0x685F,
    0x8E57: 0x71E6,
    0x8E58: 0x73CA,
    0x8E59: 0x7523,
    0x8E5A: 0x7B97,
    0x8E5B: 0x7E82,
    0x8E5C: 0x8695,
    0x8E5D: 0x8B83,
    0x8E5E: 0x8CDB,
    0x8E5F: 0x9178,
    0x8E60: 0x9910,
    0x8E61: 0x65AC,
    0x8E62: 0x66AB,
    0x8E63: 0x6B8B,
    0x8E64: 0x4ED5,
    0x8E65: 0x4ED4,
    0x8E66: 0x4F3A,
    0x8E67: 0x4F7F,
    0x8E68: 0x523A,
    0x8E69: 0x53F8,
    0x8E6A: 0x53F2,
    0x8E6B: 0x55E3,
    0x8E6C: 0x56DB,
    0x8E6D: 0x58EB,
    0x8E6E: 0x59CB,
    0x8E6F: 0x59C9,
    0x8E70: 0x59FF,
    0x8E71: 0x5B50,
    0x8E72: 0x5C4D,
    0x8E73: 0x5E02,
    0x8E74: 0x5E2B,
    0x8E75: 0x5FD7,
    0x8E76: 0x601D,
    0x8E77: 0x6307,
    0x8E78: 0x652F,
    0x8E79: 0x5B5C,
    0x8E7A: 0x65AF,
    0x8E7B: 0x65BD,
    0x8E7C: 0x65E8,
    0x8E7D: 0x679D,
    0x8E7E: 0x6B62,
    0x8E80: 0x6B7B,
    0x8E81: 0x6C0F,
    0x8E82: 0x7345,
    0x8E83: 0x7949,
    0x8E84: 0x79C1,
    0x8E85: 0x7CF8,
    0x8E86: 0x7D19,
    0x8E87: 0x7D2B,
    0x8E88: 0x80A2,
    0x8E89: 0x8102,
    0x8E8A: 0x81F3,
    0x8E8B: 0x8996,
    0x8E8C: 0x8A5E,
    0x8E8D: 0x8A69,
    0x8E8E: 0x8A66,
    0x8E8F: 0x8A8C,
    0x8E90: 0x8AEE,
    0x8E91: 0x8CC7,
    0x8E92: 0x8CDC,
    0x8E93: 0x96CC,
    0x8E94: 0x98FC,
    0x8E95: 0x6B6F,
    0x8E96: 0x4E8B,
    0x8E97: 0x4F3C,
    0x8E98: 0x4F8D,
    0x8E99: 0x5150,
    0x8E9A: 0x5B57,
    0x8E9B: 0x5BFA,
    0x8E9C: 0x6148,
    0x8E9D: 0x6301,
    0x8E9E: 0x6642,
    0x8E9F: 0x6B21,
    0x8EA0: 0x6ECB,
    0x8EA1: 0x6CBB,
    0x8EA2: 0x723E,
    0x8EA3: 0x74BD,
    0x8EA4: 0x75D4,
    0x8EA5: 0x78C1,
    0x8EA6: 0x793A,
    0x8EA7: 0x800C,
    0x8EA8: 0x8033,
    0x8EA9: 0x81EA,
    0x8EAA: 0x8494,
    0x8EAB: 0x8F9E,
    0x8EAC: 0x6C50,
    0x8EAD: 0x9E7F,
    0x8EAE: 0x5F0F,
    0x8EAF: 0x8B58,
    0x8EB0: 0x9D2B,
    0x8EB1: 0x7AFA,
    0x8EB2: 0x8EF8,
    0x8EB3: 0x5B8D,
    0x8EB4: 0x96EB,
    0x8EB5: 0x4E03,
    0x8EB6: 0x53F1,
    0x8EB7: 0x57F7,
    0x8EB8: 0x5931,
    0x8EB9: 0x5AC9,
    0x8EBA: 0x5BA4,
    0x8EBB: 0x6089,
    0x8EBC: 0x6E7F,
    0x8EBD: 0x6F06,
    0x8EBE: 0x75BE,
    0x8EBF: 0x8CEA,
    0x8EC0: 0x5B9F,
    0x8EC1: 0x8500,
    0x8EC2: 0x7BE0,
    0x8EC3: 0x5072,
    0x8EC4: 0x67F4,
    0x8EC5: 0x829D,
    0x8EC6: 0x5C61,
    0x8EC7: 0x854A,
    0x8EC8: 0x7E1E,
    0x8EC9: 0x820E,
    0x8ECA: 0x5199,
    0x8ECB: 0x5C04,
    0x8ECC: 0x6368,
    0x8ECD: 0x8D66,
    0x8ECE: 0x659C,
    0x8ECF: 0x716E,
    0x8ED0: 0x793E,
    0x8ED1: 0x7D17,
    0x8ED2: 0x8005,
    0x8ED3: 0x8B1D,
    0x8ED4: 0x8ECA,
    0x8ED5: 0x906E,
    0x8ED6: 0x86C7,
    0x8ED7: 0x90AA,
    0x8ED8: 0x501F,
    0x8ED9: 0x52FA,
    0x8EDA: 0x5C3A,
    0x8EDB: 0x6753,
    0x8EDC: 0x707C,
    0x8EDD: 0x7235,
    0x8EDE: 0x914C,
    0x8EDF: 0x91C8,
    0x8EE0: 0x932B,
    0x8EE1: 0x82E5,
    0x8EE2: 0x5BC2,
    0x8EE3: 0x5F31,
    0x8EE4: 0x60F9,
    0x8EE5: 0x4E3B,
    0x8EE6: 0x53D6,
    0x8EE7: 0x5B88,
    0x8EE8: 0x624B,
    0x8EE9: 0x6731,
    0x8EEA: 0x6B8A,
    0x8EEB: 0x72E9,
    0x8EEC: 0x73E0,
    0x8EED: 0x7A2E,
    0x8EEE: 0x816B,
    0x8EEF: 0x8DA3,
    0x8EF0: 0x9152,
    0x8EF1: 0x9996,
    0x8EF2: 0x5112,
    0x8EF3: 0x53D7,
    0x8EF4: 0x546A,
    0x8EF5: 0x5BFF,
    0x8EF6: 0x6388,
    0x8EF7: 0x6A39,
    0x8EF8: 0x7DAC,
    0x8EF9: 0x9700,
    0x8EFA: 0x56DA,
    0x8EFB: 0x53CE,
    0x8EFC: 0x5468,
    0x8F40: 0x5B97,
    0x8F41: 0x5C31,
    0x8F42: 0x5DDE,
    0x8F43: 0x4FEE,
    0x8F44: 0x6101,
    0x8F45: 0x62FE,
    0x8F46: 0x6D32,
    0x8F47: 0x79C0,
    0x8F48: 0x79CB,
    0x8F49: 0x7D42,
    0x8F4A: 0x7E4D,
    0x8F4B: 0x7FD2,
    0x8F4C: 0x81ED,
    0x8F4D: 0x821F,
    0x8F4E: 0x8490,
    0x8F4F: 0x8846,
    0x8F50: 0x8972,
    0x8F51: 0x8B90,
    0x8F52: 0x8E74,
    0x8F53: 0x8F2F,
    0x8F54: 0x9031,
    0x8F55: 0x914B,
    0x8F56: 0x916C,
    0x8F57: 0x96C6,
    0x8F58: 0x919C,
    0x8F59: 0x4EC0,
    0x8F5A: 0x4F4F,
    0x8F5B: 0x5145,
    0x8F5C: 0x5341,
    0x8F5D: 0x5F93,
    0x8F5E: 0x620E,
    0x8F5F: 0x67D4,
    0x8F60: 0x6C41,
    0x8F61: 0x6E0B,
    0x8F62: 0x7363,
    0x8F63: 0x7E26,
    0x8F64: 0x91CD,
    0x8F65: 0x9283,
    0x8F66: 0x53D4,
    0x8F67: 0x5919,
    0x8F68: 0x5BBF,
    0x8F69: 0x6DD1,
    0x8F6A: 0x795D,
    0x8F6B: 0x7E2E,
    0x8F6C: 0x7C9B,
    0x8F6D: 0x587E,
    0x8F6E: 0x719F,
    0x8F6F: 0x51FA,
    0x8F70: 0x8853,
    0x8F71: 0x8FF0,
    0x8F72: 0x4FCA,
    0x8F73: 0x5CFB,
    0x8F74: 0x6625,
    0x8F75: 0x77AC,
    0x8F76: 0x7AE3,
    0x8F77: 0x821C,
    0x8F78: 0x99FF,
    0x8F79: 0x51C6,
    0x8F7A: 0x5FAA,
    0x8F7B: 0x65EC,
    0x8F7C: 0x696F,
    0x8F7D: 0x6B89,
    0x8F7E: 0x6DF3,
    0x8F80: 0x6E96,
    0x8F81: 0x6F64,
    0x8F82: 0x76FE,
    0x8F83: 0x7D14,
    0x8F84: 0x5DE1,
    0x8F85: 0x9075,
    0x8F86: 0x9187,
    0x8F87: 0x9806,
    0x8F88: 0x51E6,
    0x8F89: 0x521D,
    0x8F8A: 0x6240,
    0x8F8B: 0x6691,
    0x8F8C: 0x66D9,
    0x8F8D: 0x6E1A,
    0x8F8E: 0x5EB6,
    0x8F8F: 0x7DD2,
    0x8F90: 0x7F72,
    0x8F91: 0x66F8,
    0x8F92: 0x85AF,
    0x8F93: 0x85F7,
    0x8F94: 0x8AF8,
    0x8F95: 0x52A9,
    0x8F96: 0x53D9,
    0x8F97: 0x5973,
    0x8F98: 0x5E8F,
    0x8F99: 0x5F90,
    0x8F9A: 0x6055,
    0x8F9B: 0x92E4,
    0x8F9C: 0x9664,
    0x8F9D: 0x50B7,
    0x8F9E: 0x511F,
    0x8F9F: 0x52DD,
    0x8FA0: 0x5320,
    0x8FA1: 0x5347,
    0x8FA2: 0x53EC,
    0x8FA3: 0x54E8,
    0x8FA4: 0x5546,
    0x8FA5: 0x5531,
    0x8FA6: 0x5617,
    0x8FA7: 0x5968,
    0x8FA8: 0x59BE,
    0x8FA9: 0x5A3C,
    0x8FAA: 0x5BB5,
    0x8FAB: 0x5C06,
    0x8FAC: 0x5C0F,
    0x8FAD: 0x5C11,
    0x8FAE: 0x5C1A,
    0x8FAF: 0x5E84,
    0x8FB0: 0x5E8A,
    0x8FB1: 0x5EE0,
    0x8FB2: 0x5F70,
    0x8FB3: 0x627F,
    0x8FB4: 0x6284,
    0x8FB5: 0x62DB,
    0x8FB6: 0x638C,
    0x8FB7: 0x6377,
    0x8FB8: 0x6607,
    0x8FB9: 0x660C,
    0x8FBA: 0x662D,
    0x8FBB: 0x6676,
    0x8FBC: 0x677E,
    0x8FBD: 0x68A2,
    0x8FBE: 0x6A1F,
    0x8FBF: 0x6A35,
    0x8FC0: 0x6CBC,
    0x8FC1: 0x6D88,
    0x8FC2: 0x6E09,
    0x8FC3: 0x6E58,
    0x8FC4: 0x713C,
    0x8FC5: 0x7126,
    0x8FC6: 0x7167,
    0x8FC7: 0x75C7,
    0x8FC8: 0x7701,
    0x8FC9: 0x785D,
    0x8FCA: 0x7901,
    0x8FCB: 0x7965,
    0x8FCC: 0x79F0,
    0x8FCD: 0x7AE0,
    0x8FCE: 0x7B11,
    0x8FCF: 0x7CA7,
    0x8FD0: 0x7D39,
    0x8FD1: 0x8096,
    0x8FD2: 0x83D6,
    0x8FD3: 0x848B,
    0x8FD4: 0x8549,
    0x8FD5: 0x885D,
    0x8FD6: 0x88F3,
    0x8FD7: 0x8A1F,
    0x8FD8: 0x8A3C,
    0x8FD9: 0x8A54,
    0x8FDA: 0x8A73,
    0x8FDB: 0x8C61,
    0x8FDC: 0x8CDE,
    0x8FDD: 0x91A4,
    0x8FDE: 0x9266,
    0x8FDF: 0x937E,
    0x8FE0: 0x9418,
    0x8FE1: 0x969C,
    0x8FE2: 0x9798,
    0x8FE3: 0x4E0A,
    0x8FE4: 0x4E08,
    0x8FE5: 0x4E1E,
    0x8FE6: 0x4E57,
    0x8FE7: 0x5197,
    0x8FE8: 0x5270,
    0x8FE9: 0x57CE,
    0x8FEA: 0x5834,
    0x8FEB: 0x58CC,
    0x8FEC: 0x5B22,
    0x8FED: 0x5E38,
    0x8FEE: 0x60C5,
    0x8FEF: 0x64FE,
    0x8FF0: 0x6761,
    0x8FF1: 0x6756,
    0x8FF2: 0x6D44,
    0x8FF3: 0x72B6,
    0x8FF4: 0x7573,
    0x8FF5: 0x7A63,
    0x8FF6: 0x84B8,
    0x8FF7: 0x8B72,
    0x8FF8: 0x91B8,
    0x8FF9: 0x9320,
    0x8FFA: 0x5631,
    0x8FFB: 0x57F4,
    0x8FFC: 0x98FE,
    0x9040: 0x62ED,
    0x9041: 0x690D,
    0x9042: 0x6B96,
    0x9043: 0x71ED,
    0x9044: 0x7E54,
    0x9045: 0x8077,
    0x9046: 0x8272,
    0x9047: 0x89E6,
    0x9048: 0x98DF,
    0x9049: 0x8755,
    0x904A: 0x8FB1,
    0x904B: 0x5C3B,
    0x904C: 0x4F38,
    0x904D: 0x4FE1,
    0x904E: 0x4FB5,
    0x904F: 0x5507,
    0x9050: 0x5A20,
    0x9051: 0x5BDD,
    0x9052: 0x5BE9,
    0x9053: 0x5FC3,
    0x9054: 0x614E,
    0x9055: 0x632F,
    0x9056: 0x65B0,
    0x9057: 0x664B,
    0x9058: 0x68EE,
    0x9059: 0x699B,
    0x905A: 0x6D78,
    0x905B: 0x6DF1,
    0x905C: 0x7533,
    0x905D: 0x75B9,
    0x905E: 0x771F,
    0x905F: 0x795E,
    0x9060: 0x79E6,
    0x9061: 0x7D33,
    0x9062: 0x81E3,
    0x9063: 0x82AF,
    0x9064: 0x85AA,
    0x9065: 0x89AA,
    0x9066: 0x8A3A,
    0x9067: 0x8EAB,
    0x9068: 0x8F9B,
    0x9069: 0x9032,
    0x906A: 0x91DD,
    0x906B: 0x9707,
    0x906C: 0x4EBA,
    0x906D: 0x4EC1,
    0x906E: 0x5203,
    0x906F: 0x5875,
    0x9070: 0x58EC,
    0x9071: 0x5C0B,
    0x9072: 0x751A,
    0x9073: 0x5C3D,
    0x9074: 0x814E,
    0x9075: 0x8A0A,
    0x9076: 0x8FC5,
    0x9077: 0x9663,
    0x9078: 0x976D,
    0x9079: 0x7B25,
    0x907A: 0x8ACF,
    0x907B: 0x9808,
    0x907C: 0x9162,
    0x907D: 0x56F3,
    0x907E: 0x53A8,
    0x9080: 0x9017,
    0x9081: 0x5439,
    0x9082: 0x5782,
    0x9083: 0x5E25,
    0x9084: 0x63A8,
    0x9085: 0x6C34,
    0x9086: 0x708A,
    0x9087: 0x7761,
    0x9088: 0x7C8B,
    0x9089: 0x7FE0,
    0x908A: 0x8870,
    0x908B: 0x9042,
    0x908C: 0x9154,
    0x908D: 0x9310,
    0x908E: 0x9318,
    0x908F: 0x968F,
    0x9090: 0x745E,
    0x9091: 0x9AC4,
    0x9092: 0x5D07,
    0x9093: 0x5D69,
    0x9094: 0x6570,
    0x9095: 0x67A2,
    0x9096: 0x8DA8,
    0x9097: 0x96DB,
    0x9098: 0x636E,
    0x9099: 0x6749,
    0x909A: 0x6919,
    0x909B: 0x83C5,
    0x909C: 0x9817,
    0x909D: 0x96C0,
    0x909E: 0x88FE,
    0x909F: 0x6F84,
    0x90A0: 0x647A,
    0x90A1: 0x5BF8,
    0x90A2: 0x4E16,
    0x90A3: 0x702C,
    0x90A4: 0x755D,
    0x90A5: 0x662F,
    0x90A6: 0x51C4,
    0x90A7: 0x5236,
    0x90A8: 0x52E2,
    0x90A9: 0x59D3,
    0x90AA: 0x5F81,
    0x90AB: 0x6027,
    0x90AC: 0x6210,
    0x90AD: 0x653F,
    0x90AE: 0x6574,
    0x90AF: 0x661F,
    0x90B0: 0x6674,
    0x90B1: 0x68F2,
    0x90B2: 0x6816,
    0x90B3: 0x6B63,
    0x90B4: 0x6E05,
    0x90B5: 0x7272,
    0x90B6: 0x751F,
    0x90B7: 0x76DB,
    0x90B8: 0x7CBE,
    0x90B9: 0x8056,
    0x90BA: 0x58F0,
    0x90BB: 0x88FD,
    0x90BC: 0x897F,
    0x90BD: 0x8AA0,
    0x90BE: 0x8A93,
    0x90BF: 0x8ACB,
    0x90C0: 0x901D,
    0x90C1: 0x9192,
    0x90C2: 0x9752,
    0x90C3: 0x9759,
    0x90C4: 0x6589,
    0x90C5: 0x7A0E,
    0x90C6: 0x8106,
    0x90C7: 0x96BB,
    0x90C8: 0x5E2D,
    0x90C9: 0x60DC,
    0x90CA: 0x621A,
    0x90CB: 0x65A5,
    0x90CC: 0x6614,
    0x90CD: 0x6790,
    0x90CE: 0x77F3,
    0x90CF: 0x7A4D,
    0x90D0: 0x7C4D,
    0x90D1: 0x7E3E,
    0x90D2: 0x810A,
    0x90D3: 0x8CAC,
    0x90D4: 0x8D64,
    0x90D5: 0x8DE1,
    0x90D6: 0x8E5F,
    0x90D7: 0x78A9,
    0x90D8: 0x5207,
    0x90D9: 0x62D9,
    0x90DA: 0x63A5,
    0x90DB: 0x6442,
    0x90DC: 0x6298,
    0x90DD: 0x8A2D,
    0x90DE: 0x7A83,
    0x90DF: 0x7BC0,
    0x90E0: 0x8AAC,
    0x90E1: 0x96EA,
    0x90E2: 0x7D76,
    0x90E3: 0x820C,
    0x90E4: 0x8749,
    0x90E5: 0x4ED9,
    0x90E6: 0x5148,
    0x90E7: 0x5343,
    0x90E8: 0x5360,
    0x90E9: 0x5BA3,
    0x90EA: 0x5C02,
    0x90EB: 0x5C16,
    0x90EC: 0x5DDD,
    0x90ED: 0x6226,
    0x90EE: 0x6247,
    0x90EF: 0x64B0,
    0x90F0: 0x6813,
    0x90F1: 0x6834,
    0x90F2: 0x6CC9,
    0x90F3: 0x6D45,
    0x90F4: 0x6D17,
    0x90F5: 0x67D3,
    0x90F6: 0x6F5C,
    0x90F7: 0x714E,
    0x90F8: 0x717D,
    0x90F9: 0x65CB,
    0x90FA: 0x7A7F,
    0x90FB: 0x7BAD,
    0x90FC: 0x7DDA,
    0x9140: 0x7E4A,
    0x9141: 0x7FA8,
    0x9142: 0x817A,
    0x9143: 0x821B,
    0x9144: 0x8239,
    0x9145: 0x85A6,
    0x9146: 0x8A6E,
    0x9147: 0x8CCE,
    0x9148: 0x8DF5,
    0x9149: 0x9078,
    0x914A: 0x9077,
    0x914B: 0x92AD,
    0x914C: 0x9291,
    0x914D: 0x9583,
    0x914E: 0x9BAE,
    0x914F: 0x524D,
    0x9150: 0x5584,
    0x9151: 0x6F38,
    0x9152: 0x7136,
    0x9153: 0x5168,
    0x9154: 0x7985,
    0x9155: 0x7E55,
    0x9156: 0x81B3,
    0x9157: 0x7CCE,
    0x9158: 0x564C,
    0x9159: 0x5851,
    0x915A: 0x5CA8,
    0x915B: 0x63AA,
    0x915C: 0x66FE,
    0x915D: 0x66FD,
    0x915E: 0x695A,
    0x915F: 0x72D9,
    0x9160: 0x758F,
    0x9161: 0x758E,
    0x9162: 0x790E,
    0x9163: 0x7956,
    0x9164: 0x79DF,
    0x9165: 0x7C97,
    0x9166: 0x7D20,
    0x9167: 0x7D44,
    0x9168: 0x8607,
    0x9169: 0x8A34,
    0x916A: 0x963B,
    0x916B: 0x9061,
    0x916C: 0x9F20,
    0x916D: 0x50E7,
    0x916E: 0x5275,
    0x916F: 0x53CC,
    0x9170: 0x53E2,
    0x9171: 0x5009,
    0x9172: 0x55AA,
    0x9173: 0x58EE,
    0x9174: 0x594F,
    0x9175: 0x723D,
    0x9176: 0x5B8B,
    0x9177: 0x5C64,
    0x9178: 0x531D,
    0x9179: 0x60E3,
    0x917A: 0x60F3,
    0x917B: 0x635C,
    0x917C: 0x6383,
    0x917D: 0x633F,
    0x917E: 0x63BB,
    0x9180: 0x64CD,
    0x9181: 0x65E9,
    0x9182: 0x66F9,
    0x9183: 0x5DE3,
    0x9184: 0x69CD,
    0x9185: 0x69FD,
    0x9186: 0x6F15,
    0x9187: 0x71E5,
    0x9188: 0x4E89,
    0x9189: 0x75E9,
    0x918A: 0x76F8,
    0x918B: 0x7A93,
    0x918C: 0x7CDF,
    0x918D: 0x7DCF,
    0x918E: 0x7D9C,
    0x918F: 0x8061,
    0x9190: 0x8349,
    0x9191: 0x8358,
    0x9192: 0x846C,
    0x9193: 0x84BC,
    0x9194: 0x85FB,
    0x9195: 0x88C5,
    0x9196: 0x8D70,
    0x9197: 0x9001,
    0x9198: 0x906D,
    0x9199: 0x9397,
    0x919A: 0x971C,
    0x919B: 0x9A12,
    0x919C: 0x50CF,
    0x919D: 0x5897,
    0x919E: 0x618E,
    0x919F: 0x81D3,
    0x91A0: 0x8535,
    0x91A1: 0x8D08,
    0x91A2: 0x9020,
    0x91A3: 0x4FC3,
    0x91A4: 0x5074,
    0x91A5: 0x5247,
    0x91A6: 0x5373,
    0x91A7: 0x606F,
    0x91A8: 0x6349,
    0x91A9: 0x675F,
    0x91AA: 0x6E2C,
    0x91AB: 0x8DB3,
    0x91AC: 0x901F,
    0x91AD: 0x4FD7,
    0x91AE: 0x5C5E,
    0x91AF: 0x8CCA,
    0x91B0: 0x65CF,
    0x91B1: 0x7D9A,
    0x91B2: 0x5352,
    0x91B3: 0x8896,
    0x91B4: 0x5176,
    0x91B5: 0x63C3,
    0x91B6: 0x5B58,
    0x91B7: 0x5B6B,
    0x91B8: 0x5C0A,
    0x91B9: 0x640D,
    0x91BA: 0x6751,
    0x91BB: 0x905C,
    0x91BC: 0x4ED6,
    0x91BD: 0x591A,
    0x91BE: 0x592A,
    0x91BF: 0x6C70,
    0x91C0: 0x8A51,
    0x91C1: 0x553E,
    0x91C2: 0x5815,
    0x91C3: 0x59A5,
    0x91C4: 0x60F0,
    0x91C5: 0x6253,
    0x91C6: 0x67C1,
    0x91C7: 0x8235,
    0x91C8: 0x6955,
    0x91C9: 0x9640,
    0x91CA: 0x99C4,
    0x91CB: 0x9A28,
    0x91CC: 0x4F53,
    0x91CD: 0x5806,
    0x91CE: 0x5BFE,
    0x91CF: 0x8010,
    0x91D0: 0x5CB1,
    0x91D1: 0x5E2F,
    0x91D2: 0x5F85,
    0x91D3: 0x6020,
    0x91D4: 0x614B,
    0x91D5: 0x6234,
    0x91D6: 0x66FF,
    0x91D7: 0x6CF0,
    0x91D8: 0x6EDE,
    0x91D9: 0x80CE,
    0x91DA: 0x817F,
    0x91DB: 0x82D4,
    0x91DC: 0x888B,
    0x91DD: 0x8CB8,
    0x91DE: 0x9000,
    0x91DF: 0x902E,
    0x91E0: 0x968A,
    0x91E1: 0x9EDB,
    0x91E2: 0x9BDB,
    0x91E3: 0x4EE3,
    0x91E4: 0x53F0,
    0x91E5: 0x5927,
    0x91E6: 0x7B2C,
    0x91E7: 0x918D,
    0x91E8: 0x984C,
    0x91E9: 0x9DF9,
    0x91EA: 0x6EDD,
    0x91EB: 0x7027,
    0x91EC: 0x5353,
    0x91ED: 0x5544,
    0x91EE: 0x5B85,
    0x91EF: 0x6258,
    0x91F0: 0x629E,
    0x91F1: 0x62D3,
    0x91F2: 0x6CA2,
    0x91F3: 0x6FEF,
    0x91F4: 0x7422,
    0x91F5: 0x8A17,
    0x91F6: 0x9438,
    0x91F7: 0x6FC1,
    0x91F8: 0x8AFE,
    0x91F9: 0x8338,
    0x91FA: 0x51E7,
    0x91FB: 0x86F8,
    0x91FC: 0x53EA,
    0x9240: 0x53E9,
    0x9241: 0x4F46,
    0x9242: 0x9054,
    0x9243: 0x8FB0,
    0x9244: 0x596A,
    0x9245: 0x8131,
    0x9246: 0x5DFD,
    0x9247: 0x7AEA,
    0x9248: 0x8FBF,
    0x9249: 0x68DA,
    0x924A: 0x8C37,
    0x924B: 0x72F8,
    0x924C: 0x9C48,
    0x924D: 0x6A3D,
    0x924E: 0x8AB0,
    0x924F: 0x4E39,
    0x9250: 0x5358,
    0x9251: 0x5606,
    0x9252: 0x5766,
    0x9253: 0x62C5,
    0x9254: 0x63A2,
    0x9255: 0x65E6,
    0x9256: 0x6B4E,
    0x9257: 0x6DE1,
    0x9258: 0x6E5B,
    0x9259: 0x70AD,
    0x925A: 0x77ED,
    0x925B: 0x7AEF,
    0x925C: 0x7BAA,
    0x925D: 0x7DBB,
    0x925E: 0x803D,
    0x925F: 0x80C6,
    0x9260: 0x86CB,
    0x9261: 0x8A95,
    0x9262: 0x935B,
    0x9263: 0x56E3,
    0x9264: 0x58C7,
    0x9265: 0x5F3E,
    0x9266: 0x65AD,
    0x9267: 0x6696,
    0x9268: 0x6A80,
    0x9269: 0x6BB5,
    0x926A: 0x7537,
    0x926B: 0x8AC7,
    0x926C: 0x5024,
    0x926D: 0x77E5,
    0x926E: 0x5730,
    0x926F: 0x5F1B,
    0x9270: 0x6065,
    0x9271: 0x667A,
    0x9272: 0x6C60,
    0x9273: 0x75F4,
    0x9274: 0x7A1A,
    0x9275: 0x7F6E,
    0x9276: 0x81F4,
    0x9277: 0x8718,
    0x9278: 0x9045,
    0x9279: 0x99B3,
    0x927A: 0x7BC9,
    0x927B: 0x755C,
    0x927C: 0x7AF9,
    0x927D: 0x7B51,
    0x927E: 0x84C4,
    0x9280: 0x9010,
    0x9281: 0x79E9,
    0x9282: 0x7A92,
    0x9283: 0x8336,
    0x9284: 0x5AE1,
    0x9285: 0x7740,
    0x9286: 0x4E2D,
    0x9287: 0x4EF2,
    0x9288: 0x5B99,
    0x9289: 0x5FE0,
    0x928A: 0x62BD,
    0x928B: 0x663C,
    0x928C: 0x67F1,
    0x928D: 0x6CE8,
    0x928E: 0x866B,
    0x928F: 0x8877,
    0x9290: 0x8A3B,
    0x9291: 0x914E,
    0x9292: 0x92F3,
    0x9293: 0x99D0,
    0x9294: 0x6A17,
    0x9295: 0x7026,
    0x9296: 0x732A,
    0x9297: 0x82E7,
    0x9298: 0x8457,
    0x9299: 0x8CAF,
    0x929A: 0x4E01,
    0x929B: 0x5146,
    0x929C: 0x51CB,
    0x929D: 0x558B,
    0x929E: 0x5BF5,
    0x929F: 0x5E16,
    0x92A0: 0x5E33,
    0x92A1: 0x5E81,
    0x92A2: 0x5F14,
    0x92A3: 0x5F35,
    0x92A4: 0x5F6B,
    0x92A5: 0x5FB4,
    0x92A6: 0x61F2,
    0x92A7: 0x6311,
    0x92A8: 0x66A2,
    0x92A9: 0x671D,
    0x92AA: 0x6F6E,
    0x92AB: 0x7252,
    0x92AC: 0x753A,
    0x92AD: 0x773A,
    0x92AE: 0x8074,
    0x92AF: 0x8139,
    0x92B0: 0x8178,
    0x92B1: 0x8776,
    0x92B2: 0x8ABF,
    0x92B3: 0x8ADC,
    0x92B4: 0x8D85,
    0x92B5: 0x8DF3,
    0x92B6: 0x929A,
    0x92B7: 0x9577,
    0x92B8: 0x9802,
    0x92B9: 0x9CE5,
    0x92BA: 0x52C5,
    0x92BB: 0x6357,
    0x92BC: 0x76F4,
    0x92BD: 0x6715,
    0x92BE: 0x6C88,
    0x92BF: 0x73CD,
    0x92C0: 0x8CC3,
    0x92C1: 0x93AE,
    0x92C2: 0x9673,
    0x92C3: 0x6D25,
    0x92C4: 0x589C,
    0x92C5: 0x690E,
    0x92C6: 0x69CC,
    0x92C7: 0x8FFD,
    0x92C8: 0x939A,
    0x92C9: 0x75DB,
    0x92CA: 0x901A,
    0x92CB: 0x585A,
    0x92CC: 0x6802,
    0x92CD: 0x63B4,
    0x92CE: 0x69FB,
    0x92CF: 0x4F43,
    0x92D0: 0x6F2C,
    0x92D1: 0x67D8,
    0x92D2: 0x8FBB,
    0x92D3: 0x8526,
    0x92D4: 0x7DB4,
    0x92D5: 0x9354,
    0x92D6: 0x693F,
    0x92D7: 0x6F70,
    0x92D8: 0x576A,
    0x92D9: 0x58F7,
    0x92DA: 0x5B2C,
    0x92DB: 0x7D2C,
    0x92DC: 0x722A,
    0x92DD: 0x540A,
    0x92DE: 0x91E3,
    0x92DF: 0x9DB4,
    0x92E0: 0x4EAD,
    0x92E1: 0x4F4E,
    0x92E2: 0x505C,
    0x92E3: 0x5075,
    0x92E4: 0x5243,
    0x92E5: 0x8C9E,
    0x92E6: 0x5448,
    0x92E7: 0x5824,
    0x92E8: 0x5B9A,
    0x92E9: 0x5E1D,
    0x92EA: 0x5E95,
    0x92EB: 0x5EAD,
    0x92EC: 0x5EF7,
    0x92ED: 0x5F1F,
    0x92EE: 0x608C,
    0x92EF: 0x62B5,
    0x92F0: 0x633A,
    0x92F1: 0x63D0,
    0x92F2: 0x68AF,
    0x92F3: 0x6C40,
    0x92F4: 0x7887,
    0x92F5: 0x798E,
    0x92F6: 0x7A0B,
    0x92F7: 0x7DE0,
    0x92F8: 0x8247,
    0x92F9: 0x8A02,
    0x92FA: 0x8AE6,
    0x92FB: 0x8E44,
    0x92FC: 0x9013,
    0x9340: 0x90B8,
    0x9341: 0x912D,
    0x9342: 0x91D8,
    0x9343: 0x9F0E,
    0x9344: 0x6CE5,
    0x9345: 0x6458,
    0x9346: 0x64E2,
    0x9347: 0x6575,
    0x9348: 0x6EF4,
    0x9349: 0x7684,
    0x934A: 0x7B1B,
    0x934B: 0x9069,
    0x934C: 0x93D1,
    0x934D: 0x6EBA,
    0x934E: 0x54F2,
    0x934F: 0x5FB9,
    0x9350: 0x64A4,
    0x9351: 0x8F4D,
    0x9352: 0x8FED,
    0x9353: 0x9244,
    0x9354: 0x5178,
    0x9355: 0x586B,
    0x9356: 0x5929,
    0x9357: 0x5C55,
    0x9358: 0x5E97,
    0x9359: 0x6DFB,
    0x935A: 0x7E8F,
    0x935B: 0x751C,
    0x935C: 0x8CBC,
    0x935D: 0x8EE2,
    0x935E: 0x985B,
    0x935F: 0x70B9,
    0x9360: 0x4F1D,
    0x9361: 0x6BBF,
    0x9362: 0x6FB1,
    0x9363: 0x7530,
    0x9364: 0x96FB,
    0x9365: 0x514E,
    0x9366: 0x5410,
    0x9367: 0x5835,
    0x9368: 0x5857,
    0x9369: 0x59AC,
    0x936A: 0x5C60,
    0x936B: 0x5F92,
    0x936C: 0x6597,
    0x936D: 0x675C,
    0x936E: 0x6E21,
    0x936F: 0x767B,
    0x9370: 0x83DF,
    0x9371: 0x8CED,
    0x9372: 0x9014,
    0x9373: 0x90FD,
    0x9374: 0x934D,
    0x9375: 0x7825,
    0x9376: 0x783A,
    0x9377: 0x52AA,
    0x9378: 0x5EA6,
    0x9379: 0x571F,
    0x937A: 0x5974,
    0x937B: 0x6012,
    0x937C: 0x5012,
    0x937D: 0x515A,
    0x937E: 0x51AC,
    0x9380: 0x51CD,
    0x9381: 0x5200,
    0x9382: 0x5510,
    0x9383: 0x5854,
    0x9384: 0x5858,
    0x9385: 0x5957,
    0x9386: 0x5B95,
    0x9387: 0x5CF6,
    0x9388: 0x5D8B,
    0x9389: 0x60BC,
    0x938A: 0x6295,
    0x938B: 0x642D,
    0x938C: 0x6771,
    0x938D: 0x6843,
    0x938E: 0x68BC,
    0x938F: 0x68DF,
    0x9390: 0x76D7,
    0x9391: 0x6DD8,
    0x9392: 0x6E6F,
    0x9393: 0x6D9B,
    0x9394: 0x706F,
    0x9395: 0x71C8,
    0x9396: 0x5F53,
    0x9397: 0x75D8,
    0x9398: 0x7977,
    0x9399: 0x7B49,
    0x939A: 0x7B54,
    0x939B: 0x7B52,
    0x939C: 0x7CD6,
    0x939D: 0x7D71,
    0x939E: 0x5230,
    0x939F: 0x8463,
    0x93A0: 0x8569,
    0x93A1: 0x85E4,
    0x93A2: 0x8A0E,
    0x93A3: 0x8B04,
    0x93A4: 0x8C46,
    0x93A5: 0x8E0F,
    0x93A6: 0x9003,
    0x93A7: 0x900F,
    0x93A8: 0x9419,
    0x93A9: 0x9676,
    0x93AA: 0x982D,
    0x93AB: 0x9A30,
    0x93AC: 0x95D8,
    0x93AD: 0x50CD,
    0x93AE: 0x52D5,
    0x93AF: 0x540C,
    0x93B0: 0x5802,
    0x93B1: 0x5C0E,
    0x93B2: 0x61A7,
    0x93B3: 0x649E,
    0x93B4: 0x6D1E,
    0x93B5: 0x77B3,
    0x93B6: 0x7AE5,
    0x93B7: 0x80F4,
    0x93B8: 0x8404,
    0x93B9: 0x9053,
    0x93BA: 0x9285,
    0x93BB: 0x5CE0,
    0x93BC: 0x9D07,
    0x93BD: 0x533F,
    0x93BE: 0x5F97,
    0x93BF: 0x5FB3,
    0x93C0: 0x6D9C,
    0x93C1: 0x7279,
    0x93C2: 0x7763,
    0x93C3: 0x79BF,
    0x93C4: 0x7BE4,
    0x93C5: 0x6BD2,
    0x93C6: 0x72EC,
    0x93C7: 0x8AAD,
    0x93C8: 0x6803,
    0x93C9: 0x6A61,
    0x93CA: 0x51F8,
    0x93CB: 0x7A81,
    0x93CC: 0x6934,
    0x93CD: 0x5C4A,
    0x93CE: 0x9CF6,
    0x93CF: 0x82EB,
    0x93D0: 0x5BC5,
    0x93D1: 0x9149,
    0x93D2: 0x701E,
    0x93D3: 0x5678,
    0x93D4: 0x5C6F,
    0x93D5: 0x60C7,
    0x93D6: 0x6566,
    0x93D7: 0x6C8C,
    0x93D8: 0x8C5A,
    0x93D9: 0x9041,
    0x93DA: 0x9813,
    0x93DB: 0x5451,
    0x93DC: 0x66C7,
    0x93DD: 0x920D,
    0x93DE: 0x5948,
    0x93DF: 0x90A3,
    0x93E0: 0x5185,
    0x93E1: 0x4E4D,
    0x93E2: 0x51EA,
    0x93E3: 0x8599,
    0x93E4: 0x8B0E,
    0x93E5: 0x7058,
    0x93E6: 0x637A,
    0x93E7: 0x934B,
    0x93E8: 0x6962,
    0x93E9: 0x99B4,
    0x93EA: 0x7E04,
    0x93EB: 0x7577,
    0x93EC: 0x5357,
    0x93ED: 0x6960,
    0x93EE: 0x8EDF,
    0x93EF: 0x96E3,
    0x93F0: 0x6C5D,
    0x93F1: 0x4E8C,
    0x93F2: 0x5C3C,
    0x93F3: 0x5F10,
    0x93F4: 0x8FE9,
    0x93F5: 0x5302,
    0x93F6: 0x8CD1,
    0x93F7: 0x8089,
    0x93F8: 0x8679,
    0x93F9: 0x5EFF,
    0x93FA: 0x65E5,
    0x93FB: 0x4E73,
    0x93FC: 0x5165,
    0x9440: 0x5982,
    0x9441: 0x5C3F,
    0x9442: 0x97EE,
    0x9443: 0x4EFB,
    0x9444: 0x598A,
    0x9445: 0x5FCD,
    0x9446: 0x8A8D,
    0x9447: 0x6FE1,
    0x9448: 0x79B0,
    0x9449: 0x7962,
    0x944A: 0x5BE7,
    0x944B: 0x8471,
    0x944C: 0x732B,
    0x944D: 0x71B1,
    0x944E: 0x5E74,
    0x944F: 0x5FF5,
    0x9450: 0x637B,
    0x9451: 0x649A,
    0x9452: 0x71C3,
    0x9453: 0x7C98,
    0x9454: 0x4E43,
    0x9455: 0x5EFC,
    0x9456: 0x4E4B,
    0x9457: 0x57DC,
    0x9458: 0x56A2,
    0x9459: 0x60A9,
    0x945A: 0x6FC3,
    0x945B: 0x7D0D,
    0x945C: 0x80FD,
    0x945D: 0x8133,
    0x945E: 0x81BF,
    0x945F: 0x8FB2,
    0x9460: 0x8997,
    0x9461: 0x86A4,
    0x9462: 0x5DF4,
    0x9463: 0x628A,
    0x9464: 0x64AD,
    0x9465: 0x8987,
    0x9466: 0x6777,
    0x9467: 0x6CE2,
    0x9468: 0x6D3E,
    0x9469: 0x7436,
    0x946A: 0x7834,
    0x946B: 0x5A46,
    0x946C: 0x7F75,
    0x946D: 0x82AD,
    0x946E: 0x99AC,
    0x946F: 0x4FF3,
    0x9470: 0x5EC3,
    0x9471: 0x62DD,
    0x9472: 0x6392,
    0x9473: 0x6557,
    0x9474: 0x676F,
    0x9475: 0x76C3,
    0x9476: 0x724C,
    0x9477: 0x80CC,
    0x9478: 0x80BA,
    0x9479: 0x8F29,
    0x947A: 0x914D,
    0x947B: 0x500D,
    0x947C: 0x57F9,
    0x947D: 0x5A92,
    0x947E: 0x6885,
    0x9480: 0x6973,
    0x9481: 0x7164,
    0x9482: 0x72FD,
    0x9483: 0x8CB7,
    0x9484: 0x58F2,
    0x9485: 0x8CE0,
    0x9486: 0x966A,
    0x9487: 0x9019,
    0x9488: 0x877F,
    0x9489: 0x79E4,
    0x948A: 0x77E7,
    0x948B: 0x8429,
    0x948C: 0x4F2F,
    0x948D: 0x5265,
    0x948E: 0x535A,
    0x948F: 0x62CD,
    0x9490: 0x67CF,
    0x9491: 0x6CCA,
    0x9492: 0x767D,
    0x9493: 0x7B94,
    0x9494: 0x7C95,
    0x9495: 0x8236,
    0x9496: 0x8584,
    0x9497: 0x8FEB,
    0x9498: 0x66DD,
    0x9499: 0x6F20,
    0x949A: 0x7206,
    0x949B: 0x7E1B,
    0x949C: 0x83AB,
    0x949D: 0x99C1,
    0x949E: 0x9EA6,
    0x949F: 0x51FD,
    0x94A0: 0x7BB1,
    0x94A1: 0x7872,
    0x94A2: 0x7BB8,
    0x94A3: 0x8087,
    0x94A4: 0x7B48,
    0x94A5: 0x6AE8,
    0x94A6: 0x5E61,
    0x94A7: 0x808C,
    0x94A8: 0x7551,
    0x94A9: 0x7560,
    0x94AA: 0x516B,
    0x94AB: 0x9262,
    0x94AC: 0x6E8C,
    0x94AD: 0x767A,
    0x94AE: 0x9197,
    0x94AF: 0x9AEA,
    0x94B0: 0x4F10,
    0x94B1: 0x7F70,
    0x94B2: 0x629C,
    0x94B3: 0x7B4F,
    0x94B4: 0x95A5,
    0x94B5: 0x9CE9,
    0x94B6: 0x567A,
    0x94B7: 0x5859,
    0x94B8: 0x86E4,
    0x94B9: 0x96BC,
    0x94BA: 0x4F34,
    0x94BB: 0x5224,
    0x94BC: 0x534A,
    0x94BD: 0x53CD,
    0x94BE: 0x53DB,
    0x94BF: 0x5E06,
    0x94C0: 0x642C,
    0x94C1: 0x6591,
    0x94C2: 0x677F,
    0x94C3: 0x6C3E,
    0x94C4: 0x6C4E,
    0x94C5: 0x7248,
    0x94C6: 0x72AF,
    0x94C7: 0x73ED,
    0x94C8: 0x7554,
    0x94C9: 0x7E41,
    0x94CA: 0x822C,
    0x94CB: 0x85E9,
    0x94CC: 0x8CA9,
    0x94CD: 0x7BC4,
    0x94CE: 0x91C6,
    0x94CF: 0x7169,
    0x94D0: 0x9812,
    0x94D1: 0x98EF,
    0x94D2: 0x633D,
    0x94D3: 0x6669,
    0x94D4: 0x756A,
    0x94D5: 0x76E4,
    0x94D6: 0x78D0,
    0x94D7: 0x8543,
    0x94D8: 0x86EE,
    0x94D9: 0x532A,
    0x94DA: 0x5351,
    0x94DB: 0x5426,
    0x94DC: 0x5983,
    0x94DD: 0x5E87,
    0x94DE: 0x5F7C,
    0x94DF: 0x60B2,
    0x94E0: 0x6249,
    0x94E1: 0x6279,
    0x94E2: 0x62AB,
    0x94E3: 0x6590,
    0x94E4: 0x6BD4,
    0x94E5: 0x6CCC,
    0x94E6: 0x75B2,
    0x94E7: 0x76AE,
    0x94E8: 0x7891,
    0x94E9: 0x79D8,
    0x94EA: 0x7DCB,
    0x94EB: 0x7F77,
    0x94EC: 0x80A5,
    0x94ED: 0x88AB,
    0x94EE: 0x8AB9,
    0x94EF: 0x8CBB,
    0x94F0: 0x907F,
    0x94F1: 0x975E,
    0x94F2: 0x98DB,
    0x94F3: 0x6A0B,
    0x94F4: 0x7C38,
    0x94F5: 0x5099,
    0x94F6: 0x5C3E,
    0x94F7: 0x5FAE,
    0x94F8: 0x6787,
    0x94F9: 0x6BD8,
    0x94FA: 0x7435,
    0x94FB: 0x7709,
    0x94FC: 0x7F8E,
    0x9540: 0x9F3B,
    0x9541: 0x67CA,
    0x9542: 0x7A17,
    0x9543: 0x5339,
    0x9544: 0x758B,
    0x9545: 0x9AED,
    0x9546: 0x5F66,
    0x9547: 0x819D,
    0x9548: 0x83F1,
    0x9549: 0x8098,
    0x954A: 0x5F3C,
    0x954B: 0x5FC5,
    0x954C: 0x7562,
    0x954D: 0x7B46,
    0x954E: 0x903C,
    0x954F: 0x6867,
    0x9550: 0x59EB,
    0x9551: 0x5A9B,
    0x9552: 0x7D10,
    0x9553: 0x767E,
    0x9554: 0x8B2C,
    0x9555: 0x4FF5,
    0x9556: 0x5F6A,
    0x9557: 0x6A19,
    0x9558: 0x6C37,
    0x9559: 0x6F02,
    0x955A: 0x74E2,
    0x955B: 0x7968,
    0x955C: 0x8868,
    0x955D: 0x8A55,
    0x955E: 0x8C79,
    0x955F: 0x5EDF,
    0x9560: 0x63CF,
    0x9561: 0x75C5,
    0x9562: 0x79D2,
    0x9563: 0x82D7,
    0x9564: 0x9328,
    0x9565: 0x92F2,
    0x9566: 0x849C,
    0x9567: 0x86ED,
    0x9568: 0x9C2D,
    0x9569: 0x54C1,
    0x956A: 0x5F6C,
    0x956B: 0x658C,
    0x956C: 0x6D5C,
    0x956D: 0x7015,
    0x956E: 0x8CA7,
    0x956F: 0x8CD3,
    0x9570: 0x983B,
    0x9571: 0x654F,
    0x9572: 0x74F6,
    0x9573: 0x4E0D,
    0x9574: 0x4ED8,
    0x9575: 0x57E0,
    0x9576: 0x592B,
    0x9577: 0x5A66,
    0x9578: 0x5BCC,
    0x9579: 0x51A8,
    0x957A: 0x5E03,
    0x957B: 0x5E9C,
    0x957C: 0x6016,
    0x957D: 0x6276,
    0x957E: 0x6577,
    0x9580: 0x65A7,
    0x9581: 0x666E,
    0x9582: 0x6D6E,
    0x9583: 0x7236,
    0x9584: 0x7B26,
    0x9585: 0x8150,
    0x9586: 0x819A,
    0x9587: 0x8299,
    0x9588: 0x8B5C,
    0x9589: 0x8CA0,
    0x958A: 0x8CE6,
    0x958B: 0x8D74,
    0x958C: 0x961C,
    0x958D: 0x9644,
    0x958E: 0x4FAE,
    0x958F: 0x64AB,
    0x9590: 0x6B66,
    0x9591: 0x821E,
    0x9592: 0x8461,
    0x9593: 0x856A,
    0x9594: 0x90E8,
    0x9595: 0x5C01,
    0x9596: 0x6953,
    0x9597: 0x98A8,
    0x9598: 0x847A,
    0x9599: 0x8557,
    0x959A: 0x4F0F,
    0x959B: 0x526F,
    0x959C: 0x5FA9,
    0x959D: 0x5E45,
    0x959E: 0x670D,
    0x959F: 0x798F,
    0x95A0: 0x8179,
    0x95A1: 0x8907,
    0x95A2: 0x8986,
    0x95A3: 0x6DF5,
    0x95A4: 0x5F17,
    0x95A5: 0x6255,
    0x95A6: 0x6CB8,
    0x95A7: 0x4ECF,
    0x95A8: 0x7269,
    0x95A9: 0x9B92,
    0x95AA: 0x5206,
    0x95AB: 0x543B,
    0x95AC: 0x5674,
    0x95AD: 0x58B3,
    0x95AE: 0x61A4,
    0x95AF: 0x626E,
    0x95B0: 0x711A,
    0x95B1: 0x596E,
    0x95B2: 0x7C89,
    0x95B3: 0x7CDE,
    0x95B4: 0x7D1B,
    0x95B5: 0x96F0,
    0x95B6: 0x6587,
    0x95B7: 0x805E,
    0x95B8: 0x4E19,
    0x95B9: 0x4F75,
    0x95BA: 0x5175,
    0x95BB: 0x5840,
    0x95BC: 0x5E63,
    0x95BD: 0x5E73,
    0x95BE: 0x5F0A,
    0x95BF: 0x67C4,
    0x95C0: 0x4E26,
    0x95C1: 0x853D,
    0x95C2: 0x9589,
    0x95C3: 0x965B,
    0x95C4: 0x7C73,
    0x95C5: 0x9801,
    0x95C6: 0x50FB,
    0x95C7: 0x58C1,
    0x95C8: 0x7656,
    0x95C9: 0x78A7,
    0x95CA: 0x5225,
    0x95CB: 0x77A5,
    0x95CC: 0x8511,
    0x95CD: 0x7B86,
    0x95CE: 0x504F,
    0x95CF: 0x5909,
    0x95D0: 0x7247,
    0x95D1: 0x7BC7,
    0x95D2: 0x7DE8,
    0x95D3: 0x8FBA,
    0x95D4: 0x8FD4,
    0x95D5: 0x904D,
    0x95D6: 0x4FBF,
    0x95D7: 0x52C9,
    0x95D8: 0x5A29,
    0x95D9: 0x5F01,
    0x95DA: 0x97AD,
    0x95DB: 0x4FDD,
    0x95DC: 0x8217,
    0x95DD: 0x92EA,
    0x95DE: 0x5703,
    0x95DF: 0x6355,
    0x95E0: 0x6B69,
    0x95E1: 0x752B,
    0x95E2: 0x88DC,
    0x95E3: 0x8F14,
    0x95E4: 0x7A42,
    0x95E5: 0x52DF,
    0x95E6: 0x5893,
    0x95E7: 0x6155,
    0x95E8: 0x620A,
    0x95E9: 0x66AE,
    0x95EA: 0x6BCD,
    0x95EB: 0x7C3F,
    0x95EC: 0x83E9,
    0x95ED: 0x5023,
    0x95EE: 0x4FF8,
    0x95EF: 0x5305,
    0x95F0: 0x5446,
    0x95F1: 0x5831,
    0x95F2: 0x5949,
    0x95F3: 0x5B9D,
    0x95F4: 0x5CF0,
    0x95F5: 0x5CEF,
    0x95F6: 0x5D29,
    0x95F7: 0x5E96,
    0x95F8: 0x62B1,
    0x95F9: 0x6367,
    0x95FA: 0x653E,
    0x95FB: 0x65B9,
    0x95FC: 0x670B,
    0x9640: 0x6CD5,
    0x9641: 0x6CE1,
    0x9642: 0x70F9,
    0x9643: 0x7832,
    0x9644: 0x7E2B,
    0x9645: 0x80DE,
    0x9646: 0x82B3,
    0x9647: 0x840C,
    0x9648: 0x84EC,
    0x9649: 0x8702,
    0x964A: 0x8912,
    0x964B: 0x8A2A,
    0x964C: 0x8C4A,
    0x964D: 0x90A6,
    0x964E: 0x92D2,
    0x964F: 0x98FD,
    0x9650: 0x9CF3,
    0x9651: 0x9D6C,
    0x9652: 0x4E4F,
    0x9653: 0x4EA1,
    0x9654: 0x508D,
    0x9655: 0x5256,
    0x9656: 0x574A,
    0x9657: 0x59A8,
    0x9658: 0x5E3D,
    0x9659: 0x5FD8,
    0x965A: 0x5FD9,
    0x965B: 0x623F,
    0x965C: 0x66B4,
    0x965D: 0x671B,
    0x965E: 0x67D0,
    0x965F: 0x68D2,
    0x9660: 0x5192,
    0x9661: 0x7D21,
    0x9662: 0x80AA,
    0x9663: 0x81A8,
    0x9664: 0x8B00,
    0x9665: 0x8C8C,
    0x9666: 0x8CBF,
    0x9667: 0x927E,
    0x9668: 0x9632,
    0x9669: 0x5420,
    0x966A: 0x982C,
    0x966B: 0x5317,
    0x966C: 0x50D5,
    0x966D: 0x535C,
    0x966E: 0x58A8,
    0x966F: 0x64B2,
    0x9670: 0x6734,
    0x9671: 0x7267,
    0x9672: 0x7766,
    0x9673: 0x7A46,
    0x9674: 0x91E6,
    0x9675: 0x52C3,
    0x9676: 0x6CA1,
    0x9677: 0x6B86,
    0x9678: 0x5800,
    0x9679: 0x5E4C,
    0x967A: 0x5954,
    0x967B: 0x672C,
    0x967C: 0x7FFB,
    0x967D: 0x51E1,
    0x967E: 0x76C6,
    0x9680: 0x6469,
    0x9681: 0x78E8,
    0x9682: 0x9B54,
    0x9683: 0x9EBB,
    0x9684: 0x57CB,
    0x9685: 0x59B9,
    0x9686: 0x6627,
    0x9687: 0x679A,
    0x9688: 0x6BCE,
    0x9689: 0x54E9,
    0x968A: 0x69D9,
    0x968B: 0x5E55,
    0x968C: 0x819C,
    0x968D: 0x6795,
    0x968E: 0x9BAA,
    0x968F: 0x67FE,
    0x9690: 0x9C52,
    0x9691: 0x685D,
    0x9692: 0x4EA6,
    0x9693: 0x4FE3,
    0x9694: 0x53C8,
    0x9695: 0x62B9,
    0x9696: 0x672B,
    0x9697: 0x6CAB,
    0x9698: 0x8FC4,
    0x9699: 0x4FAD,
    0x969A: 0x7E6D,
    0x969B: 0x9EBF,
    0x969C: 0x4E07,
    0x969D: 0x6162,
    0x969E: 0x6E80,
    0x969F: 0x6F2B,
    0x96A0: 0x8513,
    0x96A1: 0x5473,
    0x96A2: 0x672A,
    0x96A3: 0x9B45,
    0x96A4: 0x5DF3,
    0x96A5: 0x7B95,
    0x96A6: 0x5CAC,
    0x96A7: 0x5BC6,
    0x96A8: 0x871C,
    0x96A9: 0x6E4A,
    0x96AA: 0x84D1,
    0x96AB: 0x7A14,
    0x96AC: 0x8108,
    0x96AD: 0x5999,
    0x96AE: 0x7C8D,
    0x96AF: 0x6C11,
    0x96B0: 0x7720,
    0x96B1: 0x52D9,
    0x96B2: 0x5922,
    0x96B3: 0x7121,
    0x96B4: 0x725F,
    0x96B5: 0x77DB,
    0x96B6: 0x9727,
    0x96B7: 0x9D61,
    0x96B8: 0x690B,
    0x96B9: 0x5A7F,
    0x96BA: 0x5A18,
    0x96BB: 0x51A5,
    0x96BC: 0x540D,
    0x96BD: 0x547D,
    0x96BE: 0x660E,
    0x96BF: 0x76DF,
    0x96C0: 0x8FF7,
    0x96C1: 0x9298,
    0x96C2: 0x9CF4,
    0x96C3: 0x59EA,
    0x96C4: 0x725D,
    0x96C5: 0x6EC5,
    0x96C6: 0x514D,
    0x96C7: 0x68C9,
    0x96C8: 0x7DBF,
    0x96C9: 0x7DEC,
    0x96CA: 0x9762,
    0x96CB: 0x9EBA,
    0x96CC: 0x6478,
    0x96CD: 0x6A21,
    0x96CE: 0x8302,
    0x96CF: 0x5984,
    0x96D0: 0x5B5F,
    0x96D1: 0x6BDB,
    0x96D2: 0x731B,
    0x96D3: 0x76F2,
    0x96D4: 0x7DB2,
    0x96D5: 0x8017,
    0x96D6: 0x8499,
    0x96D7: 0x5132,
    0x96D8: 0x6728,
    0x96D9: 0x9ED9,
    0x96DA: 0x76EE,
    0x96DB: 0x6762,
    0x96DC: 0x52FF,
    0x96DD: 0x9905,
    0x96DE: 0x5C24,
    0x96DF: 0x623B,
    0x96E0: 0x7C7E,
    0x96E1: 0x8CB0,
    0x96E2: 0x554F,
    0x96E3: 0x60B6,
    0x96E4: 0x7D0B,
    0x96E5: 0x9580,
    0x96E6: 0x5301,
    0x96E7: 0x4E5F,
    0x96E8: 0x51B6,
    0x96E9: 0x591C,
    0x96EA: 0x723A,
    0x96EB: 0x8036,
    0x96EC: 0x91CE,
    0x96ED: 0x5F25,
    0x96EE: 0x77E2,
    0x96EF: 0x5384,
    0x96F0: 0x5F79,
    0x96F1: 0x7D04,
    0x96F2: 0x85AC,
    0x96F3: 0x8A33,
    0x96F4: 0x8E8D,
    0x96F5: 0x9756,
    0x96F6: 0x67F3,
    0x96F7: 0x85AE,
    0x96F8: 0x9453,
    0x96F9: 0x6109,
    0x96FA: 0x6108,
    0x96FB: 0x6CB9,
    0x96FC: 0x7652,
    0x9740: 0x8AED,
    0x9741: 0x8F38,
    0x9742: 0x552F,
    0x9743: 0x4F51,
    0x9744: 0x512A,
    0x9745: 0x52C7,
    0x9746: 0x53CB,
    0x9747: 0x5BA5,
    0x9748: 0x5E7D,
    0x9749: 0x60A0,
    0x974A: 0x6182,
    0x974B: 0x63D6,
    0x974C: 0x6709,
    0x974D: 0x67DA,
    0x974E: 0x6E67,
    0x974F: 0x6D8C,
    0x9750: 0x7336,
    0x9751: 0x7337,
    0x9752: 0x7531,
    0x9753: 0x7950,
    0x9754: 0x88D5,
    0x9755: 0x8A98,
    0x9756: 0x904A,
    0x9757: 0x9091,
    0x9758: 0x90F5,
    0x9759: 0x96C4,
    0x975A: 0x878D,
    0x975B: 0x5915,
    0x975C: 0x4E88,
    0x975D: 0x4F59,
    0x975E: 0x4E0E,
    0x975F: 0x8A89,
    0x9760: 0x8F3F,
    0x9761: 0x9810,
    0x9762: 0x50AD,
    0x9763: 0x5E7C,
    0x9764: 0x5996,
    0x9765: 0x5BB9,
    0x9766: 0x5EB8,
    0x9767: 0x63DA,
    0x9768: 0x63FA,
    0x9769: 0x64C1,
    0x976A: 0x66DC,
    0x976B: 0x694A,
    0x976C: 0x69D8,
    0x976D: 0x6D0B,
    0x976E: 0x6EB6,
    0x976F: 0x7194,
    0x9770: 0x7528,
    0x9771: 0x7AAF,
    0x9772: 0x7F8A,
    0x9773: 0x8000,
    0x9774: 0x8449,
    0x9775: 0x84C9,
    0x9776: 0x8981,
    0x9777: 0x8B21,
    0x9778: 0x8E0A,
    0x9779: 0x9065,
    0x977A: 0x967D,
    0x977B: 0x990A,
    0x977C: 0x617E,
    0x977D: 0x6291,
    0x977E: 0x6B32,
    0x9780: 0x6C83,
    0x9781: 0x6D74,
    0x9782: 0x7FCC,
    0x9783: 0x7FFC,
    0x9784: 0x6DC0,
    0x9785: 0x7F85,
    0x9786: 0x87BA,
    0x9787: 0x88F8,
    0x9788: 0x6765,
    0x9789: 0x83B1,
    0x978A: 0x983C,
    0x978B: 0x96F7,
    0x978C: 0x6D1B,
    0x978D: 0x7D61,
    0x978E: 0x843D,
    0x978F: 0x916A,
    0x9790: 0x4E71,
    0x9791: 0x5375,
    0x9792: 0x5D50,
    0x9793: 0x6B04,
    0x9794: 0x6FEB,
    0x9795: 0x85CD,
    0x9796: 0x862D,
    0x9797: 0x89A7,
    0x9798: 0x5229,
    0x9799: 0x540F,
    0x979A: 0x5C65,
    0x979B: 0x674E,
    0x979C: 0x68A8,
    0x979D: 0x7406,
    0x979E: 0x7483,
    0x979F: 0x75E2,
    0x97A0: 0x88CF,
    0x97A1: 0x88E1,
    0x97A2: 0x91CC,
    0x97A3: 0x96E2,
    0x97A4: 0x9678,
    0x97A5: 0x5F8B,
    0x97A6: 0x7387,
    0x97A7: 0x7ACB,
    0x97A8: 0x844E,
    0x97A9: 0x63A0,
    0x97AA: 0x7565,
    0x97AB: 0x5289,
    0x97AC: 0x6D41,
    0x97AD: 0x6E9C,
    0x97AE: 0x7409,
    0x97AF: 0x7559,
    0x97B0: 0x786B,
    0x97B1: 0x7C92,
    0x97B2: 0x9686,
    0x97B3: 0x7ADC,
    0x97B4: 0x9F8D,
    0x97B5: 0x4FB6,
    0x97B6: 0x616E,
    0x97B7: 0x65C5,
    0x97B8: 0x865C,
    0x97B9: 0x4E86,
    0x97BA: 0x4EAE,
    0x97BB: 0x50DA,
    0x97BC: 0x4E21,
    0x97BD: 0x51CC,
    0x97BE: 0x5BEE,
    0x97BF: 0x6599,
    0x97C0: 0x6881,
    0x97C1: 0x6DBC,
    0x97C2: 0x731F,
    0x97C3: 0x7642,
    0x97C4: 0x77AD,
    0x97C5: 0x7A1C,
    0x97C6: 0x7CE7,
    0x97C7: 0x826F,
    0x97C8: 0x8AD2,
    0x97C9: 0x907C,
    0x97CA: 0x91CF,
    0x97CB: 0x9675,
    0x97CC: 0x9818,
    0x97CD: 0x529B,
    0x97CE: 0x7DD1,
    0x97CF: 0x502B,
    0x97D0: 0x5398,
    0x97D1: 0x6797,
    0x97D2: 0x6DCB,
    0x97D3: 0x71D0,
    0x97D4: 0x7433,
    0x97D5: 0x81E8,
    0x97D6: 0x8F2A,
    0x97D7: 0x96A3,
    0x97D8: 0x9C57,
    0x97D9: 0x9E9F,
    0x97DA: 0x7460,
    0x97DB: 0x5841,
    0x97DC: 0x6D99,
    0x97DD: 0x7D2F,
    0x97DE: 0x985E,
    0x97DF: 0x4EE4,
    0x97E0: 0x4F36,
    0x97E1: 0x4F8B,
    0x97E2: 0x51B7,
    0x97E3: 0x52B1,
    0x97E4: 0x5DBA,
    0x97E5: 0x601C,
    0x97E6: 0x73B2,
    0x97E7: 0x793C,
    0x97E8: 0x82D3,
    0x97E9: 0x9234,
    0x97EA: 0x96B7,
    0x97EB: 0x96F6,
    0x97EC: 0x970A,
    0x97ED: 0x9E97,
    0x97EE: 0x9F62,
    0x97EF: 0x66A6,
    0x97F0: 0x6B74,
    0x97F1: 0x5217,
    0x97F2: 0x52A3,
    0x97F3: 0x70C8,
    0x97F4: 0x88C2,
    0x97F5: 0x5EC9,
    0x97F6: 0x604B,
    0x97F7: 0x6190,
    0x97F8: 0x6F23,
    0x97F9: 0x7149,
    0x97FA: 0x7C3E,
    0x97FB: 0x7DF4,
    0x97FC: 0x806F,
    0x9840: 0x84EE,
    0x9841: 0x9023,
    0x9842: 0x932C,
    0x9843: 0x5442,
    0x9844: 0x9B6F,
    0x9845: 0x6AD3,
    0x9846: 0x7089,
    0x9847: 0x8CC2,
    0x9848: 0x8DEF,
    0x9849: 0x9732,
    0x984A: 0x52B4,
    0x984B: 0x5A41,
    0x984C: 0x5ECA,
    0x984D: 0x5F04,
    0x984E: 0x6717,
    0x984F: 0x697C,
    0x9850: 0x6994,
    0x9851: 0x6D6A,
    0x9852: 0x6F0F,
    0x9853: 0x7262,
    0x9854: 0x72FC,
    0x9855: 0x7BED,
    0x9856: 0x8001,
    0x9857: 0x807E,
    0x9858: 0x874B,
    0x9859: 0x90CE,
    0x985A: 0x516D,
    0x985B: 0x9E93,
    0x985C: 0x7984,
    0x985D: 0x808B,
    0x985E: 0x9332,
    0x985F: 0x8AD6,
    0x9860: 0x502D,
    0x9861: 0x548C,
    0x9862: 0x8A71,
    0x9863: 0x6B6A,
    0x9864: 0x8CC4,
    0x9865: 0x8107,
    0x9866: 0x60D1,
    0x9867: 0x67A0,
    0x9868: 0x9DF2,
    0x9869: 0x4E99,
    0x986A: 0x4E98,
    0x986B: 0x9C10,
    0x986C: 0x8A6B,
    0x986D: 0x85C1,
    0x986E: 0x8568,
    0x986F: 0x6900,
    0x9870: 0x6E7E,
    0x9871: 0x7897,
    0x9872: 0x8155,
    0x989F: 0x5F0C,
    0x98A0: 0x4E10,
    0x98A1: 0x4E15,
    0x98A2: 0x4E2A,
    0x98A3: 0x4E31,
    0x98A4: 0x4E36,
    0x98A5: 0x4E3C,
    0x98A6: 0x4E3F,
    0x98A7: 0x4E42,
    0x98A8: 0x4E56,
    0x98A9: 0x4E58,
    0x98AA: 0x4E82,
    0x98AB: 0x4E85,
    0x98AC: 0x8C6B,
    0x98AD: 0x4E8A,
    0x98AE: 0x8212,
    0x98AF: 0x5F0D,
    0x98B0: 0x4E8E,
    0x98B1: 0x4E9E,
    0x98B2: 0x4E9F,
    0x98B3: 0x4EA0,
    0x98B4: 0x4EA2,
    0x98B5: 0x4EB0,
    0x98B6: 0x4EB3,
    0x98B7: 0x4EB6,
    0x98B8: 0x4ECE,
    0x98B9: 0x4ECD,
    0x98BA: 0x4EC4,
    0x98BB: 0x4EC6,
    0x98BC: 0x4EC2,
    0x98BD: 0x4ED7,
    0x98BE: 0x4EDE,
    0x98BF: 0x4EED,
    0x98C0: 0x4EDF,
    0x98C1: 0x4EF7,
    0x98C2: 0x4F09,
    0x98C3: 0x4F5A,
    0x98C4: 0x4F30,
    0x98C5: 0x4F5B,
    0x98C6: 0x4F5D,
    0x98C7: 0x4F57,
    0x98C8: 0x4F47,
    0x98C9: 0x4F76,
    0x98CA: 0x4F88,
    0x98CB: 0x4F8F,
    0x98CC: 0x4F98,
    0x98CD: 0x4F7B,
    0x98CE: 0x4F69,
    0x98CF: 0x4F70,
    0x98D0: 0x4F91,
    0x98D1: 0x4F6F,
    0x98D2: 0x4F86,
    0x98D3: 0x4F96,
    0x98D4: 0x5118,
    0x98D5: 0x4FD4,
    0x98D6: 0x4FDF,
    0x98D7: 0x4FCE,
    0x98D8: 0x4FD8,
    0x98D9: 0x4FDB,
    0x98DA: 0x4FD1,
    0x98DB: 0x4FDA,
    0x98DC: 0x4FD0,
    0x98DD: 0x4FE4,
    0x98DE: 0x4FE5,
    0x98DF: 0x501A,
    0x98E0: 0x5028,
    0x98E1: 0x5014,
    0x98E2: 0x502A,
    0x98E3: 0x5025,
    0x98E4: 0x5005,
    0x98E5: 0x4F1C,
    0x98E6: 0x4FF6,
    0x98E7: 0x5021,
    0x98E8: 0x5029,
    0x98E9: 0x502C,
    0x98EA: 0x4FFE,
    0x98EB: 0x4FEF,
    0x98EC: 0x5011,
    0x98ED: 0x5006,
    0x98EE: 0x5043,
    0x98EF: 0x5047,
    0x98F0: 0x6703,
    0x98F1: 0x5055,
    0x98F2: 0x5050,
    0x98F3: 0x5048,
    0x98F4: 0x505A,
    0x98F5: 0x5056,
    0x98F6: 0x506C,
    0x98F7: 0x5078,
    0x98F8: 0x5080,
    0x98F9: 0x509A,
    0x98FA: 0x5085,
    0x98FB: 0x50B4,
    0x98FC: 0x50B2,
    0x9940: 0x50C9,
    0x9941: 0x50CA,
    0x9942: 0x50B3,
    0x9943: 0x50C2,
    0x9944: 0x50D6,
    0x9945: 0x50DE,
    0x9946: 0x50E5,
    0x9947: 0x50ED,
    0x9948: 0x50E3,
    0x9949: 0x50EE,
    0x994A: 0x50F9,
    0x994B: 0x50F5,
    0x994C: 0x5109,
    0x994D: 0x5101,
    0x994E: 0x5102,
    0x994F: 0x5116,
    0x9950: 0x5115,
    0x9951: 0x5114,
    0x9952: 0x511A,
    0x9953: 0x5121,
    0x9954: 0x513A,
    0x9955: 0x5137,
    0x9956: 0x513C,
    0x9957: 0x513B,
    0x9958: 0x513F,
    0x9959: 0x5140,
    0x995A: 0x5152,
    0x995B: 0x514C,
    0x995C: 0x5154,
    0x995D: 0x5162,
    0x995E: 0x7AF8,
    0x995F: 0x5169,
    0x9960: 0x516A,
    0x9961: 0x516E,
    0x9962: 0x5180,
    0x9963: 0x5182,
    0x9964: 0x56D8,
    0x9965: 0x518C,
    0x9966: 0x5189,
    0x9967: 0x518F,
    0x9968: 0x5191,
    0x9969: 0x5193,
    0x996A: 0x5195,
    0x996B: 0x5196,
    0x996C: 0x51A4,
    0x996D: 0x51A6,
    0x996E: 0x51A2,
    0x996F: 0x51A9,
    0x9970: 0x51AA,
    0x9971: 0x51AB,
    0x9972: 0x51B3,
    0x9973: 0x51B1,
    0x9974: 0x51B2,
    0x9975: 0x51B0,
    0x9976: 0x51B5,
    0x9977: 0x51BD,
    0x9978: 0x51C5,
    0x9979: 0x51C9,
    0x997A: 0x51DB,
    0x997B: 0x51E0,
    0x997C: 0x8655,
    0x997D: 0x51E9,
    0x997E: 0x51ED,
    0x9980: 0x51F0,
    0x9981: 0x51F5,
    0x9982: 0x51FE,
    0x9983: 0x5204,
    0x9984: 0x520B,
    0x9985: 0x5214,
    0x9986: 0x520E,
    0x9987: 0x5227,
    0x9988: 0x522A,
    0x9989: 0x522E,
    0x998A: 0x5233,
    0x998B: 0x5239,
    0x998C: 0x524F,
    0x998D: 0x5244,
    0x998E: 0x524B,
    0x998F: 0x524C,
    0x9990: 0x525E,
    0x9991: 0x5254,
    0x9992: 0x526A,
    0x9993: 0x5274,
    0x9994: 0x5269,
    0x9995: 0x5273,
    0x9996: 0x527F,
    0x9997: 0x527D,
    0x9998: 0x528D,
    0x9999: 0x5294,
    0x999A: 0x5292,
    0x999B: 0x5271,
    0x999C: 0x5288,
    0x999D: 0x5291,
    0x999E: 0x8FA8,
    0x999F: 0x8FA7,
    0x99A0: 0x52AC,
    0x99A1: 0x52AD,
    0x99A2: 0x52BC,
    0x99A3: 0x52B5,
    0x99A4: 0x52C1,
    0x99A5: 0x52CD,
    0x99A6: 0x52D7,
    0x99A7: 0x52DE,
    0x99A8: 0x52E3,
    0x99A9: 0x52E6,
    0x99AA: 0x98ED,
    0x99AB: 0x52E0,
    0x99AC: 0x52F3,
    0x99AD: 0x52F5,
    0x99AE: 0x52F8,
    0x99AF: 0x52F9,
    0x99B0: 0x5306,
    0x99B1: 0x5308,
    0x99B2: 0x7538,
    0x99B3: 0x530D,
    0x99B4: 0x5310,
    0x99B5: 0x530F,
    0x99B6: 0x5315,
    0x99B7: 0x531A,
    0x99B8: 0x5323,
    0x99B9: 0x532F,
    0x99BA: 0x5331,
    0x99BB: 0x5333,
    0x99BC: 0x5338,
    0x99BD: 0x5340,
    0x99BE: 0x5346,
    0x99BF: 0x5345,
    0x99C0: 0x4E17,
    0x99C1: 0x5349,
    0x99C2: 0x534D,
    0x99C3: 0x51D6,
    0x99C4: 0x535E,
    0x99C5: 0x5369,
    0x99C6: 0x536E,
    0x99C7: 0x5918,
    0x99C8: 0x537B,
    0x99C9: 0x5377,
    0x99CA: 0x5382,
    0x99CB: 0x5396,
    0x99CC: 0x53A0,
    0x99CD: 0x53A6,
    0x99CE: 0x53A5,
    0x99CF: 0x53AE,
    0x99D0: 0x53B0,
    0x99D1: 0x53B6,
    0x99D2: 0x53C3,
    0x99D3: 0x7C12,
    0x99D4: 0x96D9,
    0x99D5: 0x53DF,
    0x99D6: 0x66FC,
    0x99D7: 0x71EE,
    0x99D8: 0x53EE,
    0x99D9: 0x53E8,
    0x99DA: 0x53ED,
    0x99DB: 0x53FA,
    0x99DC: 0x5401,
    0x99DD: 0x543D,
    0x99DE: 0x5440,
    0x99DF: 0x542C,
    0x99E0: 0x542D,
    0x99E1: 0x543C,
    0x99E2: 0x542E,
    0x99E3: 0x5436,
    0x99E4: 0x5429,
    0x99E5: 0x541D,
    0x99E6: 0x544E,
    0x99E7: 0x548F,
    0x99E8: 0x5475,
    0x99E9: 0x548E,
    0x99EA: 0x545F,
    0x99EB: 0x5471,
    0x99EC: 0x5477,
    0x99ED: 0x5470,
    0x99EE: 0x5492,
    0x99EF: 0x547B,
    0x99F0: 0x5480,
    0x99F1: 0x5476,
    0x99F2: 0x5484,
    0x99F3: 0x5490,
    0x99F4: 0x5486,
    0x99F5: 0x54C7,
    0x99F6: 0x54A2,
    0x99F7: 0x54B8,
    0x99F8: 0x54A5,
    0x99F9: 0x54AC,
    0x99FA: 0x54C4,
    0x99FB: 0x54C8,
    0x99FC: 0x54A8,
    0x9A40: 0x54AB,
    0x9A41: 0x54C2,
    0x9A42: 0x54A4,
    0x9A43: 0x54BE,
    0x9A44: 0x54BC,
    0x9A45: 0x54D8,
    0x9A46: 0x54E5,
    0x9A47: 0x54E6,
    0x9A48: 0x550F,
    0x9A49: 0x5514,
    0x9A4A: 0x54FD,
    0x9A4B: 0x54EE,
    0x9A4C: 0x54ED,
    0x9A4D: 0x54FA,
    0x9A4E: 0x54E2,
    0x9A4F: 0x5539,
    0x9A50: 0x5540,
    0x9A51: 0x5563,
    0x9A52: 0x554C,
    0x9A53: 0x552E,
    0x9A54: 0x555C,
    0x9A55: 0x5545,
    0x9A56: 0x5556,
    0x9A57: 0x5557,
    0x9A58: 0x5538,
    0x9A59: 0x5533,
    0x9A5A: 0x555D,
    0x9A5B: 0x5599,
    0x9A5C: 0x5580,
    0x9A5D: 0x54AF,
    0x9A5E: 0x558A,
    0x9A5F: 0x559F,
    0x9A60: 0x557B,
    0x9A61: 0x557E,
    0x9A62: 0x5598,
    0x9A63: 0x559E,
    0x9A64: 0x55AE,
    0x9A65: 0x557C,
    0x9A66: 0x5583,
    0x9A67: 0x55A9,
    0x9A68: 0x5587,
    0x9A69: 0x55A8,
    0x9A6A: 0x55DA,
    0x9A6B: 0x55C5,
    0x9A6C: 0x55DF,
    0x9A6D: 0x55C4,
    0x9A6E: 0x55DC,
    0x9A6F: 0x55E4,
    0x9A70: 0x55D4,
    0x9A71: 0x5614,
    0x9A72: 0x55F7,
    0x9A73: 0x5616,
    0x9A74: 0x55FE,
    0x9A75: 0x55FD,
    0x9A76: 0x561B,
    0x9A77: 0x55F9,
    0x9A78: 0x564E,
    0x9A79: 0x5650,
    0x9A7A: 0x71DF,
    0x9A7B: 0x5634,
    0x9A7C: 0x5636,
    0x9A7D: 0x5632,
    0x9A7E: 0x5638,
    0x9A80: 0x566B,
    0x9A81: 0x5664,
    0x9A82: 0x562F,
    0x9A83: 0x566C,
    0x9A84: 0x566A,
    0x9A85: 0x5686,
    0x9A86: 0x5680,
    0x9A87: 0x568A,
    0x9A88: 0x56A0,
    0x9A89: 0x5694,
    0x9A8A: 0x568F,
    0x9A8B: 0x56A5,
    0x9A8C: 0x56AE,
    0x9A8D: 0x56B6,
    0x9A8E: 0x56B4,
    0x9A8F: 0x56C2,
    0x9A90: 0x56BC,
    0x9A91: 0x56C1,
    0x9A92: 0x56C3,
    0x9A93: 0x56C0,
    0x9A94: 0x56C8,
    0x9A95: 0x56CE,
    0x9A96: 0x56D1,
    0x9A97: 0x56D3,
    0x9A98: 0x56D7,
    0x9A99: 0x56EE,
    0x9A9A: 0x56F9,
    0x9A9B: 0x5700,
    0x9A9C: 0x56FF,
    0x9A9D: 0x5704,
    0x9A9E: 0x5709,
    0x9A9F: 0x5708,
    0x9AA0: 0x570B,
    0x9AA1: 0x570D,
    0x9AA2: 0x5713,
    0x9AA3: 0x5718,
    0x9AA4: 0x5716,
    0x9AA5: 0x55C7,
    0x9AA6: 0x571C,
    0x9AA7: 0x5726,
    0x9AA8: 0x5737,
    0x9AA9: 0x5738,
    0x9AAA: 0x574E,
    0x9AAB: 0x573B,
    0x9AAC: 0x5740,
    0x9AAD: 0x574F,
    0x9AAE: 0x5769,
    0x9AAF: 0x57C0,
    0x9AB0: 0x5788,
    0x9AB1: 0x5761,
    0x9AB2: 0x577F,
    0x9AB3: 0x5789,
    0x9AB4: 0x5793,
    0x9AB5: 0x57A0,
    0x9AB6: 0x57B3,
    0x9AB7: 0x57A4,
    0x9AB8: 0x57AA,
    0x9AB9: 0x57B0,
    0x9ABA: 0x57C3,
    0x9ABB: 0x57C6,
    0x9ABC: 0x57D4,
    0x9ABD: 0x57D2,
    0x9ABE: 0x57D3,
    0x9ABF: 0x580A,
    0x9AC0: 0x57D6,
    0x9AC1: 0x57E3,
    0x9AC2: 0x580B,
    0x9AC3: 0x5819,
    0x9AC4: 0x581D,
    0x9AC5: 0x5872,
    0x9AC6: 0x5821,
    0x9AC7: 0x5862,
    0x9AC8: 0x584B,
    0x9AC9: 0x5870,
    0x9ACA: 0x6BC0,
    0x9ACB: 0x5852,
    0x9ACC: 0x583D,
    0x9ACD: 0x5879,
    0x9ACE: 0x5885,
    0x9ACF: 0x58B9,
    0x9AD0: 0x589F,
    0x9AD1: 0x58AB,
    0x9AD2: 0x58BA,
    0x9AD3: 0x58DE,
    0x9AD4: 0x58BB,
    0x9AD5: 0x58B8,
    0x9AD6: 0x58AE,
    0x9AD7: 0x58C5,
    0x9AD8: 0x58D3,
    0x9AD9: 0x58D1,
    0x9ADA: 0x58D7,
    0x9ADB: 0x58D9,
    0x9ADC: 0x58D8,
    0x9ADD: 0x58E5,
    0x9ADE: 0x58DC,
    0x9ADF: 0x58E4,
    0x9AE0: 0x58DF,
    0x9AE1: 0x58EF,
    0x9AE2: 0x58FA,
    0x9AE3: 0x58F9,
    0x9AE4: 0x58FB,
    0x9AE5: 0x58FC,
    0x9AE6: 0x58FD,
    0x9AE7: 0x5902,
    0x9AE8: 0x590A,
    0x9AE9: 0x5910,
    0x9AEA: 0x591B,
    0x9AEB: 0x68A6,
    0x9AEC: 0x5925,
    0x9AED: 0x592C,
    0x9AEE: 0x592D,
    0x9AEF: 0x5932,
    0x9AF0: 0x5938,
    0x9AF1: 0x593E,
    0x9AF2: 0x7AD2,
    0x9AF3: 0x5955,
    0x9AF4: 0x5950,
    0x9AF5: 0x594E,
    0x9AF6: 0x595A,
    0x9AF7: 0x5958,
    0x9AF8: 0x5962,
    0x9AF9: 0x5960,
    0x9AFA: 0x5967,
    0x9AFB: 0x596C,
    0x9AFC: 0x5969,
    0x9B40: 0x5978,
    0x9B41: 0x5981,
    0x9B42: 0x599D,
    0x9B43: 0x4F5E,
    0x9B44: 0x4FAB,
    0x9B45: 0x59A3,
    0x9B46: 0x59B2,
    0x9B47: 0x59C6,
    0x9B48: 0x59E8,
    0x9B49: 0x59DC,
    0x9B4A: 0x598D,
    0x9B4B: 0x59D9,
    0x9B4C: 0x59DA,
    0x9B4D: 0x5A25,
    0x9B4E: 0x5A1F,
    0x9B4F: 0x5A11,
    0x9B50: 0x5A1C,
    0x9B51: 0x5A09,
    0x9B52: 0x5A1A,
    0x9B53: 0x5A40,
    0x9B54: 0x5A6C,
    0x9B55: 0x5A49,
    0x9B56: 0x5A35,
    0x9B57: 0x5A36,
    0x9B58: 0x5A62,
    0x9B59: 0x5A6A,
    0x9B5A: 0x5A9A,
    0x9B5B: 0x5ABC,
    0x9B5C: 0x5ABE,
    0x9B5D: 0x5ACB,
    0x9B5E: 0x5AC2,
    0x9B5F: 0x5ABD,
    0x9B60: 0x5AE3,
    0x9B61: 0x5AD7,
    0x9B62: 0x5AE6,
    0x9B63: 0x5AE9,
    0x9B64: 0x5AD6,
    0x9B65: 0x5AFA,
    0x9B66: 0x5AFB,
    0x9B67: 0x5B0C,
    0x9B68: 0x5B0B,
    0x9B69: 0x5B16,
    0x9B6A: 0x5B32,
    0x9B6B: 0x5AD0,
    0x9B6C: 0x5B2A,
    0x9B6D: 0x5B36,
    0x9B6E: 0x5B3E,
    0x9B6F: 0x5B43,
    0x9B70: 0x5B45,
    0x9B71: 0x5B40,
    0x9B72: 0x5B51,
    0x9B73: 0x5B55,
    0x9B74: 0x5B5A,
    0x9B75: 0x5B5B,
    0x9B76: 0x5B65,
    0x9B77: 0x5B69,
    0x9B78: 0x5B70,
    0x9B79: 0x5B73,
    0x9B7A: 0x5B75,
    0x9B7B: 0x5B78,
    0x9B7C: 0x6588,
    0x9B7D: 0x5B7A,
    0x9B7E: 0x5B80,
    0x9B80: 0x5B83,
    0x9B81: 0x5BA6,
    0x9B82: 0x5BB8,
    0x9B83: 0x5BC3,
    0x9B84: 0x5BC7,
    0x9B85: 0x5BC9,
    0x9B86: 0x5BD4,
    0x9B87: 0x5BD0,
    0x9B88: 0x5BE4,
    0x9B89: 0x5BE6,
    0x9B8A: 0x5BE2,
    0x9B8B: 0x5BDE,
    0x9B8C: 0x5BE5,
    0x9B8D: 0x5BEB,
    0x9B8E: 0x5BF0,
    0x9B8F: 0x5BF6,
    0x9B90: 0x5BF3,
    0x9B91: 0x5C05,
    0x9B92: 0x5C07,
    0x9B93: 0x5C08,
    0x9B94: 0x5C0D,
    0x9B95: 0x5C13,
    0x9B96: 0x5C20,
    0x9B97: 0x5C22,
    0x9B98: 0x5C28,
    0x9B99: 0x5C38,
    0x9B9A: 0x5C39,
    0x9B9B: 0x5C41,
    0x9B9C: 0x5C46,
    0x9B9D: 0x5C4E,
    0x9B9E: 0x5C53,
    0x9B9F: 0x5C50,
    0x9BA0: 0x5C4F,
    0x9BA1: 0x5B71,
    0x9BA2: 0x5C6C,
    0x9BA3: 0x5C6E,
    0x9BA4: 0x4E62,
    0x9BA5: 0x5C76,
    0x9BA6: 0x5C79,
    0x9BA7: 0x5C8C,
    0x9BA8: 0x5C91,
    0x9BA9: 0x5C94,
    0x9BAA: 0x599B,
    0x9BAB: 0x5CAB,
    0x9BAC: 0x5CBB,
    0x9BAD: 0x5CB6,
    0x9BAE: 0x5CBC,
    0x9BAF: 0x5CB7,
    0x9BB0: 0x5CC5,
    0x9BB1: 0x5CBE,
    0x9BB2: 0x5CC7,
    0x9BB3: 0x5CD9,
    0x9BB4: 0x5CE9,
    0x9BB5: 0x5CFD,
    0x9BB6: 0x5CFA,
    0x9BB7: 0x5CED,
    0x9BB8: 0x5D8C,
    0x9BB9: 0x5CEA,
    0x9BBA: 0x5D0B,
    0x9BBB: 0x5D15,
    0x9BBC: 0x5D17,
    0x9BBD: 0x5D5C,
    0x9BBE: 0x5D1F,
    0x9BBF: 0x5D1B,
    0x9BC0: 0x5D11,
    0x9BC1: 0x5D14,
    0x9BC2: 0x5D22,
    0x9BC3: 0x5D1A,
    0x9BC4: 0x5D19,
    0x9BC5: 0x5D18,
    0x9BC6: 0x5D4C,
    0x9BC7: 0x5D52,
    0x9BC8: 0x5D4E,
    0x9BC9: 0x5D4B,
    0x9BCA: 0x5D6C,
    0x9BCB: 0x5D73,
    0x9BCC: 0x5D76,
    0x9BCD: 0x5D87,
    0x9BCE: 0x5D84,
    0x9BCF: 0x5D82,
    0x9BD0: 0x5DA2,
    0x9BD1: 0x5D9D,
    0x9BD2: 0x5DAC,
    0x9BD3: 0x5DAE,
    0x9BD4: 0x5DBD,
    0x9BD5: 0x5D90,
    0x9BD6: 0x5DB7,
    0x9BD7: 0x5DBC,
    0x9BD8: 0x5DC9,
    0x9BD9: 0x5DCD,
    0x9BDA: 0x5DD3,
    0x9BDB: 0x5DD2,
    0x9BDC: 0x5DD6,
    0x9BDD: 0x5DDB,
    0x9BDE: 0x5DEB,
    0x9BDF: 0x5DF2,
    0x9BE0: 0x5DF5,
    0x9BE1: 0x5E0B,
    0x9BE2: 0x5E1A,
    0x9BE3: 0x5E19,
    0x9BE4: 0x5E11,
    0x9BE5: 0x5E1B,
    0x9BE6: 0x5E36,
    0x9BE7: 0x5E37,
    0x9BE8: 0x5E44,
    0x9BE9: 0x5E43,
    0x9BEA: 0x5E40,
    0x9BEB: 0x5E4E,
    0x9BEC: 0x5E57,
    0x9BED: 0x5E54,
    0x9BEE: 0x5E5F,
    0x9BEF: 0x5E62,
    0x9BF0: 0x5E64,
    0x9BF1: 0x5E47,
    0x9BF2: 0x5E75,
    0x9BF3: 0x5E76,
    0x9BF4: 0x5E7A,
    0x9BF5: 0x9EBC,
    0x9BF6: 0x5E7F,
    0x9BF7: 0x5EA0,
    0x9BF8: 0x5EC1,
    0x9BF9: 0x5EC2,
    0x9BFA: 0x5EC8,
    0x9BFB: 0x5ED0,
    0x9BFC: 0x5ECF,
    0x9C40: 0x5ED6,
    0x9C41: 0x5EE3,
    0x9C42: 0x5EDD,
    0x9C43: 0x5EDA,
    0x9C44: 0x5EDB,
    0x9C45: 0x5EE2,
    0x9C46: 0x5EE1,
    0x9C47: 0x5EE8,
    0x9C48: 0x5EE9,
    0x9C49: 0x5EEC,
    0x9C4A: 0x5EF1,
    0x9C4B: 0x5EF3,
    0x9C4C: 0x5EF0,
    0x9C4D: 0x5EF4,
    0x9C4E: 0x5EF8,
    0x9C4F: 0x5EFE,
    0x9C50: 0x5F03,
    0x9C51: 0x5F09,
    0x9C52: 0x5F5D,
    0x9C53: 0x5F5C,
    0x9C54: 0x5F0B,
    0x9C55: 0x5F11,
    0x9C56: 0x5F16,
    0x9C57: 0x5F29,
    0x9C58: 0x5F2D,
    0x9C59: 0x5F38,
    0x9C5A: 0x5F41,
    0x9C5B: 0x5F48,
    0x9C5C: 0x5F4C,
    0x9C5D: 0x5F4E,
    0x9C5E: 0x5F2F,
    0x9C5F: 0x5F51,
    0x9C60: 0x5F56,
    0x9C61: 0x5F57,
    0x9C62: 0x5F59,
    0x9C63: 0x5F61,
    0x9C64: 0x5F6D,
    0x9C65: 0x5F73,
    0x9C66: 0x5F77,
    0x9C67: 0x5F83,
    0x9C68: 0x5F82,
    0x9C69: 0x5F7F,
    0x9C6A: 0x5F8A,
    0x9C6B: 0x5F88,
    0x9C6C: 0x5F91,
    0x9C6D: 0x5F87,
    0x9C6E: 0x5F9E,
    0x9C6F: 0x5F99,
    0x9C70: 0x5F98,
    0x9C71: 0x5FA0,
    0x9C72: 0x5FA8,
    0x9C73: 0x5FAD,
    0x9C74: 0x5FBC,
    0x9C75: 0x5FD6,
    0x9C76: 0x5FFB,
    0x9C77: 0x5FE4,
    0x9C78: 0x5FF8,
    0x9C79: 0x5FF1,
    0x9C7A: 0x5FDD,
    0x9C7B: 0x60B3,
    0x9C7C: 0x5FFF,
    0x9C7D: 0x6021,
    0x9C7E: 0x6060,
    0x9C80: 0x6019,
    0x9C81: 0x6010,
    0x9C82: 0x6029,
    0x9C83: 0x600E,
    0x9C84: 0x6031,
    0x9C85: 0x601B,
    0x9C86: 0x6015,
    0x9C87: 0x602B,
    0x9C88: 0x6026,
    0x9C89: 0x600F,
    0x9C8A: 0x603A,
    0x9C8B: 0x605A,
    0x9C8C: 0x6041,
    0x9C8D: 0x606A,
    0x9C8E: 0x6077,
    0x9C8F: 0x605F,
    0x9C90: 0x604A,
    0x9C91: 0x6046,
    0x9C92: 0x604D,
    0x9C93: 0x6063,
    0x9C94: 0x6043,
    0x9C95: 0x6064,
    0x9C96: 0x6042,
    0x9C97: 0x606C,
    0x9C98: 0x606B,
    0x9C99: 0x6059,
    0x9C9A: 0x6081,
    0x9C9B: 0x608D,
    0x9C9C: 0x60E7,
    0x9C9D: 0x6083,
    0x9C9E: 0x609A,
    0x9C9F: 0x6084,
    0x9CA0: 0x609B,
    0x9CA1: 0x6096,
    0x9CA2: 0x6097,
    0x9CA3: 0x6092,
    0x9CA4: 0x60A7,
    0x9CA5: 0x608B,
    0x9CA6: 0x60E1,
    0x9CA7: 0x60B8,
    0x9CA8: 0x60E0,
    0x9CA9: 0x60D3,
    0x9CAA: 0x60B4,
    0x9CAB: 0x5FF0,
    0x9CAC: 0x60BD,
    0x9CAD: 0x60C6,
    0x9CAE: 0x60B5,
    0x9CAF: 0x60D8,
    0x9CB0: 0x614D,
    0x9CB1: 0x6115,
    0x9CB2: 0x6106,
    0x9CB3: 0x60F6,
    0x9CB4: 0x60F7,
    0x9CB5: 0x6100,
    0x9CB6: 0x60F4,
    0x9CB7: 0x60FA,
    0x9CB8: 0x6103,
    0x9CB9: 0x6121,
    0x9CBA: 0x60FB,
    0x9CBB: 0x60F1,
    0x9CBC: 0x610D,
    0x9CBD: 0x610E,
    0x9CBE: 0x6147,
    0x9CBF: 0x613E,
    0x9CC0: 0x6128,
    0x9CC1: 0x6127,
    0x9CC2: 0x614A,
    0x9CC3: 0x613F,
    0x9CC4: 0x613C,
    0x9CC5: 0x612C,
    0x9CC6: 0x6134,
    0x9CC7: 0x613D,
    0x9CC8: 0x6142,
    0x9CC9: 0x6144,
    0x9CCA: 0x6173,
    0x9CCB: 0x6177,
    0x9CCC: 0x6158,
    0x9CCD: 0x6159,
    0x9CCE: 0x615A,
    0x9CCF: 0x616B,
    0x9CD0: 0x6174,
    0x9CD1: 0x616F,
    0x9CD2: 0x6165,
    0x9CD3: 0x6171,
    0x9CD4: 0x615F,
    0x9CD5: 0x615D,
    0x9CD6: 0x6153,
    0x9CD7: 0x6175,
    0x9CD8: 0x6199,
    0x9CD9: 0x6196,
    0x9CDA: 0x6187,
    0x9CDB: 0x61AC,
    0x9CDC: 0x6194,
    0x9CDD: 0x619A,
    0x9CDE: 0x618A,
    0x9CDF: 0x6191,
    0x9CE0: 0x61AB,
    0x9CE1: 0x61AE,
    0x9CE2: 0x61CC,
    0x9CE3: 0x61CA,
    0x9CE4: 0x61C9,
    0x9CE5: 0x61F7,
    0x9CE6: 0x61C8,
    0x9CE7: 0x61C3,
    0x9CE8: 0x61C6,
    0x9CE9: 0x61BA,
    0x9CEA: 0x61CB,
    0x9CEB: 0x7F79,
    0x9CEC: 0x61CD,
    0x9CED: 0x61E6,
    0x9CEE: 0x61E3,
    0x9CEF: 0x61F6,
    0x9CF0: 0x61FA,
    0x9CF1: 0x61F4,
    0x9CF2: 0x61FF,
    0x9CF3: 0x61FD,
    0x9CF4: 0x61FC,
    0x9CF5: 0x61FE,
    0x9CF6: 0x6200,
    0x9CF7: 0x6208,
    0x9CF8: 0x6209,
    0x9CF9: 0x620D,
    0x9CFA: 0x620C,
    0x9CFB: 0x6214,
    0x9CFC: 0x621B,
    0x9D40: 0x621E,
    0x9D41: 0x6221,
    0x9D42: 0x622A,
    0x9D43: 0x622E,
    0x9D44: 0x6230,
    0x9D45: 0x6232,
    0x9D46: 0x6233,
    0x9D47: 0x6241,
    0x9D48: 0x624E,
    0x9D49: 0x625E,
    0x9D4A: 0x6263,
    0x9D4B: 0x625B,
    0x9D4C: 0x6260,
    0x9D4D: 0x6268,
    0x9D4E: 0x627C,
    0x9D4F: 0x6282,
    0x9D50: 0x6289,
    0x9D51: 0x627E,
    0x9D52: 0x6292,
    0x9D53: 0x6293,
    0x9D54: 0x6296,
    0x9D55: 0x62D4,
    0x9D56: 0x6283,
    0x9D57: 0x6294,
    0x9D58: 0x62D7,
    0x9D59: 0x62D1,
    0x9D5A: 0x62BB,
    0x9D5B: 0x62CF,
    0x9D5C: 0x62FF,
    0x9D5D: 0x62C6,
    0x9D5E: 0x64D4,
    0x9D5F: 0x62C8,
    0x9D60: 0x62DC,
    0x9D61: 0x62CC,
    0x9D62: 0x62CA,
    0x9D63: 0x62C2,
    0x9D64: 0x62C7,
    0x9D65: 0x629B,
    0x9D66: 0x62C9,
    0x9D67: 0x630C,
    0x9D68: 0x62EE,
    0x9D69: 0x62F1,
    0x9D6A: 0x6327,
    0x9D6B: 0x6302,
    0x9D6C: 0x6308,
    0x9D6D: 0x62EF,
    0x9D6E: 0x62F5,
    0x9D6F: 0x6350,
    0x9D70: 0x633E,
    0x9D71: 0x634D,
    0x9D72: 0x641C,
    0x9D73: 0x634F,
    0x9D74: 0x6396,
    0x9D75: 0x638E,
    0x9D76: 0x6380,
    0x9D77: 0x63AB,
    0x9D78: 0x6376,
    0x9D79: 0x63A3,
    0x9D7A: 0x638F,
    0x9D7B: 0x6389,
    0x9D7C: 0x639F,
    0x9D7D: 0x63B5,
    0x9D7E: 0x636B,
    0x9D80: 0x6369,
    0x9D81: 0x63BE,
    0x9D82: 0x63E9,
    0x9D83: 0x63C0,
    0x9D84: 0x63C6,
    0x9D85: 0x63E3,
    0x9D86: 0x63C9,
    0x9D87: 0x63D2,
    0x9D88: 0x63F6,
    0x9D89: 0x63C4,
    0x9D8A: 0x6416,
    0x9D8B: 0x6434,
    0x9D8C: 0x6406,
    0x9D8D: 0x6413,
    0x9D8E: 0x6426,
    0x9D8F: 0x6436,
    0x9D90: 0x651D,
    0x9D91: 0x6417,
    0x9D92: 0x6428,
    0x9D93: 0x640F,
    0x9D94: 0x6467,
    0x9D95: 0x646F,
    0x9D96: 0x6476,
    0x9D97: 0x644E,
    0x9D98: 0x652A,
    0x9D99: 0x6495,
    0x9D9A: 0x6493,
    0x9D9B: 0x64A5,
    0x9D9C: 0x64A9,
    0x9D9D: 0x6488,
    0x9D9E: 0x64BC,
    0x9D9F: 0x64DA,
    0x9DA0: 0x64D2,
    0x9DA1: 0x64C5,
    0x9DA2: 0x64C7,
    0x9DA3: 0x64BB,
    0x9DA4: 0x64D8,
    0x9DA5: 0x64C2,
    0x9DA6: 0x64F1,
    0x9DA7: 0x64E7,
    0x9DA8: 0x8209,
    0x9DA9: 0x64E0,
    0x9DAA: 0x64E1,
    0x9DAB: 0x62AC,
    0x9DAC: 0x64E3,
    0x9DAD: 0x64EF,
    0x9DAE: 0x652C,
    0x9DAF: 0x64F6,
    0x9DB0: 0x64F4,
    0x9DB1: 0x64F2,
    0x9DB2: 0x64FA,
    0x9DB3: 0x6500,
    0x9DB4: 0x64FD,
    0x9DB5: 0x6518,
    0x9DB6: 0x651C,
    0x9DB7: 0x6505,
    0x9DB8: 0x6524,
    0x9DB9: 0x6523,
    0x9DBA: 0x652B,
    0x9DBB: 0x6534,
    0x9DBC: 0x6535,
    0x9DBD: 0x6537,
    0x9DBE: 0x6536,
    0x9DBF: 0x6538,
    0x9DC0: 0x754B,
    0x9DC1: 0x6548,
    0x9DC2: 0x6556,
    0x9DC3: 0x6555,
    0x9DC4: 0x654D,
    0x9DC5: 0x6558,
    0x9DC6: 0x655E,
    0x9DC7: 0x655D,
    0x9DC8: 0x6572,
    0x9DC9: 0x6578,
    0x9DCA: 0x6582,
    0x9DCB: 0x6583,
    0x9DCC: 0x8B8A,
    0x9DCD: 0x659B,
    0x9DCE: 0x659F,
    0x9DCF: 0x65AB,
    0x9DD0: 0x65B7,
    0x9DD1: 0x65C3,
    0x9DD2: 0x65C6,
    0x9DD3: 0x65C1,
    0x9DD4: 0x65C4,
    0x9DD5: 0x65CC,
    0x9DD6: 0x65D2,
    0x9DD7: 0x65DB,
    0x9DD8: 0x65D9,
    0x9DD9: 0x65E0,
    0x9DDA: 0x65E1,
    0x9DDB: 0x65F1,
    0x9DDC: 0x6772,
    0x9DDD: 0x660A,
    0x9DDE: 0x6603,
    0x9DDF: 0x65FB,
    0x9DE0: 0x6773,
    0x9DE1: 0x6635,
    0x9DE2: 0x6636,
    0x9DE3: 0x6634,
    0x9DE4: 0x661C,
    0x9DE5: 0x664F,
    0x9DE6: 0x6644,
    0x9DE7: 0x6649,
    0x9DE8: 0x6641,
    0x9DE9: 0x665E,
    0x9DEA: 0x665D,
    0x9DEB: 0x6664,
    0x9DEC: 0x6667,
    0x9DED: 0x6668,
    0x9DEE: 0x665F,
    0x9DEF: 0x6662,
    0x9DF0: 0x6670,
    0x9DF1: 0x6683,
    0x9DF2: 0x6688,
    0x9DF3: 0x668E,
    0x9DF4: 0x6689,
    0x9DF5: 0x6684,
    0x9DF6: 0x6698,
    0x9DF7: 0x669D,
    0x9DF8: 0x66C1,
    0x9DF9: 0x66B9,
    0x9DFA: 0x66C9,
    0x9DFB: 0x66BE,
    0x9DFC: 0x66BC,
    0x9E40: 0x66C4,
    0x9E41: 0x66B8,
    0x9E42: 0x66D6,
    0x9E43: 0x66DA,
    0x9E44: 0x66E0,
    0x9E45: 0x663F,
    0x9E46: 0x66E6,
    0x9E47: 0x66E9,
    0x9E48: 0x66F0,
    0x9E49: 0x66F5,
    0x9E4A: 0x66F7,
    0x9E4B: 0x670F,
    0x9E4C: 0x6716,
    0x9E4D: 0x671E,
    0x9E4E: 0x6726,
    0x9E4F: 0x6727,
    0x9E50: 0x9738,
    0x9E51: 0x672E,
    0x9E52: 0x673F,
    0x9E53: 0x6736,
    0x9E54: 0x6741,
    0x9E55: 0x6738,
    0x9E56: 0x6737,
    0x9E57: 0x6746,
    0x9E58: 0x675E,
    0x9E59: 0x6760,
    0x9E5A: 0x6759,
    0x9E5B: 0x6763,
    0x9E5C: 0x6764,
    0x9E5D: 0x6789,
    0x9E5E: 0x6770,
    0x9E5F: 0x67A9,
    0x9E60: 0x677C,
    0x9E61: 0x676A,
    0x9E62: 0x678C,
    0x9E63: 0x678B,
    0x9E64: 0x67A6,
    0x9E65: 0x67A1,
    0x9E66: 0x6785,
    0x9E67: 0x67B7,
    0x9E68: 0x67EF,
    0x9E69: 0x67B4,
    0x9E6A: 0x67EC,
    0x9E6B: 0x67B3,
    0x9E6C: 0x67E9,
    0x9E6D: 0x67B8,
    0x9E6E: 0x67E4,
    0x9E6F: 0x67DE,
    0x9E70: 0x67DD,
    0x9E71: 0x67E2,
    0x9E72: 0x67EE,
    0x9E73: 0x67B9,
    0x9E74: 0x67CE,
    0x9E75: 0x67C6,
    0x9E76: 0x67E7,
    0x9E77: 0x6A9C,
    0x9E78: 0x681E,
    0x9E79: 0x6846,
    0x9E7A: 0x6829,
    0x9E7B: 0x6840,
    0x9E7C: 0x684D,
    0x9E7D: 0x6832,
    0x9E7E: 0x684E,
    0x9E80: 0x68B3,
    0x9E81: 0x682B,
    0x9E82: 0x6859,
    0x9E83: 0x6863,
    0x9E84: 0x6877,
    0x9E85: 0x687F,
    0x9E86: 0x689F,
    0x9E87: 0x688F,
    0x9E88: 0x68AD,
    0x9E89: 0x6894,
    0x9E8A: 0x689D,
    0x9E8B: 0x689B,
    0x9E8C: 0x6883,
    0x9E8D: 0x6AAE,
    0x9E8E: 0x68B9,
    0x9E8F: 0x6874,
    0x9E90: 0x68B5,
    0x9E91: 0x68A0,
    0x9E92: 0x68BA,
    0x9E93: 0x690F,
    0x9E94: 0x688D,
    0x9E95: 0x687E,
    0x9E96: 0x6901,
    0x9E97: 0x68CA,
    0x9E98: 0x6908,
    0x9E99: 0x68D8,
    0x9E9A: 0x6922,
    0x9E9B: 0x6926,
    0x9E9C: 0x68E1,
    0x9E9D: 0x690C,
    0x9E9E: 0x68CD,
    0x9E9F: 0x68D4,
    0x9EA0: 0x68E7,
    0x9EA1: 0x68D5,
    0x9EA2: 0x6936,
    0x9EA3: 0x6912,
    0x9EA4: 0x6904,
    0x9EA5: 0x68D7,
    0x9EA6: 0x68E3,
    0x9EA7: 0x6925,
    0x9EA8: 0x68F9,
    0x9EA9: 0x68E0,
    0x9EAA: 0x68EF,
    0x9EAB: 0x6928,
    0x9EAC: 0x692A,
    0x9EAD: 0x691A,
    0x9EAE: 0x6923,
    0x9EAF: 0x6921,
    0x9EB0: 0x68C6,
    0x9EB1: 0x6979,
    0x9EB2: 0x6977,
    0x9EB3: 0x695C,
    0x9EB4: 0x6978,
    0x9EB5: 0x696B,
    0x9EB6: 0x6954,
    0x9EB7: 0x697E,
    0x9EB8: 0x696E,
    0x9EB9: 0x6939,
    0x9EBA: 0x6974,
    0x9EBB: 0x693D,
    0x9EBC: 0x6959,
    0x9EBD: 0x6930,
    0x9EBE: 0x6961,
    0x9EBF: 0x695E,
    0x9EC0: 0x695D,
    0x9EC1: 0x6981,
    0x9EC2: 0x696A,
    0x9EC3: 0x69B2,
    0x9EC4: 0x69AE,
    0x9EC5: 0x69D0,
    0x9EC6: 0x69BF,
    0x9EC7: 0x69C1,
    0x9EC8: 0x69D3,
    0x9EC9: 0x69BE,
    0x9ECA: 0x69CE,
    0x9ECB: 0x5BE8,
    0x9ECC: 0x69CA,
    0x9ECD: 0x69DD,
    0x9ECE: 0x69BB,
    0x9ECF: 0x69C3,
    0x9ED0: 0x69A7,
    0x9ED1: 0x6A2E,
    0x9ED2: 0x6991,
    0x9ED3: 0x69A0,
    0x9ED4: 0x699C,
    0x9ED5: 0x6995,
    0x9ED6: 0x69B4,
    0x9ED7: 0x69DE,
    0x9ED8: 0x69E8,
    0x9ED9: 0x6A02,
    0x9EDA: 0x6A1B,
    0x9EDB: 0x69FF,
    0x9EDC: 0x6B0A,
    0x9EDD: 0x69F9,
    0x9EDE: 0x69F2,
    0x9EDF: 0x69E7,
    0x9EE0: 0x6A05,
    0x9EE1: 0x69B1,
    0x9EE2: 0x6A1E,
    0x9EE3: 0x69ED,
    0x9EE4: 0x6A14,
    0x9EE5: 0x69EB,
    0x9EE6: 0x6A0A,
    0x9EE7: 0x6A12,
    0x9EE8: 0x6AC1,
    0x9EE9: 0x6A23,
    0x9EEA: 0x6A13,
    0x9EEB: 0x6A44,
    0x9EEC: 0x6A0C,
    0x9EED: 0x6A72,
    0x9EEE: 0x6A36,
    0x9EEF: 0x6A78,
    0x9EF0: 0x6A47,
    0x9EF1: 0x6A62,
    0x9EF2: 0x6A59,
    0x9EF3: 0x6A66,
    0x9EF4: 0x6A48,
    0x9EF5: 0x6A38,
    0x9EF6: 0x6A22,
    0x9EF7: 0x6A90,
    0x9EF8: 0x6A8D,
    0x9EF9: 0x6AA0,
    0x9EFA: 0x6A84,
    0x9EFB: 0x6AA2,
    0x9EFC: 0x6AA3,
    0x9F40: 0x6A97,
    0x9F41: 0x8617,
    0x9F42: 0x6ABB,
    0x9F43: 0x6AC3,
    0x9F44: 0x6AC2,
    0x9F45: 0x6AB8,
    0x9F46: 0x6AB3,
    0x9F47: 0x6AAC,
    0x9F48: 0x6ADE,
    0x9F49: 0x6AD1,
    0x9F4A: 0x6ADF,
    0x9F4B: 0x6AAA,
    0x9F4C: 0x6ADA,
    0x9F4D: 0x6AEA,
    0x9F4E: 0x6AFB,
    0x9F4F: 0x6B05,
    0x9F50: 0x8616,
    0x9F51: 0x6AFA,
    0x9F52: 0x6B12,
    0x9F53: 0x6B16,
    0x9F54: 0x9B31,
    0x9F55: 0x6B1F,
    0x9F56: 0x6B38,
    0x9F57: 0x6B37,
    0x9F58: 0x76DC,
    0x9F59: 0x6B39,
    0x9F5A: 0x98EE,
    0x9F5B: 0x6B47,
    0x9F5C: 0x6B43,
    0x9F5D: 0x6B49,
    0x9F5E: 0x6B50,
    0x9F5F: 0x6B59,
    0x9F60: 0x6B54,
    0x9F61: 0x6B5B,
    0x9F62: 0x6B5F,
    0x9F63: 0x6B61,
    0x9F64: 0x6B78,
    0x9F65: 0x6B79,
    0x9F66: 0x6B7F,
    0x9F67: 0x6B80,
    0x9F68: 0x6B84,
    0x9F69: 0x6B83,
    0x9F6A: 0x6B8D,
    0x9F6B: 0x6B98,
    0x9F6C: 0x6B95,
    0x9F6D: 0x6B9E,
    0x9F6E: 0x6BA4,
    0x9F6F: 0x6BAA,
    0x9F70: 0x6BAB,
    0x9F71: 0x6BAF,
    0x9F72: 0x6BB2,
    0x9F73: 0x6BB1,
    0x9F74: 0x6BB3,
    0x9F75: 0x6BB7,
    0x9F76: 0x6BBC,
    0x9F77: 0x6BC6,
    0x9F78: 0x6BCB,
    0x9F79: 0x6BD3,
    0x9F7A: 0x6BDF,
    0x9F7B: 0x6BEC,
    0x9F7C: 0x6BEB,
    0x9F7D: 0x6BF3,
    0x9F7E: 0x6BEF,
    0x9F80: 0x9EBE,
    0x9F81: 0x6C08,
    0x9F82: 0x6C13,
    0x9F83: 0x6C14,
    0x9F84: 0x6C1B,
    0x9F85: 0x6C24,
    0x9F86: 0x6C23,
    0x9F87: 0x6C5E,
    0x9F88: 0x6C55,
    0x9F89: 0x6C62,
    0x9F8A: 0x6C6A,
    0x9F8B: 0x6C82,
    0x9F8C: 0x6C8D,
    0x9F8D: 0x6C9A,
    0x9F8E: 0x6C81,
    0x9F8F: 0x6C9B,
    0x9F90: 0x6C7E,
    0x9F91: 0x6C68,
    0x9F92: 0x6C73,
    0x9F93: 0x6C92,
    0x9F94: 0x6C90,
    0x9F95: 0x6CC4,
    0x9F96: 0x6CF1,
    0x9F97: 0x6CD3,
    0x9F98: 0x6CBD,
    0x9F99: 0x6CD7,
    0x9F9A: 0x6CC5,
    0x9F9B: 0x6CDD,
    0x9F9C: 0x6CAE,
    0x9F9D: 0x6CB1,
    0x9F9E: 0x6CBE,
    0x9F9F: 0x6CBA,
    0x9FA0: 0x6CDB,
    0x9FA1: 0x6CEF,
    0x9FA2: 0x6CD9,
    0x9FA3: 0x6CEA,
    0x9FA4: 0x6D1F,
    0x9FA5: 0x884D,
    0x9FA6: 0x6D36,
    0x9FA7: 0x6D2B,
    0x9FA8: 0x6D3D,
    0x9FA9: 0x6D38,
    0x9FAA: 0x6D19,
    0x9FAB: 0x6D35,
    0x9FAC: 0x6D33,
    0x9FAD: 0x6D12,
    0x9FAE: 0x6D0C,
    0x9FAF: 0x6D63,
    0x9FB0: 0x6D93,
    0x9FB1: 0x6D64,
    0x9FB2: 0x6D5A,
    0x9FB3: 0x6D79,
    0x9FB4: 0x6D59,
    0x9FB5: 0x6D8E,
    0x9FB6: 0x6D95,
    0x9FB7: 0x6FE4,
    0x9FB8: 0x6D85,
    0x9FB9: 0x6DF9,
    0x9FBA: 0x6E15,
    0x9FBB: 0x6E0A,
    0x9FBC: 0x6DB5,
    0x9FBD: 0x6DC7,
    0x9FBE: 0x6DE6,
    0x9FBF: 0x6DB8,
    0x9FC0: 0x6DC6,
    0x9FC1: 0x6DEC,
    0x9FC2: 0x6DDE,
    0x9FC3: 0x6DCC,
    0x9FC4: 0x6DE8,
    0x9FC5: 0x6DD2,
    0x9FC6: 0x6DC5,
    0x9FC7: 0x6DFA,
    0x9FC8: 0x6DD9,
    0x9FC9: 0x6DE4,
    0x9FCA: 0x6DD5,
    0x9FCB: 0x6DEA,
    0x9FCC: 0x6DEE,
    0x9FCD: 0x6E2D,
    0x9FCE: 0x6E6E,
    0x9FCF: 0x6E2E,
    0x9FD0: 0x6E19,
    0x9FD1: 0x6E72,
    0x9FD2: 0x6E5F,
    0x9FD3: 0x6E3E,
    0x9FD4: 0x6E23,
    0x9FD5: 0x6E6B,
    0x9FD6: 0x6E2B,
    0x9FD7: 0x6E76,
    0x9FD8: 0x6E4D,
    0x9FD9: 0x6E1F,
    0x9FDA: 0x6E43,
    0x9FDB: 0x6E3A,
    0x9FDC: 0x6E4E,
    0x9FDD: 0x6E24,
    0x9FDE: 0x6EFF,
    0x9FDF: 0x6E1D,
    0x9FE0: 0x6E38,
    0x9FE1: 0x6E82,
    0x9FE2: 0x6EAA,
    0x9FE3: 0x6E98,
    0x9FE4: 0x6EC9,
    0x9FE5: 0x6EB7,
    0x9FE6: 0x6ED3,
    0x9FE7: 0x6EBD,
    0x9FE8: 0x6EAF,
    0x9FE9: 0x6EC4,
    0x9FEA: 0x6EB2,
    0x9FEB: 0x6ED4,
    0x9FEC: 0x6ED5,
    0x9FED: 0x6E8F,
    0x9FEE: 0x6EA5,
    0x9FEF: 0x6EC2,
    0x9FF0: 0x6E9F,
    0x9FF1: 0x6F41,
    0x9FF2: 0x6F11,
    0x9FF3: 0x704C,
    0x9FF4: 0x6EEC,
    0x9FF5: 0x6EF8,
    0x9FF6: 0x6EFE,
    0x9FF7: 0x6F3F,
    0x9FF8: 0x6EF2,
    0x9FF9: 0x6F31,
    0x9FFA: 0x6EEF,
    0x9FFB: 0x6F32,
    0x9FFC: 0x6ECC,
    0xA1: 0xFF61,
    0xA2: 0xFF62,
    0xA3: 0xFF63,
    0xA4: 0xFF64,
    0xA5: 0xFF65,
    0xA6: 0xFF66,
    0xA7: 0xFF67,
    0xA8: 0xFF68,
    0xA9: 0xFF69,
    0xAA: 0xFF6A,
    0xAB: 0xFF6B,
    0xAC: 0xFF6C,
    0xAD: 0xFF6D,
    0xAE: 0xFF6E,
    0xAF: 0xFF6F,
    0xB0: 0xFF70,
    0xB1: 0xFF71,
    0xB2: 0xFF72,
    0xB3: 0xFF73,
    0xB4: 0xFF74,
    0xB5: 0xFF75,
    0xB6: 0xFF76,
    0xB7: 0xFF77,
    0xB8: 0xFF78,
    0xB9: 0xFF79,
    0xBA: 0xFF7A,
    0xBB: 0xFF7B,
    0xBC: 0xFF7C,
    0xBD: 0xFF7D,
    0xBE: 0xFF7E,
    0xBF: 0xFF7F,
    0xC0: 0xFF80,
    0xC1: 0xFF81,
    0xC2: 0xFF82,
    0xC3: 0xFF83,
    0xC4: 0xFF84,
    0xC5: 0xFF85,
    0xC6: 0xFF86,
    0xC7: 0xFF87,
    0xC8: 0xFF88,
    0xC9: 0xFF89,
    0xCA: 0xFF8A,
    0xCB: 0xFF8B,
    0xCC: 0xFF8C,
    0xCD: 0xFF8D,
    0xCE: 0xFF8E,
    0xCF: 0xFF8F,
    0xD0: 0xFF90,
    0xD1: 0xFF91,
    0xD2: 0xFF92,
    0xD3: 0xFF93,
    0xD4: 0xFF94,
    0xD5: 0xFF95,
    0xD6: 0xFF96,
    0xD7: 0xFF97,
    0xD8: 0xFF98,
    0xD9: 0xFF99,
    0xDA: 0xFF9A,
    0xDB: 0xFF9B,
    0xDC: 0xFF9C,
    0xDD: 0xFF9D,
    0xDE: 0xFF9E,
    0xDF: 0xFF9F,
    0xE040: 0x6F3E,
    0xE041: 0x6F13,
    0xE042: 0x6EF7,
    0xE043: 0x6F86,
    0xE044: 0x6F7A,
    0xE045: 0x6F78,
    0xE046: 0x6F81,
    0xE047: 0x6F80,
    0xE048: 0x6F6F,
    0xE049: 0x6F5B,
    0xE04A: 0x6FF3,
    0xE04B: 0x6F6D,
    0xE04C: 0x6F82,
    0xE04D: 0x6F7C,
    0xE04E: 0x6F58,
    0xE04F: 0x6F8E,
    0xE050: 0x6F91,
    0xE051: 0x6FC2,
    0xE052: 0x6F66,
    0xE053: 0x6FB3,
    0xE054: 0x6FA3,
    0xE055: 0x6FA1,
    0xE056: 0x6FA4,
    0xE057: 0x6FB9,
    0xE058: 0x6FC6,
    0xE059: 0x6FAA,
    0xE05A: 0x6FDF,
    0xE05B: 0x6FD5,
    0xE05C: 0x6FEC,
    0xE05D: 0x6FD4,
    0xE05E: 0x6FD8,
    0xE05F: 0x6FF1,
    0xE060: 0x6FEE,
    0xE061: 0x6FDB,
    0xE062: 0x7009,
    0xE063: 0x700B,
    0xE064: 0x6FFA,
    0xE065: 0x7011,
    0xE066: 0x7001,
    0xE067: 0x700F,
    0xE068: 0x6FFE,
    0xE069: 0x701B,
    0xE06A: 0x701A,
    0xE06B: 0x6F74,
    0xE06C: 0x701D,
    0xE06D: 0x7018,
    0xE06E: 0x701F,
    0xE06F: 0x7030,
    0xE070: 0x703E,
    0xE071: 0x7032,
    0xE072: 0x7051,
    0xE073: 0x7063,
    0xE074: 0x7099,
    0xE075: 0x7092,
    0xE076: 0x70AF,
    0xE077: 0x70F1,
    0xE078: 0x70AC,
    0xE079: 0x70B8,
    0xE07A: 0x70B3,
    0xE07B: 0x70AE,
    0xE07C: 0x70DF,
    0xE07D: 0x70CB,
    0xE07E: 0x70DD,
    0xE080: 0x70D9,
    0xE081: 0x7109,
    0xE082: 0x70FD,
    0xE083: 0x711C,
    0xE084: 0x7119,
    0xE085: 0x7165,
    0xE086: 0x7155,
    0xE087: 0x7188,
    0xE088: 0x7166,
    0xE089: 0x7162,
    0xE08A: 0x714C,
    0xE08B: 0x7156,
    0xE08C: 0x716C,
    0xE08D: 0x718F,
    0xE08E: 0x71FB,
    0xE08F: 0x7184,
    0xE090: 0x7195,
    0xE091: 0x71A8,
    0xE092: 0x71AC,
    0xE093: 0x71D7,
    0xE094: 0x71B9,
    0xE095: 0x71BE,
    0xE096: 0x71D2,
    0xE097: 0x71C9,
    0xE098: 0x71D4,
    0xE099: 0x71CE,
    0xE09A: 0x71E0,
    0xE09B: 0x71EC,
    0xE09C: 0x71E7,
    0xE09D: 0x71F5,
    0xE09E: 0x71FC,
    0xE09F: 0x71F9,
    0xE0A0: 0x71FF,
    0xE0A1: 0x720D,
    0xE0A2: 0x7210,
    0xE0A3: 0x721B,
    0xE0A4: 0x7228,
    0xE0A5: 0x722D,
    0xE0A6: 0x722C,
    0xE0A7: 0x7230,
    0xE0A8: 0x7232,
    0xE0A9: 0x723B,
    0xE0AA: 0x723C,
    0xE0AB: 0x723F,
    0xE0AC: 0x7240,
    0xE0AD: 0x7246,
    0xE0AE: 0x724B,
    0xE0AF: 0x7258,
    0xE0B0: 0x7274,
    0xE0B1: 0x727E,
    0xE0B2: 0x7282,
    0xE0B3: 0x7281,
    0xE0B4: 0x7287,
    0xE0B5: 0x7292,
    0xE0B6: 0x7296,
    0xE0B7: 0x72A2,
    0xE0B8: 0x72A7,
    0xE0B9: 0x72B9,
    0xE0BA: 0x72B2,
    0xE0BB: 0x72C3,
    0xE0BC: 0x72C6,
    0xE0BD: 0x72C4,
    0xE0BE: 0x72CE,
    0xE0BF: 0x72D2,
    0xE0C0: 0x72E2,
    0xE0C1: 0x72E0,
    0xE0C2: 0x72E1,
    0xE0C3: 0x72F9,
    0xE0C4: 0x72F7,
    0xE0C5: 0x500F,
    0xE0C6: 0x7317,
    0xE0C7: 0x730A,
    0xE0C8: 0x731C,
    0xE0C9: 0x7316,
    0xE0CA: 0x731D,
    0xE0CB: 0x7334,
    0xE0CC: 0x732F,
    0xE0CD: 0x7329,
    0xE0CE: 0x7325,
    0xE0CF: 0x733E,
    0xE0D0: 0x734E,
    0xE0D1: 0x734F,
    0xE0D2: 0x9ED8,
    0xE0D3: 0x7357,
    0xE0D4: 0x736A,
    0xE0D5: 0x7368,
    0xE0D6: 0x7370,
    0xE0D7: 0x7378,
    0xE0D8: 0x7375,
    0xE0D9: 0x737B,
    0xE0DA: 0x737A,
    0xE0DB: 0x73C8,
    0xE0DC: 0x73B3,
    0xE0DD: 0x73CE,
    0xE0DE: 0x73BB,
    0xE0DF: 0x73C0,
    0xE0E0: 0x73E5,
    0xE0E1: 0x73EE,
    0xE0E2: 0x73DE,
    0xE0E3: 0x74A2,
    0xE0E4: 0x7405,
    0xE0E5: 0x746F,
    0xE0E6: 0x7425,
    0xE0E7: 0x73F8,
    0xE0E8: 0x7432,
    0xE0E9: 0x743A,
    0xE0EA: 0x7455,
    0xE0EB: 0x743F,
    0xE0EC: 0x745F,
    0xE0ED: 0x7459,
    0xE0EE: 0x7441,
    0xE0EF: 0x745C,
    0xE0F0: 0x7469,
    0xE0F1: 0x7470,
    0xE0F2: 0x7463,
    0xE0F3: 0x746A,
    0xE0F4: 0x7476,
    0xE0F5: 0x747E,
    0xE0F6: 0x748B,
    0xE0F7: 0x749E,
    0xE0F8: 0x74A7,
    0xE0F9: 0x74CA,
    0xE0FA: 0x74CF,
    0xE0FB: 0x74D4,
    0xE0FC: 0x73F1,
    0xE140: 0x74E0,
    0xE141: 0x74E3,
    0xE142: 0x74E7,
    0xE143: 0x74E9,
    0xE144: 0x74EE,
    0xE145: 0x74F2,
    0xE146: 0x74F0,
    0xE147: 0x74F1,
    0xE148: 0x74F8,
    0xE149: 0x74F7,
    0xE14A: 0x7504,
    0xE14B: 0x7503,
    0xE14C: 0x7505,
    0xE14D: 0x750C,
    0xE14E: 0x750E,
    0xE14F: 0x750D,
    0xE150: 0x7515,
    0xE151: 0x7513,
    0xE152: 0x751E,
    0xE153: 0x7526,
    0xE154: 0x752C,
    0xE155: 0x753C,
    0xE156: 0x7544,
    0xE157: 0x754D,
    0xE158: 0x754A,
    0xE159: 0x7549,
    0xE15A: 0x755B,
    0xE15B: 0x7546,
    0xE15C: 0x755A,
    0xE15D: 0x7569,
    0xE15E: 0x7564,
    0xE15F: 0x7567,
    0xE160: 0x756B,
    0xE161: 0x756D,
    0xE162: 0x7578,
    0xE163: 0x7576,
    0xE164: 0x7586,
    0xE165: 0x7587,
    0xE166: 0x7574,
    0xE167: 0x758A,
    0xE168: 0x7589,
    0xE169: 0x7582,
    0xE16A: 0x7594,
    0xE16B: 0x759A,
    0xE16C: 0x759D,
    0xE16D: 0x75A5,
    0xE16E: 0x75A3,
    0xE16F: 0x75C2,
    0xE170: 0x75B3,
    0xE171: 0x75C3,
    0xE172: 0x75B5,
    0xE173: 0x75BD,
    0xE174: 0x75B8,
    0xE175: 0x75BC,
    0xE176: 0x75B1,
    0xE177: 0x75CD,
    0xE178: 0x75CA,
    0xE179: 0x75D2,
    0xE17A: 0x75D9,
    0xE17B: 0x75E3,
    0xE17C: 0x75DE,
    0xE17D: 0x75FE,
    0xE17E: 0x75FF,
    0xE180: 0x75FC,
    0xE181: 0x7601,
    0xE182: 0x75F0,
    0xE183: 0x75FA,
    0xE184: 0x75F2,
    0xE185: 0x75F3,
    0xE186: 0x760B,
    0xE187: 0x760D,
    0xE188: 0x7609,
    0xE189: 0x761F,
    0xE18A: 0x7627,
    0xE18B: 0x7620,
    0xE18C: 0x7621,
    0xE18D: 0x7622,
    0xE18E: 0x7624,
    0xE18F: 0x7634,
    0xE190: 0x7630,
    0xE191: 0x763B,
    0xE192: 0x7647,
    0xE193: 0x7648,
    0xE194: 0x7646,
    0xE195: 0x765C,
    0xE196: 0x7658,
    0xE197: 0x7661,
    0xE198: 0x7662,
    0xE199: 0x7668,
    0xE19A: 0x7669,
    0xE19B: 0x766A,
    0xE19C: 0x7667,
    0xE19D: 0x766C,
    0xE19E: 0x7670,
    0xE19F: 0x7672,
    0xE1A0: 0x7676,
    0xE1A1: 0x7678,
    0xE1A2: 0x767C,
    0xE1A3: 0x7680,
    0xE1A4: 0x7683,
    0xE1A5: 0x7688,
    0xE1A6: 0x768B,
    0xE1A7: 0x768E,
    0xE1A8: 0x7696,
    0xE1A9: 0x7693,
    0xE1AA: 0x7699,
    0xE1AB: 0x769A,
    0xE1AC: 0x76B0,
    0xE1AD: 0x76B4,
    0xE1AE: 0x76B8,
    0xE1AF: 0x76B9,
    0xE1B0: 0x76BA,
    0xE1B1: 0x76C2,
    0xE1B2: 0x76CD,
    0xE1B3: 0x76D6,
    0xE1B4: 0x76D2,
    0xE1B5: 0x76DE,
    0xE1B6: 0x76E1,
    0xE1B7: 0x76E5,
    0xE1B8: 0x76E7,
    0xE1B9: 0x76EA,
    0xE1BA: 0x862F,
    0xE1BB: 0x76FB,
    0xE1BC: 0x7708,
    0xE1BD: 0x7707,
    0xE1BE: 0x7704,
    0xE1BF: 0x7729,
    0xE1C0: 0x7724,
    0xE1C1: 0x771E,
    0xE1C2: 0x7725,
    0xE1C3: 0x7726,
    0xE1C4: 0x771B,
    0xE1C5: 0x7737,
    0xE1C6: 0x7738,
    0xE1C7: 0x7747,
    0xE1C8: 0x775A,
    0xE1C9: 0x7768,
    0xE1CA: 0x776B,
    0xE1CB: 0x775B,
    0xE1CC: 0x7765,
    0xE1CD: 0x777F,
    0xE1CE: 0x777E,
    0xE1CF: 0x7779,
    0xE1D0: 0x778E,
    0xE1D1: 0x778B,
    0xE1D2: 0x7791,
    0xE1D3: 0x77A0,
    0xE1D4: 0x779E,
    0xE1D5: 0x77B0,
    0xE1D6: 0x77B6,
    0xE1D7: 0x77B9,
    0xE1D8: 0x77BF,
    0xE1D9: 0x77BC,
    0xE1DA: 0x77BD,
    0xE1DB: 0x77BB,
    0xE1DC: 0x77C7,
    0xE1DD: 0x77CD,
    0xE1DE: 0x77D7,
    0xE1DF: 0x77DA,
    0xE1E0: 0x77DC,
    0xE1E1: 0x77E3,
    0xE1E2: 0x77EE,
    0xE1E3: 0x77FC,
    0xE1E4: 0x780C,
    0xE1E5: 0x7812,
    0xE1E6: 0x7926,
    0xE1E7: 0x7820,
    0xE1E8: 0x792A,
    0xE1E9: 0x7845,
    0xE1EA: 0x788E,
    0xE1EB: 0x7874,
    0xE1EC: 0x7886,
    0xE1ED: 0x787C,
    0xE1EE: 0x789A,
    0xE1EF: 0x788C,
    0xE1F0: 0x78A3,
    0xE1F1: 0x78B5,
    0xE1F2: 0x78AA,
    0xE1F3: 0x78AF,
    0xE1F4: 0x78D1,
    0xE1F5: 0x78C6,
    0xE1F6: 0x78CB,
    0xE1F7: 0x78D4,
    0xE1F8: 0x78BE,
    0xE1F9: 0x78BC,
    0xE1FA: 0x78C5,
    0xE1FB: 0x78CA,
    0xE1FC: 0x78EC,
    0xE240: 0x78E7,
    0xE241: 0x78DA,
    0xE242: 0x78FD,
    0xE243: 0x78F4,
    0xE244: 0x7907,
    0xE245: 0x7912,
    0xE246: 0x7911,
    0xE247: 0x7919,
    0xE248: 0x792C,
    0xE249: 0x792B,
    0xE24A: 0x7940,
    0xE24B: 0x7960,
    0xE24C: 0x7957,
    0xE24D: 0x795F,
    0xE24E: 0x795A,
    0xE24F: 0x7955,
    0xE250: 0x7953,
    0xE251: 0x797A,
    0xE252: 0x797F,
    0xE253: 0x798A,
    0xE254: 0x799D,
    0xE255: 0x79A7,
    0xE256: 0x9F4B,
    0xE257: 0x79AA,
    0xE258: 0x79AE,
    0xE259: 0x79B3,
    0xE25A: 0x79B9,
    0xE25B: 0x79BA,
    0xE25C: 0x79C9,
    0xE25D: 0x79D5,
    0xE25E: 0x79E7,
    0xE25F: 0x79EC,
    0xE260: 0x79E1,
    0xE261: 0x79E3,
    0xE262: 0x7A08,
    0xE263: 0x7A0D,
    0xE264: 0x7A18,
    0xE265: 0x7A19,
    0xE266: 0x7A20,
    0xE267: 0x7A1F,
    0xE268: 0x7980,
    0xE269: 0x7A31,
    0xE26A: 0x7A3B,
    0xE26B: 0x7A3E,
    0xE26C: 0x7A37,
    0xE26D: 0x7A43,
    0xE26E: 0x7A57,
    0xE26F: 0x7A49,
    0xE270: 0x7A61,
    0xE271: 0x7A62,
    0xE272: 0x7A69,
    0xE273: 0x9F9D,
    0xE274: 0x7A70,
    0xE275: 0x7A79,
    0xE276: 0x7A7D,
    0xE277: 0x7A88,
    0xE278: 0x7A97,
    0xE279: 0x7A95,
    0xE27A: 0x7A98,
    0xE27B: 0x7A96,
    0xE27C: 0x7AA9,
    0xE27D: 0x7AC8,
    0xE27E: 0x7AB0,
    0xE280: 0x7AB6,
    0xE281: 0x7AC5,
    0xE282: 0x7AC4,
    0xE283: 0x7ABF,
    0xE284: 0x9083,
    0xE285: 0x7AC7,
    0xE286: 0x7ACA,
    0xE287: 0x7ACD,
    0xE288: 0x7ACF,
    0xE289: 0x7AD5,
    0xE28A: 0x7AD3,
    0xE28B: 0x7AD9,
    0xE28C: 0x7ADA,
    0xE28D: 0x7ADD,
    0xE28E: 0x7AE1,
    0xE28F: 0x7AE2,
    0xE290: 0x7AE6,
    0xE291: 0x7AED,
    0xE292: 0x7AF0,
    0xE293: 0x7B02,
    0xE294: 0x7B0F,
    0xE295: 0x7B0A,
    0xE296: 0x7B06,
    0xE297: 0x7B33,
    0xE298: 0x7B18,
    0xE299: 0x7B19,
    0xE29A: 0x7B1E,
    0xE29B: 0x7B35,
    0xE29C: 0x7B28,
    0xE29D: 0x7B36,
    0xE29E: 0x7B50,
    0xE29F: 0x7B7A,
    0xE2A0: 0x7B04,
    0xE2A1: 0x7B4D,
    0xE2A2: 0x7B0B,
    0xE2A3: 0x7B4C,
    0xE2A4: 0x7B45,
    0xE2A5: 0x7B75,
    0xE2A6: 0x7B65,
    0xE2A7: 0x7B74,
    0xE2A8: 0x7B67,
    0xE2A9: 0x7B70,
    0xE2AA: 0x7B71,
    0xE2AB: 0x7B6C,
    0xE2AC: 0x7B6E,
    0xE2AD: 0x7B9D,
    0xE2AE: 0x7B98,
    0xE2AF: 0x7B9F,
    0xE2B0: 0x7B8D,
    0xE2B1: 0x7B9C,
    0xE2B2: 0x7B9A,
    0xE2B3: 0x7B8B,
    0xE2B4: 0x7B92,
    0xE2B5: 0x7B8F,
    0xE2B6: 0x7B5D,
    0xE2B7: 0x7B99,
    0xE2B8: 0x7BCB,
    0xE2B9: 0x7BC1,
    0xE2BA: 0x7BCC,
    0xE2BB: 0x7BCF,
    0xE2BC: 0x7BB4,
    0xE2BD: 0x7BC6,
    0xE2BE: 0x7BDD,
    0xE2BF: 0x7BE9,
    0xE2C0: 0x7C11,
    0xE2C1: 0x7C14,
    0xE2C2: 0x7BE6,
    0xE2C3: 0x7BE5,
    0xE2C4: 0x7C60,
    0xE2C5: 0x7C00,
    0xE2C6: 0x7C07,
    0xE2C7: 0x7C13,
    0xE2C8: 0x7BF3,
    0xE2C9: 0x7BF7,
    0xE2CA: 0x7C17,
    0xE2CB: 0x7C0D,
    0xE2CC: 0x7BF6,
    0xE2CD: 0x7C23,
    0xE2CE: 0x7C27,
    0xE2CF: 0x7C2A,
    0xE2D0: 0x7C1F,
    0xE2D1: 0x7C37,
    0xE2D2: 0x7C2B,
    0xE2D3: 0x7C3D,
    0xE2D4: 0x7C4C,
    0xE2D5: 0x7C43,
    0xE2D6: 0x7C54,
    0xE2D7: 0x7C4F,
    0xE2D8: 0x7C40,
    0xE2D9: 0x7C50,
    0xE2DA: 0x7C58,
    0xE2DB: 0x7C5F,
    0xE2DC: 0x7C64,
    0xE2DD: 0x7C56,
    0xE2DE: 0x7C65,
    0xE2DF: 0x7C6C,
    0xE2E0: 0x7C75,
    0xE2E1: 0x7C83,
    0xE2E2: 0x7C90,
    0xE2E3: 0x7CA4,
    0xE2E4: 0x7CAD,
    0xE2E5: 0x7CA2,
    0xE2E6: 0x7CAB,
    0xE2E7: 0x7CA1,
    0xE2E8: 0x7CA8,
    0xE2E9: 0x7CB3,
    0xE2EA: 0x7CB2,
    0xE2EB: 0x7CB1,
    0xE2EC: 0x7CAE,
    0xE2ED: 0x7CB9,
    0xE2EE: 0x7CBD,
    0xE2EF: 0x7CC0,
    0xE2F0: 0x7CC5,
    0xE2F1: 0x7CC2,
    0xE2F2: 0x7CD8,
    0xE2F3: 0x7CD2,
    0xE2F4: 0x7CDC,
    0xE2F5: 0x7CE2,
    0xE2F6: 0x9B3B,
    0xE2F7: 0x7CEF,
    0xE2F8: 0x7CF2,
    0xE2F9: 0x7CF4,
    0xE2FA: 0x7CF6,
    0xE2FB: 0x7CFA,
    0xE2FC: 0x7D06,
    0xE340: 0x7D02,
    0xE341: 0x7D1C,
    0xE342: 0x7D15,
    0xE343: 0x7D0A,
    0xE344: 0x7D45,
    0xE345: 0x7D4B,
    0xE346: 0x7D2E,
    0xE347: 0x7D32,
    0xE348: 0x7D3F,
    0xE349: 0x7D35,
    0xE34A: 0x7D46,
    0xE34B: 0x7D73,
    0xE34C: 0x7D56,
    0xE34D: 0x7D4E,
    0xE34E: 0x7D72,
    0xE34F: 0x7D68,
    0xE350: 0x7D6E,
    0xE351: 0x7D4F,
    0xE352: 0x7D63,
    0xE353: 0x7D93,
    0xE354: 0x7D89,
    0xE355: 0x7D5B,
    0xE356: 0x7D8F,
    0xE357: 0x7D7D,
    0xE358: 0x7D9B,
    0xE359: 0x7DBA,
    0xE35A: 0x7DAE,
    0xE35B: 0x7DA3,
    0xE35C: 0x7DB5,
    0xE35D: 0x7DC7,
    0xE35E: 0x7DBD,
    0xE35F: 0x7DAB,
    0xE360: 0x7E3D,
    0xE361: 0x7DA2,
    0xE362: 0x7DAF,
    0xE363: 0x7DDC,
    0xE364: 0x7DB8,
    0xE365: 0x7D9F,
    0xE366: 0x7DB0,
    0xE367: 0x7DD8,
    0xE368: 0x7DDD,
    0xE369: 0x7DE4,
    0xE36A: 0x7DDE,
    0xE36B: 0x7DFB,
    0xE36C: 0x7DF2,
    0xE36D: 0x7DE1,
    0xE36E: 0x7E05,
    0xE36F: 0x7E0A,
    0xE370: 0x7E23,
    0xE371: 0x7E21,
    0xE372: 0x7E12,
    0xE373: 0x7E31,
    0xE374: 0x7E1F,
    0xE375: 0x7E09,
    0xE376: 0x7E0B,
    0xE377: 0x7E22,
    0xE378: 0x7E46,
    0xE379: 0x7E66,
    0xE37A: 0x7E3B,
    0xE37B: 0x7E35,
    0xE37C: 0x7E39,
    0xE37D: 0x7E43,
    0xE37E: 0x7E37,
    0xE380: 0x7E32,
    0xE381: 0x7E3A,
    0xE382: 0x7E67,
    0xE383: 0x7E5D,
    0xE384: 0x7E56,
    0xE385: 0x7E5E,
    0xE386: 0x7E59,
    0xE387: 0x7E5A,
    0xE388: 0x7E79,
    0xE389: 0x7E6A,
    0xE38A: 0x7E69,
    0xE38B: 0x7E7C,
    0xE38C: 0x7E7B,
    0xE38D: 0x7E83,
    0xE38E: 0x7DD5,
    0xE38F: 0x7E7D,
    0xE390: 0x8FAE,
    0xE391: 0x7E7F,
    0xE392: 0x7E88,
    0xE393: 0x7E89,
    0xE394: 0x7E8C,
    0xE395: 0x7E92,
    0xE396: 0x7E90,
    0xE397: 0x7E93,
    0xE398: 0x7E94,
    0xE399: 0x7E96,
    0xE39A: 0x7E8E,
    0xE39B: 0x7E9B,
    0xE39C: 0x7E9C,
    0xE39D: 0x7F38,
    0xE39E: 0x7F3A,
    0xE39F: 0x7F45,
    0xE3A0: 0x7F4C,
    0xE3A1: 0x7F4D,
    0xE3A2: 0x7F4E,
    0xE3A3: 0x7F50,
    0xE3A4: 0x7F51,
    0xE3A5: 0x7F55,
    0xE3A6: 0x7F54,
    0xE3A7: 0x7F58,
    0xE3A8: 0x7F5F,
    0xE3A9: 0x7F60,
    0xE3AA: 0x7F68,
    0xE3AB: 0x7F69,
    0xE3AC: 0x7F67,
    0xE3AD: 0x7F78,
    0xE3AE: 0x7F82,
    0xE3AF: 0x7F86,
    0xE3B0: 0x7F83,
    0xE3B1: 0x7F88,
    0xE3B2: 0x7F87,
    0xE3B3: 0x7F8C,
    0xE3B4: 0x7F94,
    0xE3B5: 0x7F9E,
    0xE3B6: 0x7F9D,
    0xE3B7: 0x7F9A,
    0xE3B8: 0x7FA3,
    0xE3B9: 0x7FAF,
    0xE3BA: 0x7FB2,
    0xE3BB: 0x7FB9,
    0xE3BC: 0x7FAE,
    0xE3BD: 0x7FB6,
    0xE3BE: 0x7FB8,
    0xE3BF: 0x8B71,
    0xE3C0: 0x7FC5,
    0xE3C1: 0x7FC6,
    0xE3C2: 0x7FCA,
    0xE3C3: 0x7FD5,
    0xE3C4: 0x7FD4,
    0xE3C5: 0x7FE1,
    0xE3C6: 0x7FE6,
    0xE3C7: 0x7FE9,
    0xE3C8: 0x7FF3,
    0xE3C9: 0x7FF9,
    0xE3CA: 0x98DC,
    0xE3CB: 0x8006,
    0xE3CC: 0x8004,
    0xE3CD: 0x800B,
    0xE3CE: 0x8012,
    0xE3CF: 0x8018,
    0xE3D0: 0x8019,
    0xE3D1: 0x801C,
    0xE3D2: 0x8021,
    0xE3D3: 0x8028,
    0xE3D4: 0x803F,
    0xE3D5: 0x803B,
    0xE3D6: 0x804A,
    0xE3D7: 0x8046,
    0xE3D8: 0x8052,
    0xE3D9: 0x8058,
    0xE3DA: 0x805A,
    0xE3DB: 0x805F,
    0xE3DC: 0x8062,
    0xE3DD: 0x8068,
    0xE3DE: 0x8073,
    0xE3DF: 0x8072,
    0xE3E0: 0x8070,
    0xE3E1: 0x8076,
    0xE3E2: 0x8079,
    0xE3E3: 0x807D,
    0xE3E4: 0x807F,
    0xE3E5: 0x8084,
    0xE3E6: 0x8086,
    0xE3E7: 0x8085,
    0xE3E8: 0x809B,
    0xE3E9: 0x8093,
    0xE3EA: 0x809A,
    0xE3EB: 0x80AD,
    0xE3EC: 0x5190,
    0xE3ED: 0x80AC,
    0xE3EE: 0x80DB,
    0xE3EF: 0x80E5,
    0xE3F0: 0x80D9,
    0xE3F1: 0x80DD,
    0xE3F2: 0x80C4,
    0xE3F3: 0x80DA,
    0xE3F4: 0x80D6,
    0xE3F5: 0x8109,
    0xE3F6: 0x80EF,
    0xE3F7: 0x80F1,
    0xE3F8: 0x811B,
    0xE3F9: 0x8129,
    0xE3FA: 0x8123,
    0xE3FB: 0x812F,
    0xE3FC: 0x814B,
    0xE440: 0x968B,
    0xE441: 0x8146,
    0xE442: 0x813E,
    0xE443: 0x8153,
    0xE444: 0x8151,
    0xE445: 0x80FC,
    0xE446: 0x8171,
    0xE447: 0x816E,
    0xE448: 0x8165,
    0xE449: 0x8166,
    0xE44A: 0x8174,
    0xE44B: 0x8183,
    0xE44C: 0x8188,
    0xE44D: 0x818A,
    0xE44E: 0x8180,
    0xE44F: 0x8182,
    0xE450: 0x81A0,
    0xE451: 0x8195,
    0xE452: 0x81A4,
    0xE453: 0x81A3,
    0xE454: 0x815F,
    0xE455: 0x8193,
    0xE456: 0x81A9,
    0xE457: 0x81B0,
    0xE458: 0x81B5,
    0xE459: 0x81BE,
    0xE45A: 0x81B8,
    0xE45B: 0x81BD,
    0xE45C: 0x81C0,
    0xE45D: 0x81C2,
    0xE45E: 0x81BA,
    0xE45F: 0x81C9,
    0xE460: 0x81CD,
    0xE461: 0x81D1,
    0xE462: 0x81D9,
    0xE463: 0x81D8,
    0xE464: 0x81C8,
    0xE465: 0x81DA,
    0xE466: 0x81DF,
    0xE467: 0x81E0,
    0xE468: 0x81E7,
    0xE469: 0x81FA,
    0xE46A: 0x81FB,
    0xE46B: 0x81FE,
    0xE46C: 0x8201,
    0xE46D: 0x8202,
    0xE46E: 0x8205,
    0xE46F: 0x8207,
    0xE470: 0x820A,
    0xE471: 0x820D,
    0xE472: 0x8210,
    0xE473: 0x8216,
    0xE474: 0x8229,
    0xE475: 0x822B,
    0xE476: 0x8238,
    0xE477: 0x8233,
    0xE478: 0x8240,
    0xE479: 0x8259,
    0xE47A: 0x8258,
    0xE47B: 0x825D,
    0xE47C: 0x825A,
    0xE47D: 0x825F,
    0xE47E: 0x8264,
    0xE480: 0x8262,
    0xE481: 0x8268,
    0xE482: 0x826A,
    0xE483: 0x826B,
    0xE484: 0x822E,
    0xE485: 0x8271,
    0xE486: 0x8277,
    0xE487: 0x8278,
    0xE488: 0x827E,
    0xE489: 0x828D,
    0xE48A: 0x8292,
    0xE48B: 0x82AB,
    0xE48C: 0x829F,
    0xE48D: 0x82BB,
    0xE48E: 0x82AC,
    0xE48F: 0x82E1,
    0xE490: 0x82E3,
    0xE491: 0x82DF,
    0xE492: 0x82D2,
    0xE493: 0x82F4,
    0xE494: 0x82F3,
    0xE495: 0x82FA,
    0xE496: 0x8393,
    0xE497: 0x8303,
    0xE498: 0x82FB,
    0xE499: 0x82F9,
    0xE49A: 0x82DE,
    0xE49B: 0x8306,
    0xE49C: 0x82DC,
    0xE49D: 0x8309,
    0xE49E: 0x82D9,
    0xE49F: 0x8335,
    0xE4A0: 0x8334,
    0xE4A1: 0x8316,
    0xE4A2: 0x8332,
    0xE4A3: 0x8331,
    0xE4A4: 0x8340,
    0xE4A5: 0x8339,
    0xE4A6: 0x8350,
    0xE4A7: 0x8345,
    0xE4A8: 0x832F,
    0xE4A9: 0x832B,
    0xE4AA: 0x8317,
    0xE4AB: 0x8318,
    0xE4AC: 0x8385,
    0xE4AD: 0x839A,
    0xE4AE: 0x83AA,
    0xE4AF: 0x839F,
    0xE4B0: 0x83A2,
    0xE4B1: 0x8396,
    0xE4B2: 0x8323,
    0xE4B3: 0x838E,
    0xE4B4: 0x8387,
    0xE4B5: 0x838A,
    0xE4B6: 0x837C,
    0xE4B7: 0x83B5,
    0xE4B8: 0x8373,
    0xE4B9: 0x8375,
    0xE4BA: 0x83A0,
    0xE4BB: 0x8389,
    0xE4BC: 0x83A8,
    0xE4BD: 0x83F4,
    0xE4BE: 0x8413,
    0xE4BF: 0x83EB,
    0xE4C0: 0x83CE,
    0xE4C1: 0x83FD,
    0xE4C2: 0x8403,
    0xE4C3: 0x83D8,
    0xE4C4: 0x840B,
    0xE4C5: 0x83C1,
    0xE4C6: 0x83F7,
    0xE4C7: 0x8407,
    0xE4C8: 0x83E0,
    0xE4C9: 0x83F2,
    0xE4CA: 0x840D,
    0xE4CB: 0x8422,
    0xE4CC: 0x8420,
    0xE4CD: 0x83BD,
    0xE4CE: 0x8438,
    0xE4CF: 0x8506,
    0xE4D0: 0x83FB,
    0xE4D1: 0x846D,
    0xE4D2: 0x842A,
    0xE4D3: 0x843C,
    0xE4D4: 0x855A,
    0xE4D5: 0x8484,
    0xE4D6: 0x8477,
    0xE4D7: 0x846B,
    0xE4D8: 0x84AD,
    0xE4D9: 0x846E,
    0xE4DA: 0x8482,
    0xE4DB: 0x8469,
    0xE4DC: 0x8446,
    0xE4DD: 0x842C,
    0xE4DE: 0x846F,
    0xE4DF: 0x8479,
    0xE4E0: 0x8435,
    0xE4E1: 0x84CA,
    0xE4E2: 0x8462,
    0xE4E3: 0x84B9,
    0xE4E4: 0x84BF,
    0xE4E5: 0x849F,
    0xE4E6: 0x84D9,
    0xE4E7: 0x84CD,
    0xE4E8: 0x84BB,
    0xE4E9: 0x84DA,
    0xE4EA: 0x84D0,
    0xE4EB: 0x84C1,
    0xE4EC: 0x84C6,
    0xE4ED: 0x84D6,
    0xE4EE: 0x84A1,
    0xE4EF: 0x8521,
    0xE4F0: 0x84FF,
    0xE4F1: 0x84F4,
    0xE4F2: 0x8517,
    0xE4F3: 0x8518,
    0xE4F4: 0x852C,
    0xE4F5: 0x851F,
    0xE4F6: 0x8515,
    0xE4F7: 0x8514,
    0xE4F8: 0x84FC,
    0xE4F9: 0x8540,
    0xE4FA: 0x8563,
    0xE4FB: 0x8558,
    0xE4FC: 0x8548,
    0xE540: 0x8541,
    0xE541: 0x8602,
    0xE542: 0x854B,
    0xE543: 0x8555,
    0xE544: 0x8580,
    0xE545: 0x85A4,
    0xE546: 0x8588,
    0xE547: 0x8591,
    0xE548: 0x858A,
    0xE549: 0x85A8,
    0xE54A: 0x856D,
    0xE54B: 0x8594,
    0xE54C: 0x859B,
    0xE54D: 0x85EA,
    0xE54E: 0x8587,
    0xE54F: 0x859C,
    0xE550: 0x8577,
    0xE551: 0x857E,
    0xE552: 0x8590,
    0xE553: 0x85C9,
    0xE554: 0x85BA,
    0xE555: 0x85CF,
    0xE556: 0x85B9,
    0xE557: 0x85D0,
    0xE558: 0x85D5,
    0xE559: 0x85DD,
    0xE55A: 0x85E5,
    0xE55B: 0x85DC,
    0xE55C: 0x85F9,
    0xE55D: 0x860A,
    0xE55E: 0x8613,
    0xE55F: 0x860B,
    0xE560: 0x85FE,
    0xE561: 0x85FA,
    0xE562: 0x8606,
    0xE563: 0x8622,
    0xE564: 0x861A,
    0xE565: 0x8630,
    0xE566: 0x863F,
    0xE567: 0x864D,
    0xE568: 0x4E55,
    0xE569: 0x8654,
    0xE56A: 0x865F,
    0xE56B: 0x8667,
    0xE56C: 0x8671,
    0xE56D: 0x8693,
    0xE56E: 0x86A3,
    0xE56F: 0x86A9,
    0xE570: 0x86AA,
    0xE571: 0x868B,
    0xE572: 0x868C,
    0xE573: 0x86B6,
    0xE574: 0x86AF,
    0xE575: 0x86C4,
    0xE576: 0x86C6,
    0xE577: 0x86B0,
    0xE578: 0x86C9,
    0xE579: 0x8823,
    0xE57A: 0x86AB,
    0xE57B: 0x86D4,
    0xE57C: 0x86DE,
    0xE57D: 0x86E9,
    0xE57E: 0x86EC,
    0xE580: 0x86DF,
    0xE581: 0x86DB,
    0xE582: 0x86EF,
    0xE583: 0x8712,
    0xE584: 0x8706,
    0xE585: 0x8708,
    0xE586: 0x8700,
    0xE587: 0x8703,
    0xE588: 0x86FB,
    0xE589: 0x8711,
    0xE58A: 0x8709,
    0xE58B: 0x870D,
    0xE58C: 0x86F9,
    0xE58D: 0x870A,
    0xE58E: 0x8734,
    0xE58F: 0x873F,
    0xE590: 0x8737,
    0xE591: 0x873B,
    0xE592: 0x8725,
    0xE593: 0x8729,
    0xE594: 0x871A,
    0xE595: 0x8760,
    0xE596: 0x875F,
    0xE597: 0x8778,
    0xE598: 0x874C,
    0xE599: 0x874E,
    0xE59A: 0x8774,
    0xE59B: 0x8757,
    0xE59C: 0x8768,
    0xE59D: 0x876E,
    0xE59E: 0x8759,
    0xE59F: 0x8753,
    0xE5A0: 0x8763,
    0xE5A1: 0x876A,
    0xE5A2: 0x8805,
    0xE5A3: 0x87A2,
    0xE5A4: 0x879F,
    0xE5A5: 0x8782,
    0xE5A6: 0x87AF,
    0xE5A7: 0x87CB,
    0xE5A8: 0x87BD,
    0xE5A9: 0x87C0,
    0xE5AA: 0x87D0,
    0xE5AB: 0x96D6,
    0xE5AC: 0x87AB,
    0xE5AD: 0x87C4,
    0xE5AE: 0x87B3,
    0xE5AF: 0x87C7,
    0xE5B0: 0x87C6,
    0xE5B1: 0x87BB,
    0xE5B2: 0x87EF,
    0xE5B3: 0x87F2,
    0xE5B4: 0x87E0,
    0xE5B5: 0x880F,
    0xE5B6: 0x880D,
    0xE5B7: 0x87FE,
    0xE5B8: 0x87F6,
    0xE5B9: 0x87F7,
    0xE5BA: 0x880E,
    0xE5BB: 0x87D2,
    0xE5BC: 0x8811,
    0xE5BD: 0x8816,
    0xE5BE: 0x8815,
    0xE5BF: 0x8822,
    0xE5C0: 0x8821,
    0xE5C1: 0x8831,
    0xE5C2: 0x8836,
    0xE5C3: 0x8839,
    0xE5C4: 0x8827,
    0xE5C5: 0x883B,
    0xE5C6: 0x8844,
    0xE5C7: 0x8842,
    0xE5C8: 0x8852,
    0xE5C9: 0x8859,
    0xE5CA: 0x885E,
    0xE5CB: 0x8862,
    0xE5CC: 0x886B,
    0xE5CD: 0x8881,
    0xE5CE: 0x887E,
    0xE5CF: 0x889E,
    0xE5D0: 0x8875,
    0xE5D1: 0x887D,
    0xE5D2: 0x88B5,
    0xE5D3: 0x8872,
    0xE5D4: 0x8882,
    0xE5D5: 0x8897,
    0xE5D6: 0x8892,
    0xE5D7: 0x88AE,
    0xE5D8: 0x8899,
    0xE5D9: 0x88A2,
    0xE5DA: 0x888D,
    0xE5DB: 0x88A4,
    0xE5DC: 0x88B0,
    0xE5DD: 0x88BF,
    0xE5DE: 0x88B1,
    0xE5DF: 0x88C3,
    0xE5E0: 0x88C4,
    0xE5E1: 0x88D4,
    0xE5E2: 0x88D8,
    0xE5E3: 0x88D9,
    0xE5E4: 0x88DD,
    0xE5E5: 0x88F9,
    0xE5E6: 0x8902,
    0xE5E7: 0x88FC,
    0xE5E8: 0x88F4,
    0xE5E9: 0x88E8,
    0xE5EA: 0x88F2,
    0xE5EB: 0x8904,
    0xE5EC: 0x890C,
    0xE5ED: 0x890A,
    0xE5EE: 0x8913,
    0xE5EF: 0x8943,
    0xE5F0: 0x891E,
    0xE5F1: 0x8925,
    0xE5F2: 0x892A,
    0xE5F3: 0x892B,
    0xE5F4: 0x8941,
    0xE5F5: 0x8944,
    0xE5F6: 0x893B,
    0xE5F7: 0x8936,
    0xE5F8: 0x8938,
    0xE5F9: 0x894C,
    0xE5FA: 0x891D,
    0xE5FB: 0x8960,
    0xE5FC: 0x895E,
    0xE640: 0x8966,
    0xE641: 0x8964,
    0xE642: 0x896D,
    0xE643: 0x896A,
    0xE644: 0x896F,
    0xE645: 0x8974,
    0xE646: 0x8977,
    0xE647: 0x897E,
    0xE648: 0x8983,
    0xE649: 0x8988,
    0xE64A: 0x898A,
    0xE64B: 0x8993,
    0xE64C: 0x8998,
    0xE64D: 0x89A1,
    0xE64E: 0x89A9,
    0xE64F: 0x89A6,
    0xE650: 0x89AC,
    0xE651: 0x89AF,
    0xE652: 0x89B2,
    0xE653: 0x89BA,
    0xE654: 0x89BD,
    0xE655: 0x89BF,
    0xE656: 0x89C0,
    0xE657: 0x89DA,
    0xE658: 0x89DC,
    0xE659: 0x89DD,
    0xE65A: 0x89E7,
    0xE65B: 0x89F4,
    0xE65C: 0x89F8,
    0xE65D: 0x8A03,
    0xE65E: 0x8A16,
    0xE65F: 0x8A10,
    0xE660: 0x8A0C,
    0xE661: 0x8A1B,
    0xE662: 0x8A1D,
    0xE663: 0x8A25,
    0xE664: 0x8A36,
    0xE665: 0x8A41,
    0xE666: 0x8A5B,
    0xE667: 0x8A52,
    0xE668: 0x8A46,
    0xE669: 0x8A48,
    0xE66A: 0x8A7C,
    0xE66B: 0x8A6D,
    0xE66C: 0x8A6C,
    0xE66D: 0x8A62,
    0xE66E: 0x8A85,
    0xE66F: 0x8A82,
    0xE670: 0x8A84,
    0xE671: 0x8AA8,
    0xE672: 0x8AA1,
    0xE673: 0x8A91,
    0xE674: 0x8AA5,
    0xE675: 0x8AA6,
    0xE676: 0x8A9A,
    0xE677: 0x8AA3,
    0xE678: 0x8AC4,
    0xE679: 0x8ACD,
    0xE67A: 0x8AC2,
    0xE67B: 0x8ADA,
    0xE67C: 0x8AEB,
    0xE67D: 0x8AF3,
    0xE67E: 0x8AE7,
    0xE680: 0x8AE4,
    0xE681: 0x8AF1,
    0xE682: 0x8B14,
    0xE683: 0x8AE0,
    0xE684: 0x8AE2,
    0xE685: 0x8AF7,
    0xE686: 0x8ADE,
    0xE687: 0x8ADB,
    0xE688: 0x8B0C,
    0xE689: 0x8B07,
    0xE68A: 0x8B1A,
    0xE68B: 0x8AE1,
    0xE68C: 0x8B16,
    0xE68D: 0x8B10,
    0xE68E: 0x8B17,
    0xE68F: 0x8B20,
    0xE690: 0x8B33,
    0xE691: 0x97AB,
    0xE692: 0x8B26,
    0xE693: 0x8B2B,
    0xE694: 0x8B3E,
    0xE695: 0x8B28,
    0xE696: 0x8B41,
    0xE697: 0x8B4C,
    0xE698: 0x8B4F,
    0xE699: 0x8B4E,
    0xE69A: 0x8B49,
    0xE69B: 0x8B56,
    0xE69C: 0x8B5B,
    0xE69D: 0x8B5A,
    0xE69E: 0x8B6B,
    0xE69F: 0x8B5F,
    0xE6A0: 0x8B6C,
    0xE6A1: 0x8B6F,
    0xE6A2: 0x8B74,
    0xE6A3: 0x8B7D,
    0xE6A4: 0x8B80,
    0xE6A5: 0x8B8C,
    0xE6A6: 0x8B8E,
    0xE6A7: 0x8B92,
    0xE6A8: 0x8B93,
    0xE6A9: 0x8B96,
    0xE6AA: 0x8B99,
    0xE6AB: 0x8B9A,
    0xE6AC: 0x8C3A,
    0xE6AD: 0x8C41,
    0xE6AE: 0x8C3F,
    0xE6AF: 0x8C48,
    0xE6B0: 0x8C4C,
    0xE6B1: 0x8C4E,
    0xE6B2: 0x8C50,
    0xE6B3: 0x8C55,
    0xE6B4: 0x8C62,
    0xE6B5: 0x8C6C,
    0xE6B6: 0x8C78,
    0xE6B7: 0x8C7A,
    0xE6B8: 0x8C82,
    0xE6B9: 0x8C89,
    0xE6BA: 0x8C85,
    0xE6BB: 0x8C8A,
    0xE6BC: 0x8C8D,
    0xE6BD: 0x8C8E,
    0xE6BE: 0x8C94,
    0xE6BF: 0x8C7C,
    0xE6C0: 0x8C98,
    0xE6C1: 0x621D,
    0xE6C2: 0x8CAD,
    0xE6C3: 0x8CAA,
    0xE6C4: 0x8CBD,
    0xE6C5: 0x8CB2,
    0xE6C6: 0x8CB3,
    0xE6C7: 0x8CAE,
    0xE6C8: 0x8CB6,
    0xE6C9: 0x8CC8,
    0xE6CA: 0x8CC1,
    0xE6CB: 0x8CE4,
    0xE6CC: 0x8CE3,
    0xE6CD: 0x8CDA,
    0xE6CE: 0x8CFD,
    0xE6CF: 0x8CFA,
    0xE6D0: 0x8CFB,
    0xE6D1: 0x8D04,
    0xE6D2: 0x8D05,
    0xE6D3: 0x8D0A,
    0xE6D4: 0x8D07,
    0xE6D5: 0x8D0F,
    0xE6D6: 0x8D0D,
    0xE6D7: 0x8D10,
    0xE6D8: 0x9F4E,
    0xE6D9: 0x8D13,
    0xE6DA: 0x8CCD,
    0xE6DB: 0x8D14,
    0xE6DC: 0x8D16,
    0xE6DD: 0x8D67,
    0xE6DE: 0x8D6D,
    0xE6DF: 0x8D71,
    0xE6E0: 0x8D73,
    0xE6E1: 0x8D81,
    0xE6E2: 0x8D99,
    0xE6E3: 0x8DC2,
    0xE6E4: 0x8DBE,
    0xE6E5: 0x8DBA,
    0xE6E6: 0x8DCF,
    0xE6E7: 0x8DDA,
    0xE6E8: 0x8DD6,
    0xE6E9: 0x8DCC,
    0xE6EA: 0x8DDB,
    0xE6EB: 0x8DCB,
    0xE6EC: 0x8DEA,
    0xE6ED: 0x8DEB,
    0xE6EE: 0x8DDF,
    0xE6EF: 0x8DE3,
    0xE6F0: 0x8DFC,
    0xE6F1: 0x8E08,
    0xE6F2: 0x8E09,
    0xE6F3: 0x8DFF,
    0xE6F4: 0x8E1D,
    0xE6F5: 0x8E1E,
    0xE6F6: 0x8E10,
    0xE6F7: 0x8E1F,
    0xE6F8: 0x8E42,
    0xE6F9: 0x8E35,
    0xE6FA: 0x8E30,
    0xE6FB: 0x8E34,
    0xE6FC: 0x8E4A,
    0xE740: 0x8E47,
    0xE741: 0x8E49,
    0xE742: 0x8E4C,
    0xE743: 0x8E50,
    0xE744: 0x8E48,
    0xE745: 0x8E59,
    0xE746: 0x8E64,
    0xE747: 0x8E60,
    0xE748: 0x8E2A,
    0xE749: 0x8E63,
    0xE74A: 0x8E55,
    0xE74B: 0x8E76,
    0xE74C: 0x8E72,
    0xE74D: 0x8E7C,
    0xE74E: 0x8E81,
    0xE74F: 0x8E87,
    0xE750: 0x8E85,
    0xE751: 0x8E84,
    0xE752: 0x8E8B,
    0xE753: 0x8E8A,
    0xE754: 0x8E93,
    0xE755: 0x8E91,
    0xE756: 0x8E94,
    0xE757: 0x8E99,
    0xE758: 0x8EAA,
    0xE759: 0x8EA1,
    0xE75A: 0x8EAC,
    0xE75B: 0x8EB0,
    0xE75C: 0x8EC6,
    0xE75D: 0x8EB1,
    0xE75E: 0x8EBE,
    0xE75F: 0x8EC5,
    0xE760: 0x8EC8,
    0xE761: 0x8ECB,
    0xE762: 0x8EDB,
    0xE763: 0x8EE3,
    0xE764: 0x8EFC,
    0xE765: 0x8EFB,
    0xE766: 0x8EEB,
    0xE767: 0x8EFE,
    0xE768: 0x8F0A,
    0xE769: 0x8F05,
    0xE76A: 0x8F15,
    0xE76B: 0x8F12,
    0xE76C: 0x8F19,
    0xE76D: 0x8F13,
    0xE76E: 0x8F1C,
    0xE76F: 0x8F1F,
    0xE770: 0x8F1B,
    0xE771: 0x8F0C,
    0xE772: 0x8F26,
    0xE773: 0x8F33,
    0xE774: 0x8F3B,
    0xE775: 0x8F39,
    0xE776: 0x8F45,
    0xE777: 0x8F42,
    0xE778: 0x8F3E,
    0xE779: 0x8F4C,
    0xE77A: 0x8F49,
    0xE77B: 0x8F46,
    0xE77C: 0x8F4E,
    0xE77D: 0x8F57,
    0xE77E: 0x8F5C,
    0xE780: 0x8F62,
    0xE781: 0x8F63,
    0xE782: 0x8F64,
    0xE783: 0x8F9C,
    0xE784: 0x8F9F,
    0xE785: 0x8FA3,
    0xE786: 0x8FAD,
    0xE787: 0x8FAF,
    0xE788: 0x8FB7,
    0xE789: 0x8FDA,
    0xE78A: 0x8FE5,
    0xE78B: 0x8FE2,
    0xE78C: 0x8FEA,
    0xE78D: 0x8FEF,
    0xE78E: 0x9087,
    0xE78F: 0x8FF4,
    0xE790: 0x9005,
    0xE791: 0x8FF9,
    0xE792: 0x8FFA,
    0xE793: 0x9011,
    0xE794: 0x9015,
    0xE795: 0x9021,
    0xE796: 0x900D,
    0xE797: 0x901E,
    0xE798: 0x9016,
    0xE799: 0x900B,
    0xE79A: 0x9027,
    0xE79B: 0x9036,
    0xE79C: 0x9035,
    0xE79D: 0x9039,
    0xE79E: 0x8FF8,
    0xE79F: 0x904F,
    0xE7A0: 0x9050,
    0xE7A1: 0x9051,
    0xE7A2: 0x9052,
    0xE7A3: 0x900E,
    0xE7A4: 0x9049,
    0xE7A5: 0x903E,
    0xE7A6: 0x9056,
    0xE7A7: 0x9058,
    0xE7A8: 0x905E,
    0xE7A9: 0x9068,
    0xE7AA: 0x906F,
    0xE7AB: 0x9076,
    0xE7AC: 0x96A8,
    0xE7AD: 0x9072,
    0xE7AE: 0x9082,
    0xE7AF: 0x907D,
    0xE7B0: 0x9081,
    0xE7B1: 0x9080,
    0xE7B2: 0x908A,
    0xE7B3: 0x9089,
    0xE7B4: 0x908F,
    0xE7B5: 0x90A8,
    0xE7B6: 0x90AF,
    0xE7B7: 0x90B1,
    0xE7B8: 0x90B5,
    0xE7B9: 0x90E2,
    0xE7BA: 0x90E4,
    0xE7BB: 0x6248,
    0xE7BC: 0x90DB,
    0xE7BD: 0x9102,
    0xE7BE: 0x9112,
    0xE7BF: 0x9119,
    0xE7C0: 0x9132,
    0xE7C1: 0x9130,
    0xE7C2: 0x914A,
    0xE7C3: 0x9156,
    0xE7C4: 0x9158,
    0xE7C5: 0x9163,
    0xE7C6: 0x9165,
    0xE7C7: 0x9169,
    0xE7C8: 0x9173,
    0xE7C9: 0x9172,
    0xE7CA: 0x918B,
    0xE7CB: 0x9189,
    0xE7CC: 0x9182,
    0xE7CD: 0x91A2,
    0xE7CE: 0x91AB,
    0xE7CF: 0x91AF,
    0xE7D0: 0x91AA,
    0xE7D1: 0x91B5,
    0xE7D2: 0x91B4,
    0xE7D3: 0x91BA,
    0xE7D4: 0x91C0,
    0xE7D5: 0x91C1,
    0xE7D6: 0x91C9,
    0xE7D7: 0x91CB,
    0xE7D8: 0x91D0,
    0xE7D9: 0x91D6,
    0xE7DA: 0x91DF,
    0xE7DB: 0x91E1,
    0xE7DC: 0x91DB,
    0xE7DD: 0x91FC,
    0xE7DE: 0x91F5,
    0xE7DF: 0x91F6,
    0xE7E0: 0x921E,
    0xE7E1: 0x91FF,
    0xE7E2: 0x9214,
    0xE7E3: 0x922C,
    0xE7E4: 0x9215,
    0xE7E5: 0x9211,
    0xE7E6: 0x925E,
    0xE7E7: 0x9257,
    0xE7E8: 0x9245,
    0xE7E9: 0x9249,
    0xE7EA: 0x9264,
    0xE7EB: 0x9248,
    0xE7EC: 0x9295,
    0xE7ED: 0x923F,
    0xE7EE: 0x924B,
    0xE7EF: 0x9250,
    0xE7F0: 0x929C,
    0xE7F1: 0x9296,
    0xE7F2: 0x9293,
    0xE7F3: 0x929B,
    0xE7F4: 0x925A,
    0xE7F5: 0x92CF,
    0xE7F6: 0x92B9,
    0xE7F7: 0x92B7,
    0xE7F8: 0x92E9,
    0xE7F9: 0x930F,
    0xE7FA: 0x92FA,
    0xE7FB: 0x9344,
    0xE7FC: 0x932E,
    0xE840: 0x9319,
    0xE841: 0x9322,
    0xE842: 0x931A,
    0xE843: 0x9323,
    0xE844: 0x933A,
    0xE845: 0x9335,
    0xE846: 0x933B,
    0xE847: 0x935C,
    0xE848: 0x9360,
    0xE849: 0x937C,
    0xE84A: 0x936E,
    0xE84B: 0x9356,
    0xE84C: 0x93B0,
    0xE84D: 0x93AC,
    0xE84E: 0x93AD,
    0xE84F: 0x9394,
    0xE850: 0x93B9,
    0xE851: 0x93D6,
    0xE852: 0x93D7,
    0xE853: 0x93E8,
    0xE854: 0x93E5,
    0xE855: 0x93D8,
    0xE856: 0x93C3,
    0xE857: 0x93DD,
    0xE858: 0x93D0,
    0xE859: 0x93C8,
    0xE85A: 0x93E4,
    0xE85B: 0x941A,
    0xE85C: 0x9414,
    0xE85D: 0x9413,
    0xE85E: 0x9403,
    0xE85F: 0x9407,
    0xE860: 0x9410,
    0xE861: 0x9436,
    0xE862: 0x942B,
    0xE863: 0x9435,
    0xE864: 0x9421,
    0xE865: 0x943A,
    0xE866: 0x9441,
    0xE867: 0x9452,
    0xE868: 0x9444,
    0xE869: 0x945B,
    0xE86A: 0x9460,
    0xE86B: 0x9462,
    0xE86C: 0x945E,
    0xE86D: 0x946A,
    0xE86E: 0x9229,
    0xE86F: 0x9470,
    0xE870: 0x9475,
    0xE871: 0x9477,
    0xE872: 0x947D,
    0xE873: 0x945A,
    0xE874: 0x947C,
    0xE875: 0x947E,
    0xE876: 0x9481,
    0xE877: 0x947F,
    0xE878: 0x9582,
    0xE879: 0x9587,
    0xE87A: 0x958A,
    0xE87B: 0x9594,
    0xE87C: 0x9596,
    0xE87D: 0x9598,
    0xE87E: 0x9599,
    0xE880: 0x95A0,
    0xE881: 0x95A8,
    0xE882: 0x95A7,
    0xE883: 0x95AD,
    0xE884: 0x95BC,
    0xE885: 0x95BB,
    0xE886: 0x95B9,
    0xE887: 0x95BE,
    0xE888: 0x95CA,
    0xE889: 0x6FF6,
    0xE88A: 0x95C3,
    0xE88B: 0x95CD,
    0xE88C: 0x95CC,
    0xE88D: 0x95D5,
    0xE88E: 0x95D4,
    0xE88F: 0x95D6,
    0xE890: 0x95DC,
    0xE891: 0x95E1,
    0xE892: 0x95E5,
    0xE893: 0x95E2,
    0xE894: 0x9621,
    0xE895: 0x9628,
    0xE896: 0x962E,
    0xE897: 0x962F,
    0xE898: 0x9642,
    0xE899: 0x964C,
    0xE89A: 0x964F,
    0xE89B: 0x964B,
    0xE89C: 0x9677,
    0xE89D: 0x965C,
    0xE89E: 0x965E,
    0xE89F: 0x965D,
    0xE8A0: 0x965F,
    0xE8A1: 0x9666,
    0xE8A2: 0x9672,
    0xE8A3: 0x966C,
    0xE8A4: 0x968D,
    0xE8A5: 0x9698,
    0xE8A6: 0x9695,
    0xE8A7: 0x9697,
    0xE8A8: 0x96AA,
    0xE8A9: 0x96A7,
    0xE8AA: 0x96B1,
    0xE8AB: 0x96B2,
    0xE8AC: 0x96B0,
    0xE8AD: 0x96B4,
    0xE8AE: 0x96B6,
    0xE8AF: 0x96B8,
    0xE8B0: 0x96B9,
    0xE8B1: 0x96CE,
    0xE8B2: 0x96CB,
    0xE8B3: 0x96C9,
    0xE8B4: 0x96CD,
    0xE8B5: 0x894D,
    0xE8B6: 0x96DC,
    0xE8B7: 0x970D,
    0xE8B8: 0x96D5,
    0xE8B9: 0x96F9,
    0xE8BA: 0x9704,
    0xE8BB: 0x9706,
    0xE8BC: 0x9708,
    0xE8BD: 0x9713,
    0xE8BE: 0x970E,
    0xE8BF: 0x9711,
    0xE8C0: 0x970F,
    0xE8C1: 0x9716,
    0xE8C2: 0x9719,
    0xE8C3: 0x9724,
    0xE8C4: 0x972A,
    0xE8C5: 0x9730,
    0xE8C6: 0x9739,
    0xE8C7: 0x973D,
    0xE8C8: 0x973E,
    0xE8C9: 0x9744,
    0xE8CA: 0x9746,
    0xE8CB: 0x9748,
    0xE8CC: 0x9742,
    0xE8CD: 0x9749,
    0xE8CE: 0x975C,
    0xE8CF: 0x9760,
    0xE8D0: 0x9764,
    0xE8D1: 0x9766,
    0xE8D2: 0x9768,
    0xE8D3: 0x52D2,
    0xE8D4: 0x976B,
    0xE8D5: 0x9771,
    0xE8D6: 0x9779,
    0xE8D7: 0x9785,
    0xE8D8: 0x977C,
    0xE8D9: 0x9781,
    0xE8DA: 0x977A,
    0xE8DB: 0x9786,
    0xE8DC: 0x978B,
    0xE8DD: 0x978F,
    0xE8DE: 0x9790,
    0xE8DF: 0x979C,
    0xE8E0: 0x97A8,
    0xE8E1: 0x97A6,
    0xE8E2: 0x97A3,
    0xE8E3: 0x97B3,
    0xE8E4: 0x97B4,
    0xE8E5: 0x97C3,
    0xE8E6: 0x97C6,
    0xE8E7: 0x97C8,
    0xE8E8: 0x97CB,
    0xE8E9: 0x97DC,
    0xE8EA: 0x97ED,
    0xE8EB: 0x9F4F,
    0xE8EC: 0x97F2,
    0xE8ED: 0x7ADF,
    0xE8EE: 0x97F6,
    0xE8EF: 0x97F5,
    0xE8F0: 0x980F,
    0xE8F1: 0x980C,
    0xE8F2: 0x9838,
    0xE8F3: 0x9824,
    0xE8F4: 0x9821,
    0xE8F5: 0x9837,
    0xE8F6: 0x983D,
    0xE8F7: 0x9846,
    0xE8F8: 0x984F,
    0xE8F9: 0x984B,
    0xE8FA: 0x986B,
    0xE8FB: 0x986F,
    0xE8FC: 0x9870,
    0xE940: 0x9871,
    0xE941: 0x9874,
    0xE942: 0x9873,
    0xE943: 0x98AA,
    0xE944: 0x98AF,
    0xE945: 0x98B1,
    0xE946: 0x98B6,
    0xE947: 0x98C4,
    0xE948: 0x98C3,
    0xE949: 0x98C6,
    0xE94A: 0x98E9,
    0xE94B: 0x98EB,
    0xE94C: 0x9903,
    0xE94D: 0x9909,
    0xE94E: 0x9912,
    0xE94F: 0x9914,
    0xE950: 0x9918,
    0xE951: 0x9921,
    0xE952: 0x991D,
    0xE953: 0x991E,
    0xE954: 0x9924,
    0xE955: 0x9920,
    0xE956: 0x992C,
    0xE957: 0x992E,
    0xE958: 0x993D,
    0xE959: 0x993E,
    0xE95A: 0x9942,
    0xE95B: 0x9949,
    0xE95C: 0x9945,
    0xE95D: 0x9950,
    0xE95E: 0x994B,
    0xE95F: 0x9951,
    0xE960: 0x9952,
    0xE961: 0x994C,
    0xE962: 0x9955,
    0xE963: 0x9997,
    0xE964: 0x9998,
    0xE965: 0x99A5,
    0xE966: 0x99AD,
    0xE967: 0x99AE,
    0xE968: 0x99BC,
    0xE969: 0x99DF,
    0xE96A: 0x99DB,
    0xE96B: 0x99DD,
    0xE96C: 0x99D8,
    0xE96D: 0x99D1,
    0xE96E: 0x99ED,
    0xE96F: 0x99EE,
    0xE970: 0x99F1,
    0xE971: 0x99F2,
    0xE972: 0x99FB,
    0xE973: 0x99F8,
    0xE974: 0x9A01,
    0xE975: 0x9A0F,
    0xE976: 0x9A05,
    0xE977: 0x99E2,
    0xE978: 0x9A19,
    0xE979: 0x9A2B,
    0xE97A: 0x9A37,
    0xE97B: 0x9A45,
    0xE97C: 0x9A42,
    0xE97D: 0x9A40,
    0xE97E: 0x9A43,
    0xE980: 0x9A3E,
    0xE981: 0x9A55,
    0xE982: 0x9A4D,
    0xE983: 0x9A5B,
    0xE984: 0x9A57,
    0xE985: 0x9A5F,
    0xE986: 0x9A62,
    0xE987: 0x9A65,
    0xE988: 0x9A64,
    0xE989: 0x9A69,
    0xE98A: 0x9A6B,
    0xE98B: 0x9A6A,
    0xE98C: 0x9AAD,
    0xE98D: 0x9AB0,
    0xE98E: 0x9ABC,
    0xE98F: 0x9AC0,
    0xE990: 0x9ACF,
    0xE991: 0x9AD1,
    0xE992: 0x9AD3,
    0xE993: 0x9AD4,
    0xE994: 0x9ADE,
    0xE995: 0x9ADF,
    0xE996: 0x9AE2,
    0xE997: 0x9AE3,
    0xE998: 0x9AE6,
    0xE999: 0x9AEF,
    0xE99A: 0x9AEB,
    0xE99B: 0x9AEE,
    0xE99C: 0x9AF4,
    0xE99D: 0x9AF1,
    0xE99E: 0x9AF7,
    0xE99F: 0x9AFB,
    0xE9A0: 0x9B06,
    0xE9A1: 0x9B18,
    0xE9A2: 0x9B1A,
    0xE9A3: 0x9B1F,
    0xE9A4: 0x9B22,
    0xE9A5: 0x9B23,
    0xE9A6: 0x9B25,
    0xE9A7: 0x9B27,
    0xE9A8: 0x9B28,
    0xE9A9: 0x9B29,
    0xE9AA: 0x9B2A,
    0xE9AB: 0x9B2E,
    0xE9AC: 0x9B2F,
    0xE9AD: 0x9B32,
    0xE9AE: 0x9B44,
    0xE9AF: 0x9B43,
    0xE9B0: 0x9B4F,
    0xE9B1: 0x9B4D,
    0xE9B2: 0x9B4E,
    0xE9B3: 0x9B51,
    0xE9B4: 0x9B58,
    0xE9B5: 0x9B74,
    0xE9B6: 0x9B93,
    0xE9B7: 0x9B83,
    0xE9B8: 0x9B91,
    0xE9B9: 0x9B96,
    0xE9BA: 0x9B97,
    0xE9BB: 0x9B9F,
    0xE9BC: 0x9BA0,
    0xE9BD: 0x9BA8,
    0xE9BE: 0x9BB4,
    0xE9BF: 0x9BC0,
    0xE9C0: 0x9BCA,
    0xE9C1: 0x9BB9,
    0xE9C2: 0x9BC6,
    0xE9C3: 0x9BCF,
    0xE9C4: 0x9BD1,
    0xE9C5: 0x9BD2,
    0xE9C6: 0x9BE3,
    0xE9C7: 0x9BE2,
    0xE9C8: 0x9BE4,
    0xE9C9: 0x9BD4,
    0xE9CA: 0x9BE1,
    0xE9CB: 0x9C3A,
    0xE9CC: 0x9BF2,
    0xE9CD: 0x9BF1,
    0xE9CE: 0x9BF0,
    0xE9CF: 0x9C15,
    0xE9D0: 0x9C14,
    0xE9D1: 0x9C09,
    0xE9D2: 0x9C13,
    0xE9D3: 0x9C0C,
    0xE9D4: 0x9C06,
    0xE9D5: 0x9C08,
    0xE9D6: 0x9C12,
    0xE9D7: 0x9C0A,
    0xE9D8: 0x9C04,
    0xE9D9: 0x9C2E,
    0xE9DA: 0x9C1B,
    0xE9DB: 0x9C25,
    0xE9DC: 0x9C24,
    0xE9DD: 0x9C21,
    0xE9DE: 0x9C30,
    0xE9DF: 0x9C47,
    0xE9E0: 0x9C32,
    0xE9E1: 0x9C46,
    0xE9E2: 0x9C3E,
    0xE9E3: 0x9C5A,
    0xE9E4: 0x9C60,
    0xE9E5: 0x9C67,
    0xE9E6: 0x9C76,
    0xE9E7: 0x9C78,
    0xE9E8: 0x9CE7,
    0xE9E9: 0x9CEC,
    0xE9EA: 0x9CF0,
    0xE9EB: 0x9D09,
    0xE9EC: 0x9D08,
    0xE9ED: 0x9CEB,
    0xE9EE: 0x9D03,
    0xE9EF: 0x9D06,
    0xE9F0: 0x9D2A,
    0xE9F1: 0x9D26,
    0xE9F2: 0x9DAF,
    0xE9F3: 0x9D23,
    0xE9F4: 0x9D1F,
    0xE9F5: 0x9D44,
    0xE9F6: 0x9D15,
    0xE9F7: 0x9D12,
    0xE9F8: 0x9D41,
    0xE9F9: 0x9D3F,
    0xE9FA: 0x9D3E,
    0xE9FB: 0x9D46,
    0xE9FC: 0x9D48,
    0xEA40: 0x9D5D,
    0xEA41: 0x9D5E,
    0xEA42: 0x9D64,
    0xEA43: 0x9D51,
    0xEA44: 0x9D50,
    0xEA45: 0x9D59,
    0xEA46: 0x9D72,
    0xEA47: 0x9D89,
    0xEA48: 0x9D87,
    0xEA49: 0x9DAB,
    0xEA4A: 0x9D6F,
    0xEA4B: 0x9D7A,
    0xEA4C: 0x9D9A,
    0xEA4D: 0x9DA4,
    0xEA4E: 0x9DA9,
    0xEA4F: 0x9DB2,
    0xEA50: 0x9DC4,
    0xEA51: 0x9DC1,
    0xEA52: 0x9DBB,
    0xEA53: 0x9DB8,
    0xEA54: 0x9DBA,
    0xEA55: 0x9DC6,
    0xEA56: 0x9DCF,
    0xEA57: 0x9DC2,
    0xEA58: 0x9DD9,
    0xEA59: 0x9DD3,
    0xEA5A: 0x9DF8,
    0xEA5B: 0x9DE6,
    0xEA5C: 0x9DED,
    0xEA5D: 0x9DEF,
    0xEA5E: 0x9DFD,
    0xEA5F: 0x9E1A,
    0xEA60: 0x9E1B,
    0xEA61: 0x9E1E,
    0xEA62: 0x9E75,
    0xEA63: 0x9E79,
    0xEA64: 0x9E7D,
    0xEA65: 0x9E81,
    0xEA66: 0x9E88,
    0xEA67: 0x9E8B,
    0xEA68: 0x9E8C,
    0xEA69: 0x9E92,
    0xEA6A: 0x9E95,
    0xEA6B: 0x9E91,
    0xEA6C: 0x9E9D,
    0xEA6D: 0x9EA5,
    0xEA6E: 0x9EA9,
    0xEA6F: 0x9EB8,
    0xEA70: 0x9EAA,
    0xEA71: 0x9EAD,
    0xEA72: 0x9761,
    0xEA73: 0x9ECC,
    0xEA74: 0x9ECE,
    0xEA75: 0x9ECF,
    0xEA76: 0x9ED0,
    0xEA77: 0x9ED4,
    0xEA78: 0x9EDC,
    0xEA79: 0x9EDE,
    0xEA7A: 0x9EDD,
    0xEA7B: 0x9EE0,
    0xEA7C: 0x9EE5,
    0xEA7D: 0x9EE8,
    0xEA7E: 0x9EEF,
    0xEA80: 0x9EF4,
    0xEA81: 0x9EF6,
    0xEA82: 0x9EF7,
    0xEA83: 0x9EF9,
    0xEA84: 0x9EFB,
    0xEA85: 0x9EFC,
    0xEA86: 0x9EFD,
    0xEA87: 0x9F07,
    0xEA88: 0x9F08,
    0xEA89: 0x76B7,
    0xEA8A: 0x9F15,
    0xEA8B: 0x9F21,
    0xEA8C: 0x9F2C,
    0xEA8D: 0x9F3E,
    0xEA8E: 0x9F4A,
    0xEA8F: 0x9F52,
    0xEA90: 0x9F54,
    0xEA91: 0x9F63,
    0xEA92: 0x9F5F,
    0xEA93: 0x9F60,
    0xEA94: 0x9F61,
    0xEA95: 0x9F66,
    0xEA96: 0x9F67,
    0xEA97: 0x9F6C,
    0xEA98: 0x9F6A,
    0xEA99: 0x9F77,
    0xEA9A: 0x9F72,
    0xEA9B: 0x9F76,
    0xEA9C: 0x9F95,
    0xEA9D: 0x9F9C,
    0xEA9E: 0x9FA0,
    0xEA9F: 0x582F,
    0xEAA0: 0x69C7,
    0xEAA1: 0x9059,
    0xEAA2: 0x7464,
    0xEAA3: 0x51DC,
    0xEAA4: 0x7199,
};


/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var GenericGF_1 = __webpack_require__(1);
var GenericGFPoly_1 = __webpack_require__(2);
function runEuclideanAlgorithm(field, a, b, R) {
    var _a;
    // Assume a's degree is >= b's
    if (a.degree() < b.degree()) {
        _a = [b, a], a = _a[0], b = _a[1];
    }
    var rLast = a;
    var r = b;
    var tLast = field.zero;
    var t = field.one;
    // Run Euclidean algorithm until r's degree is less than R/2
    while (r.degree() >= R / 2) {
        var rLastLast = rLast;
        var tLastLast = tLast;
        rLast = r;
        tLast = t;
        // Divide rLastLast by rLast, with quotient in q and remainder in r
        if (rLast.isZero()) {
            // Euclidean algorithm already terminated?
            return null;
        }
        r = rLastLast;
        var q = field.zero;
        var denominatorLeadingTerm = rLast.getCoefficient(rLast.degree());
        var dltInverse = field.inverse(denominatorLeadingTerm);
        while (r.degree() >= rLast.degree() && !r.isZero()) {
            var degreeDiff = r.degree() - rLast.degree();
            var scale = field.multiply(r.getCoefficient(r.degree()), dltInverse);
            q = q.addOrSubtract(field.buildMonomial(degreeDiff, scale));
            r = r.addOrSubtract(rLast.multiplyByMonomial(degreeDiff, scale));
        }
        t = q.multiplyPoly(tLast).addOrSubtract(tLastLast);
        if (r.degree() >= rLast.degree()) {
            return null;
        }
    }
    var sigmaTildeAtZero = t.getCoefficient(0);
    if (sigmaTildeAtZero === 0) {
        return null;
    }
    var inverse = field.inverse(sigmaTildeAtZero);
    return [t.multiply(inverse), r.multiply(inverse)];
}
function findErrorLocations(field, errorLocator) {
    // This is a direct application of Chien's search
    var numErrors = errorLocator.degree();
    if (numErrors === 1) {
        return [errorLocator.getCoefficient(1)];
    }
    var result = new Array(numErrors);
    var errorCount = 0;
    for (var i = 1; i < field.size && errorCount < numErrors; i++) {
        if (errorLocator.evaluateAt(i) === 0) {
            result[errorCount] = field.inverse(i);
            errorCount++;
        }
    }
    if (errorCount !== numErrors) {
        return null;
    }
    return result;
}
function findErrorMagnitudes(field, errorEvaluator, errorLocations) {
    // This is directly applying Forney's Formula
    var s = errorLocations.length;
    var result = new Array(s);
    for (var i = 0; i < s; i++) {
        var xiInverse = field.inverse(errorLocations[i]);
        var denominator = 1;
        for (var j = 0; j < s; j++) {
            if (i !== j) {
                denominator = field.multiply(denominator, GenericGF_1.addOrSubtractGF(1, field.multiply(errorLocations[j], xiInverse)));
            }
        }
        result[i] = field.multiply(errorEvaluator.evaluateAt(xiInverse), field.inverse(denominator));
        if (field.generatorBase !== 0) {
            result[i] = field.multiply(result[i], xiInverse);
        }
    }
    return result;
}
function decode(bytes, twoS) {
    var outputBytes = new Uint8ClampedArray(bytes.length);
    outputBytes.set(bytes);
    var field = new GenericGF_1.default(0x011D, 256, 0); // x^8 + x^4 + x^3 + x^2 + 1
    var poly = new GenericGFPoly_1.default(field, outputBytes);
    var syndromeCoefficients = new Uint8ClampedArray(twoS);
    var error = false;
    for (var s = 0; s < twoS; s++) {
        var evaluation = poly.evaluateAt(field.exp(s + field.generatorBase));
        syndromeCoefficients[syndromeCoefficients.length - 1 - s] = evaluation;
        if (evaluation !== 0) {
            error = true;
        }
    }
    if (!error) {
        return outputBytes;
    }
    var syndrome = new GenericGFPoly_1.default(field, syndromeCoefficients);
    var sigmaOmega = runEuclideanAlgorithm(field, field.buildMonomial(twoS, 1), syndrome, twoS);
    if (sigmaOmega === null) {
        return null;
    }
    var errorLocations = findErrorLocations(field, sigmaOmega[0]);
    if (errorLocations == null) {
        return null;
    }
    var errorMagnitudes = findErrorMagnitudes(field, sigmaOmega[1], errorLocations);
    for (var i = 0; i < errorLocations.length; i++) {
        var position = outputBytes.length - 1 - field.log(errorLocations[i]);
        if (position < 0) {
            return null;
        }
        outputBytes[position] = GenericGF_1.addOrSubtractGF(outputBytes[position], errorMagnitudes[i]);
    }
    return outputBytes;
}
exports.decode = decode;


/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSIONS = [
    {
        infoBits: null,
        versionNumber: 1,
        alignmentPatternCenters: [],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 7,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 19 }],
            },
            {
                ecCodewordsPerBlock: 10,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 16 }],
            },
            {
                ecCodewordsPerBlock: 13,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 13 }],
            },
            {
                ecCodewordsPerBlock: 17,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 9 }],
            },
        ],
    },
    {
        infoBits: null,
        versionNumber: 2,
        alignmentPatternCenters: [6, 18],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 10,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 34 }],
            },
            {
                ecCodewordsPerBlock: 16,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 28 }],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 22 }],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 16 }],
            },
        ],
    },
    {
        infoBits: null,
        versionNumber: 3,
        alignmentPatternCenters: [6, 22],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 15,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 55 }],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 44 }],
            },
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 17 }],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 13 }],
            },
        ],
    },
    {
        infoBits: null,
        versionNumber: 4,
        alignmentPatternCenters: [6, 26],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 20,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 80 }],
            },
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 32 }],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 24 }],
            },
            {
                ecCodewordsPerBlock: 16,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 9 }],
            },
        ],
    },
    {
        infoBits: null,
        versionNumber: 5,
        alignmentPatternCenters: [6, 30],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [{ numBlocks: 1, dataCodewordsPerBlock: 108 }],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 43 }],
            },
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 15 },
                    { numBlocks: 2, dataCodewordsPerBlock: 16 },
                ],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 11 },
                    { numBlocks: 2, dataCodewordsPerBlock: 12 },
                ],
            },
        ],
    },
    {
        infoBits: null,
        versionNumber: 6,
        alignmentPatternCenters: [6, 34],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 68 }],
            },
            {
                ecCodewordsPerBlock: 16,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 27 }],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 19 }],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 15 }],
            },
        ],
    },
    {
        infoBits: 0x07C94,
        versionNumber: 7,
        alignmentPatternCenters: [6, 22, 38],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 20,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 78 }],
            },
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 31 }],
            },
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 14 },
                    { numBlocks: 4, dataCodewordsPerBlock: 15 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 13 },
                    { numBlocks: 1, dataCodewordsPerBlock: 14 },
                ],
            },
        ],
    },
    {
        infoBits: 0x085BC,
        versionNumber: 8,
        alignmentPatternCenters: [6, 24, 42],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 97 }],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 38 },
                    { numBlocks: 2, dataCodewordsPerBlock: 39 },
                ],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 18 },
                    { numBlocks: 2, dataCodewordsPerBlock: 19 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 14 },
                    { numBlocks: 2, dataCodewordsPerBlock: 15 },
                ],
            },
        ],
    },
    {
        infoBits: 0x09A99,
        versionNumber: 9,
        alignmentPatternCenters: [6, 26, 46],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [{ numBlocks: 2, dataCodewordsPerBlock: 116 }],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 36 },
                    { numBlocks: 2, dataCodewordsPerBlock: 37 },
                ],
            },
            {
                ecCodewordsPerBlock: 20,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 16 },
                    { numBlocks: 4, dataCodewordsPerBlock: 17 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 12 },
                    { numBlocks: 4, dataCodewordsPerBlock: 13 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0A4D3,
        versionNumber: 10,
        alignmentPatternCenters: [6, 28, 50],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 18,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 68 },
                    { numBlocks: 2, dataCodewordsPerBlock: 69 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 43 },
                    { numBlocks: 1, dataCodewordsPerBlock: 44 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 19 },
                    { numBlocks: 2, dataCodewordsPerBlock: 20 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 15 },
                    { numBlocks: 2, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0BBF6,
        versionNumber: 11,
        alignmentPatternCenters: [6, 30, 54],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 20,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 81 }],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 1, dataCodewordsPerBlock: 50 },
                    { numBlocks: 4, dataCodewordsPerBlock: 51 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 22 },
                    { numBlocks: 4, dataCodewordsPerBlock: 23 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 12 },
                    { numBlocks: 8, dataCodewordsPerBlock: 13 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0C762,
        versionNumber: 12,
        alignmentPatternCenters: [6, 32, 58],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 92 },
                    { numBlocks: 2, dataCodewordsPerBlock: 93 },
                ],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 36 },
                    { numBlocks: 2, dataCodewordsPerBlock: 37 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 20 },
                    { numBlocks: 6, dataCodewordsPerBlock: 21 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 7, dataCodewordsPerBlock: 14 },
                    { numBlocks: 4, dataCodewordsPerBlock: 15 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0D847,
        versionNumber: 13,
        alignmentPatternCenters: [6, 34, 62],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [{ numBlocks: 4, dataCodewordsPerBlock: 107 }],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 37 },
                    { numBlocks: 1, dataCodewordsPerBlock: 38 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 20 },
                    { numBlocks: 4, dataCodewordsPerBlock: 21 },
                ],
            },
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 12, dataCodewordsPerBlock: 11 },
                    { numBlocks: 4, dataCodewordsPerBlock: 12 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0E60D,
        versionNumber: 14,
        alignmentPatternCenters: [6, 26, 46, 66],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 115 },
                    { numBlocks: 1, dataCodewordsPerBlock: 116 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 40 },
                    { numBlocks: 5, dataCodewordsPerBlock: 41 },
                ],
            },
            {
                ecCodewordsPerBlock: 20,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 16 },
                    { numBlocks: 5, dataCodewordsPerBlock: 17 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 12 },
                    { numBlocks: 5, dataCodewordsPerBlock: 13 },
                ],
            },
        ],
    },
    {
        infoBits: 0x0F928,
        versionNumber: 15,
        alignmentPatternCenters: [6, 26, 48, 70],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 22,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 87 },
                    { numBlocks: 1, dataCodewordsPerBlock: 88 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 41 },
                    { numBlocks: 5, dataCodewordsPerBlock: 42 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 24 },
                    { numBlocks: 7, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 12 },
                    { numBlocks: 7, dataCodewordsPerBlock: 13 },
                ],
            },
        ],
    },
    {
        infoBits: 0x10B78,
        versionNumber: 16,
        alignmentPatternCenters: [6, 26, 50, 74],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 98 },
                    { numBlocks: 1, dataCodewordsPerBlock: 99 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 7, dataCodewordsPerBlock: 45 },
                    { numBlocks: 3, dataCodewordsPerBlock: 46 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [
                    { numBlocks: 15, dataCodewordsPerBlock: 19 },
                    { numBlocks: 2, dataCodewordsPerBlock: 20 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 15 },
                    { numBlocks: 13, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1145D,
        versionNumber: 17,
        alignmentPatternCenters: [6, 30, 54, 78],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 1, dataCodewordsPerBlock: 107 },
                    { numBlocks: 5, dataCodewordsPerBlock: 108 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 10, dataCodewordsPerBlock: 46 },
                    { numBlocks: 1, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 1, dataCodewordsPerBlock: 22 },
                    { numBlocks: 15, dataCodewordsPerBlock: 23 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 14 },
                    { numBlocks: 17, dataCodewordsPerBlock: 15 },
                ],
            },
        ],
    },
    {
        infoBits: 0x12A17,
        versionNumber: 18,
        alignmentPatternCenters: [6, 30, 56, 82],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 120 },
                    { numBlocks: 1, dataCodewordsPerBlock: 121 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 9, dataCodewordsPerBlock: 43 },
                    { numBlocks: 4, dataCodewordsPerBlock: 44 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 17, dataCodewordsPerBlock: 22 },
                    { numBlocks: 1, dataCodewordsPerBlock: 23 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 14 },
                    { numBlocks: 19, dataCodewordsPerBlock: 15 },
                ],
            },
        ],
    },
    {
        infoBits: 0x13532,
        versionNumber: 19,
        alignmentPatternCenters: [6, 30, 58, 86],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 113 },
                    { numBlocks: 4, dataCodewordsPerBlock: 114 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 44 },
                    { numBlocks: 11, dataCodewordsPerBlock: 45 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 17, dataCodewordsPerBlock: 21 },
                    { numBlocks: 4, dataCodewordsPerBlock: 22 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 9, dataCodewordsPerBlock: 13 },
                    { numBlocks: 16, dataCodewordsPerBlock: 14 },
                ],
            },
        ],
    },
    {
        infoBits: 0x149A6,
        versionNumber: 20,
        alignmentPatternCenters: [6, 34, 62, 90],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 107 },
                    { numBlocks: 5, dataCodewordsPerBlock: 108 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 41 },
                    { numBlocks: 13, dataCodewordsPerBlock: 42 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 15, dataCodewordsPerBlock: 24 },
                    { numBlocks: 5, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 15, dataCodewordsPerBlock: 15 },
                    { numBlocks: 10, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x15683,
        versionNumber: 21,
        alignmentPatternCenters: [6, 28, 50, 72, 94],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 116 },
                    { numBlocks: 4, dataCodewordsPerBlock: 117 },
                ],
            },
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [{ numBlocks: 17, dataCodewordsPerBlock: 42 }],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 17, dataCodewordsPerBlock: 22 },
                    { numBlocks: 6, dataCodewordsPerBlock: 23 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 16 },
                    { numBlocks: 6, dataCodewordsPerBlock: 17 },
                ],
            },
        ],
    },
    {
        infoBits: 0x168C9,
        versionNumber: 22,
        alignmentPatternCenters: [6, 26, 50, 74, 98],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 111 },
                    { numBlocks: 7, dataCodewordsPerBlock: 112 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [{ numBlocks: 17, dataCodewordsPerBlock: 46 }],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 7, dataCodewordsPerBlock: 24 },
                    { numBlocks: 16, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 24,
                ecBlocks: [{ numBlocks: 34, dataCodewordsPerBlock: 13 }],
            },
        ],
    },
    {
        infoBits: 0x177EC,
        versionNumber: 23,
        alignmentPatternCenters: [6, 30, 54, 74, 102],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 121 },
                    { numBlocks: 5, dataCodewordsPerBlock: 122 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 47 },
                    { numBlocks: 14, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 24 },
                    { numBlocks: 14, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 16, dataCodewordsPerBlock: 15 },
                    { numBlocks: 14, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x18EC4,
        versionNumber: 24,
        alignmentPatternCenters: [6, 28, 54, 80, 106],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 117 },
                    { numBlocks: 4, dataCodewordsPerBlock: 118 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 45 },
                    { numBlocks: 14, dataCodewordsPerBlock: 46 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 24 },
                    { numBlocks: 16, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 30, dataCodewordsPerBlock: 16 },
                    { numBlocks: 2, dataCodewordsPerBlock: 17 },
                ],
            },
        ],
    },
    {
        infoBits: 0x191E1,
        versionNumber: 25,
        alignmentPatternCenters: [6, 32, 58, 84, 110],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 26,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 106 },
                    { numBlocks: 4, dataCodewordsPerBlock: 107 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 47 },
                    { numBlocks: 13, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 7, dataCodewordsPerBlock: 24 },
                    { numBlocks: 22, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 22, dataCodewordsPerBlock: 15 },
                    { numBlocks: 13, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1AFAB,
        versionNumber: 26,
        alignmentPatternCenters: [6, 30, 58, 86, 114],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 10, dataCodewordsPerBlock: 114 },
                    { numBlocks: 2, dataCodewordsPerBlock: 115 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 46 },
                    { numBlocks: 4, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 28, dataCodewordsPerBlock: 22 },
                    { numBlocks: 6, dataCodewordsPerBlock: 23 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 33, dataCodewordsPerBlock: 16 },
                    { numBlocks: 4, dataCodewordsPerBlock: 17 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1B08E,
        versionNumber: 27,
        alignmentPatternCenters: [6, 34, 62, 90, 118],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 122 },
                    { numBlocks: 4, dataCodewordsPerBlock: 123 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 22, dataCodewordsPerBlock: 45 },
                    { numBlocks: 3, dataCodewordsPerBlock: 46 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 8, dataCodewordsPerBlock: 23 },
                    { numBlocks: 26, dataCodewordsPerBlock: 24 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 12, dataCodewordsPerBlock: 15 },
                    { numBlocks: 28, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1CC1A,
        versionNumber: 28,
        alignmentPatternCenters: [6, 26, 50, 74, 98, 122],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 117 },
                    { numBlocks: 10, dataCodewordsPerBlock: 118 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 3, dataCodewordsPerBlock: 45 },
                    { numBlocks: 23, dataCodewordsPerBlock: 46 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 24 },
                    { numBlocks: 31, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 15 },
                    { numBlocks: 31, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1D33F,
        versionNumber: 29,
        alignmentPatternCenters: [6, 30, 54, 78, 102, 126],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 7, dataCodewordsPerBlock: 116 },
                    { numBlocks: 7, dataCodewordsPerBlock: 117 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 21, dataCodewordsPerBlock: 45 },
                    { numBlocks: 7, dataCodewordsPerBlock: 46 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 1, dataCodewordsPerBlock: 23 },
                    { numBlocks: 37, dataCodewordsPerBlock: 24 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 15 },
                    { numBlocks: 26, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1ED75,
        versionNumber: 30,
        alignmentPatternCenters: [6, 26, 52, 78, 104, 130],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 5, dataCodewordsPerBlock: 115 },
                    { numBlocks: 10, dataCodewordsPerBlock: 116 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 47 },
                    { numBlocks: 10, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 15, dataCodewordsPerBlock: 24 },
                    { numBlocks: 25, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 23, dataCodewordsPerBlock: 15 },
                    { numBlocks: 25, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x1F250,
        versionNumber: 31,
        alignmentPatternCenters: [6, 30, 56, 82, 108, 134],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 13, dataCodewordsPerBlock: 115 },
                    { numBlocks: 3, dataCodewordsPerBlock: 116 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 46 },
                    { numBlocks: 29, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 42, dataCodewordsPerBlock: 24 },
                    { numBlocks: 1, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 23, dataCodewordsPerBlock: 15 },
                    { numBlocks: 28, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x209D5,
        versionNumber: 32,
        alignmentPatternCenters: [6, 34, 60, 86, 112, 138],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [{ numBlocks: 17, dataCodewordsPerBlock: 115 }],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 10, dataCodewordsPerBlock: 46 },
                    { numBlocks: 23, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 10, dataCodewordsPerBlock: 24 },
                    { numBlocks: 35, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 15 },
                    { numBlocks: 35, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x216F0,
        versionNumber: 33,
        alignmentPatternCenters: [6, 30, 58, 86, 114, 142],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 17, dataCodewordsPerBlock: 115 },
                    { numBlocks: 1, dataCodewordsPerBlock: 116 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 14, dataCodewordsPerBlock: 46 },
                    { numBlocks: 21, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 29, dataCodewordsPerBlock: 24 },
                    { numBlocks: 19, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 11, dataCodewordsPerBlock: 15 },
                    { numBlocks: 46, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x228BA,
        versionNumber: 34,
        alignmentPatternCenters: [6, 34, 62, 90, 118, 146],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 13, dataCodewordsPerBlock: 115 },
                    { numBlocks: 6, dataCodewordsPerBlock: 116 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 14, dataCodewordsPerBlock: 46 },
                    { numBlocks: 23, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 44, dataCodewordsPerBlock: 24 },
                    { numBlocks: 7, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 59, dataCodewordsPerBlock: 16 },
                    { numBlocks: 1, dataCodewordsPerBlock: 17 },
                ],
            },
        ],
    },
    {
        infoBits: 0x2379F,
        versionNumber: 35,
        alignmentPatternCenters: [6, 30, 54, 78, 102, 126, 150],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 12, dataCodewordsPerBlock: 121 },
                    { numBlocks: 7, dataCodewordsPerBlock: 122 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 12, dataCodewordsPerBlock: 47 },
                    { numBlocks: 26, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 39, dataCodewordsPerBlock: 24 },
                    { numBlocks: 14, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 22, dataCodewordsPerBlock: 15 },
                    { numBlocks: 41, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x24B0B,
        versionNumber: 36,
        alignmentPatternCenters: [6, 24, 50, 76, 102, 128, 154],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 121 },
                    { numBlocks: 14, dataCodewordsPerBlock: 122 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 6, dataCodewordsPerBlock: 47 },
                    { numBlocks: 34, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 46, dataCodewordsPerBlock: 24 },
                    { numBlocks: 10, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 2, dataCodewordsPerBlock: 15 },
                    { numBlocks: 64, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x2542E,
        versionNumber: 37,
        alignmentPatternCenters: [6, 28, 54, 80, 106, 132, 158],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 17, dataCodewordsPerBlock: 122 },
                    { numBlocks: 4, dataCodewordsPerBlock: 123 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 29, dataCodewordsPerBlock: 46 },
                    { numBlocks: 14, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 49, dataCodewordsPerBlock: 24 },
                    { numBlocks: 10, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 24, dataCodewordsPerBlock: 15 },
                    { numBlocks: 46, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x26A64,
        versionNumber: 38,
        alignmentPatternCenters: [6, 32, 58, 84, 110, 136, 162],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 4, dataCodewordsPerBlock: 122 },
                    { numBlocks: 18, dataCodewordsPerBlock: 123 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 13, dataCodewordsPerBlock: 46 },
                    { numBlocks: 32, dataCodewordsPerBlock: 47 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 48, dataCodewordsPerBlock: 24 },
                    { numBlocks: 14, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 42, dataCodewordsPerBlock: 15 },
                    { numBlocks: 32, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x27541,
        versionNumber: 39,
        alignmentPatternCenters: [6, 26, 54, 82, 110, 138, 166],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 20, dataCodewordsPerBlock: 117 },
                    { numBlocks: 4, dataCodewordsPerBlock: 118 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 40, dataCodewordsPerBlock: 47 },
                    { numBlocks: 7, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 43, dataCodewordsPerBlock: 24 },
                    { numBlocks: 22, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 10, dataCodewordsPerBlock: 15 },
                    { numBlocks: 67, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
    {
        infoBits: 0x28C69,
        versionNumber: 40,
        alignmentPatternCenters: [6, 30, 58, 86, 114, 142, 170],
        errorCorrectionLevels: [
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 19, dataCodewordsPerBlock: 118 },
                    { numBlocks: 6, dataCodewordsPerBlock: 119 },
                ],
            },
            {
                ecCodewordsPerBlock: 28,
                ecBlocks: [
                    { numBlocks: 18, dataCodewordsPerBlock: 47 },
                    { numBlocks: 31, dataCodewordsPerBlock: 48 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 34, dataCodewordsPerBlock: 24 },
                    { numBlocks: 34, dataCodewordsPerBlock: 25 },
                ],
            },
            {
                ecCodewordsPerBlock: 30,
                ecBlocks: [
                    { numBlocks: 20, dataCodewordsPerBlock: 15 },
                    { numBlocks: 61, dataCodewordsPerBlock: 16 },
                ],
            },
        ],
    },
];


/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var BitMatrix_1 = __webpack_require__(0);
function squareToQuadrilateral(p1, p2, p3, p4) {
    var dx3 = p1.x - p2.x + p3.x - p4.x;
    var dy3 = p1.y - p2.y + p3.y - p4.y;
    if (dx3 === 0 && dy3 === 0) { // Affine
        return {
            a11: p2.x - p1.x,
            a12: p2.y - p1.y,
            a13: 0,
            a21: p3.x - p2.x,
            a22: p3.y - p2.y,
            a23: 0,
            a31: p1.x,
            a32: p1.y,
            a33: 1,
        };
    }
    else {
        var dx1 = p2.x - p3.x;
        var dx2 = p4.x - p3.x;
        var dy1 = p2.y - p3.y;
        var dy2 = p4.y - p3.y;
        var denominator = dx1 * dy2 - dx2 * dy1;
        var a13 = (dx3 * dy2 - dx2 * dy3) / denominator;
        var a23 = (dx1 * dy3 - dx3 * dy1) / denominator;
        return {
            a11: p2.x - p1.x + a13 * p2.x,
            a12: p2.y - p1.y + a13 * p2.y,
            a13: a13,
            a21: p4.x - p1.x + a23 * p4.x,
            a22: p4.y - p1.y + a23 * p4.y,
            a23: a23,
            a31: p1.x,
            a32: p1.y,
            a33: 1,
        };
    }
}
function quadrilateralToSquare(p1, p2, p3, p4) {
    // Here, the adjoint serves as the inverse:
    var sToQ = squareToQuadrilateral(p1, p2, p3, p4);
    return {
        a11: sToQ.a22 * sToQ.a33 - sToQ.a23 * sToQ.a32,
        a12: sToQ.a13 * sToQ.a32 - sToQ.a12 * sToQ.a33,
        a13: sToQ.a12 * sToQ.a23 - sToQ.a13 * sToQ.a22,
        a21: sToQ.a23 * sToQ.a31 - sToQ.a21 * sToQ.a33,
        a22: sToQ.a11 * sToQ.a33 - sToQ.a13 * sToQ.a31,
        a23: sToQ.a13 * sToQ.a21 - sToQ.a11 * sToQ.a23,
        a31: sToQ.a21 * sToQ.a32 - sToQ.a22 * sToQ.a31,
        a32: sToQ.a12 * sToQ.a31 - sToQ.a11 * sToQ.a32,
        a33: sToQ.a11 * sToQ.a22 - sToQ.a12 * sToQ.a21,
    };
}
function times(a, b) {
    return {
        a11: a.a11 * b.a11 + a.a21 * b.a12 + a.a31 * b.a13,
        a12: a.a12 * b.a11 + a.a22 * b.a12 + a.a32 * b.a13,
        a13: a.a13 * b.a11 + a.a23 * b.a12 + a.a33 * b.a13,
        a21: a.a11 * b.a21 + a.a21 * b.a22 + a.a31 * b.a23,
        a22: a.a12 * b.a21 + a.a22 * b.a22 + a.a32 * b.a23,
        a23: a.a13 * b.a21 + a.a23 * b.a22 + a.a33 * b.a23,
        a31: a.a11 * b.a31 + a.a21 * b.a32 + a.a31 * b.a33,
        a32: a.a12 * b.a31 + a.a22 * b.a32 + a.a32 * b.a33,
        a33: a.a13 * b.a31 + a.a23 * b.a32 + a.a33 * b.a33,
    };
}
function extract(image, location) {
    var qToS = quadrilateralToSquare({ x: 3.5, y: 3.5 }, { x: location.dimension - 3.5, y: 3.5 }, { x: location.dimension - 6.5, y: location.dimension - 6.5 }, { x: 3.5, y: location.dimension - 3.5 });
    var sToQ = squareToQuadrilateral(location.topLeft, location.topRight, location.alignmentPattern, location.bottomLeft);
    var transform = times(sToQ, qToS);
    var matrix = BitMatrix_1.BitMatrix.createEmpty(location.dimension, location.dimension);
    var mappingFunction = function (x, y) {
        var denominator = transform.a13 * x + transform.a23 * y + transform.a33;
        return {
            x: (transform.a11 * x + transform.a21 * y + transform.a31) / denominator,
            y: (transform.a12 * x + transform.a22 * y + transform.a32) / denominator,
        };
    };
    for (var y = 0; y < location.dimension; y++) {
        for (var x = 0; x < location.dimension; x++) {
            var xValue = x + 0.5;
            var yValue = y + 0.5;
            var sourcePixel = mappingFunction(xValue, yValue);
            matrix.set(x, y, image.get(Math.floor(sourcePixel.x), Math.floor(sourcePixel.y)));
        }
    }
    return {
        matrix: matrix,
        mappingFunction: mappingFunction,
    };
}
exports.extract = extract;


/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var MAX_FINDERPATTERNS_TO_SEARCH = 4;
var MIN_QUAD_RATIO = 0.5;
var MAX_QUAD_RATIO = 1.5;
var distance = function (a, b) { return Math.sqrt(Math.pow((b.x - a.x), 2) + Math.pow((b.y - a.y), 2)); };
function sum(values) {
    return values.reduce(function (a, b) { return a + b; });
}
// Takes three finder patterns and organizes them into topLeft, topRight, etc
function reorderFinderPatterns(pattern1, pattern2, pattern3) {
    var _a, _b, _c, _d;
    // Find distances between pattern centers
    var oneTwoDistance = distance(pattern1, pattern2);
    var twoThreeDistance = distance(pattern2, pattern3);
    var oneThreeDistance = distance(pattern1, pattern3);
    var bottomLeft;
    var topLeft;
    var topRight;
    // Assume one closest to other two is B; A and C will just be guesses at first
    if (twoThreeDistance >= oneTwoDistance && twoThreeDistance >= oneThreeDistance) {
        _a = [pattern2, pattern1, pattern3], bottomLeft = _a[0], topLeft = _a[1], topRight = _a[2];
    }
    else if (oneThreeDistance >= twoThreeDistance && oneThreeDistance >= oneTwoDistance) {
        _b = [pattern1, pattern2, pattern3], bottomLeft = _b[0], topLeft = _b[1], topRight = _b[2];
    }
    else {
        _c = [pattern1, pattern3, pattern2], bottomLeft = _c[0], topLeft = _c[1], topRight = _c[2];
    }
    // Use cross product to figure out whether bottomLeft (A) and topRight (C) are correct or flipped in relation to topLeft (B)
    // This asks whether BC x BA has a positive z component, which is the arrangement we want. If it's negative, then
    // we've got it flipped around and should swap topRight and bottomLeft.
    if (((topRight.x - topLeft.x) * (bottomLeft.y - topLeft.y)) - ((topRight.y - topLeft.y) * (bottomLeft.x - topLeft.x)) < 0) {
        _d = [topRight, bottomLeft], bottomLeft = _d[0], topRight = _d[1];
    }
    return { bottomLeft: bottomLeft, topLeft: topLeft, topRight: topRight };
}
// Computes the dimension (number of modules on a side) of the QR Code based on the position of the finder patterns
function computeDimension(topLeft, topRight, bottomLeft, matrix) {
    var moduleSize = (sum(countBlackWhiteRun(topLeft, bottomLeft, matrix, 5)) / 7 + // Divide by 7 since the ratio is 1:1:3:1:1
        sum(countBlackWhiteRun(topLeft, topRight, matrix, 5)) / 7 +
        sum(countBlackWhiteRun(bottomLeft, topLeft, matrix, 5)) / 7 +
        sum(countBlackWhiteRun(topRight, topLeft, matrix, 5)) / 7) / 4;
    if (moduleSize < 1) {
        throw new Error("Invalid module size");
    }
    var topDimension = Math.round(distance(topLeft, topRight) / moduleSize);
    var sideDimension = Math.round(distance(topLeft, bottomLeft) / moduleSize);
    var dimension = Math.floor((topDimension + sideDimension) / 2) + 7;
    switch (dimension % 4) {
        case 0:
            dimension++;
            break;
        case 2:
            dimension--;
            break;
    }
    return { dimension: dimension, moduleSize: moduleSize };
}
// Takes an origin point and an end point and counts the sizes of the black white run from the origin towards the end point.
// Returns an array of elements, representing the pixel size of the black white run.
// Uses a variant of http://en.wikipedia.org/wiki/Bresenham's_line_algorithm
function countBlackWhiteRunTowardsPoint(origin, end, matrix, length) {
    var switchPoints = [{ x: Math.floor(origin.x), y: Math.floor(origin.y) }];
    var steep = Math.abs(end.y - origin.y) > Math.abs(end.x - origin.x);
    var fromX;
    var fromY;
    var toX;
    var toY;
    if (steep) {
        fromX = Math.floor(origin.y);
        fromY = Math.floor(origin.x);
        toX = Math.floor(end.y);
        toY = Math.floor(end.x);
    }
    else {
        fromX = Math.floor(origin.x);
        fromY = Math.floor(origin.y);
        toX = Math.floor(end.x);
        toY = Math.floor(end.y);
    }
    var dx = Math.abs(toX - fromX);
    var dy = Math.abs(toY - fromY);
    var error = Math.floor(-dx / 2);
    var xStep = fromX < toX ? 1 : -1;
    var yStep = fromY < toY ? 1 : -1;
    var currentPixel = true;
    // Loop up until x == toX, but not beyond
    for (var x = fromX, y = fromY; x !== toX + xStep; x += xStep) {
        // Does current pixel mean we have moved white to black or vice versa?
        // Scanning black in state 0,2 and white in state 1, so if we find the wrong
        // color, advance to next state or end if we are in state 2 already
        var realX = steep ? y : x;
        var realY = steep ? x : y;
        if (matrix.get(realX, realY) !== currentPixel) {
            currentPixel = !currentPixel;
            switchPoints.push({ x: realX, y: realY });
            if (switchPoints.length === length + 1) {
                break;
            }
        }
        error += dy;
        if (error > 0) {
            if (y === toY) {
                break;
            }
            y += yStep;
            error -= dx;
        }
    }
    var distances = [];
    for (var i = 0; i < length; i++) {
        if (switchPoints[i] && switchPoints[i + 1]) {
            distances.push(distance(switchPoints[i], switchPoints[i + 1]));
        }
        else {
            distances.push(0);
        }
    }
    return distances;
}
// Takes an origin point and an end point and counts the sizes of the black white run in the origin point
// along the line that intersects with the end point. Returns an array of elements, representing the pixel sizes
// of the black white run. Takes a length which represents the number of switches from black to white to look for.
function countBlackWhiteRun(origin, end, matrix, length) {
    var _a;
    var rise = end.y - origin.y;
    var run = end.x - origin.x;
    var towardsEnd = countBlackWhiteRunTowardsPoint(origin, end, matrix, Math.ceil(length / 2));
    var awayFromEnd = countBlackWhiteRunTowardsPoint(origin, { x: origin.x - run, y: origin.y - rise }, matrix, Math.ceil(length / 2));
    var middleValue = towardsEnd.shift() + awayFromEnd.shift() - 1; // Substract one so we don't double count a pixel
    return (_a = awayFromEnd.concat(middleValue)).concat.apply(_a, towardsEnd);
}
// Takes in a black white run and an array of expected ratios. Returns the average size of the run as well as the "error" -
// that is the amount the run diverges from the expected ratio
function scoreBlackWhiteRun(sequence, ratios) {
    var averageSize = sum(sequence) / sum(ratios);
    var error = 0;
    ratios.forEach(function (ratio, i) {
        error += Math.pow((sequence[i] - ratio * averageSize), 2);
    });
    return { averageSize: averageSize, error: error };
}
// Takes an X,Y point and an array of sizes and scores the point against those ratios.
// For example for a finder pattern takes the ratio list of 1:1:3:1:1 and checks horizontal, vertical and diagonal ratios
// against that.
function scorePattern(point, ratios, matrix) {
    try {
        var horizontalRun = countBlackWhiteRun(point, { x: -1, y: point.y }, matrix, ratios.length);
        var verticalRun = countBlackWhiteRun(point, { x: point.x, y: -1 }, matrix, ratios.length);
        var topLeftPoint = {
            x: Math.max(0, point.x - point.y) - 1,
            y: Math.max(0, point.y - point.x) - 1,
        };
        var topLeftBottomRightRun = countBlackWhiteRun(point, topLeftPoint, matrix, ratios.length);
        var bottomLeftPoint = {
            x: Math.min(matrix.width, point.x + point.y) + 1,
            y: Math.min(matrix.height, point.y + point.x) + 1,
        };
        var bottomLeftTopRightRun = countBlackWhiteRun(point, bottomLeftPoint, matrix, ratios.length);
        var horzError = scoreBlackWhiteRun(horizontalRun, ratios);
        var vertError = scoreBlackWhiteRun(verticalRun, ratios);
        var diagDownError = scoreBlackWhiteRun(topLeftBottomRightRun, ratios);
        var diagUpError = scoreBlackWhiteRun(bottomLeftTopRightRun, ratios);
        var ratioError = Math.sqrt(horzError.error * horzError.error +
            vertError.error * vertError.error +
            diagDownError.error * diagDownError.error +
            diagUpError.error * diagUpError.error);
        var avgSize = (horzError.averageSize + vertError.averageSize + diagDownError.averageSize + diagUpError.averageSize) / 4;
        var sizeError = (Math.pow((horzError.averageSize - avgSize), 2) +
            Math.pow((vertError.averageSize - avgSize), 2) +
            Math.pow((diagDownError.averageSize - avgSize), 2) +
            Math.pow((diagUpError.averageSize - avgSize), 2)) / avgSize;
        return ratioError + sizeError;
    }
    catch (_a) {
        return Infinity;
    }
}
function recenterLocation(matrix, p) {
    var leftX = Math.round(p.x);
    while (matrix.get(leftX, Math.round(p.y))) {
        leftX--;
    }
    var rightX = Math.round(p.x);
    while (matrix.get(rightX, Math.round(p.y))) {
        rightX++;
    }
    var x = (leftX + rightX) / 2;
    var topY = Math.round(p.y);
    while (matrix.get(Math.round(x), topY)) {
        topY--;
    }
    var bottomY = Math.round(p.y);
    while (matrix.get(Math.round(x), bottomY)) {
        bottomY++;
    }
    var y = (topY + bottomY) / 2;
    return { x: x, y: y };
}
function locate(matrix) {
    var finderPatternQuads = [];
    var activeFinderPatternQuads = [];
    var alignmentPatternQuads = [];
    var activeAlignmentPatternQuads = [];
    var _loop_1 = function (y) {
        var length_1 = 0;
        var lastBit = false;
        var scans = [0, 0, 0, 0, 0];
        var _loop_2 = function (x) {
            var v = matrix.get(x, y);
            if (v === lastBit) {
                length_1++;
            }
            else {
                scans = [scans[1], scans[2], scans[3], scans[4], length_1];
                length_1 = 1;
                lastBit = v;
                // Do the last 5 color changes ~ match the expected ratio for a finder pattern? 1:1:3:1:1 of b:w:b:w:b
                var averageFinderPatternBlocksize = sum(scans) / 7;
                var validFinderPattern = Math.abs(scans[0] - averageFinderPatternBlocksize) < averageFinderPatternBlocksize &&
                    Math.abs(scans[1] - averageFinderPatternBlocksize) < averageFinderPatternBlocksize &&
                    Math.abs(scans[2] - 3 * averageFinderPatternBlocksize) < 3 * averageFinderPatternBlocksize &&
                    Math.abs(scans[3] - averageFinderPatternBlocksize) < averageFinderPatternBlocksize &&
                    Math.abs(scans[4] - averageFinderPatternBlocksize) < averageFinderPatternBlocksize &&
                    !v; // And make sure the current pixel is white since finder patterns are bordered in white
                // Do the last 3 color changes ~ match the expected ratio for an alignment pattern? 1:1:1 of w:b:w
                var averageAlignmentPatternBlocksize = sum(scans.slice(-3)) / 3;
                var validAlignmentPattern = Math.abs(scans[2] - averageAlignmentPatternBlocksize) < averageAlignmentPatternBlocksize &&
                    Math.abs(scans[3] - averageAlignmentPatternBlocksize) < averageAlignmentPatternBlocksize &&
                    Math.abs(scans[4] - averageAlignmentPatternBlocksize) < averageAlignmentPatternBlocksize &&
                    v; // Is the current pixel black since alignment patterns are bordered in black
                if (validFinderPattern) {
                    // Compute the start and end x values of the large center black square
                    var endX_1 = x - scans[3] - scans[4];
                    var startX_1 = endX_1 - scans[2];
                    var line = { startX: startX_1, endX: endX_1, y: y };
                    // Is there a quad directly above the current spot? If so, extend it with the new line. Otherwise, create a new quad with
                    // that line as the starting point.
                    var matchingQuads = activeFinderPatternQuads.filter(function (q) {
                        return (startX_1 >= q.bottom.startX && startX_1 <= q.bottom.endX) ||
                            (endX_1 >= q.bottom.startX && startX_1 <= q.bottom.endX) ||
                            (startX_1 <= q.bottom.startX && endX_1 >= q.bottom.endX && ((scans[2] / (q.bottom.endX - q.bottom.startX)) < MAX_QUAD_RATIO &&
                                (scans[2] / (q.bottom.endX - q.bottom.startX)) > MIN_QUAD_RATIO));
                    });
                    if (matchingQuads.length > 0) {
                        matchingQuads[0].bottom = line;
                    }
                    else {
                        activeFinderPatternQuads.push({ top: line, bottom: line });
                    }
                }
                if (validAlignmentPattern) {
                    // Compute the start and end x values of the center black square
                    var endX_2 = x - scans[4];
                    var startX_2 = endX_2 - scans[3];
                    var line = { startX: startX_2, y: y, endX: endX_2 };
                    // Is there a quad directly above the current spot? If so, extend it with the new line. Otherwise, create a new quad with
                    // that line as the starting point.
                    var matchingQuads = activeAlignmentPatternQuads.filter(function (q) {
                        return (startX_2 >= q.bottom.startX && startX_2 <= q.bottom.endX) ||
                            (endX_2 >= q.bottom.startX && startX_2 <= q.bottom.endX) ||
                            (startX_2 <= q.bottom.startX && endX_2 >= q.bottom.endX && ((scans[2] / (q.bottom.endX - q.bottom.startX)) < MAX_QUAD_RATIO &&
                                (scans[2] / (q.bottom.endX - q.bottom.startX)) > MIN_QUAD_RATIO));
                    });
                    if (matchingQuads.length > 0) {
                        matchingQuads[0].bottom = line;
                    }
                    else {
                        activeAlignmentPatternQuads.push({ top: line, bottom: line });
                    }
                }
            }
        };
        for (var x = -1; x <= matrix.width; x++) {
            _loop_2(x);
        }
        finderPatternQuads.push.apply(finderPatternQuads, activeFinderPatternQuads.filter(function (q) { return q.bottom.y !== y && q.bottom.y - q.top.y >= 2; }));
        activeFinderPatternQuads = activeFinderPatternQuads.filter(function (q) { return q.bottom.y === y; });
        alignmentPatternQuads.push.apply(alignmentPatternQuads, activeAlignmentPatternQuads.filter(function (q) { return q.bottom.y !== y; }));
        activeAlignmentPatternQuads = activeAlignmentPatternQuads.filter(function (q) { return q.bottom.y === y; });
    };
    for (var y = 0; y <= matrix.height; y++) {
        _loop_1(y);
    }
    finderPatternQuads.push.apply(finderPatternQuads, activeFinderPatternQuads.filter(function (q) { return q.bottom.y - q.top.y >= 2; }));
    alignmentPatternQuads.push.apply(alignmentPatternQuads, activeAlignmentPatternQuads);
    var finderPatternGroups = finderPatternQuads
        .filter(function (q) { return q.bottom.y - q.top.y >= 2; }) // All quads must be at least 2px tall since the center square is larger than a block
        .map(function (q) {
        var x = (q.top.startX + q.top.endX + q.bottom.startX + q.bottom.endX) / 4;
        var y = (q.top.y + q.bottom.y + 1) / 2;
        if (!matrix.get(Math.round(x), Math.round(y))) {
            return;
        }
        var lengths = [q.top.endX - q.top.startX, q.bottom.endX - q.bottom.startX, q.bottom.y - q.top.y + 1];
        var size = sum(lengths) / lengths.length;
        var score = scorePattern({ x: Math.round(x), y: Math.round(y) }, [1, 1, 3, 1, 1], matrix);
        return { score: score, x: x, y: y, size: size };
    })
        .filter(function (q) { return !!q; }) // Filter out any rejected quads from above
        .sort(function (a, b) { return a.score - b.score; })
        // Now take the top finder pattern options and try to find 2 other options with a similar size.
        .map(function (point, i, finderPatterns) {
        if (i > MAX_FINDERPATTERNS_TO_SEARCH) {
            return null;
        }
        var otherPoints = finderPatterns
            .filter(function (p, ii) { return i !== ii; })
            .map(function (p) { return ({ x: p.x, y: p.y, score: p.score + (Math.pow((p.size - point.size), 2)) / point.size, size: p.size }); })
            .sort(function (a, b) { return a.score - b.score; });
        if (otherPoints.length < 2) {
            return null;
        }
        var score = point.score + otherPoints[0].score + otherPoints[1].score;
        return { points: [point].concat(otherPoints.slice(0, 2)), score: score };
    })
        .filter(function (q) { return !!q; }) // Filter out any rejected finder patterns from above
        .sort(function (a, b) { return a.score - b.score; });
    if (finderPatternGroups.length === 0) {
        return null;
    }
    var _a = reorderFinderPatterns(finderPatternGroups[0].points[0], finderPatternGroups[0].points[1], finderPatternGroups[0].points[2]), topRight = _a.topRight, topLeft = _a.topLeft, bottomLeft = _a.bottomLeft;
    var alignment = findAlignmentPattern(matrix, alignmentPatternQuads, topRight, topLeft, bottomLeft);
    var result = [];
    if (alignment) {
        result.push({
            alignmentPattern: { x: alignment.alignmentPattern.x, y: alignment.alignmentPattern.y },
            bottomLeft: { x: bottomLeft.x, y: bottomLeft.y },
            dimension: alignment.dimension,
            topLeft: { x: topLeft.x, y: topLeft.y },
            topRight: { x: topRight.x, y: topRight.y },
        });
    }
    // We normally use the center of the quads as the location of the tracking points, which is optimal for most cases and will account
    // for a skew in the image. However, In some cases, a slight skew might not be real and instead be caused by image compression
    // errors and/or low resolution. For those cases, we'd be better off centering the point exactly in the middle of the black area. We
    // compute and return the location data for the naively centered points as it is little additional work and allows for multiple
    // attempts at decoding harder images.
    var midTopRight = recenterLocation(matrix, topRight);
    var midTopLeft = recenterLocation(matrix, topLeft);
    var midBottomLeft = recenterLocation(matrix, bottomLeft);
    var centeredAlignment = findAlignmentPattern(matrix, alignmentPatternQuads, midTopRight, midTopLeft, midBottomLeft);
    if (centeredAlignment) {
        result.push({
            alignmentPattern: { x: centeredAlignment.alignmentPattern.x, y: centeredAlignment.alignmentPattern.y },
            bottomLeft: { x: midBottomLeft.x, y: midBottomLeft.y },
            topLeft: { x: midTopLeft.x, y: midTopLeft.y },
            topRight: { x: midTopRight.x, y: midTopRight.y },
            dimension: centeredAlignment.dimension,
        });
    }
    if (result.length === 0) {
        return null;
    }
    return result;
}
exports.locate = locate;
function findAlignmentPattern(matrix, alignmentPatternQuads, topRight, topLeft, bottomLeft) {
    var _a;
    // Now that we've found the three finder patterns we can determine the blockSize and the size of the QR code.
    // We'll use these to help find the alignment pattern but also later when we do the extraction.
    var dimension;
    var moduleSize;
    try {
        (_a = computeDimension(topLeft, topRight, bottomLeft, matrix), dimension = _a.dimension, moduleSize = _a.moduleSize);
    }
    catch (e) {
        return null;
    }
    // Now find the alignment pattern
    var bottomRightFinderPattern = {
        x: topRight.x - topLeft.x + bottomLeft.x,
        y: topRight.y - topLeft.y + bottomLeft.y,
    };
    var modulesBetweenFinderPatterns = ((distance(topLeft, bottomLeft) + distance(topLeft, topRight)) / 2 / moduleSize);
    var correctionToTopLeft = 1 - (3 / modulesBetweenFinderPatterns);
    var expectedAlignmentPattern = {
        x: topLeft.x + correctionToTopLeft * (bottomRightFinderPattern.x - topLeft.x),
        y: topLeft.y + correctionToTopLeft * (bottomRightFinderPattern.y - topLeft.y),
    };
    var alignmentPatterns = alignmentPatternQuads
        .map(function (q) {
        var x = (q.top.startX + q.top.endX + q.bottom.startX + q.bottom.endX) / 4;
        var y = (q.top.y + q.bottom.y + 1) / 2;
        if (!matrix.get(Math.floor(x), Math.floor(y))) {
            return;
        }
        var lengths = [q.top.endX - q.top.startX, q.bottom.endX - q.bottom.startX, (q.bottom.y - q.top.y + 1)];
        var size = sum(lengths) / lengths.length;
        var sizeScore = scorePattern({ x: Math.floor(x), y: Math.floor(y) }, [1, 1, 1], matrix);
        var score = sizeScore + distance({ x: x, y: y }, expectedAlignmentPattern);
        return { x: x, y: y, score: score };
    })
        .filter(function (v) { return !!v; })
        .sort(function (a, b) { return a.score - b.score; });
    // If there are less than 15 modules between finder patterns it's a version 1 QR code and as such has no alignmemnt pattern
    // so we can only use our best guess.
    var alignmentPattern = modulesBetweenFinderPatterns >= 15 && alignmentPatterns.length ? alignmentPatterns[0] : expectedAlignmentPattern;
    return { alignmentPattern: alignmentPattern, dimension: dimension };
}


/***/ })
/******/ ])["default"];
});
} catch(error) {console.error("Teacher module app/vendor/scan.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/portal.js */
try {
/* One responsive interface, shared by the original PHP pages and native apps. */
(()=>{
'use strict';
const root=new URL('../',document.currentScript.src),page=location.pathname.split('/').pop()||'index.php',student=!!document.getElementById('main'),isHome=!student&&(page==='index.php'||page==='index.html'&&location.pathname.includes('/templates/'));
const paths={music:'<path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/>',sheet:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6m-6 4h6m-6 4h4"/>',exam:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 13a2 2 0 0 0 4 0"/>',settings:'<path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm4 0h2v6h-6v-2"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.4c-.9.4-.9 1.1-.9 2.1M12 17h.01"/>'};
paths.expand='<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>';
const icon=name=>`<svg class="p-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name]||paths.grid}</svg>`;
function dialog(title,content){const d=document.createElement('dialog');d.className='p-dialog';d.innerHTML=`<button type="button" class="p-close" aria-label="Tutup">${icon('close')}</button><h2></h2>${content}`;d.querySelector('h2').textContent=title;d.querySelector('.p-close').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d;}
function setTheme(theme){if(!['malam','putih','samudra','senja'].includes(theme))return;document.documentElement.dataset.theme=theme;localStorage.setItem('presen-theme',theme);if(isHome)window.setTheme?.(theme);window.WA?.change(()=>theme,'theme');}
function accent(value){if(!/^#[0-9a-f]{6}$/i.test(value))return;const channels=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4),lum=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];const s=document.documentElement.style;s.setProperty('--primary',value);s.setProperty('--p-accent',value);s.setProperty('--p-on-accent',lum>.179?'#102538':'#fff');document.body.style.setProperty('--hero-accent',value);document.body.style.setProperty('--hero-on-accent',lum>.179?'#102538':'#fff');}
function wallpaper(){const hero=document.querySelector('.portal-hero');if(!hero)return;const saved=localStorage.getItem('custom_bg_wallpaper');if(saved&&/^data:image\/(png|jpeg|webp);base64,/.test(saved))hero.style.backgroundImage=`url("${saved}")`;else hero.style.backgroundImage='';for(const name of ['backgroundSize','backgroundPosition','backgroundRepeat'])if(document.body.style[name])hero.style[name]=document.body.style[name];}
function appearance(){return window.PresenAppearance?.open();}
async function navigate(target){const done=window.PresenExperience?.navigation();try{await window.WAFlush?.();const s=await window.WA?.get(),form=document.querySelector('.main-card form'),fields=form?Object.fromEntries(new FormData(form)):Object.fromEntries(new URLSearchParams(location.search)),ctx={...s?.selection,...fields};const u=new URL(target,root);for(const name of ['jenjang','prodi','semester','kelas','matkul','year','period','owner'])if(ctx[name])u.searchParams.set(name,ctx[name]);u.searchParams.set('theme',document.documentElement.dataset.theme||'putih');if(window.AbsensiUIAudio?.navigateApplication)window.AbsensiUIAudio.navigateApplication(u.href);else location.assign(u.href);}catch(error){done?.();throw error;}}
const savedTheme=localStorage.getItem('presen-theme');if(savedTheme)document.documentElement.dataset.theme=savedTheme;else if(!document.documentElement.dataset.theme)document.documentElement.dataset.theme='putih';accent(localStorage.getItem('presen-accent')||'');
if(isHome){document.body.classList.add('portal-home');const nav=document.querySelector('.top-nav'),card=document.querySelector('.main-card'),title=document.getElementById('displayAppTitle');const header=document.createElement('header');header.className='portal-header';header.innerHTML=`<div class="portal-utility"><span>Administrasi akademik</span><span>Absensi · Ujian · Rekap nilai</span></div><div class="portal-brandbar"><div class="portal-brand"><img src="${new URL('app/icon-192.png',root)}" alt=""><div><strong id="portalBrandTitle"></strong><small>Data & kehadiran mahasiswa</small></div></div><div class="portal-actions"><button type="button" data-appearance title="Tema, warna dan latar">${icon('settings')}<span>Tampilan</span></button></div></div><nav class="portal-nav" aria-label="Navigasi utama"><button type="button" aria-current="page" data-nav="index.php">${icon('grid')} Beranda</button><button type="button" data-nav="data_siswa.php">${icon('users')} Data mahasiswa</button><button type="button" data-nav="absen.php">${icon('sheet')} Lembar absen</button><button type="button" data-nav="ujian.php">${icon('exam')} Lembar ujian</button></nav>`;document.body.prepend(header);if(nav)header.querySelector('.portal-actions').append(nav);new ResizeObserver(()=>document.body.style.setProperty('--portal-header-space',(Math.ceil(header.getBoundingClientRect().height)+28)+'px')).observe(header);header.querySelector('#portalBrandTitle').textContent=title?.textContent||'Database & Absensi';if(title)new MutationObserver(()=>header.querySelector('#portalBrandTitle').textContent=title.textContent).observe(title,{childList:true,subtree:true,characterData:true});const hero=document.createElement('section');hero.className='portal-hero';card.before(hero);hero.append(card);const quick=document.createElement('section');quick.className='portal-quick';quick.innerHTML=`<h2>Akses cepat</h2><div class="portal-quick-grid"><button type="button" data-nav="data_siswa.php">${icon('users')}Data mahasiswa</button><button type="button" data-nav="absen.php">${icon('qr')}Absensi & QR</button><button type="button" data-nav="ujian.php">${icon('exam')}Lembar ujian</button></div>`;hero.after(quick);const footer=document.createElement('footer');footer.className='portal-footer';footer.innerHTML='<span>Pilih kelas terlebih dahulu untuk membuka data yang sesuai.</span><span>Presen · Sistem absensi</span>';quick.after(footer);}
if(isHome&&window.WA){const refreshLayout=async()=>{if(!navigator.onLine||document.hidden)return;try{const data=await WA.api('home-layout');if(['left','center','right'].includes(data.layout))document.body.dataset.homeLayout=data.layout;}catch(_){}};window.addEventListener('focus',refreshLayout);setInterval(refreshLayout,30000);}
if(page==='music_player.php')document.body.classList.add('portal-music');
if(page==='data_siswa.php')document.body.classList.add('portal-data');
if(document.getElementById('topToolbar')){document.body.classList.add('portal-sheet');const toolbar=document.getElementById('topToolbar');const size=()=>document.body.style.setProperty('--portal-toolbar-space',(toolbar.classList.contains('hidden-toolbar')?44:Math.ceil(toolbar.getBoundingClientRect().height)+28)+'px');new ResizeObserver(size).observe(toolbar);new MutationObserver(size).observe(toolbar,{attributes:true,attributeFilter:['class']});size();}
if(student){document.body.classList.add('portal-student');const b=document.createElement('button');b.type='button';b.dataset.appearance='';b.innerHTML=icon('settings')+'Tampilan';document.querySelector('body>header').append(b);}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.nav){if(window.PresenWorkspace)void PresenWorkspace.open(b.dataset.nav).catch(error=>window.showToast?.(error.message));else void navigate(b.dataset.nav).catch(error=>window.showToast?.(error.message));}if(b?.hasAttribute('data-appearance'))appearance();if(b?.hasAttribute('data-control')){if(window.PresenWorkspace)void PresenWorkspace.open('accounts').catch(error=>window.showToast?.(error.message));else window.toggleSidebar?.();}});
new MutationObserver(()=>{const theme=document.documentElement.dataset.theme;if(theme)localStorage.setItem('presen-theme',theme);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function adoptMusic(){const button=document.getElementById('absensiMusicLauncher'),mount=document.querySelector('.portal-actions')||document.querySelector('#topToolbar .toolbar-group:last-child')||document.querySelector('.header-actions');if(!button||!mount)return;button.classList.add('portal-music-control');button.innerHTML=icon('music');if(button.parentElement!==mount)mount.append(button);}adoptMusic();document.addEventListener('DOMContentLoaded',adoptMusic,{once:true});
// Add dismissal to existing messages without replacing their message text or handlers.
function closable(el){if(el.querySelector('.p-toast-close'))return;const b=document.createElement('button');b.type='button';b.className='p-toast-close';b.setAttribute('aria-label','Tutup pemberitahuan');b.innerHTML=icon('close');b.onclick=()=>el.classList.contains('toast')?el.remove():el.style.display='none';el.append(b);}
const toast=document.getElementById('toastContainer');if(toast)new MutationObserver(()=>toast.querySelectorAll('.toast').forEach(closable)).observe(toast,{childList:true});
for(const img of document.querySelectorAll('#topNavAvatarImg,#previewAvatarImg,#widgetAvatarImg')){const fallback=()=>{const src=new URL('app/icon-192.png',root).href;if(img.src!==src)img.src=src;};img.addEventListener('error',fallback);if(img.complete&&!img.naturalWidth)fallback();}
window.PresenUI={icon,dialog,appearance,navigate,closable,setTheme,accent};window.dispatchEvent(new Event('presen-ui-ready'));
})();

} catch(error) {console.error("Teacher module app/portal.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/teacher-download.js */
try {
/* Verified student release; the rolling asset is updated only after APK checks. */
(()=>{'use strict';
if(!document.body.classList.contains('portal-home'))return;
const url='https://github.com/Laxdsks/web-absensi/releases/download/presen-go-current/Presen-Go.apk',guideURL=new URL('app/panduan-mahasiswa.html',new URL('../',document.currentScript.src)).href,text='Unduh Presen Go, aplikasi absensi mahasiswa Android: '+url+'\nPanduan instalasi dan penggunaan: '+guideURL;
const box=document.createElement('section');box.id='studentAppDownload';box.className='teacher-app-download';box.setAttribute('aria-labelledby','studentAppTitle');
box.innerHTML='<div><span class="teacher-app-label">APLIKASI MAHASISWA · ANDROID</span><h2 id="studentAppTitle">Unduh & bagikan Presen Go</h2><p>Bagikan aplikasi kepada mahasiswa. Tautan ini selalu menuju APK terbaru yang sudah dirilis.</p></div><div class="teacher-app-actions"><a class="p-primary" data-apk-download>Unduh APK terbaru</a><button type="button" data-app-share>Bagikan tautan</button><a data-app-whatsapp target="_blank" rel="noopener noreferrer">Bagikan ke WhatsApp</a><button type="button" data-app-copy>Salin tautan</button><button type="button" data-app-file>Bagikan file APK</button><button type="button" data-app-guide>Panduan instal & penggunaan</button></div><p><a data-student-guide target="_blank" rel="noopener noreferrer">Buka panduan untuk mahasiswa</a></p><label class="teacher-app-link">Tautan unduhan<input readonly aria-label="Tautan aplikasi mahasiswa"></label><p class="teacher-app-help">Untuk membagikan file, unduh APK dahulu, lalu pilih file tersebut melalui tombol Bagikan file APK. Dukungan berbagi file mengikuti browser perangkat.</p><input type="file" accept=".apk,application/vnd.android.package-archive" data-apk-picker hidden><p role="status" aria-live="polite"></p>';
(document.querySelector('.portal-hero')||document.querySelector('.main-card')).after(box);
box.querySelector('[data-app-guide]').onclick=()=>{document.querySelector('.wa-guide-open')?.click();const select=document.querySelector('.wa-teacher-guide .wa-guide-panel select'),option=select&&[...select.options].find(o=>o.textContent.includes('Aplikasi mahasiswa:'));if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}};
const status=box.querySelector('[role=status]'),link=box.querySelector('input[readonly]'),picker=box.querySelector('[data-apk-picker]');link.value=url;box.querySelector('[data-student-guide]').href=guideURL;box.querySelector('[data-apk-download]').href=url;box.querySelector('[data-app-whatsapp]').href='https://wa.me/?text='+encodeURIComponent(text);
box.querySelector('[data-app-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Tautan unduhan disalin.';}catch(_){link.focus();link.select();status.textContent='Pilih Salin pada tautan yang disorot.';}};
box.querySelector('[data-app-share]').onclick=async()=>{if(!navigator.share){box.querySelector('[data-app-copy]').click();return;}try{await navigator.share({title:'Presen Go — Absen Mahasiswa',text:'Aplikasi absensi mahasiswa Android. Panduan instalasi dan penggunaan: '+guideURL,url});status.textContent='Tautan diserahkan ke aplikasi berbagi.';}catch(e){if(e.name!=='AbortError')status.textContent='Berbagi belum tersedia. Gunakan Salin tautan atau WhatsApp.';}};
box.querySelector('[data-app-file]').onclick=()=>{if(!navigator.share||!navigator.canShare){status.textContent='Unduh APK, lalu lampirkan file unduhan melalui WhatsApp atau aplikasi pesan Anda.';return;}status.textContent='Pilih file APK Presen Go yang sudah Anda unduh.';picker.click();};
picker.onchange=async()=>{const file=picker.files?.[0];picker.value='';if(!file)return;if(!/\.apk$/i.test(file.name)){status.textContent='Pilih file aplikasi berformat APK.';return;}if(!navigator.canShare({files:[file]})){status.textContent='Browser ini belum mendukung berbagi APK. Lampirkan file unduhan langsung dari aplikasi pesan Anda.';return;}try{await navigator.share({title:'Presen Go — Absen Mahasiswa',files:[file]});status.textContent='File APK diserahkan ke aplikasi berbagi.';}catch(e){if(e.name!=='AbortError')status.textContent='File belum dapat dibagikan. Lampirkan APK langsung dari aplikasi pesan Anda.';}};
})();

} catch(error) {console.error("Teacher module app/teacher-download.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/teacher-appearance.js */
try {
/* One appearance panel; keeps existing wallpaper keys and source image pixels. */
(()=>{
'use strict';
const student=!!document.getElementById('main'),home=!!document.querySelector('.portal-hero');
const key=n=>'custom_bg_wallpaper'+(n?'_'+n:'');
let wallpaperImage='',wallpaperTicket=0;
let panel=document.getElementById('uploadBgFile')?.closest('.form-group');
const storage=document.createElement('div');storage.id='presenAppearanceStorage';storage.hidden=true;document.body.append(storage);
if(panel){panel.classList.add('p-wallpaper-settings');storage.append(panel);}
function controls(){
 if(panel)return panel;
 panel=document.createElement('section');panel.className='p-wallpaper-settings';panel.innerHTML='<h3>Latar aplikasi</h3><label>Foto latar<input id="uploadBgFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Ukuran wallpaper<select id="bgFitMode"><option value="cover">Otomatis memenuhi layar</option><option value="contain">Tampilkan seluruh foto</option><option value="auto">Ukuran asli</option><option value="manual">Ukuran manual</option></select></label><div id="bgManualScaleWrap"><label>Skala <span id="bgScaleValue"></span><input id="bgScaleRange" type="range" min="1" max="1000" value="100"></label></div><label>Geser kiri / kanan <span id="bgPositionXValue"></span><input id="bgPositionX" type="range" min="0" max="100" value="50"></label><label>Geser atas / bawah <span id="bgPositionYValue"></span><input id="bgPositionY" type="range" min="0" max="100" value="50"></label><small id="bgQualityHint"></small><button id="pClearWallpaper" type="button">Hapus foto latar</button>';storage.append(panel);return panel;
}
function saved(n,fallback){const v=localStorage.getItem(key(n));return v===null?fallback:v;}
function apply(){
 const image=wallpaperImage||saved('',''),width=Number(saved('width',0)),height=Number(saved('height',0)),hero=document.querySelector('.portal-hero');
 let mode=saved('mode','cover');if(!['cover','contain','auto','manual'].includes(mode))mode='cover';
 const maxScale=1000;
 const scale=Math.max(1,Math.min(maxScale,Number(saved('scale',100))||100)),x=Math.max(0,Math.min(100,Number(saved('x',50))||0)),y=Math.max(0,Math.min(100,Number(saved('y',50))||0));
 const valid=/^data:image\/(png|jpeg|webp);base64,/.test(image);
 const size=mode==='manual'?scale+'% auto':mode==='auto'?'auto':mode,position=x+'% '+y+'%';
 if(hero){hero.style.backgroundImage=valid?`url("${image}")`:'';hero.style.backgroundSize=size;hero.style.backgroundPosition=position;hero.style.backgroundRepeat='no-repeat';hero.style.minHeight=valid&&mode==='cover'?'100dvh':'';}
 if(home){document.body.style.backgroundImage='';document.body.classList.toggle('has-custom-wallpaper',valid);}
 else{document.body.style.backgroundImage=valid?`url("${image}")`:'';document.body.style.backgroundSize=size;document.body.style.backgroundPosition=position;document.body.style.backgroundRepeat='no-repeat';document.body.style.backgroundAttachment='fixed';}
 const p=controls();p.querySelector('#bgFitMode').value=mode;p.querySelector('#bgScaleRange').max=String(maxScale);p.querySelector('#bgScaleRange').value=String(scale);p.querySelector('#bgScaleValue').textContent=scale+'%';p.querySelector('#bgManualScaleWrap').style.display=mode==='manual'?'block':'none';
 for(const [axis,value] of [['X',x],['Y',y]]){p.querySelector('#bgPosition'+axis).value=String(value);p.querySelector('#bgPosition'+axis+'Value').textContent=value+'%';}
 p.querySelector('#bgQualityHint').textContent=(width&&height?`Foto asli: ${width} × ${height}px. `:'')+'Mode penuh dapat memperbesar foto kecil. Skala manual hingga 1000%; pembesaran tidak menambah ketajaman. Kertas cetak tetap putih.';
}
async function rasterFile(file,limit=15*1024*1024){
 if(!file||!file.type.startsWith('image/')||file.size>limit)throw Error('Pilih gambar maksimal 15 MB.');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Gambar tidak dapat dibaca.'));r.readAsDataURL(file);});
 const img=new Image();img.src=data;await img.decode();
 if(!img.naturalWidth||!img.naturalHeight)throw Error('Ukuran gambar tidak valid.');
 let value=data;if(!/^data:image\/(png|jpeg|webp);base64,/.test(data)){const c=document.createElement('canvas');const scale=Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);value=c.toDataURL('image/png');}
 return {data:value,img};
}
async function upload(e,status){
 const ticket=++wallpaperTicket;
 try{const file=e.target.files[0];if(!file)return;status.textContent='Membaca foto latar…';const {data,img}=await rasterFile(file);if(ticket!==wallpaperTicket)return;
 try{localStorage.setItem(key(''),data);localStorage.removeItem(key('db'));}
 catch(error){if(!window.WA)throw error;await WA.change(()=>data,'wallpaper-source');localStorage.setItem(key('db'),'1');const c=document.createElement('canvas'),scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);try{localStorage.setItem(key(''),c.toDataURL('image/jpeg',.65));}catch(_){localStorage.removeItem(key(''));}}
 wallpaperImage=data;localStorage.setItem(key('width'),String(img.naturalWidth));localStorage.setItem(key('height'),String(img.naturalHeight));apply();status.textContent='Foto latar aplikasi disimpan.';
 }catch(error){status.textContent=error.name==='QuotaExceededError'?'Penyimpanan perangkat penuh. Kosongkan ruang lalu coba lagi.':error.message||'Foto belum dapat disimpan.';}
}
function applyBrand(){const image=localStorage.getItem('presen-brand-image')||'',size=Math.max(24,Math.min(80,Number(localStorage.getItem('presen-brand-size'))||48)),src=/^data:image\/(png|jpeg|webp);base64,/.test(image)?image:new URL('icon-192.png',document.currentScript?.src||new URL('app/appearance.js',document.baseURI)).href;
 document.querySelectorAll('.p-worknav').forEach(nav=>{if(!nav.querySelector('.p-workspace-brand')){const mark=document.createElement('img');mark.className='p-workspace-brand p-screen-only';mark.alt='Logo aplikasi';nav.prepend(mark);}});
 document.querySelectorAll('.portal-brand>img,.p-workspace-brand').forEach(img=>{img.src=src;img.style.width=(img.classList.contains('p-workspace-brand')?Math.min(36,size):size)+'px';img.style.height=img.style.width;img.style.objectFit='contain';});
}

function open(){
 window.PresenWorkspace?.close();
 const existing=document.getElementById('presenAppearanceDialog');if(existing){existing.focus();return existing;}
 const d=PresenUI.dialog('Tampilan aplikasi','<p class="p-subtitle">Tema, warna dan latar dalam satu pengaturan.</p><div class="p-appearance-colors"><label>Tema<select id="pTheme"><option value="putih">Putih</option><option value="malam">Malam</option><option value="samudra">Samudra</option><option value="senja">Senja</option></select></label><label>Warna utama<input id="pAccent" type="color"></label></div><button type="button" id="pDefaultColors">Warna bawaan</button><section class="p-brand-settings"><h3>Logo aplikasi / kampus</h3><img id="pBrandPreview" alt="Pratinjau logo" width="56" height="56" style="object-fit:contain"><label>Ganti logo<input id="pBrandFile" type="file" accept="image/*"></label><label>Ukuran logo <input id="pBrandSize" type="range" min="24" max="80" value="48"></label><button id="pBrandReset" type="button">Pulihkan logo bawaan</button></section><div class="p-wallpaper-mount"></div><section class="p-maps-settings" hidden><div class="p-maps-heading"><h3>Google Maps</h3><span class="p-maps-state" aria-live="polite">Belum dihubungkan</span></div><p>Hubungkan kunci milik akun Google Cloud Anda untuk rute dan panorama 360° dalam jendela aplikasi.</p><details class="p-maps-help"><summary>Belum punya kunci? Mulai di sini</summary><ol><li><b>Buka Google Cloud.</b> Masuk dengan akun Google Anda, lalu buat atau pilih proyek. Jika Google meminta akun penagihan, periksa ketentuannya sebelum melanjutkan.<a href="https://console.cloud.google.com/projectselector2/home/dashboard?createNewProject=true" target="_blank" rel="noopener noreferrer">Buka Google Cloud</a></li><li><b>Aktifkan Maps Embed API.</b> Layanan ini menampilkan peta, rute, dan Street View tanpa biaya pemakaian Embed.<a href="https://console.cloud.google.com/apis/library/maps-embed-backend.googleapis.com" target="_blank" rel="noopener noreferrer">Aktifkan Maps Embed API</a></li><li><b>Buat API key.</b> Di Credentials, pilih Create credentials → API key. Batasi Application restrictions ke Websites, lalu tambahkan alamat di bawah. Pilih API restrictions → Maps Embed API.<a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener noreferrer">Buat / atur kunci</a><div class="p-maps-referrer"><code>https://datasiswasekolah.42web.io/*</code><button type="button" id="pMapsCopyDomain">Salin alamat</button></div></li><li><b>Tempel kunci di sini.</b> Simpan, lalu Uji peta. Kunci tidak perlu dikirim melalui chat.</li></ol><p>Opsional: aktifkan <a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" rel="noopener noreferrer">Maps JavaScript API</a> untuk memilih titik awal dengan mengetuk peta. Layanan tambahan dapat berbiaya; periksa harga dan kuotanya sebelum mengaktifkan. Rute dari GPS tidak memerlukan pilihan titik manual ini.</p><a href="https://developers.google.com/maps/documentation/embed/quickstart?hl=id" target="_blank" rel="noopener noreferrer">Petunjuk resmi Google</a></details><label>Kunci browser Google Maps<input id="pMapsKey" type="password" autocomplete="off" spellcheck="false" placeholder="Tempel API key dari proyek Google Anda"></label><details class="p-maps-advanced"><summary>Layanan tambahan · dapat berbayar</summary><p>Biarkan kosong untuk mode Maps Embed gratis. Kunci terpisah ini hanya diperlukan untuk memilih titik dengan mengetuk peta dan membaca alamat di luar peta. Maps JavaScript serta Geocoding memiliki tarif tersendiri.</p><label>Kunci Maps JavaScript opsional<input id="pMapsJavascriptKey" type="password" autocomplete="off" spellcheck="false" placeholder="Kosongkan untuk tetap memakai Embed saja"></label></details><div class="p-actions"><button id="pMapsSave" type="button">Simpan pengaturan peta</button><button id="pMapsTest" type="button">Uji peta</button></div><p class="p-maps-hint">Menyimpan kunci belum membuktikan layanan aktif. Uji peta, rute dan 360° setelah API serta pembatasan domain diatur.</p></section><p role="status" aria-live="polite"></p>');d.id='presenAppearanceDialog';
 const theme=d.querySelector('#pTheme'),accent=d.querySelector('#pAccent'),status=d.querySelector('[role=status]');theme.value=document.documentElement.dataset.theme||'putih';theme.onchange=()=>PresenUI.setTheme(theme.value);accent.value=localStorage.getItem('presen-accent')||'#2463dc';accent.oninput=()=>{localStorage.setItem('presen-accent',accent.value);PresenUI.accent(accent.value);};d.querySelector('#pDefaultColors').onclick=()=>{localStorage.removeItem('presen-accent');for(const n of ['--primary','--p-accent','--p-on-accent'])document.documentElement.style.removeProperty(n);for(const n of ['--hero-accent','--hero-on-accent'])document.body.style.removeProperty(n);status.textContent='Warna bawaan dipulihkan.';};
 {const p=controls();d.querySelector('.p-wallpaper-mount').append(p);const file=p.querySelector('#uploadBgFile');file.accept='image/*';p.querySelector('#bgScaleRange').max='1000';file.onchange=e=>void upload(e,status);
 for(const [id,n,event] of [['bgFitMode','mode','change'],['bgScaleRange','scale','input'],['bgPositionX','x','input'],['bgPositionY','y','input']]){const el=p.querySelector('#'+id);el.removeAttribute('on'+event);el['on'+event]=()=>{try{localStorage.setItem(key(n),el.value);apply();}catch(_){status.textContent='Pengaturan belum dapat disimpan.';}};}
 const clear=p.querySelector('#pClearWallpaper')||p.querySelector('button[onclick*="removeBgWallpaper"]');clear.id='pClearWallpaper';clear.removeAttribute('onclick');clear.onclick=()=>{wallpaperTicket++;wallpaperImage='';void window.WA?.change(()=>null,'wallpaper-source');for(const n of ['','width','height','mode','scale','x','y','db'])localStorage.removeItem(key(n));file.value='';apply();status.textContent='Foto latar dihapus.';};
 d.addEventListener('close',()=>storage.append(p));apply();
 }
 void (async()=>{try{
  const state=await window.WA?.get();if(state?.profile?.role!=='teacher'||state.profile.account?.role!=='admin')return;
  const section=d.querySelector('.p-maps-settings'),config=await WA.api('maps-config'),field=section.querySelector('#pMapsKey'),badge=section.querySelector('.p-maps-state');
  section.hidden=false;field.value=config.embedKey||'';section.querySelector('#pMapsJavascriptKey').value=config.javascriptKey||'';badge.textContent=config.embedKey?'Kunci tersimpan · perlu diuji':'Belum dihubungkan';
  section.querySelector('#pMapsCopyDomain').onclick=async()=>{try{await navigator.clipboard.writeText('https://datasiswasekolah.42web.io/*');status.textContent='Alamat disalin. Tempel di Websites / HTTP referrers pada Google Cloud.';}catch(_){status.textContent='Salin alamat pada kotak di atas, lalu tempel di Websites / HTTP referrers pada Google Cloud.';}};
  section.querySelector('#pMapsSave').onclick=async e=>{e.target.disabled=true;try{await WA.api('set-maps-config',{key:field.value.trim(),javascriptKey:section.querySelector('#pMapsJavascriptKey').value.trim()});const saved=await WA.api('maps-config');field.value=saved.embedKey||'';section.querySelector('#pMapsJavascriptKey').value=saved.javascriptKey||'';badge.textContent=saved.embedKey?'Kunci tersimpan · perlu diuji':'Belum dihubungkan';status.textContent='Pengaturan Google Maps disimpan. Pilih Uji peta untuk memeriksa layanan.';}catch(error){status.textContent=error.message;}finally{e.target.disabled=false;}};
  section.querySelector('#pMapsTest').onclick=()=>{
   const key=field.value.trim();if(!key){status.textContent='Tempel kunci Google Maps terlebih dahulu. Buka petunjuk jika belum punya kunci.';field.focus();return;}
   if(!navigator.onLine){status.textContent='Uji Google Maps memerlukan internet. Kunci tetap tersimpan.';return;}
   const test=PresenUI.dialog('Uji Google Maps','<p>Contoh koordinat Dompu, NTB. Ini bukan posisi mahasiswa dan tidak mengubah data absensi.</p><div class="p-maps-test-modes" role="group" aria-label="Mode uji peta"><button type="button" data-map-mode="place">Peta</button><button type="button" data-map-mode="directions">Rute</button><button type="button" data-map-mode="streetview">360°</button></div><iframe class="p-maps-test-frame" title="Contoh uji Google Maps di Dompu" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms" allowfullscreen></iframe><p class="p-maps-test-note">Periksa peta yang ditampilkan Google. Jika muncul kesalahan, cocokkan API key, aktivasi Maps Embed API, akun penagihan, dan pembatasan domain. Panorama jalan terdekat dicari hingga 500 m di sekitar titik contoh, mengikuti cakupan Street View.</p>');test.classList.add('p-maps-test','p-screen-only');
   const frame=test.querySelector('iframe');function mode(name){const url=new URL('https://www.google.com/maps/embed/v1/'+name);url.searchParams.set('key',key);url.searchParams.set('language','id');if(name==='place')url.searchParams.set('q','-8.54059,118.43617');else if(name==='directions'){url.searchParams.set('origin','-8.53,118.43');url.searchParams.set('destination','-8.54059,118.43617');url.searchParams.set('mode','driving');}else{url.searchParams.set('location','-8.54059,118.43617');url.searchParams.set('radius','500');url.searchParams.set('source','outdoor');}frame.src=url.href;for(const button of test.querySelectorAll('[data-map-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mapMode===name));}
   for(const button of test.querySelectorAll('[data-map-mode]'))button.onclick=()=>mode(button.dataset.mapMode);mode('place');
  };
 }catch(error){status.textContent='Pengaturan peta belum dapat dimuat: '+error.message;}})();
 const preview=d.querySelector('#pBrandPreview'),brandFile=d.querySelector('#pBrandFile'),brandSize=d.querySelector('#pBrandSize');
 const previewBrand=()=>{applyBrand();preview.src=document.querySelector('.portal-brand>img,.p-workspace-brand')?.src||new URL('app/icon-192.png',document.baseURI).href;};brandSize.value=localStorage.getItem('presen-brand-size')||'48';previewBrand();
 brandFile.onchange=async()=>{try{const {img}=await rasterFile(brandFile.files[0]);const c=document.createElement('canvas'),scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);localStorage.setItem('presen-brand-image',c.toDataURL('image/png'));previewBrand();status.textContent='Logo aplikasi disimpan.';}catch(error){status.textContent=error.message||'Logo belum dapat disimpan.';}};
 brandSize.oninput=()=>{localStorage.setItem('presen-brand-size',brandSize.value);applyBrand();};d.querySelector('#pBrandReset').onclick=()=>{localStorage.removeItem('presen-brand-image');localStorage.removeItem('presen-brand-size');brandFile.value='';brandSize.value='48';previewBrand();status.textContent='Logo bawaan dipulihkan.';};
 return d;
}
let appearanceReady=Promise.resolve();{controls();apply();applyBrand();window.addEventListener('resize',apply);window.addEventListener('load',()=>{apply();applyBrand();});if(saved('db','')==='1'&&window.WA){const ticket=wallpaperTicket;appearanceReady=WA.get('wallpaper-source').then(data=>{if(ticket===wallpaperTicket&&data){wallpaperImage=data;apply();}});}}
appearanceReady=appearanceReady.then(async()=>{const src=wallpaperImage||saved('','');if(src){const img=new Image();img.src=src;await img.decode().catch(()=>{});}}).catch(()=>{});window.PresenAppearance={open,apply,ready:appearanceReady,reloadAccount:async()=>{wallpaperTicket++;wallpaperImage='';if(saved('db','')==='1')wallpaperImage=await WA.get('wallpaper-source')||'';apply();applyBrand();const p=document.getElementById('presenAppearanceDialog');if(p){p.querySelector('#pTheme').value=document.documentElement.dataset.theme||'putih';p.querySelector('#pAccent').value=localStorage.getItem('presen-accent')||'#2463dc';p.querySelector('#pBrandSize').value=localStorage.getItem('presen-brand-size')||'48';p.querySelector('#pBrandPreview').src=document.querySelector('.portal-brand>img,.p-workspace-brand')?.src||'';}const src=wallpaperImage||saved('','');if(src){const image=new Image();image.src=src;await Promise.race([image.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,200))]);}}};
})();

} catch(error) {console.error("Teacher module app/teacher-appearance.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/workspace.js */
try {
/* Shared teacher navigation with brief, non-blocking menu descriptions. */
(()=>{
'use strict';
if(!window.PresenUI||document.getElementById('main'))return;
const page=location.pathname.split('/').pop()||'index.php',pages={
 'index.php':['Beranda','grid','Klik untuk membuka halaman awal.'],
 'data_siswa.php':['Data mahasiswa','users','Atur, impor, dan koreksi daftar mahasiswa kelas ini.'],
 'absen.php':['Lembar absen','sheet','Isi kehadiran, kelola QR, dan buka rekap nilai.'],
 'ujian.php':['Lembar ujian','exam','Lihat daftar ujian dan nilai mahasiswa.'],
 accounts:['Akun & sinkronisasi','bell','Tinjau pendaftaran mahasiswa dan status sinkronisasi.']
};
if(!pages[page])return;
const esc=s=>{const e=document.createElement('span');e.textContent=String(s??'');return e.innerHTML;};
function dest(el){if(el.hasAttribute('data-control'))return'accounts';if(el.dataset.nav)return el.dataset.nav;if(el.tagName==='A'){const u=new URL(el.href,location.href);if(u.origin!==location.origin)return null;const n=u.pathname.split('/').pop();return pages[n]?n:null;}return null;}
function label(el){if(el.hasAttribute('data-monitoring'))return 'Cari riwayat, foto bukti, keterangan, dan lokasi absensi.';const id=dest(el);return id&&pages[id][2];}
const tip=document.createElement('div');tip.className='p-menu-tip p-screen-only';tip.id='presenMenuTip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
let focused=null,timer;
function hide(){clearTimeout(timer);tip.hidden=true;focused?.removeAttribute('aria-describedby');focused=null;}
function rects(el){const r=el.getBoundingClientRect(),w=Math.min(280,innerWidth-24),h=Math.min(84,Math.max(50,tip.scrollHeight||60)),gap=9;return[
 {x:r.right+gap,y:r.top+(r.height-h)/2},{x:r.left-w-gap,y:r.top+(r.height-h)/2},
 {x:r.left+(r.width-w)/2,y:r.top-h-gap},{x:r.left+(r.width-w)/2,y:r.bottom+gap}
].map(v=>({...v,w,h}));}
function show(el){const text=label(el);if(!text)return;focused=el;tip.textContent=text;tip.hidden=false;el.setAttribute('aria-describedby',tip.id);const candidates=rects(el),targets=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(x=>x!==el&&x.getClientRects().length&&!tip.contains(x));const score=r=>{let n=(r.x<8||r.y<8||r.x+r.w>innerWidth-8||r.y+r.h>innerHeight-8)?1000:0;for(const t of targets){const b=t.getBoundingClientRect();if(r.x<b.right&&r.x+r.w>b.left&&r.y<b.bottom&&r.y+r.h>b.top)n+=Math.max(1,Math.min(r.x+r.w,b.right)-Math.max(r.x,b.left))*Math.max(1,Math.min(r.y+r.h,b.bottom)-Math.max(r.y,b.top));}return n;};candidates.sort((a,b)=>score(a)-score(b));const r=candidates[0];tip.style.left=Math.max(8,Math.min(innerWidth-r.w-8,r.x))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-r.h-8,r.y))+'px';}
function target(e){return e.target.closest('.portal-nav [data-nav],.portal-nav [data-control],.portal-nav [data-monitoring],.portal-quick-grid [data-nav],.portal-quick-grid [data-control],.p-worknav button,.header-actions a,#topToolbar a');}
if(page!=='index.php'){
 const nav=document.createElement('nav');nav.className='p-worknav p-screen-only';nav.setAttribute('aria-label','Navigasi utama');
 nav.innerHTML=Object.entries(pages).filter(([name])=>name!=='accounts').map(([name,[title,icon]])=>`<button type="button" ${name==='accounts'?'data-control':'data-nav="'+name+'"'} ${name===page?'aria-current="page"':''} title="${esc(pages[name][2])}">${PresenUI.icon(icon)}<span>${esc(title)}</span></button>`).join('')+'<button type="button" data-appearance title="Atur tema, warna, dan latar aplikasi">'+PresenUI.icon('settings')+'<span>Tampilan</span></button>';
 const toolbar=document.getElementById('topToolbar'),dataHeader=document.querySelector('.card-header-flex');
 if(toolbar){toolbar.prepend(nav);toolbar.querySelectorAll('a[href]').forEach(a=>{if(dest(a))a.remove();});}
 else if(dataHeader){dataHeader.append(nav);dataHeader.querySelectorAll('.header-actions a[href]').forEach(a=>{if(dest(a))a.remove();});}
}
if(innerWidth<=768){document.getElementById('inspectorPanel')?.classList.add('minimized');window.sinkronkanPeganganPanel?.();}
for(const el of document.querySelectorAll('.portal-nav [data-nav],.portal-nav [data-control],.portal-nav [data-monitoring],.portal-quick-grid [data-nav],.portal-quick-grid [data-control],.p-worknav button,.header-actions a,#topToolbar a')){const text=label(el);if(text){el.title=text;el.setAttribute('aria-label',(dest(el)==='index.php'?'Beranda':pages[dest(el)]?.[0]||'Menu')+'. '+text);}}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=target(e);if(!el||el.contains(e.relatedTarget))return;clearTimeout(timer);timer=setTimeout(()=>show(el),220);});
document.addEventListener('pointerout',e=>{const el=target(e);if(el&&!el.contains(e.relatedTarget))timer=setTimeout(hide,160);});
tip.addEventListener('pointerenter',()=>clearTimeout(timer));tip.addEventListener('pointerleave',hide);
document.addEventListener('focusin',e=>{const el=target(e);if(el){clearTimeout(timer);show(el);}});document.addEventListener('focusout',e=>{if(target(e))timer=setTimeout(hide,160);});
document.addEventListener('click',e=>{if(!tip.contains(e.target)&&!target(e))hide();});document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
window.addEventListener('resize',()=>focused&&show(focused));window.addEventListener('scroll',()=>focused&&show(focused),true);
window.PresenWorkspace={close:hide,open:async target=>{hide();if(target==='accounts'){await window.PresenInbox?.open();return;}if(target===page)return;await PresenUI.navigate(target);}};
if(new URLSearchParams(location.search).get('view')==='accounts'&&page==='index.php')setTimeout(()=>window.toggleSidebar?.(),400);
})();

} catch(error) {console.error("Teacher module app/workspace.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/sheet-signatures.js */
try {
/* Gambar tanda tangan per lembar/kelas, tanpa mengubah isi identitas dosen. */
(() => {
    'use strict';
    const validImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(value);
    const layout = value => {const v=typeof value==='string'?{src:value}:value||{};return {src:validImage(v.src)?v.src:'',x:Math.max(-100,Math.min(100,Number(v.x)||0)),y:Math.max(-20,Math.min(80,Number(v.y)||0)),scale:Math.max(25,Math.min(200,Number(v.scale)||100))};};
    const read = slot => layout({src:slot.querySelector('.sheet-signature-image')?.getAttribute('src'),x:slot.dataset.signatureX,y:slot.dataset.signatureY,scale:slot.dataset.signatureScale});
    const restore = (slot,value) => {const v=layout(value),img=slot.querySelector('.sheet-signature-image');if(!img)return;img.hidden=!v.src;if(v.src)img.src=v.src;else img.removeAttribute('src');slot.classList.toggle('has-signature',!!v.src);slot.dataset.signatureX=v.x;slot.dataset.signatureY=v.y;slot.dataset.signatureScale=v.scale;img.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.scale/100})`;for(const action of slot.querySelectorAll('[data-signature-remove],[data-signature-position]'))action.hidden=!v.src;const upload=slot.querySelector('[data-signature-upload]');if(upload)upload.textContent=v.src?'Ganti gambar':'+ Tanda tangan / foto';};
    function exportBox(box){
        const img=box.querySelector('.sheet-signature-image:not([hidden])');if(!img?.complete||!img.naturalWidth)return null;
        const rect=box.getBoundingClientRect(),scale=rect.width/box.offsetWidth||1,w=box.offsetWidth,h=box.offsetHeight,canvas=document.createElement('canvas');canvas.width=Math.ceil(w*2);canvas.height=Math.ceil(h*2);const c=canvas.getContext('2d');c.scale(2,2);c.textBaseline='top';
        const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||parent.closest('.signature-space,.sheet-signature-controls,.p-screen-only')||!node.textContent.trim())continue;const style=getComputedStyle(parent);c.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;c.fillStyle=style.color;const lines=new Map();for(let i=0;i<node.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;const y=Math.round((r.top-rect.top)/scale*10)/10,k=String(y);if(!lines.has(k))lines.set(k,{x:(r.left-rect.left)/scale,y,text:''});lines.get(k).text+=node.textContent[i];}for(const line of lines.values())c.fillText(style.textTransform==='uppercase'?line.text.toUpperCase():line.text,line.x,line.y);}
        box.querySelectorAll('.signature-name').forEach(el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();if(parseFloat(style.borderBottomWidth)>0){c.strokeStyle=style.borderBottomColor;c.lineWidth=parseFloat(style.borderBottomWidth);c.beginPath();c.moveTo((r.left-rect.left)/scale,(r.bottom-rect.top)/scale-1);c.lineTo((r.right-rect.left)/scale,(r.bottom-rect.top)/scale-1);c.stroke();}});
        const r=img.getBoundingClientRect(),iw=r.width/scale,ih=r.height/scale,fit=Math.min(iw/img.naturalWidth,ih/img.naturalHeight),dw=img.naturalWidth*fit,dh=img.naturalHeight*fit;c.drawImage(img,(r.left-rect.left)/scale,(r.top-rect.top)/scale+(ih-dh)/2,dw,dh);
        return {src:canvas.toDataURL('image/png'),width:w,height:h};
    }
    window.SheetSignatures = {read,restore,exportBox,
        install(options){this.ready=this.installForAccount(options);return this.ready;},
        async installForAccount({root, storageKey, onChange = () => {}}) {
            if (!root) return;
            const state=await window.WA?.get();storageKey='sheet-signatures-'+(state?.profile?.account?.id||'local')+'-'+storageKey;
            let saved = {};
            try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
            const notify = message => {
                document.querySelector('.sheet-signature-status')?.remove();
                const status = document.createElement('div');
                status.className = 'sheet-signature-status'; status.setAttribute('role', 'status'); status.textContent = message;
                document.body.appendChild(status); setTimeout(() => status.remove(), 5000);
            };
            const render = (slot, source) => {restore(slot,source);onChange();};
            root.querySelectorAll('[data-signature-slot]').forEach(slot => {
                const label = slot.dataset.signatureLabel || 'Tanda tangan';
                const img = document.createElement('img'); img.className = 'sheet-signature-image'; img.alt = label; img.hidden = true;
                img.addEventListener('load', onChange);
                const controls = document.createElement('div'); controls.className = 'sheet-signature-controls';
                const upload = document.createElement('button'); upload.type = 'button'; upload.className = 'sheet-signature-action'; upload.dataset.signatureUpload = ''; upload.setAttribute('aria-label', 'Unggah foto atau ' + label.toLowerCase());
                upload.title = 'Pilih gambar, atau tempel gambar dari clipboard pada blok tanda tangan yang dipilih.';
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'sheet-signature-action'; remove.dataset.signatureRemove = ''; remove.textContent = 'Hapus'; remove.setAttribute('aria-label', 'Hapus gambar ' + label.toLowerCase());
                const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true; input.dataset.signatureFile = ''; input.setAttribute('aria-label', 'Berkas gambar ' + label.toLowerCase());
                const position=document.createElement('button');position.type='button';position.className='sheet-signature-action';position.dataset.signaturePosition='';position.textContent='Atur posisi';controls.append(upload,position,remove,input); slot.replaceChildren(img, controls);
                render(slot,saved[slot.dataset.signatureSlot]);
            });
            const persist = (slot, source) => {
                const next = {...saved};
                const value=layout(source);if (value.src) next[slot.dataset.signatureSlot] = value; else delete next[slot.dataset.signatureSlot];
                try { localStorage.setItem(storageKey, JSON.stringify(next)); }
                catch (_) { notify('Gambar belum tersimpan. Penyimpanan browser penuh atau tidak tersedia; pilih gambar lebih kecil.'); return false; }
                saved = next; render(slot, source); document.dispatchEvent(new Event('sheet-signature-changed')); return true;
            };
            const loadFile = async (slot, file) => {
                if (!file) return;
                if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { notify('Pilih gambar PNG, JPG, atau WEBP.'); return; }
                if (file.size > 10 * 1024 * 1024) { notify('Ukuran gambar maksimal 10 MB.'); return; }
                const url = URL.createObjectURL(file);
                try {
                    const img = new Image();
                    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
                    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
                    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const source = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
                    if (persist(slot,{src:source,x:0,y:24,scale:100})) notify('PNG transparan dapat menimpa nama. Seret gambar atau pilih Atur posisi.');
                } catch (_) { notify('Gambar tidak dapat dibaca. Pilih berkas gambar lain.'); }
                finally { URL.revokeObjectURL(url); }
            };
            function positionDialog(slot){
                const d=window.PresenUI?.dialog('Posisi tanda tangan','<p>Gambar melayang di atas nama; teks dan tabel tidak digeser. PNG transparan mempertahankan latarnya.</p><label>Geser kiri / kanan<input data-sign-x type="range" min="-100" max="100"></label><label>Geser atas / bawah<input data-sign-y type="range" min="-20" max="80"></label><label>Ukuran (%)<input data-sign-scale type="range" min="25" max="200"></label><div class="p-actions"><button type="button" data-sign-overlay>Timpa area nama</button><button type="button" data-sign-reset>Posisi semula</button></div>');if(!d)return;d.classList.add('p-screen-only');let timer;const refresh=()=>{const v=read(slot);for(const k of ['x','y','scale'])d.querySelector('[data-sign-'+k+']').value=v[k];};refresh();d.oninput=()=>{const v=read(slot);for(const k of ['x','y','scale'])v[k]=Number(d.querySelector('[data-sign-'+k+']').value);restore(slot,v);clearTimeout(timer);timer=setTimeout(()=>persist(slot,read(slot)),150);};d.querySelector('[data-sign-overlay]').onclick=()=>{persist(slot,{...read(slot),x:0,y:24,scale:100});refresh();};d.querySelector('[data-sign-reset]').onclick=()=>{persist(slot,{...read(slot),x:0,y:0,scale:100});refresh();};d.addEventListener('close',()=>{clearTimeout(timer);persist(slot,read(slot));});
            }
            let dragging;
            root.addEventListener('pointerdown',event=>{const img=event.target.closest('.sheet-signature-image');if(!img||img.hidden||event.button!==0)return;event.preventDefault();event.stopPropagation();const slot=img.closest('[data-signature-slot]'),zoom=root.getBoundingClientRect().width/root.offsetWidth||1;dragging={slot,value:read(slot),x:event.clientX,y:event.clientY,zoom};img.setPointerCapture(event.pointerId);});
            root.addEventListener('pointermove',event=>{if(!dragging)return;restore(dragging.slot,{...dragging.value,x:dragging.value.x+(event.clientX-dragging.x)/dragging.zoom,y:dragging.value.y+(event.clientY-dragging.y)/dragging.zoom});});
            const endDrag=()=>{if(!dragging)return;persist(dragging.slot,read(dragging.slot));dragging=null;};root.addEventListener('pointerup',endDrag);root.addEventListener('pointercancel',endDrag);
            // Delegasi tetap bekerja setelah Undo/Redo mengganti isi kertas.
            root.addEventListener('click', event => {
                const action = event.target.closest('[data-signature-upload], [data-signature-remove], [data-signature-position]');
                if (!action) return;
                const slot = action.closest('[data-signature-slot]');
                event.preventDefault(); event.stopPropagation();
                if (action.hasAttribute('data-signature-upload')) slot.querySelector('[data-signature-file]').click();
                else if(action.hasAttribute('data-signature-position'))positionDialog(slot);else persist(slot, '');
            }, true);
            root.addEventListener('change', event => {
                if (!event.target.matches('[data-signature-file]')) return;
                const input = event.target;
                void loadFile(input.closest('[data-signature-slot]'), input.files?.[0]); input.value = '';
            });
            root.addEventListener('paste', event => {
                const slot = event.target.closest('[data-signature-slot]') || event.target.closest('.signature-box')?.querySelector('[data-signature-slot]') || root.querySelector('.signature-box.selected [data-signature-slot]');
                const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
                if (!slot || !item) return;
                event.preventDefault(); void loadFile(slot, item.getAsFile());
            });
        }
    };
})();

} catch(error) {console.error("Teacher module assets/sheet-signatures.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/sheet-spacing.js */
try {
/* Stored signature offsets must move flow space as well as visible ink. */
(() => {
 'use strict';
 const positions=new WeakMap();let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;window.pastikanJarakTandaTangan();window.perbaruiPenandaHalaman?.();window.perbaruiPenandaHalamanUjian?.();});}
 window.pastikanJarakTandaTangan = () => {
  const paper=document.getElementById('paperSheet'),footer=paper?.querySelector('.signature-section');if(!footer)return;
  const boxes=[...footer.querySelectorAll('.signature-box')];if(!boxes.length)return;
  const offsets=boxes.map(box=>{positions.set(box,box.style.transform);try{const m=new DOMMatrix(box.style.transform||'none');return{x:m.m41,y:m.m42};}catch(_){return{x:0,y:0};}});
  const firstY=Math.min(...offsets.map(p=>p.y)),gap=parseFloat(getComputedStyle(paper).getPropertyValue('--wa-signature-gap'))||24;
  footer.classList.add('wa-signature-flow');footer.style.marginTop=gap+'px';footer.style.paddingTop='1px';footer.style.paddingBottom='0px';
  boxes.forEach((box,i)=>{box.style.setProperty('--wa-signature-x',offsets[i].x+'px');box.style.setProperty('--wa-signature-offset',(offsets[i].y-firstY)+'px');});
  // The inspector owns the requested coordinates. Do not silently clamp an
  // upward move or derive offsets from a preview-only page-break spacer.
  let margin=gap+firstY;
  if(firstY>=0){
   const upper=paper.querySelector('.grading-wrap,#tableWrapper,#tabelAbsen');
   const scale=paper.offsetWidth?paper.getBoundingClientRect().width/paper.offsetWidth:1;
   if(upper&&scale)margin+=Math.max(0,(upper.getBoundingClientRect().bottom+gap*scale-footer.getBoundingClientRect().top)/scale);
  }
  footer.style.marginTop=margin+'px';
 };
 function install(){const footer=document.querySelector('#paperSheet .signature-section');if(footer)new MutationObserver(records=>{if(records.some(r=>r.target.matches('.signature-box')&&positions.get(r.target)!==r.target.style.transform))schedule();}).observe(footer,{subtree:true,attributes:true,attributeFilter:['style']});schedule();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
 document.addEventListener('sheet-position-changed',schedule);
 window.addEventListener('beforeprint',window.pastikanJarakTandaTangan);
 window.addEventListener('afterprint',schedule);
 matchMedia('print').addEventListener('change',schedule);
 document.fonts?.ready.then(schedule);
})();

} catch(error) {console.error("Teacher module assets/sheet-spacing.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/sheet-fit.js */
try {
/* Fit text without changing data, column order, or the original sheet layout. */
(()=>{
'use strict';const paper=document.querySelector('#paperSheet,#paper');if(!paper)return;const tables='#tabelAbsen,#examTableBlock table,#examScaleBlock table,#tabelRekapNilai';const single='.meta-label,.meta-val,.meta-value,.institution .line,.institution .contact,.header-text>*';const ctx=document.createElement('canvas').getContext('2d'),sizes=new WeakMap();let scheduled=false,running=false;
function text(el){return (el.matches('input')?el.value:el.textContent||'').replace(/\s+/g,' ').trim();}
function available(el){const s=getComputedStyle(el);return el.clientWidth-parseFloat(s.paddingLeft||0)-parseFloat(s.paddingRight||0);}
function measure(el,value,size){const s=getComputedStyle(el);ctx.font=`${s.fontStyle} ${s.fontWeight} ${size||parseFloat(s.fontSize)}px ${s.fontFamily}`;return ctx.measureText(s.textTransform==='uppercase'?value.toUpperCase():value).width;}
function fit(el){if(!el.getClientRects().length)return;const value=text(el);if(!value)return;const previous=sizes.get(el)||(el.hasAttribute('data-wa-fit-font')?{value:el.dataset.waFitFont,priority:el.dataset.waFitPriority||''}:null);if(previous)el.style.setProperty('font-size',previous.value,previous.priority);const style=getComputedStyle(el),base=parseFloat(style.fontSize),width=available(el);if(width<4)return;const needed=measure(el,value,base);if(needed>width-2){if(!previous){const original={value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')};sizes.set(el,original);el.dataset.waFitFont=original.value;el.dataset.waFitPriority=original.priority;}const size=Math.max(4,Math.floor(base*(width-2)/needed*100)/100);el.style.setProperty('font-size',size+'px','important');el.title=value;}else if(previous){sizes.delete(el);delete el.dataset.waFitFont;delete el.dataset.waFitPriority;}}
function prepareTable(table){table.querySelectorAll('th br').forEach(br=>br.replaceWith(document.createTextNode(' ')));if(table.id==='tabelRekapNilai'){
 const header=table.tHead,rows=Array.from(table.tBodies[0]?.rows||[]),cols=Array.from(table.querySelectorAll('colgroup col'));
 const printing=matchMedia('print').matches&&document.body.classList.contains('cetak-rekap');
 if(printing){const widths=[3,18,12,4,5,4,4,4,6,7,7,5,5,6,5,5];cols.forEach((col,i)=>col.style.width=widths[i]+'%');table.style.width='100%';table.style.minWidth='0';return;}
 const leaf=[];let index=0;for(const cell of header.rows[0].cells){if(cell.rowSpan>1)leaf[index]=cell;index+=cell.colSpan;}
 index=0;for(const cell of header.rows[1].cells){while(leaf[index])index++;leaf[index++]=cell;}
 const font=Math.max(11,parseFloat(getComputedStyle(table).fontSize)),widths=leaf.map((cell,i)=>Math.ceil(Math.max(i===1?210:i===2?145:60,measure(cell,text(cell),font)+20,...rows.map(row=>{const item=row.cells[i];return item?.querySelector('input')?70:measure(item,text(item),font)+20;}))));
 cols.forEach((col,i)=>col.style.width=widths[i]+'px');table.style.width=widths.reduce((a,b)=>a+b,0)+'px';table.style.minWidth=table.style.width;

 }
}
function restoreSize(el){const previous=sizes.get(el)||(el.hasAttribute('data-wa-fit-font')?{value:el.dataset.waFitFont,priority:el.dataset.waFitPriority||''}:null);if(previous)el.style.setProperty('font-size',previous.value,previous.priority);sizes.delete(el);delete el.dataset.waFitFont;delete el.dataset.waFitPriority;}
function bodySize(){const field=document.getElementById('fontSizeSelect')||document.getElementById('examFontSize');return Math.max(1,Math.min(100,Number(field?.value)||8.5))*4/3;}
function tableItems(table){return [...table.querySelectorAll('th,td')].filter(cell=>!cell.closest('.page-preview-only')&&!cell.classList.contains('empty-note')&&!cell.classList.contains('date-entry')).flatMap(cell=>cell.querySelector('input')?[...cell.querySelectorAll('input')]:[cell]);}
function commonFont(items,base){return Math.max(Math.min(4,base),Math.min(base,...items.filter(el=>el.getClientRects().length&&text(el)&&available(el)>3).map(el=>Math.floor(base*(available(el)-2)/Math.max(1,measure(el,text(el),base))*100)/100)));}
function attendanceWidths(base){
 const table=document.getElementById('tabelAbsen'),head=table?.tHead?.rows[0];if(!head||head.cells.length!==6)return;
 const width=table.parentElement.clientWidth,count=Number(document.getElementById('headerPertemuan')?.colSpan)||16;
 const widest=(selector,minimum)=>Math.max(minimum,...[...table.querySelectorAll(selector)].map(el=>measure(el,text(el),base)+20));
 const no=Math.max(28,measure(head.cells[0],text(head.cells[0]),base)+18),sex=Math.max(28,measure(head.cells[3],text(head.cells[3]),base)+18),ket=Math.max(30,measure(head.cells[5],text(head.cells[5]),base)+18);
 const nim=Math.min(width*.28,widest('.nim-input',96)),nameSpace=width-no-sex-ket-nim;
 const name=Math.min(Math.max(100,nameSpace-count*12),Math.max(150,widest('.name-input',150)+22)),values=[no,nim,name,sex,Math.max(count*12,nameSpace-name),ket];
 table.style.tableLayout='fixed';[...head.cells].forEach((cell,i)=>{cell.style.width=values[i]/width*100+'%';cell.style.minWidth='0';});
}
function examWidths(base){
 const table=paper.querySelector('#examTableBlock table');if(table){
  const width=table.parentElement.clientWidth,rows=[...table.querySelectorAll('tbody tr:not(.page-preview-only)')];
  const needed=(i,min)=>Math.max(min,...rows.map(row=>row.cells[i]?measure(row.cells[i],text(row.cells[i]),base)+20:min));
  const nim=needed(1,100),name=needed(2,175),fixed=[56,nim,name,50,55,55,40],total=fixed.reduce((a,b)=>a+b,0);
  const extra=Math.max(0,width-total);fixed[2]+=extra*.7;fixed[6]+=extra*.3;
  table.querySelectorAll('colgroup col').forEach((col,i)=>col.style.width=fixed[i]/Math.max(width,total)*100+'%');
 }
 const scale=paper.querySelector('.grading-scale');if(scale){
  const table=scale.querySelector('table'),widths=[];for(let i=0;i<4;i++)widths.push(Math.max(60,...[...scale.querySelectorAll('tr')].map(row=>row.cells[i]?measure(row.cells[i],text(row.cells[i]),base)+18:0)));
  const total=widths.reduce((a,b)=>a+b,0);scale.style.width=Math.max(320,total)+'px';
  let group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');for(let i=0;i<4;i++)group.append(document.createElement('col'));table.prepend(group);}group.querySelectorAll('col').forEach((col,i)=>col.style.width=widths[i]/total*100+'%');
 }

}
function update(){scheduled=false;if(running)return;running=true;try{
 const primary=[...paper.querySelectorAll('#tabelAbsen,#examTableBlock table,#examScaleBlock table')],base=bodySize(),meta=[...paper.querySelectorAll('.meta-label,.meta-val,.meta-value')];
 const items=primary.flatMap(tableItems);[...items,...meta].forEach(restoreSize);paper.style.setProperty('--wa-sheet-body-font',base+'px');items.forEach(el=>el.style.setProperty('font-size',base+'px','important'));
 attendanceWidths(base);examWidths(base);window.WAFitAttendanceDates?.();
 paper.querySelectorAll('input.attendance-cell').forEach(input=>{
  const present=input.value.trim()==='.',cell=input.closest('td');input.classList.toggle('wa-presence-dot',present);
  let ink=cell.querySelector('.wa-presence-ink');
  if(present&&!ink){ink=document.createElementNS('http://www.w3.org/2000/svg','svg');ink.classList.add('wa-presence-ink');ink.setAttribute('viewBox','0 0 10 10');ink.setAttribute('aria-hidden','true');const circle=document.createElementNS(ink.namespaceURI,'circle');circle.setAttribute('cx','5');circle.setAttribute('cy','5');circle.setAttribute('r','5');circle.setAttribute('fill','currentColor');ink.append(circle);cell.append(ink);}
  if(ink){ink.style.display=present?'block':'none';ink.style.color=getComputedStyle(input).color;const diameter=Math.max(1,Math.min(5,base*.38,input.clientWidth-4,input.clientHeight-4));ink.style.width=ink.style.height=diameter+'px';}
 });
 // A narrow label must never reduce the body font of the entire document.
 // The selected point size is authoritative; only long metadata values fit locally.
 meta.filter(el=>!el.matches('.meta-label')).forEach(fit);
 for(const el of items)if(text(el))el.title=text(el);
 paper.querySelectorAll('.institution .line,.institution .contact,.header-text>*').forEach(fit);
 const recap=document.querySelector('#tabelRekapNilai');if(recap&&recap.getClientRects().length){prepareTable(recap);const cells=tableItems(recap);cells.forEach(restoreSize);const printing=matchMedia('print').matches&&document.body.classList.contains('cetak-rekap'),size=printing?7*4/3:commonFont(cells,12);for(const el of cells)el.style.setProperty('font-size',size+'px','important');}
 window.pastikanJarakTandaTangan?.();
 }finally{running=false;}}
// Measure generated Office markup at its actual paper width before saving it.
window.WAFitExportHTML=(html,width)=>{
 const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');frame.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:100px;visibility:hidden;pointer-events:none`;document.body.appendChild(frame);
 try{const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();doc.body.style.width=width+'px';
  const fitExport=(el,limit)=>{const value=text(el);if(!value)return;const style=frame.contentWindow.getComputedStyle(el),base=parseFloat(style.fontSize);ctx.font=`${style.fontStyle} ${style.fontWeight} ${base}px ${style.fontFamily}`;const needed=ctx.measureText(style.textTransform==='uppercase'?value.toUpperCase():value).width;
   if(needed>limit-2){for(const node of [el,...el.querySelectorAll('span,p,small')]){node.style.whiteSpace='normal';node.style.overflowWrap='anywhere';node.style.wordBreak='break-word';node.style.lineHeight='1.3';node.style.setProperty('mso-line-height-rule','at-least');}}else el.style.whiteSpace='nowrap';};
  doc.querySelectorAll('th,td').forEach(cell=>{const style=frame.contentWindow.getComputedStyle(cell),space=cell.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0);
   if(cell.matches('.date-entry')||cell.closest('.doc-header,.export-header,.doc-signatures,.export-signatures'))return;
   if(cell.closest('.doc-meta')){cell.querySelectorAll('p>span').forEach(row=>{const value=row.lastElementChild;if(value){const label=row.firstElementChild.getBoundingClientRect().width,colon=row.children[1]?.getBoundingClientRect().width||0;fitExport(value,space-label-colon-12);}});return;}fitExport(cell,space);
  });
  return '<!doctype html>'+doc.documentElement.outerHTML;
 }finally{frame.remove();}
};
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(update);}window.WAFitSheetText=update;
const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='characterData'||r.type==='childList'))schedule();});observer.observe(paper,{subtree:true,childList:true,characterData:true});const recap=document.querySelector('#tabelRekapNilai');if(recap)observer.observe(recap,{subtree:true,childList:true,characterData:true});
document.addEventListener('input',e=>{if(e.target.closest('#paperSheet,#paper,#tabelRekapNilai'))schedule();});document.addEventListener('change',schedule);window.addEventListener('resize',schedule);window.addEventListener('beforeprint',update);matchMedia('print').addEventListener('change',schedule);document.fonts?.ready.then(schedule);new ResizeObserver(schedule).observe(paper);window.WA?.on(schedule);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[contenteditable="true"]')&&e.target.closest('#paperSheet,#paper')){e.preventDefault();document.execCommand('insertText',false,' ');schedule();}});
document.addEventListener('paste',e=>{if(e.target.matches('[contenteditable="true"]')&&e.target.closest('#paperSheet,#paper')){const value=e.clipboardData?.getData('text/plain');if(value!=null){e.preventDefault();document.execCommand('insertText',false,value.replace(/\s+/g,' '));schedule();}}});
async function sizeControls(){
 const field=document.getElementById('fontSizeSelect')||document.getElementById('examFontSize');if(!field)return;
 let state;try{state=await window.WA?.get();}catch(_){}
 const query=Object.fromEntries(new URLSearchParams(location.search)),selection={...state?.selection,...query},owner=state?.profile?.account?.id||'local';
 const key='presen-sheet-size-'+encodeURIComponent(JSON.stringify([owner,selection.prodi,selection.semester,selection.kelas,selection.year,selection.period,selection.matkul||'']));
 const normalize=value=>({waLayoutVersion:2,pt:Math.max(1,Math.min(100,Number(value?.pt)||9)),rowPadding:Math.max(0,Math.min(8,Number(value?.rowPadding??2))),signatureGap:Math.max(12,Math.min(100,Number(value?.signatureGap)||24)),scaleImages:!!value?.scaleImages,updatedAt:Number(value?.updatedAt)||0});
 let settings=normalize(),signatureHeight=parseFloat(getComputedStyle(paper.querySelector('.signature-space')||paper).height)||72;
 let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
 if(saved){settings=normalize(saved);if(saved.compact&&!saved.waLayoutVersion)settings.pt=Math.max(9,settings.pt);}
 const scope=state?.profile?await WA.scope(selection,selection.matkul||''):null;
 function printPaper(){
  const formats={a4:[210,297],folio:[215.9,330],letter:[215.9,279.4]},choice=document.getElementById('paperSize')?.value||'a4';
  let [w,h]=formats[choice]||formats.a4;if(document.getElementById('paperOrientation')?.value==='landscape')[w,h]=[h,w];
  paper.style.setProperty('--wa-print-width',w+'mm');paper.dataset.pageHeightMm=String(h);
  let style=document.getElementById('sheetPrintPage');if(!style){style=document.createElement('style');style.id='sheetPrintPage';style.media='print';document.head.append(style);}style.textContent='@page{size:'+w+'mm '+h+'mm;margin:0}';
 }
 printPaper();document.addEventListener('change',e=>{if(e.target.matches('#paperSize,#paperOrientation'))printPaper();});window.addEventListener('beforeprint',printPaper);

 function apply(value){
  settings=normalize(value);field.value=String(settings.pt);paper.classList.remove('wa-fit-35');
  paper.style.setProperty('--global-font-size',settings.pt*4/3+'px');paper.style.setProperty('--exam-font-scale',String(settings.pt/9));
  paper.style.setProperty('--wa-row-padding',settings.rowPadding+'px');paper.style.setProperty('--wa-signature-gap',settings.signatureGap+'px');
  paper.style.setProperty('--wa-image-scale',settings.scaleImages?settings.pt/9:1);paper.classList.toggle('wa-scale-images',settings.scaleImages);
  paper.style.setProperty('--wa-base-signature-height',signatureHeight+'px');update();
  requestAnimationFrame(()=>{window.perbaruiPenandaHalaman?.();window.perbaruiPenandaHalamanUjian?.();});
 }
 apply(settings);
 async function restore(){const snapshot=(await WA.get())?.snapshot,remote=snapshot?.documents.find(d=>d.scope===scope&&d.kind==='attendance-layout')?.content;if(remote?.waLayoutVersion===2&&remote.updatedAt>settings.updatedAt){apply(remote);localStorage.setItem(key,JSON.stringify(settings));}}
 if(scope){await restore();WA.on(()=>{void restore();});}
 function save(){settings.pt=Number(field.value)||9;settings.updatedAt=Date.now();apply(settings);localStorage.setItem(key,JSON.stringify(settings));if(scope)void WA.saveDocument(selection,selection.matkul||'','attendance-layout',settings);}
 field.addEventListener('input',save);field.addEventListener('change',save);
 const button=document.createElement('button');button.type='button';button.id='sheetLayoutSettings';button.className='btn btn-dark';button.textContent='Tata letak';button.title='Atur jarak baris, ruang tanda tangan, dan skala gambar';field.closest('label').after(button);
 button.onclick=()=>{
  const d=window.PresenUI?.dialog('Tata letak lembar','<p>Ukuran pada bilah alat mengatur teks tabel, identitas, dan tanda tangan. Kop mengikuti ukuran itu secara proporsional. Jumlah mahasiswa tidak mengecilkan font otomatis.</p><label>Jarak baris tabel <span data-row-value></span><input id="sheetRowPadding" type="range" min="0" max="8" step="0.5"></label><label>Jarak sebelum tanda tangan <span data-gap-value></span><input id="sheetSignatureGap" type="range" min="12" max="100" step="2"></label><label class="sheet-layout-check"><input id="sheetScaleImages" type="checkbox"> Sesuaikan ukuran logo dan ruang gambar tanda tangan dengan font</label><p class="small">Tanda tangan PNG tetap dapat diatur posisinya. Jika isi melebihi kertas, cetak dilanjutkan ke halaman berikutnya tanpa mengecilkan teks.</p><button type="button" id="sheetLayoutReset">Pulihkan ukuran standar</button>');if(!d)return;d.classList.add('p-screen-only','sheet-layout-dialog');
  const refresh=()=>{d.querySelector('#sheetRowPadding').value=settings.rowPadding;d.querySelector('#sheetSignatureGap').value=settings.signatureGap;d.querySelector('#sheetScaleImages').checked=settings.scaleImages;d.querySelector('[data-row-value]').textContent=settings.rowPadding+' px';d.querySelector('[data-gap-value]').textContent=settings.signatureGap+' px';};refresh();
  d.addEventListener('input',()=>{settings.rowPadding=Number(d.querySelector('#sheetRowPadding').value);settings.signatureGap=Number(d.querySelector('#sheetSignatureGap').value);settings.scaleImages=d.querySelector('#sheetScaleImages').checked;save();refresh();});
  d.querySelector('#sheetLayoutReset').onclick=()=>{settings=normalize({updatedAt:Date.now()});field.value='9';save();refresh();};
 };
}
void sizeControls();schedule();
})();

/* Meeting date editor: large touch controls, compact printable date cells. */
(()=>{
'use strict';if(!document.getElementById('tabelAbsen'))return;
let active=null,activeInput=null;document.addEventListener('focusin',e=>{if(e.target.matches('#subHeaderPertemuan .date-entry')){active=e.target;activeInput=null;}else if(e.target.matches('#paperSheet input:not([type=file])')){activeInput=e.target;active=null;}});
const months={jan:'01',januari:'01',feb:'02',februari:'02',mar:'03',maret:'03',apr:'04',april:'04',mei:'05',jun:'06',juni:'06',jul:'07',juli:'07',agu:'08',ags:'08',aug:'08',agustus:'08',sep:'09',september:'09',okt:'10',oktober:'10',nov:'11',november:'11',des:'12',desember:'12'};
const compactDate=value=>{const clean=String(value||'').trim().replace(/\s+/g,' '),m=clean.match(/^(\d{1,2})[\s/.-]+([a-z]+|\d{1,2})[\s/.-]+(\d{2}|\d{4})$/i);return m?m[1].padStart(2,'0')+'/'+(months[m[2].toLowerCase()]||m[2].padStart(2,'0'))+'/'+m[3].slice(-2):clean;};
function dateFromText(text,reference){const match=compactDate(text).match(/^(\d{2})\/(\d{2})\/(\d{2})$/),full=String(text).trim().match(/(?:^|[\s/.-])(\d{4})$/);if(!match)return '';const year=full?Number(full[1]):Math.floor(Number((reference||WA.day()).slice(0,4))/100)*100+Number(match[3]),month=Number(match[2]),day=Number(match[1]),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?String(year)+'-'+match[2]+'-'+match[1]:'';}
function sheetDatePoint(){return Math.max(2,Math.min(72,Math.round((Number(document.getElementById('fontSizeSelect')?.value)||9)*1.2)/2));}
const dateFormatKeys=['color','fontWeight','fontStyle','textDecoration'];
function dateFormat(cell){return Object.fromEntries(dateFormatKeys.map(key=>[key,cell.style[key]||({color:'#111',fontWeight:'normal',fontStyle:'normal',textDecoration:'none'}[key])]));}
function commonDateFormat(){try{const value=JSON.parse(document.getElementById('headerPertemuan')?.dataset.dateDefaultFormat||'null');return value&&typeof value==='object'?value:null;}catch(_){return null;}}
function setDateFormat(patch){
 const header=document.getElementById('headerPertemuan'),format={...(commonDateFormat()||dateFormat(active||document.querySelector('.date-entry'))),...patch};
 if(header)header.dataset.dateDefaultFormat=JSON.stringify(format);
 for(const target of document.querySelectorAll('#subHeaderPertemuan .date-entry'))for(const key of dateFormatKeys)if(typeof format[key]==='string')target.style[key]=format[key];
}
window.WAFitAttendanceDates=()=>{const defaults=document.getElementById('headerPertemuan')?.dataset||{};document.querySelectorAll('#subHeaderPertemuan .date-entry').forEach((cell,index)=>{
 if(!cell.dataset.dateSize&&defaults.dateDefaultSize){cell.dataset.dateSize=defaults.dateDefaultSize;cell.dataset.dateSizeMode=defaults.dateDefaultMode||'manual';}
 const format=commonDateFormat();if(format)for(const key of dateFormatKeys)if(typeof format[key]==='string')cell.style[key]=format[key];
 const value=compactDate(cell.textContent);let label=cell.querySelector('.wa-date-label');if(!label||cell.childNodes.length!==1){label=document.createElement('span');label.className='wa-date-label';cell.replaceChildren(label);}if(label.textContent!==value)label.textContent=value;
 cell.style.setProperty('--wa-date-color',cell.style.color||'#111');cell.contentEditable='false';cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label','Tanggal pertemuan '+(index+1)+(cell.dataset.attendanceDate?': '+cell.dataset.attendanceDate:value?': '+value:''));cell.title=(cell.dataset.attendanceDate||value||'Belum ada tanggal')+' · Ketuk untuk mengedit tanggal';
 const size=Math.max(12,cell.offsetWidth);cell.style.setProperty('--wa-date-cell',size+'px');
 const point=cell.dataset.dateSizeMode==='manual'?(Number(cell.dataset.dateSize)||6):sheetDatePoint(),preferred=Math.max(2,Math.min(72,point))*4/3;cell.style.setProperty('--wa-date-font',preferred+'px');label.style.setProperty('font-size',preferred+'px','important');
});};
function changed(cell){window.WAFitAttendanceDates();if(cell.matches('input'))document.dispatchEvent(new Event('sheet-position-changed'));else cell.dispatchEvent(new Event('input',{bubbles:true}));window.perbaruiPenandaHalaman?.();}
window.WASetMeetingDate=(session,persist=true)=>{const cell=document.querySelectorAll('#subHeaderPertemuan .date-entry')[Number(session.slot)-1];if(!cell||!/^\d{4}-\d{2}-\d{2}$/.test(session.day||''))return;const [year,month,day]=session.day.split('-');delete cell.dataset.dateManual;cell.dataset.attendanceDate=session.day;cell.dataset.dateSize=cell.dataset.dateSize||document.getElementById('headerPertemuan')?.dataset.dateDefaultSize||'6';cell.dataset.dateSizeMode=cell.dataset.dateSizeMode||document.getElementById('headerPertemuan')?.dataset.dateDefaultMode||'sync';cell.textContent=day+'/'+month+'/'+year.slice(-2);if(persist)changed(cell);else window.WAFitAttendanceDates();};

let dateRefresh=0;
async function restoreSessionDates(){const generation=++dateRefresh;try{const state=await WA.get();if(state.profile?.role!=='teacher')return;const query=Object.fromEntries(new URLSearchParams(location.search)),context={...state.selection,...query},scope=await WA.scope(context,query.matkul??state.selection?.matkul??'');if(generation!==dateRefresh)return;for(const session of state.snapshot.sessions.filter(x=>x.scope===scope)){const cell=document.querySelectorAll('#subHeaderPertemuan .date-entry')[Number(session.slot)-1];if(cell&&!cell.textContent.trim()&&!cell.dataset.dateManual)window.WASetMeetingDate(session,false);}}catch(_){} }
WA.on(()=>void restoreSessionDates());window.addEventListener('pageshow',()=>void restoreSessionDates());void restoreSessionDates();
function edit(cell){active=cell;const index=[...cell.parentElement.children].indexOf(cell)+1;
 const d=window.PresenUI?.dialog('Tanggal pertemuan '+index,'<form id="meetingDateForm"><p>Pilih tanggal atau edit teksnya langsung, misalnya 25/10/26. Isi tanggal berlaku untuk pertemuan yang dipilih. Ukuran, warna, tebal, miring dan garis bawah diseragamkan ke seluruh pertemuan.</p><label>Pertemuan<select name="slot"></select></label><label>Pilih tanggal<input name="date" type="date"></label><label>Teks di kotak tanggal<input name="dateText" type="text" maxlength="90" placeholder="25/10/26"></label><label class="date-size-sync"><input name="syncSize" type="checkbox"> Ikuti ukuran huruf lembar</label><label>Ukuran huruf tanggal (pt)<input name="size" type="number" min="2" max="72" step="0.5" required></label><label>Warna teks<input name="color" type="color"></label><div class="date-formats"><label><input name="bold" type="checkbox"> Tebal</label><label><input name="italic" type="checkbox"> Miring</label><label><input name="underline" type="checkbox"> Garis bawah</label></div><p class="small">Format tanggal berlaku untuk semua pertemuan, termasuk kolom baru. Ukuran tabel dan kolom tetap. Tombol B, I, U dan warna di bilah alat juga mengubah format seluruh tanggal saat tanggal dipilih.</p><div class="p-actions"><button class="p-primary" type="submit">Simpan tanggal</button><button type="button" data-clear-date>Kosongkan</button></div></form>');if(!d)return;d.classList.add('sheet-date-dialog','p-screen-only');const form=d.querySelector('form');form.elements.date.value=cell.dataset.attendanceDate||'';form.elements.size.value=cell.dataset.dateSize||6;
 form.elements.date.oninput=()=>{const value=form.elements.date.value;if(/^\d{4}-\d{2}-\d{2}$/.test(value))form.elements.dateText.value=compactDate(value.split('-').reverse().join('/'));};
 form.elements.syncSize.onchange=()=>{if(form.elements.syncSize.checked)form.elements.size.value=String(sheetDatePoint());};form.elements.size.oninput=()=>{form.elements.syncSize.checked=false;};
 function load(){form.elements.syncSize.checked=cell.dataset.dateSizeMode!=='manual';const style=getComputedStyle(cell),rgb=style.color.match(/\d+/g);form.elements.date.value=cell.dataset.attendanceDate||'';form.elements.dateText.value=cell.textContent.trim();form.elements.size.value=form.elements.syncSize.checked?String(sheetDatePoint()):(cell.dataset.dateSize||6);form.elements.color.value=rgb?'#'+rgb.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'#000000';form.elements.bold.checked=Number(style.fontWeight)>=600;form.elements.italic.checked=style.fontStyle==='italic';form.elements.underline.checked=style.textDecorationLine.includes('underline');}load();const cells=[...document.querySelectorAll('#subHeaderPertemuan .date-entry')];cells.forEach((_,i)=>form.elements.slot.add(new Option('Pertemuan '+(i+1),String(i))));form.elements.slot.value=String(index-1);form.elements.slot.onchange=()=>{const pending=Object.fromEntries(['size','syncSize','color','bold','italic','underline'].map(name=>[name,form.elements[name].type==='checkbox'?form.elements[name].checked:form.elements[name].value]));cell=cells[Number(form.elements.slot.value)];active=cell;load();for(const[name,value]of Object.entries(pending))form.elements[name][form.elements[name].type==='checkbox'?'checked':'value']=value;};
 form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const value=dateFromText(form.elements.dateText.value,form.elements.date.value);window.simpanStateUndo?.();if(/^\d{4}-\d{2}-\d{2}$/.test(value))cell.dataset.attendanceDate=value;else delete cell.dataset.attendanceDate;cell.dataset.dateManual='1';const defaults=document.getElementById('headerPertemuan');defaults.dataset.dateDefaultSize=form.elements.size.value;defaults.dataset.dateDefaultMode=form.elements.syncSize.checked?'sync':'manual';for(const target of cells){target.dataset.dateSizeMode=defaults.dataset.dateDefaultMode;target.dataset.dateSize=form.elements.size.value;}cell.textContent=compactDate(form.elements.dateText.value);setDateFormat({color:form.elements.color.value,fontWeight:form.elements.bold.checked?'bold':'normal',fontStyle:form.elements.italic.checked?'italic':'normal',textDecoration:form.elements.underline.checked?'underline':'none'});d.close();changed(cell);cell.focus({preventScroll:true});};
 d.querySelector('[data-clear-date]').onclick=()=>{window.simpanStateUndo?.();delete cell.dataset.attendanceDate;cell.dataset.dateManual='1';cell.textContent='';d.close();changed(cell);cell.focus({preventScroll:true});};
}
document.addEventListener('click',e=>{const cell=e.target.closest('#subHeaderPertemuan .date-entry');if(cell){activeInput=null;e.preventDefault();e.stopPropagation();edit(cell);}else if(e.target.closest('#paperSheet')){active=null;if(!e.target.matches('input'))activeInput=null;}},true);
document.addEventListener('keydown',e=>{if(e.target.matches('#subHeaderPertemuan .date-entry')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();edit(e.target);}},true);
const oldFormat=window.formatTeksWord,oldColor=window.formatWarnaTeks;
window.formatTeksWord=command=>{const property={bold:'fontWeight',italic:'fontStyle',underline:'textDecoration'}[command];if(active?.isConnected&&property){window.simpanStateUndo?.();const enabled={bold:'bold',italic:'italic',underline:'underline'}[command],disabled=command==='underline'?'none':'normal';setDateFormat({[property]:active.style[property]===enabled?disabled:enabled});changed(active);return;}if(activeInput?.isConnected&&property){window.simpanStateUndo?.();const enabled={bold:'bold',italic:'italic',underline:'underline'}[command];activeInput.style[property]=activeInput.style[property]===enabled?(command==='underline'?'none':'normal'):enabled;changed(activeInput);return;}return oldFormat?.(command);};
window.formatWarnaTeks=color=>{if(active?.isConnected){window.simpanStateUndo?.();setDateFormat({color});changed(active);return;}if(activeInput?.isConnected){window.simpanStateUndo?.();activeInput.style.color=color;changed(activeInput);return;}return oldColor?.(color);};
const button=document.createElement('button');button.type='button';button.id='sheetDateSettings';button.className='btn btn-dark';button.textContent='Tanggal pertemuan';button.onclick=()=>edit(active?.isConnected?active:document.querySelector('#subHeaderPertemuan .date-entry'));document.querySelector('#fontSizeSelect')?.closest('label').after(button);
window.WAFitAttendanceDates();
})();

} catch(error) {console.error("Teacher module assets/sheet-fit.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/native-export.js */
try {
(() => {
let host;try{host=parent!==window&&parent.location.origin===location.origin?parent.AbsensiDesktop:null;}catch(_){}const native=window.Android||window.AbsensiDesktop||host;if(!native)return;
function printableHTML(){window.pastikanJarakTandaTangan?.();const root=document.documentElement.cloneNode(true);root.classList.remove('wa-vector-print-ready');root.querySelectorAll('.wa-print-grid').forEach(el=>el.remove());root.querySelectorAll('[data-wa-print-grid-host],[data-wa-vector-grid]').forEach(el=>{el.removeAttribute('data-wa-print-grid-host');el.removeAttribute('data-wa-vector-grid');});const originals=document.querySelectorAll('input,textarea,select');root.querySelectorAll('input,textarea,select').forEach((el,i)=>{const value=originals[i];if(el.tagName==='INPUT'){el.setAttribute('value',value.value);if(value.checked)el.setAttribute('checked','');else el.removeAttribute('checked');}else if(el.tagName==='TEXTAREA')el.textContent=value.value;else Array.from(el.options).forEach((o,j)=>{if(value.options[j].selected)o.setAttribute('selected','');else o.removeAttribute('selected');});});root.querySelectorAll('.wa-guide,#waStatus,.p-screen-only,.p-dialog').forEach(el=>el.remove());root.querySelectorAll('script').forEach(el=>el.remove());return '<!doctype html>'+root.outerHTML;}window.AbsensiNativeExport={html:printableHTML};
const originalPrint=window.print.bind(window);window.print=()=>{if(native.printDocument)native.printDocument(printableHTML(),location.href);else if(native.print)native.print();else originalPrint();};
const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&/^(blob:|data:)/.test(this.href)){const name=this.download;fetch(this.href).then(r=>r.blob()).then(blob=>{const reader=new FileReader();reader.onload=()=>native.saveFile(name,blob.type,reader.result);reader.readAsDataURL(blob);}).catch(()=>alert('Berkas belum dapat disimpan. Coba lagi.'));return;}return click.call(this);};
})();

} catch(error) {console.error("Teacher module assets/native-export.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/app-audio.js */
try {
(() => {
    'use strict';
    const SETTINGS_KEY = 'absensi_ui_audio_settings_v1';
    const PLAYER_KEY = 'absensi_music_player_live_v1';
    const PLAYER_NAME = 'absensi_music_player_window';
    const APP_ROOT = new URL('../', document.currentScript.src);
    const IS_PLAYER_PAGE = /music_player\.php$/i.test(location.pathname);
    let audioContext = null;
    let channel = null;
    let musicOverlay = null;
    let musicFrame = null;
    let applicationFrame = null;
    let scrollStyles = null;
    let applicationUrl = location.href;

    function readSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return {
                effect: Math.max(1, Math.min(6, Number(saved.effect) || 1)),
                volume: Math.max(0, Math.min(100, Number(saved.volume ?? 25))),
                muted: Boolean(saved.muted)
            };
        } catch (_) { return { effect: 1, volume: 25, muted: false }; }
    }

    function writeSettings(settings) {
        const clean = {
            effect: Math.max(1, Math.min(6, Number(settings.effect) || 1)),
            volume: Math.max(0, Math.min(100, Number(settings.volume) || 0)),
            muted: Boolean(settings.muted)
        };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean)); }
        catch (_) { /* Pengaturan tetap aktif untuk sesi halaman ini. */ }
        return clean;
    }

    function playEffect(which = readSettings().effect, force = false) {
        const settings = readSettings();
        if ((!force && settings.muted) || settings.volume <= 0) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            audioContext ||= new AudioContextClass();
            if (audioContext.state === 'suspended') audioContext.resume();
            const ctx = audioContext, now = ctx.currentTime;
            const master = Math.min(.16, settings.volume / 100 * .16);
            const notes = [
                [[760, 0, .055, 'sine', 1]],
                [[620, 0, .07, 'sine', .7], [880, .055, .07, 'sine', .7]],
                [[520, 0, .075, 'triangle', 1]],
                [[880, 0, .16, 'sine', .55], [1320, .012, .12, 'sine', .35]],
                [[430, 0, .075, 'triangle', .8], [680, .035, .075, 'sine', .5]],
                [[523, 0, .065, 'sine', .5], [659, .055, .065, 'sine', .5], [784, .11, .085, 'sine', .55]]
            ][Math.max(1, Math.min(6, Number(which) || 1)) - 1];
            notes.forEach(([frequency, delay, duration, type, level]) => {
                const osc = ctx.createOscillator(), gain = ctx.createGain(), start = now + delay;
                osc.type = type;
                osc.frequency.setValueAtTime(frequency, start);
                gain.gain.setValueAtTime(.0001, start);
                gain.gain.linearRampToValueAtTime(master * level, start + Math.min(.012, duration / 3));
                gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(start); osc.stop(start + duration + .01);
            });
        } catch (_) { /* Audio tidak tersedia pada perangkat ini. */ }
    }

    function parentMusicHost() {
        try {
            let scope = window.parent;
            for (let depth = 0; depth < 8 && scope !== window; depth++) {
                if (scope.AbsensiUIAudio?.ownsPersistentPlayer?.()) return scope.AbsensiUIAudio;
                if (scope.parent === scope) break;
                scope = scope.parent;
            }
        } catch (_) { /* Hanya bingkai pada situs yang sama yang boleh mengontrol musik. */ }
        return null;
    }

    function applicationDestination(value) {
        try {
            const url = new URL(value, location.href);
            const folder = new URL('.', location.href).pathname;
            const allowed = ['', 'index.php', 'data_siswa.php', 'absen.php', 'ujian.php'];
            return url.origin === location.origin && allowed.some(page => url.pathname === folder + page) ? url : null;
        } catch (_) { return null; }
    }

    function prepareApplicationFrame() {
        if (applicationFrame) return applicationFrame;
        applicationFrame = document.createElement('iframe');
        applicationFrame.id = 'absensiMusicApplicationFrame';
        applicationFrame.name = 'absensi_music_application_content';
        applicationFrame.title = 'Halaman aplikasi absensi';
        applicationFrame.hidden = true;
        applicationFrame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:var(--p-bg,#102538);z-index:2147483000';
        applicationFrame.addEventListener('load', () => {
            try {
                const destination = applicationDestination(applicationFrame.contentWindow.location.href);
                if (destination) applicationUrl = destination.href;
                const title = applicationFrame.contentDocument.title;
                if (title) document.title = title;
            } catch (_) {}
        });
        document.body.appendChild(applicationFrame);
        return applicationFrame;
    }

    function showApplicationFrame() {
        prepareApplicationFrame().hidden = false;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function navigateApplication(value) {
        const host = parentMusicHost();
        if (host) { host.navigateApplication(value); return; }
        const destination = applicationDestination(value);
        if (IS_PLAYER_PAGE && destination && typeof window.showMusicApplication === 'function') {
            window.showMusicApplication(destination.href);
        } else if (musicFrame && destination) {
            applicationUrl = destination.href;
            prepareApplicationFrame().src = applicationUrl;
            showApplicationFrame();
        } else window.location.assign(value);
    }

    function reloadApplication() {
        if (musicFrame) navigateApplication(applicationUrl);
        else window.location.reload();
    }

    function showEmbeddedMusicPlayer() {
        if (!musicFrame) {
            musicOverlay = document.createElement('div');
            musicOverlay.id = 'absensiMusicOverlay';
            musicOverlay.setAttribute('role', 'dialog');
            musicOverlay.setAttribute('aria-modal', 'true');
            musicOverlay.setAttribute('aria-label', 'Pemutar musik');
            musicOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:#0b1220';
            musicFrame = document.createElement('iframe');
            musicFrame.id = 'absensiMusicFrame';
            musicFrame.title = 'Pemutar musik';
            musicFrame.allow = 'autoplay';
            musicFrame.style.cssText = 'width:100%;height:100%;border:0;display:block';
            const url = new URL('music_player.php', APP_ROOT);
            url.searchParams.set('theme', document.documentElement.dataset.theme || 'malam');
            url.searchParams.set('embedded', '1');
            musicFrame.src = url.href;
            musicOverlay.appendChild(musicFrame);
            document.body.appendChild(musicOverlay);
        }
        if (!scrollStyles) scrollStyles = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        musicOverlay.style.visibility = 'visible';
        musicOverlay.style.pointerEvents = 'auto';
        musicOverlay.setAttribute('aria-hidden', 'false');
        musicOverlay.inert = false;
        musicFrame.tabIndex = 0;
        const launcher = document.getElementById('absensiMusicLauncher');
        if (launcher) launcher.style.visibility = 'hidden';
    }

    function hideMusicPlayer() {
        const host = parentMusicHost();
        if (host) { host.hideMusicPlayer(); return; }
        if (IS_PLAYER_PAGE) { window.minimizeMusicView?.(); return; }
        if (!musicOverlay) return;
        // Bingkai dipertahankan: menyembunyikan panel tidak menghentikan elemen audio.
        musicOverlay.style.visibility = 'hidden';
        musicOverlay.style.pointerEvents = 'none';
        musicOverlay.setAttribute('aria-hidden', 'true');
        musicOverlay.inert = true;
        musicFrame.tabIndex = -1;
        if (!applicationFrame || applicationFrame.hidden) {
            document.documentElement.style.overflow = scrollStyles?.html || '';
            document.body.style.overflow = scrollStyles?.body || '';
        }
        scrollStyles = null;
        const launcher = document.getElementById('absensiMusicLauncher');
        if (launcher) { launcher.style.visibility = 'visible'; launcher.focus({ preventScroll: true }); }
    }

    function setTheme(theme) {
        if (!['malam', 'putih', 'samudra', 'senja'].includes(theme)) return;
        const host = parentMusicHost();
        if (host) { host.setTheme(theme); return; }
        if (IS_PLAYER_PAGE) document.documentElement.dataset.theme = theme;
        try { if (musicFrame?.contentDocument) musicFrame.contentDocument.documentElement.dataset.theme = theme; } catch (_) {}
        channel?.postMessage({ type: 'theme-changed', theme });
    }

    function openMusicPlayer() {
        const host = parentMusicHost();
        if (host) { host.openMusicPlayer(); return; }
        if (IS_PLAYER_PAGE) { window.restoreMusicView?.(); return; }
        // Android menggunakan panel dalam halaman agar WebView tidak menutup pemutar.
        if (/\/app\//.test(location.pathname) || window.AbsensiDesktop || musicFrame || window.Android || window.AndroidInterface || window.ReactNativeWebView || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
            showEmbeddedMusicPlayer();
            return;
        }
        let existing = 0;
        try { existing = Number(localStorage.getItem(PLAYER_KEY) || 0); } catch (_) {}
        if (existing && Date.now() - existing < 2500 && channel) {
            channel.postMessage({ type: 'focus-player' });
            return;
        }
        const theme = document.documentElement.dataset.theme || 'malam';
        const features = 'popup=yes,width=380,height=680,resizable=yes,scrollbars=yes';
        const playerUrl = `${new URL('music_player.php',APP_ROOT).href}?theme=${encodeURIComponent(theme)}&return_url=${encodeURIComponent(applicationUrl)}`;
        const player = window.open('', PLAYER_NAME, features);
        if (player) {
            try {
                if (/music_player\.php$/i.test(player.location.pathname)) player.restoreMusicView?.();
                else player.location.replace(playerUrl);
                player.focus();
            } catch (_) { player.location.href = playerUrl; }
        } else showEmbeddedMusicPlayer();
    }

    function installFloatingButton() {
        if (IS_PLAYER_PAGE || document.getElementById('absensiMusicLauncher')) return;
        if (!document.getElementById('absensiAudioPrintStyle')) {
            const style = document.createElement('style');
            style.id = 'absensiAudioPrintStyle';
            style.textContent = '#absensiMusicApplicationFrame[hidden]{display:none!important}@media print { #absensiMusicLauncher,#absensiMusicOverlay,#absensiMusicApplicationFrame { display:none !important; } }';
            document.head.appendChild(style);
        }
        const button = document.createElement('button');
        button.type = 'button'; button.id = 'absensiMusicLauncher'; button.setAttribute('aria-label', 'Buka pemutar musik');
        button.title = 'Buka musik — pemutar tetap berjalan saat pindah halaman';
        button.textContent = '♫';
        button.style.cssText = 'position:fixed;right:16px;bottom:18px;z-index:2147483002;width:52px;height:52px;border:0;border-radius:50%;background:#2563eb;color:#fff;font:700 25px Arial,sans-serif;box-shadow:0 5px 18px #0006;cursor:pointer;touch-action:manipulation';
        button.addEventListener('click', openMusicPlayer);
        document.body.appendChild(button);
    }

    // Halaman kerja berpindah di bingkai lain; pemutar yang sudah hidup tetap berada di halaman induk.
    document.addEventListener('click', event => {
        if (!musicFrame || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.getAttribute('href').startsWith('#')) return;
        const destination = applicationDestination(link.href);
        if (!destination) return;
        event.preventDefault();
        navigateApplication(destination.href);
    });
    document.addEventListener('submit', event => {
        if (!musicFrame || event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
        const form = event.target;
        if ((form.target && form.target !== '_self') || !applicationDestination(form.action || location.href)) return;
        form.target = prepareApplicationFrame().name;
        queueMicrotask(() => { if (!event.defaultPrevented) showApplicationFrame(); });
    });

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('[data-no-click-sound],#absensiMusicLauncher')) return;
        if (!target.closest('button,a,select,input[type="button"],input[type="submit"],input[type="checkbox"],input[type="radio"],[role="button"]')) return;
        playEffect();
    }, true);

    try { channel = new BroadcastChannel('absensi_music_player_channel_v1'); } catch (_) { channel = null; }
    if (IS_PLAYER_PAGE) {
        try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {}
        const heartbeat = setInterval(() => { try { localStorage.setItem(PLAYER_KEY, String(Date.now())); } catch (_) {} }, 1200);
        window.addEventListener('pagehide', () => {
            clearInterval(heartbeat);
            try { localStorage.removeItem(PLAYER_KEY); } catch (_) {}
        }, { once: true });
        channel?.addEventListener('message', event => {
            if (event.data?.type === 'focus-player') {
                const host = parentMusicHost();
                if (host) host.openMusicPlayer();
                else window.restoreMusicView?.();
                window.focus(); document.body.classList.add('player-ping'); setTimeout(() => document.body.classList.remove('player-ping'), 280);
            }
            if (event.data?.type === 'theme-changed' && ['malam','putih','samudra','senja'].includes(event.data.theme)) {
                document.documentElement.setAttribute('data-theme', event.data.theme);
            }
        });
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installFloatingButton, { once: true });
    } else installFloatingButton();

    window.AbsensiUIAudio = {
        readSettings,
        saveSettings: writeSettings,
        preview: (which) => playEffect(which, true),
        notify: () => playEffect(readSettings().effect),
        setTheme,
        openMusicPlayer,
        hideMusicPlayer,
        navigateApplication,
        reloadApplication,
        ownsPersistentPlayer: () => IS_PLAYER_PAGE || Boolean(musicFrame)
    };
})();

} catch(error) {console.error("Teacher module assets/app-audio.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/meeting-picker.js */
try {
/* Compact numbered meeting navigation shared by lecturer and student views. */
(()=>{'use strict';window.PresenMeetings={mount(host,{count=16,selected=1,label='Pilih pertemuan',state=()=>'',onSelect=()=>{},render}){const previous=Number(host.dataset.selectedMeeting);let current=previous||Number(selected)||1;count=Math.max(1,Math.min(32,Math.max(count,current)));host.replaceChildren();const nav=document.createElement('div');nav.className='meeting-picker';nav.setAttribute('role','tablist');nav.setAttribute('aria-label',label);const panel=document.createElement('div');panel.className='meeting-detail';panel.setAttribute('role','tabpanel');const buttons=[];function choose(slot,focus=false,user=false){current=slot;host.dataset.selectedMeeting=String(slot);for(const button of buttons){const active=Number(button.dataset.meetingSlot)===slot;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}panel.replaceChildren();render(panel,slot);if(user)onSelect(slot);if(focus)buttons[slot-1]?.focus();}for(let n=1;n<=count;n++){const button=document.createElement('button');button.type='button';button.dataset.meetingSlot=String(n);button.setAttribute('role','tab');button.setAttribute('aria-label','Pertemuan '+n+(state(n)?' · '+state(n):''));button.textContent=String(n);button.dataset.meetingState=state(n);button.onclick=()=>choose(n,false,true);button.onkeydown=e=>{const next=e.key==='ArrowRight'?Math.min(count,n+1):e.key==='ArrowLeft'?Math.max(1,n-1):e.key==='Home'?1:e.key==='End'?count:0;if(next){e.preventDefault();choose(next,true,true);}};buttons.push(button);nav.append(button);}host.append(nav,panel);choose(current);return{select:choose};}};})();

} catch(error) {console.error("Teacher module app/meeting-picker.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/offline-bridge.js */
try {
/* Connect the existing sheets to the persistent device records. */
(async()=>{
'use strict';window.WASheetReady=false;window.WATeacherBridgeReady='loading';if(!window.WA)return;const page=(location.pathname.split('/').pop()||'index.php').replace('.php',''),params=new URLSearchParams(location.search);let state=await WA.get();
if(!state.profile&&navigator.onLine&&page!=='music_player'){try{await WA.bootstrap();state=await WA.get();void WA.prepareOffline();}catch(_){await window.PresenTeacherPreferences.guest();window.WATeacherBridgeReady=page==='index'&&window.SERVER_CONFIG?.isLoggedIn===false?'anonymous':'error';if(window.WATeacherBridgeReady==='error')window.PresenTeacherStartup?.fail();return;}}
if(!state.profile){await window.PresenTeacherPreferences.guest();window.WATeacherBridgeReady=page==='index'?'anonymous':'error';if(window.WATeacherBridgeReady==='error')window.PresenTeacherStartup?.fail();return;}if(state.profile.role!=='teacher'&&page!=='music_player'){location.replace(new URL('app/?role=student',WA.ROOT));return;}
// Cached teacher data is immediately usable; server refresh must not block navigation.
if(navigator.onLine&&page!=='music_player'){await Promise.race([WA.sync(),new Promise(resolve=>setTimeout(resolve,350))]);state=await WA.get();}
await window.PresenTeacherPreferences.prepare(state);
const c=WA.ctx({...state.selection,...Object.fromEntries(params),prodi:params.get('prodi')||state.selection?.prodi||'Pendidikan Teknologi Informasi',semester:params.get('semester')||state.selection?.semester||'1',kelas:params.get('kelas')||state.selection?.kelas||'A',owner:state.profile.account.id});let course=window.PresenCourses.resolve(state,c,params.get('matkul'),WA.sameCtx(c,state.selection||c)?state.selection?.matkul||'':'');const activeURL=new URL(location.href);activeURL.searchParams.set('matkul',course);history.replaceState(null,'',activeURL);let editRevision=0,loading=false,redirecting=false,timer,gradeTimer,loadedKey='',loadedRoster='',loadedDocument='',loadedScope='',flushing=false,flushPromise=Promise.resolve(),deletePromise=Promise.resolve();const draftPrefix='wa-sheet-draft-'+state.profile.device+'-',deletePrefix='wa-delete-draft-'+state.profile.device+'-',pendingMarks={};
let resetting=false,surfaceReady=false;let observedResetEpoch=Number(state.snapshot.resetEpoch)||0;
const nativeFetch=window.fetch.bind(window),kind=page==='absen'?'attendance-sheet':'exam-sheet';
function input(value,cls=''){const el=document.createElement('input');el.type='text';el.value=value;el.className=cls;if(cls==='attendance-cell'){el.maxLength=1;el.setAttribute('autocomplete','off');}return el;}
function text(value){const el=document.createElement('td');el.textContent=value;return el;}
function notify(message){window.showToast?.(message);if(!window.showToast){const b=document.getElementById('waStatus');if(b)b.textContent=message;}}
function contextURL(url){const u=new URL(url,location.href);if(u.origin===location.origin&&/\/(absen|ujian|data_siswa)\.php$/.test(u.pathname)){for(const[k,v]of Object.entries({...c,matkul:course}))u.searchParams.set(k,v);}return u;}
const bar=document.createElement('div');bar.id='waStatus';bar.textContent=navigator.onLine?'Data perangkat siap · online':'Data perangkat siap · offline';bar.style.cssText='position:fixed;bottom:4px;left:50%;transform:translateX(-50%);background:#12354e;color:white;font:11px system-ui;padding:4px 10px;border-radius:8px;z-index:9990;pointer-events:none';document.body.append(bar);const style=document.createElement('style');style.textContent='[data-wa-hydrating] #paperSheet,[data-wa-hydrating] #paper{pointer-events:none;opacity:.7}@media print{#waStatus{display:none!important}}';document.head.append(style);
function roster(s){return s.snapshot.roster.filter(r=>WA.sameCtx(r,c)).sort((a,b)=>Number(a.id)-Number(b.id)).filter((row,i,rows)=>rows.findIndex(other=>other.nim.trim().toUpperCase()===row.nim.trim().toUpperCase())===i);}
function layoutStorageKeys(){return new Set([typeof absenLayoutSettingsKey==='string'?absenLayoutSettingsKey:'',typeof absenPositionStorageKey==='string'?absenPositionStorageKey:'',typeof storageKey==='string'?storageKey:''].filter(Boolean));}
function captureAttendance(){const table=document.getElementById('tabelAbsen');if(!table)return null;return {head:Array.from(table.tHead.rows).map(row=>Array.from(row.cells).map(cell=>({text:cell.textContent,colspan:cell.colSpan,rowspan:cell.rowSpan,id:cell.id,cls:cell.className,dateDefaultSize:cell.dataset.dateDefaultSize||'',dateDefaultMode:cell.dataset.dateDefaultMode||'',dateDefaultFormat:cell.dataset.dateDefaultFormat||'',date:cell.dataset.attendanceDate||'',dateSize:cell.dataset.dateSize||'',dateManual:cell.dataset.dateManual==='1',dateSizeMode:cell.dataset.dateSizeMode||'sync',format:cell.matches('.date-entry')?{color:cell.style.color,fontWeight:cell.style.fontWeight,fontStyle:cell.style.fontStyle,textDecoration:cell.style.textDecoration}:null}))),rows:Array.from(table.tBodies[0].rows).filter(row=>!row.classList.contains('page-preview-only')).map(row=>Array.from(row.cells).map(cell=>cell.querySelector('input')?.value??cell.textContent))};}
function repairAttendanceRows(students){
 const body=document.getElementById('tbodySiswa');if(!body)return;
 const rows=[...body.querySelectorAll('tr:not(.page-preview-only)')];
 // Old Undo snapshots retained data-nim but omitted the inputs' live values.
 for(const row of rows){const nim=row.cells[1]?.querySelector('input'),name=row.cells[2]?.querySelector('input');if(nim&&!nim.value.trim()&&row.dataset.nim){const student=students.find(s=>s.nim===row.dataset.nim);if(student){nim.value=student.nim;if(name)name.value=student.nama;const sex=row.cells[3]?.querySelector('input');if(sex)sex.value=student.jk;}}}
 const seen=new Map();for(const row of rows){const nim=row.cells[1]?.querySelector('input')?.value.trim().toUpperCase();if(!nim)continue;const kept=seen.get(nim);if(!kept){seen.set(nim,row);continue;}for(let i=1;i<row.cells.length;i++){const source=row.cells[i]?.querySelector('input'),target=kept.cells[i]?.querySelector('input');if(source&&target&&!target.value.trim())target.value=source.value;}row.remove();}
 const blank=row=>![1,2].some(i=>row.cells[i]?.querySelector('input')?.value.trim());
 // Real students keep their order; reserve rows belong after the roster.
 const connected=rows.filter(row=>row.isConnected);const ordered=[...connected.filter(row=>!blank(row)),...connected.filter(blank)];
 if(ordered.some((row,i)=>row!==rows[i]))for(const row of ordered)body.append(row);
 ordered.forEach((row,i)=>{if(row.cells[0])row.cells[0].textContent=String(i+1);});
}
function restoreAttendance(data,students){if(!Array.isArray(data?.head)||!Array.isArray(data.rows)||data.rows.length>5000)return;const table=document.getElementById('tabelAbsen');table.tHead.textContent='';for(const cells of data.head.slice(0,3)){const row=document.createElement('tr');for(const value of cells.slice(0,30)){const cell=document.createElement('th');cell.textContent=String(value.text??'');cell.colSpan=Math.max(1,Math.min(24,Number(value.colspan)||1));cell.rowSpan=Math.max(1,Math.min(3,Number(value.rowspan)||1));if(['headerPertemuan','thLabelId'].includes(value.id))cell.id=value.id;if(value.id==='headerPertemuan'&&Number(value.dateDefaultSize)>=2&&Number(value.dateDefaultSize)<=72){cell.dataset.dateDefaultSize=String(value.dateDefaultSize);cell.dataset.dateDefaultMode=value.dateDefaultMode==='sync'?'sync':'manual';}if(value.id==='headerPertemuan'&&typeof value.dateDefaultFormat==='string'){try{const format=JSON.parse(value.dateDefaultFormat),clean={};for(const key of ['color','fontWeight','fontStyle','textDecoration'])if(typeof format?.[key]==='string')clean[key]=format[key];if(Object.keys(clean).length)cell.dataset.dateDefaultFormat=JSON.stringify(clean);}catch(_){}}cell.contentEditable='true';if(['date-entry','meeting-number'].includes(value.cls))cell.className=value.cls;if(value.cls==='date-entry'){cell.dataset.dateSizeMode=value.dateSizeMode==='manual'?'manual':'sync';if(value.dateManual===true)cell.dataset.dateManual='1';if(/^\d{4}-\d{2}-\d{2}$/.test(value.date||''))cell.dataset.attendanceDate=value.date;cell.dataset.dateSize=String(Math.max(2,Math.min(72,Number(value.dateSize)||6)));for(const key of ['color','fontWeight','fontStyle','textDecoration'])if(typeof value.format?.[key]==='string')cell.style[key]=value.format[key];}row.append(cell);}table.tHead.append(row);}if(table.tHead.rows[1])table.tHead.rows[1].id='subHeaderPertemuan';if(table.tHead.rows[2])table.tHead.rows[2].id='numberHeaderPertemuan';const body=table.tBodies[0],seenNims=new Set();body.textContent='';for(const saved of data.rows){if(!Array.isArray(saved)||saved.length<6)continue;const values=saved.slice(),nim=String(values[1]||'').trim().toUpperCase(),student=students.find(s=>s.nim.toUpperCase()===nim);if(nim&&(!student||seenNims.has(nim)))continue;if(nim)seenNims.add(nim);if(student){values[1]=student.nim;values[2]=student.nama;values[3]=student.jk;}const row=document.createElement('tr');row.dataset.nim=String(values[1]||'');values.slice(0,30).forEach((value,i)=>{const cell=text('');if(i===0){cell.className='row-no';cell.textContent=body.rows.length+1;}else{cell.append(input(String(value??''),i>=4&&i<values.length-1?'attendance-cell':i===1?'nim-input':i===2?'name-input':''));}row.append(cell);});body.append(row);}}
async function hydrate(initial=false){const revision=editRevision;if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));await window.SheetSignatures?.ready;if(loading||flushing||localStorage.getItem(draftPrefix+encodeURIComponent(JSON.stringify([c,course,kind]))))return;state=await WA.get();if(!state.profile){if(page!=='index'&&!redirecting){redirecting=true;location.replace(new URL('index.php',WA.ROOT));}return;}const hydrationEpoch=Number(state.snapshot.resetEpoch)||0;if(hydrationEpoch>observedResetEpoch){observedResetEpoch=hydrationEpoch;resetSheetSurface();initial=true;}const sc=await WA.scope(c,course),students=roster(state),marks=state.snapshot.marks.filter(m=>m.scope===sc),doc=state.snapshot.documents.find(d=>d.scope===sc&&d.kind===kind);if(loading||flushing||(!initial&&revision!==editRevision)||localStorage.getItem(draftPrefix+encodeURIComponent(JSON.stringify([c,course,kind]))))return;const documentKey=JSON.stringify(doc?.content||null);if(!initial&&editRevision===0&&doc?.content&&documentKey!==loadedDocument&&!state.outbox.some(o=>o.type==='document'&&o.scope===sc&&o.kind===kind))initial=true;loadedDocument=documentKey;loadedScope=sc;const gradesDoc=state.snapshot.documents.find(d=>d.scope===sc&&d.kind==='grade'),rosterKey=JSON.stringify(students),rosterChanged=rosterKey!==loadedRoster;const newKey=JSON.stringify([sc,students,marks,doc,gradesDoc]);bar.textContent=(navigator.onLine?'Online':'Offline')+` · ${state.outbox.length} perubahan belum tersinkron`;if(!initial&&newKey===loadedKey)return;loadedKey=newKey;loadedRoster=rosterKey;loading=true;try{
if(page==='absen'){
const tbody=document.getElementById('tbodySiswa');if(initial&&tbody){tbody.querySelectorAll('tr:not(.page-preview-only)').forEach(r=>r.remove());for(const [i,s]of students.entries()){const row=document.createElement('tr');row.className='student-row';row.dataset.nim=s.nim;const no=text(i+1);no.className='row-no';row.append(no);for(const [val,cls]of [[s.nim,'nim-input'],[s.nama,'name-input'],[s.jk,'']]){const cell=text('');cell.append(input(val,cls));row.append(cell);}const count=Number(document.getElementById('headerPertemuan')?.colSpan||16);for(let slot=1;slot<=count;slot++){const cell=text('');const el=input(marks.find(m=>m.nim===s.nim&&m.slot===slot)?.mark||'','attendance-cell');el.setAttribute('aria-label',`${s.nama} pertemuan ${slot}`);cell.append(el);row.append(cell);}const ket=text('');ket.append(input(doc?.content?.ket?.[s.nim]||''));row.append(ket);tbody.append(row);}}
if(initial&&doc?.content?.table)restoreAttendance(doc.content.table,students);
if(tbody&&rosterChanged){for(const row of tbody.querySelectorAll('tr:not(.page-preview-only)')){const nim=(row.dataset.nim||row.cells[1]?.querySelector('input')?.value||'').trim().toUpperCase();if(!nim)continue;const student=students.find(s=>s.nim.toUpperCase()===nim);if(!student){row.remove();continue;}[student.nim,student.nama,student.jk].forEach((value,i)=>{const el=row.cells[i+1]?.querySelector('input');if(el&&document.activeElement!==el)el.value=value;});}}
if(tbody){for(const student of students){if(Array.from(tbody.rows).some(r=>r.cells[1]?.querySelector('input')?.value===student.nim))continue;const row=Array.from(tbody.rows).find(r=>!r.classList.contains('page-preview-only')&&![1,2].some(i=>r.cells[i]?.querySelector('input')?.value.trim()))||document.createElement('tr');const existing=row.parentElement===tbody;row.replaceChildren();row.className='student-row';row.dataset.nim=student.nim;row.append(text(tbody.rows.length+1));for(const[v,cls]of [[student.nim,'nim-input'],[student.nama,'name-input'],[student.jk,'']]){const cell=text('');cell.append(input(v,cls));row.append(cell);}for(let slot=1;slot<=Number(document.getElementById('headerPertemuan')?.colSpan||16);slot++){const cell=text('');cell.append(input('','attendance-cell'));row.append(cell);}const ket=text('');ket.append(input(''));row.append(ket);if(!existing)tbody.append(row);}}
repairAttendanceRows(students);
if(tbody){for(const r of tbody.querySelectorAll('tr:not(.page-preview-only)')){const nim=r.cells[1]?.querySelector('input')?.value;Array.from(r.querySelectorAll('.attendance-cell')).forEach((el,i)=>{if(document.activeElement!==el)el.value=marks.find(m=>m.nim===nim&&m.slot===i+1)?.mark||'';});}}
if(tbody)Array.from(tbody.querySelectorAll('tr:not(.page-preview-only)')).forEach((row,i)=>{const no=row.querySelector('.row-no')||row.cells[0];if(no)no.textContent=i+1;});
if(rosterChanged){const recap=document.getElementById('tbodyRekapNilai');if(recap){for(const row of Array.from(recap.rows)){const nim=row.querySelector('.nim-value')?.textContent,student=students.find(s=>s.nim===nim);if(!student)row.remove();else if(row.cells[1])row.cells[1].textContent=student.nama;}Array.from(recap.rows).forEach((r,i)=>r.cells[0].textContent=i+1);}}
const left=document.querySelectorAll('#metaLeftBox .meta-val');if(left[0])left[0].textContent=`Semester ${c.semester} (${WA.academicPeriod(c)})`;if(left[1]&&initial)left[1].textContent=WA.academicYear(c);if(left[2])left[2].textContent=c.prodi;const right=document.querySelectorAll('#metaRightBox .meta-val');if(right[2])right[2].textContent='Kelas '+c.kelas;
}
if(page==='ujian'&&(initial||rosterChanged)){const body=document.querySelector('#examTableBlock tbody'),grades=state.snapshot.documents.find(d=>d.scope===sc&&d.kind==='grade')?.content?.data_nilai||[];if(body){body.textContent='';for(const[i,s]of students.entries()){const g=grades.find(g=>g.nim===s.nim)||{},row=document.createElement('tr');for(const value of[i+1,s.nim,s.nama,g.skor_akhir??'',g.nilai_huruf??'',g.angka_mutu??'',''])row.append(text(value));row.cells[2].className='name';row.cells[6].contentEditable='true';row.cells[6].dataset.editKey='ket-'+encodeURIComponent(s.nim);body.append(row);}}const semester=document.querySelector('[data-edit-key="semester-label"]');if(semester)semester.textContent=`${c.semester} ${c.kelas} (${WA.academicPeriod(c)})`;const prodi=document.querySelector('[data-edit-key="prodi-label"]');if(prodi)prodi.textContent=c.prodi;const year=document.querySelector('[data-edit-key=year-label]');if(year)year.textContent=WA.academicYear(c);const count=document.querySelector('#examMetaRight .meta-row:nth-child(3) .meta-value');if(count)count.textContent=students.length;}
if(page==='data_siswa'&&(initial||rosterChanged)){const tbody=document.querySelector('#tabelSiswa tbody');if(tbody){tbody.textContent='';for(const[i,s]of students.entries()){const row=document.createElement('tr');row.className='student-row';row.dataset.nim=s.nim;for(const val of[i+1,s.nim,s.nama,s.jk])row.append(text(val));const cell=text(''),edit=document.createElement('button'),remove=document.createElement('button');edit.textContent='Edit';remove.textContent='Hapus';edit.type=remove.type='button';edit.className='btn-custom btn-primary';remove.className='btn-custom btn-danger';edit.onclick=()=>window.bukaModalEdit?.(s.id,s.nim,s.nama,s.jk);remove.onclick=async()=>{if(confirm('Hapus mahasiswa '+s.nama+'?')){await deleteStudents([s]);}};cell.append(edit,remove);row.append(cell);tbody.append(row);}if(!students.length){const row=document.createElement('tr'),cell=text('Belum ada data mahasiswa untuk prodi, semester, dan kelas ini.');cell.colSpan=5;cell.style.cssText='text-align:center;color:var(--text-muted);padding:30px';row.append(cell);tbody.append(row);}}}
if(initial&&doc?.content){const content=doc.content;for(const [id,src]of Object.entries(content.logos||{})){const target=document.getElementById(id),img=target?.matches('.logo-slot')?target.querySelector('img'):target;if(!img||!img.matches('#logoKiriPreview,#logoKananPreview,.logo-slot img'))continue;if(src!==null&&!/^data:image\/(png|jpeg|webp);base64,/.test(src))continue;img.hidden=!src;img.style.display=src?'block':'none';if(src)img.src=src;else img.removeAttribute('src');const box=img.closest('.logo-box,.logo-slot');box?.classList.toggle(box.matches('.logo-box')?'has-image':'has-logo',!!src);const icon=box?.querySelector('i');if(icon){icon.hidden=!!src;icon.style.display=src?'none':'block';}const button=box?.parentElement.querySelector('.btn-hapus-logo')||box?.querySelector('.logo-remove');if(button){button.hidden=!src;button.style.display=src?'inline-block':'none';}}document.querySelectorAll('#tbodySiswa tr:not(.page-preview-only)').forEach(row=>{const nim=row.cells[1]?.querySelector('input')?.value,formats=content.inputFormats?.[nim];if(!Array.isArray(formats))return;row.querySelectorAll('td input').forEach((input,i)=>{for(const key of ['color','fontWeight','fontStyle','textDecoration'])if(typeof formats[i]?.[key]==='string')input.style[key]=formats[i][key];});});for(const[slot,value]of Object.entries(content.signatures||{})){const el=document.querySelector(`[data-signature-slot="${CSS.escape(slot)}"]`);if(el)window.SheetSignatures?.restore(el,value);}for(const [selector,value]of Object.entries(content.text||{})){try{const el=document.querySelector(selector);if(el)el.textContent=value;}catch(_){}}for(const [key,value]of Object.entries(content.storage||{})){if(!layoutStorageKeys().has(key))continue;try{localStorage.setItem(key,value);}catch(_){}}}
if(page==='absen')for(const session of state.snapshot.sessions.filter(x=>x.scope===sc)){const cell=document.querySelectorAll('#subHeaderPertemuan .date-entry')[Number(session.slot)-1];if(cell&&!cell.textContent.trim()&&!cell.dataset.dateManual)window.WASetMeetingDate?.(session,false);}
const removeSelect=document.querySelector('[name=hapus_permanen_id]');if(removeSelect&&(initial||rosterChanged)){const selected=removeSelect.value;removeSelect.replaceChildren(new Option('-- Pilih Mahasiswa Satuan --',''));for(const student of students)removeSelect.add(new Option(student.nim+' - '+student.nama,student.nim));removeSelect.value=students.some(s=>s.nim===selected)?selected:'';}
const field=document.querySelector('[data-app-course]');if(initial&&field){field.textContent=course;field.contentEditable='false';field.oninput=null;}fitNIM();
if(initial){document.querySelectorAll('a[href]').forEach(a=>{const u=contextURL(a.href);if(u.origin===location.origin)a.href=u.href;});if(page==='ujian')window.readSavedEdits?.();if(page==='absen')window.muatPosisiAbsen?.();}
window.pastikanJarakTandaTangan?.();if(page==='absen')window.perbaruiPenandaHalaman?.();if(page==='ujian')window.perbaruiPenandaHalamanUjian?.();
if(page==='index'&&state.profile?.role==='teacher'){for(const id of ['currentUserNameText','widgetAdminName']){const node=document.getElementById(id);if(node)node.textContent=state.profile.account.nama;}const name=document.getElementById('editAdminName'),title=document.getElementById('editProfessionalTitle');if(name&&document.activeElement!==name)name.value=state.profile.account.display_name||state.profile.account.nama;if(title&&document.activeElement!==title)title.value=state.profile.account.professional_title||'';}
bar.textContent=(navigator.onLine?'Online':'Offline')+` · ${state.outbox.length} perubahan belum tersinkron`;
}finally{loading=false;const latest=await WA.get();if(latest.profile&&Number(latest.snapshot.resetEpoch)>hydrationEpoch)void hydrate(true);}}
function fitNIM(){if(window.WAFitSheetText){window.WAFitSheetText();return;}const head=document.getElementById('thLabelId');if(!head)return;const probe=document.createElement('canvas').getContext('2d');let width=82;document.querySelectorAll('#tbodySiswa tr:not(.page-preview-only) td:nth-child(2) input').forEach(el=>{probe.font=getComputedStyle(el).font;width=Math.max(width,Math.ceil(probe.measureText(el.value).width)+14);el.title=el.value;});width=Math.min(116,width);head.style.width=head.style.minWidth=width+'px';}
function captureContent(){const values={},storage={},ket={},signatures={},inputFormats={},logos={};document.querySelectorAll('#logoKiriPreview,#logoKananPreview,.logo-slot img').forEach(img=>{const id=img.id||img.closest('.logo-slot')?.id;if(id)logos[id]=!img.hidden&&img.style.display!=='none'&&/^data:image\/(png|jpeg|webp);base64,/.test(img.getAttribute('src')||'')?img.src:null;});document.querySelectorAll('[data-signature-slot]').forEach(slot=>{const img=slot.querySelector('.sheet-signature-image');if(img&&!img.hidden&&/^data:image\/(png|jpeg|webp);base64,/.test(img.src))signatures[slot.dataset.signatureSlot]=window.SheetSignatures?.read(slot)||img.src;});document.querySelectorAll('[data-edit-key],.meta-val,[contenteditable="true"][id]').forEach(el=>{let selector=el.dataset.editKey?`[data-edit-key="${CSS.escape(el.dataset.editKey)}"]`:el.id?'#'+CSS.escape(el.id):null;if(!selector){const parent=el.parentElement?.parentElement;if(parent?.id)selector='#'+parent.id+' .meta-row:nth-child('+(Array.from(parent.children).indexOf(el.parentElement)+1)+') .meta-val';}if(selector)values[selector]=el.textContent;});for(const key of layoutStorageKeys())if(localStorage.getItem(key)!==null)storage[key]=localStorage.getItem(key);document.querySelectorAll('#tbodySiswa tr:not(.page-preview-only)').forEach(r=>{const nim=r.cells[1]?.querySelector('input')?.value;if(nim)ket[nim]=r.cells[r.cells.length-1]?.querySelector('input')?.value||'';});document.querySelectorAll('#tbodySiswa tr:not(.page-preview-only)').forEach(row=>{const nim=row.cells[1]?.querySelector('input')?.value;if(!nim)return;const styles=[...row.querySelectorAll('td input')].map(input=>Object.fromEntries(['color','fontWeight','fontStyle','textDecoration'].filter(k=>input.style[k]).map(k=>[k,input.style[k]])));if(styles.some(style=>Object.keys(style).length))inputFormats[nim]=styles;});return {text:values,storage,ket,signatures,inputFormats,logos,...(page==='absen'?{table:captureAttendance()}:{})};}
function stash(){if(!surfaceReady||resetting||loading||!['absen','ujian'].includes(page))return;const key=draftPrefix+encodeURIComponent(JSON.stringify([c,course,kind]));const previous=JSON.parse(localStorage.getItem(key)||'null');const draft={ctx:c,course,kind,content:captureContent(),marks:{...(previous?.marks||{}),...pendingMarks},at:Date.now()};localStorage.setItem(key,JSON.stringify(draft));for(const key of Object.keys(pendingMarks))delete pendingMarks[key];bar.textContent='Perubahan tersimpan di perangkat · menyiapkan sinkronisasi';}
function flush(){if(resetting)return flushPromise.catch(()=>{});clearTimeout(timer);if(!Object.keys(localStorage).some(k=>k.startsWith(draftPrefix)||k.startsWith(deletePrefix)))return flushPromise.catch(()=>{});const task=flushPromise.catch(()=>{}).then(async()=>{flushing=true;try{for(const key of Object.keys(localStorage).filter(k=>k.startsWith(draftPrefix))){const raw=localStorage.getItem(key);if(!raw)continue;const draft=JSON.parse(raw);for(const mark of Object.values(draft.marks||{})){await WA.queue({type:'mark',ctx:draft.ctx,matkul:draft.course,...mark});}await WA.saveDocument(draft.ctx,draft.course,draft.kind,draft.content);if(localStorage.getItem(key)===raw)localStorage.removeItem(key);}for(const key of Object.keys(localStorage).filter(k=>k.startsWith(deletePrefix))){const raw=localStorage.getItem(key);if(!raw)continue;const intent=JSON.parse(raw);await WA.deleteStudents(intent.ctx,intent.students);if(localStorage.getItem(key)===raw)localStorage.removeItem(key);}}finally{flushing=false;}await hydrate();});flushPromise=task;return task;}
async function save(){try{stash();await flush();}catch(e){notify('Perubahan tetap disimpan di perangkat. '+e.message);}}
document.addEventListener('sheet-history-restored',()=>{repairAttendanceRows(roster(state));});
function resetSheetSurface(){
 window.batalkanImporDaftar?.();clearTimeout(timer);clearTimeout(gradeTimer);for(const key of Object.keys(pendingMarks))delete pendingMarks[key];
 for(const key of layoutStorageKeys())localStorage.removeItem(key);
 if(typeof historyStack!=='undefined')historyStack.length=0;if(typeof redoStack!=='undefined')redoStack.length=0;
 const dateHeader=document.getElementById('headerPertemuan');if(dateHeader){delete dateHeader.dataset.dateDefaultSize;delete dateHeader.dataset.dateDefaultMode;delete dateHeader.dataset.dateDefaultFormat;}document.querySelectorAll('#subHeaderPertemuan .date-entry').forEach(cell=>{cell.textContent='';for(const key of ['attendanceDate','dateSize','dateManual','dateSizeMode'])delete cell.dataset[key];cell.removeAttribute('style');});
 document.querySelectorAll('#tbodySiswa,#tbodyRekapNilai,#examTableBlock tbody').forEach(body=>body.replaceChildren());
 document.getElementById('modalHapusPermanen')?.classList.remove('show');loadedKey='';loadedRoster='';
 document.querySelectorAll('.sheet-date-dialog').forEach(dialog=>dialog.close());
}
window.addEventListener('wa-global-reset',()=>{resetSheetSurface();void hydrate(true);});
window.WAFlush=async()=>{await deletePromise;await flush();await window.PresenTeacherPreferences.saveLocal();};
// Persist the intent before the first await: a closed renderer must not cancel deletion.
function deleteStudents(select){const students=(typeof select==='function'?select(roster(state)):select).map(s=>({nim:s.nim,nama:s.nama,deleteId:crypto.randomUUID()}));try{localStorage.setItem(deletePrefix+crypto.randomUUID(),JSON.stringify({ctx:c,students}));}catch(error){return Promise.reject(error);}const task=deletePromise.catch(()=>{}).then(async()=>{await flush();window.tutupModalHapusPermanen?.();notify(students.length?'Data mahasiswa dihapus pada perangkat. Penghapusan disinkronkan saat online.':'Daftar mahasiswa kelas ini sudah kosong.');});deletePromise=task;return task;}
document.addEventListener('submit',e=>{const form=e.target;if(!form.matches('form')||!form.querySelector('[name=aksi_hapus_permanen],[name=aksi_hapus_massal_kelas]'))return;e.preventDefault();e.stopImmediatePropagation();const single=form.querySelector('[name=hapus_permanen_id]'),nim=single?.value;if(single&&!nim){notify('Pilih mahasiswa yang akan dihapus.');return;}if(!confirm(single?'Hapus permanen mahasiswa '+nim+' dari kelas ini?':'Hapus semua mahasiswa kelas ini?'))return;void deleteStudents(rows=>rows.filter(row=>!single||row.nim===nim)).catch(err=>notify(err.message));},true);
document.addEventListener('click',e=>{if(page!=='data_siswa')return;const link=e.target.closest('a[href]');if(!link)return;const url=new URL(link.href);if(url.origin!==location.origin||!url.pathname.endsWith('/data_siswa.php')||!url.searchParams.has('hapus_semua')&&!url.searchParams.has('hapus_id'))return;e.preventDefault();e.stopImmediatePropagation();if(!confirm(url.searchParams.has('hapus_semua')?'Hapus semua mahasiswa kelas ini?':'Hapus mahasiswa ini?'))return;void deleteStudents(rows=>rows.filter(row=>url.searchParams.has('hapus_semua')||String(row.id)===url.searchParams.get('hapus_id'))).catch(err=>notify(err.message));},true);
window.WASetSheetCourse=async name=>{await flush();name=name.trim();if(name===course)return;while(loading)await new Promise(r=>setTimeout(r,0));surfaceReady=false;resetSheetSurface();document.querySelectorAll('.sheet-signature-image').forEach(img=>{img.hidden=true;img.removeAttribute('src');});course=name;const url=new URL(location.href);url.searchParams.set('matkul',course);history.replaceState(null,'',url);await hydrate(true);surfaceReady=true;await WA.change(s=>({...s,selection:{...c,matkul:course}}));await window.PresenCourses.remember(c,course);window.PresenCourses.setCurrent(course);};
document.addEventListener('input',e=>{editRevision++;if(loading)return;const el=e.target;if(!el.closest('#paperSheet,#paper,#tbodyRekapNilai')&&!el.id?.startsWith('bobot'))return;if(el.matches('#tbodySiswa .attendance-cell')){const row=el.closest('tr'),nim=row.cells[1]?.querySelector('input')?.value,slot=Array.from(row.querySelectorAll('.attendance-cell')).indexOf(el)+1,mark=el.value.trim().toUpperCase();if(nim&&['','.','A','S','I'].includes(mark)){const old=state.snapshot.marks.find(m=>m.scope===loadedScope&&m.nim===nim&&m.slot===slot);pendingMarks[nim+':'+slot]={id:crypto.randomUUID(),nim,slot,mark,baseRevision:old?.revision||0};}}stash();clearTimeout(timer);timer=setTimeout(()=>void flush().catch(e=>notify(e.message)),250);fitNIM();if(el.closest('#tbodyRekapNilai')||el.id?.startsWith('bobot')){clearTimeout(gradeTimer);gradeTimer=setTimeout(async()=>{const values={};document.querySelectorAll('#tbodyRekapNilai tr').forEach(row=>{values[row.querySelector('.nim-value')?.textContent]=Array.from(row.querySelectorAll('.score-input')).map(x=>x.value);});await WA.saveDocument(c,course,'grade',{...(state.snapshot.documents.find(d=>d.kind==='grade'&&WA.sameCtx(d.ctx,c)&&d.matkul===course)?.content||{}),draft:values});},250);}});
document.addEventListener('click',async e=>{const button=e.target.closest('button');if(button&&['absen','ujian'].includes(page)&&!button.closest('.teacher-tools,.wa-guide,.p-screen-only,.p-dialog')){clearTimeout(timer);timer=setTimeout(save,0);}if(page==='absen'&&button?.textContent.includes('Rekap Nilai'))setTimeout(async()=>{const s=await WA.get(),sc=await WA.scope(c,course),draft=s.snapshot.documents.find(d=>d.scope===sc&&d.kind==='grade')?.content?.draft||{};document.querySelectorAll('#tbodyRekapNilai tr').forEach(row=>{const nim=row.querySelector('.nim-value')?.textContent;if(draft[nim])row.querySelectorAll('.score-input').forEach((el,i)=>{el.value=draft[nim][i]??'';el.dispatchEvent(new Event('input',{bubbles:true}));});});},0);});
document.addEventListener('change',async e=>{const row=e.target.closest('#tbodySiswa tr');if(!row||e.target.classList.contains('attendance-cell'))return;const nim=row.cells[1]?.querySelector('input')?.value.trim().toUpperCase(),nama=row.cells[2]?.querySelector('input')?.value.trim(),jk=row.cells[3]?.querySelector('input')?.value.trim().toUpperCase();if(!nim||!nama||!['','L','P'].includes(jk))return;const s=await WA.get(),old=s.snapshot.roster.find(x=>WA.sameCtx(x,c)&&x.nim===(row.dataset.nim||nim));if(row.dataset.nim&&!old){await hydrate();notify('Mahasiswa ini sudah dihapus dari daftar.');return;}if(old&&old.nim===nim&&old.nama===nama&&old.jk===jk)return;if(old&&old.nim!==nim)await WA.queue({type:'student-delete',ctx:c,nim:old.nim,base:{nama:old.nama}});row.dataset.nim=nim;await WA.queue({type:'student-upsert',ctx:c,nim,nama,jk,...(old?.nim===nim?{base:{nama:old.nama}}:{})});});
document.addEventListener('submit',async e=>{if(page!=='data_siswa'||!e.target.querySelector('[name="nim"]'))return;e.preventDefault();const values=Object.fromEntries(new FormData(e.target)),s=await WA.get(),old=s.snapshot.roster.find(x=>String(x.id)===values.id&&WA.sameCtx(x,c));try{if(old&&old.nim!==values.nim.toUpperCase())await WA.queue({type:'student-delete',ctx:c,nim:old.nim,base:{nama:old.nama}});await WA.queue({type:'student-upsert',ctx:c,nim:values.nim.trim().toUpperCase(),nama:values.nama,jk:values.jk,...(old?.nim===values.nim?{base:{nama:old.nama}}:{})});window.tutupModal?.();await hydrate(true);notify('Data disimpan di perangkat.');}catch(err){notify(err.message);}},true);
document.addEventListener('click',e=>{const button=e.target.closest('#deleteAllStudentData');if(!button)return;e.preventDefault();e.stopImmediatePropagation();void(async()=>{if(!navigator.onLine){notify('Reset seluruh data memerlukan internet. Data lokal tetap aman.');return;}if(!confirm('PERINGATAN: tindakan ini menghapus permanen daftar mahasiswa, akun mahasiswa, seluruh lembar absen, tanggal pertemuan, nilai, sesi QR, lokasi, foto bukti, dan dokumen dari SEMUA prodi, semester, dan kelas pada AKUN DOSEN INI. Data akun dosen lain tidak dihapus. Data tidak dapat dipulihkan. Lanjutkan?'))return;if(prompt('Untuk konfirmasi, ketik: HAPUS SEMUA MAHASISWA')!=='HAPUS SEMUA MAHASISWA')return;button.disabled=true;resetting=true;clearTimeout(timer);clearTimeout(gradeTimer);try{await flushPromise.catch(()=>{});const result=await WA.api('reset-all-student-data',{confirmation:'HAPUS SEMUA MAHASISWA'});for(let n=0;n<30;n++){await WA.sync();if(Number((await WA.get()).snapshot.resetEpoch)>=Number(result.resetEpoch))break;await new Promise(resolve=>setTimeout(resolve,100));}resetSheetSurface();await hydrate(true);notify(`Reset selesai. ${result.deleted?.siswa||0} data mahasiswa dan data akademik terkait dihapus permanen.`);}catch(error){notify('Reset belum dijalankan: '+error.message);}finally{resetting=false;button.disabled=false;}})();},true);
window.fetch=async(resource,init={})=>{const u=new URL(typeof resource==='string'?resource:resource.url||String(resource),location.href);if(page==='index'&&u.origin===location.origin&&u.pathname.endsWith('/index.php')&&init.body instanceof FormData){const body=init.body;if(body.get('action')==='logout_system'){await WA.logout();return new Response(JSON.stringify({status:'success'}),{headers:{'Content-Type':'application/json'}});}if(body.get('set_theme_session')){await WA.change(()=>body.get('theme_name'),'theme');if(navigator.onLine)return nativeFetch(resource,init);return new Response(JSON.stringify({status:'success'}),{headers:{'Content-Type':'application/json'}});}if(body.get('action')==='update_profile'){const current=await WA.get(),account=current.profile?.account?.id||current.profile?.account?.account_id||current.profile?.account?.nim||current.profile?.role||'default',profile={nama:body.get('admin_name')+(body.get('professional_title')?', '+body.get('professional_title'):''),professionalTitle:body.get('professional_title')||'',role:body.get('admin_role'),avatar:body.get('admin_avatar'),account};await WA.change(()=>profile,'appearance-profile:'+account);if(navigator.onLine){try{return await nativeFetch(resource,init);}catch(_){}}return new Response(JSON.stringify({status:'success',msg:'Pengaturan tersimpan pada perangkat ini.'}),{headers:{'Content-Type':'application/json'}});}if(body.get('get_login_logs')){if(navigator.onLine){try{return await nativeFetch(resource,init);}catch(_){}}return new Response('[]',{headers:{'Content-Type':'application/json'}});}}if(u.origin===location.origin&&u.pathname.endsWith('/ujian.php')&&u.searchParams.get('aksi')==='simpan_nilai'){const payload=JSON.parse(init.body),sc=await WA.scope(c,course),s=await WA.get(),old=s.snapshot.documents.find(d=>d.scope===sc&&d.kind==='grade')?.content||{};await WA.saveDocument(c,course,'grade',{...old,...payload,prodi:c.prodi,semester:c.semester,kelas:c.kelas});return new Response(JSON.stringify({status:'success',jumlah:payload.data_nilai.length,saved_at:'Tersimpan pada perangkat'}),{headers:{'Content-Type':'application/json'}});}if(u.origin===location.origin&&u.pathname.endsWith('/data_siswa.php')&&u.searchParams.get('aksi')==='import_siswa'){const payload=init.body instanceof FormData?{rows:JSON.parse(init.body.get('rows')||'[]')}:JSON.parse(init.body),rows=payload.rows||payload.siswa||payload.data||[];let imported=0;for(const row of rows){await WA.queue({type:'student-upsert',ctx:c,nim:row.nim,nama:row.nama,jk:row.jk});imported++;}return new Response(JSON.stringify({status:'success',inserted:imported,imported,diimpor:imported,jumlah:imported,skipped:0,msg:'Data disimpan di perangkat.'}),{headers:{'Content-Type':'application/json'}});}return nativeFetch(resource,init);};
if(params.get('app')==='1'){const root=WA.ROOT.href;document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.href.startsWith(root)&&/\.php(?:\?|$)/.test(a.href)&&!a.download){const u=contextURL(a.href);u.searchParams.set('app','1');a.href=u.href;}});}
document.addEventListener('sheet-logo-changed',()=>{stash();void flush();});document.addEventListener('sheet-signature-changed',()=>{stash();void flush();});document.addEventListener('sheet-position-changed',()=>{editRevision++;stash();clearTimeout(timer);timer=setTimeout(()=>void flush().catch(e=>notify(e.message)),250);});await flush();document.documentElement.dataset.waHydrating='1';await hydrate(true);surfaceReady=true;WA.on(()=>void hydrate());window.WAFitSheetText?.();delete document.documentElement.dataset.waHydrating;function dismissLegacyTemplateNotice(){const desc=document.getElementById('customModalDesc'),title=document.getElementById('customModalTitle');if(page==='absen'&&state.profile?.role==='teacher'&&title?.textContent==='Pemberitahuan Sistem'&&desc?.textContent.startsWith('Perhatian: Untuk memastikan sinkronisasi data yang tepat'))document.getElementById('customModalOverlay')?.classList.remove('show');}dismissLegacyTemplateNotice();window.addEventListener('load',dismissLegacyTemplateNotice,{once:true});if(page==='index'){const account=state.profile?.account?.id||state.profile?.account?.account_id||state.profile?.account?.nim||state.profile?.role||'default',profile=await WA.get('appearance-profile:'+account),theme=await WA.get('theme');if(theme)document.documentElement.dataset.theme=theme;for(const id of ['currentUserNameText','widgetAdminName']){const el=document.getElementById(id);if(el)el.textContent=state.profile.account.nama||profile?.nama;}for(const id of ['widgetAvatarImg','topNavAvatarImg','previewAvatarImg']){const el=document.getElementById(id);const avatar=state.profile.account.avatar||profile?.avatar;if(el&&/^data:image\/(png|jpeg|webp);base64,/.test(avatar||''))el.src=avatar;}}await window.PresenCourses.mount(c,course,page);await window.PresenCourses.remember(c,course);window.WASheetReady=true;window.WATeacherBridgeReady='teacher';window.PresenTeacherWork?.start();window.addEventListener('pagehide',()=>{void flush();});document.addEventListener('visibilitychange',()=>{if(document.hidden)void flush();});document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||a.download||a.target==='_blank'||e.ctrlKey||e.metaKey)return;const url=contextURL(a.href);if(url.origin!==location.origin||!url.pathname.endsWith('.php'))return;e.preventDefault();void window.WAFlush().then(()=>{if(window.AbsensiUIAudio?.navigateApplication)window.AbsensiUIAudio.navigateApplication(url.href);else location.assign(url.href);}).catch(err=>notify('Belum dapat berpindah: '+err.message));},true);
})();

} catch(error) {console.error("Teacher module assets/offline-bridge.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/teacher-tools.js */
try {
/* QR and device tools belong to the original teacher pages, never a second dashboard. */
(async () => {
  'use strict';
  const host = document.getElementById('teacherTools');
  if (!host || !window.WA) return;
  const $ = selector => host.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sheet = host.dataset.page === 'absen', params = new URLSearchParams(location.search);
  const invitationButton=document.createElement('button');invitationButton.type='button';invitationButton.id='shareClassInvite';invitationButton.textContent='Undang mahasiswa';invitationButton.className='btn btn-dark';invitationButton.onclick=()=>void run(async()=>{const state=await WA.get();await window.PresenClassInvites.share(context(state),new URLSearchParams(location.search).get('matkul')||state.selection?.matkul||'');},invitationButton);(document.querySelector('#topToolbar .sheet-primary')||document.querySelector('#topToolbar .toolbar-group')||host).append(invitationButton);

  window.addEventListener('wa-global-reset',()=>{sessionQR=null;sessionCode='';host.querySelector('#codeDialog')?.close();});
  let sessionQR = null, sessionCode = '', stream = null, scanTimer, renderKey = '', rendering = false, clockState=null,finalizing=false;
  const notify = text => { $('#toolNotice').textContent = text; $('#toolNotice').style.display='flex';window.PresenUI?.closable($('#toolNotice')); if(host.hidden) window.showToast?.(escape(text),'error'); };
  async function run(fn, button) {
    if (button) button.disabled = true;
    try { return await fn(); } catch (error) { notify(error.message); }
    finally { if (button) button.disabled = false; }
  }
  function context(state) {
    return WA.ctx(sheet ? Object.fromEntries(params) : {
      jenjang: document.getElementById('jenjang')?.value,
      prodi: document.getElementById('prodi')?.value,
      semester: document.getElementById('semester')?.value,
      year: document.getElementById('academicYear')?.value,
      period: document.getElementById('academicPeriod')?.value,
      kelas: document.getElementById('kelas')?.value,
      ...(!document.getElementById('prodi') ? state.selection : {})
    });
  }
  const course = () => $('#sessionForm')?.elements.matkul.value.trim() || '';
  async function download(blob, name) {
    if (window.Android?.saveFile) {
      const reader = new FileReader();
      reader.onload = () => Android.saveFile(name, blob.type, reader.result);
      reader.readAsDataURL(blob); return;
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function showQR(session) {
    const state = await WA.get();
    if (session.teacher_id !== state.profile.device) throw Error('Tampilkan QR dari perangkat pembuat sesi.');
    sessionQR = session;$('#codeImage').hidden=false;$('#shareCode').disabled=false;
    const original=WA.qr('session', state.profile.certificate, 'challenge', session.challenge),compact=await WA.compactQR(original);
    let control=$('#qrCompatibility');if(!control){const label=document.createElement('label');label.className='qr-compatibility';label.innerHTML='<input type="checkbox" id="qrCompatibility"> QR kompatibel aplikasi lama';$('#codeImage').after(label);control=label.querySelector('input');}
    const quick=navigator.onLine&&!state.outbox.some(op=>op.type==='session'&&op.session?.id===session.id)?WA.quickQR(session):null;control.checked=!quick;control.closest('label').hidden=false;control.closest('label').lastChild.textContent=' QR lengkap — offline / aplikasi lama (QR cepat: Presen Go 1.2.7+)';
    const paint=()=>{sessionCode=control.checked?original:(quick||compact);const qr=qrcode(0,sessionCode.length>1800?'L':'M');qr.addData(sessionCode,/^WA[23]:/.test(sessionCode)?'Alphanumeric':'Byte');qr.make();$('#codeImage').innerHTML=qr.createSvgTag({cellSize:4,margin:24,scalable:true});};control.onchange=paint;paint();
    $('#codeTitle').textContent = session.matkul + ' · pertemuan ' + session.slot;
    $('#codeDialog').showModal(); clock();
  }
  function stopScan() {
    stream?.getTracks().forEach(track => track.stop()); stream = null; clearTimeout(scanTimer);
    if ($('#scanner')?.open) $('#scanner').close();
  }
  async function receive(code) {
    await WA.receive(code); stopScan(); notify('Absen diterima di Lembar Absen. Akan tersinkron saat online.');
  }
  async function startScan() {
    $('#scanner').showModal();
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}, audio:false});
      const video = $('#camera'), canvas = $('#scanCanvas'); video.srcObject = stream; await video.play();
      const tick = async () => {
        if (!stream) return;
        if (video.readyState >= 2) {
          const scale = Math.min(1, 640/video.videoWidth);
          canvas.width = Math.round(video.videoWidth*scale); canvas.height = Math.round(video.videoHeight*scale);
          const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
          const qr = jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
          if (qr) { try { await receive(qr.data); return; } catch (error) { notify(error.message); } }
        }
        scanTimer = setTimeout(tick,150);
      }; void tick();
    } catch (_) { notify('Izinkan kamera, atau pilih foto QR / tempel kode.'); }
  }
  function clock() {
    const state=clockState;if(!state)return;{
      const now = WA.now(state);
      host.querySelectorAll('[data-end]').forEach(el => {
        const left = Math.max(0,Math.ceil((Number(el.dataset.end)-now)/1000));
        el.textContent = left ? Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' tersisa' : 'Absen ditutup · A otomatis';
      });
      if ($('#countdown')) $('#countdown').textContent = sessionQR ? (sessionQR.deadline<=now?'Sesi absensi selesai · tampilkan QR pertemuan terbaru':Math.ceil((sessionQR.deadline-now)/1000)+' detik tersisa') : '';
      if(sessionQR&&$('#codeDialog')?.open){const current=state.snapshot.sessions.find(x=>x.id===sessionQR.id),ended=sessionQR.deadline<=now||current?.version>sessionQR.version;$('#codeImage').hidden=ended;$('#shareCode').disabled=ended;if(current?.version>sessionQR.version)$('#countdown').textContent='QR sudah diperbarui. Tutup dan tampilkan QR terbaru.';}
    }
  }
  function initialize(state) {
    host.hidden = false;
    if(!invitationButton.isConnected)(document.querySelector('.portal-actions,.main-card')||host).append(invitationButton);
    const body = sheet ? `<form id="sessionForm"><label>Mata kuliah<input name="matkul" maxlength="180" list="savedSessionCourses" required><datalist id="savedSessionCourses"></datalist></label><div class="tool-grid"><label>Pertemuan<input name="slot" type="number" min="1" max="16" value="1" required></label><label>Durasi (menit)<input name="minutes" type="number" min="1" max="1440" placeholder="Misalnya 10" required></label></div><p>QR berlaku untuk kelas pada lembar ini. 1. Cocokkan kelas dan mata kuliah. 2. Isi pertemuan dan durasi. 3. Mulai lalu bagikan QR. Kolom tetap kosong selama waktu berjalan; A otomatis muncul sesudah tenggat. Untuk mahasiswa offline, pindai QR balasannya sebelum tenggat.</p><button id="startSession" type="submit">Mulai Absen / reset QR</button><button id="scanReply" type="button">Pindai QR mahasiswa</button><div id="sessionList"></div></form>` : '';
    $('#toolBody').innerHTML = body + '<div id="toolResults"></div>' + (!sheet ? `<details><summary>Cadangan perangkat</summary><button id="backup" type="button">Simpan cadangan</button><label>Pulihkan cadangan JSON<input id="restore" type="file" accept="application/json,.json"></label><p>Sinkronkan data pada aplikasi lama sebelum beralih. Cadangan tidak menyertakan akses login atau kunci QR.</p></details>` : '');
    if (sheet) {
      const form = $('#sessionForm');
      form.elements.matkul.value = new URLSearchParams(location.search).get('matkul') || '';
      const fillCourses=async()=>{const s=await WA.get(),list=$('#savedSessionCourses');if(list)list.replaceChildren(...window.PresenCourses.catalogue(s,context(s)).map(row=>new Option(row.matkul,row.matkul)));};void fillCourses();WA.on(()=>void fillCourses());
      form.elements.slot.value = state.selection?.slot || 1;
      if(params.get('qrMinutes')) form.elements.minutes.value=params.get('qrMinutes');
      const draftKey='wa-qr-settings-'+state.profile.device+'-'+encodeURIComponent(JSON.stringify(context(state))),draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(draft){form.elements.slot.value=draft.slot||1;form.elements.minutes.value=draft.minutes||'';}form.oninput=()=>localStorage.setItem(draftKey,JSON.stringify(Object.fromEntries(new FormData(form))));form.onchange = () => { renderKey = ''; void render(); };
      form.onsubmit = event => {
        event.preventDefault();
        void run(async () => {
          if (!window.WASheetReady) throw Error('Tunggu data lembar selesai dimuat.');
          const s = await WA.get(), c = context(s), values = Object.fromEntries(new FormData(form));
          const name = values.matkul.trim();
          const displayed = document.querySelector('[data-app-course]');
          if(displayed && displayed.textContent.trim()!==name) await window.WASetSheetCourse(name);
          await window.WAFlush?.();
          const session = await WA.startSession(c,name,Number(values.slot),Number(values.minutes));
          $('#sessionList').dataset.selectedMeeting=String(session.slot);renderKey='';void render();
          window.WASetMeetingDate?.(session);await window.WAFlush?.();
          await showQR(session); notify('Absen dimulai. Kehadiran dicatat pada tabel asli di lembar ini.');
        }, $('#startSession'));
      };
      $('#scanReply').onclick = () => void startScan();
      $('#stopScan').onclick = stopScan;
      $('#scanner').addEventListener('close',stopScan);
      $('#readText').onclick = () => void run(() => receive($('#qrText').value.trim()));
      $('#qrImage').onchange = event => void run(async () => {const file=event.target.files[0];event.target.value='';if(file)await receive(await WAQRFiles.read(file));});
      $('#closeCode').onclick = () => $('#codeDialog').close();
      $('#shareCode').onclick = () => void run(async () => {
        const png=await WAQRFiles.png(sessionCode), file=new File([png],'absensi-qr.png',{type:'image/png'});
        if (navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:$('#codeTitle').textContent});
        else await download(png,'absensi-qr.png');
      });
    } else {
      $('#backup').onclick = () => void run(async () => download(new Blob([JSON.stringify({type:'web-absensi-backup',version:1,snapshot:(await WA.get()).snapshot},null,2)],{type:'application/json'}),'absensi-cadangan-'+WA.day()+'.json'));
      $('#restore').onchange = event => void run(async () => {
        const file=event.target.files[0]; if (!file || file.size>20000000) throw Error('Pilih cadangan JSON di bawah 20 MB.');
        const data=JSON.parse(await file.text()); if(data.type!=='web-absensi-backup'||!Array.isArray(data.snapshot?.roster)) throw Error('Berkas bukan cadangan absensi.');
        const s=await WA.get();
        if(s.snapshot.roster.length||s.snapshot.documents.length||s.snapshot.marks.length) throw Error('Data sudah terisi. Sinkronkan perangkat lama; pemulihan otomatis tidak dilakukan agar data yang ada tidak tertimpa.');
        if((data.snapshot.marks||[]).some(mark=>!(data.snapshot.sessions||[]).some(session=>session.scope===mark.scope))) throw Error('Cadangan memiliki absen tanpa konteks sesi. Gunakan sinkronisasi perangkat lama agar tidak ada catatan yang terlewat.');
        if(!confirm('Pulihkan cadangan pada perangkat kosong ini?')) return;
        for(const row of data.snapshot.roster) await WA.queue({type:'student-upsert',ctx:row,nim:row.nim,nama:row.nama,jk:row.jk});
        for(const doc of data.snapshot.documents||[]) await WA.saveDocument(doc.ctx,doc.matkul,doc.kind,doc.content);
        for(const mark of data.snapshot.marks||[]) {const session=data.snapshot.sessions.find(x=>x.scope===mark.scope); await WA.queue({type:'mark',ctx:session.ctx,matkul:session.matkul,slot:mark.slot,nim:mark.nim,mark:mark.mark,reason:mark.reason,baseRevision:0});}
        notify('Cadangan masuk ke antrean sinkronisasi.');
      });
      document.querySelector('.main-card form').addEventListener('change',()=>{renderKey='';void render();});
    }
    $('#sync').onclick = () => void run(async()=>{await WA.sync();notify(WA.lastError||'Sinkronisasi selesai.');});
  }
  async function render() {
    if(rendering) return; rendering=true;
    try {
      const state=await WA.get();clockState=state;
      if(state.profile?.role!=='teacher'){host.hidden=true;return;}
      if(!$('#toolResults')) initialize(state);
      $('#toolConnection').textContent=(navigator.onLine?'Online':'Offline')+' · '+state.outbox.length+' perubahan belum tersinkron';
      const c=context(state), scope=sheet?await WA.scope(c,course()):null;
      const key=JSON.stringify([scope,state.snapshot.roster,state.snapshot.sessions,state.snapshot.marks,state.snapshot.registrations,state.outbox]); if(key===renderKey) return; renderKey=key;
      const sessions=state.snapshot.sessions.filter(x=>x.scope===scope), marks=state.snapshot.marks.filter(x=>x.scope===scope);
      if(sheet) {
        const latest=[...sessions].sort((a,b)=>b.starts-a.starts)[0],panel=$('#sessionList');
        window.PresenMeetings.mount(panel,{count:Math.max(16,Number(document.getElementById('headerPertemuan')?.colSpan)||16),selected:latest?.slot||1,onSelect:slot=>{$('#sessionForm').elements.slot.value=slot;},state:slot=>{const session=sessions.find(x=>x.slot===slot);return !session?'Belum dibuka':session.deadline>WA.now(state)?'Aktif':'Selesai';},render:(detail,slot)=>{
          const session=sessions.find(x=>x.slot===slot);
          if(!session){const p=document.createElement('p');p.textContent='Pertemuan '+slot+' belum dibuka. Atur durasi lalu tekan Mulai Absen.';detail.append(p);return;}
          detail.innerHTML=`<div class="tool-card">Pertemuan ${session.slot} · ${escape(session.day)} <b data-end="${session.deadline}"></b><button type="button" data-session="${session.id}">Tampilkan QR</button></div>`;detail.querySelector('[data-session]').onclick=()=>void run(()=>showQR(session));clock();
        }});
      }
      const registrations=state.snapshot.registrations.filter(x=>!x.approved), pending=marks.filter(x=>['S','I'].includes(x.mark));
      $('#toolResults').innerHTML=`<details><summary>Perubahan belum tersinkron (${state.outbox.length})</summary>${state.outbox.filter(x=>x.problem).map(x=>`<div class="tool-card"><p>${escape(x.problem.message||'Ada perubahan pada perangkat lain.')}</p><button type="button" data-resolve="${x.id}" data-keep="1">Kirim salinan perangkat ini</button><button type="button" data-resolve="${x.id}" data-keep="0">Gunakan data server</button></div>`).join('')||'<p>Perubahan tersimpan di perangkat sampai server menerima sinkronisasi.</p>'}</details>`;
      host.querySelectorAll('[data-approve]').forEach(button=>button.onclick=()=>void run(async()=>{const op=await WA.queue({type:'approve',account:button.dataset.approve});await WA.sync();const current=await WA.get(),pending=current.outbox.find(x=>x.id===op.id);notify(pending?pending.problem?.message||'Persetujuan tersimpan di perangkat. Sambungkan internet lalu tekan Sinkronkan.':'Akun disetujui. Mahasiswa akan menerima hasil saat tersambung internet.');},button));
      host.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>void run(async()=>{const[nim,slot]=button.dataset.review.split(':'),mark=marks.find(x=>x.nim===nim&&x.slot===Number(slot)); await WA.queue({type:'review',ctx:c,matkul:course(),nim,slot:Number(slot),mark:button.dataset.status==='rejected'?'A':mark.mark,reason:mark.reason,review_status:button.dataset.status,baseRevision:mark.revision});},button));
      host.querySelectorAll('[data-resolve]').forEach(button=>button.onclick=()=>void run(()=>WA.resolve(button.dataset.resolve,button.dataset.keep==='1'),button));
      clock();
    } finally {rendering=false;}
  }
  if(!sheet) {
    window.WATeacher={prepare:async()=>{await WA.bootstrap({renew:true});void WA.prepareOffline();}};
    const originalOnload=window.onload;
    window.onload=async event=>{
      const state=await WA.get();
      const allowed=state.profile?.role==='teacher'&&(!navigator.onLine||window.SERVER_CONFIG.accountId===state.profile.account.id);
      if(allowed){
        const id=state.profile.account.id,custom=await WA.get('appearance-profile:'+id);
        window.SERVER_CONFIG.adminName=state.profile.account.nama;
        window.SERVER_CONFIG.adminRole=state.profile.account.role==='admin'?'Administrator Utama':'Dosen';
        window.SERVER_CONFIG.adminAvatar=state.profile.account.avatar||custom?.avatar||window.SERVER_CONFIG.adminAvatar;
      }
      originalOnload?.call(window,event);
    };
    const state=await WA.get();
    if(state.profile?.role==='teacher'&&(!navigator.onLine||window.SERVER_CONFIG.accountId===state.profile.account.id)) {
      document.getElementById('authOverlay').style.display='none';
    }
  } else {
    document.getElementById('openAttendanceQR').onclick=()=>{
      if(!$('#toolResults')){notify('Tunggu data lembar selesai dimuat, lalu coba lagi.');return;}
      const displayed=document.querySelector('[data-app-course]');
      if(displayed) $('#sessionForm').elements.matkul.value=displayed.textContent.trim();
      renderKey='';void render();document.body.classList.add('wa-qr-open');document.getElementById('attendanceQRPanel').hidden=false;document.getElementById('attendanceQRPanel').scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('openAttendanceQR').setAttribute('aria-expanded','true');
    };
    document.getElementById('closeAttendanceQR').onclick=()=>{document.body.classList.remove('wa-qr-open');document.getElementById('attendanceQRPanel').hidden=true;document.getElementById('openAttendanceQR').setAttribute('aria-expanded','false');};
  }
  let state=await WA.get();
  if(navigator.onLine&&window.SERVER_CONFIG?.isLoggedIn&&(!state.profile||state.profile.role!=='teacher'||state.profile.account.id!==window.SERVER_CONFIG.accountId)) {try {await WA.bootstrap();state=await WA.get();} catch (_) {}}
  if(!sheet&&state.profile?.role==='teacher'&&(!navigator.onLine||window.SERVER_CONFIG.accountId===state.profile.account.id)) document.getElementById('authOverlay').style.display='none';
  WA.on(()=>void render());window.addEventListener('online',()=>void render());window.addEventListener('offline',()=>void render());
  await render();
  if(state.profile?.role==='teacher')void WA.prepareOffline();
  setInterval(()=>{if(document.hidden)return;clock();const state=clockState;if(!state||finalizing)return;const marks=new Set(state.snapshot.marks.filter(m=>m.mark).map(m=>m.scope+':'+m.slot+':'+m.nim));if(state.profile?.role==='teacher'&&state.snapshot.sessions.some(session=>session.deadline<=WA.now(state)&&session.roster.some(nim=>!marks.has(session.scope+':'+session.slot+':'+nim)))){finalizing=true;void WA.finalize().finally(()=>{finalizing=false;});}},1000);
  window.PresenTeacherWork?.start();
  if(sheet&&params.get('qr')==='1') document.getElementById('openAttendanceQR').click();
})();

} catch(error) {console.error("Teacher module assets/teacher-tools.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/class-invites.js */
try {
/* A class invitation selects context, never approves or logs in a student. */
(()=>{'use strict';if(!window.WA)return;const storage='presen-class-invite';
function token(value){let text=String(value||'').trim();if(text.startsWith('WAJOIN1:'))text=text.slice(8);else if(text.includes('://')){try{const u=new URL(text);if(u.protocol==='presengo:'&&u.hostname==='join')text=u.pathname.slice(1);else if(u.protocol==='https:'&&u.hostname===WA.ROOT.hostname&&/^\/app\/?(?:index\.html)?$/.test(u.pathname))text=u.searchParams.get('join')||'';else text='';}catch(_){text='';}}return /^[a-f0-9]{32}$/.test(text)?text:'';}
function pending(){try{return token(new URLSearchParams(location.search).get('join'))||token(window.Android?.consumeClassInvite?.())||token(localStorage.getItem(storage));}catch(_){return '';}}
function clear(){localStorage.removeItem(storage);const u=new URL(location.href);if(u.searchParams.has('join')){u.searchParams.delete('join');history.replaceState(null,'',u);}}
async function apply(form,value=pending()){
 const code=token(value);if(!code)return false;const response=await WA.api('resolve-class-invite',{token:code}),invite=response.invite;localStorage.setItem(storage,code);
 for(const[name,value]of Object.entries({...invite.ctx,owner:invite.ctx.owner||'admin_01',year:WA.academicYear(invite.ctx),period:WA.academicPeriod(invite.ctx)})){const control=form.elements[name];if(!control)continue;if(control.tagName==='SELECT'&&![...control.options].some(o=>o.value===String(value)))control.add(new Option(name==='owner'?invite.teacher:String(value),String(value)));control.value=String(value);}
 const owner=form.elements.owner;if(owner?.selectedOptions[0])owner.selectedOptions[0].textContent=invite.teacher;
 form.dataset.invitationToken=code;const group=form.querySelector('.student-form-group');group.hidden=true;let summary=form.querySelector('.class-invite-summary');if(!summary){summary=document.createElement('section');summary.className='class-invite-summary';summary.innerHTML='<h2>Kelas dari undangan dosen</h2><strong></strong><p></p><button type="button" data-change-class>Pilih kelas lain</button><a data-open-app>Buka di aplikasi Presen Go</a>';group.before(summary);summary.querySelector('[data-change-class]').onclick=()=>{clear();delete form.dataset.invitationToken;group.hidden=false;summary.remove();};}
 summary.querySelector('strong').textContent=invite.teacher;summary.querySelector('p').textContent=invite.ctx.prodi+' · Semester '+invite.ctx.semester+' ('+WA.academicPeriod(invite.ctx)+') · '+WA.academicYear(invite.ctx)+' · Kelas '+invite.ctx.kelas+(invite.matkul?' · '+invite.matkul:'');const open=summary.querySelector('[data-open-app]');open.href='presengo://join/'+code;open.hidden=!!window.Android?.isNativeApp?.();return true;
}
async function receive(value){const code=token(value);if(!code)throw Error('Gunakan QR atau tautan undangan kelas dari dosen.');localStorage.setItem(storage,code);const state=await WA.get();if(state.profile){const d=PresenUI.dialog('Buka undangan kelas','<p>Anda masih masuk dengan akun yang tersimpan. Untuk membuka pendaftaran kelas dari undangan, keluar dari akun saat ini terlebih dahulu.</p><button type="button" data-switch-class>Keluar dan buka undangan</button>');d.querySelector('[data-switch-class]').onclick=()=>{d.close();void WA.logout();};return;}const form=document.getElementById('login');if(form)await apply(form,code);}
function setupStudent(form,{scan,notify}){
 const actions=document.createElement('div');actions.className='class-invite-actions';actions.innerHTML='<button type="button" data-scan-class>Pindai undangan kelas</button><button type="button" data-paste-class>Tempel tautan / kode kelas</button>';form.before(actions);
 actions.querySelector('[data-scan-class]').onclick=()=>void scan(async raw=>{const code=token(raw);if(!code)throw Error('Ini bukan undangan kelas. Minta QR Undang mahasiswa dari dosen.');await apply(form,code);notify('Kelas terisi otomatis. Masukkan NIM dan PIN Anda.');},'Pindai undangan kelas');
 actions.querySelector('[data-paste-class]').onclick=()=>{const d=PresenUI.dialog('Undangan kelas','<form><label>Tautan atau kode dari dosen<textarea name="invite" required rows="3"></textarea></label><button type="submit">Gunakan undangan</button><p role="status"></p></form>');d.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await apply(form,e.target.elements.invite.value);d.close();notify('Kelas terisi otomatis.');}catch(error){d.querySelector('[role=status]').textContent=error.message;}};};
 void apply(form).catch(error=>notify(error.message));
}
async function share(context,course){const response=await WA.api('create-class-invite',{ctx:context,matkul:course||''}),invite=response.invite,url=new URL('app/?role=student',WA.ROOT);url.searchParams.set('join',invite.token);const qr=qrcode(0,'M');qr.addData(url.href);qr.make();const d=PresenUI.dialog('Undang mahasiswa ke kelas','<p data-class-summary></p><div class="class-invite-qr"></div><p>Mahasiswa cukup memindai QR ini di aplikasi atau membuka tautannya. Dosen, prodi, semester, tahun, dan kelas terisi otomatis. NIM serta PIN tetap milik masing-masing mahasiswa; pendaftaran tetap menunggu persetujuan dosen.</p><label>Tautan kelas<input readonly></label><div class="p-actions"><button type="button" data-copy-invite>Salin tautan</button><button type="button" data-share-invite>Bagikan</button></div><p role="status"></p>');d.classList.add('p-screen-only','class-invite-dialog');d.querySelector('[data-class-summary]').textContent=invite.teacher+' · '+invite.ctx.prodi+' · Semester '+invite.ctx.semester+' · Kelas '+invite.ctx.kelas;d.querySelector('.class-invite-qr').innerHTML=qr.createSvgTag({cellSize:5,margin:24,scalable:true});d.querySelector('input').value=url.href;
 d.querySelector('[data-copy-invite]').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);d.querySelector('[role=status]').textContent='Tautan disalin.';}catch(_){const input=d.querySelector('input');input.focus();input.select();d.querySelector('[role=status]').textContent='Salin tautan yang dipilih.';}};
 d.querySelector('[data-share-invite]').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Undangan kelas · '+invite.teacher,url:url.href});else d.querySelector('[data-copy-invite]').click();}catch(error){if(error.name!=='AbortError')d.querySelector('[role=status]').textContent=error.message;}};
}
window.PresenClassInvites={token,pending,clear,apply,receive,setupStudent,share};
})();

} catch(error) {console.error("Teacher module app/class-invites.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/icon-settings.js */
try {
/* Shared native-only settings: the original web layout and attendance state stay intact. */
(()=>{
'use strict';
if(window.Android?.appRole?.()==='student'||new URLSearchParams(location.search).get('role')==='student')return;
const desktop=window.AbsensiDesktop,android=window.Android;
if(!desktop?.getAppIcon&&!android?.getAppIcon)return;
const native=desktop||android,isAndroid=!desktop;
let image=null,busy=false,dirty=false,loadId=0,returnFocus=null,shortcutSupported=true;
const style=document.createElement('style');style.textContent=`
#appIconDialog{box-sizing:border-box;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid #526176;border-radius:18px;background:#111b2d;color:#f3f6fc;font:14px/1.5 system-ui,sans-serif;margin:auto}
#appIconDialog::backdrop{background:#0009}#appIconDialog h2{font-size:20px;margin:0 0 8px}#appIconDialog p{margin:8px 0}#appIconDialog label{color:inherit;display:block;margin:12px 0 4px}#appIconDialog input[type=range]{display:block;width:100%;min-height:38px}#appIconDialog input[type=file]{color:inherit;background:transparent;max-width:100%;min-height:40px}#appIconDialog canvas{display:block;width:160px;height:160px;border:1px solid #64748b;border-radius:16px;background:repeating-conic-gradient(#e2e8f0 0% 25%,#fff 0% 50%) 0/16px 16px;margin:12px auto}#appIconDialog button,[data-app-icon-open]{min-height:42px;cursor:pointer;font:inherit;border-radius:10px;border:1px solid #64748b;padding:8px 12px}#appIconDialog button{color:#fff;background:#233047}#appIconDialog button:disabled{opacity:.5;cursor:wait}#appIconDialog .icon-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}#appIconDialog .icon-primary{background:#2563eb;border-color:#2563eb}#appIconDialog .icon-help{font-size:12px;color:#cbd5e1}#appIconDialog [role=status]{min-height:21px}#appIconDialog [data-close]{float:right}#appIconDialog output{float:right}#appIconDialog button:focus-visible,[data-app-icon-open]:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}@media(max-width:600px){#appIconDialog{padding-right:48px}}@media print{#appIconDialog,[data-app-icon-open]{display:none!important}}
`;document.head.append(style);
const dialog=document.createElement('dialog');dialog.id='appIconDialog';dialog.setAttribute('aria-labelledby','appIconTitle');
dialog.innerHTML=`<button type="button" data-close aria-label="Tutup pengaturan ikon">✕</button><h2 id="appIconTitle">Ikon aplikasi</h2><p class="icon-help" id="appIconHint"></p><label for="appIconFile">1. Pilih gambar PNG, JPG atau WebP</label><input id="appIconFile" type="file" accept="image/png,image/jpeg,image/webp"><canvas id="appIconPreview" width="512" height="512" role="img" aria-label="Pratinjau ikon pilihan"></canvas><p class="icon-help">2. Atur gambar dalam kotak. Ukuran ikon di layar mengikuti pengaturan perangkat.</p><label for="appIconScale">Ukuran gambar <output id="appIconScaleValue">100%</output></label><input id="appIconScale" type="range" min="20" max="300" value="100"><label for="appIconX">Geser kiri / kanan <output id="appIconXValue">0</output></label><input id="appIconX" type="range" min="-100" max="100" value="0"><label for="appIconY">Geser atas / bawah <output id="appIconYValue">0</output></label><input id="appIconY" type="range" min="-100" max="100" value="0"><label><input id="appIconWhite" type="checkbox"> Latar putih</label><div class="icon-actions"><button type="button" id="appIconCenter">Pas di tengah</button><button type="button" id="appIconDefault">Ikon bawaan</button></div><div class="icon-actions"><button type="button" class="icon-primary" id="appIconSave">3. Simpan ikon</button><button type="button" id="appIconShortcut">Buat / perbarui pintasan</button></div><p class="icon-help" id="appIconShortcutHint"></p><p id="appIconStatus" role="status" aria-live="polite"></p>`;
document.body.append(dialog);
const $=id=>dialog.querySelector('#'+id),canvas=$('appIconPreview'),ctx=canvas.getContext('2d');
function status(text){$('appIconStatus').textContent=text;}
async function call(method,...args){const result=await native[method](...args);if(result===false||result==='error')throw Error('Ikon belum dapat disimpan. Coba lagi.');return result;}
function geometry(){const factor=Math.min(512/image.width,512/image.height)*Number($('appIconScale').value)/100,w=image.width*factor,h=image.height*factor;return {w,h,x:(512-w)/2+Number($('appIconX').value)*2.56,y:(512-h)/2+Number($('appIconY').value)*2.56};}
function draw(){ctx.clearRect(0,0,512,512);if($('appIconWhite').checked){ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);}if(image){const {w,h,x,y}=geometry();ctx.drawImage(image,x,y,w,h);}for(const name of ['Scale','X','Y'])$('appIcon'+name+'Value').value=$('appIcon'+name).value+(name==='Scale'?'%':'');}
function center(){for(const [name,value]of[['Scale',100],['X',0],['Y',0]])$('appIcon'+name).value=value;$('appIconWhite').checked=false;draw();}
function bitmap(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Gambar tidak dapat dibaca. Pilih PNG, JPG atau WebP lainnya.'));img.src=data;});}
async function loadSaved(){let saved=await call('getAppIcon');if(typeof saved==='string')saved=JSON.parse(saved);if(saved.error)throw Error(saved.error);image=await bitmap(saved.png);center();dirty=false;shortcutSupported=isAndroid?!!saved.shortcutSupported:saved.platform==='win32';if(!shortcutSupported)status('Perangkat ini tidak mendukung pintasan dengan gambar pilihan.');}
async function run(fn){if(busy)return;busy=true;const disabled=new Map([...dialog.querySelectorAll('input,button')].map(el=>[el,el.disabled]));for(const el of disabled.keys())el.disabled=true;try{await fn();}catch(e){status(e.message||'Pengaturan belum dapat diterapkan.');}finally{busy=false;for(const [el,value]of disabled)el.disabled=value;$('appIconShortcut').disabled=!shortcutSupported;}}
async function save(){if(!image)throw Error('Pilih gambar terlebih dahulu.');const {w,h,x,y}=geometry();if(x+w<=0||y+h<=0||x>=512||y>=512)throw Error('Gambar berada di luar kotak. Tekan Pas di tengah.');await call('setAppIcon',canvas.toDataURL('image/png'));dirty=false;}
$('appIconHint').textContent=isAndroid?'Mengatur ikon pintasan layar utama dan tampilan aplikasi terkini. Ikon di daftar aplikasi tetap mengikuti APK.':'Mengatur ikon jendela aplikasi dan pintasan desktop. Ikon pada berkas EXE tetap mengikuti paket aplikasi.';
$('appIconShortcutHint').textContent=isAndroid?'Setelah menyimpan, buat pintasan lalu konfirmasi pada layar Android. Bentuk dan ukuran luarnya mengikuti launcher HP.':'Setelah menyimpan, buat pintasan desktop “Presen Desk - Ikon saya”. Gunakan pintasan ini untuk membuka aplikasi.';
$('appIconFile').onchange=()=>run(async()=>{const file=$('appIconFile').files[0];$('appIconFile').value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Pilih PNG, JPG atau WebP maksimal 8 MB.');const id=++loadId,url=URL.createObjectURL(file);try{const next=await bitmap(url);if(next.width*next.height>24000000)throw Error('Gambar terlalu besar. Gunakan gambar maksimal 24 megapiksel.');if(id!==loadId)return;image=next;center();dirty=true;status('Atur gambar, lalu tekan Simpan ikon.');}finally{URL.revokeObjectURL(url);}});
for(const name of['Scale','X','Y','White'])$('appIcon'+name).oninput=()=>{dirty=true;draw();status('Pratinjau berubah. Tekan Simpan ikon untuk menerapkan.');};
$('appIconCenter').onclick=()=>{center();dirty=true;status('Gambar diletakkan di tengah. Tekan Simpan ikon.');};
$('appIconSave').onclick=()=>run(async()=>{await save();status(isAndroid?'Ikon disimpan. Tekan Buat / perbarui pintasan untuk menaruhnya di layar utama.':'Ikon jendela disimpan. Tekan Buat / perbarui pintasan untuk ikon desktop.');});
$('appIconShortcut').onclick=()=>run(async()=>{if(dirty)await save();const result=await call('createIconShortcut');status(result==='requested'?'Permintaan dikirim. Konfirmasi penambahan pintasan di layar Android.':result==='unsupported'?'Launcher ini tidak mendukung pintasan gambar pilihan.':isAndroid?'Pintasan layar utama diperbarui.':'Pintasan desktop berhasil dibuat / diperbarui.');});
$('appIconDefault').onclick=()=>run(async()=>{await call('resetAppIcon');await loadSaved();status('Ikon bawaan dipulihkan.');});
dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>returnFocus?.focus());
for(const mount of document.querySelectorAll('#profileModal .avatar-preview-container,#formLoginAuth,body>header')){const button=document.createElement('button');button.type='button';button.dataset.appIconOpen='';button.textContent=mount.matches('header')?'Ikon':mount.id==='formLoginAuth'?'Ikon aplikasi':'Atur ikon aplikasi';if(mount.classList.contains('avatar-preview-container')){button.className='form-control';button.style.cssText='margin-bottom:12px;cursor:pointer';mount.after(button);}else{if(mount.id==='formLoginAuth')button.style.cssText='display:block;margin:12px auto 0;background:transparent;color:inherit';mount.append(button);}button.onclick=async()=>{returnFocus=button;dialog.showModal();if(!image)await run(loadSaved);};}
})();

} catch(error) {console.error("Teacher module app/icon-settings.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/account-tools.js */
try {
/* Manage registrations on the existing lecturer panel, never in the student app. */
(()=>{
'use strict';const host=document.getElementById('teacherTools');if(!window.WA)return;let pending=false,query='';
async function remove(id){const s=await WA.get();if(s.profile?.role!=='teacher')return;const a=s.snapshot.registrations.find(x=>x.id===id);if(!a)return;const d=PresenUI.dialog('Hapus akun mahasiswa',`<p data-identity></p><p class="p-note">Hapus akun saja mempertahankan daftar dan catatan kelas. Pilihan di bawah hanya untuk membersihkan data percobaan pada kelas akun ini.</p><form><label><input type="checkbox" name="purge"> Hapus juga daftar, absensi dan nilai NIM ini pada kelas tersebut</label><label>Ketik NIM untuk konfirmasi<input name="confirmation" autocomplete="off" required></label><div class="p-actions"><button type="submit" class="p-danger">${PresenUI.icon('trash')}Hapus akun</button><button type="button" data-cancel>Batal</button></div><p role="status" aria-live="polite"></p></form>`);d.querySelector('[data-identity]').textContent=`${a.nama} · ${a.nim} · ${a.ctx.prodi} · semester ${a.ctx.semester} · kelas ${a.ctx.kelas}`;d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('form').onsubmit=async e=>{e.preventDefault();for(const b of d.querySelectorAll('button'))b.disabled=true;d.querySelector('[role=status]').textContent='Menyimpan perubahan dan menghapus akun…';try{const f=Object.fromEntries(new FormData(e.target));await WA.deleteAccount({account:a.id,purge:!!f.purge,confirmation:f.confirmation.trim().toUpperCase()});d.close();window.showToast?.('Akun dihapus. '+(f.purge?'Data NIM pada kelas tersebut dibersihkan.':'Catatan kelas dipertahankan.'),'success');}catch(error){d.querySelector('[role=status]').textContent=error.message;}finally{for(const b of d.querySelectorAll('button'))b.disabled=false;}};}
function render(){}
window.PresenAccounts={remove,render};
})();

} catch(error) {console.error("Teacher module app/account-tools.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/evidence.js */
try {
/* A single compressed photo, private storage, authenticated delivery and offline retry. */
(()=>{
'use strict';if(!window.WA)return;let flushing;
const MAX=220000,account=async()=>{const s=await WA.get();return s.profile?.account?.id;},key=(who,session)=>'evidence-local:'+who+':'+session;
async function compress(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024)throw Error('Pilih foto JPG, PNG, atau WEBP, maksimal 20 MB.');
 const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();if(img.naturalWidth<32||img.naturalHeight<32)throw Error('Foto terlalu kecil.');
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
  let blob;for(const quality of [.82,.68,.52,.38]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=MAX)break;}if(!blob||blob.size>MAX)throw Error('Foto masih terlalu besar. Pilih foto yang lebih sederhana.');
  const bytes=new Uint8Array(await blob.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''),image=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
  return {id:crypto.randomUUID(),hash,image,width:canvas.width,height:canvas.height,bytes:blob.size,uploaded:false,at:Date.now()};
 }finally{URL.revokeObjectURL(url);}
}
async function save(session,photo){const who=await account();if(!who)throw Error('Masuk sebagai mahasiswa terlebih dahulu.');await WA.change(()=>photo?{...photo,session,account:who}:null,key(who,session));await WA.change(value=>{const rows=(value||[]).filter(x=>x!==session);if(photo)rows.push(session);return rows.slice(-100);},'evidence-index:'+who);}
async function local(session){return WA.get(key(await account(),session));}
async function flush(){if(flushing)return flushing;return flushing=(async()=>{const s=await WA.get();if(!navigator.onLine||s.profile?.role!=='student'||!s.token||!s.profile.account.approved)return;const who=s.profile.account.id,items=await WA.get('evidence-index:'+who)||[];
 for(const session of items){const row=await WA.get(key(who,session));if(!row||row.uploaded||!row.ready)continue;try{const result=await WA.api('upload-evidence',{id:row.id,session,image:row.image},s.token);if((await WA.get()).profile?.account?.id!==who)return;if(result.hash!==row.hash)throw Error('Berkas foto belum cocok.');await WA.change(old=>old?.id===row.id?{...old,uploaded:true}:old,key(who,session));}catch(error){window.PresenEvidence.lastError=error.message;}}
 })().finally(()=>flushing=null);}
async function mount(form,session){if(!form||form.querySelector('[data-evidence]'))return;
 const box=document.createElement('div');box.dataset.evidence='';box.className='evidence-upload';box.innerHTML='<label>Foto bukti <span class="required-label">Wajib untuk sakit / izin</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-evidence-file></label><p class="small">Gunakan foto yang relevan. Hindari data medis atau orang lain yang tidak diperlukan.</p><div class="evidence-preview" hidden><img alt="Pratinjau foto bukti"><div class="p-actions"><button type="button" data-view-photo>Lihat foto</button><button type="button" data-remove-photo>Hapus foto</button></div></div><p role="status" aria-live="polite" class="small"></p>';form.querySelector('[type=submit],button.primary').before(box);
 let saving;const status=box.querySelector('[role=status]'),preview=box.querySelector('.evidence-preview'),input=box.querySelector('input'),reason=form.elements.reason;
 async function draw(){const row=await local(session.id);preview.hidden=!row;if(row)preview.querySelector('img').src=row.image;status.textContent=row?(row.uploaded?'Bukti tersimpan di server.':navigator.onLine?'Foto siap dikirim bersama keterangan.':'Foto tersimpan. Akan dikirim saat kembali online.'):'';}
 function toggle(){const required=form.elements.mark.value!=='.';box.hidden=!required;if(reason){reason.required=required;reason.closest('label').hidden=!required;}}
 input.onchange=()=>{saving=(async()=>{const file=input.files[0];if(!file)return;status.textContent='Menyiapkan foto…';try{await save(session.id,await compress(file));await draw();}catch(error){status.textContent=error.message;}finally{input.value='';}})();};
 box.querySelector('[data-view-photo]').onclick=async()=>{const row=await local(session.id);if(row)picture(row);};
 box.querySelector('[data-remove-photo]').onclick=async()=>{await save(session.id,null);await draw();};form.addEventListener('change',toggle);form._waitEvidence=()=>saving;toggle();await draw();
}
async function prepare(session,mark,form){await form?._waitEvidence?.();if(mark==='.')return [];if(form&&!form.elements.reason.value.trim())throw Error('Jelaskan alasan sakit atau izin sebelum mengirim.');const row=await local(session.id);if(!row)throw Error('Tambahkan satu foto bukti sebelum mengirim sakit atau izin.');await WA.change(old=>({...old,ready:true}),key(await account(),session.id));if(navigator.onLine)await flush();return [{id:row.id,hash:row.hash}];}
async function show(ref){const s=await WA.get(),who=s.profile?.account?.id;if(!who)throw Error('Masuk kembali untuk melihat foto.');let row=await WA.get('evidence-view:'+who+':'+ref.id);
 if((!row||row.hash!==ref.hash)&&s.profile.role==='student'){for(const session of await WA.get('evidence-index:'+who)||[]){const saved=await WA.get(key(who,session));if(saved?.id===ref.id&&saved.hash===ref.hash){row=saved;break;}}}
 if(!row||row.hash!==ref.hash){if(!navigator.onLine)throw Error('Foto belum tersimpan pada perangkat ini. Buka saat online.');row=await WA.api('read-evidence',{id:ref.id},s.token);if(row.hash!==ref.hash)throw Error('Foto bukti tidak sesuai dengan kiriman.');await WA.change(()=>row,'evidence-view:'+who+':'+ref.id);}
 return picture(row);
}
function picture(row){const d=PresenUI.dialog('Foto bukti','<p class="p-note">Lampiran pribadi dari mahasiswa, hanya untuk meninjau keterangan absensi.</p><img class="evidence-full" alt="Foto bukti dari mahasiswa"><div class="p-actions"><button type="button" data-photo-full>Layar penuh</button></div>');d.classList.add('p-screen-only','evidence-dialog');d.querySelector('img').src=row.image;d.querySelector('[data-photo-full]').onclick=()=>d.classList.toggle('p-evidence-fullscreen');return d;
}
window.PresenEvidence={compress,save,local,mount,prepare,flush,show,lastError:''};window.addEventListener('online',()=>void flush());WA.on(()=>void flush());
})();

} catch(error) {console.error("Teacher module app/evidence.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/locations.js */
try {
/* Location controls stay outside the attendance grid and outside every export. */
(()=>{
'use strict';if(!window.WA)return;
const body=document.getElementById('tbodySiswa'),paper=document.getElementById('paperSheet'),layer=document.createElement('div');layer.className='p-location-layer p-screen-only';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:20';if(paper&&body){paper.classList.add('p-location-host');paper.append(layer);}let pending=false;
function valid(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.accuracy)&&Number.isFinite(p.at)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&p.accuracy>=0;}
function metres(a,b){const rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon),h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
let googleLoading;
function googleMapLibrary(key){
 if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
 if(googleLoading)return googleLoading;
 googleLoading=new Promise((resolve,reject)=>{const callback='presenGoogleMapReady',script=document.createElement('script');let timer;const fail=()=>{clearTimeout(timer);delete window[callback];script.remove();googleLoading=null;reject(Error('Peta pilihan titik belum tersedia. Isi koordinat awal secara manual atau periksa Maps JavaScript API.'));};window[callback]=()=>{clearTimeout(timer);delete window[callback];resolve(window.google.maps);};const url=new URL('https://maps.googleapis.com/maps/api/js');url.search=new URLSearchParams({key,callback,loading:'async',v:'weekly'});script.src=url;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;timer=setTimeout(fail,15000);document.head.append(script);});
 return googleLoading;
}
let explorerLoading;
function explorerModule(){if(window.PresenMapExplorer)return Promise.resolve(window.PresenMapExplorer);if(explorerLoading)return explorerLoading;explorerLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('app/map-explorer.js',WA.ROOT).href;script.onload=()=>resolve(window.PresenMapExplorer);script.onerror=()=>{explorerLoading=null;reject(Error('Penjelajah tempat belum dapat dimuat.'));};document.head.append(script);});return explorerLoading;}
const addressFields=['formatted','road','village','district','city','province','postcode','country','rt','rw'];
function normalizeAddress(value){if(!value||typeof value!=='object'||typeof value.formatted!=='string'||!value.formatted.trim())return null;const out=Object.fromEntries(addressFields.filter(k=>typeof value[k]==='string'&&value[k].trim()).map(k=>[k,value[k].slice(0,k==='formatted'?800:160)]));for(const field of ['rt','rw']){const match=out.formatted.match(new RegExp('\\b'+field+'[.\\s:-]*(\\d{1,3})','i'));if(!out[field]&&match)out[field]=match[1];}return out;}
function addressText(address){const a=normalizeAddress(address);return a?a.formatted+((a.rt||a.rw)?' · RT '+(a.rt||'tidak tersedia')+' / RW '+(a.rw||'tidak tersedia'):' · RT/RW tidak tersedia dari penyedia peta'):'Alamat belum tersedia. Koordinat tetap tersimpan.';}
const addressPending=new Map();
async function address(p,lookup=false){
 if(!valid(p))return null;const own=normalizeAddress(p.address);if(own)return own;const state=await WA.get();if(state.profile?.role!=='teacher')return null;const owner=state.profile.account.id,key='location-address:'+owner,coordinate=p.lat.toFixed(6)+','+p.lon.toFixed(6),saved=await WA.get(key)||{},cached=normalizeAddress(saved[coordinate]);if(cached)return cached;if(!lookup||!navigator.onLine)return null;
 const pendingKey=owner+':'+coordinate;if(addressPending.has(pendingKey))return addressPending.get(pendingKey);
 const task=(async()=>{const config=await WA.api('maps-config');if(!config.javascriptKey)return null;const g=await googleMapLibrary(config.javascriptKey),result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Pencarian alamat melewati batas waktu. Koordinat tetap tersedia.')),8000);new g.Geocoder().geocode({location:{lat:p.lat,lng:p.lon}},(rows,status)=>{clearTimeout(timer);status==='OK'&&rows?.[0]?resolve(rows[0]):reject(Error('Alamat belum tersedia dari Google Maps.'));});});const part=type=>result.address_components?.find(x=>x.types.includes(type))?.long_name||'',out=normalizeAddress({formatted:result.formatted_address,road:[part('route'),part('street_number')].filter(Boolean).join(' '),village:part('administrative_area_level_4')||part('sublocality_level_1'),district:part('administrative_area_level_3')||part('locality'),city:part('administrative_area_level_2'),province:part('administrative_area_level_1'),postcode:part('postal_code'),country:part('country')});if(out&&(await WA.get()).profile?.account.id===owner){await WA.change(old=>Object.fromEntries([...Object.entries(old||{}).filter(([id])=>id!==coordinate),[coordinate,out]].slice(-200)),key);window.dispatchEvent(new Event('presen-address-resolved'));}return out;})().finally(()=>addressPending.delete(pendingKey));addressPending.set(pendingKey,task);return task;
}
async function show(nim,scope,context,slot){
 window.PresenWorkspace?.close();const s=await WA.get();if(s.profile?.role!=='teacher')return;
 const params=Object.fromEntries(new URLSearchParams(location.search)),ctx=WA.ctx(context||{...s.selection,...params}),student=s.snapshot.roster.find(x=>x.nim===nim&&WA.sameCtx(x,ctx));
 const marks=s.snapshot.marks.filter(x=>x.nim===nim&&x.scope===scope&&valid(x.location)).sort((a,b)=>b.location.at-a.location.at);
 const d=PresenUI.dialog('Lokasi saat absensi','<p class="p-location-name"></p><p class="p-note">Titik mahasiswa dicatat saat mengirim absen. Rute berawal dari lokasi perangkat dosen saat ini, bukan lokasi langsung mahasiswa.</p><div class="p-map-toolbar"><label>Pertemuan<select id="pMapMeeting"></select></label><button type="button" id="pMapFullscreen" aria-pressed="false">'+PresenUI.icon('expand')+'Layar penuh</button></div><div class="p-map-route-controls"><button type="button" id="pMapRoute">Perbarui lokasi saya</button><label class="p-map-auto"><input type="checkbox" id="pMapAuto" checked> Rute otomatis dari lokasi saya</label><label>Perjalanan<select id="pMapTravel"><option value="driving">Mobil / kendaraan</option><option value="walking">Jalan kaki</option><option value="bicycling">Sepeda</option><option value="transit">Transportasi umum</option></select></label></div><div class="p-map-summary"></div><p class="p-map-place" role="status"></p><p class="p-map-origin" role="status" hidden></p><div class="p-map-frame"><iframe title="Peta lokasi saat absensi di Google Maps" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms" allowfullscreen></iframe><div class="p-route-map" aria-label="Pilih lokasi awal pada Google Maps" hidden></div></div><form class="p-map-manual" hidden><p>Opsi lanjutan jika GPS dosen tidak sesuai: pilih titik pada peta atau isi koordinat awal. Untuk penggunaan biasa, gunakan rute otomatis. Lokasi absensi mahasiswa tidak diubah.</p><label>Lintang awal<input name="lat" type="number" step="any" min="-90" max="90" required></label><label>Bujur awal<input name="lon" type="number" step="any" min="-180" max="180" required></label><button type="submit">Gunakan koordinat awal</button></form><p class="p-map-status" role="status"></p><div class="p-map-actions"><a class="p-map-link" rel="noopener noreferrer">'+PresenUI.icon('pin')+'Lokasi target (mahasiswa)</a><button type="button" id="pMapExplore">Jelajahi tempat &amp; foto</button><button type="button" id="pMapReset">Reset peta</button><button type="button" id="pMapStreet">360° · Street View</button><button type="button" id="pMapManual">Lokasi awal lain (opsional)</button><button type="button" id="pMapRetry">Muat ulang peta</button><button type="button" id="pMapConfirm" hidden>Gunakan titik ini</button></div>');
 d.classList.add('p-screen-only','p-map-dialog');d.querySelector('.p-location-name').textContent=(student?.nama||nim)+' · '+nim;
 const select=d.querySelector('#pMapMeeting'),iframe=d.querySelector('iframe'),status=d.querySelector('.p-map-status'),link=d.querySelector('.p-map-link'),mapElement=d.querySelector('.p-route-map'),originLabel=d.querySelector('.p-map-origin'),confirm=d.querySelector('#pMapConfirm'),routeButton=d.querySelector('#pMapRoute'),manualForm=d.querySelector('.p-map-manual'),auto=d.querySelector('#pMapAuto');
 let explorer=null;let map,marker,mapListener,origin,mode='point',requestId=0,key='',javascriptKey='',placeId=0,watchId=null,configReady=false,lastRoutePoint=null,lastRouteAt=0,confirmedFarPoint=null;
 const current=()=>marks.find(m=>String(m.slot)===select.value)?.location;
 const coordinates=p=>p.lat+','+p.lon;
 const embed=(type,fields)=>{const url=new URL('https://www.google.com/maps/embed/v1/'+type);url.search=new URLSearchParams({key,...fields});return url.href;};
 const pointURL=p=>key?embed('place',{q:coordinates(p),zoom:'16'}):'https://www.google.com/maps?q='+encodeURIComponent(coordinates(p))+'&z=16&output=embed';
 function stopWatch(){if(watchId!==null){navigator.geolocation?.clearWatch(watchId);watchId=null;}}
 function cancel(){stopWatch();requestId++;explorer?.dispose();explorer=null;routeButton.disabled=false;confirm.hidden=true;manualForm.hidden=true;}
 function frame(){mapElement.hidden=true;iframe.hidden=!navigator.onLine;}
 function describeOrigin(){originLabel.hidden=false;originLabel.textContent='Dosen (awal): '+origin.lat.toFixed(5)+', '+origin.lon.toFixed(5)+(origin.manual?' · dipilih manual':' · GPS ±'+Math.round(origin.accuracy)+' m')+' → Mahasiswa (tujuan): '+current().lat.toFixed(5)+', '+current().lon.toFixed(5);}
 function needsKey(){status.textContent='Rute dan panorama Google dalam jendela belum diaktifkan. Administrator perlu memasukkan kunci Maps Embed API pada Tampilan → Google Maps. Koordinat tersimpan tetap tersedia.';}
 async function place(p){const id=++placeId;try{const result=await address(p,!!javascriptKey);if(id===placeId&&d.open)d.querySelector('.p-map-place').textContent=result?addressText(result):'Alamat rinci belum tersedia. Koordinat absen tetap akurat sesuai GPS; RT/RW tidak ditebak.';}catch(_){if(id===placeId&&d.open)d.querySelector('.p-map-place').textContent='Alamat belum dapat dimuat. Koordinat absen tetap tersedia.';}}
 function update(){cancel();const p=current();if(!p)return;mode='point';origin=null;lastRoutePoint=null;confirmedFarPoint=null;originLabel.hidden=true;d.querySelector('.p-map-summary').textContent=new Date(p.at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB · akurasi ±'+Math.round(p.accuracy)+' m · '+(Number.isFinite(p.battery)?'Baterai '+p.battery+'% · ':'Baterai tidak tersedia · ')+p.lat.toFixed(5)+', '+p.lon.toFixed(5);d.querySelector('.p-map-place').textContent='Alamat dan wilayah ditampilkan pada peta Google sesuai koordinat absen.';link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coordinates(p));void place(p);frame();if(navigator.onLine){iframe.title='Peta titik mahasiswa di Google Maps';iframe.src=pointURL(p);status.textContent='Titik mahasiswa sesuai koordinat tersimpan. Pilih Rute atau 360° untuk mengganti tampilan.';}else{iframe.removeAttribute('src');status.textContent='Sedang offline. Koordinat tersimpan tetap tersedia; peta dan rute memerlukan internet.';}if(auto.checked&&configReady)startAuto();}
 function drawRoute(){lastRoutePoint=origin&&{...origin};lastRouteAt=Date.now();confirm.hidden=true;manualForm.hidden=true;mode='route';describeOrigin();const destination=current(),distance=metres(origin,destination);frame();if(distance<=Math.max(30,origin.accuracy+destination.accuracy)){iframe.src=pointURL(destination);status.textContent='Kedua titik berada di lokasi yang sama atau berdekatan ('+Math.round(distance)+' m). Selisih ini masih dalam perkiraan akurasi GPS; tidak perlu rute jalan.';return;}if(!key){iframe.src=pointURL(destination);needsKey();return;}iframe.title='Rute Google dari lokasi dosen ke lokasi mahasiswa';iframe.src=embed('directions',{origin:coordinates(origin),destination:coordinates(destination),mode:d.querySelector('#pMapTravel').value});status.textContent='Rute Google: dosen → mahasiswa. Jalur, jarak jalan dan perkiraan waktu tempuh ditampilkan pada panel Google di peta ini. Perkiraan mengikuti jenis perjalanan dan ketersediaan layanan Google.';}
 link.onclick=e=>{e.preventDefault();auto.checked=false;update();};for(const m of marks){const option=document.createElement('option');option.value=String(m.slot);option.textContent='Pertemuan '+m.slot;select.append(option);}
 function gpsPoint(position){const c=position.coords,p={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,at:position.timestamp};if(!valid(p)||Date.now()-p.at>60000||p.at>Date.now()+10000)throw Error('Lokasi perangkat sudah lama atau tidak valid.');if(p.accuracy>200)throw Error('Lokasi perangkat kurang teliti (±'+Math.round(p.accuracy)+' m).');return p;}
 function acceptGPS(position,automatic=false){
  const p=gpsPoint(position);origin=p;describeOrigin();
  if(metres(p,current())>100000&&(!confirmedFarPoint||metres(p,confirmedFarPoint)>1000)){status.textContent='Titik awal lebih dari 100 km dari mahasiswa. Periksa koordinat GPS sebelum memakai rute, atau pilih titik awal yang benar di peta.';confirm.hidden=false;return;}
  confirm.hidden=true;
  if(!automatic||!lastRoutePoint||Date.now()-lastRouteAt>=15000&&metres(p,lastRoutePoint)>=30)drawRoute();
 }
 function gpsError(error){if(!d.open)return;if(!origin)originLabel.hidden=true;status.textContent=(error.code===1?'Izin lokasi dosen belum diberikan. Izinkan lokasi untuk situs ini melalui pengaturan browser.':error.message||'Lokasi awal belum tersedia.')+' Aktifkan GPS lalu tekan Perbarui lokasi saya.';if(error.code===1){stopWatch();auto.checked=false;}}
 function startAuto(){
  if(!configReady||!auto.checked||!d.open||!current()||document.hidden)return;
  if(!navigator.onLine){status.textContent='Rute memerlukan internet. Lokasi absensi mahasiswa tetap tersimpan.';return;}
  const needsConfirm=!confirm.hidden;cancel();confirm.hidden=!needsConfirm;mode=origin?'route':'auto';frame();const id=requestId;if(!origin)status.textContent='Mendeteksi lokasi dosen… Izinkan akses lokasi saat browser meminta.';
  if(!navigator.geolocation){gpsError(Error('Lokasi perangkat tidak didukung.'));return;}
  watchId=navigator.geolocation.watchPosition(position=>{if(id!==requestId||!d.open||!auto.checked||document.hidden)return;try{acceptGPS(position,true);}catch(error){gpsError(error);}},error=>{if(id===requestId)gpsError(error);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 }
 routeButton.onclick=async()=>{if(!current()||!navigator.onLine){status.textContent='Rute memerlukan internet.';return;}auto.checked=true;cancel();mode='point';frame();iframe.src=pointURL(current());const id=requestId;routeButton.disabled=true;status.textContent='Meminta lokasi GPS baru dari perangkat dosen…';try{if(!navigator.geolocation)throw Error('Lokasi perangkat tidak didukung.');const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));if(id!==requestId||!d.open)return;acceptGPS(position);startAuto();}catch(error){if(id===requestId&&d.open)gpsError(error);}finally{if(d.open)routeButton.disabled=false;}};
 auto.onchange=()=>{if(auto.checked)startAuto();else{stopWatch();requestId++;status.textContent='Pembaruan posisi dosen dihentikan. Titik absensi mahasiswa tidak berubah.';}};
 const visibility=()=>{if(document.hidden){stopWatch();requestId++;}else if(auto.checked)startAuto();};
 const connection=()=>{if(navigator.onLine){if(auto.checked)startAuto();}else{stopWatch();requestId++;frame();status.textContent='Sedang offline. Rute memerlukan internet; koordinat absensi tetap tersimpan.';}};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('online',connection);window.addEventListener('offline',connection);
 d.querySelector('#pMapManual').onclick=async()=>{auto.checked=false;cancel();if(!current()||!navigator.onLine){status.textContent='Pemilihan titik memerlukan internet.';return;}mode='manual';manualForm.hidden=false;origin=null;originLabel.hidden=true;const id=requestId,p=current();manualForm.elements.lat.value='';manualForm.elements.lon.value='';if(!javascriptKey){status.textContent='Mode Maps Embed gratis: isi koordinat awal di bawah, atau gunakan Perbarui lokasi saya untuk GPS otomatis. Pemilihan titik dengan mengetuk peta memerlukan layanan tambahan yang dapat berbayar dan tidak diaktifkan otomatis.';return;}try{const g=await googleMapLibrary(javascriptKey);if(id!==requestId||!d.open)return;iframe.hidden=true;mapElement.hidden=false;if(!map){map=new g.Map(mapElement,{center:{lat:p.lat,lng:p.lon},zoom:16,streetViewControl:false});marker=new g.Marker({position:{lat:p.lat,lng:p.lon},map,title:'Mahasiswa · titik absen'});mapListener=map.addListener('click',event=>{const lat=event.latLng.lat(),lon=event.latLng.lng();manualForm.elements.lat.value=lat;manualForm.elements.lon.value=lon;status.textContent='Titik awal dipilih. Tekan Gunakan koordinat awal untuk melihat rute.';});}else{map.setCenter({lat:p.lat,lng:p.lon});marker.setPosition({lat:p.lat,lng:p.lon});}status.textContent='Ketuk peta Google untuk memilih lokasi dosen sebagai titik awal.';}catch(error){if(id===requestId&&d.open)status.textContent=error.message;}};
 manualForm.onsubmit=e=>{e.preventDefault();const p={lat:Number(manualForm.elements.lat.value),lon:Number(manualForm.elements.lon.value),accuracy:0,at:Date.now(),manual:true};if(!manualForm.checkValidity()||!valid(p)){status.textContent='Isi lintang dan bujur awal yang valid.';return;}origin=p;drawRoute();};confirm.onclick=()=>{confirmedFarPoint={...origin};drawRoute();};
 d.querySelector('#pMapStreet').onclick=()=>{auto.checked=false;cancel();if(explorer){explorer.street();return;}const p=current();if(!p||!navigator.onLine){status.textContent='Panorama 360° memerlukan internet.';return;}mode='street';frame();if(!key){needsKey();return;}iframe.title='Panorama 360 derajat di sekitar titik mahasiswa';iframe.src=embed('streetview',{location:coordinates(p),radius:'500',source:'outdoor'});status.textContent='Panorama jalan terdekat dicari hingga 500 m di sekitar titik absen. Ketersediaannya mengikuti cakupan Street View Google.';};
 d.querySelector('#pMapExplore').onclick=async()=>{auto.checked=false;cancel();if(!current()||!navigator.onLine){status.textContent='Detail tempat dan foto memerlukan internet.';return;}if(!javascriptKey){status.textContent='Penjelajahan tempat memerlukan kunci Maps JavaScript dan Places API (New) pada Tampilan → Google Maps → Layanan tambahan. Layanan ini memiliki tarif/kuota tersendiri. Mode Embed tetap tersedia; layanan berbayar tidak diaktifkan otomatis.';return;}const id=requestId;mode='explore';status.textContent='Memuat peta interaktif tempat…';try{const [g,module]=await Promise.all([googleMapLibrary(javascriptKey),explorerModule()]);if(id!==requestId||!d.open)return;iframe.hidden=true;mapElement.hidden=false;const instance=await module.mount({host:mapElement,g,target:current(),name:student?.nama||nim,onStatus:text=>{if(id===requestId&&d.open)status.textContent=text;}});if(id!==requestId||!d.open)instance.dispose();else explorer=instance;}catch(error){if(id===requestId&&d.open){frame();status.textContent=error.message;}}};
 d.querySelector('#pMapReset').onclick=()=>{auto.checked=true;manualForm.reset();d.querySelector('#pMapTravel').value='driving';d.querySelector('.p-map-frame').scrollTop=0;update();};
 d.querySelector('#pMapTravel').onchange=()=>{if(mode==='route'&&origin)drawRoute();};select.onchange=update;d.querySelector('#pMapRetry').onclick=()=>{if(mode==='route'&&origin)drawRoute();else if(mode==='street')d.querySelector('#pMapStreet').click();else if(mode==='explore')d.querySelector('#pMapExplore').click();else update();};
 const fullscreen=d.querySelector('#pMapFullscreen');fullscreen.onclick=()=>{const active=d.classList.toggle('p-map-fullscreen');fullscreen.setAttribute('aria-pressed',String(active));fullscreen.innerHTML=PresenUI.icon('expand')+(active?'Ukuran normal':'Layar penuh');};
 if(slot&&marks.some(x=>x.slot===slot))select.value=String(slot);if(marks.length)update();else{select.disabled=true;iframe.hidden=true;link.hidden=true;status.textContent='Lokasi tidak tersedia untuk mahasiswa ini.';for(const b of d.querySelectorAll('.p-map-actions button'))b.disabled=true;}
 const resetDialog=()=>d.close();window.addEventListener('wa-global-reset',resetDialog);
 d.addEventListener('close',()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('wa-global-reset',resetDialog);cancel();placeId++;mapListener?.remove();marker?.setMap(null);iframe.removeAttribute('src');});
 try{const config=await WA.api('maps-config');key=config.embedKey||'';javascriptKey=config.javascriptKey||'';}catch(_){}configReady=true;if(d.open&&mode==='point')update();
}
async function render(){
 pending=false;if(!body||!paper||matchMedia('print').matches)return;
 if(!window.PresenUI||!window.WASheetReady)return;const s=await WA.get();if(s.profile?.role!=='teacher')return;
 const params=Object.fromEntries(new URLSearchParams(location.search)),ctx=WA.ctx({...s.selection,...params}),scope=await WA.scope(ctx,params.matkul??s.selection?.matkul??''),used=new Set(),availableNims=new Set(s.snapshot.marks.filter(m=>m.scope===scope&&valid(m.location)).map(m=>m.nim)),buttons=new Map([...layer.children].map(b=>[b.dataset.nim,b]));
 const pr=paper.getBoundingClientRect(),scale=pr.width/paper.offsetWidth||1;
 // Old saved sheets may still carry the row-number positioning class. A location
 // control must never change a grid cell's containing block, including in print.
 body.querySelectorAll('.p-location-row-number').forEach(cell=>cell.classList.remove('p-location-row-number'));
 for(const row of body.querySelectorAll('tr:not(.page-preview-only)')){
  const nim=row.cells[1]?.querySelector('input')?.value,cell=row.cells[2],input=cell?.querySelector('.name-input');if(!cell||!input)continue;
  const available=availableNims.has(nim);input.classList.toggle('p-location-name-input',available);if(!available)continue;
  used.add(nim);let b=buttons.get(nim);
  if(!b){b=document.createElement('button');b.type='button';b.dataset.nim=nim;b.className='p-location-icon p-screen-only';b.innerHTML=PresenUI.icon('pin');b.style.pointerEvents='auto';layer.append(b);}
  const name=input.value||nim;b.setAttribute('aria-label','Lihat lokasi absensi '+name);b.title='Lihat lokasi absensi '+name;
  const r=cell.getBoundingClientRect(),size=Math.max(8,Math.min(18,r.height/scale-4));
  b.style.setProperty('--location-size',size+'px');b.style.left=((r.right-pr.left)/scale-size-3)+'px';b.style.right='auto';b.style.top=((r.top+r.height/2-pr.top)/scale)+'px';
  b.onclick=e=>{e.stopPropagation();void show(nim,scope);};
 }
 for(const b of [...layer.children])if(!used.has(b.dataset.nim))b.remove();
}

function schedule(){if(!pending){pending=true;requestAnimationFrame(()=>void render());}}
if(body&&paper){new MutationObserver(schedule).observe(body,{childList:true,subtree:true});WA.on(schedule);window.addEventListener('presen-ui-ready',schedule);window.addEventListener('resize',schedule);window.addEventListener('afterprint',schedule);window.addEventListener('scroll',schedule,true);new ResizeObserver(schedule).observe(paper);new MutationObserver(schedule).observe(paper,{attributes:true,attributeFilter:['style','class']});setTimeout(schedule,500);}window.PresenLocations={render,valid,open:show,address,addressText,normalizeAddress};
})();

} catch(error) {console.error("Teacher module app/locations.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/inbox.js */
try {
/* One account-scoped message centre on every lecturer page. */
(()=>{
'use strict';if(!window.WA||document.getElementById('main'))return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dialog,launcher,rendering=false,again=false,seen=new Set(),account='',events=[],dragged=false,popup;
let audio,outputGain,settings={enabled:true,volume:40},soundMessage='',pendingSound=false,lastSoundAt=-Infinity,arrivalReady=false,announced=new Set();
const soundKey=()=> 'presen-inbox-sound-'+account;
function readSound(){try{const value=JSON.parse(localStorage.getItem(soundKey())||'null');return{enabled:value?.enabled!==false,volume:Number.isFinite(Number(value?.volume))&&value?.volume!=null?Math.max(0,Math.min(100,Number(value.volume))):40};}catch(_){return{enabled:true,volume:40};}}
function soundUI(message){if(message!==undefined)soundMessage=message;if(!dialog?.open)return;const box=dialog.querySelector('[data-sound-settings]');if(!box)return;box.querySelector('[data-sound-enabled]').checked=settings.enabled;box.querySelector('[data-sound-volume]').value=settings.volume;box.querySelector('output').textContent=settings.volume+'%';box.querySelector('[data-sound-status]').textContent=soundMessage||(!settings.enabled||settings.volume===0?'Suara notifikasi dimatikan.':audio?.state==='running'?'Suara siap untuk absensi dan pesan baru.':'Tekan Coba suara untuk mengaktifkan bunyi pada browser ini.');}
function saveSound(){try{localStorage.setItem(soundKey(),JSON.stringify(settings));}catch(_){}pendingSound=false;if(outputGain)outputGain.gain.setTargetAtTime(settings.enabled?settings.volume/100:0,audio.currentTime,.01);soundUI(settings.enabled&&settings.volume>0?'Volume notifikasi disimpan.':'Suara notifikasi dimatikan.');}
function sound(test=false){
 if(!settings.enabled||settings.volume===0)return false;
 if(!audio||audio.state!=='running'){pendingSound=!test;soundUI();return false;}
 const now=performance.now();if(!test&&now-lastSoundAt<1200)return false;lastSoundAt=now;pendingSound=false;
 try{const start=audio.currentTime+.015,peak=.14;for(const [frequency,delay,weight]of [[783.99,0,.8],[1046.5,.11,1]]){const o=audio.createOscillator(),g=audio.createGain(),t=start+delay;o.type='sine';o.frequency.setValueAtTime(frequency,t);o.connect(g);g.connect(outputGain);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(peak*weight,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.22);o.start(t);o.stop(t+.23);o.onended=()=>{o.disconnect();g.disconnect();};}return true;}catch(_){soundUI('Suara belum dapat diputar. Tekan Coba suara untuk mencoba lagi.');return false;}
}
async function activateSound(){
 if(!account)return false;try{const C=window.AudioContext||window.webkitAudioContext;if(!C){soundUI('Browser ini belum mendukung suara notifikasi.');return false;}if(!audio||audio.state==='closed'){audio=new C();outputGain=audio.createGain();outputGain.gain.setValueAtTime(settings.enabled?settings.volume/100:0,audio.currentTime);outputGain.connect(audio.destination);}if(audio.state==='suspended')await audio.resume();if(pendingSound)sound();soundUI();return audio.state==='running';}catch(_){soundUI('Tekan Coba suara untuk mengaktifkan bunyi pada browser ini.');return false;}
}
function wireSound(){
 dialog.querySelector('[data-audio-settings]').onclick=()=>{const panel=dialog.querySelector('.p-inbox-sound');panel.open=!panel.open;if(panel.open)panel.scrollIntoView({block:'nearest'});};
 dialog.querySelector('[data-sound-enabled]').onchange=e=>{settings.enabled=e.target.checked;saveSound();};
 dialog.querySelector('[data-sound-volume]').oninput=e=>{settings.volume=Math.max(0,Math.min(100,Number(e.target.value)||0));saveSound();};
 dialog.querySelector('[data-sound-test]').onclick=async()=>{pendingSound=false;if(!settings.enabled||!settings.volume){soundUI('Aktifkan suara dan naikkan volume untuk mencoba.');return;}if(await activateSound()){sound(true);soundUI('Contoh suara diputar pada volume '+settings.volume+'%.');}};soundUI();
}
function attendanceRows(s){
 const sessions=new Map(),people=new Map(),unique=new Map();
 for(const x of s.snapshot.sessions){sessions.set(x.id,x);sessions.set(x.scope+':'+x.slot,x);}
 for(const x of s.snapshot.roster){const list=people.get(x.nim)||[];list.push(x);people.set(x.nim,list);}
 for(const m of s.snapshot.marks){
  if(!['.','S','I'].includes(m.mark)||!/^(qr|face)(-|$)/.test(m.source||''))continue;
  const session=sessions.get(m.session_id)||sessions.get(m.scope+':'+m.slot),ctx=session?.ctx||m.ctx,student=people.get(m.nim)?.find(x=>!ctx||WA.sameCtx(x,ctx)),key='attendance:'+m.scope+':'+m.slot+':'+m.nim+':'+(m.session_id||'')+':'+(session?.version||0),old=unique.get(key);
  if(!old||Number(m.recorded_at||0)>Number(old.recorded_at||0))unique.set(key,{...m,ctx,name:student?.nama||m.nim,course:session?.matkul||'',key});
 }
 return [...unique.values()].sort((a,b)=>Number(b.recorded_at||0)-Number(a.recorded_at||0));
}
function announce(current,deliveries){
 const key='presen-inbox-announced-'+account;
 if(!arrivalReady){arrivalReady=true;try{announced=new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch(_){announced=new Set();}current.forEach(x=>announced.add(x));return;}
 const arrived=current.filter(x=>!announced.has(x));current.forEach(x=>announced.add(x));try{localStorage.setItem(key,JSON.stringify([...announced].slice(-4000)));}catch(_){}
 if(!arrived.length)return;const arrivedKeys=new Set(arrived),received=deliveries.filter(m=>arrivedKeys.has(m.key)),count=arrived.length;
 const message=received.length===count?count+' absensi mahasiswa diterima.':count+' pesan atau absensi baru.';
 sound();showPopup(count,received.length===count?'Absensi masuk':'Pesan baru',message);
}
function userSoundGesture(e){if(e.isTrusted&&settings.enabled&&settings.volume>0&&!e.target.closest('[data-sound-enabled],[data-sound-volume]'))void activateSound();}
window.addEventListener('pointerdown',userSoundGesture,{capture:true});window.addEventListener('keydown',userSoundGesture,{capture:true});window.addEventListener('pagehide',e=>{if(!e.persisted)void audio?.close();});
window.addEventListener('storage',e=>{if(e.key===soundKey()){settings=readSound();soundUI();}});
function registrationIdentity(x){
 const stamp=Number(x.created_at),date=new Date(stamp);
 const registered=stamp>0&&Number.isFinite(date.getTime())?`<time class="p-registration-date" datetime="${date.toISOString()}">Tanggal daftar: ${date.toLocaleDateString('id-ID')}</time>`:'';
 return `<div class="p-registration-identity"><b>${E(x.nama)} · <span class="p-registration-nim">${E(x.nim)}</span></b>${registered}</div>`;
}
function readSeen(){try{return new Set(JSON.parse(localStorage.getItem('presen-inbox-seen-'+account)||'[]'));}catch(_){return new Set();}}
function markSeen(){events.forEach(x=>seen.add(x));localStorage.setItem('presen-inbox-seen-'+account,JSON.stringify([...seen].slice(-2000)));}
function drag(el,handle=el){let start;handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')&&handle!==el)return;if(e.button!==0)return;const r=el.getBoundingClientRect();start={x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);});handle.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)<6)return;dragged=true;el.style.margin='0';el.style.right='auto';el.style.bottom='auto';el.style.left=Math.max(8,Math.min(innerWidth-el.offsetWidth-8,start.left+dx))+'px';el.style.top=Math.max(8,Math.min(innerHeight-el.offsetHeight-8,start.top+dy))+'px';});handle.addEventListener('pointerup',()=>{if(start&&el===launcher&&dragged)localStorage.setItem('presen-inbox-position',JSON.stringify({left:el.style.left,top:el.style.top}));start=null;setTimeout(()=>dragged=false,0);});handle.addEventListener('pointercancel',()=>start=null);}
function dock(){if(!launcher||localStorage.getItem('presen-inbox-position'))return;const w=launcher.offsetWidth,h=launcher.offsetHeight,candidates=[{x:innerWidth-w-12,y:innerHeight-h-12},{x:12,y:innerHeight-h-12},{x:innerWidth-w-12,y:innerHeight-h-90},{x:12,y:innerHeight-h-90}];const controls=[...document.querySelectorAll('button,a,input,select,textarea,#inspectorPanel,.wa-guide-dock')].filter(e=>e!==launcher&&!launcher.contains(e)&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');const score=p=>controls.reduce((n,e)=>{const q=e.getBoundingClientRect();return n+Math.max(0,Math.min(p.x+w+6,q.right)-Math.max(p.x-6,q.left))*Math.max(0,Math.min(p.y+h+6,q.bottom)-Math.max(p.y-6,q.top));},0);candidates.sort((a,b)=>score(a)-score(b));launcher.style.left=candidates[0].x+'px';launcher.style.top=Math.max(8,candidates[0].y)+'px';launcher.style.right='auto';launcher.style.bottom='auto';}
function mount(){if(launcher||!window.PresenUI)return;launcher=document.createElement('button');launcher.id='presenInboxLauncher';launcher.className='p-inbox-launcher p-screen-only';launcher.type='button';launcher.setAttribute('aria-label','Pesan mahasiswa');launcher.innerHTML=PresenUI.icon('bell')+'<span class="p-inbox-badge" hidden></span>';launcher.onclick=()=>{if(!dragged)void open();};document.body.append(launcher);try{const p=JSON.parse(localStorage.getItem('presen-inbox-position')||'null');if(p){launcher.style.left=p.left;launcher.style.top=p.top;launcher.style.right='auto';launcher.style.bottom='auto';}}catch(_){}drag(launcher);requestAnimationFrame(dock);setTimeout(dock,500);}
function showPopup(count,title='Pesan baru',message=count+' pesan memerlukan perhatian'){popup?.remove();popup=document.createElement('div');popup.className='p-inbox-popup p-screen-only';popup.innerHTML='<span aria-hidden="true">✉</span><div><b>Pesan baru</b><small></small></div><button type="button" data-open>Buka</button><button type="button" data-close aria-label="Tutup pemberitahuan">×</button>';popup.querySelector('b').textContent=title;popup.querySelector('small').textContent=message;popup.querySelector('[data-open]').onclick=()=>{popup.remove();void open();};popup.querySelector('[data-close]').onclick=()=>popup.remove();document.body.append(popup);setTimeout(()=>{if(popup?.isConnected)popup.remove();},6500);}
function filterRows(){if(!dialog?.open)return;const term=dialog.querySelector('[data-search]').value.trim().toLocaleLowerCase('id-ID');dialog.querySelectorAll('.p-notice-row').forEach(row=>row.hidden=!!term&&!row.textContent.toLocaleLowerCase('id-ID').includes(term));}
async function open(){mount();if(dialog?.open){dialog.focus();return;}const s=await WA.get();if(s.profile?.role!=='teacher')return;dialog=PresenUI.dialog('Pesan mahasiswa','<div class="p-inbox-tools"><span data-connection></span><button type="button" data-sync>Sinkronkan</button><button type="button" data-expand>Layar penuh</button><button type="button" data-no-click-sound data-audio-settings>Suara</button></div><p class="p-note">Kotak masuk akun dosen ini. Keputusan saat offline dikirim setelah tersambung.</p><details class="p-inbox-sound"><summary>Suara notifikasi</summary><div class="p-inbox-sound-settings" data-no-click-sound data-sound-settings><label class="p-sound-enabled"><input type="checkbox" data-sound-enabled> Bunyi untuk absensi dan pesan baru</label><label class="p-sound-volume">Volume <output for="pInboxVolume">40%</output><input id="pInboxVolume" type="range" min="0" max="100" step="5" value="40" data-sound-volume aria-label="Volume notifikasi"></label><button type="button" data-sound-test>Coba suara</button><p data-sound-status aria-live="polite"></p></div></details><div class="p-mail-layout"><nav aria-label="Folder pesan"><button type="button" data-folder="inbox" aria-current="true">Kotak masuk</button><button type="button" data-folder="registration">Pendaftaran</button><button type="button" data-folder="review">Sakit & izin</button><button type="button" data-folder="accounts">Akun mahasiswa</button><button type="button" data-folder="attendance">Absensi masuk</button></nav><section><label class="p-mail-search">Cari pesan<input type="search" data-search placeholder="Nama, NIM, atau mata kuliah"></label><div data-inbox-content data-folder="inbox"></div></section></div><p role="status" aria-live="polite"></p>');dialog.id='presenInboxDialog';dialog.classList.add('p-inbox-dialog','p-screen-only');drag(dialog,dialog.querySelector('h2'));dialog.querySelector('[data-sync]').onclick=async()=>{await WA.sync();dialog.querySelector('[role=status]').textContent=WA.lastError||'Pesan diperbarui.';await render();};dialog.querySelector('[data-expand]').onclick=e=>{const full=dialog.classList.toggle('p-inbox-fullscreen');dialog.removeAttribute('style');e.target.textContent=full?'Ukuran normal':'Layar penuh';};dialog.querySelectorAll('.p-mail-layout nav [data-folder]').forEach(button=>button.onclick=()=>{dialog.querySelectorAll('.p-mail-layout nav [data-folder]').forEach(b=>b.removeAttribute('aria-current'));button.setAttribute('aria-current','true');dialog.querySelector('[data-inbox-content]').dataset.folder=button.dataset.folder;});dialog.querySelector('[data-search]').oninput=filterRows;wireSound();dialog.addEventListener('close',()=>dialog=null);await render();markSeen();await render();}
async function action(type,id,decision){const s=await WA.get(),a=s.snapshot.registrations.find(x=>x.id===id),m=s.snapshot.marks.find(x=>x.scope+':'+x.slot+':'+x.nim===id),session=m&&s.snapshot.sessions.find(x=>x.scope===m.scope);try{if(type==='remove'){await PresenAccounts.remove(id);return;}if(type==='review'&&session)await WA.queue({type:'review',ctx:session.ctx,matkul:session.matkul,slot:m.slot,nim:m.nim,mark:decision==='rejected'?'A':m.mark,decision,baseRevision:m.revision});else if(a)await WA.queue({type,account:id});await WA.sync();if(dialog)dialog.querySelector('[role=status]').textContent=WA.lastError||'Keputusan disimpan. Mahasiswa menerima pembaruan saat online.';await render();}catch(error){if(dialog)dialog.querySelector('[role=status]').textContent=error.message;}}
async function render(){if(rendering){again=true;return;}rendering=true;try{const s=await WA.get();if(s.profile?.role!=='teacher'){if(launcher)launcher.hidden=true;account='';arrivalReady=false;pendingSound=false;if(outputGain)outputGain.gain.setTargetAtTime(0,audio.currentTime,.01);dialog?.close();return;}mount();if(!launcher)return;launcher.hidden=false;const next=s.profile.account.id||'admin_01',switched=account!==next;if(switched){account=next;seen=readSeen();settings=readSound();soundMessage='';pendingSound=false;arrivalReady=false;lastSoundAt=-Infinity;if(outputGain)outputGain.gain.setTargetAtTime(settings.enabled?settings.volume/100:0,audio.currentTime,.01);}
 const regs=s.snapshot.registrations.filter(x=>!x.approved&&x.approval_status!=='rejected'),pending=s.snapshot.marks.filter(x=>['S','I'].includes(x.mark)&&x.review_status==='pending'),deliveries=attendanceRows(s),recent=deliveries.slice(0,100),studentReviews=new Set(deliveries.map(m=>m.scope+':'+m.slot+':'+m.nim));
 if(switched)recent.forEach(x=>seen.add(x.key));
 events=[...regs.map(x=>'registration:'+x.id),...pending.filter(m=>!studentReviews.has(m.scope+':'+m.slot+':'+m.nim)).map(x=>'review:'+x.scope+':'+x.slot+':'+x.nim+':'+x.revision),...recent.map(m=>m.key)];
 const unread=events.filter(x=>!seen.has(x)).length,badge=launcher.querySelector('.p-inbox-badge');badge.hidden=unread===0;badge.textContent=unread>99?'99+':String(unread);launcher.setAttribute('aria-label','Pesan mahasiswa'+(unread?' · '+unread+' belum dibaca':''));
 announce([...events.filter(x=>!x.startsWith('attendance:')),...deliveries.map(m=>m.key)],deliveries);soundUI();if(!dialog?.open)return;dialog.querySelector('[data-connection]').textContent=(navigator.onLine?'Online':'Offline')+' · '+s.outbox.length+' perubahan';const html=`<details open><summary>Pendaftaran menunggu (${regs.length})</summary>${regs.map(x=>`<div class="p-notice-row"><div>${registrationIdentity(x)}<p>${E(x.ctx.prodi)} · semester ${E(x.ctx.semester)} · kelas ${E(x.ctx.kelas)}</p></div><div class="p-actions"><button data-approve="${x.id}">Setujui</button><button data-reject="${x.id}">Tolak</button><button data-remove-account="${x.id}" aria-label="Hapus akun ${E(x.nim)}">${PresenUI.icon('trash')}</button></div></div>`).join('')||'<p>Tidak ada pendaftaran menunggu.</p>'}</details><details open><summary>Sakit & izin menunggu (${pending.length})</summary>${pending.map(m=>{const session=s.snapshot.sessions.find(x=>x.scope===m.scope),id=m.scope+':'+m.slot+':'+m.nim;return `<div class="p-notice-row"><div><b>${E(s.snapshot.roster.find(x=>x.nim===m.nim&&WA.sameCtx(x,session?.ctx||{}))?.nama||m.nim)}</b><p>${E(session?.matkul)} · pertemuan ${m.slot} · ${m.mark==='S'?'Sakit':'Izin'}</p><p>${E(m.reason)}</p></div><div class="p-actions"><button data-view-mark="${id}">Lihat keterangan${m.attachments?.length?' & foto':''}</button><button data-review="${id}" data-decision="accepted" ${m.attachments?.length&&!m.evidence_ready?'disabled title="Menunggu foto tersinkron"':''}>Terima</button><button data-review="${id}" data-decision="rejected">Tolak · A</button></div></div>`;}).join('')||'<p>Tidak ada keterangan menunggu.</p>'}</details><details><summary>Semua akun mahasiswa (${s.snapshot.registrations.length})</summary>${s.snapshot.registrations.map(x=>`<div class="p-notice-row"><div>${registrationIdentity(x)}<p>${x.approved?'Disetujui':x.approval_status==='rejected'?'Ditolak':'Menunggu'} · ${E(x.ctx.prodi)} · semester ${E(x.ctx.semester)} · kelas ${E(x.ctx.kelas)}</p></div><button data-remove-account="${x.id}" aria-label="Hapus akun ${E(x.nim)}">${PresenUI.icon('trash')}</button></div>`).join('')||'<p>Belum ada akun terdaftar.</p>'}</details><details open><summary>Absensi terbaru (${recent.length}${deliveries.length>100?' dari '+deliveries.length:''})</summary>${recent.map((m,i)=>`<div class="p-notice-row"><div><b>${E(m.name)}</b><p>${E(m.nim)} · ${m.mark==='.'?'Hadir':m.mark==='S'?'Sakit':'Izin'} · pertemuan ${E(m.slot)}</p><p>${E(m.course)}${m.ctx?' · semester '+E(m.ctx.semester)+' · kelas '+E(m.ctx.kelas):''}</p></div><button type="button" data-view-attendance="${i}">Lihat detail</button></div>`).join('')||'<p>Belum ada absensi mahasiswa yang diterima.</p>'}</details>`;const content=dialog.querySelector('[data-inbox-content]');if(content.dataset.key!==html){const openStates=[...content.querySelectorAll('details')].map(x=>x.open);content.innerHTML=html;content.dataset.key=html;content.querySelectorAll('[data-view-attendance]').forEach(b=>b.onclick=async()=>{const m=recent[Number(b.dataset.viewAttendance)],rows=await window.PresenMonitoring?.collect(s);const row=rows?.find(x=>x.scope===m.scope&&x.slot===m.slot&&x.nim===m.nim);if(row)window.PresenMonitoring.detail(row);});content.querySelectorAll('[data-view-mark]').forEach(b=>b.onclick=()=>void window.PresenMonitoring?.detail(s.snapshot.marks.find(m=>m.scope+':'+m.slot+':'+m.nim===b.dataset.viewMark)));content.querySelectorAll('details').forEach((el,i)=>{if(openStates[i]!==undefined)el.open=openStates[i];});content.querySelectorAll('[data-approve],[data-reject],[data-remove-account],[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;await action(b.dataset.approve?'approve':b.dataset.reject?'reject':b.dataset.review?'review':'remove',b.dataset.approve||b.dataset.reject||b.dataset.review||b.dataset.removeAccount,b.dataset.decision);b.disabled=false;});}filterRows();markSeen();}finally{rendering=false;if(again){again=false;setTimeout(()=>void render(),0);}}}
window.addEventListener('resize',dock);window.PresenInbox={open,render};WA.on(()=>void render());window.addEventListener('presen-ui-ready',()=>void render());window.addEventListener('online',()=>void WA.sync());void render();
})();

} catch(error) {console.error("Teacher module app/inbox.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/grade-assistant.js */
try {
/* Local review rules: student data stays on this device; no model/API service required. */
(()=>{
'use strict';const table=document.getElementById('tbodyRekapNilai');if(!table)return;
function inspect(){const results=[];for(const row of table.rows){const inputs=[...row.querySelectorAll('.score-input')],name=row.querySelector('.name-value')?.textContent||'',nim=row.querySelector('.nim-value')?.textContent||'',grade=row.querySelector('.nilai-huruf')?.textContent||'',score=row.querySelector('.skor-akhir')?.textContent||'',missing=['UTS','UAS'].filter((_,i)=>inputs[i+3]?.value===''),alpa=Number(row.dataset.alpaCount)||0;const messages=[];if(missing.length)messages.push('Nilai '+missing.join(' dan ')+' belum diisi. Skor akhir masih sementara.');if(alpa>=4)messages.push('Alpa '+alpa+' kali: aturan kelas memberi nilai E. Tinjau catatan sebelum finalisasi.');else if(!missing.length&&['C','D','E'].includes(grade))messages.push('Nilai '+grade+' ('+score+'). Pertimbangkan umpan balik atau tindak lanjut belajar.');if(messages.length)results.push({name,nim,messages});}return results;}
function open(){const items=inspect(),d=PresenUI.dialog('Asisten nilai','<p class="p-note">Pemeriksaan otomatis berdasarkan isian dan aturan penilaian kelas. Nilai tidak diubah. UTS/UAS kosong dibedakan dari nilai 0.</p><div data-grade-findings></div>');d.classList.add('p-screen-only');const list=d.querySelector('[data-grade-findings]');if(!items.length){list.textContent='Tidak ada isian UTS/UAS yang kosong atau nilai C ke bawah pada daftar ini.';return;}for(const item of items){const box=document.createElement('div');box.className='p-notice-row';const text=document.createElement('div'),name=document.createElement('b');name.textContent=item.name+' · '+item.nim;text.append(name);for(const message of item.messages){const p=document.createElement('p');p.textContent=message;text.append(p);}const b=document.createElement('button');b.type='button';b.textContent='Tinjau';b.onclick=()=>{d.close();const row=[...table.rows].find(x=>x.querySelector('.nim-value')?.textContent===item.nim);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.querySelector('.score-input')?.focus();};box.append(text,b);list.append(box);}}
const button=document.createElement('button');button.type='button';button.id='presenGradeAssistant';button.className='btn';button.textContent='Asisten nilai';button.onclick=open;document.querySelector('.rekap-modal-header>div')?.prepend(button);window.PresenGradeAssistant={inspect,open};
})();

} catch(error) {console.error("Teacher module app/grade-assistant.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/monitoring.js */
try {
/* Class-first attendance monitoring; totals never combine unrelated classes. */
(()=>{
'use strict';if(!window.WA||document.getElementById('main'))return;let dialog,rows=[],limit=30,scheduled=false,renderTicket=0,groups=[],view='meeting';
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=m=>({'.':'Hadir',S:'Sakit',I:'Izin',A:'Tidak hadir'})[m.mark]||'Belum tercatat',dateText=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')?day.split('-').reverse().join('/'):'—';
const keys=['prodi','year','period','semester','kelas','course'],titles={prodi:'Program studi',year:'Tahun akademik',period:'Periode',semester:'Semester',kelas:'Kelas',course:'Mata kuliah'};
function filtered(data,f){return data.filter(r=>(!f.q||[r.name,r.nim,r.course,r.reason,r.address?.formatted,r.address?.rt,r.address?.rw].join(' ').toLocaleLowerCase('id').includes(f.q.toLocaleLowerCase('id')))&&(!f.from||r.day>=f.from)&&(!f.to||r.day<=f.to)&&(!f.mark||(f.mark==='_pending'?!r.mark:r.mark===f.mark))&&(!f.course||r.course===f.course)&&(!f.prodi||r.ctx?.prodi===f.prodi)&&(!f.semester||String(r.ctx?.semester)===f.semester)&&(!f.kelas||r.ctx?.kelas===f.kelas)&&(!f.year||WA.academicYear(r.ctx||{})===f.year)&&(!f.period||WA.academicPeriod(r.ctx||{})===f.period)&&(!f.slot||String(r.slot)===f.slot)&&(!f.review||r.review_status===f.review)).sort(f.sort==='name'?(a,b)=>a.name.localeCompare(b.name,'id'):f.sort==='oldest'?(a,b)=>a.recorded_at-b.recorded_at:(a,b)=>b.recorded_at-a.recorded_at);}
async function collect(given){const s=given||await WA.get();if(s.profile?.role!=='teacher')return[];const addresses=await WA.get('location-address:'+s.profile.account.id)||{},sessions=new Map(s.snapshot.sessions.map(x=>[x.scope+':'+x.slot,x])),docs=new Map(s.snapshot.documents.map(x=>[x.scope,x])),unique=new Map();
 for(const m of s.snapshot.marks){if(!['.','S','I','A'].includes(m.mark))continue;const session=sessions.get(m.scope+':'+m.slot),doc=docs.get(m.scope),ctx=session?.ctx||doc?.ctx||m.ctx;if(!ctx)continue;const student=s.snapshot.roster.find(x=>x.nim===m.nim&&WA.sameCtx(x,ctx));if(!student)continue;const row={...m,ctx:WA.ctx(ctx),name:student.nama,course:session?.matkul||doc?.matkul||'',day:session?.day||WA.day(m.recorded_at),address:window.PresenLocations?.normalizeAddress(m.location?.address||(m.location?addresses[m.location.lat.toFixed(6)+','+m.location.lon.toFixed(6)]:null))};const key=m.scope+':'+m.slot+':'+m.nim,old=unique.get(key);if(!old||Number(m.revision)>Number(old.revision)||m.revision===old.revision&&m.recorded_at>old.recorded_at)unique.set(key,row);}
 return [...unique.values()];
}
function classes(s){const map=new Map();for(const row of [...s.snapshot.sessions,...s.snapshot.documents,...(s.snapshot.courses||[]),...s.snapshot.roster]){if(row.hidden)continue;const c=WA.ctx(row.ctx||row),course=row.matkul||'',id=JSON.stringify([c,course]),at=Number(row.updatedAt||row.updated_at||row.starts)||0;const old=map.get(id);map.set(id,{ctx:c,prodi:c.prodi,year:WA.academicYear(c),period:WA.academicPeriod(c),semester:c.semester,kelas:c.kelas,course,at:Math.max(old?.at||0,at)});}const result=[...map.values()];return result.filter(g=>g.course||!result.some(x=>x.course&&WA.sameCtx(x.ctx,g.ctx))).sort((a,b)=>b.at-a.at||a.course.localeCompare(b.course,'id'));}
function scopeText(g){return g?`${g.prodi} · Semester ${g.semester} · Kelas ${g.kelas}`:'Belum ada kelas tersimpan';}
function selectedGroup(){const f=dialog?.querySelector('#monitorClassForm');return f&&groups.find(g=>keys.every(k=>g[k]===f.elements[k].value));}
function selectContexts(preferred={}){const f=dialog.querySelector('#monitorClassForm');let available=groups;for(const key of keys){const select=f.elements[key],previous=preferred[key]??select.value,values=[...new Set(available.map(g=>g[key]))],sorted=key==='year'?[...values].sort().reverse():[...values].sort((a,b)=>a.localeCompare(b,'id',{numeric:true}));select.replaceChildren(...sorted.map(v=>new Option(key==='semester'?'Semester '+v:key==='kelas'?'Kelas '+v:v||'Belum ada mata kuliah',v)));if(!sorted.length)select.add(new Option('Belum tersedia',''));select.value=sorted.includes(previous)?previous:(key==='course'?values[0]:sorted[0])||'';select.disabled=!sorted.length;available=available.filter(g=>g[key]===select.value);}}
function meetingOptions(s,g,keep){const select=dialog.querySelector('[name=slot]'),scopeRows=g?rows.filter(r=>WA.sameCtx(r.ctx,g.ctx)&&r.course===g.course):[],sessions=g?s.snapshot.sessions.filter(x=>WA.sameCtx(x.ctx,g.ctx)&&x.matkul===g.course):[],slots=[...new Set([...sessions.map(x=>Number(x.slot)),...scopeRows.map(x=>Number(x.slot))])].sort((a,b)=>a-b),latest=sessions.filter(x=>x.starts<=WA.now(s)&&x.deadline>WA.now(s)).sort((a,b)=>b.starts-a.starts)[0]?.slot||slots.at(-1);select.replaceChildren(...slots.map(slot=>{const session=sessions.find(x=>Number(x.slot)===slot),row=scopeRows.find(x=>Number(x.slot)===slot),day=session?.day||row?.day;return new Option('Pertemuan '+slot+' · '+dateText(day)+(session?(session.deadline>WA.now(s)?' · Aktif':' · Selesai'):''),String(slot));}));if(!slots.length)select.add(new Option('Belum ada pertemuan',''));select.value=slots.includes(Number(keep))?String(keep):String(latest||'');select.disabled=!slots.length;select.closest('label').hidden=view==='recap';return{slots,scopeRows,sessions};}
function counts(list){return Object.fromEntries(['.','S','I','A'].map(mark=>[mark,list.filter(x=>x.mark===mark).length]));}
function badges(count){return[['.','H'],['S','S'],['I','I'],['A','A']].map(([key,title])=>`<span title="${E(label({mark:key}))}">${title}<b>${count[key]||0}</b></span>`).join('');}
function rowHTML(row,i){return `<button type="button" class="monitor-row" ${row.mark?`data-row="${i}"`:'disabled'}><span class="monitor-date"><b>${row.slot||'—'}</b><small>Pertemuan</small></span><span class="monitor-person"><b>${E(row.name)}</b><small>${E(row.nim)}</small><small class="monitor-context-line">${E(scopeText({prodi:row.ctx.prodi,semester:row.ctx.semester,kelas:row.ctx.kelas}))}</small><small>${E(row.course)} · ${E(dateText(row.day))}</small>${row.reason?`<small>${E(row.reason)}</small>`:''}${row.address?`<small class="monitor-address">${E(PresenLocations.addressText(row.address))}</small>`:''}</span><span class="monitor-meta"><span class="status-pill">${E(label(row))}</span><small>${row.review_status==='pending'?'Menunggu tinjauan':row.review_status==='rejected'?'Ditolak':row.mark?'Tercatat':'Belum ada kiriman'}${row.attachments?.length?' · Foto':''}${row.location?' · Lokasi':''}</small></span><span aria-hidden="true">›</span></button>`;}
async function studentHistory(group,g){const d=PresenUI.dialog('Riwayat '+group.name,`<p>${E(group.nim)} · ${E(scopeText(g))}<br>${E(g.course)} · ${E(g.year)} ${E(g.period)}</p><div class="monitor-recap-counts">${badges(counts(group.records))}</div><div data-student-records></div>`);d.classList.add('monitor-dialog','p-screen-only');const list=d.querySelector('[data-student-records]'),records=group.records.sort((a,b)=>a.slot-b.slot);list.innerHTML=records.map(rowHTML).join('')||'<p>Belum ada catatan untuk mahasiswa ini pada kelas dan mata kuliah tersebut.</p>';list.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>void detail(records[Number(b.dataset.row)]));}
async function detail(mark){const s=await WA.get();if(s.profile?.role!=='teacher')return;const row=(await collect()).find(x=>x.scope===mark.scope&&x.slot===mark.slot&&x.nim===mark.nim)||mark,refs=row.attachments||[];
 const d=PresenUI.dialog('Detail absensi',`<div class="attendance-detail"><div class="detail-identity"><span class="status-pill status-${E(row.mark)}">${E(label(row))}</span><h3>${E(row.name||row.nim)}</h3><p>${E(row.nim)} · ${E(row.course||'')} · Pertemuan ${Number(row.slot)}</p><p>${E(row.ctx?scopeText({prodi:row.ctx.prodi,semester:row.ctx.semester,kelas:row.ctx.kelas}):'')} · ${E(row.ctx?WA.academicYear(row.ctx):'')} ${E(row.ctx?WA.academicPeriod(row.ctx):'')}</p></div><dl class="detail-grid"><div><dt>Tanggal</dt><dd>${E(row.day||WA.day(row.recorded_at))}</dd></div><div><dt>Waktu kirim</dt><dd>${E(new Date(row.recorded_at).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}))} WIB</dd></div><div><dt>Tinjauan dosen</dt><dd>${row.review_status==='pending'?'Menunggu':row.review_status==='rejected'?'Ditolak':'Tercatat'}</dd></div><div><dt>Verifikasi wajah</dt><dd>${row.verification?.status==='matched'?'Cocok pada perangkat mahasiswa':'Tidak disertakan'}</dd></div></dl><div class="detail-reason"><h3>Keterangan</h3><p></p></div><div class="detail-evidence"><h3>Foto bukti</h3><div data-evidence-actions></div><p class="small" role="status"></p></div><div class="detail-location"><h3>Lokasi saat mengirim</h3><p></p><p data-detail-address role="status"></p><button type="button" data-detail-address-load>Lengkapi alamat</button><button type="button" data-detail-map>Lihat peta</button></div><p class="small">Foto dan lokasi adalah data pada saat kiriman. Pencocokan wajah dilakukan pada perangkat; hasilnya bukan jaminan identitas atau pemeriksaan kesehatan.</p></div>`);d.classList.add('p-screen-only','attendance-detail-dialog');d.querySelector('.detail-reason p').textContent=row.reason||'Tidak ada keterangan tambahan.';
 const area=d.querySelector('[data-evidence-actions]'),status=d.querySelector('.detail-evidence [role=status]');if(!refs.length)status.textContent='Tidak ada foto pada kiriman ini.';for(const ref of refs){const b=document.createElement('button');b.type='button';b.textContent='Buka foto bukti';b.onclick=async()=>{b.disabled=true;try{await PresenEvidence.show(ref);status.textContent='';}catch(error){status.textContent=error.message;}finally{b.disabled=false;}};area.append(b);}if(refs.length&&!row.evidence_ready)status.textContent='Bukti belum tersinkron. Tunggu mahasiswa terhubung ke internet.';
 const p=row.location,map=d.querySelector('[data-detail-map]');d.querySelector('.detail-location p').textContent=p?`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · akurasi ±${Math.round(p.accuracy)} m${Number.isFinite(p.battery)?' · baterai '+p.battery+'%':''}`:'Lokasi tidak disertakan.';const addressEl=d.querySelector('[data-detail-address]'),addressButton=d.querySelector('[data-detail-address-load]');addressEl.textContent=window.PresenLocations?.addressText(row.address)||'Alamat belum tersedia.';addressButton.hidden=!p||!!row.address;addressButton.onclick=async()=>{addressButton.disabled=true;try{const a=await PresenLocations.address(p,true);addressEl.textContent=a?PresenLocations.addressText(a):'Alamat Android belum tersedia. Untuk penelusuran alamat Google, administrator perlu mengatur layanan Geocoding yang dapat berbayar. Mode peta Embed tetap tersedia.';if(a)addressButton.hidden=true;}catch(error){addressEl.textContent=error.message;}finally{addressButton.disabled=false;}};map.hidden=!p;map.onclick=()=>window.PresenLocations?.open(row.nim,row.scope,row.ctx,row.slot);
 if(row.review_status==='pending'){const actions=document.createElement('div');actions.className='p-actions';for(const [decision,text]of[['accepted','Setujui keterangan'],['rejected','Tolak · A']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=decision==='accepted'&&refs.length>0&&!row.evidence_ready;b.onclick=async()=>{b.disabled=true;try{await WA.queue({type:'review',ctx:row.ctx,matkul:row.course,slot:row.slot,nim:row.nim,mark:decision==='rejected'?'A':row.mark,decision,baseRevision:row.revision});await WA.sync();if(WA.lastError)throw Error(WA.lastError);d.close();await render();}catch(error){status.textContent=error.message;b.disabled=false;}};actions.append(b);}d.querySelector('.detail-identity').after(actions);}
 return d;
}
async function render({contextChanged=false}={}){
 if(!dialog?.open)return;const ticket=++renderTicket,s=await WA.get();if(s.profile?.role!=='teacher'){dialog.close();return;}const data=await collect(s);if(ticket!==renderTicket||!dialog?.open)return;rows=data;groups=classes(s);selectContexts();const g=selectedGroup(),slotSelect=dialog.querySelector('[name=slot]'),oldSlot=contextChanged?'':slotSelect.value,{slots,scopeRows,sessions}=meetingOptions(s,g,oldSlot),form=dialog.querySelector('#monitorReportForm'),filters=Object.fromEntries(new FormData(form)),slot=slotSelect.value,roster=g?s.snapshot.roster.filter(x=>WA.sameCtx(x,g.ctx)).filter((x,i,all)=>all.findIndex(other=>other.nim===x.nim)===i):[],ranged=scopeRows.filter(r=>(!filters.from||r.day>=filters.from)&&(!filters.to||r.day<=filters.to)),meeting=sessions.find(x=>String(x.slot)===slot),chosen=ranged.filter(r=>String(r.slot)===slot),day=meeting?.day||chosen[0]?.day||'',outsideRange=day&&((filters.from&&day<filters.from)||(filters.to&&day>filters.to));
 dialog.querySelector('[data-monitor-context]').innerHTML=`<strong>${E(scopeText(g))}</strong><span>${E(g?.course||'Belum ada mata kuliah')} · ${E(g?.year||'')} ${E(g?.period||'')}</span>`;
 dialog.querySelector('[data-monitor-view-title]').textContent=view==='meeting'?(slot?'Pertemuan '+slot+' · '+dateText(day):'Belum ada pertemuan'):'Rekap mahasiswa kelas ini';
 dialog.querySelector('[data-monitor-units]').textContent=view==='meeting'?`${roster.length} mahasiswa di kelas ini · ${outsideRange?'pertemuan di luar rentang tanggal':slot?'ringkasan untuk pertemuan yang dipilih':'buka sesi absen untuk mulai mencatat'}`:`${roster.length} mahasiswa · ${slots.length} pertemuan · akumulasi pada kelas dan mata kuliah ini`;
 const summaryBase=view==='meeting'?chosen:ranged,c=counts(summaryBase);dialog.querySelector('[data-monitor-summary]').innerHTML=[['.','Hadir'],['S','Sakit'],['I','Izin'],['A','Tidak hadir']].map(([mark,title])=>`<button type="button" data-mark-summary="${mark}" aria-label="Lihat ${title}" aria-pressed="${filters.mark===mark}"><span>${title}</span><strong>${c[mark]}</strong></button>`).join('');dialog.querySelectorAll('[data-mark-summary]').forEach(b=>b.onclick=()=>{form.elements.mark.value=form.elements.mark.value===b.dataset.markSummary?'':b.dataset.markSummary;limit=30;void render();});
 let result;if(view==='meeting'){const source=outsideRange||!slot?[]:roster.map(student=>chosen.find(r=>r.nim===student.nim)||{name:student.nama,nim:student.nim,ctx:g.ctx,course:g.course,slot:Number(slot),day,mark:'',reason:'',recorded_at:0});result=filtered(source,filters);}
 else result=roster.map(student=>({name:student.nama,nim:student.nim,records:ranged.filter(r=>r.nim===student.nim)})).filter(student=>(!filters.q||[student.name,student.nim,...student.records.map(r=>r.reason||'')].join(' ').toLocaleLowerCase('id').includes(filters.q.toLocaleLowerCase('id')))&&(!filters.mark||(filters.mark==='_pending'?!student.records.length:student.records.some(r=>r.mark===filters.mark)))&&(!filters.review||student.records.some(r=>r.review_status===filters.review))).sort((a,b)=>filters.sort==='name'?a.name.localeCompare(b.name,'id'):(filters.sort==='oldest'?1:-1)*(Math.max(0,...a.records.map(r=>r.recorded_at))-Math.max(0,...b.records.map(r=>r.recorded_at))));
 const list=dialog.querySelector('[data-monitor-list]');list.innerHTML=view==='meeting'?result.slice(0,limit).map(rowHTML).join(''):result.slice(0,limit).map((student,i)=>`<button type="button" class="monitor-recap-row" data-student="${i}"><span><b>${E(student.name)}</b><small>${E(student.nim)} · Semester ${E(g.ctx.semester)} · Kelas ${E(g.ctx.kelas)}</small><small>${student.records.length} catatan · ${E(g.course)}</small></span><span class="monitor-recap-counts">${badges(counts(student.records))}</span></button>`).join('');if(!result.length)list.innerHTML='<div class="monitor-empty">'+(!g?'Belum ada kelas tersimpan. Tambahkan mahasiswa dan mata kuliah terlebih dahulu.':!slot&&view==='meeting'?'Belum ada pertemuan yang dibuka atau dicatat untuk kelas dan mata kuliah ini.':'Tidak ada mahasiswa yang sesuai dengan pilihan dan filter ini.')+'</div>';list.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>void detail(result[Number(b.dataset.row)]));list.querySelectorAll('[data-student]').forEach(b=>b.onclick=()=>void studentHistory(result[Number(b.dataset.student)],g));dialog.querySelector('[data-monitor-count]').textContent=result.length+' mahasiswa'+(filters.q||filters.mark||filters.review?' sesuai filter':'');dialog.querySelector('[data-more]').hidden=result.length<=limit;
 const pending=chosen.filter(r=>r.review_status==='pending').length,review=dialog.querySelector('[data-pending-reviews]');review.hidden=!pending||view!=='meeting';review.textContent=pending+' keterangan menunggu tinjauan';review.onclick=()=>{form.elements.review.value='pending';void render();};dialog.querySelector('[data-unrecorded]').textContent=view==='meeting'&&slot&&!outsideRange?Math.max(0,roster.length-chosen.length)+' mahasiswa belum tercatat pada pertemuan ini.':'';dialog.querySelectorAll('[data-monitor-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.monitorView===view)));
}
async function open(){const state=await WA.get();if(state.profile?.role!=='teacher')return;if(dialog?.open){dialog.focus();return;}limit=30;view='meeting';rows=await collect(state);groups=classes(state);const home=document.querySelector('.main-card form'),query=Object.fromEntries(new URLSearchParams(location.search)),source={...state.selection,...query,...(home?Object.fromEntries(new FormData(home)):{}),owner:state.profile.account.id},ctx=WA.ctx(source),course=document.getElementById('teacherCourseSelect')?.value||source.matkul||'',preferred=groups.find(g=>WA.sameCtx(g.ctx,ctx)&&g.course===course)||groups.find(g=>WA.sameCtx(g.ctx,ctx))||groups[0];
 dialog=PresenUI.dialog('Monitoring absensi',`<div class="monitor-heading"><p>Pantau satu kelas dan mata kuliah, lalu pilih pertemuannya.</p><button type="button" data-monitor-full>Layar penuh</button></div><section class="monitor-scope"><p data-monitor-context></p><details class="monitor-class-picker"><summary>Ganti kelas atau mata kuliah</summary><form id="monitorClassForm" class="monitor-filters">${keys.map(k=>`<label>${titles[k]}<select name="${k}"></select></label>`).join('')}</form></details></section><div class="monitor-view-tabs" role="group" aria-label="Tampilan monitoring"><button type="button" data-monitor-view="meeting">Per pertemuan</button><button type="button" data-monitor-view="recap">Rekap mahasiswa</button></div><label class="monitor-meeting-picker">Pertemuan<select name="slot" aria-label="Pertemuan monitoring"></select></label><h3 data-monitor-view-title></h3><p class="monitor-units" data-monitor-units></p><div class="monitor-summary" data-monitor-summary></div><p data-unrecorded class="monitor-units"></p><button type="button" data-pending-reviews hidden></button><form id="monitorReportForm"><div class="monitor-search-row"><label>Cari mahasiswa<input name="q" type="search" placeholder="Nama, NIM, atau keterangan"></label><label>Status<select name="mark"><option value="">Semua status</option><option value=".">Hadir</option><option value="S">Sakit</option><option value="I">Izin</option><option value="A">Tidak hadir</option><option value="_pending">Belum tercatat</option></select></label></div><details class="monitor-extra-filters"><summary>Tanggal, tinjauan, dan urutan</summary><div class="monitor-filters"><label>Dari tanggal<input name="from" type="date"></label><label>Sampai tanggal<input name="to" type="date"></label><label>Tinjauan<select name="review"><option value="">Semua tinjauan</option><option value="pending">Menunggu</option><option value="accepted">Disetujui</option><option value="rejected">Ditolak</option></select></label><label>Urutkan<select name="sort"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name">Nama A–Z</option></select></label></div></details></form><div class="monitor-list-header"><strong data-monitor-count></strong><div><button type="button" data-today>Hari ini</button><button type="button" data-reset-filter>Reset pencarian</button></div></div><div data-monitor-list></div><button type="button" data-more>Tampilkan lagi</button>`);dialog.id='presenMonitoring';dialog.classList.add('monitor-dialog','p-screen-only');selectContexts(preferred||{});const form=dialog.querySelector('#monitorReportForm'),classForm=dialog.querySelector('#monitorClassForm');for(const f of[form,classForm])f.onsubmit=e=>e.preventDefault();classForm.onchange=()=>{selectContexts();form.reset();limit=30;void render({contextChanged:true});};form.oninput=()=>{limit=30;void render();};dialog.querySelector('[name=slot]').onchange=()=>{limit=30;void render();};dialog.querySelectorAll('[data-monitor-view]').forEach(b=>b.onclick=()=>{view=b.dataset.monitorView;limit=30;void render();});dialog.querySelector('[data-today]').onclick=()=>{form.elements.from.value=form.elements.to.value=WA.day();void render();};dialog.querySelector('[data-reset-filter]').onclick=()=>{form.reset();limit=30;void render();};dialog.querySelector('[data-more]').onclick=()=>{limit+=30;void render();};dialog.querySelector('[data-monitor-full]').onclick=()=>dialog.classList.toggle('monitor-fullscreen');dialog.addEventListener('close',()=>{dialog=null;renderTicket++;});await render();return dialog;
}
function mount(){const nav=document.querySelector('.portal-nav,.p-worknav');if(nav&&!nav.querySelector('[data-monitoring]')){const b=document.createElement('button');b.type='button';b.dataset.monitoring='';b.title='Pantau kelas, mata kuliah, dan pertemuan yang dipilih.';b.innerHTML=PresenUI.icon('grid')+'<span>Monitoring</span>';b.onclick=()=>void open();nav.append(b);}}
function changed(){mount();if(!scheduled){scheduled=true;setTimeout(()=>{scheduled=false;void render();},150);}}
const style=document.createElement('style');style.textContent='.monitor-scope{border:1px solid var(--p-line,#dbe5eb);border-radius:12px;padding:12px;margin:12px 0}.monitor-scope [data-monitor-context]{display:grid;gap:5px;margin:0 0 10px;line-height:1.5}.monitor-scope [data-monitor-context] strong{font-size:14px}.monitor-scope [data-monitor-context] span,.monitor-units{font-size:12px;line-height:1.5;color:var(--p-muted,#607486)}.monitor-dialog summary{cursor:pointer;font-size:12px;font-weight:600;padding:8px 0}.monitor-dialog .monitor-filters{border:0;padding:12px 0}.monitor-view-tabs{display:flex;gap:8px;margin:12px 0}.monitor-view-tabs button[aria-pressed=true],.monitor-summary button[aria-pressed=true]{border-color:var(--p-accent,#2463dc)!important;box-shadow:0 0 0 1px var(--p-accent,#2463dc)}.monitor-meeting-picker{display:grid;gap:6px;font-size:12px;margin:10px 0}.monitor-dialog select,.monitor-dialog input{min-height:42px;width:100%;min-width:0;font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--p-line,#cbd8df);background:var(--input-bg,#fff);color:var(--p-text,#193e4b)}.monitor-dialog .monitor-summary{margin:12px 0}.monitor-summary button{padding:12px!important;text-align:left;min-width:0;background:var(--input-bg,#f6fafb);color:var(--p-text,#193e4b);border:1px solid var(--p-line,#dbe5eb);border-radius:10px}.monitor-dialog [data-monitor-view-title]{font-size:16px;margin:12px 0 5px}.monitor-search-row{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:12px}.monitor-search-row label{display:grid;gap:6px;font-size:12px}.monitor-dialog .monitor-context-line{white-space:normal;overflow-wrap:anywhere}.monitor-recap-row{display:flex!important;justify-content:space-between;align-items:center;gap:12px;width:100%;padding:12px!important;margin:8px 0!important;text-align:left;border:1px solid var(--p-line,#dbe5eb);background:var(--p-surface,#fff);color:var(--p-text,#193e4b);border-radius:10px}.monitor-recap-row small{display:block;margin-top:4px;font-size:11px}.monitor-recap-counts{display:grid;grid-template-columns:repeat(4,minmax(28px,1fr));gap:6px;text-align:center}.monitor-recap-counts span{font-size:10px}.monitor-recap-counts b{display:block;font-size:16px}.monitor-row:disabled{opacity:.75;cursor:default}@media(max-width:650px){.monitor-dialog .monitor-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.monitor-dialog .monitor-summary strong{font-size:23px}.monitor-dialog .monitor-filters{grid-template-columns:1fr 1fr}.monitor-view-tabs button{font-size:11px;padding:9px}.monitor-search-row{grid-template-columns:minmax(0,1fr) 110px}.monitor-recap-row{flex-wrap:wrap}.monitor-recap-counts{min-width:140px}.monitor-dialog .monitor-row .monitor-person small{font-size:11px}}';document.head.append(style);
window.PresenMonitoring={open,detail,collect,filtered};mount();WA.on(changed);window.addEventListener('presen-address-resolved',()=>{if(dialog?.open)void render();});
})();

} catch(error) {console.error("Teacher module app/monitoring.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/experience.js */
try {
/* Bang Motion principles adapted to short, accessible application interactions. */
(()=>{
'use strict';if(!window.WA||!window.PresenUI)return;const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let historyState,historyKey='',mounting=false;
// Keep common tasks first; preserve the original buttons, IDs and handlers.
function structureToolbar(){
 const toolbar=document.getElementById('topToolbar');if(!toolbar||toolbar.dataset.layoutReady)return;
 toolbar.dataset.layoutReady='1';toolbar.classList.add('p-ribbon');
 const create=(name,title)=>{const group=document.createElement('div');group.className='toolbar-group sheet-'+name;group.setAttribute('role','group');group.setAttribute('aria-label',title);const label=document.createElement('span');label.className='sheet-group-label';label.textContent=title;group.append(label);return group;};
 const primary=create('primary','Tindakan'),exports=create('exports','Unduh / cetak'),format=create('format','Teks & tampilan'),paper=create('paper','Kertas'),structure=create('structure','Struktur tabel');
 const actionbar=document.createElement('div');actionbar.className='sheet-actionbar';const tools=document.createElement('div');tools.className='sheet-tools';actionbar.append(primary,exports);tools.append(format,paper,structure);
 const structural=new Set(['tourBtnTambah','tourBtnHapus','tourBtnKolom','tourBtnHapusKolom','tourBtnHapusPermanen']);
 const old=[...toolbar.children].filter(el=>el.matches('.toolbar-group,.toolbar-row'));
 for(const group of old)for(const el of [...group.children]){
  const action=el.getAttribute('onclick')||'';
  if(/(?:exportWord|exportExcel|eksporWordUjian|eksporExcelUjian|cetakDokumen|cetakLembarUjian|toggleToolbar)\(/.test(action))exports.append(el);
  else if(structural.has(el.id)){structure.append(el);if(/Hapus/.test(el.id))el.classList.add('p-destructive');}
  else if(['tourBtnGuide','openAttendanceQR','tourBtnRekap','shareClassInvite'].includes(el.id)||/mulaiTurInteraktif\(/.test(action))primary.append(el);
  else if(el.matches('select'))paper.append(el);
  else format.append(el);
 }
 old.forEach(el=>el.remove());toolbar.append(actionbar,tools);
 if(primary.children.length===1)primary.remove();if(structure.children.length===1)structure.remove();if(paper.children.length===1)paper.remove();
 for(const button of exports.querySelectorAll('button')){
  if(/cetakDokumen|cetakLembarUjian/.test(button.getAttribute('onclick')||''))button.classList.add('p-primary-action');
  if(button.classList.contains('hide-toolbar-inline')){button.setAttribute('aria-label','Sembunyikan pita alat');button.title='Sembunyikan pita alat';for(const node of [...button.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){const span=document.createElement('span');span.className='sheet-hide-label';span.textContent=node.textContent;node.replaceWith(span);}}
 }
 const music=()=>{const button=document.getElementById('absensiMusicLauncher');if(button)exports.append(button);};music();document.addEventListener('DOMContentLoaded',music,{once:true});
}
structureToolbar();
function structureRoster(){
 const table=document.getElementById('tabelSiswa');if(!table)return;
 const parent=table.closest('.content-card'),search=document.getElementById('searchInput');
 const counter=document.createElement('p');counter.id='teacherRosterCount';counter.className='teacher-roster-count';counter.setAttribute('role','status');table.closest('.table-responsive').before(counter);
 const reset=document.getElementById('deleteAllStudentData');if(reset){const zone=document.createElement('details');zone.className='teacher-data-management';zone.innerHTML='<summary>Pengelolaan data permanen</summary><p>Reset menghapus seluruh data mahasiswa, akun, absensi, dan nilai pada akun dosen ini di semua prodi, semester, dan kelas. Data dosen lain tetap terpisah.</p>';zone.append(reset);parent.append(zone);}
 const card=document.getElementById('photoImportCard');if(card){
  const intro=card.querySelector(':scope > p');if(intro){const help=document.createElement('details');help.className='teacher-import-help';help.innerHTML='<summary>Cara impor & format berkas</summary>';intro.before(help);help.append(intro);}
  const steps=document.createElement('ol');steps.className='teacher-import-steps';steps.setAttribute('aria-label','Tahapan impor');steps.innerHTML='<li><span>1</span>Pilih berkas</li><li><span>2</span>Periksa hasil</li><li><span>3</span>Simpan daftar</li>';card.querySelector('h3').after(steps);
 }
 const update=()=>window.filterTabelSiswa?.();new MutationObserver(update).observe(table.tBodies[0],{childList:true});search?.addEventListener('input',update);update();
}
structureRoster();
// Animate each newly opened surface once. Closing and camera cleanup remain native.
const motionPreference=matchMedia('(prefers-reduced-motion:reduce)'),boundSurfaces=new WeakSet(),activeMotion=new Set();
function lift(el,tab=false){
 if(motionPreference.matches||!el?.animate)return;el.classList.add('p-depth-surface');
 const effect=el.animate(tab?[{transform:'translate3d(0,6px,0)'},{transform:'none'}]:[{transform:'perspective(1100px) translate3d(0,12px,0) rotateX(1.3deg) scale(.985)',opacity:.96},{transform:'none',opacity:1}],{duration:tab?160:220,easing:'cubic-bezier(.2,.75,.25,1)'});
 activeMotion.add(effect);effect.finished.catch(()=>{}).finally(()=>activeMotion.delete(effect));
}
motionPreference.addEventListener('change',()=>{if(motionPreference.matches)for(const effect of activeMotion)effect.cancel();});
function bindSurface(el){
 if(boundSurfaces.has(el))return;boundSurfaces.add(el);let wasOpen=false;
 const changed=()=>{const open=el.tagName==='DIALOG'?el.open:el.classList.contains('show')||el.classList.contains('active')||['flex','block','grid'].includes(el.style.display);if(open&&!wasOpen)lift(el.querySelector(':scope > .modal-content,:scope > .rekap-modal-content,:scope > .custom-modal-box')||el);wasOpen=open;};
 new MutationObserver(changed).observe(el,{attributes:true,attributeFilter:['open','class','style']});changed();
}
const surfaces='dialog,.custom-modal,.custom-modal-overlay,.rekap-modal-overlay';document.querySelectorAll(surfaces).forEach(bindSurface);
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches(surfaces))bindSurface(node);node.querySelectorAll?.(surfaces).forEach(bindSurface);}}).observe(document.body,{childList:true});
let navigationTimer;
function navigation(){
 clearTimeout(navigationTimer);document.documentElement.dataset.navigating='1';
 let bar=document.getElementById('presenNavigationProgress');if(!bar){bar=document.createElement('div');bar.id='presenNavigationProgress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Membuka halaman');document.body.append(bar);}bar.hidden=false;
 const done=()=>{clearTimeout(navigationTimer);delete document.documentElement.dataset.navigating;bar.hidden=true;};navigationTimer=setTimeout(done,8000);window.addEventListener('pagehide',done,{once:true});window.addEventListener('pageshow',done,{once:true});return done;
}
function studentFlow(){
 const panel=document.getElementById('studentAttendancePanel');if(!panel)return;
 let steps=panel.querySelector('.student-flow');if(!steps){steps=document.createElement('ol');steps.className='student-flow';steps.setAttribute('aria-label','Langkah absensi');for(const p of panel.querySelectorAll(':scope > p.small'))if(p.textContent==='Pilih QR atau wajah, lengkapi keterangan, lalu kirim.')p.remove();steps.innerHTML='<li data-flow="scan"><span>1</span>Pilih metode</li><li data-flow="fill"><span>2</span>Isi absen</li><li data-flow="sent"><span>3</span>Kirim</li>';panel.querySelector('.student-attendance-methods').before(steps);}
 const stage=document.querySelector('#studentSession #replyForm')?'fill':document.querySelector('#studentSession .present,#studentSession .absent,#studentSession .pending')?'sent':'scan';
 if(panel.dataset.flow!==stage){panel.dataset.flow=stage;steps.querySelectorAll('li').forEach(el=>{if(el.dataset.flow===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
 const scan=document.getElementById('scanSession'),text=stage==='scan'?'Pindai QR dosen':'Pindai QR lain';if(scan.textContent!==text)scan.textContent=text;scan.classList.toggle('student-scan-secondary',stage!=='scan');
}

// Page content stays visible. Dialogs and controls keep their own short motion;
// sync events must never fade the entire workspace out and back in.

function view(name){if(!['attendance','history','messages','account'].includes(name)||document.body.dataset.studentView===name)return;document.body.dataset.studentView=name;const heading=document.getElementById('studentPageTitle');if(heading)heading.textContent={attendance:'Absensi',history:'Riwayat',messages:'Pesan',account:'Akun'}[name];document.querySelectorAll('.student-bottom-nav button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.studentView===name)));if(name==='history'&&historyState)void history(historyState,true);const panel=document.getElementById({attendance:'studentAttendancePanel',history:'studentHistoryPanel',messages:'studentNotifications',account:'studentAccountPanel'}[name]);lift(panel,true);scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
async function faceStatus(){const box=document.getElementById('studentFaceSettings');if(!box)return;const enabled=await PresenFace.enrolled();const method=document.getElementById('faceSession');if(method)method.textContent=enabled?'Absen dengan wajah':'Daftarkan wajah';box.querySelector('[data-face-state]').textContent=enabled?'Tersimpan · pilihan wajah siap digunakan':'Belum diaktifkan';box.querySelector('[data-face-enroll]').textContent=enabled?'Daftarkan ulang':'Daftarkan wajah';box.querySelector('[data-face-remove]').hidden=!enabled;}
async function mountStudent(){if(mounting)return;mounting=true;try{const main=document.getElementById('main'),s=await WA.get();if(!main||s.profile?.role!=='student'||!document.getElementById('studentAttendancePanel')){document.querySelector('.student-bottom-nav')?.remove();delete document.body.dataset.studentView;return;}
 if(!document.body.dataset.studentView)document.body.dataset.studentView='attendance';const title=document.getElementById('studentPageTitle');if(title)title.textContent={attendance:'Absensi',history:'Riwayat',messages:'Pesan',account:'Akun'}[document.body.dataset.studentView];let account=document.getElementById('studentAccountPanel');if(!account){account=document.createElement('section');account.id='studentAccountPanel';account.innerHTML='<h2>Akun & keamanan</h2><div id="studentFaceSettings"><div class="row"><div><h3>Verifikasi wajah</h3><p class="small" data-face-state></p></div>'+PresenUI.icon('users')+'</div><p class="small">1. Daftarkan wajah Anda sekali. 2. Saat dosen membuka sesi, pilih Absen dengan wajah. 3. Lengkapi keterangan dan kirim. Data wajah terenkripsi untuk akun ini di perangkat ini; daftar kembali jika berganti perangkat.</p><div class="p-actions"><button type="button" data-face-enroll>Daftarkan wajah</button><button type="button" data-face-remove hidden>Hapus data wajah</button></div><p class="small" data-face-feedback role="status"></p></div>';main.append(account);account.querySelector('[data-face-enroll]').onclick=async e=>{e.target.disabled=true;try{await PresenFace.enroll();account.querySelector('[data-face-feedback]').textContent='Wajah tersimpan. Pilih Absen dengan wajah atau gunakan QR tanpa pemeriksaan wajah.';await faceStatus();}catch(error){account.querySelector('[data-face-feedback]').textContent=error.message;}finally{e.target.disabled=false;}};account.querySelector('[data-face-remove]').onclick=async()=>{if(confirm('Hapus data pencocokan wajah dari perangkat ini? Catatan absensi tetap tersimpan.')){await PresenFace.forget();await faceStatus();}};await faceStatus();}
 let summary=account.querySelector('.student-account-summary');if(!summary){summary=document.createElement('div');summary.className='student-account-summary';summary.innerHTML='<span class="student-account-mark">'+PresenUI.icon('users')+'</span><div><h2></h2><p class="small"></p></div>';account.prepend(summary);}summary.querySelector('h2').textContent=s.profile.account.nama;summary.querySelector('p').textContent=s.profile.account.nim+' · '+s.profile.account.ctx.prodi;
 let preferences=account.querySelector('.student-preferences');if(!preferences){preferences=document.createElement('div');preferences.className='student-preferences';preferences.innerHTML='<h3>Pemberitahuan</h3><p class="small">Pengingat sesi dan hasil persetujuan dosen.</p>';account.append(preferences);}for(const id of ['enableNotices','disableNotices']){const button=document.getElementById(id);if(button&&button.parentElement!==preferences)preferences.append(button);}
 if(!account.querySelector('[data-student-logout]')){const button=document.createElement('button');button.type='button';button.dataset.studentLogout='';button.className='student-logout';button.textContent='Keluar akun';button.onclick=()=>document.getElementById('logout')?.click();account.append(button);}
 const session=document.getElementById('studentSession');if(session&&!session.dataset.flowBound){session.dataset.flowBound='1';new MutationObserver(studentFlow).observe(session,{childList:true});}studentFlow();
 const actions=document.getElementById('studentAccountActions');if(actions&&actions.parentElement!==account)account.insertBefore(actions,account.querySelector('[data-student-logout]'));const notices=document.getElementById('studentNotifications');if(notices)notices.classList.add('student-message-panel');
 if(!document.querySelector('.student-bottom-nav')){const nav=document.createElement('nav');nav.className='student-bottom-nav p-screen-only';nav.setAttribute('aria-label','Menu mahasiswa');nav.innerHTML=[['attendance','qr','Absen'],['history','sheet','Riwayat'],['messages','bell','Pesan'],['account','users','Akun']].map(([id,icon,title])=>`<button type="button" data-student-view="${id}" aria-current="${document.body.dataset.studentView===id}">${PresenUI.icon(icon)}<span>${title}</span></button>`).join('');document.body.append(nav);}
 const messages=document.getElementById('studentMessages');if(messages)messages.onclick=()=>view('messages');
 }finally{mounting=false;}}
async function history(s,force=false){historyState=s;const host=document.getElementById('history');if(!host)return;const key=JSON.stringify(s.snapshot.marks);if(!force&&historyKey===key&&host.querySelector('form'))return;historyKey=key;const previous=host.querySelector('form')?Object.fromEntries(new FormData(host.querySelector('form'))):{};
 host.innerHTML='<form class="student-history-filters"><label>Dari<input type="date" name="from"></label><label>Sampai<input type="date" name="to"></label><label>Status<select name="mark"><option value="">Semua</option><option value=".">Hadir</option><option value="S">Sakit</option><option value="I">Izin</option><option value="A">Tidak hadir</option></select></label><label>Urutkan<select name="sort"><option value="new">Terbaru</option><option value="old">Terlama</option></select></label></form><div data-student-history-list></div>';
 const form=host.querySelector('form');for(const [name,value]of Object.entries(previous))if(form.elements[name])form.elements[name].value=value;form.onsubmit=e=>e.preventDefault();function draw(){const f=Object.fromEntries(new FormData(form)),rows=s.snapshot.marks.filter(x=>x.mark).map(x=>{const session=s.snapshot.sessions.find(t=>t.scope===x.scope&&t.slot===x.slot);return {...x,course:session?.matkul||'Mata kuliah',day:session?.day||WA.day(x.recorded_at||WA.now(s))};}).filter(x=>(!f.mark||x.mark===f.mark)&&(!f.from||x.day>=f.from)&&(!f.to||x.day<=f.to)).sort((a,b)=>f.sort==='old'?a.recorded_at-b.recorded_at:b.recorded_at-a.recorded_at);const list=host.querySelector('[data-student-history-list]');PresenMeetings.mount(list,{selected:rows[0]?.slot||1,state:slot=>rows.some(x=>x.slot===slot)?'Tercatat':'Belum ada catatan',render:(detail,slot)=>{const selectedRows=rows.filter(x=>x.slot===slot);detail.innerHTML=selectedRows.map((x,i)=>`<details class="student-history-item"><summary><span><b>${E(x.course)}</b><small>${E(x.day)} · Pertemuan ${x.slot}</small></span><span class="status-pill">${E(x.mark==='.'?'Hadir':x.mark==='S'?'Sakit':x.mark==='I'?'Izin':'Tidak hadir')}</span></summary><p>${E(x.reason||'Tidak ada keterangan tambahan.')}</p><p class="small">${x.review_status==='pending'?'Menunggu dosen meninjau':x.review_status==='rejected'?'Keterangan ditolak dosen':'Tercatat'}${x.attachments?.length?(x.evidence_ready?' · Bukti diterima':' · Foto menunggu sinkronisasi'):''}</p>${(x.attachments||[]).map((ref,j)=>`<button type="button" data-photo-row="${i}" data-photo-ref="${j}">Lihat foto bukti</button>`).join('')}</details>`).join('')||'<p class="small">Belum ada riwayat pada pilihan ini.</p>';detail.querySelectorAll('[data-photo-row]').forEach(b=>b.onclick=async()=>{try{await PresenEvidence.show(selectedRows[b.dataset.photoRow].attachments[b.dataset.photoRef]);}catch(error){const p=document.createElement('p');p.className='small';p.textContent=error.message;b.after(p);}});}});}
 form.oninput=draw;draw();
}
const main=document.getElementById('main');if(main)new MutationObserver(()=>void mountStudent()).observe(main,{childList:true});window.addEventListener('presen-face-changed',()=>void faceStatus());WA.on(()=>{void mountStudent();});document.addEventListener('click',e=>{const target=e.target.closest('[data-student-view]');if(target&&target.tagName==='BUTTON')view(target.dataset.studentView);});window.PresenExperience={history,view,mountStudent,navigation};void mountStudent();
})();

} catch(error) {console.error("Teacher module app/experience.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/teacher-guide.js */
try {
/* Short contextual tours shared by the original teacher pages and student app. */
(()=>{
'use strict';
const script=document.currentScript,rootURL=new URL('./',script.src),student=/\/app\/(?:index\.html)?$/.test(location.pathname),page=student?'student':location.pathname.split('/').pop().replace(/\.php$/,'')||'index';
const get=k=>{try{return localStorage.getItem('wa-guide-'+k);}catch(_){return null;}},put=(k,v)=>{try{localStorage.setItem('wa-guide-'+k,String(v));}catch(_){}};
document.documentElement.dataset.waShowStatus=get('status')==='1'?'1':'0';
const step=(title,text,target,image,prepare)=>({title,text,target,image,prepare});
const qrOpen=()=>{if(document.querySelector('#attendanceQRPanel[hidden]'))document.getElementById('openAttendanceQR')?.click();};
const nativeIcon=!student&&!!(window.AbsensiDesktop?.getAppIcon||window.Android?.getAppIcon);
const inbox=()=>void window.PresenInbox?.open();
const sidebar=()=>{const x=document.getElementById('sidebar');if(x&&!x.classList.contains('open')&&!x.classList.contains('active'))window.toggleSidebar?.();};
const chapters={
index:[['Masuk & pilih kelas',[step('Masuk sebagai dosen','Masuk dengan ID akun dan kata sandi. Tombol mata menampilkan atau menyembunyikan sandi. Nama akun diambil otomatis. Mahasiswa masuk melalui Presen Go.','#authOverlay','teacher-login'),step('Pilih kelas','Pilih prodi, semester, dan kelas yang akan dikelola.','#prodi','home'),step('Buka data kelas','Tekan Masuk Sistem. Data dan lembar menggunakan kelas yang dipilih.','.main-card .btn-submit','home')]],['Persetujuan & cadangan',[step('Buka menu','Buka menu untuk persetujuan mahasiswa, sinkronisasi, dan cadangan.','#sidebar','qr',sidebar),step('Setujui mahasiswa','Cocokkan NIM dan kelas, lalu Setujui. Status mahasiswa diperbarui otomatis saat online; Sinkronkan memeriksa ulang hasil.','#presenInboxDialog','qr',inbox),step('Hapus akun percobaan','Di Akun mahasiswa terdaftar, tekan Hapus. Pilih hapus akun saja atau bersihkan data NIM pada kelas itu, lalu konfirmasikan NIM.','#presenInboxDialog','roster',inbox),step('Cadangkan data','Ekspor cadangan sebelum pindah perangkat. Simpan berkas dengan aman. Pulihkan hanya cadangan milik Anda.','#backup','roster',sidebar)]],['Tampilan & musik',[step('Tema, warna & latar','Tekan Tampilan untuk memilih tema, warna utama dan foto latar beranda.','[data-appearance]','home'),step('Pengaturan profil','Tekan profil untuk mengganti nama, foto, atau tema. Pengaturan tidak mengubah data absensi.','.user-profile-btn','home'),...(nativeIcon?[step('Ikon aplikasi','Buka Pengaturan, pilih Atur ikon aplikasi. Pilih gambar, atur ukuran/posisi, Simpan ikon lalu buat pintasan. Ikon APK/EXE mengikuti paket.','#profileModal [data-app-icon-open]','home',()=>window.openProfileModal?.())]:[]),step('Musik latar','Gunakan tombol musik. Audio lokal tetap dapat diputar saat offline.','[onclick*="Musik"], [onclick*="Music"]','home')]]],
data_siswa:[['Daftar mahasiswa',[step('Tambah mahasiswa','Tekan Tambah, isi NIM lengkap dan nama, lalu Simpan Data. L/P boleh kosong dan dilengkapi nanti.','[onclick="bukaModalTambah()"]','roster'),step('Cari & koreksi','Cari NIM atau nama. Gunakan Edit pada baris yang tepat untuk memperbaiki data.','#searchInput','roster'),step('Buka lembar','Buka Lembar Absen atau Lembar Ujian dari kelas ini.','.p-worknav [data-nav="absen.php"]','sheet')]],['Impor foto & dokumen',[step('Pilih berkas','Pilih foto, PDF, Word, atau Excel. Foto harus tajam dan memuat kolom NIM serta nama.','#fotoDaftarMahasiswa','roster'),step('Pilih area tabel','Jika foto miring, putar atau luruskan. Seret area tabel agar kop dan tanda tangan tidak ikut dibaca.','#ocrPreviewCanvas','roster'),step('Baca semua baris','Tekan Baca Semua Baris. Urutan mengikuti berkas asli; NIM tidak jelas ditandai untuk dikoreksi.','#btnOcrFoto','roster'),step('Periksa hasil','Cocokkan NIM, nama, dan urutan dengan gambar contoh per baris. Lengkapi NIM dan nama; awalan C harus tetap sesuai berkas. L/P boleh kosong.','#ocrReviewRows','roster'),step('Simpan hasil','Simpan setelah NIM dan nama benar. L/P boleh diisi nanti. Batalkan impor mengosongkan hasil sementara.','#btnSimpanOcr','roster')]]],
absen:[['Absensi QR',[step('Buka Absensi QR','Tekan Absensi QR pada lembar ini. Fitur berada di bawah menu lembar.','#openAttendanceQR','qr'),step('Atur sesi','Isi mata kuliah, nomor pertemuan, dan durasi. Tanggal sesi langsung mengisi kotak tanggal pada lembar. Pilih angka pertemuan untuk melihat QR dan keterangannya.','#sessionForm','qr',qrOpen),step('Bagikan QR','Tekan Mulai/Buat QR lalu Bagikan QR. Mahasiswa dapat membaca berkas gambar langsung.','#startSession','qr',qrOpen),step('Terima & setujui','Tekan ikon pesan untuk menyetujui atau menolak akun dan keterangan. Saat offline, pindai QR balasan mahasiswa sebelum tenggat.','#presenInboxDialog','qr',inbox),step('Tanggal pertemuan','Ketuk kotak tanggal atau tombol Tanggal pertemuan. Pilih tanggal atau ketik teks hari, bulan dan tahun sendiri. Tanggal angka DD/MM/TT ditampilkan miring di kotak persegi. Ukurannya mengikuti huruf lembar atau dapat diatur sendiri; warna dan format tersimpan untuk cetak.','#sheetDateSettings','sheet'),step('Tanda kehadiran','Titik berarti hadir. S/I mengikuti pengajuan. A otomatis muncul setelah waktu QR habis, bukan saat masih berlangsung.','#tbodySiswa','sheet')]],['Edit & simpan lembar',[step('Isi identitas lembar','Tekan teks identitas untuk mengedit. Perubahan langsung disimpan di perangkat.','#metaLeftBox','sheet'),step('Isi kehadiran','Isi titik, S, I, atau A. Enter pindah satu pertemuan ke kanan; Delete/Backspace menghapus isian lalu mundur satu sel. Perubahan tersimpan.','#tbodySiswa','sheet'),step('Atur lembar','Gunakan pengaturan untuk ukuran, posisi, font, dan margin. Periksa pratinjau sebelum mencetak.','#inspectorToggleBtn','sheet'),step('Tanda tangan','PNG transparan bisa menimpa area nama. Seret gambar atau pilih Atur posisi; teks dan tabel tetap di tempatnya.','[data-signature-upload]','sheet')]],['Rekap, nilai & cetak',[step('Rekap nilai','Buka Rekap Nilai. Isi komponen nilai dan bobot, lalu simpan untuk lembar ujian.','#tourBtnRekap','sheet'),step('Baris & pertemuan','Tambah/hapus baris atau kolom hanya bila diperlukan. Hapus permanen menghapus data kelas dan meminta konfirmasi.','#tourBtnTambah','sheet'),step('Ekspor atau cetak','Gunakan Word, Excel, atau Cetak. Pilih ukuran kertas dan orientasi sebelum mencetak.','#tourBtnPrint','sheet')]]],
ujian:[['Lembar ujian',[step('Isi mata kuliah & jadwal','Tekan mata kuliah, ruang, dan waktu untuk mengisi identitas ujian. Kolom kosong dapat diisi sendiri.','[data-app-course]','sheet'),step('Nilai mahasiswa','Nilai berasal dari rekap lembar absen. Periksa kelas dan mata kuliah sebelum mencetak.','#examTableBlock','sheet'),step('Tanda tangan','Unggah PNG transparan pada kotak pengawas/dosen. Seret atau Atur posisi untuk menimpa area nama seperti pada kertas.','[data-signature-upload]','sheet'),step('Format & keluaran','Atur font dan posisi lewat pengaturan. Ekspor Word/Excel atau Cetak setelah memeriksa lembar.','[onclick="cetakLembarUjian()"]','sheet')]]],
music_player:[['Pemutar musik',[step('Audio lokal','Pilih audio dari perangkat untuk digunakan saat offline.','#localMusicFile','home'),step('Cari audio','Isi judul atau artis lalu Cari audio. Pencarian memerlukan internet.','#searchForm','home'),step('Volume & latar','Atur volume. Tekan Tutup untuk kembali; musik dapat tetap berjalan di latar.','#volume','home')]]],
student:[['Masuk & persetujuan',[step('Masuk mahasiswa','Pilih kelas, isi NIM lengkap dan PIN. Gunakan data yang sama saat masuk kembali.','#login','student-login'),step('Daftar pertama kali','Jika belum terdaftar, pilih Daftar. Isi nama dan L/P dengan benar, lalu tunggu persetujuan dosen.','#register','student-login'),step('Periksa persetujuan','Persetujuan diperbarui otomatis saat online. Setelah disetujui, Pindai QR langsung aktif; gunakan Sinkronkan bila diperlukan.','#approval, #registration','student-login')]],['Isi absensi QR',[step('Pilih sesi atau pindai','Tekan Pindai QR dosen. Kartu sesi menunjukkan mata kuliah dan waktu tersisa; hanya kelas Anda yang dapat digunakan.','#scanSession, #activeSessions','student-qr'),step('Baca berkas QR','Pilih foto QR menerima PNG/SVG asli; tidak perlu screenshot. Kamera memerlukan izin.','#qrImage','student-qr'),step('Isi kehadiran','Pilih Hadir, Sakit, atau Izin. Sakit/Izin wajib disertai alasan dan satu foto bukti. Kirim sebelum waktu habis.','#replyForm','student-qr'),step('Lokasi saat kirim','Lokasi dicatat sekali saat mengirim absensi dan dapat dilihat dosen. Android memerlukan izin lokasi. Jika GPS gagal, coba lagi; pilihan tanpa lokasi hanya tersedia di browser.','#replyForm .p-note','student-qr'),step('Jika offline','Tampilkan QR balasan dan serahkan kepada dosen untuk dipindai sebelum batas waktu. QR tersimpan dapat dibuka lagi.','#savedReply','student-qr'),step('Periksa hasil','Buka tab Riwayat untuk melihat hasil dan status pengiriman. Sinkronkan saat internet kembali.','#history','student-qr')]],['Notifikasi & akun',[step('Pengingat sesi','Aktifkan notifikasi jika tersedia. Tetap periksa sesi aktif ketika aplikasi dibuka.','#enableNotices','student-qr'),...(nativeIcon?[step('Ikon pilihan','Tekan Ikon. Pilih gambar, atur ukuran/posisi lalu Simpan. Buat pintasan dan konfirmasi Android; ikon daftar aplikasi tetap mengikuti APK.','[data-app-icon-open]','student-login')]:[]),step('Hapus pesan','Tekan ikon hapus pada pemberitahuan atau Hapus semua. Kehadiran tetap tercatat.','#studentNotifications','student-qr'),step('Hapus akun percobaan','Tekan Hapus akun dan konfirmasikan PIN. Catatan dosen dipertahankan; NIM dapat didaftarkan kembali.','#deleteMyAccount','student-login'),step('Keluar akun','Keluar akun hanya untuk berganti pengguna. Pastikan pengiriman selesai; jangan keluar saat masih ada antrean.','[data-student-logout]','student-login')]]]
};
if(!student&&chapters[page])chapters[page].push(['Pesan & periode',[step('Pesan mahasiswa','Ikon pesan kecil mengikuti semua halaman. Titik merah menunjukkan pesan belum dibaca. Buka untuk Setujui, Tolak, atau Hapus akun percobaan.','#presenInboxLauncher','qr'),step('Tahun dan periode','Pilih Tahun Akademik dan Ganjil/Genap. Nomor semester 1–8 menunjukkan tingkat kuliah. Data tiap periode disimpan terpisah.','#academicYear','home'),...(page==='absen'?[step('Asisten nilai','Di Rekap Nilai, tekan Asisten nilai untuk mencari UTS/UAS kosong dan nilai C ke bawah. Nilai tidak diubah otomatis.','#presenGradeAssistant','sheet',()=>window.bukaRekapNilai?.())]:[])]]);
if(!student&&chapters[page])chapters[page].push(['Navigasi & tampilan',[step('Bantuan menu','Arahkan kursor ke menu untuk membaca penjelasan singkat. Klik menu untuk langsung membuka halamannya.','.p-worknav,.portal-nav','workspace-nav'),step('Latar aplikasi','Buka Tampilan untuk foto latar dan logo kampus. Pilih mode penuh atau skala hingga 1000%. Kertas cetak tetap putih.','[data-appearance]','appearance'),step('Lihat lokasi absensi','Di lembar absen, tekan pin di kiri nomor baris. Pilih pertemuan; Layar penuh memperbesar peta. Peta memerlukan internet.','.p-location-icon','sheet')]]);
if(student)chapters.student.push(['Foto & wajah',[step('Pilih metode','Gunakan Pindai QR dosen atau Absen dengan wajah. Cukup salah satu; QR tidak meminta wajah. Untuk wajah, daftarkan sekali di Akun lalu pilih sesi aktif dan Kirim.','#faceSession','student-qr',()=>window.PresenExperience?.view('attendance')),step('Status pemindaian','Arahkan seluruh QR aktif ke kamera hingga tajam. QR berhasil dibaca berarti siap mengisi; absensi baru tercatat setelah Kirim berhasil. Saat waktu habis, status Sesi absensi selesai muncul dan isian sesi ditutup. Pindai QR pertemuan terbaru; jika dosen mengganti kode, pindai ulang.','#scanSession','student-qr',()=>window.PresenExperience?.view('attendance')),step('Lampirkan bukti','Jika lokasi belum aktif, buka pengaturan lokasi lalu coba lagi. Setelah QR terbaca, kamera menutup otomatis. Pilih Sakit/Izin, jelaskan alasan dan lampirkan satu foto. Tekan Lihat foto untuk memeriksanya, lalu Kirim. Foto disimpan saat offline.','[data-evidence]','student-qr',()=>window.PresenExperience?.view('attendance')),step('Wajah akun sendiri','Di Akun, pilih Daftarkan wajah. Baca persetujuan, aktifkan kamera dan ikuti gerakan. Data wajah hanya disimpan terenkripsi di perangkat.','[data-face-enroll]','student-login',()=>window.PresenExperience?.view('account')),step('Periksa riwayat','Buka Riwayat, pilih tanggal/status lalu ketuk catatan untuk melihat alasan dan foto.','#studentHistoryPanel','student-qr',()=>window.PresenExperience?.view('history')),step('Bukti saat offline','Hadir dikirim langsung saat online. Jika offline, sambungkan internet lalu Kirim sebelum tenggat, atau minta dosen mencatat manual. QR balasan hanya untuk sakit/izin; gunakan Kirim ke kotak masuk dosen saat tersambung.','#savedReply','student-qr',()=>window.PresenExperience?.view('attendance'))]]);
if(!student&&chapters[page])chapters[page].push(['Monitoring & peta',[step('Riwayat kelas','Tekan Monitoring untuk menyaring tanggal, kelas, mata kuliah dan status. Ketuk catatan untuk membaca alasan, foto dan lokasi.','[data-monitoring]','qr'),step('Alamat dan rute','Alamat saat kirim dari Android muncul pada Monitoring dan detail peta jika tersedia. RT/RW tidak ditebak. Tekan Rute & waktu tempuh di atas peta, lalu izinkan GPS. Jalur dan durasi tampil dalam peta Google. Gunakan Pilih titik awal jika GPS laptop tidak tepat.','.p-location-icon','sheet'),step('Aktifkan Google Maps','Administrator membuka Tampilan → Google Maps → Belum punya kunci? Mulai di sini. Ikuti tautan Google, simpan kunci lalu Uji peta. Akun Google disiapkan oleh pemilik; periksa pengaturan penagihan hanya jika diminta Google.','#pMapsTest','appearance',()=>{const d=window.PresenAppearance?.open();const help=d?.querySelector('.p-maps-help');if(help)help.open=true;}),step('Panorama 360°','Di peta, pilih 360° untuk melihat jalan dalam jendela yang sama. Panorama jalan terdekat dicari hingga 500 m di sekitar titik absen, mengikuti cakupan Google; gunakan Layar penuh. Administrator mengaktifkan Maps Embed API lewat Tampilan → Google Maps.','.p-location-icon','sheet')]]);
if(!student&&['absen','ujian'].includes(page))chapters[page].push(['Ukuran & tata letak',[step('Font seragam','Pengaturan Ukuran menyamakan isi tabel dan identitas lembar. Kop tetap memiliki hierarki judul. Ukuran di absen dan ujian mengikuti kelas serta mata kuliah yang sama.','#fontSizeSelect,#examFontSize','sheet'),step('Jarak baris dan tanda tangan','Buka Tata letak untuk mengatur jarak baris, ruang tanda tangan, dan skala gambar. Font tidak diperkecil otomatis. Jika isi penuh, lanjutkan ke halaman berikutnya.','#sheetLayoutSettings','sheet')]]);
if(page==='data_siswa')chapters[page].push(['Batalkan hasil impor',[step('Reset hasil sementara','Tekan Batalkan impor untuk menghapus pratinjau foto dan hasil baca yang belum disimpan. Daftar mahasiswa tersimpan tetap ada.','#cancelRosterImport','roster')]]);
const groups=[...(chapters[page]||chapters.index),['Offline & sinkronisasi',[step('Siapkan saat online','Masuk pertama kali saat online. Buka halaman yang akan dipakai agar tersedia ketika jaringan terputus.',student?'#connection':'#toolConnection',student?'student-login':'home'),step('Perubahan tersimpan','Perubahan disimpan di perangkat. Sambungkan internet lalu Sinkronkan; tunggu antrean kosong sebelum pindah perangkat.',student?'#sync':'#toolConnection',student?'student-qr':'qr'),step('Periksa jika belum terkirim','Status lengkap dapat ditampilkan lewat kotak di bawah. Dosen memeriksa konflik di menu sinkronisasi; jangan menimpa tanpa memeriksa salinan.',student?'#connection':'#toolResults',student?'student-qr':'qr')]]];
/* Injected after the shared chapter catalogue by build-offline.cjs. Teacher web only. */
(()=>{
'use strict';
if(student)return;
if(page==='index')groups.unshift(['Aplikasi mahasiswa: instal & gunakan',[
 step('Unduh atau bagikan APK','Pada bagian Unduh & bagikan Presen Go, tekan Unduh APK terbaru. Dosen dapat membagikan tautan melalui WhatsApp atau menu berbagi perangkat. Untuk berbagi file, unduh APK lalu pilih file tersebut.','#studentAppDownload','home'),
 step('Pasang di Android','Buka APK dari Unduhan. Jika Android meminta izin, aktifkan Izinkan dari sumber ini hanya untuk browser atau pengelola file yang digunakan, lalu pilih Instal. Izin pemasangan tersebut dapat dimatikan lagi setelah selesai.','#studentAppDownload','home'),
 step('Masuk ke kelas dosen','Buka Presen Go. Gunakan undangan kelas dari dosen agar data kelas terisi, lalu masukkan NIM dan nama sesuai daftar serta PIN akun mahasiswa. Pilih daftar jika belum memiliki akun dan tunggu persetujuan dosen. Jangan memakai akun administrator.','#studentAppDownload','home'),
 step('Izinkan kamera dan lokasi','Berikan izin kamera dan lokasi saat diminta. Aktifkan Lokasi/GPS perangkat sebelum mengirim absensi. Jika ditolak, buka Pengaturan Android → Aplikasi → Presen Go → Izin, lalu aktifkan izin yang diperlukan.','#studentAppDownload','home'),
 step('Absen QR atau wajah','Tunggu dosen membuka sesi pertemuan. Pilih QR lalu arahkan kamera ke seluruh kode terbaru dengan jelas; gunakan gambar QR jika tersedia. Untuk pilihan wajah, daftarkan wajah pemilik akun terlebih dahulu, lalu lakukan verifikasi saat sesi aktif. Keduanya merupakan pilihan cara absen.','#studentAppDownload','home'),
 step('Kirim dan periksa hasil','Ikuti konfirmasi di layar setelah pemindaian atau verifikasi, lalu periksa status berhasil serta riwayat pertemuan. Jika sesi sudah selesai, gunakan sesi baru dari dosen. Jika masih antre/offline, sambungkan internet dan periksa status sinkronisasi sebelum menganggap absensi diterima.','#studentAppDownload','home'),
 step('Sakit atau izin dengan bukti','Pilih Sakit atau Izin pada pertemuan yang sesuai. Isi alasan yang jelas dan lampirkan foto bukti sebelum dikirim. Dosen meninjau permohonan dari Pesan mahasiswa. QR balasan digunakan untuk pengajuan sakit/izin sesuai alur aplikasi, bukan pengganti lokasi yang dimatikan.','#studentAppDownload','home'),
 step('Perbarui tanpa menghapus data','Kembali ke bagian unduhan ini untuk mengambil APK terbaru. Pasang sebagai pembaruan pada aplikasi yang sama. Jangan hapus aplikasi atau data hanya untuk memperbarui. Jika Android menolak pembaruan, simpan pesan kesalahannya dan hubungi pengelola sebelum menghapus apa pun.','#studentAppDownload','home')
]]);

// Keep guidance consistent with the current account-backed workflow.
for(const [,steps] of groups)for(const s of steps){
 if(s.title==='Isi identitas lembar')s.text='Ketuk identitas untuk mengedit. Perubahan disimpan di perangkat dan disinkronkan ke akun saat online. Gunakan kelas dan mata kuliah yang sama di perangkat lain.';
 if(s.title==='Tanggal pertemuan')s.text='Ketuk kotak tanggal untuk memilih atau mengedit tanggal DD/MM/TT. Teks ditampilkan miring tanpa memperbesar kotak tabel. Ukuran berlaku ke semua pertemuan secara bawaan; nonaktifkan pilihan itu jika ingin mengatur satu tanggal saja. Warna, tebal, miring, dan garis bawah ikut tersimpan untuk cetak.';
 if(s.title==='Riwayat kelas')s.text='Pilih prodi, tahun/periode, semester, kelas, mata kuliah, lalu pertemuan. Ringkasan mengikuti pilihan ini. Rekap mahasiswa menampilkan riwayat dalam kelas tersebut; ketuk catatan untuk melihat bukti dan lokasi.';
 if(s.title==='Alamat dan rute')s.text='Saat peta dibuka, izinkan lokasi dosen untuk menampilkan rute otomatis, jarak dan estimasi waktu di panel Google. Posisi dosen diperbarui selama peta terbuka. Tujuan adalah titik mahasiswa saat mengirim absen, bukan pelacakan langsung. Gunakan Perbarui lokasi saya jika GPS belum siap; lokasi awal lain hanya opsi lanjutan.';
 if(s.title==='Bantuan menu')s.text='Ketuk menu untuk langsung berpindah halaman. Pada komputer, arahkan kursor untuk membaca keterangan. Kelas dan mata kuliah tetap mengikuti pilihan Anda.';
 if(s.title==='Perubahan tersimpan')s.text='Perubahan tersimpan di perangkat sebelum berpindah halaman. Sinkronisasi berjalan di latar saat online. Tunggu antrean kosong sebelum membuka data pada perangkat lain.';
 if(['Setujui mahasiswa','Hapus akun percobaan','Terima & setujui'].includes(s.title)){s.prepare=undefined;s.target='#presenInboxLauncher';}
 if(s.title==='Terima & setujui')s.text='Buka Pesan mahasiswa untuk meninjau pendaftaran serta pengajuan sakit/izin dengan alasan dan foto. QR balasan digunakan hanya untuk sakit/izin.';
}
if(['index','data_siswa','absen','ujian'].includes(page))groups.splice(1,0,['Mata kuliah & perangkat',[
 step('Pilih mata kuliah','Pilih mata kuliah tersimpan untuk kelas ini. Pilihan yang sama digunakan oleh data mahasiswa, lembar absen, ujian, dan monitoring.','#teacherCourseSelect','sheet'),
 step('Tambah atau kelola','Ketuk Kelola untuk menambah mata kuliah sendiri atau menghapus pilihan dari daftar. Menghapus pilihan tidak menghapus riwayat absensi atau nilai.','#manageCourses','sheet'),
 step('Buka di perangkat lain','Masuk dengan akun yang sama, lalu pilih kelas dan mata kuliah yang sama. Logo kampus, tampilan, serta pilihan mata kuliah tersimpan di akun.','#courseControl','appearance')
]]);
const host=document.createElement('div');host.className='wa-guide wa-teacher-guide';
host.innerHTML=`<svg class="wa-guide-shade" hidden aria-hidden="true"><path fill-rule="evenodd"></path></svg>
<div class="wa-guide-target" hidden aria-hidden="true"></div>
<svg class="wa-guide-arrow" hidden aria-hidden="true"><defs><marker id="waGuideArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="white" stroke-width="1.5"/></marker></defs><path class="wa-guide-curve" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" marker-end="url(#waGuideArrowHead)"/></svg>
<div class="wa-guide-dock"><button type="button" class="wa-guide-grip" aria-label="Geser posisi panduan">⋮</button><button type="button" class="wa-guide-open" aria-label="Buka panduan" aria-expanded="false">?<span class="wa-guide-dot"></span></button><button type="button" class="wa-guide-hide" aria-label="Perkecil panduan">›</button></div>
<section class="wa-guide-panel" hidden role="region" aria-label="Panduan interaktif">
 <div class="wa-guide-heading"><span>PANDUAN INTERAKTIF</span><button type="button" class="wa-guide-close" aria-label="Tutup panduan">×</button></div>
 <div class="wa-guide-body">
 <label class="wa-guide-topic-label">Topik panduan<select aria-label="Pilih panduan"></select></label>
 <div class="wa-guide-progress"><span></span></div>
 <div class="wa-guide-copy" aria-live="polite"><h3 tabindex="-1"></h3><p class="wa-guide-text"></p><p class="wa-guide-hint" hidden></p></div>
 <details class="wa-guide-example"><summary>Lihat contoh tampilan</summary><img alt="Contoh area yang dijelaskan"></details>

 <details class="wa-guide-status"><summary>Status sinkronisasi</summary><p class="wa-guide-sync"></p><label><input type="checkbox" class="wa-guide-status-toggle"> Tampilkan status di halaman</label></details>
 </div>
 <div class="wa-guide-actions"><button type="button" class="wa-guide-prev">← Kembali</button><span class="wa-guide-count"></span><button type="button" class="wa-guide-next">Lanjut →</button></div>
</section>`;
document.body.append(host);
const q=s=>host.querySelector(s),dock=q('.wa-guide-dock'),panel=q('.wa-guide-panel'),frame=q('.wa-guide-target'),shade=q('.wa-guide-shade'),arrow=q('.wa-guide-arrow'),select=q('select');
let chapter=0,index=0,target=null,returnFocus=null,drag=false,fraction=Number(get('position')||.46),scheduled=0,generation=0,cleanups=[],preparing=null,lastDialog=null;
groups.forEach((g,i)=>select.add(new Option(g[0],i)));dock.classList.toggle('is-small',get('small')==='1');
const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
function viewport(){const v=window.visualViewport;return{x:v?.offsetLeft||0,y:v?.offsetTop||0,w:v?.width||innerWidth,h:v?.height||innerHeight};}
function dockPosition(){const v=viewport();dock.style.top=Math.max(v.y+12,Math.min(v.y+v.h-dock.offsetHeight-12,v.y+v.h*fraction))+'px';}
function attach(){const dialog=[...document.querySelectorAll('dialog[open]')].filter(d=>!host.contains(d)).at(-1),parent=dialog||document.body;if(host.parentElement!==parent)parent.append(host);if(!panel.hidden&&host.showPopover){host.setAttribute('popover','manual');if(lastDialog!==dialog&&host.matches(':popover-open'))host.hidePopover();if(!host.matches(':popover-open'))host.showPopover();}lastDialog=dialog;}
function release(){for(const fn of cleanups.splice(0).reverse())try{fn();}catch(_){}preparing=null;}
function close(){generation++;panel.hidden=frame.hidden=true;shade.setAttribute('hidden','');arrow.setAttribute('hidden','');if(host.hasAttribute('popover')){if(host.matches(':popover-open'))host.hidePopover();host.removeAttribute('popover');}target=null;release();attach();dock.hidden=false;q('.wa-guide-open').setAttribute('aria-expanded','false');if(visible(returnFocus))returnFocus.focus({preventScroll:true});}
function rect(){
 if(!visible(target))return null;const topDialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(topDialog&&!topDialog.contains(target))return null;
 const v=viewport(),raw=target.getBoundingClientRect();let left=Math.max(v.x+8,raw.left-5),right=Math.min(v.x+v.w-8,raw.right+5),top=Math.max(v.y+8,raw.top-5),bottom=Math.min(v.y+v.h-8,raw.bottom+5);
 for(let p=target.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}
 const toolbar=document.getElementById('topToolbar');if(visible(toolbar)&&!toolbar.contains(target)&&getComputedStyle(toolbar).position==='fixed')top=Math.max(top,toolbar.getBoundingClientRect().bottom+6);
 // Large tables/forms are introduced at their top, leaving room for the explanation.
 bottom=Math.min(bottom,top+Math.min(170,v.h*.28));if(right-left<6||bottom-top<6)return null;return{left,right,top,bottom,width:right-left,height:bottom-top};
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function position(){
 dockPosition();if(panel.hidden)return;attach();const v=viewport(),r=rect(),gap=34,pad=12;q('.wa-guide-hint').hidden=!!r;panel.style.maxHeight=Math.min(430,v.h-24)+'px';panel.style.width=Math.min(352,v.w-24)+'px';
 const pw=panel.offsetWidth,ph=panel.offsetHeight;let x=v.x+(v.w-pw)/2,y=v.y+v.h-ph-pad,side='none';
 if(r){const below=v.y+v.h-r.bottom-pad,above=r.top-v.y-pad;
  if(below>=ph+gap){y=r.bottom+gap;x=clamp(r.left+(r.width-pw)/2,v.x+pad,v.x+v.w-pw-pad);side='below';}
  else if(above>=ph+gap){y=r.top-gap-ph;x=clamp(r.left+(r.width-pw)/2,v.x+pad,v.x+v.w-pw-pad);side='above';}
  else if(r.right+gap+pw<v.x+v.w-pad){x=r.right+gap;y=clamp(r.top,v.y+pad,v.y+v.h-ph-pad);side='right';}
  else if(r.left-gap-pw>v.x+pad){x=r.left-gap-pw;y=clamp(r.top,v.y+pad,v.y+v.h-ph-pad);side='left';}
  else{side=above>below?'above':'below';const available=Math.max(110,(side==='above'?above:below)-gap);panel.style.maxHeight=available+'px';const height=panel.offsetHeight;y=side==='above'?r.top-gap-height:r.bottom+gap;}
 }
 panel.style.left=x+'px';panel.style.top=clamp(y,v.y+pad,v.y+v.h-panel.offsetHeight-pad)+'px';panel.dataset.placement=side;
 shade.removeAttribute('hidden');frame.hidden=!r;arrow.toggleAttribute('hidden',!r);for(const svg of[shade,arrow])svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
 const outer=`M0 0H${innerWidth}V${innerHeight}H0Z`,hole=r?`M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`:'';shade.querySelector('path').setAttribute('d',outer+hole);
 if(r){frame.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const box=panel.getBoundingClientRect();let sx,sy,ex,ey;if(side==='below'||side==='above'){sx=clamp(r.left+r.width*.6,box.left+24,box.right-24);sy=side==='below'?box.top:box.bottom;ex=clamp(sx-12,r.left+6,r.right-6);ey=side==='below'?r.bottom+3:r.top-3;}else{sx=side==='right'?box.left:box.right;sy=clamp(r.top+r.height*.5,box.top+25,box.bottom-25);ex=side==='right'?r.right+3:r.left-3;ey=clamp(sy-10,r.top+5,r.bottom-5);}
  q('.wa-guide-curve').setAttribute('d',`M${sx},${sy} Q${(sx+ex)/2+12},${(sy+ey)/2} ${ex},${ey}`);
 }
}
function schedule(){if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;position();});}
function locate(s){
 const matches=[...document.querySelectorAll(s.target)];let el=matches.find(visible)||matches[0];
 for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open){p.open=true;cleanups.push(()=>p.open=false);}
 return el;
}
function prepare(s){
 if(preparing===s.prepare)return;release();preparing=s.prepare;
 const before=new Set(document.querySelectorAll('dialog[open]')),sidebar=document.getElementById('sidebar'),sideOpen=sidebar?.classList.contains('active')||sidebar?.classList.contains('open'),qr=document.getElementById('attendanceQRPanel'),qrHidden=qr?.hidden;
 try{s.prepare?.();}catch(_){}
 for(const dialog of document.querySelectorAll('dialog[open]'))if(!before.has(dialog))cleanups.push(()=>{if(dialog.open)dialog.close();});
 if(sidebar&&!sideOpen&&(sidebar.classList.contains('active')||sidebar.classList.contains('open')))cleanups.push(()=>window.toggleSidebar?.());
 if(qrHidden&&qr&&!qr.hidden)cleanups.push(()=>{if(!qr.hidden)document.getElementById('openAttendanceQR')?.click();});
}
function render(){
 const ticket=++generation,s=groups[chapter][1][index];select.value=String(chapter);prepare(s);attach();target=locate(s);
 q('h3').textContent=s.title;q('.wa-guide-text').textContent=s.text;q('img').src=new URL('guide-images/'+s.image+'.png',rootURL);q('.wa-guide-example').open=false;
 const available=visible(target);q('.wa-guide-hint').hidden=available;q('.wa-guide-hint').textContent='Area ini muncul setelah langkah sebelumnya selesai. Lihat contoh atau lanjutkan panduan; data Anda tidak diubah oleh panduan.';
 q('.wa-guide-count').textContent=`${index+1} / ${groups[chapter][1].length}`;q('.wa-guide-progress span').style.width=((index+1)/groups[chapter][1].length*100)+'%';q('.wa-guide-prev').disabled=index===0;q('.wa-guide-next').textContent=index===groups[chapter][1].length-1?'Selesai ✓':'Lanjut →';
 if(available){const item=target.matches('table,tbody')?target.querySelector('tr')||target:target;item.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});}
 q('.wa-guide-body').scrollTop=0;position();requestAnimationFrame(()=>{if(ticket===generation){position();q('h3').focus({preventScroll:true});}});
}
function open(which=chapter){returnFocus=document.activeElement;chapter=clamp(Number(which)||0,0,groups.length-1);index=0;panel.hidden=false;dock.hidden=true;q('.wa-guide-open').setAttribute('aria-expanded','true');window.PresenWorkspace?.close();render();}
q('.wa-guide-open').onclick=()=>{if(drag)return;if(dock.classList.contains('is-small')){dock.classList.remove('is-small');put('small',0);dockPosition();}else open();};
q('.wa-guide-hide').onclick=()=>{close();dock.classList.add('is-small');put('small',1);dockPosition();};q('.wa-guide-close').onclick=close;
select.onchange=()=>{chapter=Number(select.value);index=0;render();};q('.wa-guide-prev').onclick=()=>{index=Math.max(0,index-1);render();};q('.wa-guide-next').onclick=()=>{if(index===groups[chapter][1].length-1)close();else{index++;render();}};
const toggle=q('.wa-guide-status-toggle');toggle.checked=get('status')==='1';toggle.onchange=()=>{put('status',toggle.checked?'1':'0');document.documentElement.dataset.waShowStatus=toggle.checked?'1':'0';};
const grip=q('.wa-guide-grip');grip.onpointerdown=e=>{drag=true;grip.setPointerCapture(e.pointerId);};grip.onpointermove=e=>{if(!drag)return;const v=viewport();fraction=(e.clientY-v.y)/v.h;dockPosition();};grip.onpointerup=()=>{drag=false;put('position',fraction);};grip.onpointercancel=()=>drag=false;
async function status(){let s;try{s=await window.WA?.get();}catch(_){}const pending=s?.outbox?.length||0;q('.wa-guide-dot').classList.toggle('pending',!navigator.onLine||pending>0);q('.wa-guide-sync').textContent=(navigator.onLine?'Online':'Offline')+' · '+pending+' perubahan menunggu sinkronisasi';}
void status();window.WA?.on(()=>void status());window.addEventListener('online',status);window.addEventListener('offline',status);
new MutationObserver(records=>{if(panel.hidden||records.every(r=>host.contains(r.target)))return;attach();target=[...document.querySelectorAll(groups[chapter][1][index].target)].find(visible)||target;schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden','class']});
window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);q('.wa-guide-example').addEventListener('toggle',schedule);q('img').onload=schedule;
document.addEventListener('keydown',e=>{if(panel.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(!e.target.matches('input,select,textarea,[contenteditable=true]')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();q(e.key==='ArrowRight'?'.wa-guide-next':'.wa-guide-prev').click();}},true);
// Both the ribbon Panduan button and edge help use this one tour; no stacked legacy overlay.
document.addEventListener('click',e=>{if(e.target.closest('#tourBtnGuide,[onclick*="mulaiTurInteraktif"]')){e.preventDefault();e.stopImmediatePropagation();open(0);}},true);
window.mulaiTurInteraktif=()=>open(0);window.tutupTurInteraktif=close;
window.PresenTeacherGuide={open,close,groups:groups.map(g=>({title:g[0],steps:g[1].map(s=>({title:s.title,target:s.target}))}))};dockPosition();
})();

})();

} catch(error) {console.error("Teacher module app/teacher-guide.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* app/qr-files.js */
try {
/* Share sharp QR images with an opaque quiet zone; decode files without screenshots. */
(() => {
  'use strict';
  async function png(code) {
    const qr = qrcode(0, code.length > 1800 ? 'L' : 'M'); qr.addData(code,/^WA[23]:/.test(code)?'Alphanumeric':'Byte'); qr.make();
    const count = qr.getModuleCount(), cell = 8, margin = 8;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = (count + margin * 2) * cell;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++)
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Gambar QR belum dapat dibuat.')), 'image/png'));
  }
  async function read(file) {
    if (!file || file.size > 12000000) throw Error('Pilih file QR PNG/JPG/SVG di bawah 12 MB.');
    let source = file;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml'), svg = doc.documentElement;
      if (svg.localName !== 'svg') throw Error('File SVG QR tidak valid.');
      const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (box.length === 4 && box[2] > 0 && box[3] > 0) { svg.setAttribute('width', box[2]); svg.setAttribute('height', box[3]); }
      source = new Blob([new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'});
    }
    const src = URL.createObjectURL(source), img = new Image();
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('Format gambar belum didukung. Pilih file PNG/JPG/SVG yang dibagikan dosen.')); img.src = src; });
      const width = img.naturalWidth, height = img.naturalHeight;
      if (!width || !height || width * height > 60000000) throw Error('Ukuran gambar QR terlalu besar.');
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', {willReadFrequently:true});
      for (const limit of [1600, 1000, 700, 2400]) {
        const scale = Math.min(1, limit / Math.max(width, height));
        const w = Math.round(width * scale), h = Math.round(height * scale), pad = 32;
        canvas.width = w + pad * 2; canvas.height = h + pad * 2;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, pad, pad, w, h);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts:'attemptBoth'});
        if (result) return result.data;
      }
      throw Error('QR belum terbaca. Pilih file asli yang dibagikan dosen, atau tempel kode QR.');
    } finally { URL.revokeObjectURL(src); }
  }
  window.WAQRFiles = {png, read};
})();

} catch(error) {console.error("Teacher module app/qr-files.js failed",error);window.PresenTeacherStartup?.fail();}

;
/* assets/sheet-print-grid.js */
try {
/* One vector edge per table boundary. CSS border space is retained, but its
   ink is hidden while these strokes print, so borders never stack or thicken. */
(()=>{
 'use strict';
 const selector='#tabelAbsen,#examTableBlock table,#examScaleBlock table,#tabelRekapNilai,#rekapModalOverlay .grade-rubric';
 const ns='http://www.w3.org/2000/svg';let drawing=false;
 document.documentElement.classList.add('wa-vector-print-ready');
 function clear(){document.querySelectorAll('.wa-print-grid').forEach(svg=>svg.remove());document.querySelectorAll('[data-wa-print-grid-host]').forEach(cell=>cell.removeAttribute('data-wa-print-grid-host'));document.querySelectorAll('[data-wa-vector-grid]').forEach(table=>table.removeAttribute('data-wa-vector-grid'));}
 function drawGroup(table,group,cells){
  const origin=group.getBoundingClientRect();if(!origin.width||!origin.height)return;
  const collapsed=getComputedStyle(table).borderCollapse==='collapse',tableBox=table.getBoundingClientRect(),segments=new Map();
  function edge(axis,position,start,end,outer=false){
   const key=Number(outer)+axis+':'+Math.round(position*32),item=segments.get(key)||{axis,position,ranges:[],outer};
   item.ranges.push([start,end]);segments.set(key,item);
  }
  for(const cell of cells){
   const r=cell.getBoundingClientRect(),style=getComputedStyle(cell),x=r.left-origin.left,y=r.top-origin.top;
   for(const side of ['Top','Right','Bottom','Left']){
    if(side==='Top'&&Math.abs(r.top-tableBox.top)>1)continue;
    if(side==='Left'&&Math.abs(r.left-tableBox.left)>1)continue;
    const width=parseFloat(style['border'+side+'Width']);if(!width||style['border'+side+'Style']==='none')continue;
    // Keep the whole outer stroke inside the paper/modal clipping box.
    const outer=side==='Top'||side==='Left'||(side==='Right'?Math.abs(r.right-tableBox.right)<1:Math.abs(r.bottom-tableBox.bottom)<1);
    const inset=collapsed?0:outer?1:width/2;
    if(side==='Top')edge('h',y+inset,x,x+r.width,true);
    if(side==='Bottom')edge('h',y+r.height-inset,x,x+r.width,Math.abs(r.bottom-tableBox.bottom)<1);
    if(side==='Left')edge('v',x+inset,y,y+r.height,true);
    if(side==='Right')edge('v',x+r.width-inset,y,y+r.height,Math.abs(r.right-tableBox.right)<1);
   }
  }
  const paths={inner:'',outer:''};
  for(const {axis,position,ranges,outer} of segments.values()){
   ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
   for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1]+.1)last[1]=Math.max(last[1],range[1]);else merged.push(range.slice());}
   for(const [a,b]of merged)paths[outer?'outer':'inner']+=axis==='h'?`M${a},${position}H${b}`:`M${position},${a}V${b}`;
  }
  const svg=document.createElementNS(ns,'svg');
  svg.classList.add('wa-print-grid');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox',`0 0 ${origin.width} ${origin.height}`);svg.setAttribute('preserveAspectRatio','none');
  svg.style.width=svg.style.height='100%';
  for(const [kind,path]of Object.entries(paths)){if(!path)continue;const ink=document.createElementNS(ns,'path');ink.setAttribute('d',path);ink.setAttribute('fill','none');ink.setAttribute('stroke','#000');ink.setAttribute('stroke-width',kind==='outer'?String(4/3):'1');ink.setAttribute('stroke-linecap','square');ink.setAttribute('vector-effect','non-scaling-stroke');svg.append(ink);}
  // An SVG directly inside TR/THEAD creates anonymous table boxes in print.
  // Keep it out of flow inside a real cell, then align it to the whole group.
  const host=cells[0];if(!host)return;host.setAttribute('data-wa-print-grid-host','');
  host.append(svg);const painted=svg.getBoundingClientRect();
  if(!painted.width||!painted.height){svg.remove();host.removeAttribute('data-wa-print-grid-host');return;}
  svg.style.width=(origin.width/painted.width*100)+'%';svg.style.height=(origin.height/painted.height*100)+'%';
  svg.style.left=(origin.left-painted.left)+'px';svg.style.top=(origin.top-painted.top)+'px';
 }
 function draw(){
  if(drawing||!matchMedia('print').matches)return;drawing=true;
  try{clear();window.WAFitSheetText?.();for(const table of document.querySelectorAll(selector)){
   if(!table.getClientRects().length)continue;
   // Repeated headers and individual unbroken rows carry their own strokes
   // when Chromium splits a long table across PDF pages.
   if(table.tHead)drawGroup(table,table.tHead,[...table.tHead.querySelectorAll('th,td')]);
   for(const body of table.tBodies)for(const row of body.rows)if(!row.classList.contains('page-preview-only'))drawGroup(table,row,[...row.cells]);
   if(table.querySelector('.wa-print-grid'))table.setAttribute('data-wa-vector-grid','');
  }}finally{drawing=false;}
 }
 window.WAPrintGrid={draw,clear};window.addEventListener('beforeprint',draw);window.addEventListener('afterprint',clear);
 matchMedia('print').addEventListener('change',e=>{if(e.matches)draw();else clear();});
})();

} catch(error) {console.error("Teacher module assets/sheet-print-grid.js failed",error);window.PresenTeacherStartup?.fail();}

window.PresenTeacherStartup?.core();
}
