# Pemeriksaan Presen 1.2.1

Pengujian memakai database lokal terpisah, bukan data produksi. Perubahan ini tidak menjalankan reset data.

- Lint JavaScript, lint PHP, pembuatan template tanpa data akun, dan pemeriksaan manifest deployment lulus.
- 16 pemeriksaan awal pada warna, font/tabel, ekspor, identitas, peta/inbox dan intro lulus.
- 7 pemeriksaan tambahan `tests/workspace-polish.test.cjs` lulus: kertas putih pada empat tema/cetak/Word/Excel, kontrol unduh pada lebar 360–1440 piksel, satu efek perspektif singkat pada dialog, reduced motion, indikator navigasi selama penyimpanan dan alur mahasiswa/pengaturan/logout.
- Regresi `tests/cache-upgrade.test.cjs` kini membedakan asal template lama dan baru. Navigasi offline mendahulukan HTML versi sekarang agar fungsi ekspor dan tata letak lama tidak terbawa dari cache sebelumnya; fallback lama tetap memutihkan header.
- Kedua APK memakai versi 1.2.1 / versionCode 21 dengan applicationId dan sertifikat Android 2 yang tetap. Paket bertanda tangan dipin ke fingerprint sumber. Pemeriksaan isi paket membandingkan kunci dengan APK lama dan APK 1.2.0 serta memindai material privat; tidak memasukkan kunci/kata sandi ke repository atau APK.
- Hasil regresi lengkap, CI Android emulator/Windows, deployment dan rilis versi akhir dicatat pada deskripsi PR pembaruan serta [GitHub Actions](https://github.com/Laxdsks/web-absensi/actions). Build lokal bukan bukti publikasi.

Transisi UI tidak mengubah perhitungan nilai, pencatatan kehadiran, privasi bukti atau izin kamera/lokasi. Penutupan dialog tetap langsung sehingga aliran kamera tidak ditahan demi animasi. Penutupan native Android tetap memilih dialog paling atas.

Kamera/GPS/printer fisik pengguna dan aplikasi Microsoft Office asli belum diuji. Pemeriksaan ekspor membuka markup Word/Excel di browser serta memeriksa lebar, teks, gambar dan warna; itu tidak menjamin setiap versi Office merender identik. Efek 3D terbatas pada antarmuka layar dan dinonaktifkan pada reduced motion/cetak.
