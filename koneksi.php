<?php
$db_host = 'sql107.infinityfree.com'; 
$db_user = 'if0_42919534';             
$db_pass = 'EJbLOOECfCQ8'; 
$db_name = 'if0_42919534_sekolah';  

$koneksi = mysqli_connect($db_host, $db_user, $db_pass, $db_name);

if (!$koneksi) {
    die("Koneksi Database Gagal: " . mysqli_connect_error());
}

// Otomatis buat tabel atau tambahkan kolom yang kurang agar tidak terjadi Error 500 saat Save
$table_check = mysqli_query($koneksi, "SHOW TABLES LIKE 'siswa'");
if ($table_check && mysqli_num_rows($table_check) == 0) {
    mysqli_query($koneksi, "CREATE TABLE siswa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jenjang VARCHAR(50) DEFAULT 'S1',
        kelas VARCHAR(50) DEFAULT 'Kelas 1A',
        prodi VARCHAR(255) DEFAULT '',
        semester VARCHAR(50) DEFAULT 'Semester 1',
        nim VARCHAR(50) DEFAULT '',
        nik VARCHAR(50) DEFAULT '',
        nama VARCHAR(255) DEFAULT '',
        jk VARCHAR(10) DEFAULT 'L'
    )");
} else {
    // Kolom semester ditambahkan ke dalam daftar array pengecekan
    $columns = ['jenjang', 'kelas', 'prodi', 'semester', 'nim', 'nik', 'nama', 'jk'];
    foreach ($columns as $col) {
        $col_check = mysqli_query($koneksi, "SHOW COLUMNS FROM siswa LIKE '$col'");
        if ($col_check && mysqli_num_rows($col_check) == 0) {
            mysqli_query($koneksi, "ALTER TABLE siswa ADD COLUMN $col VARCHAR(255) DEFAULT ''");
        }
    }
}
?>