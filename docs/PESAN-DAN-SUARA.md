# Pesan dan suara absensi

Buka tombol pesan melayang, lalu pilih **Suara** atau **Suara notifikasi**. Bunyi absensi dan pesan dapat diaktifkan, dimatikan, diatur 0–100%, dan dicoba dengan **Coba suara**. Nilai awal 40%; pengaturan disimpan untuk akun dosen pada perangkat tersebut. Volume akhir juga mengikuti pengaturan speaker perangkat. Browser mengizinkan audio setelah interaksi pengguna; tombol coba memberi cara langsung untuk mengaktifkan dan memeriksanya.

Folder **Absensi masuk** menampilkan 100 catatan terbaru dari mahasiswa, dengan nama, NIM, mata kuliah, semester, kelas, pertemuan dan status. **Lihat detail** membuka rincian Monitoring, termasuk keterangan, bukti dan lokasi yang tersedia. Pendaftaran dan tinjauan Sakit/Izin tetap mempunyai folder tersendiri.

Bunyi dipicu oleh catatan QR/wajah mahasiswa yang baru masuk, pendaftaran baru dan tinjauan baru. Data awal, A otomatis, input manual dosen, penyegaran halaman, dan pembaruan revisi catatan yang sama tidak mengulang bunyi. Identitas peristiwa memakai kelas, pertemuan, NIM, sesi dan versi sesi; beberapa kedatangan berdekatan memakai satu bunyi agar tidak bertumpuk. Senyap/volume nol menghentikan keluaran suara tanpa menyembunyikan pesan.

Audio memakai satu AudioContext yang digunakan kembali, pengatur volume utama dan dua nada singkat dengan perubahan gain yang halus. Tidak ada unduhan audio atau permintaan eksternal. Pemberitahuan masuk memakai popup panel sendiri, sehingga bunyi toast umum tidak melewati pengaturan senyap ini. `tests/inbox-attendance-sound.test.cjs` menguji Web Audio nyata, volume/senyap, kedatangan Hadir/Sakit/Izin, revisi berulang, muat ulang, pemisahan akun, detail, dan kontrol sentuh.
