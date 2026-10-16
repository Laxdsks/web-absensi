# Presen 1.2.0

Presen Pro (dosen Android), Presen Desk (Windows) dan Presen Go (mahasiswa Android) memakai website dan data hosting yang sama. Pembaruan mempertahankan identitas Android 2, tanda tangan yang sama, dan folder data Windows. Tidak ada reset data otomatis.

## Alur mahasiswa

1. Daftar/masuk, pilih dosen dan kelas yang sesuai, lalu tunggu persetujuan. Izin kamera/lokasi memakai permintaan resmi perangkat.
2. Di **Absen**, pindai QR dosen dan pilih Hadir, Sakit, atau Izin.
3. Sakit/Izin wajib mengisi alasan dan satu foto bukti JPG/PNG/WEBP. Foto diperkecil sampai sekitar 220 KB dan metadata foto dibuang sebelum dikirim. Hindari informasi medis atau orang lain yang tidak diperlukan.
4. Bila diaktifkan melalui **Akun → Daftarkan wajah**, kamera mencocokkan wajah dengan referensi akun sendiri sebelum mengirim. Baca persetujuan, gunakan tempat terang, lalu ikuti instruksi tatap kamera, putar sedikit, dan kembali. Fitur dapat dinonaktifkan dengan menghapus data wajah.
5. Buka **Riwayat** untuk menyaring tanggal/status, melihat alasan, foto dan hasil tinjauan. **Pesan** menampung pemberitahuan. Menu bawah memisahkan keempat tugas agar halaman tetap ringkas.

Referensi wajah adalah vektor yang dienkripsi AES-GCM pada perangkat, dengan kunci yang tidak dapat diekspor melalui API WebCrypto. Foto kamera dan vektor tidak dikirim ke dosen, Higgsfield, atau layanan pengenal wajah. Saat keluar akun, salinan wajah/foto pribadi perangkat dibersihkan. Dosen menerima laporan pencocokan dari perangkat, bukan bukti identitas resmi. Pemeriksaan gerakan sederhana tidak menjamin ketahanan terhadap foto/video palsu. Tidak ada pencarian identitas seluruh mahasiswa atau penilaian kesehatan otomatis.

## Alur dosen

**Monitoring** tersedia pada navigasi halaman asli. Saring tanggal, status, kelas, prodi, mata kuliah, dan status tinjauan; cari nama/NIM/alasan dan urutkan catatan. Ketuk catatan untuk melihat keterangan, foto pribadi, lokasi saat mengirim dan laporan pencocokan wajah. Setujui atau tolak keterangan setelah memeriksa bukti. Ikon pesan mengambang tetap menampung persetujuan pendaftaran dan keterangan; tidak ada aplikasi dosen kedua di dalam website.

Foto disimpan sebagai catatan database privat, bukan URL unggahan publik. Hanya mahasiswa pemilik foto dan dosen pemilik kelas yang dapat mengambilnya lewat API terautentikasi. Daftar riwayat tidak mengunduh foto sekaligus. Foto yang sudah dibuka tersimpan pada cache akun sendiri agar dapat dibaca kembali saat offline. Foto belum dibuka memerlukan internet.

## Lokasi, rute dan 360°

Pin di samping nomor mahasiswa membuka lokasi **pada saat kiriman**, bukan pelacakan langsung. Pilih pertemuan untuk membaca koordinat, waktu, ketelitian dan baterai bila tersedia.

- **Rute dari lokasi saya** mengambil GPS dosen yang baru dengan akurasi tinggi. Titik kasar di atas 200 m atau berumur lebih dari satu menit ditolak. Perangkat mahasiswa juga meminta titik presisi sebelum menyertakannya.
- Jika dua titik berdekatan dalam rentang akurasi GPS, aplikasi menjelaskan bahwa keduanya berada di sekitar lokasi yang sama. Titik awal lebih dari 100 km meminta pemeriksaan/konfirmasi dahulu.
- **Pilih titik awal**: geser peta, ketuk posisi dosen, lalu konfirmasi. Ini membantu laptop tanpa GPS. Titik absen mahasiswa tidak diubah.
- Jalur di dalam jendela memakai koordinat dosen sebagai awal dan mahasiswa sebagai tujuan melalui OpenStreetMap/OSRM. Jarak/waktu adalah perkiraan berkendara, bukan navigasi langsung atau kondisi lalu lintas. Kegagalan layanan tidak mengganti titik dengan kota perkiraan.
- **360° · Street View** membuka panorama Google di jendela yang sama. Ketersediaan bergantung pada cakupan Google dan dukungan sematan di perangkat. Jika kosong, kembali ke Lihat titik. Tidak semua jalan memiliki panorama.
- Layar penuh memperbesar jendela. Kontrol peta, foto bukti dan lokasi tidak masuk cetak/Word/Excel.

## Tanpa internet

Login/persetujuan pertama memerlukan internet. Sesudah itu data, model wajah dan pustaka disiapkan dalam APK atau cache offline. Mahasiswa memindai QR dosen, mengisi absen lalu memperlihatkan **QR balasan** untuk dipindai dosen **sebelum tenggat**. Membuat QR saja belum mencatat kehadiran pada dosen.

Foto sakit/izin disimpan pada perangkat dan dikirim saat mahasiswa online lagi. QR balasan membawa referensi foto, bukan isi gambarnya; dosen dapat menerima catatan offline tetapi belum dapat menyetujui keterangan sampai foto tersinkron. Jangan keluar akun/menghapus data aplikasi sebelum antrean dan foto selesai dikirim. Kehilangan perangkat sebelum unggahan berarti foto belum tersedia di server. Peta, rute, Street View dan notifikasi antarperangkat memerlukan internet.

## Tampilan dan panduan

Desain memakai latar kampus ilustratif asli, warna tema yang sudah tersedia, navigasi yang sama dan transisi pendek. Pengaturan **Tampilan** tetap mengatur latar/warna. Format kertas putih, font tabel seragam, nilai, impor, ekspor dan musik tetap dipertahankan. Intro masuk dipertahankan selama inisialisasi dan hanya memudar sekali; tema tersimpan diterapkan sebelum halaman tampil, tanpa animasi ulang beranda setiap sinkronisasi. Preferensi perangkat **kurangi gerakan** menonaktifkan animasi. Ikon **?** menyediakan petunjuk kontekstual, termasuk foto/wajah/Monitoring/peta.

Prinsip gerak diadaptasi dari skill Bang Motion yang dilampirkan pengguna; tidak ada video otomatis atau situs baru. Pembuatan gambar Higgsfield tidak tersedia pada paket akun saat pengerjaan. Video referensi YouTube tidak dapat dibuka dari jaringan lingkungan; desain bukan klaim salinan video tersebut.

## Pengujian dan batas verifikasi

Lihat tes di `tests/evidence-face-monitoring.test.cjs` dan `tests/location-route.test.cjs`, beserta regresi sebelumnya. Pengujian wajah benar-benar memuat model dan membandingkan vektor gambar contoh; ini tidak menggantikan penilaian akurasi populasi atau kamera HP pengguna. Pengujian koordinat dan layanan rute memakai respons terkendali; cakupan Street View serta akurasi GPS fisik pengguna perlu diperiksa pada perangkat sebenarnya. Jangan menyatakan semua perangkat atau fitur eksternal pasti berfungsi 100%.
