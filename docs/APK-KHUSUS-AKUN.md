# APK dengan nama dan logo sendiri

Di beranda dosen, buka **Unduh & bagikan → Atur nama & logo APK**. Isi nama aplikasi, pilih gambar, lalu atur ukuran, bentuk, dan posisi gambar dengan menggesernya. Tekan **Simpan & buat APK**. Pengaturan tersimpan di akun dan dapat dibuka dari perangkat lain.

Saat APK antre atau dibuat, unduhan dan tautan berbagi menunggu hasil yang sesuai, sehingga dosen tidak membagikan APK dengan logo lama. Proses otomatis dapat memerlukan beberapa menit. Jendela boleh ditutup. Setelah selesai, tombol unduh, salin tautan, WhatsApp, dan berbagi menggunakan APK khusus yang sama. Untuk berbagi file, unduh dahulu lalu pilih file APK tersebut.

Nama pemasangan Android, gambar launcher yang dikompilasi, logo header di dalam aplikasi, ikon offline, dan manifest aplikasi mengikuti pengaturan tersebut. Bentuk luar ikon mengikuti peluncur Android; bentuk gambar di dalamnya mengikuti pilihan editor. Pengaturan disertakan langsung di paket, tanpa memerlukan pengaturan ulang pada HP mahasiswa. Namespace cache berubah tiap revisi agar gambar lama tidak terus digunakan.

APK khusus memakai ID aplikasi tersendiri yang stabil untuk akun dosen tersebut. Pemasangan pertama dilakukan terpisah dari Presen Go umum. APK khusus versi berikutnya memiliki ID dan sertifikat yang sama serta nomor versi yang meningkat, sehingga dapat dipasang sebagai pembaruan tanpa menghapus data. Untuk membuat paket baru dari kode aplikasi terbaru, simpan dan buat APK kembali. Pengaturan tampilan web tetap dapat diatur terpisah.

Layanan membatasi pembuatan menjadi 5 kali per akun per 24 jam dan satu proses aktif per akun. Unduh/berbagi hasil yang sudah selesai tetap tersedia. Logo dipotong di browser menjadi PNG 512 × 512; nama dan gambar diperiksa ulang di server serta pembuat APK. Kegagalan pembuatan ditampilkan tanpa menghapus pengaturan, dan dapat dicoba kembali.

## Pembuatan dan kunci

`app_branding.php` menyimpan pengaturan dan antrean berdasarkan akun dosen. Hanya pekerja dengan autentikasi HMAC dan lease aktif yang boleh mengambil atau menyelesaikan pekerjaan. `.github/workflows/branded-student.yml` memeriksa antrean berkala dan dapat dijalankan manual. Publikasi baru ditandai siap setelah paket, label, gambar launcher yang dikompilasi, gambar internal, dan tanda tangan diperiksa.

Kunci penandatanganan per akun dibuat sekali, disimpan dalam amplop AES-GCM terenkripsi di `wa_meta`, dan dibuka hanya selama pembuatan APK. Kunci privat dan kata sandi tidak dikirim ke browser dosen atau dimasukkan ke APK. Kunci koneksi pekerja dibuat melalui FTPS pada `.wa_brand_worker.php` di hosting, tidak masuk Git, dan tidak ditimpa pada deployment berikutnya. Cadangkan file privat ini dan database `wa_meta` bersama-sama sebelum memindahkan hosting; keduanya diperlukan untuk melanjutkan pembaruan paket. APK yang sudah dihasilkan tetap tersedia pada rilis GitHub.

Pengujian lokal mencakup potong lewat pointer pada layar HP, penyimpanan antarperangkat, pemisahan akun, antrean/lease, penolakan autentikasi pekerja yang salah, dan penggantian tautan unduh/WhatsApp. Unit test memeriksa pemulihan kunci yang sama dan pembuatan aset permanen. CI membangun APK asli dengan nama yang memuat simbol/quote dan memeriksa label, ID, revisi, serta gambar yang dikompilasi.
