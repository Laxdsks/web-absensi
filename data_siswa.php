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
    $insert = mysqli_prepare($koneksi, "INSERT INTO siswa (jenjang, kelas, prodi, semester, nim, nik, nama, jk) VALUES ('S1', ?, ?, ?, ?, '', ?, ?)");
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
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" defer></script>
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
                <h3 style="margin:0 0 8px;font-size:15px;"><i class="fa-solid fa-camera" style="color:var(--primary);"></i> Impor daftar mahasiswa dari foto</h3>
                <p style="margin:0 0 12px;color:var(--text-muted);font-size:12px;line-height:1.5;">Unggah foto tabel yang jelas dan lurus. OCR akan membaca NIM, nama, dan L/P; periksa serta koreksi hasil sebelum menyimpan. Baris dengan NIM yang sudah ada di konteks ini dilewati.</p>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <input type="file" id="fotoDaftarMahasiswa" accept="image/jpeg,image/png,image/webp,image/bmp" onchange="muatPratinjauOcr()" style="max-width:100%;min-height:40px;">
                    <button class="btn-custom btn-primary" type="button" id="btnOcrFoto" onclick="bacaFotoDaftarMahasiswa()" style="min-height:42px;"><i class="fa-solid fa-wand-magic-sparkles"></i> Baca Foto</button>
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
                            <thead><tr><th style="text-align:left;">NIM</th><th style="text-align:left;">Nama Mahasiswa</th><th>Jenis Kelamin</th><th>Keyakinan OCR</th><th>Aksi</th></tr></thead>
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
            const image=ocrPhoto.image, scale=Math.min(1,3000/Math.max(image.width,image.height),Math.sqrt(8000000/(image.width*image.height)));
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
            const finish=()=>{if(!start)return;start=null;if(!ocrPhoto.crop||ocrPhoto.crop.right-ocrPhoto.crop.left<30||ocrPhoto.crop.bottom-ocrPhoto.crop.top<30)ocrPhoto.crop=null;gambarPratinjauOcr();setOcrStatus(ocrPhoto.crop?'Area dipilih. Klik Baca Foto untuk membaca area bergaris biru.':'Foto siap dibaca.');};
            canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
        })();
        function potongKanvasOcr(source,rect) {
            const left=Math.max(0,Math.floor(rect.left)),top=Math.max(0,Math.floor(rect.top));
            const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.min(source.width-left,Math.ceil(rect.right-left)));canvas.height=Math.max(1,Math.min(source.height-top,Math.ceil(rect.bottom-top)));
            canvas.getContext('2d').drawImage(source,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);return canvas;
        }
        function kelompokGarisOcr(lines,axis) {
            const groups=[];
            lines.sort((a,b)=>a[axis]-b[axis]).forEach(line=>{const last=groups[groups.length-1];if(last&&line[axis]-last.end<=3){last.end=line[axis];last.position=(last.start+last.end)/2;}else groups.push({start:line[axis],end:line[axis],position:line[axis]});});
            return groups;
        }
        function deteksiGarisOcr(canvas) {
            const w=canvas.width,h=canvas.height,data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
            const longest=(count,pixel)=>{let start=-1,last=-1,best={start:0,end:0};for(let i=0;i<count;i++){if(pixel(i)<145){if(start<0)start=i;last=i;}else if(start>=0&&i-last>2){if(last-start>best.end-best.start)best={start,end:last};start=-1;}}if(start>=0&&last-start>best.end-best.start)best={start,end:last};return best;};
            const clusters=[];
            for(let y=0;y<h;y++){
                const run=longest(w,x=>data[(y*w+x)*4]);if(run.end-run.start<w*.28)continue;
                let group=clusters.find(g=>Math.abs(g.left-run.start)<w*.035&&Math.abs(g.right-run.end)<w*.035);
                if(!group){group={left:run.start,right:run.end,lines:[]};clusters.push(group);}group.lines.push({y});
            }
            const candidates=clusters.map(g=>({...g,horizontal:kelompokGarisOcr(g.lines,'y')})).filter(g=>g.horizontal.length>=4);
            candidates.sort((a,b)=>(b.right-b.left)*b.horizontal.length-(a.right-a.left)*a.horizontal.length);
            if(!candidates.length)return null;
            const grid=candidates[0],top=grid.horizontal[0].position,bottom=grid.horizontal[grid.horizontal.length-1].position,vertical=[];
            for(let x=Math.max(0,grid.left-3);x<=Math.min(w-1,grid.right+3);x++){
                const run=longest(Math.floor(bottom-top+1),y=>data[((Math.floor(top)+y)*w+x)*4]);
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
            const scale=Math.min(3,2600/source.width,Math.sqrt(8000000/(source.width*source.height)));
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
            const grid=deteksiGarisOcr(canvas);if(!grid)return {canvas,grid:null};
            // Hapus hanya pita garis panjang; teks di tengah sel tetap dipertahankan.
            ctx.fillStyle='#fff';
            grid.horizontal.forEach(line=>ctx.fillRect(grid.left-1,line.start-1,grid.right-grid.left+3,line.end-line.start+3));
            grid.vertical.forEach(line=>ctx.fillRect(line.start-1,grid.top-1,line.end-line.start+3,grid.bottom-grid.top+3));
            const crop={left:Math.max(0,grid.left-5),top:Math.max(0,grid.top-5),right:Math.min(canvas.width,grid.right+5),bottom:Math.min(canvas.height,grid.bottom+5)};
            const table=potongKanvasOcr(canvas,crop);
            return {canvas:table,grid:{horizontal:grid.horizontal.map(l=>l.position-Math.floor(crop.top)),vertical:grid.vertical.map(l=>l.position-Math.floor(crop.left))}};
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
        function barisKataOcr(words) {
            const rows=[];words.slice().sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)||a.x-b.x).forEach(word=>{
                const cy=word.y+word.h/2;let row=rows.find(r=>Math.abs(r.cy-cy)<=Math.max(r.height,word.h)*.55);
                if(!row){row={cy,height:word.h,words:[]};rows.push(row);}row.words.push(word);row.cy=row.words.reduce((s,w)=>s+w.y+w.h/2,0)/row.words.length;row.height=Math.max(row.height,word.h);
            });return rows.sort((a,b)=>a.cy-b.cy).map(row=>({...row,words:row.words.sort((a,b)=>a.x-b.x)}));
        }
        function kolomOcr(words,grid,width) {
            const nimHead=words.find(w=>/^(NIM|N1M)$/.test(tokenOcr(w.text)));
            const nameHead=words.find(w=>/^(NAMA|MAHASISWA)$/.test(tokenOcr(w.text))&&(!nimHead||Math.abs(w.y-nimHead.y)<Math.max(70,nimHead.h*3)));
            const sexHead=words.find(w=>/^(L\/P|P\/L|LP|PL|JK|KELAMIN|GENDER|JENISKELAMIN)$/.test(tokenOcr(w.text))&&(!nimHead||Math.abs(w.y-nimHead.y)<70));
            let nimX=nimHead?nimHead.x+nimHead.w/2:null;
            if(nimX===null){const anchors=words.filter(w=>nimOcr(w.text));if(anchors.length<2)return null;nimX=anchors.map(w=>w.x+w.w/2).sort((a,b)=>a-b)[Math.floor(anchors.length/2)];}
            const bounds=x=>{if(!grid)return null;for(let i=0;i<grid.vertical.length-1;i++)if(x>=grid.vertical[i]&&x<=grid.vertical[i+1])return {left:grid.vertical[i]+3,right:grid.vertical[i+1]-3};return null;};
            let nim=bounds(nimX),name=nameHead?bounds(nameHead.x+nameHead.w/2):null,sex=sexHead?bounds(sexHead.x+sexHead.w/2):null;
            if(nim&&!name){const i=grid.vertical.findIndex(x=>Math.abs(x-(nim.right+3))<4);if(i>=0&&i<grid.vertical.length-1)name={left:grid.vertical[i]+3,right:grid.vertical[i+1]-3};}
            if(!nim||!name){if(!nimHead||!nameHead)return null;const nameX=nameHead.x+nameHead.w/2,mid=(nimX+nameX)/2;
                nim=nimX<nameX?{left:0,right:mid}:{left:mid,right:width};name=nimX<nameX?{left:mid,right:width}:{left:0,right:mid};
                if(sexHead){const sexX=sexHead.x+sexHead.w/2,edge=(nameX+sexX)/2;sex=sexX>nameX?{left:edge,right:width}:{left:0,right:edge};if(sexX>nameX)name.right=edge;else name.left=edge;}
            }
            const headerBottom=nimHead?Math.max(nimHead.y+nimHead.h,nameHead?nameHead.y+nameHead.h:0):0;
            const dataTop=grid&&nimHead?(grid.horizontal.find(y=>y>headerBottom+2)??headerBottom+3):headerBottom+3;
            return {nim,name,sex,dataTop,hasHeader:!!nimHead};
        }
        function namaOcr(words) {
            const name=words.map(w=>w.text.replace(/[|\[\]{}]/g,'').trim()).filter(t=>/[A-Za-zÀ-ž]/.test(t)).join(' ').replace(/\s+/g,' ').trim();
            return /\b(?:TAHUN\s*AKADEMIK|SEMESTER|DOSEN|EMAIL|TELP|TLP|TLPN|PRODI|JLN|JALAN|MAT[A]?KULIAH)\b/i.test(name)||name.replace(/[^A-Za-zÀ-ž]/g,'').length<2?'':name;
        }
        function genderOcr(words) { const token=words.map(w=>tokenOcr(w.text)).join('');return /^(P+|PEREMPUAN|WANITA)$/.test(token)?'P':/^(L+|LAKI|LAKILAKI|PRIA)$/.test(token)?'L':''; }
        function gabungKolomOcr(nimWords,nameWords,sexWords,grid,dataTop,allowNumeric) {
            const grouped=words=>{
                if(!grid)return barisKataOcr(words.filter(w=>w.y+w.h/2>=dataTop));
                const groups=new Map();words.forEach(w=>{const cy=w.y+w.h/2;if(cy<dataTop)return;const row=grid.horizontal.findIndex((y,i)=>i<grid.horizontal.length-1&&cy>=y&&cy<grid.horizontal[i+1]);if(row<0)return;if(!groups.has(row))groups.set(row,{cy:(grid.horizontal[row]+grid.horizontal[row+1])/2,height:grid.horizontal[row+1]-grid.horizontal[row],words:[]});groups.get(row).words.push(w);});
                return Array.from(groups.values()).sort((a,b)=>a.cy-b.cy).map(r=>({...r,words:r.words.sort((a,b)=>a.x-b.x)}));
            };
            const nims=grouped(nimWords),names=grouped(nameWords),sexes=grouped(sexWords),rows=[];
            nims.forEach(row=>{
                const raw=row.words.map(w=>w.text).join(''),nim=nimOcr(raw,allowNumeric);if(!nim)return;
                const near=list=>list.find(r=>Math.abs(row.cy-r.cy)<Math.max(row.height,r.height)*.65);
                const name=near(names);if(!name)return;const nama=namaOcr(name.words);if(!nama)return;
                const sex=near(sexes),avg=words=>words.reduce((s,w)=>s+w.conf,0)/Math.max(1,words.length);
                rows.push({nim,nama,jk:sex?genderOcr(sex.words):'',confidence:Math.round(Math.min(avg(row.words),avg(name.words))),corrected:tokenOcr(raw)!==nim});
            });return rows;
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
            addInput(row.nim||'','NIM baris '+index);addInput(row.nama||'','Nama baris '+index);
            const genderCell=document.createElement('td'),gender=document.createElement('select');gender.setAttribute('aria-label','Jenis kelamin baris '+index);gender.innerHTML='<option value="">Pilih L/P…</option><option value="L">Laki-laki (L)</option><option value="P">Perempuan (P)</option>';gender.value=row.jk||'';gender.style.cssText='min-height:40px;padding:7px;border-radius:8px;background:var(--input-bg);color:var(--text-main);';genderCell.appendChild(gender);tr.appendChild(genderCell);
            const confidenceCell=document.createElement('td');confidenceCell.textContent=Number.isFinite(row.confidence)?row.confidence+'%'+(row.corrected?' · periksa NIM':''):'Koreksi manual';confidenceCell.style.cssText='text-align:center;'+(row.confidence<80?'color:#f59e0b;':'');tr.appendChild(confidenceCell);
            const actionCell=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='btn-custom btn-danger';remove.textContent='Hapus';remove.onclick=()=>tr.remove();actionCell.appendChild(remove);tr.appendChild(actionCell);tbody.appendChild(tr);
        }
        function tampilkanHasilOcr(rows) {
            document.getElementById('ocrReviewRows').replaceChildren();rows.forEach((row,i)=>tambahBarisOcr(row,i+1));
            document.getElementById('ocrReviewPanel').hidden=false;
            const empty=rows.filter(row=>!row.jk).length;
            document.getElementById('ocrReviewHelp').textContent='Periksa NIM dan nama dengan foto sebelum menyimpan. Persentase adalah perkiraan OCR. '+(empty?empty+' baris tidak memuat L/P; pilih jenis kelamin sendiri, atau gunakan pengisian L/P yang kosong.':'L/P dibaca dari kolom foto.');
            setOcrStatus(rows.length+' baris mahasiswa terbaca. Kop dan angka pertemuan tidak diimpor.');
        }
        function tambahBarisKoreksiOcr() { document.getElementById('ocrReviewPanel').hidden=false;tambahBarisOcr({},document.getElementById('ocrReviewRows').rows.length+1); }
        function isiGenderOcrKosong() { const value=document.getElementById('ocrEmptyGender').value;if(!value)return;document.querySelectorAll('#ocrReviewRows select').forEach(select=>{if(!select.value)select.value=value;}); }
        async function bacaFotoDaftarMahasiswa() {
            const file=document.getElementById('fotoDaftarMahasiswa').files[0];
            if(!file){showToast('Pilih foto daftar mahasiswa terlebih dahulu.','error');return;}
            if(!await muatPratinjauOcr())return;
            const button=document.getElementById('btnOcrFoto');button.disabled=true;
            const controls=[document.getElementById('fotoDaftarMahasiswa'),...document.querySelectorAll('#ocrPhotoPreview button,#ocrPhotoPreview input')];
            controls.forEach(control=>control.disabled=true);
            document.getElementById('ocrReviewPanel').hidden=true;document.getElementById('ocrReviewRows').replaceChildren();
            let worker=null;
            try {
                if(!window.Tesseract)throw new Error('Pustaka OCR tidak termuat. Periksa internet lalu muat ulang halaman.');
                setOcrStatus('Menyiapkan foto dan mencari garis tabel…');
                const selected=ocrPhoto.crop?potongKanvasOcr(ocrPhoto.source,ocrPhoto.crop):ocrPhoto.source;
                const prepared=preparasiFotoOcr(selected),canvas=prepared.canvas,grid=prepared.grid;
                setOcrStatus(grid?'Tabel ditemukan. Memuat OCR untuk membaca kolom…':'Memuat OCR. Bila hasil kurang lengkap, pilih area tabel pada pratinjau.');
                worker=await Tesseract.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',langPath:'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main',gzip:false});
                await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
                const header=grid?potongKanvasOcr(canvas,{left:0,right:canvas.width,top:0,bottom:grid.horizontal[1]}):canvas;
                setOcrStatus('Mengenali judul kolom NIM dan nama…');
                let scan=await worker.recognize(header,{}, {tsv:true}),words=kataOcrTsv(scan.data.tsv),layout=kolomOcr(words,grid,canvas.width);
                if(!layout&&grid){scan=await worker.recognize(canvas,{}, {tsv:true});words=kataOcrTsv(scan.data.tsv);layout=kolomOcr(words,grid,canvas.width);}
                let rows=[];
                if(layout){
                    await worker.setParameters({tessedit_pageseg_mode:'6'});
                    const readColumn=async(col,label)=>{if(!col)return [];setOcrStatus('Membaca kolom '+label+'…');const left=Math.max(0,Math.floor(col.left)),top=Math.max(0,Math.floor(layout.dataTop));const crop=potongKanvasOcr(canvas,{left,top,right:col.right,bottom:canvas.height});const result=await worker.recognize(crop,{}, {tsv:true});return kataOcrTsv(result.data.tsv,left,top);};
                    let nims=await readColumn(layout.nim,'NIM');
                    // Baca ulang sel yang meragukan, terutama huruf awal NIM yang
                    // kadang terlewat saat satu kolom panjang dibaca sekaligus.
                    if(grid){
                        const prefixed=nims.filter(w=>/^[A-Z]/.test(nimOcr(w.text))).length>=2;
                        await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
                        for(let i=0;i<grid.horizontal.length-1;i++){
                            const top=grid.horizontal[i],bottom=grid.horizontal[i+1];if(top<layout.dataTop-2)continue;
                            const current=nims.filter(w=>w.y+w.h/2>=top&&w.y+w.h/2<bottom),raw=current.map(w=>w.text).join('');
                            if(nimOcr(raw,layout.hasHeader)&&current.every(w=>w.conf>=85)&&!(prefixed&&/^\d/.test(tokenOcr(raw))))continue;
                            setOcrStatus('Memeriksa ulang NIM pada baris tabel…');
                            const left=Math.floor(layout.nim.left),rowTop=Math.ceil(top+3),cell=potongKanvasOcr(canvas,{left,top:rowTop,right:layout.nim.right,bottom:bottom-3});
                            const padded=document.createElement('canvas');padded.width=cell.width+32;padded.height=cell.height+24;
                            const ctx=padded.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(cell,16,12);
                            const original=ctx.getImageData(0,0,padded.width,padded.height),oldCode=nimOcr(raw,layout.hasHeader);
                            for(const threshold of [165,130,190]){
                                const pixels=new ImageData(new Uint8ClampedArray(original.data),padded.width,padded.height);
                                for(let p=0;p<pixels.data.length;p+=4){const ink=pixels.data[p]<threshold?0:255;pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=ink;}
                                ctx.putImageData(pixels,0,0);
                                const retry=await worker.recognize(padded,{}, {tsv:true}),replacement=kataOcrTsv(retry.data.tsv,left-16,rowTop-12);
                                const code=nimOcr(replacement.map(w=>w.text).join(''),layout.hasHeader);
                                if(code&&!(/^[A-Z]/.test(oldCode)&&/^\d/.test(code))){
                                    nims=nims.filter(w=>!(w.y+w.h/2>=top&&w.y+w.h/2<bottom)).concat(replacement);
                                    if(!prefixed||/^[A-Z]/.test(code))break;
                                }
                            }
                        }
                        await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
                    }
                    const names=await readColumn(layout.name,'nama mahasiswa'),sex=await readColumn(layout.sex,'L/P');
                    rows=gabungKolomOcr(nims,names,sex,grid,layout.dataTop,layout.hasHeader);
                } else rows=parseOcrDaftarTsv(scan.data.tsv,grid,canvas.width);
                if(!rows.length)throw new Error('Belum ada baris mahasiswa yang terbaca. Pilih area tabel NIM dan nama pada pratinjau, luruskan foto, lalu Baca Foto kembali.');
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
                setTimeout(()=>location.reload(),900);
            } catch (error) { showToast(error.message,'error'); }
            finally { button.disabled=false; }
        }

    </script>
</body>
</html>
<?php
mysqli_close($koneksi);
?>
