# Serah terima pengembangan 1.1.0 — belum diterbitkan

Dicatat 12 Oktober 2026. Branch `feat/portal-location-accounts` menyimpan pekerjaan yang sebelumnya hanya berada di workspace percakapan lama. Penyimpanan branch ini bukan merge, deployment, atau rilis. Hosting dan paket terverifikasi sebelumnya tetap 1.0.8.

## Penyelesaian signing pada workspace asal

Pengujian ulang menemukan respons sinkronisasi terlambat sesudah logout/hapus akun yang dapat memulihkan profil lama atau menandai sesi kosong sebagai kedaluwarsa. Respons dan error sinkronisasi kini terikat ke token pembuat permintaan dan diabaikan jika token berubah. Dua uji tertunda yang mereproduksi kedua kegagalan sudah lulus setelah perbaikan. Entry/runtime offline dan kedua APK signed sudah dibangun ulang agar memuat perbaikan ini. Pemeriksaan UIAutomator memiliki retry terbatas untuk kegagalan proses emulator sementara; setelah selesai menguji satu peran, prosesnya dihentikan tanpa menghapus data sebelum peran berikutnya diuji.

Kunci Android 2 yang tersimpan di luar repository masih tersedia pada workspace asal. Kedua APK 1.1.0/versionCode 10 berhasil dibangun dan ditandatangani dengan kunci yang sama. Verifikasi sertifikat reusable, ID terpisah dari APK lama, upgrade dari 1.0.8, dan aset offline lulus. Pemeriksaan tidak menemukan keystore atau kata sandi signing dalam proyek/paket. Hanya APK publik signed yang disimpan pada branch artifact; `native/android/bootstrap-apks.json` kini mematok commit, hash APK dan fingerprint source 1.1.0. Empat Repository Secrets belum diisi dan tidak diperlukan untuk memakai pin yang cocok dengan source ini. Perubahan source input berikutnya membutuhkan build signed dan pin baru atau Secrets tersebut.

Alat connector GitHub pada workspace asal tersedia untuk PR/status/merge, sehingga perubahan kebijakan jaringan `api.github.com` pada workspace penerus tidak diperlukan untuk menyelesaikan jalur ini. CI Windows pada run `38235683371` sudah diverifikasi berhasil. Pengujian pemasangan emulator terhadap APK signed, PR, merge, deployment dan publikasi masih harus diperiksa sebelum mengklaim rilis selesai. Bagian kendala dan pin 1.0.8 di bawah merupakan catatan historis yang telah digantikan oleh pembaruan ini.

## Pembaruan verifikasi pada workspace penerus

Source dipulihkan dari commit `df389b1f79d91c2f9b83b7d4e44d23aa2f2ef7f6`. Catatan kegagalan di bagian historis bawah telah ditindaklanjuti:

- Uji musik kini membedakan popup desktop, panel Android/Windows, dan fallback popup diblokir. WAV lokal benar-benar diputar; identitas dokumen pemutar, sumber audio, status pemutaran dan waktu diperiksa setelah navigasi/reopen. Launcher child membuka pemutar induk tanpa duplikasi.
- Ditemukan dan diperbaiki jalur tautan lembar pada `assets/offline-bridge.js`: setelah `WAFlush`, navigasi memakai `AbsensiUIAudio.navigateApplication` agar dokumen induk dan musik bertahan. Uji tautan lembar juga memastikan edit tahun akademik tersimpan sebelum perpindahan.
- Full browser regression pada source setelah perbaikan: **61/61 lulus**, 0 gagal/skip. `npm run check`, lint sembilan halaman/backend PHP, YAML workflow, dan manifest deploy juga lulus. Fixture memakai server loopback dan database terpisah `web_absensi_handoff_test`.
- Panduan beranda, login dosen, lembar, QR dosen dan QR mahasiswa diambil ulang setelah uji fitur lulus; screenshot HP tersimpan pada direktori audit. Capture tidak lagi memerlukan direktori privat workspace lama.
- Kedua APK release 1.1.0/versionCode 10 berhasil dikompilasi dengan JDK 21, SDK 35 dan Gradle 8.11.1. Verifikasi paket memeriksa 299 aset dosen dan 22 aset mahasiswa, ID yang tetap, serta isolasi bundle mahasiswa. **Paket lokal ini unsigned dan bukan paket pemasangan/rilis.** Perbaikan `R.drawable.ic_attendance` sudah lolos kompilasi; kunci Android 2 tidak dibuat ulang.
- Verifikasi paket Android/Windows sekarang juga memeriksa skrip dan template musik. Release workflow memerlukan APK signed yang siap, kedua APK dan EXE dengan versi yang sama; rilis Windows saja tidak dipublikasikan ketika signing Android belum tersedia. Build workflow dapat berjalan pada push branch ini untuk memeriksa native Windows/Android sebelum merge.
- Pembuka `docs/APLIKASI.md` mengarahkan ke rilis yang sudah terbit dan tidak lagi mengklaim paket 1.1.0 sudah tersedia.

Log pemeriksaan terbaru berada di `/workspace/scratch/handoff-audit/`: `full-tests-1.1.0-final.log`, `music-anchor-before.log`, `music-anchor-after.log`, `android-build-1.1.0-final.log`, `android-unsigned-verification.json`, dan log build/verifikasi Windows. Selesaikan dan periksa hasil build Windows final sebelum menganggap paket tersebut final.

Masih diperlukan: akses API GitHub (`api.github.com`) untuk PR/status CI dan pemeriksaan nama Repository Secrets; signing Android 2 melalui kunci asli atau empat `ANDROID_V2_*` Secrets; uji native CI, immutable signed APK pin bila dipakai, merge, deployment dan publikasi terverifikasi. API ditolak oleh jaringan workspace ini, sementara Git read bekerja. Usulan perubahan jaringan tidak berhasil disimpan karena draf lingkungan tidak dapat diedit; usulan nonrahasia disimpan di direktori audit. Keberadaan Secrets di GitHub belum dapat dipastikan. Manifest bootstrap masih untuk 1.0.8 dan tidak boleh diganti dengan APK unsigned.

## Keputusan pengguna

- Satu website dosen asli: https://datasiswasekolah.42web.io/index.php . Jangan membuat portal dosen kedua. `/app/?role=student` hanya untuk mahasiswa.
- Presen Pro (Android dosen), Presen Desk (Windows dosen), Presen Go (Android mahasiswa). Pertahankan fitur dan data lama.
- Referensi desain terakhir bergaya Drexel menggantikan referensi UGM dan arahan awal agar tampilan tidak diubah. Gunakan navigasi navy, latar lebar, panel utama kiri, judul besar/tebal, aksen kuning, responsif; jangan menyalin identitas universitas. Mahasiswa lebih sederhana. Tema/warna/latar tetap dapat diatur.
- QR, persetujuan, offline, sinkronisasi, cadangan terintegrasi halaman asli. Simpan saat navigasi/kembali/tutup; edit selama upload tetap masuk antrean.
- Titik berarti hadir. Yang belum mengirim tetap kosong sebelum tenggat. A otomatis hanya setelah tenggat. Reset tidak menghapus catatan manual. Empat A murni memicu E; S/I tidak menambah penalti tersebut.
- QR file langsung terbaca tanpa screenshot. Offline: mahasiswa scan tantangan, membuat balasan, dosen menerima sebelum tenggat, lalu sinkron saat online.
- OCR menjaga NIM lengkap termasuk C, nama terbungkus, urutan sumber; identitas meragukan perlu ditinjau. Jangan menebak. Error tidak boleh `undefined`.
- Mahasiswa yang dihapus tidak boleh kembali dari cache/tabel lama pada absen/ujian/rekap. Kelas lain tetap ada. Tabel satu baris, padding, identitas tidak terpotong, cetak/Office tetap benar.
- Panduan kecil bergambar, menyorot tombol, dapat diperkecil; status sinkronisasi besar tidak menutupi layar.
- Lokasi transparan sekali saat mengirim, izin standar perangkat, keterangan bahwa dosen dapat melihat. Gagal GPS/izin dapat memilih kirim tanpa lokasi. Jangan melacak terus-menerus atau menyamarkan tujuan. Ikon kiri nomor di luar tabel; rincian/Maps; tidak ikut print/PDF/Word/Excel.
- Hapus pesan tidak menghapus absensi. Pengingat bisa dimatikan. A otomatis bukan `Absen diterima`.
- Mahasiswa hapus akun sendiri dengan PIN, catatan dosen tetap. Dosen konfirmasi NIM dan opsional purge NIM pada kelas akun tersebut saja. Tidak ada penghapusan otomatis di produksi.
- Pengguna sudah mengizinkan review, PR, merge setelah lulus, deployment hosting sama, serta publikasi paket teruji. Tidak perlu meminta ulang izin rutin.

## Dasar dan perubahan branch

Dasar: `6351942bc5cd3ede83e7e08ed3b220f91927601e`, merge PR #8, rilis 1.0.8. PR #1 sudah selesai historis; perubahan ini perlu PR baru.

Riwayat: 1.0.2 Android baru berdampingan; 1.0.3 integrasi halaman asli; 1.0.4 keandalan/panduan/impor; 1.0.5 dokumen; 1.0.6 OCR Windows/roster; 1.0.7 cache/penghapusan; 1.0.8 ikon native.

Kode lokal sekarang `package.json` 1.1.0, Android versionName 1.1.0/versionCode 10, PHP/SW build `20261012-portal-10`. Entry 1.1.0 menggantikan entry 1.0.8.

Komponen baru: `app/portal.css`, `portal.js`, `portal-background.svg`, `locations.js`, `student-tools.js`, `account-tools.js`, notification drawable `ic_attendance.xml`, `tests/portal-account-location.test.cjs`.

Komponen diubah: halaman PHP asli; `app/core.js`, `app/app.js`, `app-sw.js`, `app_core.php`, `app_attendance.php`, `app_api.php`; bridge/tools; musik; guides/images; template/runtime; native MainActivity/AttendanceWatch; versi dan verifikasi/CI.

Penghapusan akun menggunakan transaksi, pemeriksaan peran/PIN/konfirmasi NIM, filter konteks kelas pada sesi/dokumen, pencabutan perangkat/push dan audit. Tidak ada tabel baru. Marks yatim tanpa sesi/dokumen untuk memetakan kelas tidak dihapus global berdasarkan NIM karena akan mengancam kelas lain.

**Draf `docs/APLIKASI.md` sudah menyebut paket 1.1.0 tersedia, tetapi belum ada publikasi 1.1.0. Itu bukan bukti release.**

## Bukti pengujian dan kegagalan tersisa

Log percakapan lama berada di `/workspace/work/portal-refresh/`; log ini tidak otomatis tersedia pada checkout lain. Ringkasan berikut dicatat dari log, bukan hasil CI branch ini.

- `tests-release.log`: 56/56 browser tests lulus sebelum patch musik terakhir. Meliputi approval/QR/offline/tenggat/A/reset/conflict/autosave/upload race/cache lama 1280 dan 393/panduan/OCR nyata foto sintetis 21 prefixed NIMs/ikon/tabel print Office/desain/lokasi izin ditolak/invalid coordinates/pesan/account purge per kelas.
- `feature-complete.log`: 10 tests, 8 pass, 2 fail. Satu subtest musik gagal dan parent ikut gagal; delapan subtest lain lulus. `locator.waitFor: Timeout 30000ms exceeded`, menunggu `#absensiMusicOverlay`, pada `tests/portal-account-location.test.cjs:18`.
- Diagnosis belum selesai: desktop biasa memang dapat `window.open` popup; test mengharapkan overlay. Overlay dipakai Android/native, `/app/`, atau fallback. Bedakan cacat produk dan asumsi test; jangan sekadar menghapus assertion. Uji player yang sama bertahan pada navigasi, launcher inline/child frame, tidak ganda.
- `android-build.log`: `AttendanceWatch.java:7: error: int cannot be dereferenced`, task `:app:compileDosenDebugJavaWithJavac`. Parameter `int id` menutupi `id.webabsensi.app.R`. Source sudah diubah ke `R.drawable.ic_attendance`, **belum build ulang**.
- Saat menyimpan branch ini, `npm run check` dan lint PHP halaman/backend lulus, `git diff --check` bersih; pemeriksaan perubahan untuk private signing container/password lulus. Ini bukan full regression/native test.
- APK/EXE 1.1.0 belum diuji atau terbit. Uji emulator Android 13 dan native Windows yang ada merupakan bukti rilis sebelumnya, termasuk coexistence, update/private data, ikon, OCR dan penghapusan. Tidak ada bukti perangkat fisik 1.1.0.

## Signing dan identitas: jangan hilangkan

ApplicationId tetap `id.webabsensi.parallel2026.dosen` dan `id.webabsensi.parallel2026.mahasiswa`; APK lama `id.webabsensi.app.dosen`/`.mahasiswa` tidak dicopot. Namespace Java tetap `id.webabsensi.app`. Windows userData `appData/web-absensi-app`.

Kunci Android 2 reusable ada **di luar repo**, pada workspace lama: `/workspace/work/absensi-signing/settings.json` dan `android-v2.p12`. Tidak disertakan dalam branch/ZIP kode. Jangan membuat kunci baru atau mengunggah kunci/password. Workspace AI baru mungkin tidak memilikinya.

Secrets otomatisasi yang diperlukan: `ANDROID_V2_KEYSTORE_BASE64`, `ANDROID_V2_KEYSTORE_PASSWORD`, `ANDROID_V2_KEY_ALIAS`, `ANDROID_V2_KEY_PASSWORD`. Alat sesi lama tidak dapat mengisi Repository Secrets. `docs/ANDROID-2.md` menjelaskan backup privat dan langkah pemilik; belum ada konfirmasi pengguna sudah menyimpan backup secara terpisah. Jangan meminta nilainya di chat.

`native/android/bootstrap-apks.json` masih pin 1.0.8: commit artifact `3a333788ad6c69551bb3b5c996056295a3362171`; source fingerprint `b46a8f8e5a3d66b0728db508d7f9195bf035d13c8de65658f36854a4a45befd5`. **Belum cocok untuk source 1.1.0.**

Helper di luar repo lama: `/workspace/work/absensi-release/build-android.py`; `/workspace/work/icon-settings/verify-build.py`, `pin-apks.py`. Adaptasi helper pin 1.0.8 ke 1.1.0, baseline verify 1.0.7 ke `/workspace/work/icon-settings/published-1.0.8/`. Checkout artifact `/workspace/work/android-2-artifacts`, branch `artifacts/android-2-bootstrap`. Hanya APK signed publik dan hash/fingerprint yang boleh dipush. Jika source input berubah setelah pin, ulangi build/verifikasi/pin.

## Cara melanjutkan

1. Checkout branch ini; jangan hanya main. Periksa working tree, source dan instruksi repository. Jangan reset perubahan baru.
2. Diagnosis uji musik desktop versus Android/native dan perbaiki produk/test sesuai perilaku sebenarnya.
3. Tinjau desktop/HP 393px, toolbar/header, guide, modal, kamera toast, launcher; recapture gambar panduan.
4. `npm run templates`, `npm run check`, PHP lint, `npm test`; fixture hanya localhost, bukan data produksi. Log semua pemeriksaan final.
5. Build APK dengan signing Android 2 yang sama. Jika kunci tidak ada pada workspace baru, lanjutkan pemeriksaan/build unsigned untuk validasi tetapi jangan mengklaim release; sebutkan akses yang tepat.
6. Verifikasi certificate/ID/version/aset/private material; update immutable public APK pin, lalu `HAS_SIGNING_KEY=false python3 scripts/load_android_bootstrap.py`.
7. Commit perubahan lanjutan, PR baru; CI Android dan Windows. Android upgrade baseline 1.0.8, legacy coexist/data, icon, student stop notification service action. Windows offline/OCR/persist/delete/icon/bundle.
8. Ready/merge expected head SHA setelah lulus. Deployment dan release main terotorisasi. Tunggu kedua workflow; jangan merge source yang belum dicek.
9. Hosting workflow mengambil baseline identitas roster/marks/sessions/documents/registrations sebelum deployment dan memeriksa preservasi sesudahnya. Jangan overwrite koneksi.php/data pengguna. Aset/helper sebelum halaman, service worker terakhir.
10. Download tiga paket resmi + SHA256SUMS; cocokkan APK dengan pin dan EXE resources/app.asar dengan source (CRLF/LF normalisasi teks termasuk SVG; binary persis).
11. Laporkan website asli dan tiga unduhan nyata, data lama retained, penggunaan/delete trial data/lokasi, batas fisik/video/access. Jangan mengklaim 1.1.0 terbit sebelum file tersedia dan teruji.

Local server lama `http://127.0.0.1:8000/`, router `/workspace/work/absensi-resume/router.php`, DB uji `web_absensi_resume_test`, socket `/workspace/cloud-web-absensi/database/mysql.sock`, config uji `/workspace/work/absensi-resume/state/`, PHP `/workspace/cloud-web-absensi/bin/php`, Playwright `/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core`, Chromium `/usr/bin/chromium`. Environment baru mungkin berbeda; verifikasi, jangan memakai config produksi untuk test.

Hosting HTTP langsung dari cloud dibatasi network policy; live verification melalui workflow GitHub. Local /dev/kvm tidak ada; native Android via Actions. Sebagian gh REST 403 tetapi connector bekerja; Git authenticated push menggunakan `git -c credential.helper='!gh auth git-credential' ...` pada sesi lama. Jangan bypass policy atau mengekspos konfigurasi.

## Referensi dan batas yang belum diverifikasi

Lampiran: `20261010-0054-44.5594913.mp4` (keadaan awal); `20261010-0321-32.9302069.mp4` (website asli, bukan portal kedua); `20261010-1028-10.2969376.mp4` (ghost roster Windows, ada bukti reproduksi 1.0.7); screenshot OCR undefined, daftar kosong vs absen/rekap, tampilan awal, UGM yang diganti, Drexel final.

Video desain terakhir `20261012-0351-08.1979132.mp4`, sediment file `file_0000000099f08211a08bb442d416d0fa`, **belum ditonton** karena melebihi batas alat download 32 MiB. Gunakan screenshot final; jangan mengklaim cocok seluruh perilaku video. Lampiran lama mungkin tidak tersedia di chat baru.

Rilis verified sebelumnya: https://github.com/Laxdsks/web-absensi/releases/tag/aplikasi-1.0.8 . Bukti download/EXE/Android lama di `/workspace/work/icon-settings/published-1.0.8/` dan `/workspace/work/icon-settings/android-tested/report.json`; source lama record `/workspace/work/ocr-repair/verification-record.json`, `/workspace/work/roster-video/verification-record.json`. Data/paket live tidak diperiksa ulang saat penyimpanan branch ini.

Selesai berarti: source final semua checks lulus, dua APK dan satu EXE final tersedia dan diuji, hosting asli verified, data lama dipertahankan, pengguna menerima tautan yang benar-benar dapat digunakan. Jangan berhenti pada rencana.
