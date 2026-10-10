# Aplikasi Absensi 1.0.5

Tersedia tiga paket **1.0.5** dari [rilis aplikasi](https://github.com/Laxdsks/web-absensi/releases/tag/aplikasi-1.0.7): **Absensi-Dosen-Android.apk** (ikon **Presen Pro**, aplikasi lengkap dosen/pengelola), **Absensi-Dosen-Windows-1.0.7.exe** (nama **Presen Desk**), dan **Absen-Mahasiswa-Android.apk** (ikon **Presen Go**, khusus mahasiswa). Android 2 memakai identitas aplikasi dan kunci baru sehingga dapat dipasang berdampingan dengan APK lama; aplikasi lama serta datanya tidak dicopot atau ditimpa. Jika belum pernah memasang APK lama, langsung gunakan APK Android 2.

APK merupakan paket pemasangan langsung, bukan publikasi Play Store; EXE portable dapat dijalankan tanpa instalasi. Android 8 ke atas dengan Android System WebView yang diperbarui; Windows 10/11 64-bit. Kamera atau printer hanya diperlukan untuk fitur terkait. Sistem dapat meminta izin memasang APK dari sumber ini atau menampilkan pemberitahuan penerbit belum dikenal untuk EXE yang belum ditandatangani penerbit.

## Awal penggunaan

Dosen masuk dengan akun pengelola/dosen yang sudah digunakan di website. Mahasiswa mendaftar nama, NIM lengkap termasuk awalan C, PIN, prodi, semester, dan kelas. Dosen mencocokkan identitas dengan daftar mahasiswa lalu menyetujui sekali. Mahasiswa menyinkronkan persetujuan saat masih online. Login dan data perangkat bertahan setelah aplikasi ditutup; **Keluar akun** menghapus akses lokal dan meminta login lagi. Jangan keluar sebelum perubahan offline tersinkron atau dicadangkan.

Android dosen dan Windows membuka [website asli](https://datasiswasekolah.42web.io/index.php). Desain, navigasi, tabel, lembar ujian dan pengaturan asli dipertahankan. Di **Lembar Absen**, tekan **Absensi QR**; pengaturan muncul di bawah pita menu pada lembar yang sama. Persetujuan mahasiswa juga tersedia di sana. Isi mata kuliah sekali, lalu mulai sesi atau pindai balasan. Di **Pusat Kendali** halaman utama, buka persetujuan akun mahasiswa, sinkronisasi dan cadangan. Halaman lama `/app/` mengarahkan dosen ke website asli; [halaman mahasiswa](https://datasiswasekolah.42web.io/app/?role=student) tetap khusus untuk mengirim absensi. Paket dosen menyertakan pustaka PDF, Word, Excel dan OCR; paket mahasiswa hanya membawa kebutuhan absensi. Mesin konversi dimuat saat dibutuhkan. Ekspor Word/Excel melalui dialog penyimpanan, cetak/PDF melalui dialog cetak sistem. Hasil OCR tetap perlu dibandingkan dengan dokumen asli; NIM kosong atau hasil meragukan harus dikoreksi sebelum disimpan.

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

Musik dari berkas audio lokal dapat diputar offline. Menutup panel musik menyembunyikan panel tanpa menghentikan lagu; pemutar menggunakan panel pada halaman asli. Pencarian dan streaming musik online, sinkronisasi, serta pemberitahuan jarak jauh memerlukan internet.

Paket dibuat dan alur utama diuji melalui browser serta build Android/Windows. Penggunaan kamera, notifikasi latar belakang, dialog cetak dan penyimpanan pada perangkat Android/Windows fisik perlu diuji pada perangkat yang dipakai dosen dan mahasiswa. SHA256SUMS.txt menyertakan checksum unduhan.

## Pembaruan 1.0.7

Impor foto pada Presen Desk memakai alamat lengkap untuk worker, mesin dan bahasa OCR; pengenalan Electron tidak lagi menyebabkan impor berhenti dengan pesan **undefined**. JPEG lembar berkepala, 21 mahasiswa dan 16 kolom pertemuan diuji lewat impor foto. Jika pembaca gagal dimuat, pesan jelas muncul dan percobaan ulang tersedia. Hasil OCR tetap ditinjau sebelum disimpan.

Lembar absen memeriksa NIM pada tabel tersimpan terhadap daftar mahasiswa terbaru. Mahasiswa yang dihapus tidak dikembalikan dari salinan lembar lama, termasuk rekap nilai. Hapus satuan, hapus semua kelas dan Hapus Permanen memakai antrean yang sama saat online/offline; halaman absen, ujian dan daftar yang sudah terbuka ikut diperbarui. Penghapusan tidak mengubah kelas lain atau pengaturan lembar. Pembaruan tidak menjalankan penghapusan data apa pun; hanya tindakan hapus yang dikonfirmasi pengguna yang diproses. Sinkronkan atau cadangkan perubahan offline sebelum memperbarui aplikasi.

### Perbaikan tampilan yang tetap disertakan

Lembar absensi, ujian dan rekap mempertahankan desain asli. Teks tabel diberi jarak dari garis; NIM/nama serta isian mata kuliah, ruang dan waktu dibuat satu baris dengan ukuran teks mengikuti lebar kolom. Rekap layar memakai kolom yang cukup lebar dan dapat digeser. Ekspor Word/Excel menyesuaikan ukuran teks terhadap lebar kertas/kolom, tanpa memotong isi atau mengubah nilai. Panduan **?** menunjukkan urutan penggunaan dan tombol pada halaman yang sedang dibuka.

### Perbaikan yang tetap disertakan

Pendaftaran dapat dicoba kembali dengan NIM, kelas dan PIN yang sama jika respons jaringan terputus. Dosen melihat pendaftaran di menu Persetujuan akun mahasiswa pada halaman utama atau panel Absensi QR. Persetujuan memperbarui daftar dan sesi aktif; mahasiswa menerima hasil otomatis saat tersambung internet.

File QR PNG dibagikan dengan latar putih dan piksel tajam; PNG/JPG/SVG dapat dipilih langsung tanpa screenshot. Draf keterangan serta QR balasan mahasiswa tetap tersedia setelah halaman dibuka ulang. Tombol **Tampilkan QR balasan tersimpan** membuka kembali balasan offline; dosen tetap harus memindainya sebelum tenggat.

Isian lembar disimpan segera pada perangkat dan dipulihkan setelah navigasi cepat. Tombol kembali Android serta penutupan Windows menunggu penyimpanan. Perubahan berikutnya yang dibuat saat unggahan sedang berjalan tetap masuk antrean. Reset sesi membersihkan A otomatis sampai tenggat baru, sambil mempertahankan catatan manual dosen. NIM mendapat lebar sesuai isi dan jarak dari garis tabel. Riwayat mahasiswa menampilkan mata kuliah tanpa catatan berulang.


Pengingat dan hitung mundur berhenti ketika dosen mengisi absensi manual, termasuk saat catatan dibuat sebelum sesi QR dibuka. Notifikasi Android menggunakan ID sesi yang sama agar dapat ditutup setelah absensi diterima.

Nama aplikasi diperbarui sesuai peran. Identitas Android dan folder data Windows tetap memakai identitas sebelumnya agar pembaruan tidak memutus data lokal. Sinkronkan perubahan offline atau buat cadangan sebelum memperbarui perangkat.

APK Android 2 memakai applicationId baru dan kunci yang bisa dipakai kembali. Login/sinkronisasi mengambil data dari hosting yang sama. Penyimpanan lokal aplikasi lama tidak dibaca langsung; pengguna dengan data offline harus menyinkronkan aplikasi lama terlebih dahulu. Cadangan JSON lama bukan migrasi penuh dan memiliki batas pemulihan. [Petunjuk Android 2](ANDROID-2.md) menjelaskan pemasangan, pemindahan data, cadangan kunci privat dan empat GitHub Secrets yang perlu diisi pemilik repository untuk pembaruan berikutnya. Jangan mencopot aplikasi lama sebelum data dipastikan tersedia.

Status sinkronisasi besar kini disembunyikan secara awal. Ikon **?** di tepi setiap halaman membuka panduan singkat bergambar, menyorot tombol yang dijelaskan, dapat digeser, dan dapat diperkecil menjadi garis. Status lengkap bisa ditampilkan dari panduan. Daftar mahasiswa mengikuti urutan penyimpanan/impor, bukan diurutkan ulang menurut abjad. OCR menjaga nama yang terbungkus dalam satu baris tabel dan memperlihatkan potongan gambar asli untuk pengecekan identitas. [Panduan singkat](PANDUAN-SINGKAT.md).

## Pembaruan 1.0.7

Kode lembar lama yang tertahan cache tidak lagi dipakai sesudah membuka halaman versi baru. Penghapusan satu kelas tersimpan sekaligus pada perangkat dan ditunggu sebelum berpindah halaman atau menutup aplikasi. Nama yang sudah dihapus tidak dipulihkan dari lembar tersimpan pada absen, rekap, maupun ujian. Data kelas lain, catatan kehadiran, nilai, dan draf yang masih berlaku tetap disimpan.

Perbarui paket dengan memasang versi baru menggunakan identitas aplikasi yang sama, lalu tutup dan buka kembali aplikasi. Jangan hapus data aplikasi atau mencopot aplikasi lama. Website tetap memakai alamat serta desain asli.
