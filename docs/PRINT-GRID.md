# Garis tabel cetak dan format tanggal

Beberapa garis CSS yang tipis dapat dibulatkan menjadi nol piksel oleh penampil PDF pada ukuran pratinjau. `assets/sheet-print-grid.js` menambahkan garis SVG vektor 1 pt saat mencetak tabel absen, ujian, skala nilai, dan rekap. Garis dibuat dalam kepala tabel dan masing-masing baris sehingga mengikuti pengulangan kepala serta pergantian halaman. Ukuran sel dan isi tabel tidak berubah. SVG dihapus setelah cetak; pemakaian halaman biasa tidak memerlukan pekerjaan tambahan ini.

Rekap diukur pada lebar A4 lanskap dengan margin 10 mm, tanpa animasi jendela. Model garis terpisah menjaga garis terakhir tetap berada dalam baris saat cetak berlanjut ke halaman berikutnya.

Tanggal masing-masing pertemuan mempunyai isi tersendiri. Ukuran, warna, tebal, miring dan garis bawah menjadi satu format bersama untuk seluruh tanggal pada lembar/mata kuliah tersebut. Format disimpan dalam dokumen, dipulihkan saat Undo/Redo, dan diikuti kolom baru serta perangkat lain. Tombol B/I/U/warna menggunakan format bersama ketika tanggal dipilih.

`tests/print-grid-visibility.test.cjs` membuat PDF nyata, bukan hanya tangkapan layar media cetak. `tests/assert_pdf_grid.py` memeriksa garis hasil raster PDF pada empat skala, termasuk tanpa antialias yang mereproduksi masalah pratinjau. Tes tanggal memeriksa isi yang berbeda, format bersama, kotak yang tidak berubah ukuran, Undo/Redo, muat ulang dan perangkat lain.
