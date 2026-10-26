# Ekspor Word dan Excel

Tombol Word dan Excel pada lembar absen, rekap nilai, dan lembar ujian sekarang menghasilkan berkas DOCX/XLSX asli. Ekspor lama berupa HTML dengan ekstensi DOC/XLS dapat menyebabkan kolom melewati kertas dan logo tidak tampil di Microsoft Office.

- Logo kiri/kanan dan tanda tangan yang tampil pada lembar ditanam sebagai gambar PNG di dalam paket, dengan rasio gambar dipertahankan. Kegagalan membaca gambar membatalkan ekspor dengan pesan, sehingga gambar tidak dihilangkan diam-diam.
- Teks, nilai isian saat ini, NIM (termasuk nol di depan), serta tabel tetap dapat diedit. Label tanggal miring pada DOCX ditanam sebagai gambar kecil dengan deskripsi tanggal untuk mempertahankan tampilannya; tanggal diperbarui di web lalu diekspor ulang. Kontrol layar, ikon lokasi, SVG cetak sementara, dan tombol tidak masuk dokumen.
- Kolom DOCX memakai ukuran tetap dalam bidang kertas; header bertingkat memakai sel gabungan asli. Batas tipis tersimpan pada setiap sel. Tabel panjang dilanjutkan ke halaman berikutnya.
- XLSX memakai sel gabungan, batas sel, gambar tertanam, area cetak, dan satu halaman lebar. Tabel sampai 45 baris (termasuk judul kolom) disesuaikan satu halaman; tabel lebih panjang boleh berlanjut ke halaman berikutnya. Tanggal numerik dibagi beberapa baris, bukan rotasi sel Excel yang turut memiringkan batas sel. Nilainya dapat diedit langsung di Excel; tanggal lengkap juga tercantum pada catatan sel.
- Absen mengikuti format kertas, margin, dan orientasi yang dipilih. Rekap nilai menggunakan orientasi mendatar. Ujian menggunakan A4 dengan margin aman.
- Kop dan metadata kelas turut disertakan pada rekap. Tanda tangan mengikuti lembar absen/ujian; rekap tetap berupa tabel dan penjelasan penilaian.
- Pustaka DOCX/ExcelJS dimuat hanya ketika tombol ekspor dipakai. Penggunaan pertama memerlukan koneksi; setelah termuat pustaka tersedia pada cache web. Kegagalan unduh dapat dicoba ulang.

Validasi: `node --test tests/office-export.test.cjs` mengunduh keenam paket asli dari browser, memeriksa media tertanam, tipe berkas, NIM, seluruh mahasiswa, batas dan lebar tabel, area cetak, orientasi, serta sel yang dapat diedit. Hasil juga dibuka melalui LibreOffice Writer/Calc dan dikonversi ke PDF untuk pemeriksaan tata letak. Pengujian otomatis tidak menjalankan Microsoft Word/Excel desktop; metrik huruf dapat sedikit berbeda antar aplikasi.
