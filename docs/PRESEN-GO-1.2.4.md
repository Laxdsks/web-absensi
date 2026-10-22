Presen Go 1.2.4 memperbaiki jalur pembukaan aplikasi yang masih dapat memuat halaman dan skrip lama dari cache web setelah APK diperbarui.

- Tampilan mahasiswa dibaca langsung dari berkas dalam APK bertanda tangan, saat online maupun offline. API akun, persetujuan, sesi dan pengiriman bukti tetap terhubung ke web dosen.
- Asal penyimpanan tetap sama. Akun, riwayat, foto dan antrean kiriman tidak dihapus saat pemulihan atau pembaruan.
- Jika tampilan belum berhasil dibuka, aplikasi menampilkan pilihan muat ulang serta pembaruan komponen Android, disertai versi aplikasi, bukan hanya layar kosong.
- Pembaruan memakai paket dan sertifikat yang sama dengan Presen Go 1.2.2 dan 1.2.3. Pasang sebagai pembaruan tanpa mencopot aplikasi atau menghapus data.

Pengujian mencakup pembaruan dari 1.2.3 dengan akun tersimpan, cache/service worker lama yang sengaja menampilkan halaman kosong, pembukaan ulang saat online/offline, dan pemeliharaan riwayat. Pengujian emulator tidak menggantikan pemeriksaan pada setiap model HP.
