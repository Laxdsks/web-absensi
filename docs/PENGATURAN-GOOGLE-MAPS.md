# Mengaktifkan Google Maps

Peta titik dasar tetap dapat dibuka ketika online. Untuk rute dan panorama resmi di jendela aplikasi, pemilik perlu menyiapkan kunci Google Maps miliknya. Kode tidak memakai kunci milik pihak lain dan tidak mengisi titik awal dengan perkiraan berdasarkan IP.

1. Buka Google Cloud Console pada akun pemilik proyek dan buat/pilih proyek Maps.
2. Aktifkan **Maps Embed API** untuk peta, rute, dan Street View. Aktifkan **Maps JavaScript API** untuk memilih titik awal dengan mengetuk peta. **Geocoding API** diperlukan bila alamat tertulis di atas peta juga diinginkan. Selesaikan pengaturan akun/billing apabila diminta Google.
3. Buat API key dengan pembatasan aplikasi **Websites / HTTP referrers**, izinkan `https://datasiswasekolah.42web.io/*`, lalu batasi API ke layanan yang diaktifkan tadi.
4. Masuk ke website sebagai administrator. Buka **Tampilan → Google Maps**, masukkan kunci di sana, lalu Simpan. Muat ulang halaman.
5. Buka pin mahasiswa pada lembar absen. Periksa pertemuan dan waktu rekaman. Tekan **Rute dari lokasi saya**, berikan izin GPS, lalu cocokkan koordinat awal dosen dan tujuan mahasiswa. Pada perangkat yang sama, kedua titik seharusnya berdekatan sesuai akurasi GPS. GPS laptop yang melenceng dapat diperbaiki melalui **Pilih titik awal**.
6. Tekan **360° · Street View** untuk panorama di jendela yang sama. Panorama hanya tersedia pada lokasi yang memiliki cakupan Street View Google. Mode layar penuh memperbesar jendela aplikasi.

Kunci disimpan di database hosting, bukan di kode repository. Administrator juga dapat memakai variabel lingkungan `GOOGLE_MAPS_BROWSER_KEY` bila hosting mendukungnya; variabel tersebut memiliki prioritas atas pengaturan database. Kunci browser Maps memang dikirim ke Google melalui browser, sehingga pembatasan domain dan API tetap perlu diterapkan.

Dokumentasi resmi: https://developers.google.com/maps/documentation/embed/embedding-map

Tes otomatis memeriksa koordinat, URL API resmi, izin GPS, pemilihan titik, mode layar penuh, dan kondisi offline dengan layanan Google yang disimulasikan. Pengujian Google yang sesungguhnya memerlukan kunci aktif dan jaringan yang dapat mengakses Google; hasil simulasi tidak membuktikan status layanan Google atau cakupan panorama suatu lokasi.
