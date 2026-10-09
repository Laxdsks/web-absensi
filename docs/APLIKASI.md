# Aplikasi Absensi 1.0.0

Unduh **Absensi-Dosen-Android.apk** untuk dosen, **Absen-Mahasiswa-Android.apk** untuk mahasiswa, atau **Absensi-Dosen-Windows-1.0.0.exe** untuk Windows. Pilih paket dari halaman [rilis aplikasi](https://github.com/Laxdsks/web-absensi/releases/latest). APK merupakan paket pemasangan langsung, bukan publikasi Play Store; EXE portable dapat dijalankan tanpa instalasi. Android 8 ke atas dengan Android System WebView yang diperbarui; Windows 10/11 64-bit. Kamera atau printer hanya diperlukan untuk fitur terkait. Sistem dapat meminta izin memasang APK dari sumber ini atau menampilkan pemberitahuan penerbit belum dikenal untuk EXE yang belum ditandatangani penerbit.

## Awal penggunaan

Dosen masuk dengan akun pengelola/dosen yang sudah digunakan di website. Mahasiswa mendaftar nama, NIM lengkap termasuk awalan C, PIN, prodi, semester, dan kelas. Dosen mencocokkan identitas dengan daftar mahasiswa lalu menyetujui sekali. Mahasiswa menyinkronkan persetujuan saat masih online. Login dan data perangkat bertahan setelah aplikasi ditutup; **Keluar akun** menghapus akses lokal dan meminta login lagi. Jangan keluar sebelum perubahan offline tersinkron atau dicadangkan.

Untuk versi browser, buka [aplikasi](https://datasiswasekolah.42web.io/app/) saat online, pasang melalui menu browser, lalu tunggu **Siap offline**. Paket dosen menyertakan pustaka PDF, Word, Excel dan OCR; paket mahasiswa hanya membawa kebutuhan absensi. Mesin konversi dimuat saat dibutuhkan. Ekspor Word/Excel melalui dialog penyimpanan, cetak/PDF melalui dialog cetak sistem. Hasil OCR tetap perlu dibandingkan dengan dokumen asli; NIM kosong atau hasil meragukan harus dikoreksi sebelum disimpan.

## Membuka absensi

1. Dosen memilih prodi, jenjang, semester, kelas, mengetik mata kuliah dan memilih pertemuan 1–16 pada lembar.
2. Dosen mengetik **durasi**, misalnya **10 menit**, lalu menekan **Mulai Absen**. Waktu dimulai saat tombol ditekan, tanpa perlu mengetik jadwal mulai/selesai.
3. Mahasiswa memindai QR dosen dan mengirim hadir, sakit, atau izin. QR berlaku untuk sesi tersebut. **Reset QR** mengganti kode lama. Pada hari berikutnya gunakan pertemuan berikutnya supaya catatan sebelumnya tetap tersimpan.
4. Ketika durasi habis, mahasiswa yang belum tercatat mendapat **A**. Tanda titik berarti hadir. S/I tetap dihitung tidak hadir dan tampil di rekap, tetapi hanya empat A murni yang memicu E otomatis.

Saat online, mahasiswa mendapat pemberitahuan sesi dibuka dan pengingat saat tersisa kurang dari satu menit. Pengingat dan hitung mundur hilang setelah absen diterima. Izinkan pemberitahuan pada perangkat. Layanan Android bersifat pilihan dan menampilkan pemberitahuan layanan aktif; pengaturan baterai perangkat dapat membatasi layanan. Untuk browser tertutup, notifikasi memerlukan izin push dan dosen masih membuka aplikasi. Tanpa internet, pemberitahuan baru dari perangkat lain tidak dapat tiba; mahasiswa dapat memindai QR yang ditampilkan langsung.

## Mahasiswa tanpa kuota: dua kali pindai

Mahasiswa dan dosen dapat sama-sama offline setelah login/persetujuan awal:

1. Mahasiswa memindai QR yang ditampilkan dosen.
2. Aplikasi mahasiswa membuat **QR balasan**; mahasiswa menunjukkannya kepada dosen.
3. Dosen memindai balasan **sebelum batas waktu habis**. Kehadiran tersimpan di perangkat dosen dan dikirim ke server ketika internet kembali.

Membuat atau memfoto QR saja belum mencatat kehadiran. Dosen harus menerima balasannya. Keterangan S/I memakai alur yang sama; pengiriman dari rumah tetap memerlukan internet atau orang yang membawa QR balasan kepada dosen. Dosen dapat meninjau alasan dan mengoreksi catatan. Lokasi hanya diambil sekali jika mahasiswa memilih **Sertakan lokasi**, lalu mengizinkannya. Lokasi, waktu dan akurasi ditampilkan untuk peninjauan; koordinat tidak membuktikan benar/salahnya alasan.

## Lembar dan sinkronisasi

Perubahan absensi, data mahasiswa, baris/kolom lembar, nilai, teks, tata letak, serta tanda tangan disimpan pada perangkat. Sinkronisasi dilakukan ketika aplikasi online. Perubahan yang bertabrakan dari dua perangkat tidak dihapus diam-diam; dosen memilih salinan yang akan digunakan. Buat cadangan JSON sebelum menghapus data aplikasi atau berpindah perangkat. Data offline mahasiswa hanya berisi akun serta catatan miliknya, tidak berisi daftar dan nilai mahasiswa lain.

Mata kuliah, kelas/ruang dan jam ujian dibiarkan kosong untuk diketik dosen. Label Tahun Akademik, Dosen Pengampu dan Jumlah Mahasiswa tampil satu baris. Pengawas Ujian dan Dosen Pengampu ada di bawah tabel konversi dengan jarak; gambar tanda tangan ikut hasil cetak/PDF, Word dan Excel.

Musik dari berkas audio lokal dapat diputar offline. Menutup panel musik menyembunyikan panel tanpa menghentikan lagu; lembar dibuka di bingkai sehingga lagu tetap berjalan. Pencarian dan streaming musik online, sinkronisasi, serta pemberitahuan jarak jauh memerlukan internet.

Paket dibuat dan alur utama diuji melalui browser serta build Android/Windows. Penggunaan kamera, notifikasi latar belakang, dialog cetak dan penyimpanan pada perangkat Android/Windows fisik perlu diuji pada perangkat yang dipakai dosen dan mahasiswa. SHA256SUMS.txt menyertakan checksum unduhan.
