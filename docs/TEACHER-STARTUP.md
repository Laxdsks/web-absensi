# Memuat halaman dosen

Halaman dosen membawa CSS inti dan penjaga startup langsung dalam HTML. Satu entry `app/runtime-teacher-1.2.10-<WA_BUILD>.js` memuat seluruh modul pengendali dosen. Nama berkas berubah pada setiap build agar worker lama yang mengabaikan query URL tidak mengembalikan kode lama. Worker memasukkan entry tersebut dalam cache instalasi untuk navigasi offline. Font tidak menghalangi tampilan, dan OCR dimuat hanya saat impor memerlukannya. Aset mahasiswa serta APK tetap sama.

Halaman normal ditampilkan setelah menu dan data lokal siap. Jika entry terlambat lebih dari 1,8 detik, isi dan navigasi asli tetap ditampilkan dengan pemberitahuan kecil di bawah. Kegagalan unduh atau respons terpotong memicu paling banyak tiga percobaan ulang. Lembar belum dapat diedit sampai data siap, lalu pemberitahuan dan menu cadangan dibersihkan. Tidak ada lagi dialog pemulihan layar penuh yang menyembunyikan semua isi.

Worker dosen memeriksa penanda akhir entry sebelum menyimpan cache terverifikasi. HTML lama disesuaikan ke entry yang sama; HTML baru tidak diberi skrip duplikat. Cache build sebelumnya, data akun, dan antrean sinkronisasi tidak dihapus oleh perubahan startup.

Regresi lokal: `teacher-visible-shell`, `teacher-navigation-startup`, `cache-upgrade`, `teacher-mobile-guide`, dan `teacher-responsiveness`. Tes gangguan jaringan memblokir worker agar pemotongan respons dan kegagalan berkas benar-benar mencapai jalur jaringan. Tes cache terpisah menjalankan worker asli, termasuk pemutakhiran dan navigasi offline.
