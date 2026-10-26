# Catat keaktifan mahasiswa

Buka **Lembar absen → Rekap Nilai → Catat keaktifan** pada kelas dan mata kuliah yang benar. Cari nama atau NIM, gunakan tambah/kurang atau isi angka langsung. Bertanya dihitung per kali (2 poin); kontribusi aktif berupa jawaban/usul/saran dihitung per kali (3 poin); diskusi individu berupa nilai 0–25 poin. Total aktivitas dibatasi 100 poin mengikuti perhitungan rekap yang sudah ada.

Jendela menggunakan baris rekap yang sama, bukan daftar atau rumus penilaian terpisah. Perubahan memperbarui skor rekap dan draft nilai milik akun/kelas/mata kuliah tersebut. Isian UTS/UAS serta metadata nilai tetap dipertahankan. Status menjelaskan tersimpan di perangkat, menunggu sinkronisasi, atau konflik. Sinkronkan sebelum berganti perangkat. Fitur ini mencatat total, bukan riwayat kejadian per pertemuan.

`WAFlushGrade` menserialkan penyimpanan draft, membaca metadata terbaru, mempertahankan draft NIM lain, serta mengabaikan penyimpanan lama setelah reset. `tests/grade-activity.test.cjs` menguji pencarian, tambah/kurang, batas nilai, kesesuaian skor, pelestarian ujian/metadata/NIM lain, pemisahan mata kuliah, dan pemulihan di perangkat lain.
