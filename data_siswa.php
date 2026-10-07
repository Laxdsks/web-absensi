<?php
session_start();
require_once 'koneksi.php';
if (!isset($koneksi) && isset($conn)) { $koneksi = $conn; }

// Sinkronkan hanya tema yang tersedia agar tema tetap konsisten antarahalaman.
$allowed_themes = ['malam', 'putih', 'samudra', 'senja'];
$requested_theme = trim((string)($_GET['theme'] ?? $_POST['theme'] ?? ''));
if ($requested_theme !== '' && in_array($requested_theme, $allowed_themes, true)) {
    $_SESSION['theme'] = $requested_theme;
}
$current_theme = $_SESSION['theme'] ?? 'malam';
if (!in_array($current_theme, $allowed_themes, true)) {
    $current_theme = 'malam';
    $_SESSION['theme'] = $current_theme;
}

$jenjang = 'S1'; // Sistem ini hanya menyediakan jenjang perguruan tinggi S1.
$saved_context = $_SESSION['konteks_siswa'] ?? [];
$daftar_prodi = [
    'Pendidikan Teknologi Informasi',
    'Pendidikan Guru Sekolah Dasar',
    'Pendidikan Jasmani Kesehatan dan Rekreasi',
    'Pendidikan Bahasa dan Sastra Indonesia',
    'Pendidikan Sejarah',
    'Pendidikan Bahasa Inggris'
];
$prodi = isset($_GET['prodi']) ? trim($_GET['prodi']) : ($saved_context['prodi'] ?? $daftar_prodi[0]);
if (!in_array($prodi, $daftar_prodi, true)) $prodi = $daftar_prodi[0];
$kelas_input = isset($_GET['kelas']) ? trim($_GET['kelas']) : (string)($saved_context['kelas'] ?? 'A');
$kelas_input = preg_replace('/^Kelas\s+/i', '', $kelas_input);
$kelas = in_array(strtoupper($kelas_input), ['A', 'B', 'C', 'D', 'E'], true) ? strtoupper($kelas_input) : 'A';
$semester_input = isset($_GET['semester']) ? trim($_GET['semester']) : (string)($saved_context['semester'] ?? '1');
$semester_input = preg_replace('/^Semester\s+/i', '', $semester_input);
$semester = ctype_digit($semester_input) && (int)$semester_input >= 1 && (int)$semester_input <= 8 ? (string)(int)$semester_input : '1';
$kelas_lama = 'Kelas ' . $kelas;
$semester_lama = 'Semester ' . $semester;
$_SESSION['konteks_siswa'] = ['jenjang' => $jenjang, 'kelas' => $kelas, 'prodi' => $prodi, 'semester' => $semester];

// Kontekstual Istilah Jenjang Perguruan Tinggi (100% Mahasiswa / NIM)
$uppercase_jenjang = strtoupper($jenjang);
$is_kuliah = ($uppercase_jenjang === 'S1' || $uppercase_jenjang === 'D3' || $uppercase_jenjang === 'D4' || $uppercase_jenjang === 'KULIAH' || $jenjang === 'S1');
$label_peserta = 'Mahasiswa';
$label_id = 'NIM';

// Handle Tambah / Edit Mahasiswa (Penyimpanan Permanen Semester & Interisolasi Eksak)
if (isset($_POST['save_siswa'])) {
    $id   = $_POST['id'] ?? '';
    $nim = trim($_POST['nim'] ?? '');
    $nik = trim($_POST['nik'] ?? '');
    $nama = trim($_POST['nama'] ?? '');
    $jk = ($_POST['jk'] ?? 'L') === 'P' ? 'P' : 'L';
    if (!empty($id)) {
        $id = (int)$id;
        $stmt = mysqli_prepare($koneksi, "UPDATE siswa SET nim=?, nik=?, nama=?, jk=? WHERE id=? AND jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'ssssisssss', $nim, $nik, $nama, $jk, $id, $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
    } else {
        $stmt = mysqli_prepare($koneksi, "INSERT INTO siswa (jenjang, kelas, prodi, semester, nim, nik, nama, jk) VALUES ('S1', ?, ?, ?, ?, ?, ?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'sssssss', $kelas, $prodi, $semester, $nim, $nik, $nama, $jk);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
    }
    header("Location: data_siswa.php?jenjang=".urlencode($jenjang)."&kelas=".urlencode($kelas)."&prodi=".urlencode($prodi)."&semester=".urlencode($semester)."&theme=".urlencode($current_theme)."&status=success");
    exit;
}

// Handle Hapus Satuan Mahasiswa
if (isset($_GET['hapus_id'])) {
    $id_hapus = intval($_GET['hapus_id']);
    $stmt = mysqli_prepare($koneksi, "DELETE FROM siswa WHERE id=? AND jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?)");
    if ($stmt) {
        mysqli_stmt_bind_param($stmt, 'isssss', $id_hapus, $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
        mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);
    }
    header("Location: data_siswa.php?jenjang=".urlencode($jenjang)."&kelas=".urlencode($kelas)."&prodi=".urlencode($prodi)."&semester=".urlencode($semester)."&theme=".urlencode($current_theme)."&status=deleted");
    exit;
}

// Handle Fitur Hapus Massal Total Satu Kelas (Sapu Bersih Cascading Delete)
if (isset($_GET['hapus_semua']) && $_GET['hapus_semua'] == '1') {
    $stmt = mysqli_prepare($koneksi, "DELETE FROM siswa WHERE jenjang='S1' AND prodi=? AND semester IN (?, ?) AND kelas IN (?, ?)");
    if ($stmt) {
        mysqli_stmt_bind_param($stmt, 'sssss', $prodi, $semester, $semester_lama, $kelas, $kelas_lama);
        mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);
    }
    
    // Bersihkan sesi terkait jika ada
    if (isset($_SESSION['absen'][$prodi][$semester][$kelas])) unset($_SESSION['absen'][$prodi][$semester][$kelas]);
    if (isset($_SESSION['nilai_ujian'][$prodi][$semester][$kelas])) unset($_SESSION['nilai_ujian'][$prodi][$semester][$kelas]);
    
    header("Location: data_siswa.php?jenjang=".urlencode($jenjang)."&kelas=".urlencode($kelas)."&prodi=".urlencode($prodi)."&semester=".urlencode($semester)."&theme=".urlencode($current_theme)."&status=all_deleted");
    exit;
}

// SINKRONISASI BACKEND EXAK DAN LOGIKA S1 AMAN (=)
$data_siswa = [];
$q_str = "SELECT * FROM siswa WHERE jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?) ORDER BY nama ASC";
$stmt = mysqli_prepare($koneksi, $q_str);
if ($stmt) {
    mysqli_stmt_bind_param($stmt, 'sssss', $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
    mysqli_stmt_execute($stmt);
    $res = mysqli_stmt_get_result($stmt);
    if ($res) while ($row = mysqli_fetch_assoc($res)) $data_siswa[] = $row;
    mysqli_stmt_close($stmt);
}
?>
<!DOCTYPE html>
<html lang="id" data-theme="<?php echo htmlspecialchars($current_theme, ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data & Manajemen Mahasiswa - <?php echo htmlspecialchars($kelas); ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        select option,
        [data-theme="malam"] select option,
        [data-theme="putih"] select option,
        [data-theme="samudra"] select option,
        [data-theme="senja"] select option,
        .form-group select option,
        select.form-control option {
            color: #000000 !important;
            background-color: #ffffff !important;
            text-shadow: none !important;
        }
        :root, html[data-theme="malam"] {
            --bg-gradient: linear-gradient(-45deg, #0f172a, #1e1b4b, #0f172a);
            --card-bg: rgba(15, 23, 42, 0.92);
            --card-border: rgba(255, 255, 255, 0.1);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --input-bg: rgba(255, 255, 255, 0.05);
            --input-border: rgba(255, 255, 255, 0.15);
            --primary: #3b82f6;
            --primary-hover: #2563eb;
            --table-bg: rgba(15, 23, 42, 0.8);
            --table-border: rgba(255, 255, 255, 0.1);
            --table-th-bg: rgba(30, 41, 59, 0.9);
            --table-hover: rgba(255, 255, 255, 0.05);
        }
        html[data-theme="putih"] {
            --bg-gradient: linear-gradient(-45deg, #f8fafc, #e2e8f0, #cbd5e1);
            --card-bg: rgba(255, 255, 255, 0.95);
            --card-border: rgba(0, 0, 0, 0.1);
            --text-main: #0f172a;
            --text-muted: #475569;
            --input-bg: rgba(255, 255, 255, 1);
            --input-border: rgba(0, 0, 0, 0.2);
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --table-bg: rgba(255, 255, 255, 0.9);
            --table-border: rgba(0, 0, 0, 0.15);
            --table-th-bg: #e2e8f0;
            --table-hover: rgba(0, 0, 0, 0.04);
        }
        html[data-theme="samudra"] {
            --bg-gradient: linear-gradient(-45deg, #082f49, #0369a1, #0c4a6e);
            --card-bg: rgba(8, 47, 73, 0.9);
            --card-border: rgba(255, 255, 255, 0.15);
            --text-main: #f0f9ff;
            --text-muted: #bae6fd;
            --input-bg: rgba(0, 0, 0, 0.2);
            --input-border: rgba(255, 255, 255, 0.2);
            --primary: #0ea5e9;
            --primary-hover: #0284c7;
            --table-bg: rgba(8, 47, 73, 0.8);
            --table-border: rgba(255, 255, 255, 0.15);
            --table-th-bg: rgba(14, 116, 144, 0.9);
            --table-hover: rgba(255, 255, 255, 0.08);
        }
        html[data-theme="senja"] {
            --bg-gradient: linear-gradient(-45deg, #4c0519, #881337, #4c0519);
            --card-bg: rgba(76, 5, 25, 0.9);
            --card-border: rgba(255, 255, 255, 0.15);
            --text-main: #fff1f2;
            --text-muted: #fecdd3;
            --input-bg: rgba(0, 0, 0, 0.2);
            --input-border: rgba(255, 255, 255, 0.2);
            --primary: #f43f5e;
            --primary-hover: #e11d48;
            --table-bg: rgba(76, 5, 25, 0.8);
            --table-border: rgba(255, 255, 255, 0.15);
            --table-th-bg: rgba(136, 19, 55, 0.9);
            --table-hover: rgba(255, 255, 255, 0.08);
        }
        * { 
            box-sizing: border-box; 
            margin: 0; 
            padding: 0; 
            font-family: 'Plus Jakarta Sans', sans-serif; 
            transition: all 0.3s ease !important; 
        }
        body {
            background: var(--bg-gradient); 
            background-size: 400% 400%;
            animation: gradientBG 15s ease infinite; 
            color: var(--text-main);
            min-height: 100vh; 
            padding: 30px 20px; 
            display: flex; 
            justify-content: center; 
            align-items: flex-start;
        }
        @keyframes gradientBG { 
            0% { background-position: 0% 50%; } 
            50% { background-position: 100% 50%; } 
            100% { background-position: 0% 50%; } 
        }
        .container { width: 100%; max-width: 1100px; margin: 0 auto; }
        .card-header-flex {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; flex-wrap: wrap; gap: 15px;
            background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border);
            padding: 20px 25px; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.3);
        }
        .header-title h2 { font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
        .header-title p { font-size: 12px; color: var(--text-muted); }
        .header-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .btn-custom {
            padding: 10px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none;
            display: inline-flex; align-items: center; gap: 8px; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .btn-primary { background: var(--primary); color: #ffffff; }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px); }
        .btn-success { background: #10b981; color: #ffffff; }
        .btn-success:hover { background: #059669; transform: translateY(-2px); }
        .btn-danger { background: #ef4444; color: #ffffff; }
        .btn-danger:hover { background: #dc2626; transform: translateY(-2px); }
        .btn-warning { background: #f59e0b; color: #ffffff; }
        .btn-warning:hover { background: #d97706; transform: translateY(-2px); }
        .btn-secondary { background: rgba(255,255,255,0.1); color: var(--text-main); border: 1px solid var(--card-border); }
        .btn-secondary:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
        .content-card {
            background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border);
            border-radius: 20px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .search-filter-box {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;
        }
        .search-input-wrapper {
            position: relative; flex: 1; min-width: 250px;
        }
        .search-input-wrapper i {
            position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--text-muted);
        }
        .search-input-wrapper input {
            width: 100%; padding: 10px 15px 10px 45px; border-radius: 12px;
            background: var(--input-bg); border: 1px solid var(--input-border);
            color: var(--text-main); font-size: 13px; outline: none;
        }
        .search-input-wrapper input:focus {
            border-color: var(--primary); box-shadow: 0 0 10px rgba(59,130,246,0.3);
        }
        .table-responsive { 
            width: 100%; 
            overflow-x: auto; 
            -webkit-overflow-scrolling: touch;
            border-radius: 12px; 
            border: 1px solid var(--table-border); 
            background: var(--table-bg);
        }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; white-space: nowrap; }
        th, td { padding: 12px 15px; border-bottom: 1px solid var(--table-border); color: var(--text-main); }
        th { background: var(--table-th-bg); font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        tr:hover { background: var(--table-hover); }
        .toast-container { 
            position: fixed; 
            top: 20px; 
            left: 20px; 
            z-index: 100000; 
            display: flex; 
            flex-direction: column; 
            gap: 10px; 
        }
        .toast {
            background: var(--card-bg); 
            backdrop-filter: blur(12px); 
            border-left: 4px solid #10b981;
            padding: 15px 20px; 
            border-radius: 12px; 
            box-shadow: 0 15px 35px rgba(0,0,0,0.4);
            color: var(--text-main); 
            font-size: 13px; 
            font-weight: 600; 
            display: flex; 
            align-items: center; 
            gap: 12px;
            transform: translateX(-120%); 
            opacity: 0; 
            transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .toast.show { transform: translateX(0); opacity: 1; }
        .toast.error { border-left-color: #ef4444; }
        .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(5px);
            display: flex; justify-content: center; align-items: center;
            z-index: 99999; opacity: 0; pointer-events: none;
        }
        .modal-overlay.show { opacity: 1; pointer-events: auto; }
        .modal-container {
            background: var(--card-bg); border: 1px solid var(--card-border);
            width: 100%; max-width: 500px; border-radius: 20px; padding: 25px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.8); transform: scale(0.9);
        }
        .modal-overlay.show .modal-container { transform: scale(1); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--card-border); padding-bottom: 12px; }
        .modal-header h3 { font-size: 16px; font-weight: 800; color: var(--text-main); }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-muted); }
        .form-group input, .form-group select {
            width: 100%; padding: 10px 14px; border-radius: 10px;
            background: var(--input-bg); border: 1px solid var(--input-border);
            color: var(--text-main); font-size: 13px; outline: none;
        }
        .form-group input:focus, .form-group select:focus { border-color: var(--primary); }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid var(--card-border); padding-top: 15px; }
        @media screen and (max-width: 768px) {
            body { padding: 15px 10px; }
            .card-header-flex { padding: 15px; flex-direction: column; align-items: stretch; text-align: center; }
            .header-actions { justify-content: center; width: 100%; }
            .btn-custom { width: 100%; justify-content: center; }
            .content-card { padding: 15px; }
            .modal-container { width: 95%; max-width: 100%; padding: 20px; margin: 10px; }
        }
    </style>
</head>
<body>
    <div class="toast-container" id="toastContainer"></div>
    <div class="container">
        <!-- Header Utama dengan Navigasi Lengkap & Tombol Baru Lembar Ujian -->
        <div class="card-header-flex">
            <div class="header-title">
                <h2><i class="fa-solid fa-users-gear"></i> Data & Manajemen Mahasiswa</h2>
                <p>Jenjang: S1 | Prodi: <?php echo htmlspecialchars($prodi); ?> | <?php echo htmlspecialchars($kelas_lama); ?> | <?php echo htmlspecialchars($semester_lama); ?></p>
            </div>
            <div class="header-actions">
                <a href="index.php?theme=<?php echo urlencode($current_theme); ?>" class="btn-custom btn-secondary" title="Kembali ke Beranda"><i class="fa-solid fa-arrow-left"></i> Beranda</a>
                <!-- TOMBOL LEMBAR UJIAN KUNING BARU -->
                <a href="ujian.php?jenjang=S1&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&kelas=<?php echo urlencode($kelas); ?>&theme=<?php echo urlencode($current_theme); ?>" class="btn-custom btn-warning" title="Buka Lembar Ujian Akhir"><i class="fa-solid fa-file-invoice"></i> Lembar Ujian</a>
                <a href="absen.php?jenjang=<?php echo urlencode($jenjang); ?>&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($current_theme); ?>" class="btn-custom btn-success" title="Buka Lembar Absen"><i class="fa-solid fa-clipboard-user"></i> Lembar Absen</a>
                <button onclick="bukaModalTambah()" class="btn-custom btn-primary" title="Tambah Mahasiswa"><i class="fa-solid fa-user-plus"></i> Tambah Mahasiswa</button>
            </div>
        </div>

        <!-- Kartu Konten & Tabel Mahasiswa -->
        <div class="content-card">
            <div class="search-filter-box">
                <div class="search-input-wrapper">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="searchInput" placeholder="Cari nama mahasiswa secara real-time..." onkeyup="filterTabelSiswa()">
                </div>
                <!-- TOMBOL HAPUS MASSAL TOTAL KELAS (SAPU BERSIH CASCADING DELETE) -->
                <div>
                    <a href="data_siswa.php?hapus_semua=1&jenjang=<?php echo urlencode($jenjang); ?>&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($current_theme); ?>" onclick="return confirm('Apakah Anda yakin ingin menghapus seluruh data mahasiswa di prodi, kelas, dan semester ini? Semua riwayat nilai dan absen juga akan ikut terhapus total!');" class="btn-custom btn-danger" title="Hapus Semua Mahasiswa di Kelas Ini"><i class="fa-solid fa-trash-can"></i> Hapus Semua Mahasiswa Kelas Ini</a>
                </div>
            </div>

            <div class="table-responsive">
                <table id="tabelSiswa">
                    <thead>
                        <tr>
                            <th style="width: 50px; text-align: center;">NO</th>
                            <th>NIM</th>
                            <th>NIK / NISN</th>
                            <th>NAMA LENGKAP</th>
                            <th style="width: 80px; text-align: center;">L/P</th>
                            <th style="width: 120px; text-align: center;">AKSI</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($data_siswa)):$no = 1; foreach($data_siswa as$s): ?>
                        <tr>
                            <td style="text-align: center;"><?php echo $no++; ?></td>
                            <td><?php echo htmlspecialchars($s['nim'] ?? ''); ?></td>
                            <td><?php echo htmlspecialchars($s['nik'] ?? '-'); ?></td>
                            <td style="font-weight: 600;"><?php echo htmlspecialchars($s['nama'] ?? ''); ?></td>
                            <td style="text-align: center;"><?php echo strtoupper($s['jk'] ?? 'L'); ?></td>
                            <td style="text-align: center;">
                                <button onclick="bukaModalEdit('<?php echo $s['id']; ?>', '<?php echo htmlspecialchars($s['nim'] ?? '', ENT_QUOTES); ?>', '<?php echo htmlspecialchars($s['nik'] ?? '', ENT_QUOTES); ?>', '<?php echo htmlspecialchars($s['nama'] ?? '', ENT_QUOTES); ?>', '<?php echo htmlspecialchars($s['jk'] ?? 'L', ENT_QUOTES); ?>')" class="btn-custom btn-primary" style="padding: 5px 10px; font-size: 11px;" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                                <a href="data_siswa.php?hapus_id=<?php echo $s['id']; ?>&jenjang=<?php echo urlencode($jenjang); ?>&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($current_theme); ?>" onclick="return confirm('Yakin ingin menghapus data mahasiswa ini?');" class="btn-custom btn-danger" style="padding: 5px 10px; font-size: 11px;" title="Hapus"><i class="fa-solid fa-trash"></i></a>
                            </td>
                        </tr>
                        <?php endforeach; else: ?>
                        <tr>
                            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Belum ada data mahasiswa untuk prodi, semester, dan kelas ini.</td>
                        </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Modal Form Tambah / Edit Mahasiswa -->
    <div class="modal-overlay" id="modalSiswa">
        <div class="modal-container">
            <div class="modal-header">
                <h3 id="modalTitle">Tambah Mahasiswa Baru</h3>
                <button onclick="tutupModal()" class="btn-custom btn-secondary" style="padding: 4px 8px;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <form action="" method="POST">
                <input type="hidden" name="id" id="formId">
                <div class="form-group">
                    <label>NIM</label>
                    <input type="text" name="nim" id="formNim" required placeholder="Masukkan NIM mahasiswa...">
                </div>
                <div class="form-group">
                    <label>NIK / NISN</label>
                    <input type="text" name="nik" id="formNik" placeholder="Masukkan NIK / NISN...">
                </div>
                <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" name="nama" id="formNama" required placeholder="Masukkan nama lengkap...">
                </div>
                <div class="form-group">
                    <label>Jenis Kelamin (L/P)</label>
                    <select name="jk" id="formJk">
                        <option value="L">Laki-Laki (L)</option>
                        <option value="P">Perempuan (P)</option>
                    </select>
                </div>
                <div class="modal-footer">
                    <button type="button" onclick="tutupModal()" class="btn-custom btn-secondary">Batal</button>
                    <button type="submit" name="save_siswa" class="btn-custom btn-success">Simpan Data</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // Fungsi Audio Soft Chime & Toast Notification Modern dari Kiri
        function playSoftChime() {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); 
                osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); 
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.35);
            } catch(e) {}
        }
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            if(!container) return;
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:18px; flex-shrink:0;"></i>' : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>';
            playSoftChime();
            toast.innerHTML = `${icon} <span>${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, 3500);
        }

        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('status') === 'success') {
                showToast('Data mahasiswa berhasil disimpan secara permanen!', 'success');
            } else if (urlParams.get('status') === 'deleted') {
                showToast('Data mahasiswa berhasil dihapus dari sistem.', 'success');
            } else if (urlParams.get('status') === 'all_deleted') {
                showToast('Seluruh data mahasiswa dan riwayat kelas ini berhasil disapu bersih!', 'success');
            }
        });

        function bukaModalTambah() {
            document.getElementById('modalTitle').innerText = 'Tambah Mahasiswa Baru';
            document.getElementById('formId').value = '';
            document.getElementById('formNim').value = '';
            document.getElementById('formNik').value = '';
            document.getElementById('formNama').value = '';
            document.getElementById('formJk').value = 'L';
            document.getElementById('modalSiswa').classList.add('show');
        }

        function bukaModalEdit(id, nim, nik, nama, jk) {
            document.getElementById('modalTitle').innerText = 'Edit Data Mahasiswa';
            document.getElementById('formId').value = id;
            document.getElementById('formNim').value = nim;
            document.getElementById('formNik').value = nik;
            document.getElementById('formNama').value = nama;
            document.getElementById('formJk').value = jk;
            document.getElementById('modalSiswa').classList.add('show');
        }

        function tutupModal() {
            document.getElementById('modalSiswa').classList.remove('show');
        }

        // Fitur Pencarian Nama Mahasiswa secara Real-Time
        function filterTabelSiswa() {
            const input = document.getElementById('searchInput');
            const filter = input.value.toLowerCase();
            const table = document.getElementById('tabelSiswa');
            const tr = table.getElementsByTagName('tr');
            for (let i = 1; i < tr.length; i++) {
                const tdNama = tr[i].getElementsByTagName('td')[3];
                if (tdNama) {
                    const txtValue = tdNama.textContent || tdNama.innerText;
                    if (txtValue.toLowerCase().indexOf(filter) > -1) {
                        tr[i].style.display = '';
                    } else {
                        tr[i].style.display = 'none';
                    }
                }
            }
        }

        // Perkuatan Logika Filter Regex OCR Ekstraksi Foto / Dokumen Fisik
        function processOcrTextExtraction(rawText) {
            // Abaikan kata sampah dokumen institusi secara otomatis
            const blacklist = /STKIP YAPIS DOMPU|PRODI|YAYASAN|TAHUN AKADEMIK|JURUSAN|SEMESTER|KELAS|PENDIDIKAN/gi;
            const cleanText = rawText.replace(blacklist, '');
            // Ekstraksi pola angka digital NIM & Nama Bersih
            const nimMatch = cleanText.match(/\b[A-Z0-9]{8,15}\b/g);
            return nimMatch ? nimMatch : [];
        }
    </script>
</body>
</html>
<?php
mysqli_close($koneksi);
?>
