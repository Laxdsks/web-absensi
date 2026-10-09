<?php
session_start();
$isStudentImportRequest = (string)($_GET['aksi'] ?? $_POST['aksi'] ?? '') === 'import_siswa';
require_once __DIR__ . '/auth_guard.php';
app_require_authenticated_user($isStudentImportRequest);
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

// OCR gambar daftar mahasiswa: hasil selalu ditinjau dan dikoreksi dosen sebelum disimpan.
if (($_GET['aksi'] ?? $_POST['aksi'] ?? '') === 'import_siswa' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $rows = json_decode((string)($_POST['rows'] ?? ''), true);
    if (!is_array($rows) || count($rows) < 1 || count($rows) > 200 || !isset($koneksi) || !($koneksi instanceof mysqli)) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Daftar mahasiswa tidak valid atau koneksi database tidak tersedia.']);
        exit;
    }
    foreach ($rows as $index => $row) {
        if (!is_array($row) || trim((string)($row['nim'] ?? '')) === '' || trim((string)($row['nama'] ?? '')) === '' || !in_array(strtoupper(trim((string)($row['jk'] ?? ''))), ['L', 'P'], true)) {
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => 'Lengkapi NIM, nama, dan L/P pada baris ' . ($index + 1) . ' sebelum menyimpan. Jenis kelamin tidak boleh ditebak dari nama.']);
            exit;
        }
    }
    $inserted = 0; $skipped = 0;
    mysqli_begin_transaction($koneksi);
    $duplicate = mysqli_prepare($koneksi, "SELECT id FROM siswa WHERE nim=? AND jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?) LIMIT 1");
    $insert = mysqli_prepare($koneksi, "INSERT INTO siswa (jenjang, kelas, prodi, semester, nim, nama, jk) VALUES ('S1', ?, ?, ?, ?, ?, ?)");
    if (!$duplicate || !$insert) {
        mysqli_rollback($koneksi);
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Penyimpanan daftar mahasiswa gagal disiapkan.']);
        exit;
    }
    foreach ($rows as $row) {
        if (!is_array($row)) { $skipped++; continue; }
        $nim = trim(substr((string)($row['nim'] ?? ''), 0, 50));
        $nama = trim(substr((string)($row['nama'] ?? ''), 0, 255));
        $jk = strtoupper(trim((string)($row['jk'] ?? '')));
        if ($nim === '' || $nama === '' || !in_array($jk, ['L', 'P'], true)) { $skipped++; continue; }
        mysqli_stmt_bind_param($duplicate, 'ssssss', $nim, $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
        mysqli_stmt_execute($duplicate);
        $found = mysqli_stmt_get_result($duplicate);
        if ($found && mysqli_fetch_assoc($found)) { $skipped++; continue; }
        mysqli_stmt_bind_param($insert, 'ssssss', $kelas, $prodi, $semester, $nim, $nama, $jk);
        if (mysqli_stmt_execute($insert)) $inserted++; else $skipped++;
    }
    mysqli_stmt_close($duplicate); mysqli_stmt_close($insert);
    mysqli_commit($koneksi);
    echo json_encode(['status' => 'success', 'inserted' => $inserted, 'skipped' => $skipped], JSON_UNESCAPED_UNICODE);
    exit;
}

// Kontekstual Istilah Jenjang Perguruan Tinggi (100% Mahasiswa / NIM)
$uppercase_jenjang = strtoupper($jenjang);
$is_kuliah = ($uppercase_jenjang === 'S1' || $uppercase_jenjang === 'D3' || $uppercase_jenjang === 'D4' || $uppercase_jenjang === 'KULIAH' || $jenjang === 'S1');
$label_peserta = 'Mahasiswa';
$label_id = 'NIM';

// Handle Tambah / Edit Mahasiswa (Penyimpanan Permanen Semester & Interisolasi Eksak)
if (isset($_POST['save_siswa'])) {
    $id   = $_POST['id'] ?? '';
    $nim = trim($_POST['nim'] ?? '');
    $nama = trim($_POST['nama'] ?? '');
    $jk = ($_POST['jk'] ?? 'L') === 'P' ? 'P' : 'L';
    if (!empty($id)) {
        $id = (int)$id;
        $stmt = mysqli_prepare($koneksi, "UPDATE siswa SET nim=?, nama=?, jk=? WHERE id=? AND jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'sssisssss', $nim, $nama, $jk, $id, $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
    } else {
        $stmt = mysqli_prepare($koneksi, "INSERT INTO siswa (jenjang, kelas, prodi, semester, nim, nama, jk) VALUES ('S1', ?, ?, ?, ?, ?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'ssssss', $kelas, $prodi, $semester, $nim, $nama, $jk);
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
$q_str = "SELECT id, nim, nama, jk FROM siswa WHERE jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?) ORDER BY nama ASC";
$stmt = isset($koneksi) && $koneksi instanceof mysqli ? mysqli_prepare($koneksi, $q_str) : false;
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
    <script src="assets/app-audio.js?v=20261009-music-panel" defer></script>
    <link rel="stylesheet" href="app/vendor/fontawesome/css/all.min.css">
    <link href="app/vendor/jakarta/400.css" rel="stylesheet"><link href="app/vendor/jakarta/500.css" rel="stylesheet"><link href="app/vendor/jakarta/600.css" rel="stylesheet"><link href="app/vendor/jakarta/700.css" rel="stylesheet">
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
    <script src="app/vendor/tesseract.min.js" defer></script>
<script src="assets/native-export.js?v=20261010" defer></script>
    <script src="app/core.js?v=20261010" defer></script>
    <script src="assets/offline-bridge.js?v=20261010" defer></script>
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

            <section class="content-card" id="photoImportCard" style="margin:0 0 18px;padding:16px;">
                <h3 style="margin:0 0 8px;font-size:15px;"><i class="fa-solid fa-camera" style="color:var(--primary);"></i> Impor daftar mahasiswa dari foto atau dokumen</h3>
                <p style="margin:0 0 12px;color:var(--text-muted);font-size:12px;line-height:1.5;">Pilih foto, PDF, Word (.doc/.docx), atau Excel (.xls/.xlsx/.csv). Seluruh halaman PDF dan lembar Excel dibaca. Tabel teks diambil langsung; scan dibaca dengan OCR. Periksa NIM, nama, dan L/P sebelum menyimpan. Baris dengan NIM yang sudah ada di konteks ini dilewati.</p>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <input type="file" id="fotoDaftarMahasiswa" accept="image/jpeg,image/png,image/webp,image/bmp,.pdf,.doc,.docx,.xls,.xlsx,.csv" onchange="muatBerkasDaftarMahasiswa()" style="max-width:100%;min-height:40px;">
                    <button class="btn-custom btn-primary" type="button" id="btnOcrFoto" onclick="bacaFotoDaftarMahasiswa()" style="min-height:42px;"><i class="fa-solid fa-wand-magic-sparkles"></i> Baca Semua Baris</button>
                    <span id="ocrStatus" aria-live="polite" style="font-size:12px;color:var(--text-muted);"></span>
                </div>
                <div id="ocrPhotoPreview" hidden style="margin-top:14px;">
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Tabel dipilih otomatis saat dibaca. Bila perlu, seret pada gambar untuk memilih kolom NIM, nama, dan L/P beserta judul kolomnya. Kop, nomor telepon, dan isian pertemuan tidak perlu masuk area. L/P yang tidak tercantum harus diisi sendiri.</p>
                    <canvas id="ocrPreviewCanvas" aria-label="Pratinjau foto; seret untuk memilih area tabel" style="display:block;max-width:100%;height:auto;max-height:420px;touch-action:none;cursor:crosshair;border:1px solid var(--card-border);border-radius:8px;"></canvas>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
                        <button type="button" class="btn-custom" onclick="putarFotoOcr(-90)">↶ Putar kiri</button>
                        <button type="button" class="btn-custom" onclick="putarFotoOcr(90)">↷ Putar kanan</button>
                        <button type="button" class="btn-custom" onclick="resetAreaOcr()">Gunakan seluruh foto</button>
                        <label style="font-size:12px;">Luruskan foto <input id="ocrSkewAngle" type="range" min="-5" max="5" step="0.5" value="0" onchange="luruskanFotoOcr(this.value)"><span id="ocrSkewLabel">0°</span></label>
                    </div>
                </div>
                <div id="ocrReviewPanel" hidden style="margin-top:14px;">
                    <p id="ocrReviewHelp" style="font-size:12px;color:var(--text-muted);margin-bottom:10px;"></p>
                    <div class="table-responsive">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr><th style="text-align:left;">NIM</th><th style="text-align:left;">Nama Mahasiswa</th><th>Jenis Kelamin</th><th>Sumber / Keyakinan OCR</th><th>Aksi</th></tr></thead>
                            <tbody id="ocrReviewRows"></tbody>
                        </table>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
                        <button type="button" class="btn-custom" onclick="tambahBarisKoreksiOcr()">+ Tambah baris koreksi</button>
                        <select id="ocrEmptyGender" aria-label="L/P untuk baris yang belum terisi" style="padding:9px;border-radius:8px;background:var(--input-bg);color:var(--text-main);"><option value="">Isi L/P yang kosong…</option><option value="L">Laki-laki (L)</option><option value="P">Perempuan (P)</option></select>
                        <button type="button" class="btn-custom" onclick="isiGenderOcrKosong()">Terapkan L/P</button>
                        <button class="btn-custom btn-success" type="button" id="btnSimpanOcr" onclick="simpanHasilOcr()" style="min-height:42px;"><i class="fa-solid fa-user-check"></i> Simpan baris yang sudah diperiksa</button>
                    </div>
                </div>
            </section>
            <div class="table-responsive">
                <table id="tabelSiswa">
                    <thead>
                        <tr>
                            <th style="width: 50px; text-align: center;">NO</th>
                            <th>NIM</th>
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
                            <td style="font-weight: 600;"><?php echo htmlspecialchars($s['nama'] ?? ''); ?></td>
                            <td style="text-align: center;"><?php echo strtoupper($s['jk'] ?? 'L'); ?></td>
                            <td style="text-align: center;">
                                <button onclick="bukaModalEdit('<?php echo $s['id']; ?>', '<?php echo htmlspecialchars($s['nim'] ?? '', ENT_QUOTES); ?>', '<?php echo htmlspecialchars($s['nama'] ?? '', ENT_QUOTES); ?>', '<?php echo htmlspecialchars($s['jk'] ?? 'L', ENT_QUOTES); ?>')" class="btn-custom btn-primary" style="padding: 5px 10px; font-size: 11px;" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                                <a href="data_siswa.php?hapus_id=<?php echo $s['id']; ?>&jenjang=<?php echo urlencode($jenjang); ?>&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($current_theme); ?>" onclick="return confirm('Yakin ingin menghapus data mahasiswa ini?');" class="btn-custom btn-danger" style="padding: 5px 10px; font-size: 11px;" title="Hapus"><i class="fa-solid fa-trash"></i></a>
                            </td>
                        </tr>
                        <?php endforeach; else: ?>
                        <tr>
                            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">Belum ada data mahasiswa untuk prodi, semester, dan kelas ini.</td>
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
            window.AbsensiUIAudio?.notify();
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
            document.getElementById('formNama').value = '';
            document.getElementById('formJk').value = 'L';
            document.getElementById('modalSiswa').classList.add('show');
        }

        function bukaModalEdit(id, nim, nama, jk) {
            document.getElementById('modalTitle').innerText = 'Edit Data Mahasiswa';
            document.getElementById('formId').value = id;
            document.getElementById('formNim').value = nim;
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

        const ocrPhoto = {file:null, image:null, source:null, crop:null, turn:0, skew:0, loading:null, ticket:0};
        function setOcrStatus(text) { document.getElementById('ocrStatus').textContent=text; }
        async function muatPratinjauOcr() {
            const file=document.getElementById('fotoDaftarMahasiswa').files[0];
            if (!file) return false;
            if (ocrPhoto.file===file && ocrPhoto.loading) return ocrPhoto.loading;
            if (ocrPhoto.file===file && ocrPhoto.image) return true;
            if (file.size>10*1024*1024) { showToast('Ukuran foto maksimal 10 MB.','error'); return false; }
            const ticket=++ocrPhoto.ticket;
            ocrPhoto.file=file; ocrPhoto.image=null; ocrPhoto.source=null; ocrPhoto.crop=null; ocrPhoto.turn=0; ocrPhoto.skew=0;
            document.getElementById('ocrPhotoPreview').hidden=true;
            document.getElementById('ocrReviewPanel').hidden=true;
            document.getElementById('ocrReviewRows').replaceChildren();
            document.getElementById('ocrSkewAngle').value='0';
            document.getElementById('ocrSkewLabel').textContent='0°';
            ocrPhoto.loading=(async()=>{
                const url=URL.createObjectURL(file), image=new Image();
                try {
                    image.src=url; await image.decode();
                    if (ticket!==ocrPhoto.ticket) return false;
                    ocrPhoto.image=image; gambarFotoOcr();
                    document.getElementById('ocrPhotoPreview').hidden=false;
                    setOcrStatus('Foto siap. Tabel akan dipilih otomatis, atau seret area tabel pada pratinjau.');
                    return true;
                } catch(error) { setOcrStatus('Foto tidak dapat dibuka. Gunakan JPG, PNG, WEBP, atau BMP.'); return false; }
                finally { URL.revokeObjectURL(url); }
            })();
            try { return await ocrPhoto.loading; }
            finally { if (ticket===ocrPhoto.ticket) ocrPhoto.loading=null; }
        }
        function gambarFotoOcr() {
            if (!ocrPhoto.image) return;
            const image=ocrPhoto.image, scale=Math.min(1,3200/Math.max(image.width,image.height),Math.sqrt(8000000/(image.width*image.height)));
            const w=image.width*scale,h=image.height*scale, angle=(ocrPhoto.turn+ocrPhoto.skew)*Math.PI/180;
            const canvas=document.createElement('canvas');
            canvas.width=Math.ceil(Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)));
            canvas.height=Math.ceil(Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle)));
            const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle);ctx.drawImage(image,-w/2,-h/2,w,h);
            ocrPhoto.source=canvas;ocrPhoto.crop=null;gambarPratinjauOcr();
        }
        function gambarPratinjauOcr() {
            const source=ocrPhoto.source,canvas=document.getElementById('ocrPreviewCanvas'); if (!source) return;
            const scale=Math.min(1,1100/source.width,420/source.height);
            canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
            const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,canvas.width,canvas.height);
            if (ocrPhoto.crop) {
                const r=ocrPhoto.crop;ctx.strokeStyle='#2563eb';ctx.lineWidth=3;ctx.setLineDash([8,4]);
                ctx.strokeRect(r.left*scale,r.top*scale,(r.right-r.left)*scale,(r.bottom-r.top)*scale);
            }
        }
        function putarFotoOcr(degrees) { ocrPhoto.turn=(ocrPhoto.turn+degrees)%360;gambarFotoOcr(); }
        function luruskanFotoOcr(degrees) { ocrPhoto.skew=Number(degrees)||0;document.getElementById('ocrSkewLabel').textContent=ocrPhoto.skew+'°';gambarFotoOcr(); }
        function resetAreaOcr() { ocrPhoto.crop=null;gambarPratinjauOcr();setOcrStatus('Seluruh foto digunakan; tabel tetap dideteksi otomatis saat dibaca.'); }
        (()=>{
            const canvas=document.getElementById('ocrPreviewCanvas');let start=null;
            const point=event=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(ocrPhoto.source.width,(event.clientX-r.left)*ocrPhoto.source.width/r.width)),y:Math.max(0,Math.min(ocrPhoto.source.height,(event.clientY-r.top)*ocrPhoto.source.height/r.height))};};
            canvas.addEventListener('pointerdown',event=>{if(!ocrPhoto.source||document.getElementById('btnOcrFoto').disabled)return;event.preventDefault();start=point(event);canvas.setPointerCapture(event.pointerId);});
            canvas.addEventListener('pointermove',event=>{if(!start)return;const p=point(event);ocrPhoto.crop={left:Math.min(start.x,p.x),top:Math.min(start.y,p.y),right:Math.max(start.x,p.x),bottom:Math.max(start.y,p.y)};gambarPratinjauOcr();});
            const finish=()=>{if(!start)return;start=null;if(!ocrPhoto.crop||ocrPhoto.crop.right-ocrPhoto.crop.left<30||ocrPhoto.crop.bottom-ocrPhoto.crop.top<30)ocrPhoto.crop=null;gambarPratinjauOcr();setOcrStatus(ocrPhoto.crop?'Area dipilih. Klik Baca Semua Baris untuk membaca area bergaris biru.':'Foto siap dibaca.');};
            canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
        })();
        function potongKanvasOcr(source,rect) {
            const left=Math.max(0,Math.floor(rect.left)),top=Math.max(0,Math.floor(rect.top));
            const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.min(source.width-left,Math.ceil(rect.right-left)));canvas.height=Math.max(1,Math.min(source.height-top,Math.ceil(rect.bottom-top)));
            const ctx=canvas.getContext('2d');
            if(rect.leftSlope||rect.rightSlope){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);for(let y=0;y<canvas.height;y++){const delta=top+y-(rect.anchorY||0),x=Math.max(0,left+(rect.leftSlope||0)*delta),right=Math.min(source.width,rect.right+(rect.rightSlope||0)*delta);if(right>x)ctx.drawImage(source,x,top+y,right-x,1,0,y,canvas.width,1);}}
            else ctx.drawImage(source,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);return canvas;
        }
        function kelompokGarisOcr(lines,axis) {
            const groups=[];
            lines.sort((a,b)=>a[axis]-b[axis]).forEach(line=>{const last=groups[groups.length-1];if(last&&line[axis]-last.end<=3){last.end=line[axis];last.position=(last.start+last.end)/2;}else groups.push({start:line[axis],end:line[axis],position:line[axis]});});
            return groups;
        }
        function deteksiGarisOcr(canvas) {
            const w=canvas.width,h=canvas.height,data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
            const longest=(count,pixel,cutoff)=>{let start=-1,last=-1,best={start:0,end:0};for(let i=0;i<count;i++){if(pixel(i)<cutoff){if(start<0)start=i;last=i;}else if(start>=0&&i-last>2){if(last-start>best.end-best.start)best={start,end:last};start=-1;}}if(start>=0&&last-start>best.end-best.start)best={start,end:last};return best;};
            const clusters=[];
            // Periksa garis tegas dan samar. Garis putus dinilai dari cakupan
            // pikselnya, bukan hanya potongan garis terpanjang.
            for(const cutoff of [145,225])for(let y=0;y<h;y++){
                let run=longest(w,x=>data[(y*w+x)*4],cutoff);
                if(run.end-run.start<w*.28){
                    let count=0,left=-1,right=-1;
                    for(let x=0;x<w;x++)if(data[(y*w+x)*4]<cutoff){count++;if(left<0)left=x;right=x;}
                    if(count<w*.42||count/Math.max(1,right-left+1)<.8)continue;
                    run={start:left,end:right};
                }
                let group=clusters.find(g=>Math.abs(g.left-run.start)<w*.035&&Math.abs(g.right-run.end)<w*.035);
                if(!group){group={left:run.start,right:run.end,lines:[]};clusters.push(group);}group.lines.push({y});
            }
            const candidates=clusters.map(g=>({...g,horizontal:kelompokGarisOcr(g.lines,'y').filter(line=>line.end-line.start<Math.max(8,h*.012))})).filter(g=>g.horizontal.length>=4);
            candidates.sort((a,b)=>(b.right-b.left)*b.horizontal.length-(a.right-a.left)*a.horizontal.length);
            if(!candidates.length)return null;
            const grid=candidates[0],top=grid.horizontal[0].position,bottom=grid.horizontal[grid.horizontal.length-1].position,vertical=[];
            for(let x=Math.max(0,grid.left-3);x<=Math.min(w-1,grid.right+3);x++){
                const run=longest(Math.floor(bottom-top+1),y=>data[((Math.floor(top)+y)*w+x)*4],225);
                if(run.end-run.start>(bottom-top)*.45)vertical.push({x});
            }
            const v=kelompokGarisOcr(vertical,'x');if(v.length<3)return null;
            return {left:grid.left,right:grid.right,top,bottom,horizontal:grid.horizontal,vertical:v};
        }
        function luruskanTabelOtomatisOcr(source) {
            const scale=Math.min(1,1000/source.width),w=Math.round(source.width*scale),h=Math.round(source.height*scale);
            const small=document.createElement('canvas');small.width=w;small.height=h;
            small.getContext('2d').drawImage(source,0,0,w,h);
            const trial=document.createElement('canvas');trial.width=w;trial.height=h;
            const ctx=trial.getContext('2d',{willReadFrequently:true});
            const score=angle=>{
                ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(small,-w/2,-h/2);
                const p=ctx.getImageData(0,0,w,h).data;let total=0;
                // Proyeksi piksel per baris tetap bekerja pada garis scan tipis
                // yang tidak lagi utuh setelah foto diperkecil.
                for(let y=0;y<h;y++){let count=0;for(let x=0;x<w;x++)if(p[(y*w+x)*4]<210)count++;total+=count*count;}
                return total;
            };
            const baseline=score(0);let best={angle:0,value:baseline};
            for(let angle=-3;angle<=3;angle+=.5){const value=score(angle);if(value>best.value)best={angle,value};}
            const center=best.angle;
            for(let step=-4;step<=4;step++){const angle=Math.round((center+step*.1)*10)/10,value=score(angle);if(value>best.value)best={angle,value};}
            if(Math.abs(best.angle)<.25||best.value<=baseline*1.15)return source;
            const angle=best.angle*Math.PI/180,canvas=document.createElement('canvas');
            canvas.width=Math.ceil(Math.abs(source.width*Math.cos(angle))+Math.abs(source.height*Math.sin(angle)));
            canvas.height=Math.ceil(Math.abs(source.width*Math.sin(angle))+Math.abs(source.height*Math.cos(angle)));
            const out=canvas.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,canvas.width,canvas.height);out.translate(canvas.width/2,canvas.height/2);out.rotate(angle);out.drawImage(source,-source.width/2,-source.height/2);
            return canvas;
        }
        function preparasiFotoOcr(source) {
            const scale=Math.min(3,3200/source.width,Math.sqrt(8000000/(source.width*source.height)));
            const canvas=document.createElement('canvas');canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,canvas.width,canvas.height);
            const image=ctx.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;
            for(let i=0;i<pixels.length;i+=4){const gray=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];const value=Math.max(0,Math.min(255,(gray-25)*255/200));pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
            ctx.putImageData(image,0,0);
            const straight=luruskanTabelOtomatisOcr(canvas);
            if(straight!==canvas)return bersihkanTabelOcr(straight);
            return bersihkanTabelOcr(canvas);
        }
        function bersihkanTabelOcr(canvas) {
            const ctx=canvas.getContext('2d',{willReadFrequently:true});
            ctx.setTransform(1,0,0,1,0,0);
            const rawCanvas=document.createElement('canvas');rawCanvas.width=canvas.width;rawCanvas.height=canvas.height;rawCanvas.getContext('2d').drawImage(canvas,0,0);
            const grid=deteksiGarisOcr(canvas);if(!grid||grid.right-grid.left<canvas.width*.5){hapusGarisLokalOcr(canvas);return {canvas,grid:null,rawCanvas,dataBottom:canvas.height};}
            // Hapus hanya pita garis panjang; teks di tengah sel tetap dipertahankan.
            ctx.fillStyle='#fff';
            grid.horizontal.forEach(line=>ctx.fillRect(grid.left-1,line.start-1,grid.right-grid.left+3,line.end-line.start+3));
            grid.vertical.forEach(line=>ctx.fillRect(line.start-1,grid.top-1,line.end-line.start+3,grid.bottom-grid.top+3));
            // Garis terakhir bisa hilang pada scan. Pertahankan seluruh bagian
            // bawah foto agar mahasiswa setelah garis itu tetap bisa dibaca.
            const crop={left:Math.max(0,grid.left-5),top:Math.max(0,grid.top-5),right:Math.min(canvas.width,grid.right+5),bottom:canvas.height};
            const table=potongKanvasOcr(canvas,crop);
            return {canvas:table,rawCanvas:potongKanvasOcr(rawCanvas,crop),grid:{horizontal:grid.horizontal.map(l=>l.position-Math.floor(crop.top)),vertical:grid.vertical.map(l=>l.position-Math.floor(crop.left))}};
        }
        function garisKolomScanOcr(canvas,words) {
            if(!canvas)return null;
            const header=words.find(w=>/^(NIM|N1M)$/.test(tokenOcr(w.text)))||words.filter(w=>nimOcr(w.text)).sort((a,b)=>a.y-b.y)[0];if(!header)return null;
            const w=canvas.width,h=canvas.height,pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
            const top=Math.max(0,Math.floor(header.y-header.h*.5)),bottom=Math.min(h,Math.ceil(header.y+header.h*2.2)),lines=[];
            for(let x=2;x<w-2;x++){
                let count=0;for(let y=top;y<bottom;y++){
                    let dark=false;for(let dx=-2;dx<=2;dx++)if(pixels[(y*w+x+dx)*4]<225){dark=true;break;}if(dark)count++;
                }
                if(count>(bottom-top)*.65)lines.push({x});
            }
            const vertical=kelompokGarisOcr(lines,'x').map(line=>line.position);
            if(vertical.length<3)return null;
            const anchorY=(top+bottom)/2,lowerY=Math.max(anchorY+100,Math.round(h*.82)),span=bottom-top;
            const slopes=vertical.map(edge=>{
                let best={x:edge,count:0};
                for(let x=Math.max(2,Math.floor(edge-w*.025));x<=Math.min(w-3,Math.ceil(edge+w*.025));x++){
                    let count=0;for(let y=Math.max(0,Math.floor(lowerY-span/2));y<Math.min(h,lowerY+span/2);y++){
                        let dark=false;for(let dx=-2;dx<=2;dx++)if(pixels[(y*w+x+dx)*4]<225){dark=true;break;}if(dark)count++;
                    }
                    if(count>best.count||(count===best.count&&Math.abs(x-edge)<Math.abs(best.x-edge)))best={x,count};
                }
                return best.count>span*.65?(best.x-edge)/(lowerY-anchorY):0;
            });
            return {vertical,horizontal:[],slopes,anchorY};
        }
        function hapusGarisLokalOcr(canvas) {
            // Scan terlipat atau perspektif miring tidak selalu mempunyai garis
            // utuh. Hilangkan segmen panjang tanpa memotong isi tabelnya.
            const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,w=canvas.width,h=canvas.height,mask=new Uint8Array(w*h);
            const mark=(length,pixel,minimum,horizontal,fixed)=>{
                let start=-1,last=-1;
                const finish=()=>{if(start>=0&&last-start>=minimum)for(let n=start;n<=last;n++)for(let pad=-1;pad<=1;pad++){
                    const x=horizontal?n:fixed+pad,y=horizontal?fixed+pad:n;if(x>=0&&x<w&&y>=0&&y<h)mask[y*w+x]=1;
                }start=-1;};
                for(let n=0;n<length;n++){if(pixel(n)<175){if(start<0)start=n;last=n;}else if(start>=0&&n-last>2)finish();}finish();
            };
            for(let y=0;y<h;y++)mark(w,x=>data[(y*w+x)*4],Math.max(45,w*.025),true,y);
            for(let x=0;x<w;x++)mark(h,y=>data[(y*w+x)*4],Math.max(65,h*.025),false,x);
            for(let p=0;p<mask.length;p++)if(mask[p])data[p*4]=data[p*4+1]=data[p*4+2]=255;
            ctx.putImageData(image,0,0);
        }
        function kataOcrTsv(tsv,offsetX=0,offsetY=0) {
            return (tsv||'').trim().split(/\r?\n/).slice(1).flatMap(line=>{
                const c=line.split('\t');if(c.length<12||c[0]!=='5'||!c[11].trim())return [];
                return [{text:c.slice(11).join('\t').trim(),x:Number(c[6])+offsetX,y:Number(c[7])+offsetY,w:Number(c[8]),h:Number(c[9]),conf:Math.max(0,Number(c[10])||0)}];
            });
        }
        function tokenOcr(text) { return text.toUpperCase().replace(/[^A-Z0-9/]/g,''); }
        function nimOcr(text,allowNumeric=false) {
            const raw=tokenOcr(text).replace(/\//g,'');
            if(allowNumeric&&/^\d{8,15}$/.test(raw))return raw;
            const match=raw.match(/^([A-Z]{1,3})([0-9OILSBZG]{7,15})$/);
            if(!match||((match[2].match(/\d/g)||[]).length/match[2].length)<.7)return '';
            const digits=match[2].replace(/[OILSBZG]/g,char=>({O:'0',I:'1',L:'1',S:'5',B:'8',Z:'2',G:'6'})[char]);
            return match[1]+digits;
        }
        function normalisasiNimKelas(value,prefixPattern,allowNumeric=true) {
            const code=nimOcr(value,allowNumeric);
            return prefixPattern&&/^\d+$/.test(code)&&(code.length===prefixPattern.digits||(prefixPattern.seenPrefix&&Math.abs(code.length-prefixPattern.digits)===1))?prefixPattern.prefix+code:code;
        }
        function polaAwalanNimKelas(codes) {
            const groups=new Map();let total=0;
            for(const code of codes){
                const match=String(code||'').match(/^([A-Z]{1,3})(\d{8,15})$/);if(!match)continue;
                total++;const key=match[1]+'|'+match[2].length;
                if(!groups.has(key))groups.set(key,{prefix:match[1],digits:match[2].length,count:0});groups.get(key).count++;
            }
            const best=[...groups.values()].sort((a,b)=>b.count-a.count)[0];
            return best&&best.count>=2&&best.count>=total*.85?{prefix:best.prefix,digits:best.digits}:null;
        }
        function rapikanPolaNimKelas(rows) {
            const pattern=polaAwalanNimKelas(rows.map(row=>row.nim));
            rows.forEach(row=>{
                const normalized=normalisasiNimKelas(row.nim,pattern,true);
                // Awalan dapat dipulihkan dari bukti baris lain; angka identitas
                // tidak diubah agar menyerupai mayoritas mahasiswa.
                if(normalized&&normalized!==row.nim){row.nim=normalized;row.corrected=true;row.confidence=Math.min(row.confidence??100,70);}
            });
            return rows;
        }
        function barisKataOcr(words) {
            const rows=[];words.slice().sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)||a.x-b.x).forEach(word=>{
                const cy=word.y+word.h/2;let row=rows.find(r=>Math.abs(r.cy-cy)<=Math.max(r.height,word.h)*.55);
                if(!row){row={cy,height:word.h,words:[]};rows.push(row);}row.words.push(word);row.cy=row.words.reduce((s,w)=>s+w.y+w.h/2,0)/row.words.length;row.height=Math.max(row.height,word.h);
            });return rows.sort((a,b)=>a.cy-b.cy).map(row=>({...row,words:row.words.sort((a,b)=>a.x-b.x)}));
        }
        function kolomOcr(words,grid,width) {
            const nimHead=words.find(w=>/^(NIM|N1M)$/.test(tokenOcr(w.text)));
            const nearestHeader=pattern=>words.filter(w=>pattern.test(tokenOcr(w.text))&&(!nimHead||Math.abs(w.y-nimHead.y)<Math.max(70,nimHead.h*3))).sort((a,b)=>nimHead?Math.abs(a.y-nimHead.y)-Math.abs(b.y-nimHead.y):a.y-b.y)[0];
            const nameHead=nearestHeader(/^(NAMA|MAHASISWA)$/);
            const sexHead=nearestHeader(/^(L\/P|P\/L|LP|PL|JK|KELAMIN|GENDER|JENISKELAMIN)$/);
            let nimX=nimHead?nimHead.x+nimHead.w/2:null;
            if(nimX===null){const anchors=words.filter(w=>nimOcr(w.text));if(anchors.length<2)return null;nimX=anchors.map(w=>w.x+w.w/2).sort((a,b)=>a-b)[Math.floor(anchors.length/2)];}
            const bounds=x=>{if(!grid)return null;for(let i=0;i<grid.vertical.length-1;i++)if(x>=grid.vertical[i]&&x<=grid.vertical[i+1])return {left:grid.vertical[i]+3,right:grid.vertical[i+1]-3,leftSlope:grid.slopes?.[i]||0,rightSlope:grid.slopes?.[i+1]||0,anchorY:grid.anchorY||0};return null;};
            let nim=bounds(nimX),name=nameHead?bounds(nameHead.x+nameHead.w/2):null,sex=sexHead?bounds(sexHead.x+sexHead.w/2):null;
            if(nim&&!name){const i=grid.vertical.findIndex(x=>Math.abs(x-(nim.right+3))<4);if(i>=0&&i<grid.vertical.length-1)name={left:grid.vertical[i]+3,right:grid.vertical[i+1]-3};}
            if(!nim||!name){
                if(!nimHead||!nameHead){
                    const anchors=words.filter(w=>nimOcr(w.text)&&Math.abs(w.x+w.w/2-nimX)<width*.04);if(anchors.length<2)return null;
                    const firstNames=anchors.flatMap(anchor=>{const row=words.filter(w=>w.x>anchor.x+anchor.w&&Math.abs(w.y+w.h/2-anchor.y-anchor.h/2)<anchor.h*.7).sort((a,b)=>a.x-b.x);const first=row.find(w=>/[A-Za-z]/.test(w.text)&&tokenOcr(w.text).length>1);return first&&namaOcr([first])?[first]:[];});if(firstNames.length<2)return null;
                    const edge=(Math.max(...anchors.map(w=>w.x+w.w))+Math.min(...firstNames.map(w=>w.x)))/2;
                    const scores=words.filter(w=>/^\d{1,3}$/.test(w.text)&&w.x>edge+width*.08&&anchors.some(a=>Math.abs(w.y+w.h/2-a.y-a.h/2)<a.h*.7));
                    const scoreX=scores.length>=3?scores.map(w=>w.x).sort((a,b)=>a-b)[Math.floor(scores.length/2)]:Math.min(width,edge+width*.35);
                    return {nim:{left:Math.max(0,Math.min(...anchors.map(w=>w.x))-width*.008),right:edge},name:{left:edge,right:scoreX-6},sex:null,dataTop:Math.max(0,Math.min(...anchors.map(w=>w.y),...words.filter(w=>w.x+w.w/2>=edge&&w.x+w.w/2<=scoreX&&tokenOcr(w.text).length>1&&namaOcr([w])).map(w=>w.y))-6),hasHeader:false};
                }
                const nameX=nameHead.x+nameHead.w/2,mid=(nimX+nameX)/2;
                nim=nimX<nameX?{left:0,right:mid}:{left:mid,right:width};name=nimX<nameX?{left:mid,right:width}:{left:0,right:mid};
                if(sexHead){const sexX=sexHead.x+sexHead.w/2,edge=(nameX+sexX)/2;sex=sexX>nameX?{left:edge,right:width}:{left:0,right:edge};if(sexX>nameX)name.right=edge;else name.left=edge;}
            }
            const headerBottom=nimHead?Math.max(nimHead.y+nimHead.h,nameHead?nameHead.y+nameHead.h:0):Math.max(0,Math.min(...words.filter(w=>nimOcr(w.text)||(w.x+w.w/2>=name.left&&w.x+w.w/2<=name.right&&tokenOcr(w.text).length>1&&namaOcr([w]))).map(w=>w.y))-9);
            const dataTop=grid&&nimHead?(grid.horizontal.find(y=>y>headerBottom+2)??headerBottom+3):headerBottom+3;
            return {nim,name,sex,dataTop,hasHeader:!!nimHead};
        }
        function inferKolomGridOcr(words,grid,width) {
            if(!grid||grid.vertical.length<3)return null;
            const columns=[];
            for(let i=0;i<grid.vertical.length-1;i++)columns.push({index:i,left:grid.vertical[i]+2,right:grid.vertical[i+1]-2,nimCount:0,nameCount:0,sexCount:0});
            const rowData=barisKataOcr(words).map(row=>{
                const cells=columns.map(col=>row.words.filter(w=>w.x+w.w/2>=col.left&&w.x+w.w/2<=col.right));
                return {row,cells};
            });
            rowData.forEach(({cells})=>cells.forEach((cell,i)=>{
                const text=cell.map(w=>w.text).join(' '),column=columns[i];
                if(nimOcr(text,true))column.nimCount++;
                if(namaOcr(cell))column.nameCount++;
                if(genderOcr(cell))column.sexCount++;
            }));
            const nimColumn=columns.slice().sort((a,b)=>b.nimCount-a.nimCount||a.index-b.index)[0];
            if(!nimColumn||!nimColumn.nimCount)return null;
            const nameColumn=columns.filter(col=>col.index!==nimColumn.index&&col.left>nimColumn.left)
                .sort((a,b)=>b.nameCount-a.nameCount||a.index-b.index)[0];
            if(!nameColumn||!nameColumn.nameCount)return null;
            const firstData=rowData.find(({row,cells})=>{
                const top=grid.horizontal.findIndex((y,i)=>i<grid.horizontal.length-1&&row.cy>=y&&row.cy<grid.horizontal[i+1]);
                return top>=0&&row.cy>=grid.top&&row.cy<=grid.bottom&&(nimOcr(cells[nimColumn.index].map(w=>w.text).join(' '),true)||namaOcr(cells[nameColumn.index]));
            });
            if(!firstData)return null;
            const rowIndex=grid.horizontal.findIndex((y,i)=>i<grid.horizontal.length-1&&firstData.row.cy>=y&&firstData.row.cy<grid.horizontal[i+1]);
            const bounds=column=>({left:column.left,right:column.right});
            const sexColumn=columns.filter(col=>col.index>nameColumn.index&&col.sexCount>0).sort((a,b)=>b.sexCount-a.sexCount)[0];
            return {nim:bounds(nimColumn),name:bounds(nameColumn),sex:sexColumn?bounds(sexColumn):null,dataTop:grid.horizontal[rowIndex],hasHeader:true,inferred:true};
        }
        function namaOcr(words) {
            const name=words.map(w=>w.text.replace(/[|\[\]{}]/g,'').replace(/^[\\/]+|[\\/]+$/g,'').trim()).filter(t=>/[A-Za-zÀ-ž]/.test(t)).join(' ').replace(/\s+/g,' ').trim();
            return /\b(?:TAHUN\s*AKADEMIK|SEMESTER|DOSEN|NAMA|MAHASISWA|NIM|NPM|NRP|EMAIL|TELP|TLP|TLPN|PRODI|JLN|JALAN|NIDN|NIP|PENGAWAS|PENGAMPU|MAT[A]?KULIAH)\b/i.test(name)||name.replace(/[^A-Za-zÀ-ž]/g,'').length<2?'':name;
        }
        function genderOcr(words) { const token=words.map(w=>tokenOcr(w.text)).join('');return /^(P+|PEREMPUAN|WANITA)$/.test(token)?'P':/^(L+|LAKI|LAKILAKI|PRIA)$/.test(token)?'L':''; }
        function gabungKolomOcr(nimWords,nameWords,sexWords,grid,dataTop,allowNumeric) {
            const grouped=words=>{
                if(!grid)return barisKataOcr(words.filter(w=>w.y+w.h/2>=dataTop));
                const groups=new Map(),outside=[];words.forEach(w=>{const cy=w.y+w.h/2;if(cy<dataTop)return;const row=grid.horizontal.findIndex((y,i)=>i<grid.horizontal.length-1&&cy>=y&&cy<grid.horizontal[i+1]);if(row<0){outside.push(w);return;}if(!groups.has(row))groups.set(row,{cy:(grid.horizontal[row]+grid.horizontal[row+1])/2,height:grid.horizontal[row+1]-grid.horizontal[row],words:[]});groups.get(row).words.push(w);});
                return Array.from(groups.values()).concat(barisKataOcr(outside)).sort((a,b)=>a.cy-b.cy).map(r=>({...r,words:r.words.sort((a,b)=>a.x-b.x)}));
            };
            const nims=grouped(nimWords),names=grouped(nameWords),sexes=grouped(sexWords),rows=[];
            nims.forEach(row=>{
                const raw=row.words.map(w=>w.text).join(''),nim=nimOcr(raw,allowNumeric);if(!nim)return;
                const near=list=>list.find(r=>Math.abs(row.cy-r.cy)<Math.max(row.height,r.height)*.65);
                const name=near(names);if(!name)return;const nama=namaOcr(name.words);if(!nama)return;
                const sex=near(sexes),avg=words=>words.reduce((s,w)=>s+w.conf,0)/Math.max(1,words.length);
                const nimConfidence=avg(row.words),nameConfidence=avg(name.words);
                rows.push({nim,nama,jk:sex?genderOcr(sex.words):'',confidence:Math.round(Math.min(nimConfidence,nameConfidence)),nimConfidence,nameConfidence,corrected:tokenOcr(raw)!==nim||row.words.some(w=>w.ocrDisputed)||nimConfidence<85||nameConfidence<85,sourceY:row.cy});
            });return rows;
        }
        function rentangBarisOcr(canvas,layout,grid) {
            const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
            const col=layout.name||layout.nim,left=Math.max(0,Math.ceil(col.left)),right=Math.min(canvas.width,Math.floor(col.right)),width=right-left;
            const bands=[];let start=-1,last=-1;
            const finish=()=>{if(start>=0&&last-start>=3)bands.push({top:start,bottom:last+1});start=-1;};
            for(let y=Math.ceil(layout.dataTop);y<(layout.dataBottom||canvas.height);y++){
                let count=0;for(let x=left;x<right;x++)if(data[(y*canvas.width+x)*4]<185)count++;
                // Abaikan sisa garis panjang; cari pita teks NIM setiap baris.
                if(count>=Math.max(3,width*.015)&&count<width*.7){if(start<0)start=y;last=y;}
                else if(start>=0&&y-last>2)finish();
            }
            finish();
            if(!layout.hasHeader&&bands.length>=5){
                const heights=bands.map(b=>b.bottom-b.top).sort((a,b)=>a-b),gap=Math.max(40,heights[Math.floor(heights.length/2)]*3);
                const stop=bands.findIndex((band,i)=>i>=5&&band.top-bands[i-1].bottom>gap);if(stop>=0)bands.splice(stop);
            }
            const padded=bands.map((b,i)=>{const pad=Math.max(4,(b.bottom-b.top)*.4);return {top:Math.max(layout.dataTop,b.top-pad,i?(bands[i-1].bottom+b.top)/2:0),bottom:Math.min(canvas.height,b.bottom+pad,i<bands.length-1?(b.bottom+bands[i+1].top)/2:canvas.height)};});
            if(!grid)return padded;
            const cells=[];
            for(let i=0;i<grid.horizontal.length-1;i++){
                const top=grid.horizontal[i],bottom=grid.horizontal[i+1];if(top<layout.dataTop-2)continue;
                const inside=padded.filter(b=>(b.top+b.bottom)/2>=top&&(b.top+b.bottom)/2<bottom);
                if(inside.length>1)cells.push(...inside);else cells.push({top,bottom});
            }
            return cells.concat(padded.filter(b=>(b.top+b.bottom)/2>=grid.horizontal[grid.horizontal.length-1])).sort((a,b)=>a.top-b.top);
        }
        function bandsNomorBarisOcr(words,width,height) {
            const numbers=words.flatMap(word=>{
                const token=tokenOcr(word.text);if(!/^\d{1,3}$/.test(token))return [];
                const value=Number(token);return value>=1&&value<=200?[{value,x:word.x+word.w/2,y:word.y+word.h/2,h:word.h,conf:word.conf}]:[];
            }).sort((a,b)=>a.x-b.x);
            const clusters=[];
            numbers.forEach(item=>{
                let cluster=clusters.find(items=>Math.abs(items.reduce((sum,n)=>sum+n.x,0)/items.length-item.x)<width*.025);
                if(!cluster){cluster=[];clusters.push(cluster);}cluster.push(item);
            });
            let best=null;
            clusters.forEach(cluster=>{
                cluster.sort((a,b)=>a.y-b.y);
                const slopes=[];
                for(let i=0;i<cluster.length;i++)for(let j=i+1;j<cluster.length;j++){
                    const dy=cluster[j].y-cluster[i].y,dn=cluster[j].value-cluster[i].value;
                    if(dn>=1&&dn<=4&&dy>0){const pitch=dy/dn;if(pitch>height*.008&&pitch<height*.04)slopes.push(pitch);}
                }
                if(slopes.length<4)return;
                slopes.sort((a,b)=>a-b);const pitch=slopes[Math.floor(slopes.length/2)];
                const offsets=cluster.map(item=>item.y-item.value*pitch).sort((a,b)=>a-b),offset=offsets[Math.floor(offsets.length/2)];
                const inliers=cluster.filter(item=>Math.abs(item.y-(offset+item.value*pitch))<pitch*.38);
                if(new Set(inliers.map(item=>item.value)).size<5)return;
                if(!best||inliers.length>best.inliers.length)best={inliers,pitch,offset};
            });
            if(!best)return null;
            let first=Math.min(...best.inliers.map(item=>item.value)),last=Math.max(...best.inliers.map(item=>item.value));
            const hasStudentText=value=>{
                const y=best.offset+value*best.pitch,near=words.filter(word=>Math.abs(word.y+word.h/2-y)<best.pitch*.42);
                return near.some(word=>nimOcr(word.text,true))||!!namaOcr(near);
            };
            for(let i=0;i<2&&first>1&&hasStudentText(first-1);i++)first--;
            return Array.from({length:last-first+1},(_,i)=>{const number=first+i,sourceY=best.offset+number*best.pitch;return {top:sourceY-best.pitch/2,bottom:sourceY+best.pitch/2,number,sourceY};});
        }
        async function bacaSelIdentitasOcr(worker,canvas,rawCanvas,col,band,isNim,seed,prefixPattern) {
            const candidates=new Map();
            const add=(value,confidence)=>{
                const normalized=isNim?normalisasiNimKelas(value,prefixPattern,true):namaOcr([{text:value}]);if(!normalized)return;
                const key=isNim?normalized:normalized.toUpperCase(),item=candidates.get(key)||{value:normalized,votes:0,total:0,maxConfidence:0,corrected:false};
                item.votes++;item.total+=confidence;item.maxConfidence=Math.max(item.maxConfidence,confidence);item.corrected ||= isNim&&tokenOcr(value)!==normalized;candidates.set(key,item);
            };
            if(seed?.value)add(seed.value,seed.confidence||0);
            if(!col)return {value:seed?.value||'',confidence:seed?.confidence||0,disputed:false};
            const left=Math.max(0,Math.floor(col.left)),top=Math.max(0,Math.ceil(band.top+1)),rect={...col,left,top,right:col.right,bottom:band.bottom-1};
            const cell=potongKanvasOcr(canvas,rect),original=rawCanvas?potongKanvasOcr(rawCanvas,rect):cell;
            const pixels=cell.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cell.width,cell.height).data;
            let ink=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p]<185)ink++;
            if(ink>=12){
                const recognize=async(source,psm,threshold)=>{
                    const sample=document.createElement('canvas');sample.width=source.width;sample.height=source.height;
                    const ctx=sample.getContext('2d');ctx.drawImage(source,0,0);
                    if(threshold){const image=ctx.getImageData(0,0,sample.width,sample.height);for(let p=0;p<image.data.length;p+=4){const value=image.data[p]<threshold?0:255;image.data[p]=image.data[p+1]=image.data[p+2]=value;}ctx.putImageData(image,0,0);}
                    const scale=Math.min(3,Math.max(1,48/Math.max(1,cell.height))),padded=document.createElement('canvas');
                    padded.width=Math.ceil(cell.width*scale)+40;padded.height=Math.ceil(cell.height*scale)+32;
                    const out=padded.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,padded.width,padded.height);out.imageSmoothingQuality='high';out.drawImage(sample,20,16,cell.width*scale,cell.height*scale);
                    await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:isNim?'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':''});
                    const result=await worker.recognize(padded,{}, {tsv:true}),words=kataOcrTsv(result.data.tsv);
                    const nameWords=words.filter(w=>/[A-Za-zÀ-ž]/.test(w.text));
                    const confidence=isNim?words.reduce((sum,w)=>sum+w.conf,0)/Math.max(1,words.length):nameWords.length?Math.min(...nameWords.map(w=>w.conf)):0;
                    add(isNim?words.map(w=>w.text).join(''):namaOcr(words),confidence);
                };
                // Satu kolom panjang dapat kehilangan huruf awal atau menggabung
                // nama antarbaris. Baca setiap sel pada beberapa tampilan piksel.
                await recognize(cell,'7',0);
                await recognize(cell,'13',165);
                await recognize(original,'7',0);
                if(candidates.size>1||![...candidates.values()].some(item=>item.total/item.votes>=90))await recognize(cell,'7',190);
            }
            // Pengulangan hasil dengan keyakinan 0 tidak boleh mengalahkan
            // bacaan yang lebih jelas, terutama untuk nama panjang.
            const rank=item=>item.maxConfidence+Math.min(3,item.votes)*5+(isNim&&prefixPattern&&item.value.length===prefixPattern.prefix.length+prefixPattern.digits?8:0)-(isNim?0:/[0-9\\/]/.test(item.value)?15:0);
            const choices=[...candidates.values()].sort((a,b)=>rank(b)-rank(a)),best=choices[0];
            if(isNim&&prefixPattern&&best&&/^\d+$/.test(best.value)&&candidates.has(prefixPattern.prefix+best.value)){
                // Untuk bacaan yang panjangnya tidak lazim, pulihkan awalan
                // hanya jika sel yang sama benar-benar menghasilkan huruf itu.
                best.value=prefixPattern.prefix+best.value;best.corrected=true;
            }
            return {value:best?.value||'',confidence:best?Math.round(best.total/best.votes):0,corrected:!!best?.corrected,disputed:choices.length>1};
        }
        async function lengkapiBarisOcr(worker,canvas,layout,grid,rows,knownNims=[],numberBands=null,prefixPattern=null,rawCanvas=null,evidenceWords=[]) {
            const bands=numberBands||rentangBarisOcr(canvas,layout,grid);
            const readCell=async(col,band,isNim)=>{
                if(!col)return [];
                const left=Math.max(0,Math.floor(col.left)),top=Math.max(0,Math.ceil(band.top+2));
                const cell=potongKanvasOcr(canvas,{...col,left,top,right:col.right,bottom:band.bottom-2});
                const pixels=cell.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cell.width,cell.height).data;
                let ink=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p]<185)ink++;
                if(ink<12)return [];
                const padded=document.createElement('canvas');padded.width=cell.width+32;padded.height=cell.height+24;
                const ctx=padded.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(cell,16,12);
                await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:isNim?'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':''});
                const result=await worker.recognize(padded,{}, {tsv:true});return kataOcrTsv(result.data.tsv,left-16,top-12);
            };
            for(let i=0;i<bands.length;i++){
                const band=bands[i];
                const existingIndex=rows.findIndex(row=>row.sourceY>=band.top&&row.sourceY<band.bottom),existing=existingIndex>=0?rows[existingIndex]:null;
                setOcrStatus('Memeriksa semua baris: '+(i+1)+' / '+bands.length+'…');
                const knownWords=knownNims.filter(w=>w.y+w.h/2>=band.top&&w.y+w.h/2<band.bottom).sort((a,b)=>a.x-b.x),avg=words=>words.reduce((sum,w)=>sum+w.conf,0)/Math.max(1,words.length);
                const seenPrefix=prefixPattern&&evidenceWords.some(w=>w.y+w.h/2>=band.top&&w.y+w.h/2<band.bottom&&w.x+w.w/2>=layout.nim.left&&w.x+w.w/2<=layout.nim.right&&tokenOcr(w.text).startsWith(prefixPattern.prefix));
                const rowPattern=prefixPattern?{...prefixPattern,seenPrefix:!!seenPrefix}:null;
                const nimRead=await bacaSelIdentitasOcr(worker,canvas,rawCanvas,layout.nim,band,true,{value:existing?.nim||knownWords.map(w=>w.text).join(''),confidence:existing?.nimConfidence??avg(knownWords)},rowPattern);
                const nameRead=await bacaSelIdentitasOcr(worker,canvas,rawCanvas,layout.name,band,false,{value:existing?.nama||'',confidence:existing?.nameConfidence??0},null);
                const nim=nimRead.value,nama=nameRead.value;
                if(existing){
                    if(nim){if(existing.nim!==nim)existing.corrected=true;existing.nim=nim;existing.nimConfidence=nimRead.confidence;}
                    if(nama){if(existing.nama!==nama)existing.corrected=true;existing.nama=nama;existing.nameConfidence=nameRead.confidence;}
                    existing.confidence=Math.round(Math.min(existing.nimConfidence??0,existing.nameConfidence??0));
                    if(nimRead.disputed||nameRead.disputed||nimRead.corrected||existing.confidence<85)existing.corrected=true;
                    if(!existing.jk){const sexWords=await readCell(layout.sex,band,false);existing.jk=genderOcr(sexWords);}
                    continue;
                }
                if(!nim&&!nama){
                    // Keep unreadable table rows visible for manual correction instead of dropping them silently.
                    rows.push({nim:'',nama:'',jk:'',confidence:0,corrected:true,sourceY:(band.top+band.bottom)/2});
                    continue;
                }
                if(!nama||(!nim&&nama.replace(/[^A-Za-zÀ-ž]/g,'').length<3)){
                    rows.push({nim,nama,jk:'',confidence:0,corrected:true,sourceY:(band.top+band.bottom)/2});
                    continue;
                }
                const sexWords=await readCell(layout.sex,band,false),nimConfidence=nimRead.confidence,nameConfidence=nameRead.confidence;
                rows.push({nim,nama,jk:genderOcr(sexWords),confidence:Math.round(Math.min(nimConfidence,nameConfidence)),nimConfidence,nameConfidence,corrected:nimRead.disputed||nameRead.disputed||nimRead.corrected,sourceY:(band.top+band.bottom)/2});
            }
            await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
            return rows.sort((a,b)=>a.sourceY-b.sourceY);
        }
        function parseOcrDaftarTsv(tsv,grid=null,width=0) {
            const words=kataOcrTsv(tsv);if(!words.length)return [];
            const layout=kolomOcr(words,grid,width||Math.max(...words.map(w=>w.x+w.w)));
            if(layout){const inColumn=col=>col?words.filter(w=>w.x+w.w/2>=col.left&&w.x+w.w/2<=col.right):[];return gabungKolomOcr(inColumn(layout.nim),inColumn(layout.name),inColumn(layout.sex),grid,layout.dataTop,layout.hasHeader);}
            // Tanpa judul kolom, terima hanya baris bernomor dengan NIM alfanumerik.
            // Angka telepon/tahun di kop tidak cukup untuk menjadi mahasiswa.
            return barisKataOcr(words).flatMap(row=>{
                const first=tokenOcr(row.words[0].text);if(!/^\d{1,3}$/.test(first)||Number(first)>200)return [];
                const at=row.words.findIndex((w,i)=>i>0&&nimOcr(w.text));if(at<0)return [];
                const nama=namaOcr(row.words.slice(at+1));if(!nama)return [];
                return [{nim:nimOcr(row.words[at].text),nama,jk:'',confidence:Math.round(Math.min(...row.words.map(w=>w.conf)))}];
            });
        }
        function tambahBarisOcr(row,index) {
            const tbody=document.getElementById('ocrReviewRows'),tr=document.createElement('tr');tr.dataset.confidence=row.confidence??'';
            const addInput=(value,label)=>{const td=document.createElement('td'),input=document.createElement('input');input.type='text';input.value=value;input.setAttribute('aria-label',label);input.style.cssText='width:100%;min-width:110px;padding:9px;border:1px solid var(--card-border);border-radius:8px;background:var(--input-bg);color:var(--text-main);';td.appendChild(input);tr.appendChild(td);return input;};
            const hasilPindai=Number.isFinite(row.confidence)&&(!row.source||/\bOCR\b|foto|gambar/i.test(row.source)),perluPeriksa=!!row.corrected||hasilPindai;
            const nimInput=addInput(row.nim||'','NIM baris '+index),namaInput=addInput(row.nama||'','Nama baris '+index);
            if(hasilPindai){[nimInput,namaInput].forEach(input=>{input.style.borderColor='#ef4444';input.title='Cocokkan setiap karakter dengan berkas foto/scan asli sebelum menyimpan.';});}
            const genderCell=document.createElement('td'),gender=document.createElement('select');gender.setAttribute('aria-label','Jenis kelamin baris '+index);gender.innerHTML='<option value="">Pilih L/P…</option><option value="L">Laki-laki (L)</option><option value="P">Perempuan (P)</option>';gender.value=row.jk||'';gender.style.cssText='min-height:40px;padding:7px;border-radius:8px;background:var(--input-bg);color:var(--text-main);';genderCell.appendChild(gender);tr.appendChild(genderCell);
            const confidenceCell=document.createElement('td'),missing=!row.nim||!row.nama;confidenceCell.textContent=(row.source?row.source+' · ':'')+(missing?'lengkapi '+(!row.nim?'NIM':'nama'):Number.isFinite(row.confidence)?row.confidence+'%'+(perluPeriksa?' · cocokkan NIM/Nama dengan asli':''):row.source?'dibaca langsung':'Koreksi manual');confidenceCell.style.cssText='text-align:center;'+(missing?'color:#ef4444;font-weight:700;':perluPeriksa?'color:#ef4444;font-weight:700;':row.confidence<80?'color:#f59e0b;':'');tr.appendChild(confidenceCell);
            const actionCell=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='btn-custom btn-danger';remove.textContent='Hapus';remove.onclick=()=>tr.remove();actionCell.appendChild(remove);tr.appendChild(actionCell);tbody.appendChild(tr);
        }
        function tampilkanHasilOcr(rows) {
            document.getElementById('ocrReviewRows').replaceChildren();rows.forEach((row,i)=>tambahBarisOcr(row,i+1));
            document.getElementById('ocrReviewPanel').hidden=false;
            const empty=rows.filter(row=>!row.jk).length;
            const ocr=rows.some(row=>Number.isFinite(row.confidence)),missing=rows.filter(row=>!row.nim||!row.nama).length;
            document.getElementById('ocrReviewHelp').textContent='Periksa semua '+rows.length+' baris dengan berkas asli sebelum menyimpan. '+(ocr?'Foto/scan dapat salah mengenali huruf atau angka; bingkai merah menandai NIM dan nama yang wajib dicocokkan. NIM yang kosong tidak ditebak. ':'Teks dokumen dibaca langsung tanpa OCR. ')+(missing?missing+' baris perlu dilengkapi NIM atau namanya. ':'')+(empty?empty+' baris tidak memuat L/P; pilih jenis kelamin sendiri, atau gunakan pengisian L/P yang kosong.':'L/P dibaca dari kolom berkas.');
            setOcrStatus(rows.length+' baris mahasiswa ditampilkan untuk diperiksa'+(missing?' ('+missing+' perlu dilengkapi)':'')+'.');
        }
        function tambahBarisKoreksiOcr() { document.getElementById('ocrReviewPanel').hidden=false;tambahBarisOcr({},document.getElementById('ocrReviewRows').rows.length+1); }
        function isiGenderOcrKosong() { const value=document.getElementById('ocrEmptyGender').value;if(!value)return;document.querySelectorAll('#ocrReviewRows select').forEach(select=>{if(!select.value)select.value=value;}); }
        const importLibraryPromises = {};
        function muatPustakaImpor(name,url) {
            if(window[name])return Promise.resolve(window[name]);
            if(!importLibraryPromises[name])importLibraryPromises[name]=new Promise((resolve,reject)=>{
                const script=document.createElement('script');script.src=url;
                script.onload=()=>window[name]?resolve(window[name]):reject(new Error('Pustaka '+name+' tidak tersedia.'));
                script.onerror=()=>{delete importLibraryPromises[name];script.remove();reject(new Error('Pustaka pembaca berkas gagal dimuat. Periksa internet lalu coba lagi.'));};
                document.head.appendChild(script);
            });return importLibraryPromises[name];
        }
        function jenisBerkasDaftar(file) {
            const ext=(file.name.split('.').pop()||'').toLowerCase();
            return ['pdf','doc','docx','xls','xlsx','csv'].includes(ext)?ext:file.type.startsWith('image/')||['jpg','jpeg','png','webp','bmp'].includes(ext)?'image':'';
        }
        async function muatBerkasDaftarMahasiswa() {
            const file=document.getElementById('fotoDaftarMahasiswa').files[0];if(!file)return;
            document.getElementById('ocrReviewPanel').hidden=true;document.getElementById('ocrReviewRows').replaceChildren();
            if(jenisBerkasDaftar(file)==='image')return muatPratinjauOcr();
            ocrPhoto.ticket++;ocrPhoto.file=null;ocrPhoto.image=null;ocrPhoto.source=null;ocrPhoto.loading=null;
            document.getElementById('ocrPhotoPreview').hidden=true;
            setOcrStatus(jenisBerkasDaftar(file)?'Berkas siap. Klik Baca Semua Baris; seluruh halaman atau lembar akan diperiksa.':'Pilih foto, PDF, DOC/DOCX, atau XLS/XLSX/CSV.');
        }
        function nimBerkas(value) {
            const code=String(value??'').trim().replace(/^'/,'').replace(/\s+/g,'');
            return /^[A-Za-z0-9][A-Za-z0-9./_-]{4,49}$/.test(code)&&(code.match(/\d/g)||[]).length>=5?code:'';
        }
        function teksSelBerkas(value) { return String(value??'').replace(/\s+/g,' ').trim(); }
        function parseTabelBerkas(table,source) {
            const out=[];let columns=null;
            for(const values of table){
                const cells=values.map(teksSelBerkas),labels=cells.map(s=>tokenOcr(s).replace(/\//g,''));
                const nimAt=labels.findIndex(s=>/^(NIM|NPM|NRP|NOMORINDUKMAHASISWA)$/.test(s)),nameAt=labels.findIndex(s=>/^(NAMA|NAMAMAHASISWA|NAMALENGKAP|NAMASISWA)$/.test(s));
                if(nimAt>=0&&nameAt>=0){columns={nim:nimAt,name:nameAt,sex:labels.findIndex(s=>/^(LP|PL|JK|JENISKELAMIN|KELAMIN|GENDER)$/.test(s))};continue;}
                let at=columns?columns.nim:cells.findIndex(value=>nimBerkas(value));if(at<0)continue;
                const nim=nimBerkas(cells[at]),name=columns?columns.name:at+1;
                if(!nim&&!columns)continue;
                const nama=teksSelBerkas(cells[name]||'');if((!nama&&(!nim||!columns))||(nama&&!namaOcr([{text:nama}])))continue;
                const jk=columns&&columns.sex>=0?genderOcr([{text:cells[columns.sex]||''}]):'';
                out.push({nim:nim||'',nama,jk,source,confidence:100,corrected:!nim||!nama});
            }return out;
        }
        function parseHtmlBerkas(html,source) {
            const doc=new DOMParser().parseFromString(html,'text/html'),rows=[];
            doc.querySelectorAll('table').forEach(table=>{
                const matrix=[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent));rows.push(...parseTabelBerkas(matrix,source));
            });return {rows,doc};
        }
        function parseTeksWord(text,source) {
            // Word lama menandai akhir sel dengan U+0007. Baca seluruh rantai
            // sel; halaman tidak membatasi jumlah mahasiswa yang diambil.
            if(text.includes('\x07')){
                const cells=text.split('\x07').map(teksSelBerkas),labels=cells.map(tokenOcr),head=labels.findIndex(s=>/^(NIM|NPM|NRP)$/.test(s));
                const nameHead=labels.findIndex(s=>/^(NAMA|NAMAMAHASISWA|NAMALENGKAP)$/.test(s));
                const sexHead=labels.findIndex(s=>/^(L\/P|P\/L|LP|PL|JK|JENISKELAMIN)$/.test(s));
                const out=[];for(let i=Math.max(0,head+1);i<cells.length;i++){
                    const nim=nimBerkas(cells[i]);if(!nim)continue;
                    const nameAt=head>=0&&nameHead>=0?i+nameHead-head:i+1,nama=cells[nameAt]||'';
                    if(!namaOcr([{text:nama}]))continue;
                    const sexAt=sexHead>=0&&head>=0?i+sexHead-head:-1;
                    out.push({nim,nama,jk:sexAt>=0?genderOcr([{text:cells[sexAt]||''}]):'',source});
                }return out;
            }
            return parseTabelBerkas(text.replace(/\r\n?/g,'\n').split('\n').map(line=>line.split(/\t| {2,}/)),source);
        }
        function teksDocLama(buffer,CFB) {
            const container=CFB.read(new Uint8Array(buffer),{type:'array'}),word=CFB.find(container,'WordDocument');
            if(!word||!word.content)throw new Error('DOC tidak memuat teks Word yang dapat dibaca. Simpan ulang sebagai DOCX atau PDF.');
            const bytes=new Uint8Array(word.content),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
            const u16=offset=>view.getUint16(offset,true),u32=offset=>view.getUint32(offset,true);
            if(bytes.length<154||u16(0)!==0xa5ec)throw new Error('Format DOC lama tidak dikenali. Simpan ulang sebagai DOCX atau PDF.');
            if(u16(10)&0x0100)throw new Error('DOC terkunci dengan kata sandi. Unggah salinan yang tidak terkunci.');
            const table=CFB.find(container,(u16(10)&0x0200)?'1Table':'0Table');
            const csw=u16(32),lw=34+csw*2,cslw=u16(lw),pairs=lw+2+cslw*4+2;
            if(!table||pairs+34*8>bytes.length)throw new Error('Tabel teks DOC tidak tersedia. Simpan ulang sebagai DOCX.');
            const ccpText=u32(lw+2+12),fcClx=u32(pairs+33*8),lcbClx=u32(pairs+33*8+4);
            const tb=new Uint8Array(table.content),tv=new DataView(tb.buffer,tb.byteOffset,tb.byteLength);let pos=fcClx;
            while(pos<fcClx+lcbClx&&pos<tb.length&&tb[pos]===1){if(pos+3>tb.length)break;pos+=3+tv.getUint16(pos+1,true);}
            if(pos+5>tb.length||tb[pos]!==2)throw new Error('Teks DOC tidak dapat dibaca. Simpan ulang sebagai DOCX.');
            const size=tv.getUint32(pos+1,true),start=pos+5,count=(size-4)/12;
            if(count<1||!Number.isInteger(count)||start+size>tb.length)throw new Error('Data teks DOC rusak atau tidak lengkap.');
            let text='';for(let i=0;i<count;i++){
                const first=tv.getUint32(start+i*4,true),last=Math.min(ccpText,tv.getUint32(start+(i+1)*4,true));if(last<=first)continue;
                const encoded=tv.getUint32(start+(count+1)*4+i*8+2,true),compressed=!!(encoded&0x40000000),offset=(encoded&0x3fffffff)/(compressed?2:1),length=(last-first)*(compressed?1:2);
                if(offset+length>bytes.length)throw new Error('Bagian teks DOC tidak lengkap.');
                text+=new TextDecoder(compressed?'windows-1252':'utf-16le').decode(bytes.subarray(offset,offset+length));
            }return text;
        }
        function teksRtfBerkas(text) {
            const stack=[];let state={skip:false,uc:1},fallback=0,out='';
            const tokens=/([{}])|\\([A-Za-z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^A-Za-z])|([^\\{}]+)/g;let m;
            const put=char=>{if(fallback){fallback--;return;}if(!state.skip)out+=char;};
            while((m=tokens.exec(text))){
                if(m[1]==='{'){stack.push({...state});continue;}if(m[1]==='}'){state=stack.pop()||{skip:false,uc:1};continue;}
                if(m[2]){const key=m[2],num=Number(m[3]);
                    if(/^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|fldinst|datastore)$/.test(key))state.skip=true;
                    else if(key==='uc')state.uc=num;
                    else if(key==='u'){if(!state.skip)out+=String.fromCharCode(num&0xffff);fallback=state.uc;}
                    else if(!state.skip){if(key==='cell')out+='\t';else if(['row','par','line'].includes(key))out+='\n';else if(key==='tab')out+='\t';}
                }else if(m[4])put(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(m[4],16)])));
                else if(m[5]==='*')state.skip=true;else if(m[5])put(m[5]==='~'?' ':m[5]);else if(m[6])for(const char of m[6])put(char);
            }return out;
        }
        function rowsPdfTeks(content,viewport) {
            const words=[];for(const item of content.items){if(!item.str||!item.transform)continue;
                const point=viewport.convertToViewportPoint(item.transform[4],item.transform[5]),text=item.str,h=Math.max(3,item.height*viewport.scale),w=Math.max(1,item.width*viewport.scale);
                const matcher=/\S+/g;let match;while((match=matcher.exec(text)))words.push({text:match[0],x:point[0]+w*match.index/Math.max(1,text.length),y:point[1]-h,w:w*match[0].length/Math.max(1,text.length),h,conf:100});
            }
            const layout=kolomOcr(words,null,viewport.width),out=[];
            const nimHeader=words.find(w=>/^(NIM|NPM|NRP)$/.test(tokenOcr(w.text)));
            const nextHeaders=nimHeader?words.filter(w=>w.x>nimHeader.x&&Math.abs(w.y-nimHeader.y)<nimHeader.h*2&&/^(SKOR|NILAI|UTS|UAS|KET|TANGGAL|ABSEN|ABSENSI|L\/P|P\/L|LP|PL|JK|KELAMIN|GENDER|JENISKELAMIN)$/.test(tokenOcr(w.text))):[];
            // Posisi judul bukan batas tengah antarjudul: nama panjang masih
            // dapat menempati ruang sampai kolom berikutnya dimulai.
            const nameRight=nextHeaders.length?Math.min(...nextHeaders.map(w=>w.x)):(layout?.name.right??viewport.width);
            const sexHeader=nextHeaders.find(w=>/^(L\/P|P\/L|LP|PL|JK|KELAMIN|GENDER|JENISKELAMIN)$/.test(tokenOcr(w.text)));
            const sexRight=sexHeader?Math.min(viewport.width,...nextHeaders.filter(w=>w.x>sexHeader.x).map(w=>w.x)):0;
            for(const row of barisKataOcr(words)){
                if(layout&&row.cy<layout.dataTop)continue;
                let nim='',at=-1,last=-1;
                // PDF sering menyimpan C dan angka NIM sebagai objek teks
                // berbeda. Gabungkan potongan dalam sel, tanpa nomor urut.
                for(let i=0;i<row.words.length;i++){
                    const token=row.words[i].text;if(i===0&&/^\d{1,3}$/.test(token))continue;
                    if(!nimBerkas(token)&&!/^[A-Za-z]{0,3}\d+$/.test(token)&&!(/^[A-Za-z]{1,3}$/.test(token)&&/^\d+$/.test(row.words[i+1]?.text||'')))continue;
                    let value=token,j=i;
                    while(j+1<row.words.length&&/^\d+$/.test(row.words[j+1].text)&&row.words[j+1].x-row.words[j].x-row.words[j].w<row.height*1.5){value+=row.words[++j].text;}
                    if(nimBerkas(value)){nim=nimBerkas(value);at=i;last=j;break;}
                }
                if(!layout&&!(/^[A-Za-z]/.test(nim)&&/^\d{1,3}$/.test(row.words[0].text)))continue;
                const names=last>=0?row.words.slice(last+1).filter(w=>w.x<nameRight):layout?row.words.filter(w=>w.x+w.w/2>=layout.name.left&&w.x<nameRight):[];
                const nama=namaOcr(names);if(!nama&&!nim)continue;
                const sex=sexHeader?row.words.filter(w=>w.x>=sexHeader.x-row.height*.5&&w.x<sexRight):[];
                out.push({nim,nama,jk:genderOcr(sex),confidence:100,corrected:!nim||!nama});
            }return out;
        }
        async function kanvasGambarBerkas(src) {
            const img=new Image();img.src=src;await img.decode();
            const scale=Math.min(1,3000/Math.max(img.width,img.height),Math.sqrt(8000000/(img.width*img.height)));
            const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas;
        }
        async function kanvasScanPdf(page,pdfjs) {
            // Untuk PDF satu gambar tanpa teks, pakai piksel scan aslinya.
            // Ini menghindari pengecilan/pembesaran berulang yang mengaburkan NIM.
            if(page.rotate)return null;
            const ops=await page.getOperatorList(),pictures=[];let matrix=[1,0,0,1,0,0];const stack=[];
            for(let i=0;i<ops.fnArray.length;i++){
                const op=ops.fnArray[i],args=ops.argsArray[i];
                if(op===pdfjs.OPS.save)stack.push(matrix.slice());
                else if(op===pdfjs.OPS.restore)matrix=stack.pop()||matrix;
                else if(op===pdfjs.OPS.transform){const [a,b,c,d,e,f]=matrix,[g,h,j,k,l,m]=args;matrix=[a*g+c*h,b*g+d*h,a*j+c*k,b*j+d*k,a*l+c*m+e,b*l+d*m+f];}
                else if(op===pdfjs.OPS.paintImageXObject)pictures.push({id:args[0],matrix:matrix.slice()});
                else if(op===pdfjs.OPS.paintInlineImageXObject||op===pdfjs.OPS.paintImageMaskXObject)return null;
            }
            if(pictures.length!==1)return null;
            const picture=pictures[0],m=picture.matrix;if(m[0]<=0||m[3]<=0||Math.abs(m[1])>.01||Math.abs(m[2])>.01)return null;
            const objects=picture.id.startsWith('g_')?page.commonObjs:page.objs,img=await new Promise(resolve=>objects.get(picture.id,resolve));if(!img||(!img.bitmap&&!img.data)||img.width*img.height>8000000)return null;
            let drawable=img.bitmap;
            if(!drawable){
                drawable=document.createElement('canvas');drawable.width=img.width;drawable.height=img.height;
                const pixels=new Uint8ClampedArray(img.width*img.height*4);
                if(img.kind===3)pixels.set(img.data);
                else for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
                    const p=y*img.width+x,o=p*4;
                    if(img.kind===2){pixels[o]=img.data[p*3];pixels[o+1]=img.data[p*3+1];pixels[o+2]=img.data[p*3+2];pixels[o+3]=255;}
                    else if(img.kind===1){const value=((img.data[y*Math.ceil(img.width/8)+(x>>3)]>>(7-(x%8)))&1)*255;pixels[o]=pixels[o+1]=pixels[o+2]=value;pixels[o+3]=255;}
                    else return null;
                }
                drawable.getContext('2d').putImageData(new ImageData(pixels,img.width,img.height),0,0);
            }
            const scale=Math.min(1,3000/Math.max(img.width,img.height),Math.sqrt(8000000/(img.width*img.height)));
            const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(drawable,0,0,canvas.width,canvas.height);return canvas;
        }
        function gabungBerkas(rows) {
            const seen=new Set();return rows.filter(row=>{if(!row.nim||!row.nama)return true;const key=row.nim.toUpperCase()+'|'+row.nama.replace(/\s+/g,'').toUpperCase();if(seen.has(key))return false;seen.add(key);return true;});
        }
        async function bacaDokumenDaftarMahasiswa(file) {
            const button=document.getElementById('btnOcrFoto'),input=document.getElementById('fotoDaftarMahasiswa');button.disabled=true;input.disabled=true;
            document.getElementById('ocrReviewPanel').hidden=true;document.getElementById('ocrReviewRows').replaceChildren();
            let worker=null,pdf=null,continuation=null;const rows=[],scanCache=new Map();
            const ocr=async(canvas,source)=>{
                let hash='';
                if(globalThis.crypto?.subtle){try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(blob)hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');}catch(error){}}
                let found=hash?scanCache.get(hash):null;
                if(!found){if(!worker)worker=await buatWorkerDaftar();found=await pindaiKanvasDaftar(canvas,worker,continuation);if(hash)scanCache.set(hash,found);}
                if(found.layoutHint)continuation=found.layoutHint;
                return found.map(row=>({...row,source}));
            };
            try{
                if(file.size>20*1024*1024)throw new Error('Ukuran dokumen maksimal 20 MB.');
                const type=jenisBerkasDaftar(file),buffer=await file.arrayBuffer();setOcrStatus('Membaca seluruh isi '+type.toUpperCase()+'…');
                if(type==='pdf'){
                    if(!Promise.withResolvers)Promise.withResolvers=function(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
                    const pdfjs=await import('./app/vendor/pdf.min.mjs');
                    pdfjs.GlobalWorkerOptions.workerSrc='app/vendor/pdf.worker.min.mjs';
                    pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,cMapUrl:'app/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'app/vendor/standard_fonts/'}).promise;
                    for(let i=1;i<=pdf.numPages;i++){
                        setOcrStatus('PDF: halaman '+i+' / '+pdf.numPages+'…');const page=await pdf.getPage(i),view=page.getViewport({scale:1});
                        const text=await page.getTextContent(),direct=rowsPdfTeks(text,view);
                        if(direct.length)rows.push(...direct.map(row=>({...row,source:'PDF halaman '+i+' · teks'})));
                        else{
                            const native=text.items.some(item=>item.str?.trim())?null:await kanvasScanPdf(page,pdfjs);
                            if(native){rows.push(...await ocr(native,'PDF halaman '+i+' · OCR'));native.width=native.height=1;page.cleanup();continue;}
                            const scale=Math.min(3,2400/view.width,Math.sqrt(8000000/(view.width*view.height))),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
                            await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
                            rows.push(...await ocr(canvas,'PDF halaman '+i+' · OCR'));canvas.width=canvas.height=1;
                        }
                        page.cleanup();
                    }
                }else if(['xls','xlsx','csv'].includes(type)){
                    const XLSX=await muatPustakaImpor('XLSX','app/vendor/xlsx.full.min.js'),book=XLSX.read(buffer,{type:'array',cellText:true});
                    for(const name of book.SheetNames){setOcrStatus('Membaca lembar Excel: '+name+'…');rows.push(...parseTabelBerkas(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:false,defval:''}), 'Excel · '+name));}
                }else if(type==='docx'){
                    const mammoth=await muatPustakaImpor('mammoth','app/vendor/mammoth.browser.min.js'),converted=await mammoth.convertToHtml({arrayBuffer:buffer}),parsed=parseHtmlBerkas(converted.value,'Word · tabel');rows.push(...parsed.rows);
                    if(!rows.length){const raw=await mammoth.extractRawText({arrayBuffer:buffer});rows.push(...parseTeksWord(raw.value,'Word · teks'));}
                    if(!rows.length){const images=[...parsed.doc.querySelectorAll('img[src^="data:image/"]')];for(let i=0;i<images.length;i++){setOcrStatus('Word: gambar '+(i+1)+' / '+images.length+'…');rows.push(...await ocr(await kanvasGambarBerkas(images[i].getAttribute('src')),'Word gambar '+(i+1)+' · OCR'));}}
                }else if(type==='doc'){
                    const probe=new TextDecoder().decode(new Uint8Array(buffer,0,Math.min(buffer.byteLength,512)));
                    if(/^\s*(?:<!doctype|<html|<\?xml)/i.test(probe))rows.push(...parseHtmlBerkas(new TextDecoder().decode(buffer),'DOC · tabel').rows);
                    else if(/^\s*{\\rtf/.test(probe))rows.push(...parseTeksWord(teksRtfBerkas(new TextDecoder('windows-1252').decode(buffer)),'DOC · teks'));
                    else {const XLSX=await muatPustakaImpor('XLSX','app/vendor/xlsx.full.min.js');rows.push(...parseTeksWord(teksDocLama(buffer,XLSX.CFB),'DOC · teks'));}
                }else throw new Error('Pilih foto, PDF, DOC/DOCX, atau XLS/XLSX/CSV.');
                if(!rows.length)throw new Error('Belum ada mahasiswa yang terbaca. Pastikan tabel memuat judul NIM dan Nama Mahasiswa; untuk scan gunakan gambar yang jelas.');
                tampilkanHasilOcr(gabungBerkas(rows));
            }catch(error){const message=error.name==='PasswordException'?'PDF terkunci dengan kata sandi. Unggah salinan yang tidak terkunci.':error.message;setOcrStatus(message);showToast(message,'error');}
            finally{try{if(worker)await worker.terminate();if(pdf)await pdf.destroy();}finally{button.disabled=false;input.disabled=false;}}
        }
        async function buatWorkerDaftar() {
            const Tesseract=await muatPustakaImpor('Tesseract','app/vendor/tesseract.min.js');
            return Tesseract.createWorker('eng',1,{workerPath:'app/vendor/worker.min.js',corePath:'app/vendor',langPath:'app/vendor',gzip:false},{load_system_dawg:'0',load_freq_dawg:'0'});
        }
        async function pindaiKanvasDaftar(selected,worker,continuation=null) {
                const prepared=preparasiFotoOcr(selected),canvas=prepared.canvas,grid=prepared.grid;
                setOcrStatus(grid?'Tabel ditemukan. Memuat OCR untuk membaca kolom…':'Memuat OCR. Bila hasil kurang lengkap, pilih area tabel pada pratinjau.');
                await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',tessedit_char_whitelist:''});
                const header=grid?potongKanvasOcr(canvas,{left:0,right:canvas.width,top:0,bottom:grid.horizontal[1]}):canvas;
                setOcrStatus('Mengenali judul kolom NIM dan nama…');
                let scan=await worker.recognize(header,{}, {tsv:true}),words=kataOcrTsv(scan.data.tsv),layout=kolomOcr(words,grid||garisKolomScanOcr(prepared.rawCanvas,words),canvas.width);
                if(!layout&&grid){scan=await worker.recognize(canvas,{}, {tsv:true});words=kataOcrTsv(scan.data.tsv);layout=kolomOcr(words,grid||garisKolomScanOcr(prepared.rawCanvas,words),canvas.width);if(!layout)layout=inferKolomGridOcr(words,grid,canvas.width);}
                if(continuation&&!grid&&(!layout||(!layout.hasHeader&&!layout.nim.anchorY))){
                    const scale=col=>col?{left:col.left*canvas.width,right:col.right*canvas.width}:null;
                    const anchors=words.filter(w=>nimOcr(w.text));
                    layout={...(layout||{hasHeader:false,dataTop:anchors.length?Math.max(0,Math.min(...anchors.map(w=>w.y))-6):0}),nim:scale(continuation.nim),name:scale(continuation.name),sex:scale(continuation.sex)};
                }
                if(layout){layout.dataBottom=prepared.dataBottom||canvas.height;if(!layout.hasHeader)layout.dataTop=Math.max(0,layout.dataTop-60);}
                let rows=[];
                if(layout){
                    await worker.setParameters({tessedit_pageseg_mode:'6'});
                    const readColumn=async(col,label)=>{if(!col)return [];setOcrStatus('Membaca kolom '+label+'…');const left=Math.max(0,Math.floor(col.left)),top=Math.max(0,Math.floor(layout.dataTop));const crop=potongKanvasOcr(canvas,{...col,left,top,right:col.right,bottom:layout.dataBottom});const result=await worker.recognize(crop,{}, {tsv:true});return kataOcrTsv(result.data.tsv,left,top);};
                    let nims=await readColumn(layout.nim,'NIM');
                    let prefixPattern=null;
                    // Baca ulang sel yang meragukan, terutama huruf awal NIM yang
                    // kadang terlewat saat satu kolom panjang dibaca sekaligus.
                const numberBands=!grid?bandsNomorBarisOcr(words,canvas.width,canvas.height):null;
                const retryBands=grid?grid.horizontal.slice(0,-1).map((top,i)=>({top,bottom:grid.horizontal[i+1]})):numberBands||rentangBarisOcr(canvas,layout,null);
                    if(retryBands.length){
                        const prefixed=nims.filter(w=>/^[A-Z]/.test(nimOcr(w.text))).length>=2;
                        const lengths=nims.map(w=>nimOcr(w.text,layout.hasHeader)).filter(Boolean),frequency=new Map();lengths.forEach(code=>frequency.set(code.length,(frequency.get(code.length)||0)+1));
                        const common=[...frequency].sort((a,b)=>b[1]-a[1])[0];let expectedLength=common&&common[1]>=3&&common[1]>=lengths.length*.6?common[0]:0;
                        const prefixGroups=new Map(),prefixEvidence=[];
                        [...words,...nims].forEach(word=>{
                            const center=word.x+word.w/2;if(center<layout.nim.left-3||center>layout.nim.right+3)return;
                            const match=nimOcr(word.text,layout.hasHeader).match(/^([A-Z]{1,3})(\d{7,15})$/);if(!match)return;
                            if(prefixEvidence.some(item=>item.prefix===match[1]&&item.digits===match[2].length&&Math.abs(item.y-(word.y+word.h/2))<Math.max(4,word.h*.4)))return;
                            prefixEvidence.push({prefix:match[1],digits:match[2].length,y:word.y+word.h/2,h:word.h});
                        });
                        prefixEvidence.forEach(item=>{if(!prefixGroups.has(item.prefix))prefixGroups.set(item.prefix,[]);prefixGroups.get(item.prefix).push(item.digits);});
                        const prefixChoice=[...prefixGroups].sort((a,b)=>b[1].length-a[1].length)[0],prefixDigits=prefixChoice&&prefixChoice[1].sort((a,b)=>a-b)[Math.floor(prefixChoice[1].length/2)];
                        if(prefixChoice&&prefixChoice[1].length>=2&&prefixChoice[1].length>=prefixEvidence.length*.85){
                            prefixPattern={prefix:prefixChoice[0],digits:prefixDigits};
                            expectedLength=prefixPattern.prefix.length+prefixPattern.digits;
                        }
                        await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
                        for(const band of retryBands){
                            const {top,bottom}=band;if(top<layout.dataTop-2)continue;
                            const current=nims.filter(w=>w.y+w.h/2>=top&&w.y+w.h/2<bottom),raw=current.map(w=>w.text).join('');
                            if(nimOcr(raw,layout.hasHeader)&&current.every(w=>w.conf>=92)&&(!expectedLength||nimOcr(raw,layout.hasHeader).length===expectedLength)&&!(prefixed&&/^\d/.test(tokenOcr(raw))))continue;
                            setOcrStatus('Memeriksa ulang NIM pada baris tabel…');
                            const left=Math.floor(layout.nim.left),rowTop=Math.ceil(top+3),cell=potongKanvasOcr(canvas,{...layout.nim,left,top:rowTop,right:layout.nim.right,bottom:bottom-3});
                            const sample=cell.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cell.width,cell.height).data;let ink=0;for(let p=0;p<sample.length;p+=4)if(sample[p]<185)ink++;if(ink<12)continue;
                            const sourcePixels=cell.getContext('2d',{willReadFrequently:true}).getImageData(0,0,cell.width,cell.height),candidates=new Map(),scale=2;
                            for(const threshold of [165,130,190])for(const psm of ['7','8']){
                                const thresholdCanvas=document.createElement('canvas');thresholdCanvas.width=cell.width;thresholdCanvas.height=cell.height;
                                const thresholdCtx=thresholdCanvas.getContext('2d'),pixels=new ImageData(new Uint8ClampedArray(sourcePixels.data),cell.width,cell.height);
                                for(let p=0;p<pixels.data.length;p+=4){const ink=pixels.data[p]<threshold?0:255;pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=ink;}
                                thresholdCtx.putImageData(pixels,0,0);
                                const padded=document.createElement('canvas');padded.width=cell.width*scale+32;padded.height=cell.height*scale+24;
                                const ctx=padded.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#fff';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(thresholdCanvas,16,12,cell.width*scale,cell.height*scale);
                                await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
                                const retry=await worker.recognize(padded,{}, {tsv:true}),replacement=kataOcrTsv(retry.data.tsv).map(word=>({...word,x:left+(word.x-16)/scale,y:rowTop+(word.y-12)/scale,w:word.w/scale,h:word.h/scale}));
                                const rawCode=nimOcr(replacement.map(w=>w.text).join(''),layout.hasHeader),code=normalisasiNimKelas(rawCode,prefixPattern,layout.hasHeader);
                                const rightLength=!expectedLength||(prefixPattern?code.startsWith(prefixPattern.prefix)&&code.length===expectedLength:rawCode.length===expectedLength);
                                if(!code||!rightLength)continue;
                                const confidence=replacement.reduce((sum,w)=>sum+w.conf,0)/Math.max(1,replacement.length),choice=candidates.get(code)||{code,words:replacement,votes:0,totalConfidence:0};
                                choice.votes++;choice.totalConfidence+=confidence;if(confidence>choice.totalConfidence/choice.votes)choice.words=replacement;candidates.set(code,choice);
                            }
                            const choices=[...candidates.values()].sort((a,b)=>b.votes-a.votes||b.totalConfidence/b.votes-a.totalConfidence/a.votes),best=choices[0];
                            if(best){const disputed=choices.length>1;best.words.forEach(word=>word.ocrDisputed=disputed);nims=nims.filter(w=>!(w.y+w.h/2>=top&&w.y+w.h/2<bottom)).concat(best.words);}
                        }
                        await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
                    }
                    const names=await readColumn(layout.name,'nama mahasiswa'),sex=await readColumn(layout.sex,'L/P');
                    rows=gabungKolomOcr(nims,names,sex,grid,layout.dataTop,layout.hasHeader);
                    rows=await lengkapiBarisOcr(worker,canvas,layout,grid,!grid&&!layout.hasHeader?[]:rows,nims,numberBands,prefixPattern,prepared.rawCanvas,words);
                    if(prefixPattern)rows.forEach(row=>{const normalized=normalisasiNimKelas(row.nim,prefixPattern,true);if(normalized&&normalized!==row.nim){row.nim=normalized;row.corrected=true;}});
                    rows=rapikanPolaNimKelas(rows);
                } else rows=parseOcrDaftarTsv(scan.data.tsv,grid,canvas.width);
            if(layout&&layout.hasHeader&&!grid){const normalize=col=>col?{left:col.left/canvas.width,right:col.right/canvas.width}:null;rows.layoutHint={nim:normalize(layout.nim),name:normalize(layout.name),sex:normalize(layout.sex)};}
            return rows;
        }

        async function bacaFotoDaftarMahasiswa() {
            const file=document.getElementById('fotoDaftarMahasiswa').files[0];
            if(!file){showToast('Pilih foto daftar mahasiswa terlebih dahulu.','error');return;}
            if(jenisBerkasDaftar(file)!=='image')return bacaDokumenDaftarMahasiswa(file);
            if(!await muatPratinjauOcr())return;
            const button=document.getElementById('btnOcrFoto');button.disabled=true;
            const controls=[document.getElementById('fotoDaftarMahasiswa'),...document.querySelectorAll('#ocrPhotoPreview button,#ocrPhotoPreview input')];
            controls.forEach(control=>control.disabled=true);
            document.getElementById('ocrReviewPanel').hidden=true;document.getElementById('ocrReviewRows').replaceChildren();
            let worker=null;
            try {
                setOcrStatus('Menyiapkan foto dan mencari garis tabel…');
                const selected=ocrPhoto.crop?potongKanvasOcr(ocrPhoto.source,ocrPhoto.crop):ocrPhoto.source;
                worker=await buatWorkerDaftar();
                const rows=await pindaiKanvasDaftar(selected,worker);
                if(!rows.length)throw new Error('Belum ada baris mahasiswa yang terbaca. Pilih area tabel NIM dan nama pada pratinjau, luruskan foto, lalu Baca Semua Baris kembali.');
                tampilkanHasilOcr(rows);
            } catch(error){setOcrStatus(error.message);showToast(error.message,'error');}
            finally {try{if(worker)await worker.terminate();}finally{button.disabled=false;controls.forEach(control=>control.disabled=false);}}
        }

        async function simpanHasilOcr() {
            const elements=Array.from(document.querySelectorAll('#ocrReviewRows tr'));
            const rows=elements.map(tr=>({nim:tr.cells[0].querySelector('input').value.trim(),nama:tr.cells[1].querySelector('input').value.trim(),jk:tr.cells[2].querySelector('select').value}));
            if (!rows.length) { showToast('Tidak ada data lengkap untuk disimpan.', 'error'); return; }
            const seen=new Set();
            for(let i=0;i<rows.length;i++) {
                const row=rows[i],column=!row.nim?0:!row.nama?1:!row.jk?2:-1;
                if(column>=0){showToast('Lengkapi NIM, nama, dan L/P pada baris '+(i+1)+' sebelum menyimpan.','error');elements[i].cells[column].querySelector('input,select').focus();return;}
                if(!nimBerkas(row.nim)){showToast('Format NIM pada baris '+(i+1)+' belum terbaca dengan benar. Cocokkan dengan dokumen asli dan masukkan NIM yang valid.','error');elements[i].cells[0].querySelector('input').focus();return;}
                if(seen.has(row.nim.toUpperCase())){showToast('NIM ganda pada baris '+(i+1)+'. Koreksi atau hapus baris yang sama.','error');elements[i].cells[0].querySelector('input').focus();return;}
                seen.add(row.nim.toUpperCase());
            }
            const button=document.getElementById('btnSimpanOcr'); button.disabled=true;
            try {
                const form=new FormData(); form.append('aksi','import_siswa'); form.append('rows',JSON.stringify(rows));
                const response=await fetch('data_siswa.php?aksi=import_siswa&jenjang=S1&kelas=<?php echo rawurlencode($kelas); ?>&prodi=<?php echo rawurlencode($prodi); ?>&semester=<?php echo rawurlencode($semester); ?>&theme=<?php echo rawurlencode($current_theme); ?>',{method:'POST',body:form});
                const result=await response.json();
                if (!response.ok || result.status!=='success') throw new Error(result.message || 'Data foto gagal disimpan.');
                showToast(result.inserted+' mahasiswa ditambahkan; '+result.skipped+' baris dilewati. Daftar akan dimuat ulang.','success');
                setTimeout(()=>window.AbsensiUIAudio ? window.AbsensiUIAudio.reloadApplication() : location.reload(),900);
            } catch (error) { showToast(error.message,'error'); }
            finally { button.disabled=false; }
        }

    </script>
</body>
</html>
<?php
if (isset($koneksi) && $koneksi instanceof mysqli) mysqli_close($koneksi);
?>
