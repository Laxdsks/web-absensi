/* QR and device tools belong to the original teacher pages, never a second dashboard. */
(async () => {
  'use strict';
  const host = document.getElementById('teacherTools');
  if (!host || !window.WA) return;
  const $ = selector => host.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sheet = host.dataset.page === 'absen', params = new URLSearchParams(location.search);
  let sessionQR = null, stream = null, scanTimer, renderKey = '', rendering = false;
  const notify = text => { $('#toolNotice').textContent = text; if(host.hidden) window.showToast?.(escape(text),'error'); };
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
    sessionQR = session;
    const qr = qrcode(0, 'M');
    qr.addData(WA.qr('session', state.profile.certificate, 'challenge', session.challenge)); qr.make();
    $('#codeTitle').textContent = session.matkul + ' · pertemuan ' + session.slot;
    $('#codeImage').innerHTML = qr.createSvgTag({cellSize:4, margin:6, scalable:true});
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
    void WA.get().then(state => {
      const now = WA.now(state);
      host.querySelectorAll('[data-end]').forEach(el => {
        const left = Math.max(0,Math.ceil((Number(el.dataset.end)-now)/1000));
        el.textContent = left ? Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' tersisa' : 'Absen ditutup · A otomatis';
      });
      if ($('#countdown')) $('#countdown').textContent = sessionQR ? Math.max(0,Math.ceil((sessionQR.deadline-now)/1000))+' detik tersisa' : '';
    });
  }
  function initialize(state) {
    host.hidden = false;
    const body = sheet ? `<form id="sessionForm"><label>Mata kuliah<input name="matkul" maxlength="180" required></label><div class="tool-grid"><label>Pertemuan<input name="slot" type="number" min="1" max="16" value="1" required></label><label>Durasi (menit)<input name="minutes" type="number" min="1" max="1440" placeholder="Misalnya 10" required></label></div><p>QR berlaku untuk kelas pada lembar ini. Sesudah waktu habis, mahasiswa yang belum tercatat mendapat A.</p><button id="startSession" type="submit">Mulai Absen / reset QR</button><button id="scanReply" type="button">Pindai QR mahasiswa</button><div id="sessionList"></div></form>` : '';
    $('#toolBody').innerHTML = body + '<div id="toolResults"></div>' + (!sheet ? `<details><summary>Cadangan perangkat</summary><button id="backup" type="button">Simpan cadangan</button><label>Pulihkan cadangan JSON<input id="restore" type="file" accept="application/json,.json"></label><p>Sinkronkan data pada aplikasi lama sebelum beralih. Cadangan tidak menyertakan akses login atau kunci QR.</p></details>` : '');
    if (sheet) {
      const form = $('#sessionForm');
      form.elements.matkul.value = params.get('matkul') || '';
      form.elements.slot.value = state.selection?.slot || 1;
      if(params.get('qrMinutes')) form.elements.minutes.value=params.get('qrMinutes');
      form.onchange = () => { renderKey = ''; void render(); };
      form.onsubmit = event => {
        event.preventDefault();
        void run(async () => {
          if (!window.WASheetReady) throw Error('Tunggu data lembar selesai dimuat.');
          const s = await WA.get(), c = context(s), values = Object.fromEntries(new FormData(form));
          const name = values.matkul.trim();
          const displayed = document.querySelector('[data-app-course]');
          if (displayed && displayed.textContent.trim() !== name) {
            const url = new URL(location.href); url.searchParams.set('matkul',name); url.searchParams.set('qr','1');url.searchParams.set('qrMinutes',values.minutes);
            await WA.change(old => ({...old,selection:{...c,matkul:name,slot:Number(values.slot)}}));
            location.assign(url.href); return;
          }
          const session = await WA.startSession(c,name,Number(values.slot),Number(values.minutes));
          await showQR(session); notify('Absen dimulai. Kehadiran dicatat pada tabel asli di lembar ini.');
        }, $('#startSession'));
      };
      $('#scanReply').onclick = () => void startScan();
      $('#stopScan').onclick = stopScan;
      $('#scanner').addEventListener('close',stopScan);
      $('#readText').onclick = () => void run(() => receive($('#qrText').value.trim()));
      $('#qrImage').onchange = event => void run(async () => {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 12000000) throw Error('Pilih foto QR di bawah 12 MB.');
        const img = await createImageBitmap(file), canvas = $('#scanCanvas'); canvas.width=img.width; canvas.height=img.height;
        const ctx = canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height), qr=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'}); img.close();
        if (!qr) throw Error('QR belum terbaca. Gunakan foto lebih jelas.'); await receive(qr.data);
      });
      $('#closeCode').onclick = () => $('#codeDialog').close();
      $('#shareCode').onclick = () => void run(async () => {
        const svg=$('#codeImage svg'), url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
        try {
          const img = new Image(); await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
          const canvas = document.createElement('canvas'); canvas.width=canvas.height=1000; canvas.getContext('2d').drawImage(img,0,0,1000,1000);
          const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')), file=new File([png],'absensi-qr.png',{type:'image/png'});
          if (navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:$('#codeTitle').textContent});
          else await download(png,'absensi-qr.png');
        } finally { URL.revokeObjectURL(url); }
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
      const state=await WA.get();
      if(state.profile?.role!=='teacher'){host.hidden=true;return;}
      if(!$('#toolResults')) initialize(state);
      $('#toolConnection').textContent=(navigator.onLine?'Online':'Offline')+' · '+state.outbox.length+' perubahan belum tersinkron';
      const c=context(state), scope=sheet?await WA.scope(c,course()):null;
      const key=JSON.stringify([scope,state.snapshot.roster,state.snapshot.sessions,state.snapshot.marks,state.snapshot.registrations,state.outbox]); if(key===renderKey) return; renderKey=key;
      const sessions=state.snapshot.sessions.filter(x=>x.scope===scope), marks=state.snapshot.marks.filter(x=>x.scope===scope);
      if(sheet) {
        $('#sessionList').innerHTML=sessions.map(x=>`<div class="tool-card">Pertemuan ${x.slot} · ${escape(x.day)} <b data-end="${x.deadline}"></b><button type="button" data-session="${x.id}">Tampilkan QR</button></div>`).join('');
        host.querySelectorAll('[data-session]').forEach(button=>button.onclick=()=>void run(()=>showQR(sessions.find(x=>x.id===button.dataset.session))));
      }
      const registrations=state.snapshot.registrations.filter(x=>!x.approved), pending=marks.filter(x=>['S','I'].includes(x.mark));
      $('#toolResults').innerHTML=(!sheet?`<details><summary>Persetujuan akun mahasiswa (${registrations.length})</summary>${registrations.map(x=>{const match=state.snapshot.roster.find(r=>WA.sameCtx(r,x.ctx)&&r.nim===x.nim);return `<div class="tool-card"><b>${escape(x.nama)} · ${escape(x.nim)}</b><p>${escape(x.ctx.prodi)} · semester ${escape(x.ctx.semester)} · kelas ${escape(x.ctx.kelas)}</p><p>${match?'Nama pada daftar: '+escape(match.nama):'NIM belum ada pada daftar. Persetujuan menambahkan mahasiswa ini.'}</p><button type="button" data-approve="${x.id}">Setujui setelah dicocokkan</button></div>`;}).join('')||'<p>Belum ada pendaftaran menunggu.</p>'}</details>`:`<details><summary>Keterangan sakit & izin (${pending.length})</summary>${pending.map(x=>`<div class="tool-card"><b>${escape(x.nim)} · ${x.mark} · pertemuan ${x.slot}</b><p>${escape(x.reason)}</p><p>${x.location?`Lokasi: ${x.location.lat.toFixed(5)}, ${x.location.lon.toFixed(5)} · akurasi ±${Math.round(x.location.accuracy)} m`:'Lokasi tidak disertakan.'}</p><span>Status: ${escape(x.review_status)}</span><button type="button" data-review="${escape(x.nim)}:${x.slot}" data-status="accepted">Tandai sudah ditinjau</button><button type="button" data-review="${escape(x.nim)}:${x.slot}" data-status="rejected">Ubah menjadi A</button></div>`).join('')||'<p>Belum ada keterangan S/I.</p>'}</details>`)+`<details><summary>Perubahan belum tersinkron (${state.outbox.length})</summary>${state.outbox.filter(x=>x.problem).map(x=>`<div class="tool-card"><p>${escape(x.problem.message||'Ada perubahan pada perangkat lain.')}</p><button type="button" data-resolve="${x.id}" data-keep="1">Kirim salinan perangkat ini</button><button type="button" data-resolve="${x.id}" data-keep="0">Gunakan data server</button></div>`).join('')||'<p>Perubahan tersimpan di perangkat sampai server menerima sinkronisasi.</p>'}</details>`;
      host.querySelectorAll('[data-approve]').forEach(button=>button.onclick=()=>void run(()=>WA.queue({type:'approve',account:button.dataset.approve}),button));
      host.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>void run(async()=>{const[nim,slot]=button.dataset.review.split(':'),mark=marks.find(x=>x.nim===nim&&x.slot===Number(slot)); await WA.queue({type:'review',ctx:c,matkul:course(),nim,slot:Number(slot),mark:button.dataset.status==='rejected'?'A':mark.mark,reason:mark.reason,review_status:button.dataset.status,baseRevision:mark.revision});},button));
      host.querySelectorAll('[data-resolve]').forEach(button=>button.onclick=()=>void run(()=>WA.resolve(button.dataset.resolve,button.dataset.keep==='1'),button));
      clock();
    } finally {rendering=false;}
  }
  if(!sheet) {
    window.WATeacher={login:async()=>run(async()=>{
      const fields={username:document.getElementById('authLogName').value,password:document.getElementById('authLogPass').value};
      await WA.login('teacher',fields);location.reload();
    })};
    const originalOnload=window.onload;
    window.onload=async event=>{
      const state=await WA.get();
      window.SERVER_CONFIG.isLoggedIn=state.profile?.role==='teacher'||window.SERVER_CONFIG.isLoggedIn;
      originalOnload?.call(window,event);
    };
    const state=await WA.get();
    if(state.profile?.role==='teacher') {
      window.SERVER_CONFIG.isLoggedIn=true;
      document.getElementById('authOverlay').style.display='none';
    }
  } else {
    document.getElementById('openAttendanceQR').onclick=()=>{
      if(!$('#toolResults')){notify('Tunggu data lembar selesai dimuat, lalu coba lagi.');return;}
      const displayed=document.querySelector('[data-app-course]');
      if(displayed) $('#sessionForm').elements.matkul.value=displayed.textContent.trim();
      renderKey='';void render();document.getElementById('attendanceQRPanel').showModal();
    };
    document.getElementById('closeAttendanceQR').onclick=()=>document.getElementById('attendanceQRPanel').close();
  }
  let state=await WA.get();
  if(!state.profile&&navigator.onLine) {try {await WA.bootstrap();state=await WA.get();} catch (_) {}}
  if(!sheet&&state.profile?.role==='teacher') {window.SERVER_CONFIG.isLoggedIn=true;document.getElementById('authOverlay').style.display='none';}
  WA.on(()=>void render());window.addEventListener('online',()=>void render());window.addEventListener('offline',()=>void render());
  await render();
  if(state.profile?.role==='teacher') {void WA.prepareOffline();void WA.sync();}
  setInterval(()=>{clock();void WA.get().then(state=>{
    if(state.profile?.role==='teacher'&&state.snapshot.sessions.some(session=>session.deadline<=WA.now(state)&&session.roster.some(nim=>!state.snapshot.marks.some(mark=>mark.scope===session.scope&&mark.slot===session.slot&&mark.nim===nim)))) void WA.finalize();
  });},1000);
  setInterval(()=>void WA.sync(),5000);
  if(sheet&&params.get('qr')==='1') document.getElementById('attendanceQRPanel').showModal();
})();
