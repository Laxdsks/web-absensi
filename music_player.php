<?php
session_start();
require_once __DIR__ . '/auth_guard.php';
app_require_authenticated_user();
$allowedThemes = ['malam', 'putih', 'samudra', 'senja'];
$theme = (string)($_GET['theme'] ?? ($_SESSION['theme'] ?? 'malam'));
if (!in_array($theme, $allowedThemes, true)) $theme = 'malam';
$_SESSION['theme'] = $theme;
?>
<!doctype html>
<html lang="id" data-theme="<?php echo htmlspecialchars($theme, ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>Pemutar Musik</title>
    <script src="assets/app-audio.js" defer></script>
    <style>
        *{box-sizing:border-box}body{margin:0;padding:16px;background:#0b1220;color:#f8fafc;font:14px Arial,sans-serif;--panel:#111c30;--border:#334155;--text:#f8fafc;--muted:#cbd5e1}
        html[data-theme="putih"] body{background:#edf2f8;color:#0f172a;--panel:#fff;--border:#cbd5e1;--text:#0f172a;--muted:#475569}
        html[data-theme="samudra"] body{background:#064766;color:#f0f9ff;--panel:#082f49;--border:#38bdf866;--text:#f0f9ff;--muted:#bae6fd}
        html[data-theme="senja"] body{background:#4c1026;color:#fff1f2;--panel:#500e28;--border:#fda4af66;--text:#fff1f2;--muted:#fecdd3}
        .player{max-width:560px;margin:0 auto;padding:18px;border:1px solid var(--border);border-radius:16px;background:var(--panel);box-shadow:0 14px 38px #0005}
        header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}h1{font-size:20px;margin:0}button,input{font:inherit}button{min-height:42px;padding:9px 12px;border:1px solid var(--border);border-radius:9px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;touch-action:manipulation}button.secondary{background:transparent;color:var(--text)}
        .search{display:flex;gap:8px}.search input{min-width:0;flex:1;min-height:44px;padding:10px;border:1px solid var(--border);border-radius:9px;background:transparent;color:var(--text)}
        .hint{color:var(--muted);font-size:12px;line-height:1.5;margin:10px 0}.results{display:grid;gap:7px;max-height:40vh;overflow:auto;margin:12px 0;padding:0;list-style:none}.results button{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;background:transparent;color:var(--text)}.results small{color:var(--muted);font-weight:400}
        .now{padding:12px;border:1px solid var(--border);border-radius:11px;margin-top:12px}.track-title{font-weight:700;overflow-wrap:anywhere;margin:0 0 8px}.now audio{width:100%;height:40px}.controls{display:flex;align-items:center;gap:10px;margin-top:8px}.controls input{flex:1;min-width:80px}.status{min-height:20px;color:var(--muted);font-size:12px;margin-top:9px}.badge{display:inline-block;padding:4px 7px;border-radius:99px;background:#10b98122;color:#10b981;font-size:11px;font-weight:700}
        @media(max-width:420px){body{padding:8px}.player{padding:13px}.search{flex-wrap:wrap}.search button{width:100%}}
    </style>
</head>
<body>
<main class="player">
    <header><h1>♫ Pemutar Musik</h1><button class="secondary" type="button" onclick="window.close()" title="Tutup pemutar">Tutup</button></header>
    <span class="badge">Audio arsip langsung · tanpa pemutar iklan</span>
    <p class="hint">Cari judul lagu atau nama artis. Audio diputar dari Internet Archive; biarkan jendela ini terbuka agar musik tetap lanjut saat membuka halaman lain.</p>
    <form class="search" id="searchForm"><input id="searchQuery" type="search" placeholder="Contoh: musik piano santai" aria-label="Cari audio"><button type="submit">Cari audio</button></form>
    <div id="status" class="status" role="status">Ketik judul atau artis untuk mencari audio.</div>
    <ul id="results" class="results"></ul>
    <section class="now" aria-label="Kontrol audio">
        <p id="trackTitle" class="track-title">Belum ada audio diputar</p>
        <audio id="musicAudio" controls preload="none"></audio>
        <div class="controls"><button type="button" class="secondary" id="muteButton">Senyapkan</button><label for="volume">Volume</label><input id="volume" type="range" min="0" max="100" value="35"></div>
    </section>
</main>
<script>
    const audio=document.getElementById('musicAudio'),statusBox=document.getElementById('status'),resultsBox=document.getElementById('results');
    const MUSIC_KEY='absensi_music_track_v1',MUSIC_SETTINGS_KEY='absensi_music_settings_v1';
    let musicSettings={volume:35,muted:false};
    try{musicSettings={...musicSettings,...JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY)||'{}')};}catch(error){}
    musicSettings.volume=Math.max(0,Math.min(100,Number(musicSettings.volume)||0));musicSettings.muted=Boolean(musicSettings.muted);
    document.getElementById('volume').value=String(musicSettings.volume);
    audio.volume=Math.max(0,Math.min(100,Number(musicSettings.volume)||0))/100;audio.muted=Boolean(musicSettings.muted);
    document.getElementById('muteButton').textContent=audio.muted?'Nyalakan':'Senyapkan';
    document.getElementById('volume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;musicSettings.volume=Number(event.target.value);simpanPengaturanMusik();});
    document.getElementById('muteButton').addEventListener('click',()=>{audio.muted=!audio.muted;musicSettings.muted=audio.muted;document.getElementById('muteButton').textContent=audio.muted?'Nyalakan':'Senyapkan';simpanPengaturanMusik();});
    function simpanPengaturanMusik(){try{localStorage.setItem(MUSIC_SETTINGS_KEY,JSON.stringify(musicSettings));}catch(error){}}
    function setStatus(text){statusBox.textContent=text;}
    function buatHasil(item){
        const li=document.createElement('li'),button=document.createElement('button'),title=document.createElement('span'),meta=document.createElement('small');
        title.textContent=item.title||item.identifier;meta.textContent=[item.creator,item.year].filter(Boolean).join(' · ')||'Internet Archive';button.append(title,meta);button.addEventListener('click',()=>putarAudio(item));li.appendChild(button);return li;
    }
    function escapeLucene(word){return word.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g,'\\$&');}
    async function cariAudio(event){
        event?.preventDefault();const query=document.getElementById('searchQuery').value.trim();if(query.length<2){setStatus('Masukkan setidaknya dua karakter.');return;}
        resultsBox.replaceChildren();setStatus('Mencari audio tanpa iklan…');
        try{
            const terms=query.split(/\s+/).map(escapeLucene),group=terms.map(word=>`(title:${word} OR creator:${word})`).join(' AND ');
            const params=new URLSearchParams({q:`mediatype:audio AND ${group}`,rows:'25',page:'1',output:'json'});
            ['identifier','title','creator','date','year'].forEach(field=>params.append('fl[]',field));
            const response=await fetch('https://archive.org/advancedsearch.php?'+params.toString());if(!response.ok)throw new Error('Layanan pencarian tidak merespons.');
            const data=await response.json(),docs=data.response?.docs||[];if(!docs.length){setStatus('Tidak ada hasil. Coba kata kunci artis atau judul yang lebih singkat.');return;}
            setStatus(`Memeriksa berkas audio dari ${docs.length} hasil…`);
            const playable=(await Promise.all(docs.map(async doc=>{
                try{
                    const metaResponse=await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);if(!metaResponse.ok)return null;
                    const meta=await metaResponse.json(),files=(meta.files||[]).filter(file=>!file.private&&/\.(mp3|ogg|m4a)$/i.test(file.name||''));if(!files.length)return null;
                    const file=files.sort((a,b)=>Number(a.size||0)-Number(b.size||0))[0];
                    const url='https://archive.org/download/'+encodeURIComponent(doc.identifier)+'/'+file.name.split('/').map(encodeURIComponent).join('/');
                    return {identifier:doc.identifier,title:doc.title||file.title||doc.identifier,creator:Array.isArray(doc.creator)?doc.creator.join(', '):doc.creator||'',year:doc.year||String(doc.date||'').slice(0,4),url};
                }catch(error){return null;}
            }))).filter(Boolean);
            if(!playable.length){setStatus('Hasil ditemukan, tetapi belum ada berkas MP3/OGG/M4A yang bisa diputar. Coba kata kunci lain.');return;}
            resultsBox.replaceChildren(...playable.slice(0,12).map(buatHasil));setStatus(`${playable.length} audio siap diputar. Pilih salah satu judul.`);
        }catch(error){setStatus('Pencarian gagal. Periksa sambungan internet lalu coba lagi.');}
    }
    async function putarAudio(item){
        audio.src=item.url;document.getElementById('trackTitle').textContent=`${item.title}${item.creator?' — '+item.creator:''}`;
        try{localStorage.setItem(MUSIC_KEY,JSON.stringify(item));}catch(error){}
        setStatus('Memuat audio…');try{await audio.play();setStatus('Sedang diputar. Jendela ini boleh dibiarkan di latar belakang.');}catch(error){setStatus('Tekan tombol putar pada kontrol audio untuk mulai.');}
    }
    document.getElementById('searchForm').addEventListener('submit',cariAudio);
    try{const saved=JSON.parse(localStorage.getItem(MUSIC_KEY)||'null');if(saved?.url){audio.src=saved.url;document.getElementById('trackTitle').textContent=`${saved.title||'Audio tersimpan'}${saved.creator?' — '+saved.creator:''}`;}}
    catch(error){}
</script>
</body>
</html>
