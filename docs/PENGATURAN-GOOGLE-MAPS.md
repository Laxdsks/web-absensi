# Mengaktifkan Google Maps

Peta titik dasar tetap dapat dibuka ketika online. Untuk rute dan panorama resmi di jendela aplikasi, pemilik perlu menyiapkan kunci Google Maps miliknya. Kode tidak memakai kunci milik pihak lain dan tidak mengisi titik awal dengan perkiraan berdasarkan IP.

1. Buka [Google Cloud Console](https://console.cloud.google.com/projectselector2/home/dashboard?createNewProject=true) pada akun pemilik proyek dan buat/pilih proyek Maps. Login Google dilakukan oleh pemilik akun; tidak perlu membagikan kata sandi kepada AI.
2. Aktifkan [**Maps Embed API**](https://console.cloud.google.com/apis/library/maps-embed-backend.googleapis.com) untuk peta, rute, dan Street View. Aktifkan **Maps JavaScript API** untuk memilih titik awal dengan mengetuk peta. **Geocoding API** diperlukan bila alamat tertulis di atas peta juga diinginkan. Selesaikan pengaturan akun/billing apabila diminta Google.
3. Buat API key dengan pembatasan aplikasi **Websites / HTTP referrers**, izinkan `https://datasiswasekolah.42web.io/*`, lalu batasi API ke layanan yang diaktifkan tadi.
4. Masuk ke website sebagai administrator. Buka **Tampilan → Google Maps → Belum punya kunci? Mulai di sini** untuk tautan langkah resmi dan tombol salin pembatasan domain. Tempel kunci pada kolom pengaturan, lalu **Simpan pengaturan peta**. Kunci tidak perlu dikirim melalui chat.
5. Tekan **Uji peta**. Pilih **Peta**, **Rute**, lalu **360°**. Jendela ini memakai contoh koordinat Dompu, bukan posisi mahasiswa, dan tidak mengubah absensi. Periksa keluaran Google di dalam jendela: tersimpannya kunci atau selesainya iframe memuat belum membuktikan API aktif. Bila gagal, periksa pesan Google, API yang diaktifkan, akun penagihan, dan pembatasan domain.
6. Buka pin mahasiswa pada lembar absen. Periksa pertemuan dan waktu rekaman. Tekan **Rute dari lokasi saya**, berikan izin GPS, lalu cocokkan koordinat awal dosen dan tujuan mahasiswa. Pada perangkat yang sama, kedua titik seharusnya berdekatan sesuai akurasi GPS. GPS laptop yang melenceng dapat diperbaiki melalui **Pilih titik awal**.
7. Tekan **360° · Street View** untuk panorama di jendela yang sama. Panorama hanya tersedia pada lokasi yang memiliki cakupan Street View Google. Mode layar penuh memperbesar jendela aplikasi.

Kunci disimpan di database hosting, bukan di kode repository. Administrator juga dapat memakai variabel lingkungan `GOOGLE_MAPS_BROWSER_KEY` bila hosting mendukungnya; variabel tersebut memiliki prioritas atas pengaturan database. Kunci browser Maps memang dikirim ke Google melalui browser, sehingga pembatasan domain dan API tetap perlu diterapkan.

Maps Embed API tersedia tanpa biaya pemakaian dan tetap memerlukan kunci serta akun penagihan Google. Maps JavaScript API/Geocoding API adalah layanan terpisah yang dapat berbiaya; aktifkan hanya bila diperlukan dan periksa kuotanya. Lihat [petunjuk resmi Google](https://developers.google.com/maps/documentation/embed/quickstart) dan [biaya Maps Embed API](https://developers.google.com/maps/documentation/embed/usage-and-billing).

Dokumentasi peta: https://developers.google.com/maps/documentation/embed/embedding-map

Tes otomatis memeriksa koordinat, URL API resmi, izin GPS, pemilihan titik, mode layar penuh, dan kondisi offline dengan layanan Google yang disimulasikan. Pengujian Google yang sesungguhnya memerlukan kunci aktif dan jaringan yang dapat mengakses Google; hasil simulasi tidak membuktikan status layanan Google atau cakupan panorama suatu lokasi.
