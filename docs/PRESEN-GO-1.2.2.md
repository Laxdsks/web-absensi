# Presen Go 1.2.2 untuk Android

APK mahasiswa ini memuat antarmuka, panduan dan aset offline terbaru dari web absensi. Aplikasi membuka halaman mahasiswa pada hosting yang sama saat online. Versi minimum Android 8.0.

**Pemasangan berdampingan:** paket baru `id.webabsensi.presengo.mahasiswa` memakai kunci penandatangan tetap yang baru. Kunci Android 2 lama tidak ditemukan, sehingga APK ini tidak menimpa instalasi 1.2.1. Aplikasi lama dan penyimpanan lokalnya tetap ada. Sinkronkan perubahan offline dari aplikasi lama dahulu; buka aplikasi baru, selesaikan izin awal, lalu pilih **Masuk** dengan NIM/PIN serta kelas yang sama. Data yang sudah tersimpan di server diambil kembali setelah login. Data yang hanya tersimpan offline tidak dipindahkan otomatis. Pemeriksaan wajah/perizinan perangkat dapat perlu diatur lagi. Jangan mencopot aplikasi lama sampai data yang diperlukan terverifikasi.

Empat tab: Absen, Riwayat, Pesan dan Akun. Persetujuan dosen diperbarui saat online; QR, bukti izin/sakit, lokasi saat absen dan riwayat mengikuti akun mahasiswa. Dosen tetap memakai web. Lokasi, kamera dan notifikasi mengikuti izin serta dukungan perangkat; pengujian emulator bukan pengganti pengujian kamera/GPS pada HP fisik.

Kunci privat tidak dimasukkan ke repository atau unduhan mahasiswa. Pemilik memperoleh arsip **Cadangan-Kunci-Presen-Go-PRIVATE.zip** secara terpisah. Simpan dua salinan privat untuk pembaruan berikutnya. Identitas paket dan sertifikat harus tetap sama; versionCode wajib dinaikkan untuk versi berikutnya. Berkas fingerprint pada repository hanya sertifikat publik dan tidak dapat dipakai sebagai pengganti keystore.
