# Android 2: pemasangan berdampingan

APK dosen memakai ID `id.webabsensi.parallel2026.dosen` dan nama **Absensi Dosen 2**. APK mahasiswa memakai ID `id.webabsensi.parallel2026.mahasiswa` dan nama **Absen Mahasiswa 2**. Keduanya berbeda dari APK 1.0.0 (`id.webabsensi.app.dosen` dan `id.webabsensi.app.mahasiswa`). Memasang Android 2 tidak memperbarui, mencopot, atau menghapus data aplikasi lama.

Versi awal Android 2 adalah **1.0.2**, versionCode **3**. Kunci baru dibuat khusus untuk Android 2 dan disimpan di luar repository. Hanya fingerprint sertifikat publik yang dicatat di `native/android/signing-certificate.sha256`; file ini bukan kunci rahasia.

## Mulai menggunakan

Jika belum pernah memasang APK lama, langsung pasang APK Android 2 untuk peran Anda. Izinkan pemasangan dari sumber unduhan tersebut, buka **Absensi Dosen 2** atau **Absen Mahasiswa 2**, lalu login saat online. Dosen menggunakan akun website yang sama. Mahasiswa yang sudah terdaftar memakai NIM dan PIN lama, bukan membuat pendaftaran duplikat. Android 2 memakai hosting dan database yang sama; data server tidak disalin atau diganti oleh pemasangan APK.

Gunakan Android 8 atau lebih baru dengan Android System WebView yang diperbarui. Nama **2** membedakan ikon baru dan lama. Jangan menghapus aplikasi lama untuk memasang Android 2.

## Data lama dan batas pemindahan

Data yang sudah tersinkron tersedia setelah login dan menekan **Sinkronkan** di Android 2. Ini merupakan jalur yang disarankan. Aplikasi baru mempunyai penyimpanan perangkat sendiri; Android melarangnya membaca penyimpanan aplikasi lama secara langsung. Token login, PIN dan kunci QR perangkat lama tidak dipindahkan.

Jika ada perangkat lama dengan perubahan offline, buka aplikasi lama saat online dan sinkronkan sampai antrean perubahan kosong. Selesaikan konflik dengan memeriksa salinan yang benar. Dosen dapat membuat **Cadangan perangkat → Simpan cadangan** sebelum berpindah; simpan JSON di penyimpanan pribadi karena berisi data mahasiswa. Jangan keluar akun, menghapus data, atau mencopot aplikasi lama sebelum verifikasi hasil sinkronisasi selesai.

Cadangan JSON versi lama **bukan migrasi lengkap**. Cadangan tidak menyertakan kunci/login, rekaman operasi yang belum dikirim, atau identitas penandatangan QR. Pemulih lama mengaitkan absensi dengan sesi yang ada di cadangan: absensi manual yang tidak mempunyai sesi terkait bisa terlewat. Pemulihan ke server yang sudah berisi data juga dapat menimbulkan konflik atau mengubah daftar mahasiswa. Jangan memakai **Pulihkan cadangan** sebagai pengganti sinkronisasi penuh tanpa meninjau isinya. Jika aplikasi lama tidak bisa dibuka dan data belum pernah tersinkron, Android 2 tidak dapat memindahkan data itu secara otomatis; pertahankan aplikasi lama dan JSON cadangannya untuk pemulihan terpisah.

## Menyimpan kunci dan mengaktifkan build berikutnya

Kunci penandatangan baru dan kata sandinya tidak dimasukkan ke APK, repository, atau percakapan. Cadangannya berupa arsip AES-256 **Cadangan-Kunci-Android-2-PRIVATE.zip** dan file kata sandi terpisah **Password-Cadangan-PRIVATE.txt**. Simpan arsip dan kata sandinya secara terpisah di penyimpanan terenkripsi atau pengelola kata sandi. Jangan unggah keduanya sebagai file repository atau lampiran publik. Kehilangan kunci ini akan menghalangi pembaruan Android 2.

Untuk mengaktifkan build APK berikutnya, pemilik repository perlu melakukan ini karena akses pengelolaan Secrets tidak tersedia di sesi Codex:

1. Buka [Repository Secrets](https://github.com/Laxdsks/web-absensi/settings/secrets/actions).
2. Buka arsip privat dengan kata sandi dari file terpisah (gunakan 7-Zip atau aplikasi yang mendukung ZIP AES). Di dalamnya ada `android-v2.p12` dan `github-secrets-PRIVATE.json`.
3. Pilih **New repository secret** untuk masing-masing nama berikut. Salin nilai dari JSON privat ke kolom **Secret**, tanpa mengirim nilai ke chat:

   | Nama secret | Nilai dalam JSON privat |
   | --- | --- |
   | `ANDROID_V2_KEYSTORE_BASE64` | field dengan nama yang sama |
   | `ANDROID_V2_KEYSTORE_PASSWORD` | field dengan nama yang sama |
   | `ANDROID_V2_KEY_ALIAS` | field dengan nama yang sama |
   | `ANDROID_V2_KEY_PASSWORD` | field dengan nama yang sama |

4. Buka **Actions → Build Android and Windows applications → Run workflow → main**. Workflow memeriksa fingerprint kunci, ID aplikasi, versi dan aset sebelum menerbitkan APK. Jika kunci tidak cocok, APK tidak diterbitkan.
5. Untuk pembaruan berikutnya, pertahankan kedua applicationId dan kunci yang sama, naikkan versionCode, lalu pasang pembaruan pada Android 2 tanpa mencopotnya.

## Batas pengujian

Build dan pemeriksaan paket tidak menggantikan uji pemasangan. Status pemasangan, pembukaan aplikasi dan keutuhan data aplikasi lama dicatat setelah uji emulator selesai. Kamera QR, izin perangkat, printer dan notifikasi latar belakang tetap perlu dicoba pada perangkat fisik yang digunakan.
