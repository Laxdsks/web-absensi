# Bukti pemeriksaan Presen 1.2.0

Kode aplikasi diperiksa dari PR [#14](https://github.com/Laxdsks/web-absensi/pull/14). Pengujian lokal memakai database terpisah `web_absensi_verify113` dan alamat loopback. Tidak ada data mahasiswa produksi yang dipakai sebagai fixture atau dihapus.

- `npm run check`: seluruh sintaks JavaScript lulus.
- `WA_PHP=<PHP lokal> npm run templates`: lint PHP dan pembuatan lembar offline lulus; tidak menyertakan akun/data mahasiswa.
- `WA_TEST_URL=http://127.0.0.1:8011/ npm test`: **91/91 tes lulus**, 0 gagal, 0 dilewati, sekitar 237 detik, Chromium headless 16 Oktober 2026. Termasuk seluruh regresi sebelumnya dan dua berkas tes baru.
- `python3 scripts/verify_hosting.py` terhadap loopback: build, semua hash klien/model wajah/Leaflet, login dosen, skema, lembar dan endpoint snapshot lulus. Baseline hanya menyimpan hash identitas, termasuk foto yang sudah tersinkron.
- Kedua APK 1.2.0 dibangun dengan Java 21/SDK 35/Gradle 8.11.1. Identitas Android 2 dan sertifikat yang sama diverifikasi, applicationId berbeda dari APK asli 1.0.0; paket dapat diperbarui dari Android 2 sebelumnya. Isi paket cocok dengan seluruh hash sumber yang dipin. Pemindaian tidak menemukan material kunci privat/kata sandi penandatanganan dalam paket atau sumber Android.
- Uji Android emulator dan Windows native dijalankan melalui [GitHub Actions](https://github.com/Laxdsks/web-absensi/actions); hasil job dan log menjadi bukti terpisah. Build lokal saja tidak dinyatakan sebagai bukti pemasangan atau publikasi.

## Cakupan baru

`tests/evidence-face-monitoring.test.cjs` memeriksa foto wajib (termasuk melewati validasi UI), foto privat antar akun dosen, penolakan berkas bukan gambar, penyimpanan draf setelah reload, unggahan offline, penolakan foto sesi lain, tinjauan yang menunggu foto, penyaringan tanggal/status/urutan, tab mahasiswa, model wajah nyata, jarak descriptor wajah berbeda, enkripsi/kunci nonextractable, penghapusan referensi, persetujuan dan kamera tidak tersedia.

`tests/location-route.test.cjs` memeriksa GPS akurasi tinggi tanpa lokasi cache, penolakan titik kasar, dua perangkat/titik yang berdekatan, urutan awal dosen → tujuan mahasiswa, konfirmasi titik awal jauh, pemilihan manual, koordinat panorama 360°, fullscreen HP, offline, dan tidak ikut cetak. Permintaan rute/tile/panorama luar memakai respons terkendali, sehingga tes ini membuktikan alur dan koordinat aplikasi, bukan ketersediaan layanan Google/OSRM pada setiap perangkat.

Setelah perbaikan terakhir, 20 pemeriksaan ulang tertarget lulus: dua tes migrasi cache, enam tes rute/panorama, sembilan tes bukti/wajah/Monitoring dan tiga tes race sinkronisasi. Pemeriksaan ini mengulang bagian dari 91 tes, bukan 20 fitur baru.

Tes cache kini menunggu marker versi yang tepat, bukan hanya Promise dari browser. Ditemukan dan diperbaiki race pergantian service worker: penyiapan offline dikirim ulang setelah worker baru aktif tanpa memuat ulang lembar yang sedang diedit. Notifikasi mahasiswa ditempatkan di atas agar tidak menutupi menu bawah.

Regresi juga mencakup isolasi akun Zen/pengelola, persetujuan tanpa membuka ulang aplikasi, QR asli PNG/SVG tanpa screenshot, tenggat dan A otomatis, restart/tombol kembali, hapus permanen/reset aman, OCR JPEG 21 mahasiswa, urutan impor, nama/NIM/font/warna/Word/Excel/cetak, musik saat navigasi, cache versi lama, dan onboarding izin Android.

## Batas yang tidak boleh diklaim sebagai lulus

Belum diuji dengan kamera/GPS/printer pada HP dan laptop fisik pengguna. Model wajah diuji dengan gambar contoh pustaka; belum ada pengukuran false accept/reject pada populasi mahasiswa atau jaminan liveness. Panorama Street View bergantung cakupan dan kebijakan sematan Google. Gambar Higgsfield tidak dibuat karena paket akun tidak mendukung; video YouTube diblokir jaringan lingkungan.

Rahasia penandatanganan tetap di direktori privat di luar repository. Pengelolaan GitHub Secrets dan panel hosting untuk rotasi kredensial lama belum tersedia pada lingkungan ini; tidak ada nilai rahasia yang ditampilkan pada dokumen ini.
