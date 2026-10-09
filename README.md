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

GitHub Pages mengarahkan pengunjung ke hosting 42web. Pengalihan itu tidak mengirim perubahan skrip PHP ke hosting. Workflow **Publish PHP application to hosting** menghubungkan pembaruan branch `main` dengan hosting, sehingga perubahan aplikasi dapat dikirim otomatis.

Hubungkan FTP sekali melalui **Settings → Secrets and variables → Actions → Repository secrets** di repositori ini. Simpan `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, dan `FTP_DIRECTORY` sesuai panel hosting. `FTP_SERVER` hanya nama server FTP, tanpa `ftp://`; `FTP_DIRECTORY` harus direktori aplikasi yang sudah memuat `index.php` dan `koneksi.php`, biasanya `/htdocs/`. Simpan kata sandi di GitHub Secrets, bukan di skrip, chat, atau variabel publik.

Workflow memakai FTPS dengan verifikasi sertifikat. Jika panel hosting hanya menyediakan FTP biasa, set repository variable `FTP_PROTOCOL` menjadi `ftp`; koneksi FTP biasa tidak mengenkripsi transfer. Port bawaan 21 dapat diubah melalui variable `FTP_PORT` bila panel hosting menentukan port lain. Workflow tidak menurunkan keamanan koneksi secara otomatis.

Setelah koneksi tersimpan, jalankan **Actions → Publish PHP application to hosting → Run workflow** untuk pembaruan awal. Perubahan berikutnya pada file aplikasi di `main` menjalankan penerbitan otomatis. Log baru menyatakan berhasil setelah setiap file pada hosting cocok dengan SHA-256 file dari revisi GitHub tersebut. Jika koneksi belum diatur atau server menolak pengiriman, workflow gagal dan situs belum dapat dinyatakan diperbarui.

Script penerbitan hanya mengirim file aplikasi dalam daftar eksplisit dan asetnya. `koneksi.php`, database, data JSON pengguna, `.htaccess`, dan pengarah GitHub Pages tidak dikirim atau dihapus. `index.html`, `_config.yml`, dan folder `docs` digunakan untuk GitHub Pages; halaman masuk aplikasi di hosting tetap `index.php`.

Repositori publik dan hak akses aplikasi adalah dua pengaturan berbeda. Halaman pembuka GitHub dapat dilihat siapa saja, sedangkan akses data mahasiswa tetap memerlukan login aplikasi.

## Foto dan tanda tangan dosen

Di bagian bawah Lembar Absen, klik **+ Tanda tangan / foto** pada blok Kaprodi atau Dosen Pengampu. Lembar Ujian menyediakan tombol yang sama pada blok **Pengawas Ujian** dan **Dosen Pengampu Mata Kuliah**. Nama dan NIDN pada blok baru di Lembar Ujian dibiarkan kosong untuk diisi sendiri.

Pilih gambar PNG, JPG, atau WEBP (maksimal 10 MB), atau pilih blok tanda tangan lalu tempel gambar dari clipboard. Klik blok untuk menampilkan tombol **Ganti gambar** dan **Hapus**. Gambar ikut cetak/PDF; tombol unggah tidak dicetak. Lembar Absen juga menyertakan gambar pada ekspor Word. Pengaturan **Jarak tanda tangan** di Inspektor Absen mengatur tinggi ruang gambar.

Gambar tersimpan di browser perangkat, terpisah untuk tiap jenis lembar, prodi, semester, dan kelas. Gambar tidak otomatis tersedia pada perangkat lain dan dapat hilang jika data situs dihapus. Workflow penerbitan turut mengirim `assets/sheet-signatures.js` dan `assets/sheet-signatures.css` bersama file PHP.
