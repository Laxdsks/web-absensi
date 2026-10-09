# Web Absensi Mahasiswa

Aplikasi absensi dan nilai mahasiswa berbasis PHP dan MariaDB. Halaman aplikasi memerlukan login menggunakan akun pengelola atau dosen.

## Membuka aplikasi

Alamat aplikasi: <https://datasiswasekolah.42web.io/index.php>.

Tautan GitHub Pages: <https://laxdsks.github.io/web-absensi/>. Setelah Pages diatur sesuai petunjuk di bawah, tautan ini menampilkan halaman pembuka dan mengarahkan pengguna ke aplikasi dalam 3 detik. Tombol **Buka aplikasi** tersedia jika pengalihan otomatis tidak berjalan.

GitHub Pages hanya melayani HTML, CSS, dan JavaScript. Pages tidak menjalankan PHP, session login, atau MariaDB. Mengubah repositori menjadi publik tidak membuat `index.php` dapat dijalankan di Pages. Aplikasi lengkap tetap dijalankan di hosting PHP.

## Mengatur GitHub Pages

1. Buka repositori **Laxdsks/web-absensi**, lalu **Settings → Pages**.
2. Pada **Build and deployment**, pilih **Source: Deploy from a branch**.
3. Pilih branch **main** dan folder **/docs**, lalu klik **Save**.
4. Tunggu proses penerbitan selesai, lalu buka <https://laxdsks.github.io/web-absensi/>.

Folder `docs` memiliki `index.html` untuk GitHub Pages. Gunakan folder **/docs**, agar yang diterbitkan hanya halaman pembuka. File aplikasi PHP, konfigurasi, dan data tidak menjadi bagian situs Pages. Pengaturan Pages harus disimpan; membuat repositori publik saja belum menentukan folder situs.

Jika alamat hosting berubah, perbarui tujuan pengalihan dan tautan di `docs/index.html`.

## Memasang pembaruan aplikasi di hosting PHP

Salin file PHP aplikasi dan folder `assets` ke direktori web hosting. Pertahankan `koneksi.php` yang sudah disesuaikan dengan database hosting Anda. Folder `docs` merupakan halaman pembuka GitHub Pages; halaman masuk aplikasi tetap `index.php`.

Repositori publik dan hak akses aplikasi adalah dua pengaturan berbeda. Halaman pembuka GitHub dapat dilihat siapa saja, sedangkan akses data mahasiswa tetap memerlukan login aplikasi.
