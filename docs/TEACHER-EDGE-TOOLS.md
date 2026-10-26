# Pegangan panduan dan inspektor

Web dosen memakai satu tombol untuk panduan dan satu untuk inspektor. Saat menempel pada tepi layar, tiap tombol hanya melukis garis selebar 4 px dengan sasaran sentuh 24 × 48 px. Ikon bantuan atau slider muncul saat diarahkan kursor/fokus; saat diseret ke tengah, tombol berbentuk bulat berukuran 36 px. Tidak ada lagi tombol grip, titik status, panah perkecil, atau label Inspektor yang memakan ruang saat tertutup. Status sinkronisasi tetap ada di dalam panduan.

Ketuk langsung membuka fitur, tanpa perlu memperbesar tombol lebih dahulu. Pointer capture mendukung mouse dan sentuhan; ambang gerakan memisahkan ketukan dan seretan agar tidak membuka panel saat memindahkan. Posisi dinormalisasi terhadap visual viewport, dibatasi agar tetap terjangkau saat rotasi/keyboard muncul, dan disimpan per fitur pada browser yang sama. Melepas dekat sisi kiri/kanan menempelkan pegangan ke tepi. Penempatan yang bertumpuk dipisahkan setelah dilepas. Fokus keyboard: panah memindahkan; Shift mempercepat; Home mengembalikan posisi bawaan. Enter/Spasi membuka fitur.

Modul khusus dosen dimasukkan ke bundel dan stylesheet bersama. Aplikasi mahasiswa dan data lembar tidak diubah. Kedua pegangan disembunyikan ketika dicetak. Panduan tetap memakai satu jendela spotlight, termasuk di atas dialog.

`tests/teacher-edge-tools.test.cjs` memeriksa lima halaman, satu ketukan, seret sentuh dan mouse, penyimpanan posisi saat navigasi/muat ulang, rotasi, keyboard, dan cetak. Tes panduan lama memeriksa seluruh topik serta contoh yang dapat digulir tanpa menutupi tombol tutup/lanjut.
