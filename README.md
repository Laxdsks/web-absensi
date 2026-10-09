# Web Absensi Mahasiswa

Aplikasi absensi dan nilai mahasiswa berbasis PHP dan MariaDB. Halaman aplikasi memerlukan login menggunakan akun pengelola atau dosen.

## Membuka aplikasi

Alamat aplikasi: <https://datasiswasekolah.42web.io/index.php>.

Tautan GitHub Pages: <https://laxdsks.github.io/web-absensi/>. Setelah penerbitan selesai, tautan ini langsung mengarahkan pengguna ke halaman masuk aplikasi tanpa menampilkan README atau menunggu beberapa detik. Tautan manual tersedia jika perangkat memblokir pengalihan otomatis.

GitHub Pages hanya melayani HTML, CSS, dan JavaScript. Pages tidak menjalankan PHP, session login, atau MariaDB. Mengubah repositori menjadi publik tidak membuat `index.php` dapat dijalankan di Pages. Aplikasi lengkap tetap dijalankan di hosting PHP.

## Mengatur GitHub Pages

1. Buka repositori **Laxdsks/web-absensi**, lalu **Settings → Pages**.
2. Pada **Build and deployment**, pilih **Source: Deploy from a branch**.
3. Pilih branch **main** dan folder **/(root)**, lalu klik **Save**. Jika sebelumnya sudah memakai pengaturan ini, tidak perlu mengubahnya.
4. Tunggu proses penerbitan selesai, lalu buka <https://laxdsks.github.io/web-absensi/>.

File `index.html` di direktori utama menjadi halaman pengarah otomatis. `_config.yml` mengecualikan file aplikasi PHP, konfigurasi, data, README, serta aset aplikasi dari penerbitan Pages. Folder `docs` juga memiliki pengarah untuk situs yang sebelumnya sudah menggunakan **/docs**.

Jika alamat hosting berubah, perbarui tujuan pengalihan dan tautan di `index.html` serta `docs/index.html`.

## Memasang pembaruan aplikasi di hosting PHP

Salin file PHP aplikasi dan folder `assets` ke direktori web hosting. Pertahankan `koneksi.php` yang sudah disesuaikan dengan database hosting Anda. `index.html`, `_config.yml`, dan folder `docs` digunakan untuk GitHub Pages; halaman masuk aplikasi di hosting tetap `index.php`.

Repositori publik dan hak akses aplikasi adalah dua pengaturan berbeda. Halaman pembuka GitHub dapat dilihat siapa saja, sedangkan akses data mahasiswa tetap memerlukan login aplikasi.
