<?php
session_start();
// Pastikan file koneksi ada
if (file_exists('koneksi.php')) {
    include 'koneksi.php';
}
if (!isset($koneksi) && isset($conn)) {
    $koneksi = $conn;
}

// ==============================================================================
// KUSTOMISASI TEMA GLOBAL & SINKRONISASI OTOMATIS (ANTI-RESET)
// ==============================================================================
$allowed_themes = ['malam', 'putih', 'samudra', 'senja'];
$theme = $_SESSION['theme'] ?? 'malam';
$requested_theme = trim((string)($_GET['theme'] ?? ''));
if ($requested_theme !== '' && in_array($requested_theme, $allowed_themes, true)) {
    $theme = $requested_theme;
    $_SESSION['theme'] = $theme;
}
if (!in_array($theme, $allowed_themes, true)) {
    $theme = 'malam';
    $_SESSION['theme'] = $theme;
}

// ==============================================================================
// ISOLASI PRIVASI SISTEM STANDALONE (Diperbarui dengan Pelonggaran & strtolower)
// ==============================================================================
$current_user_id = isset($_SESSION['id_user']) ? trim($_SESSION['id_user']) : (isset($_SESSION['user_id']) ? trim($_SESSION['user_id']) : '');
$current_username = isset($_SESSION['nama_user']) ? trim($_SESSION['nama_user']) : (isset($_SESSION['username']) ? trim($_SESSION['username']) : '');
$current_role = isset($_SESSION['role']) ? trim($_SESSION['role']) : '';
$check_name = strtolower($current_username);
$check_role = strtolower($current_role);

$is_privat = ($check_name === 'm.fadillah' || $check_name === 'fall' || $check_name === 'zen' || $check_role === 'administrator utama' || $check_role === 'dosen' || !empty($_SESSION['id_user']));
if (!$is_privat && !empty($current_username)) {
    die("<div style='padding:20px; font-family:sans-serif; text-align:center;'><h3>Akses Ditolak</h3><p>Aplikasi ini adalah Sistem Privat Standalone. Hanya akun Administrator Utama (M.Fadillah / Fall) dan Dosen (Zen) yang memiliki otorisasi mengakses lembar kerja ini.</p></div>");
}

// Inisialisasi parameter dengan sanitasi aman
$jenjang = 'S1';
$saved_context = $_SESSION['konteks_siswa'] ?? [];
$daftar_prodi = [
    'Pendidikan Teknologi Informasi',
    'Pendidikan Guru Sekolah Dasar',
    'Pendidikan Jasmani Kesehatan dan Rekreasi',
    'Pendidikan Bahasa dan Sastra Indonesia',
    'Pendidikan Sejarah',
    'Pendidikan Bahasa Inggris'
];
$prodi = isset($_REQUEST['prodi']) ? trim($_REQUEST['prodi']) : ($saved_context['prodi'] ?? $daftar_prodi[0]);
if (!in_array($prodi, $daftar_prodi, true)) $prodi = $daftar_prodi[0];
$kelas_input = isset($_REQUEST['kelas']) ? trim($_REQUEST['kelas']) : (string)($saved_context['kelas'] ?? 'A');
$kelas_input = preg_replace('/^Kelas\s+/i', '', $kelas_input);
$kelas = in_array(strtoupper($kelas_input), ['A', 'B', 'C', 'D', 'E'], true) ? strtoupper($kelas_input) : 'A';
$semester_input = isset($_REQUEST['semester']) ? trim($_REQUEST['semester']) : (string)($saved_context['semester'] ?? '1');
$semester_input = preg_replace('/^Semester\s+/i', '', $semester_input);
$semester = ctype_digit($semester_input) && (int)$semester_input >= 1 && (int)$semester_input <= 8 ? (string)(int)$semester_input : '1';
$kelas_lama = 'Kelas ' . $kelas;
$semester_lama = 'Semester ' . $semester;
$_SESSION['konteks_siswa'] = ['jenjang' => $jenjang, 'kelas' => $kelas, 'prodi' => $prodi, 'semester' => $semester];

// LOGIKA BACKEND SINKRONISASI EKSAK & INTERISOLASI DATA (=)
// Menggunakan operator pencarian eksak = pada query database SQL penarikan nama mahasiswa sesuai instruksi
$data_siswa = [];
$pesan_validasi = "";
if (empty($_REQUEST['kelas']) && empty($_REQUEST['jenjang'])) {
    $pesan_validasi = "Perhatian: Untuk memastikan sinkronisasi data yang tepat, pastikan Anda menekan tombol hijau 'Lembar Absen' dari halaman Data Siswa.";
}

// FITUR UPDATE BARU: MASS DELETE SEKALIGUS PADA MODAL HAPUS PERMANEN
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['aksi_hapus_massal_kelas'])) {
    if (!empty($prodi) && !empty($semester) && !empty($kelas) && isset($koneksi) && $koneksi) {
        $q_del_massal = "DELETE FROM siswa WHERE jenjang='S1' AND prodi=? AND semester IN (?, ?) AND kelas IN (?, ?)";
        $stmt_dm = mysqli_prepare($koneksi, $q_del_massal);
        if ($stmt_dm) {
            mysqli_stmt_bind_param($stmt_dm, "sssss", $prodi, $semester, $semester_lama, $kelas, $kelas_lama);
            mysqli_stmt_execute($stmt_dm);
            $affected_dm = mysqli_stmt_affected_rows($stmt_dm);
            $pesan_validasi = "Sistem: Berhasil menghapus sekaligus $affected_dm data mahasiswa dari kelas $kelas, prodi $prodi.";
            mysqli_stmt_close($stmt_dm);
        }
    }
}

// FITUR HAPUS RIWAYAT SECARA DATA PERMANEN (SATUAN)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['aksi_hapus_permanen'])) {
    $id_target = trim($_POST['hapus_permanen_id']);
    if (!empty($id_target) && isset($koneksi) && $koneksi) {
        $q_del = "DELETE FROM siswa WHERE jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?) AND nim=?";
        $stmt_del = mysqli_prepare($koneksi, $q_del);
        if ($stmt_del) {
            mysqli_stmt_bind_param($stmt_del, "ssssss", $kelas, $kelas_lama, $prodi, $semester, $semester_lama, $id_target);
            mysqli_stmt_execute($stmt_del);
            if (mysqli_stmt_affected_rows($stmt_del) > 0) {
                $pesan_validasi = "Sistem: Riwayat data secara permanen untuk identitas ($id_target) berhasil dihapus dari sistem.";
            } else {
                $pesan_validasi = "Gagal: Data tidak ditemukan atau sistem gagal menghapus dari database.";
            }
            mysqli_stmt_close($stmt_del);
        }
    }
}

// PENARIKAN DATA MENGGUNAKAN OPERATOR EKSAK (=) SESUAI INSTRUKSI
if (isset($koneksi) && $koneksi) {
    $query = "SELECT nim, nama, jk FROM siswa WHERE jenjang='S1' AND kelas IN (?, ?) AND prodi=? AND semester IN (?, ?) ORDER BY nama ASC";
    $stmt  = mysqli_prepare($koneksi, $query);
    if ($stmt) {
        mysqli_stmt_bind_param($stmt, "sssss", $kelas, $kelas_lama, $prodi, $semester, $semester_lama);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        if ($result) { 
            while ($row = mysqli_fetch_assoc($result)) { 
                $data_siswa[] = $row; 
            } 
        }
        mysqli_stmt_close($stmt);
    }
}

$uppercase_jenjang = strtoupper($jenjang);
$is_kuliah = ($uppercase_jenjang === 'S1' || $uppercase_jenjang === 'D3' || $uppercase_jenjang === 'D4' || $uppercase_jenjang === 'KULIAH');
$label_id = $is_kuliah ? 'NIM' : 'NIS';
$label_peserta = $is_kuliah ? 'MAHASISWA' : 'PESERTA DIDIK';
?>
<!DOCTYPE html>
<html lang="id" data-theme="<?php echo htmlspecialchars($theme, ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lembar Daftar Hadir & Rekap Nilai - S1 <?php echo htmlspecialchars($kelas_lama); ?> - <?php echo htmlspecialchars($semester_lama); ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --global-font-size: 11.333px;
            --global-padding: 1px;
            --logo-size: 58px;
            --global-font-family: 'Plus Jakarta Sans', sans-serif;
            --global-padding-sheet: 8mm;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--global-font-family); }
        body { background: #0b0f19; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 20px; padding-top: 110px; overflow-x: hidden; }
        
        body.modal-open { overflow: hidden !important; }
        .rekap-modal-overlay, .rekap-modal-content, .rekap-modal-body { overscroll-behavior: contain; }
        
        /* Top Toolbar Lebih Ramping & Responsif Seluler */
        .top-toolbar { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); width: calc(100% - 20px); max-width: 1700px; background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); padding: 4px 8px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); z-index: 9999; transition: transform 0.3s ease, opacity 0.3s ease; }
        .top-toolbar.hidden-toolbar { transform: translate(-50%, -130%); opacity: 0; pointer-events: none; }
        
        .toolbar-toggle-btn { position: fixed; top: 2px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(5px); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 2px 14px; border-radius: 0 0 8px 8px; font-size: 10px; cursor: pointer; z-index: 9998; display: flex; align-items: center; gap: 4px; box-shadow: 0 3px 10px rgba(0,0,0,0.4); transition: top 0.3s ease; }
        
        .toolbar-group { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 4px; }
        .toolbar-group:last-child { border-right: none; padding-right: 0; }
        
        .btn { padding: 4px 8px; border-radius: 5px; font-weight: 600; font-size: 10.5px; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 3px; text-decoration: none; transition: all 0.2s; min-height: 28px; min-width: 28px; justify-content: center; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-success { background: #10b981; color: white; }
        .btn-warning { background: #f59e0b; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-dark { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); }
        .btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
        
        select.btn-dark { appearance: none; -webkit-appearance: none; background-color: rgba(255, 255, 255, 0.08); padding-right: 16px; }
        select.btn-dark option { background-color: #0f172a; color: #f8fafc; }
        
        /* Panel Inspektor Bawah di HP & Kanan di Desktop */
        .inspector-panel { position: fixed; top: 110px; right: 15px; width: 260px; max-height: calc(100vh - 130px); overflow-y: auto; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); padding: 10px; border-radius: 10px; z-index: 9997; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transition: transform 0.3s ease, opacity 0.3s ease; }
        .inspector-panel.minimized { transform: translateX(300px); opacity: 0; pointer-events: none; }
        .inspector-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 6px; font-size: 10.5px; font-weight: 700; color: #38bdf8; }
        .inspector-body { display: flex; flex-direction: column; gap: 6px; font-size: 9.5px; }
        .inspector-row { display: flex; justify-content: space-between; align-items: center; }
        
        .inspector-toggle-btn { position: fixed; bottom: 15px; right: 15px; background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 10.5px; font-weight: 700; cursor: pointer; z-index: 10000; box-shadow: 0 5px 20px rgba(0,0,0,0.6); display: none; }
        .inspector-toggle-btn.show { display: flex; align-items: center; gap: 5px; }
        
        /* Kontainer Workspace & Kertas (ISOLASI CSS STRICT ANTI-BOCOR KERTAS MELUBER) */
        .workspace-container, .kontainer-kertas {
            position: relative;
            width: 100%;
            display: block;
            overflow-x: auto !important;
            max-width: 100%;
            -webkit-overflow-scrolling: touch;
            padding: 10px 15px;
            transition: transform 0.3s ease;
            transform-origin: top center;
            margin-bottom: 70px;
            touch-action: manipulation;
        }
        .paper-sheet {
            background: white;
            color: black;
            width: 210mm;
            min-height: 297mm;
            padding: var(--global-padding-sheet);
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            position: relative;
            border-radius: 4px;
            transition: all 0.3s ease;
            overflow: visible;
            font-size: var(--global-font-size);
            margin: 0 auto !important;
            display: block;
            flex-shrink: 0;
        }
        
        .page-preview-marker { position:absolute; left:0; right:0; height:0; border-top:2px dashed #2563eb; pointer-events:none; z-index:50; display:flex; justify-content:flex-end; padding-right:8px; }
        .page-preview-marker span { transform:translateY(-50%); padding:3px 8px; border:1px solid #2563eb; border-radius:5px; background:#dbeafe; color:#1e3a8a; font:700 11px Arial,sans-serif; box-shadow:0 1px 4px #0003; }
        .font-size-control { display:inline-flex; align-items:center; gap:4px; color:inherit; font-size:11px; white-space:nowrap; }
        .font-size-control input { width:64px; min-height:30px; padding:3px 5px; border:1px solid #64748b; border-radius:5px; background:#0f172a; color:#fff; font-size:12px; }
        
        [contenteditable="true"] { outline: none; border-bottom: 1px dashed transparent; transition: border 0.2s; cursor: text; }
        [contenteditable="true"]:hover { border-bottom: 1px dashed #3b82f6; background: rgba(59,130,246,0.04); }
        [contenteditable="true"]:focus { border-bottom: 1px solid #3b82f6; background: rgba(59,130,246,0.08); }
        
        .selectable-element { transition: transform 0.05s ease; position: relative; }
        .selectable-element.selected { outline: 2px solid #3b82f6; border-radius: 4px; z-index: 40; }
        
        .sheet-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-bottom: 5px; margin-bottom: 2px; position: relative; }
        .header-divider-line { width: 100%; border-bottom: 4px double #000 !important; margin-bottom: 8px; }
        .logo-wrapper { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .logo-box { width: var(--logo-size); height: var(--logo-size); border: 2px dashed #cbd5e1; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; overflow: hidden; border-radius: 5px; background: #f8fafc; }
        .logo-box img { width: 100%; height: 100%; object-fit: contain; }
        .logo-box input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
        .btn-hapus-logo { font-size: 8px; background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 1px 3px; border-radius: 3px; cursor: pointer; display: none; }
        
        .header-text { text-align: center; flex: 1; padding: 0 4px; }
        .header-text .line-1 { font-size: calc(var(--global-font-size) + 2px); font-weight: 800; text-transform: uppercase; margin-bottom: 1px; display: block; }
        .header-text .line-2 { font-size: calc(var(--global-font-size) + 3px); font-weight: 800; text-transform: uppercase; margin-bottom: 1px; display: block; }
        .header-text .line-3 { font-size: calc(var(--global-font-size) + 4px); font-weight: 900; text-transform: uppercase; margin-bottom: 2px; display: block; }
        .header-text .line-4, .header-text .line-5 { font-size: calc(var(--global-font-size) - 0.5px); color: #334155; display: block; font-style: italic; }
        
        .meta-wrapper { display: flex; justify-content: space-between; gap: 20px; font-size: var(--global-font-size); margin-bottom: 8px; }
        .meta-column { flex: 1; display: flex; flex-direction: column; gap: 3px; padding: 2px; }
        .meta-row { display: flex; align-items: center; font-weight: 600; }
        .meta-label { width: 100px; }
        .meta-colon { width: 10px; }
        .meta-val { flex: 1; }
        
        .table-responsive { width: 100%; overflow-x: auto; margin-bottom: 6px; }
        table.attendance-table { width: 100%; border-collapse: collapse; font-size: var(--global-font-size); }
        table.attendance-table th, table.attendance-table td { border: 1px solid #000 !important; padding: var(--global-padding); text-align: center; vertical-align: middle; font-size: var(--global-font-size); }
        table.attendance-table th { background: #f1f5f9; font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: calc(var(--global-font-size) - 0.5px); }
        table.attendance-table td input { width: 100%; border: none; background: transparent; text-align: center; font-size: var(--global-font-size); outline: none; }
        table.attendance-table td input.attendance-cell { min-width: 12px; height: 18px; padding: 0; font-weight: 700; text-transform: uppercase; touch-action: manipulation; }
        .meeting-number { min-width: 16px; background: #e2e8f0 !important; font-size: calc(var(--global-font-size) - 0.25px) !important; }
        .date-entry { min-width: 16px; height: 18px; background: #e2e8f0 !important; }
        .weight-settings { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; padding: 10px; margin-bottom: 10px; border: 1px solid #334155; border-radius: 8px; background: #172033; color: #f8fafc; }
        .weight-settings label { display: grid; gap: 4px; font-size: 11px; font-weight: 700; }
        .weight-settings input { width: 76px; min-height: 34px; padding: 6px 8px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: white; font-size: 14px; }
        .weight-total { align-self: center; font-weight: 800; color: #34d399; }
        .composition-summary { margin: 0 0 10px; padding: 10px 12px; border-left: 4px solid #38bdf8; border-radius: 6px; background: #0f172a; color: #f8fafc; font-size: 12px; line-height: 1.6; }
        .composition-summary strong { color: #7dd3fc; }
        .grade-rubric { width: auto; margin-top: 12px; color: #0f172a; background: #fff; }
        .grade-rubric th, .grade-rubric td { border: 1px solid #111 !important; padding: 4px 8px !important; text-align: center; }
        
        .school-footer-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; font-size: var(--global-font-size); position: relative; }
        .summary-box { width: 190px; border: 1px solid #000 !important; padding: 4px; background: #fff; }
        .summary-title { font-weight: 700; text-align: center; border-bottom: 1px solid #000 !important; margin-bottom: 3px; padding-bottom: 2px; font-size: calc(var(--global-font-size) + 0.5px); }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: var(--global-font-size); }
        
        .signature-section { display: flex; justify-content: space-between; margin-top: 18px; font-size: var(--global-font-size); position: relative; }
        .signature-box { width: 210px; text-align: left; font-size: var(--global-font-size); padding: 2px; }
        .signature-space { height: var(--signature-space-height, 72px); }
        
        .rekap-modal-overlay { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; background: #0b1120; z-index: 99999; display: flex; justify-content: stretch; align-items: stretch; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.2s ease; }
        .rekap-modal-overlay.show { opacity: 1; visibility: visible; pointer-events: auto; }
        .rekap-modal-content { background: #0f172a; border: 0; width: 100%; max-width: none; height: 100%; border-radius: 0; padding: clamp(10px, 2vw, 24px); box-shadow: none; display: flex; flex-direction: column; max-height: none; overflow: hidden; }
        .rekap-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
        .rekap-modal-header h3 { font-size: 15px; color: #f8fafc; font-weight: 700; }
        .rekap-modal-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
        .rekap-modal-header button { min-height: 40px; }
        .rekap-table-wrap { width: 100%; overflow: auto; }
        #tabelRekapNilai { min-width: 1500px; table-layout: fixed; }
        #tabelRekapNilai th { line-height: 1.25; white-space: normal; }
        #tabelRekapNilai td { padding: 5px 4px !important; }
        #tabelRekapNilai .activity-input { width: 100%; max-width: 88px; min-height: 38px; padding: 4px; text-align: center; }
        #tabelRekapNilai .name-value { text-align: left; }
        .rekap-header-blue { background: #c7dcf5 !important; }
        .rekap-header-yellow { background: #fff200 !important; }
        .rekap-activity-help { margin: 0 0 8px; color: #38bdf8; font-size: 12px; line-height: 1.5; }
        
        #tabelRekapNilai {
            --rekap-font-size: 12px;
            font-size: var(--rekap-font-size) !important;
            font-weight: 600;
        }
        #tabelRekapNilai th {
            font-size: calc(var(--rekap-font-size) - 1px) !important;
            font-weight: 800;
            background: #e2e8f0;
            color: #0f172a;
        }
        #tabelRekapNilai td {
            font-size: var(--rekap-font-size) !important;
            font-weight: 600;
        }
        #tabelRekapNilai td input {
            font-size: var(--rekap-font-size) !important;
            font-weight: 600;
        }
        
        .custom-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(5px); z-index: 1000000; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .custom-modal-overlay.show { opacity: 1; pointer-events: auto; }
        .custom-modal-box { background: #0f172a; border: 2px solid #38bdf8; width: 90%; max-width: 420px; border-radius: 14px; padding: 22px; box-shadow: 0 25px 50px rgba(0,0,0,0.9); color: #f8fafc; text-align: center; animation: modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes modalPop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .custom-modal-title { font-size: 15px; font-weight: 700; color: #38bdf8; margin-bottom: 8px; }
        .custom-modal-desc { font-size: 12.5px; color: #cbd5e1; margin-bottom: 18px; line-height: 1.5; }
        
        .tour-spotlight-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.88); backdrop-filter: blur(8px); z-index: 999999; display: none; opacity: 0; transition: opacity 0.3s ease; pointer-events: auto; }
        .tour-spotlight-backdrop.show { display: block; opacity: 1; }
        
        .tour-highlighted-target { position: relative; z-index: 1000000 !important; box-shadow: 0 0 0 6px #38bdf8, 0 0 45px rgba(56, 189, 248, 0.95) !important; border-radius: 10px; background: rgba(255, 255, 255, 0.12) !important; transform: scale(1.03); transition: all 0.25s ease; filter: contrast(1.15) brightness(1.2); }
        .tour-highlighted-target i, .tour-highlighted-target span, .tour-highlighted-target button { text-shadow: 0 0 8px rgba(56, 189, 248, 0.8); }
        
        .tour-speech-bubble { position: fixed; z-index: 1000001; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 2px solid #38bdf8; border-radius: 14px; padding: 18px; width: 380px; box-shadow: 0 20px 40px rgba(0,0,0,0.9); color: #f8fafc; display: none; animation: bubblePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes bubblePop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .tour-speech-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; }
        .tour-step-indicator { font-size: 10px; background: #38bdf8; color: #0f172a; padding: 2px 8px; border-radius: 20px; font-weight: 700; text-transform: uppercase; }
        
        .tour-speech-content-wrapper { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
        .tour-bubble-icon { width: 48px; height: 48px; background: rgba(56, 189, 248, 0.15); border: 2px solid #38bdf8; border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 22px; color: #38bdf8; flex-shrink: 0; box-shadow: 0 0 15px rgba(56, 189, 248, 0.5); }
        .tour-bubble-text-area { flex: 1; }
        .tour-speech-title { font-size: 13px; font-weight: 700; color: #38bdf8; margin-bottom: 4px; }
        .tour-speech-desc { font-size: 11.5px; color: #cbd5e1; line-height: 1.45; }
        
        .tour-speech-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; }
        
        /* Floating Tools (Zoom) di kiri bawah layar tanpa tabrakan */
        .floating-tools { position: fixed; bottom: 15px; left: 15px; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.15); padding: 6px 10px; border-radius: 50px; display: flex; gap: 6px; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 9996; }
        .zoom-val { font-size: 10.5px; font-weight: 700; min-width: 36px; text-align: center; }
        
        /* Palet tema global untuk ruang kerja. Kertas lembar absen tetap putih untuk tampilan dan cetak. */
        html { --ui-bg: #0b0f19; --ui-panel: rgba(15, 23, 42, .96); --ui-panel-soft: #172033; --ui-text: #f8fafc; --ui-muted: #cbd5e1; --ui-border: rgba(255,255,255,.16); --ui-accent: #38bdf8; --ui-input: #0f172a; }
        html[data-theme="putih"] { --ui-bg: #e8edf5; --ui-panel: rgba(255,255,255,.97); --ui-panel-soft: #f1f5f9; --ui-text: #0f172a; --ui-muted: #475569; --ui-border: rgba(15,23,42,.18); --ui-accent: #2563eb; --ui-input: #fff; }
        html[data-theme="samudra"] { --ui-bg: #064766; --ui-panel: rgba(8,47,73,.97); --ui-panel-soft: #0c4a6e; --ui-text: #f0f9ff; --ui-muted: #bae6fd; --ui-border: rgba(186,230,253,.24); --ui-accent: #7dd3fc; --ui-input: #082f49; }
        html[data-theme="senja"] { --ui-bg: #4c1026; --ui-panel: rgba(76,5,25,.97); --ui-panel-soft: #881337; --ui-text: #fff1f2; --ui-muted: #fecdd3; --ui-border: rgba(255,228,230,.24); --ui-accent: #fda4af; --ui-input: #4c0519; }
        html[data-theme] body { background: var(--ui-bg); color: var(--ui-text); }
        html[data-theme] .top-toolbar, html[data-theme] .toolbar-toggle-btn, html[data-theme] .inspector-panel,
        html[data-theme] .floating-tools { background: var(--ui-panel); color: var(--ui-text); border-color: var(--ui-border); }
        html[data-theme] .inspector-header { color: var(--ui-accent); border-color: var(--ui-border); }
        html[data-theme] .inspector-body, html[data-theme] .inspector-panel label { color: var(--ui-text); }
        html[data-theme] .btn-dark, html[data-theme] select.btn-dark { background: var(--ui-panel-soft); color: var(--ui-text); border-color: var(--ui-border); }
        html[data-theme] select.btn-dark option { background: var(--ui-panel); color: var(--ui-text); }
        html[data-theme] .weight-settings { background: var(--ui-panel-soft); color: var(--ui-text); border-color: var(--ui-border); }
        html[data-theme] .weight-settings input { background: var(--ui-input); color: var(--ui-text); border-color: var(--ui-border); }
        html[data-theme] .composition-summary { background: var(--ui-panel); color: var(--ui-text); border-left-color: var(--ui-accent); }
        html[data-theme] .composition-summary strong, html[data-theme] .custom-modal-title { color: var(--ui-accent); }
        html[data-theme] .rekap-modal-content, html[data-theme] .custom-modal-box, html[data-theme] .tour-speech-bubble { background: var(--ui-panel); color: var(--ui-text); border-color: var(--ui-border); }
        html[data-theme] .rekap-modal-header h3, html[data-theme] .custom-modal-desc, html[data-theme] .tour-speech-desc { color: var(--ui-text); }
        html[data-theme] .rekap-modal-header h3 i { color: var(--ui-accent) !important; }
        html[data-theme] .rekap-modal-body > div[style*="background"] { background: var(--ui-panel-soft) !important; color: var(--ui-text) !important; }
        html[data-theme] .rekap-modal-body > div[style*="background"] > div[style*="color"] { color: var(--ui-accent) !important; }
        html[data-theme] .rekap-modal-body span[style*="color:#cbd5e1"] { color: var(--ui-muted) !important; }
        html[data-theme] .tour-speech-title { color: var(--ui-accent); }
        html[data-theme] .custom-modal-box select, html[data-theme] .rekap-modal-content input:not([type="checkbox"]):not([type="color"]) { background-color: var(--ui-input) !important; color: var(--ui-text) !important; border-color: var(--ui-border) !important; }
        @media print { html[data-theme] body { background: white !important; color: black !important; } }

        /* TATA LETAK RESPONSIF SELULER */
        @media (max-width: 768px) {
            .workspace-container, .kontainer-kertas {
                display: block !important;
                padding: 10px 15px !important;
                margin-bottom: 110px;
            }
            .paper-sheet {
                margin: 0 auto !important;
                overflow-x: auto !important;
            }
            .top-toolbar {
                top: 0;
                width: 100%;
                max-width: 100%;
                border-radius: 0 0 10px 10px;
                padding: 3px 5px;
                gap: 3px;
                justify-content: center;
            }
            .btn {
                min-height: 32px;
                padding: 4px 8px;
                font-size: 10px;
            }
            body {
                padding-top: 95px;
            }
            .inspector-panel {
                top: auto;
                bottom: 0;
                right: 0;
                left: 0;
                width: 100%;
                max-height: 38vh;
                border-radius: 14px 14px 0 0;
                transform: translateY(120%);
                z-index: 9999;
            }
            .inspector-panel:not(.minimized) {
                transform: translateY(0);
            }
            .inspector-toggle-btn {
                bottom: 15px;
                right: 15px;
                padding: 8px 14px;
                font-size: 10.5px;
                z-index: 9998;
            }
            .floating-tools {
                bottom: 15px;
                left: 15px;
                right: auto;
                padding: 5px 8px;
                z-index: 9997;
            }
        }
        
        @media print {
            .logo-box:not(.has-image) { visibility: hidden !important; width: var(--logo-size) !important; height: var(--logo-size) !important; border: none !important; background: transparent !important; margin: 0 !important; padding: 0 !important; }
            .logo-box.has-image { border: none !important; background: transparent !important; }
            .logo-box input, .logo-box button, input[type="file"], .logo-box i { display: none !important; }
            
            body { background: white; padding: 0; color: black; font-size: var(--global-font-size); overflow: auto !important; }
            .top-toolbar, .toolbar-toggle-btn, .floating-tools, .inspector-panel, .inspector-toggle-btn, .rekap-modal-overlay, .tour-spotlight-backdrop, .tour-speech-bubble, .custom-modal-overlay { display: none !important; }
            body.cetak-rekap { overflow:visible !important; height:auto !important; }
            body.cetak-rekap > :not(#rekapModalOverlay) { display:none !important; }
            body.cetak-rekap #rekapModalOverlay.show { display: block !important; position: static; width: 100%; height: auto; min-height: 0; background: #fff !important; color: #000 !important; opacity: 1; visibility: visible; }
            body.cetak-rekap .rekap-modal-content { display: block; width: 100%; height: auto; max-height: none; overflow: visible; padding: 0; background: #fff !important; color: #000 !important; }
            body.cetak-rekap .rekap-modal-header button { display: none !important; }
            body.cetak-rekap .rekap-modal-header { display: block; color: #000 !important; }
            body.cetak-rekap #rekapModalOverlay h3, body.cetak-rekap #rekapModalOverlay p, body.cetak-rekap #rekapModalOverlay label, body.cetak-rekap #rekapModalOverlay .rekap-activity-help, body.cetak-rekap #rekapModalOverlay .composition-summary { color:#000 !important; }
            body.cetak-rekap #rekapModalOverlay .rekap-export-content, body.cetak-rekap #rekapModalOverlay .rekap-export-content > div { background:#fff !important; color:#000 !important; }
            body.cetak-rekap #rekapModalOverlay input { min-height:0 !important; height:auto !important; padding:0 !important; font-size:7pt !important; background:transparent !important; color:#000 !important; border:none !important; box-shadow:none !important; }
            body.cetak-rekap .rekap-modal-body, body.cetak-rekap .rekap-table-wrap { overflow: visible !important; }
            body.cetak-rekap .rekap-export-content, body.cetak-rekap .composition-summary, body.cetak-rekap .weight-settings { background: #fff !important; color: #000 !important; }
            body.cetak-rekap .rekap-activity-help, body.cetak-rekap .composition-summary strong { color: #000 !important; }
            body.cetak-rekap #tabelRekapNilai { min-width: 0; table-layout: fixed; font-size: 7pt !important; }
            body.cetak-rekap #tabelRekapNilai th, body.cetak-rekap #tabelRekapNilai td { padding: 2px !important; font-size: 7pt !important; }
            .workspace-container, .kontainer-kertas { transform: none !important; margin: 0; padding: 0; overflow: visible !important; }
            .paper-sheet { box-shadow: none !important; border-radius: 0 !important; width: 100% !important; min-height: auto !important; height: auto !important; max-height: none !important; overflow: visible !important; padding: var(--global-padding-sheet) !important; font-size: var(--global-font-size) !important; }
            .page-preview-marker, .btn-hapus-logo { display: none !important; }
            
            .header-divider-line { border-bottom: 3px solid #000 !important; }
            .summary-box { border: 1px solid #000 !important; }
            .summary-title { border-bottom: 1px solid #000 !important; }
            
            table.attendance-table th, table.attendance-table td { border: 1px solid #000 !important; font-size: var(--global-font-size) !important; }
            table.attendance-table td input { border: none !important; background: transparent !important; font-size: var(--global-font-size) !important; box-shadow: none !important; }
            tr, .school-footer-section, .signature-section { page-break-inside: avoid; break-inside: avoid; }
            .selectable-element { outline: none !important; border: none !important; }
            [contenteditable="true"] { border-bottom: none !important; background: transparent !important; }
        }
        /* Sorot area sebenarnya tanpa mengubah posisi atau ukuran dokumen. */
        .tour-spotlight-backdrop { position:fixed; inset:0; width:100vw; height:100vh; z-index:100001; background:rgba(0,0,0,.76); backdrop-filter:none; display:none; }
        .tour-spotlight-backdrop.show { display:block; opacity:1; }
        .tour-highlighted-target { box-shadow:none !important; transform:none; filter:none; transition:none; }
        .tour-focus-frame { position:fixed; z-index:100002; border:3px solid #38bdf8; border-radius:6px; pointer-events:auto; display:none; }
        .tour-speech-bubble { position:fixed; z-index:100003; box-sizing:border-box; width:min(410px,calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; padding:16px; border:2px solid #38bdf8; border-radius:12px; background:var(--ui-panel,var(--panel,#0f172a)); color:var(--ui-text,var(--text,#f8fafc)); box-shadow:0 16px 40px #0008; display:none; animation:none; }
        .tour-speech-header,.tour-speech-footer { display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .tour-speech-header { margin-bottom:12px; }
        .tour-step-indicator { font-size:12px; font-weight:700; }
        .tour-speech-title { margin:0 0 8px; font-size:16px; font-weight:700; color:var(--ui-accent,#38bdf8); }
        .tour-speech-desc { font-size:14px; line-height:1.65; color:inherit; }
        .tour-speech-footer { margin-top:14px; }
        .tour-speech-bubble button { min-height:42px; padding:8px 12px; border:1px solid #64748b; border-radius:6px; background:#2563eb; color:white; font:600 13px Arial,sans-serif; cursor:pointer; }
        .tour-feature-preview { margin:12px 0; padding:12px; border:1px solid #64748b; border-radius:8px; background:#fff; color:#111; font:14px Arial,sans-serif; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .tour-feature-preview img { display:block; max-width:100%; max-height:96px; width:auto; height:auto; object-fit:contain; }
        .tour-feature-preview .logo-slot,.tour-feature-preview .logo-box { width:80px; height:80px; transform:none; }
        .tour-feature-preview .logo-slot img,.tour-feature-preview .logo-box img { width:100%; height:100%; }
        .tour-feature-preview input,.tour-feature-preview button,.tour-feature-preview a { pointer-events:none; }
        .tour-feature-preview code { display:inline-block; min-width:24px; padding:5px; border:1px solid #475569; border-radius:4px; background:#f1f5f9; color:#111; font-size:15px; text-align:center; }
        .tour-example-caption { width:100%; font-size:12px; font-weight:700; color:#334155; }
        @media print { .tour-spotlight-backdrop,.tour-focus-frame,.tour-speech-bubble { display:none !important; } }
        /* Pegangan menu tetap terlihat saat panel disembunyikan. */
        #topToolbar { transition:transform .25s ease,opacity .25s ease; }
        #topToolbar.hidden-toolbar { transform:translate(-50%,-130%); opacity:0; pointer-events:none; visibility:hidden; }
        #toggleToolbarBtn { display:none; position:fixed; top:0; left:50%; transform:translateX(-50%); z-index:10001; min-height:32px; padding:5px 12px; border:1px solid currentColor; border-radius:0 0 10px 10px; font-size:11px; cursor:pointer; touch-action:manipulation; }
        #toggleToolbarBtn.show { display:flex; }
        .hide-toolbar-inline { white-space:nowrap; }
        #inspectorPanel { transition:transform .25s ease,opacity .25s ease,visibility .25s ease; }
        #inspectorPanel.minimized { display:block; transform:translateX(calc(100% + 24px)); opacity:0; pointer-events:none; visibility:hidden; }
        #inspectorToggleBtn { position:fixed; top:50%; bottom:auto; right:0; transform:translateY(-50%); min-width:44px; min-height:48px; padding:8px; border-radius:10px 0 0 10px; z-index:10001; font-size:11px; touch-action:manipulation; }
        #toggleToolbarBtn:focus-visible,#inspectorToggleBtn:focus-visible { outline:3px solid #38bdf8; outline-offset:2px; }
        @media (max-width:700px),(hover:none) { .hide-toolbar-inline { display:none !important; } }
        @media print { #toggleToolbarBtn,#inspectorToggleBtn { display:none !important; } }
   </style>
</head>
<body>
    <?php if(!empty($pesan_validasi)): ?>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                showCustomModal('Pemberitahuan Sistem', '<?php echo addslashes($pesan_validasi); ?>');
            });
        </script>
    <?php endif; ?>

    <button class="toolbar-toggle-btn" onclick="toggleToolbar()" id="toggleToolbarBtn" aria-controls="topToolbar" title="Sembunyikan atau tampilkan pita menu atas">
        <i class="fa-solid fa-chevron-up" id="toggleIcon"></i> Sembunyikan Pita Menu
    </button>
    <button class="inspector-toggle-btn" id="inspectorToggleBtn" aria-controls="inspectorPanel" onclick="toggleInspectorPanel()" title="Tampilkan navigasi tata letak">
        <i class="fa-solid fa-sliders"></i> ‹ Inspektor
    </button>
    

    <div class="inspector-panel" id="inspectorPanel" title="Usap ke kanan untuk menyembunyikan panel ini">
        <div class="inspector-header">
            <span><i class="fa-solid fa-compass-drafting"></i> Panel Tata Letak & Properti</span>
            <button onclick="toggleInspectorPanel()" class="btn btn-dark" style="padding: 1px 5px; font-size: 9px;" title="Tutup Panel"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="inspector-body">
            <div style="font-size: 9px; color: #38bdf8; font-weight: 600; margin-bottom: 2px;" id="activeElementLabel">Pilih elemen di lembar kerja...</div>
            <div class="inspector-row">
                <span>Geser Horizontal (X):</span>
                <div>
                    <button onclick="ubahPosisiAktif('x', -3)" class="btn btn-dark" style="padding: 2px 5px;" title="Geser posisi elemen ke kiri">-</button>
                    <button onclick="ubahPosisiAktif('x', 3)" class="btn btn-dark" style="padding: 2px 5px;" title="Geser posisi elemen ke kanan">+</button>
                </div>
            </div>
            <div class="inspector-row">
                <span>Geser Vertikal (Y):</span>
                <div>
                    <button onclick="ubahPosisiAktif('y', -3)" class="btn btn-dark" style="padding: 2px 5px;" title="Geser posisi elemen ke atas">-</button>
                    <button onclick="ubahPosisiAktif('y', 3)" class="btn btn-dark" style="padding: 2px 5px;" title="Geser posisi elemen ke bawah">+</button>
                </div>
            </div>
            <div class="inspector-row" style="margin-top: 2px;">
                <label for="signatureSpaceRange" style="font-size:9px;">Jarak tanda tangan: <span id="signatureSpaceValue">72 px</span></label>
                <input type="range" id="signatureSpaceRange" min="0" max="160" step="4" value="72" oninput="aturJarakTandaTangan(this.value)" style="width:100%;accent-color:#38bdf8;">
            </div>
            <div class="inspector-row" style="margin-top: 2px;">
                <span>Ukuran Logo:</span>
                <div>
                    <button onclick="aturUkuranLogo(-5)" class="btn btn-dark" style="padding: 2px 5px;" title="Perkecil dimensi ukuran logo">-</button>
                    <button onclick="aturUkuranLogo(5)" class="btn btn-dark" style="padding: 2px 5px;" title="Perbesar dimensi ukuran logo">+</button>
                </div>
            </div>
            <button onclick="resetPosisiAktif()" class="btn btn-dark" style="margin-top: 4px; width: 100%; justify-content: center; font-size: 9px; border: 1px solid rgba(255,255,255,0.2);" title="Kembalikan koordinat posisi elemen aktif ini ke asal mula"><i class="fa-solid fa-rotate-left"></i> Reset Posisi Ini</button>
            <button onclick="resetPosisiSemua()" class="btn btn-warning" style="margin-top: 2px; width: 100%; justify-content: center; font-size: 9px;" title="Reset mutlak ke tata letak pabrik (Sapu Bersih)"><i class="fa-solid fa-rotate-left"></i> Reset Semua Posisi</button>
            <div id="inspectorTextContainer" style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 6px; display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 9px; color: #94a3b8;">Klik elemen pada kertas untuk mengedit teksnya di sini.</div>
            </div>
        </div>
    </div>
    
    <div class="top-toolbar" id="topToolbar" title="Pita Menu Utama">
        <div class="toolbar-group">
            <a href="data_siswa.php?jenjang=S1&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($theme); ?>" class="btn btn-dark" title="Kembali Ke Halaman Data Siswa Utama">
                <i class="fa-solid fa-arrow-left"></i>
            </a>
            <a href="ujian.php?jenjang=S1&kelas=<?php echo urlencode($kelas); ?>&prodi=<?php echo urlencode($prodi); ?>&semester=<?php echo urlencode($semester); ?>&theme=<?php echo urlencode($theme); ?>" class="btn btn-warning" title="Buka Lembar Ujian untuk konteks kelas ini">
                <i class="fa-solid fa-file-invoice"></i> Lembar Ujian
            </a>
            <button onclick="mulaiTurInteraktif()" class="btn btn-primary" id="tourBtnGuide" title="Buka Panduan & Tur Interaktif"><i class="fa-solid fa-circle-question"></i> Panduan</button>
            <button onclick="bukaRekapNilai()" class="btn btn-success" id="tourBtnRekap" title="Buka Kalkulasi Otomatis Rekapitulasi Nilai Akhir"><i class="fa-solid fa-calculator"></i> Rekap Nilai</button>
            <button onclick="tambahSiswa()" class="btn btn-success" id="tourBtnTambah" title="Sisipkan satu baris siswa/mahasiswa baru di bagian paling bawah"><i class="fa-solid fa-user-plus"></i> Sisip Baris</button>
            <button onclick="hapusSiswa()" class="btn btn-danger" id="tourBtnHapus" title="Hapus baris data siswa yang berada di urutan paling akhir"><i class="fa-solid fa-user-minus"></i> Hapus Baris</button>
            <button onclick="tambahKolomPertemuan()" class="btn btn-success" id="tourBtnKolom" title="Sisipkan ekstra kolom pertemuan/tanggal di dalam tabel"><i class="fa-solid fa-columns"></i> Sisip Kolom</button>
            <button onclick="hapusKolomPertemuan()" class="btn btn-danger" id="tourBtnHapusKolom" title="Hapus urutan kolom pertemuan paling belakang (paling kanan)"><i class="fa-solid fa-trash-can"></i> Hapus Kolom</button>
            <button onclick="bukaModalHapusPermanen()" class="btn btn-danger" style="background: #7f1d1d;" id="tourBtnHapusPermanen" title="Hapus Riwayat Secara Data Permanen"><i class="fa-solid fa-server"></i> Hapus Permanen</button>
        </div>
        <div class="toolbar-group">
            <button onclick="formatTeksWord('bold')" class="btn btn-dark" title="Tebal (Ctrl+B)"><i class="fa-solid fa-bold"></i></button>
            <button onclick="formatTeksWord('italic')" class="btn btn-dark" title="Miring (Ctrl+I)"><i class="fa-solid fa-italic"></i></button>
            <button onclick="formatTeksWord('underline')" class="btn btn-dark" title="Garis Bawah (Ctrl+U)"><i class="fa-solid fa-underline"></i></button>
            <input type="color" id="textColorPicker" onchange="formatWarnaTeks(this.value)" title="Ubah Warna Font" style="width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; border-radius: 4px;">
            <button onclick="undo()" class="btn btn-dark" title="Urungkan Perubahan / Undo (Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i> Undo</button>
            <button onclick="redo()" class="btn btn-dark" title="Ulangi Perubahan / Redo (Ctrl+Y)"><i class="fa-solid fa-rotate-right"></i> Redo</button>
            <label class="font-size-control" title="Atur ukuran seluruh teks di lembar kerja">Ukuran <input id="fontSizeSelect" type="number" min="1" max="100" step="0.5" value="8.5" list="fontSizePresets" onchange="ubahUkuranFontCustom()" aria-label="Ukuran font dalam poin"><datalist id="fontSizePresets"><option value="1"><option value="2"><option value="4"><option value="6"><option value="8"><option value="8.5"><option value="9"><option value="10"><option value="11"><option value="12"><option value="14"><option value="16"><option value="18"><option value="20"><option value="24"><option value="28"><option value="32"><option value="36"><option value="48"><option value="72"><option value="100"></datalist> pt</label>
        </div>
        <div class="toolbar-group">
            <select id="fontFamilySelect" onchange="ubahFontFamily()" class="btn btn-dark" style="padding: 3px 5px;" title="Ganti Jenis Font Dokumen">
                <option value="'Plus Jakarta Sans', sans-serif">Jakarta Sans</option>
                <option value="'Inter', sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
            </select>
            <select id="paperSize" onchange="updateUkuranKertas()" class="btn btn-dark" style="padding: 3px 5px;" title="Format Ukuran Kertas Pengeprintan">
                <option value="a4">A4</option>
                <option value="folio">Folio / F4</option>
                <option value="letter">Letter</option>
            </select>
            <select id="paperOrientation" onchange="updateUkuranKertas()" class="btn btn-dark" style="padding: 3px 5px;" title="Rotasi Orientasi Halaman Cetak">
                <option value="portrait" selected>Potret</option>
                <option value="landscape">Lanskap</option>
            </select>
            <select id="marginTemplate" onchange="terapkanMargin()" class="btn btn-dark" style="padding: 3px;" title="Pengaturan Spasi Margin Lembar Kerja">
                <option value="wide">Lebar (25mm)</option>
                <option value="normal" selected>Normal (8mm)</option>
                <option value="narrow">Sempit (6mm)</option>
            </select>
        </div>
        <div class="toolbar-group">
            <button onclick="exportWord()" class="btn btn-primary" title="Ekspor dan Unduh Dokumen ke Microsoft Word (.doc)"><i class="fa-solid fa-file-word"></i> Word</button>
            <button onclick="exportExcel()" class="btn btn-success" title="Ekspor dan Unduh Lembar Kerja ke Microsoft Excel (.xls)"><i class="fa-solid fa-file-excel"></i> Excel</button>
            <button onclick="cetakDokumen()" class="btn btn-warning" id="tourBtnPrint" title="Cetak / Print Dokumen Kertas Secara Fisik atau PDF"><i class="fa-solid fa-print"></i> Cetak</button>
            <button onclick="toggleToolbar()" class="btn btn-dark hide-toolbar-inline" type="button" title="Sembunyikan navigasi atas"><i class="fa-solid fa-chevron-up"></i> Sembunyikan</button>
        </div>
    </div>
    
    <div class="workspace-container kontainer-kertas" id="workspaceContainer">
        <div class="paper-sheet" id="paperSheet">
            <!-- KOP SURAT CETAK FISIK RESMI STKIP YAPIS DOMPU (Sesuai Permintaan Foto 100%) -->
            <div class="sheet-header selectable-element" id="sheetHeader" data-type="Header Utama" onclick="pilihElemen(event, this)">
                <div class="logo-wrapper left-logo selectable-element" id="logoLeftWrapper" data-type="Logo Kiri" onclick="pilihElemen(event, this)">
                    <div class="logo-box" id="tourLogoBox">
                        <img id="logoKiriPreview" src="" alt="" style="display:none;">
                        <i class="fa-solid fa-image" id="logoKiriIcon"></i>
                        <input type="file" accept="image/*" onchange="previewLogo(event, 'logoKiriPreview', 'logoKiriIcon', 'btnHapusKiri')">
                    </div>
                    <button type="button" id="btnHapusKiri" class="btn-hapus-logo" onclick="hapusLogo('logoKiriPreview', 'logoKiriIcon', 'btnHapusKiri')">Hapus</button>
                </div>
                <div class="header-text" contenteditable="true">
                    <span class="line-1">YAYASAN PENDIDIKAN ISLAM</span>
                    <span class="line-2">SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN</span>
                    <span class="line-3">(STKIP) YAPIS DOMPU</span>
                    <span class="line-4">Status Akreditasi: Baik Sekali (SK. No. 554/SK/BAN-PT/Ak/PT/VIII/2023)</span>
                    <span class="line-4">Jln. STKIP Yapis Dompu No. 1, Sori Sakolo, Dompu, Nusa Tenggara Barat</span>
                    <span class="line-5">Email: akademik@stkipyapisdompu.ac.id | Website: www.stkipyapisdompu.ac.id</span>
                </div>
                <div class="logo-wrapper right-logo selectable-element" id="logoRightWrapper" data-type="Logo Kanan" onclick="pilihElemen(event, this)">
                    <div class="logo-box" id="boxLogoKanan">
                        <img id="logoKananPreview" src="" alt="" style="display:none;">
                        <i class="fa-solid fa-image" id="logoKananIcon"></i>
                        <input type="file" accept="image/*" onchange="previewLogo(event, 'logoKananPreview', 'logoKananIcon', 'btnHapusKanan')">
                    </div>
                    <button type="button" id="btnHapusKanan" class="btn-hapus-logo" onclick="hapusLogo('logoKananPreview', 'logoKananIcon', 'btnHapusKanan')">Hapus</button>
                </div>
            </div>
            
            <div class="header-divider-line"></div>
            
            <!-- SUSUNAN METADATA ATAS TABEL (FORMAT 2 KOLOM SEJAJAR) -->
            <div class="meta-wrapper">
                <div class="meta-column selectable-element" id="metaLeftBox" data-type="Blok Kiri (Semester, Tahun, Prodi)" onclick="pilihElemen(event, this)">
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Semester</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true"><?php echo htmlspecialchars($semester_lama); ?> (<?php echo ((int)$semester % 2 === 0) ? 'Genap' : 'Ganjil'; ?>)</div>
                    </div>
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Tahun Akademik</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true">2026/2027</div>
                    </div>
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Program Studi</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true"><?php echo htmlspecialchars($prodi); ?></div>
                    </div>
                </div>
                <div class="meta-column selectable-element" id="metaRightBox" data-type="Blok Kanan (Matakuliah, Dosen, Kelas)" onclick="pilihElemen(event, this)">
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Matakuliah</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true">Pengembangan Pembelajaran Interaktif</div>
                    </div>
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Dosen Pengampu</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true">Tim Dosen Pengampu, M.Pd.</div>
                    </div>
                    <div class="meta-row">
                        <div class="meta-label" contenteditable="true">Kelas</div><div class="meta-colon">:</div><div class="meta-val" contenteditable="true"><?php echo htmlspecialchars($kelas_lama); ?></div>
                    </div>
                </div>
            </div>
            
            <!-- STRUKTUR GRID KOLOM TABEL ABSENSI (SESUAI FOTO & KUSTOM L/P) -->
            <div class="table-responsive selectable-element" id="tableWrapper" data-type="Tabel Absensi" onclick="pilihElemen(event, this)">
                <table class="attendance-table" id="tabelAbsen">
                    <thead>
                        <tr>
                            <th rowspan="3" style="width: 24px;" contenteditable="true">NO</th>
                            <th rowspan="3" style="width: 75px;" contenteditable="true" id="thLabelId"><?php echo $label_id; ?></th>
                            <th rowspan="3" style="min-width: 120px;" contenteditable="true">NAMA MAHASISWA</th>
                            <th rowspan="3" style="width: 24px;" contenteditable="true">L/P</th>
                            <th colspan="16" id="headerPertemuan" contenteditable="true">TANGGAL / BULAN</th>
                            <th rowspan="3" style="width: 30px;" contenteditable="true">KET</th>
                        </tr>
                        <!-- Baris untuk tanggal manual -->
                        <tr id="subHeaderPertemuan">
                            <?php for($i=1; $i<=16; $i++): ?>
                            <th class="date-entry" contenteditable="true">&nbsp;</th>
                            <?php endfor; ?>
                        </tr>
                        <tr id="numberHeaderPertemuan">
                            <?php for($i=1; $i<=16; $i++): ?>
                            <th class="meeting-number"><?php echo $i; ?></th>
                            <?php endfor; ?>
                        </tr>
                    </thead>
                    <tbody id="tbodySiswa">
                        <?php if (!empty($data_siswa)): $no=1; foreach($data_siswa as $s): ?>
                        <tr>
                            <td class="row-no"><?php echo $no++; ?></td>
                            <td><input type="text" value="<?php echo htmlspecialchars($s['nim'] ?? ''); ?>"></td>
                            <td style="text-align: left; padding-left: 3px;"><input type="text" value="<?php echo htmlspecialchars($s['nama'] ?? ''); ?>" style="text-align: left;"></td>
                            <td><input type="text" value="<?php echo strtoupper($s['jk'] ?? 'L'); ?>"></td>
                            <?php for($i=1; $i<=16; $i++): ?><td><input class="attendance-cell" type="text" maxlength="1" autocomplete="off" aria-label="Absensi pertemuan <?php echo $i; ?>"></td><?php endfor; ?>
                            <td><input type="text"></td>
                        </tr>
                        <?php endforeach; else: ?>
                            <?php for($r=1; $r<=30; $r++): ?>
                            <tr>
                                <td class="row-no"><?php echo $r; ?></td>
                                <td style="text-align:center;"><input type="text" value=""></td>
                                <td style="text-align: left; padding-left: 3px;"><input type="text" value="" style="text-align: left;"></td>
                                <td style="text-align: center;"><input type="text" value="L"></td>
                                <?php for($i=1; $i<=16; $i++): ?><td><input class="attendance-cell" type="text" maxlength="1" autocomplete="off" aria-label="Absensi pertemuan <?php echo $i; ?>"></td><?php endfor; ?>
                                <td><input type="text"></td>
                            </tr>
                            <?php endfor; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

            <div class="signature-section">
                <div class="signature-box selectable-element" id="uniLeftBox" data-type="Kotak Tanda Tangan Kiri (Kaprodi)" onclick="pilihElemen(event, this)">
                    <div contenteditable="true">Mengetahui,<br>Ketua Program Studi <?php echo htmlspecialchars($prodi); ?></div>
                    <div class="signature-space"></div>
                    <div>
                        <div contenteditable="true" style="font-weight: 700;">Ketua Prodi, M.Pd.</div>
                        <div contenteditable="true">NIP. 197501012000031002</div>
                    </div>
                </div>
                <div class="signature-box selectable-element" id="uniRightBox" data-type="Kotak Tanda Tangan Kanan (Dosen)" onclick="pilihElemen(event, this)">
                    <div contenteditable="true">Dompu, September 2026<br>Dosen Pengampu Mata Kuliah</div>
                    <div class="signature-space"></div>
                    <div>
                        <div contenteditable="true" style="font-weight: 700;">Tim Dosen Pengampu, M.Pd.</div>
                        <div contenteditable="true">NIP. 198802022019031001</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="custom-modal-overlay" id="customModalOverlay">
        <div class="custom-modal-box">
            <div class="custom-modal-title" id="customModalTitle">Informasi Sistem</div>
            <div class="custom-modal-desc" id="customModalDesc">Pesan notifikasi...</div>
            <button onclick="tutupCustomModal()" class="btn btn-primary" style="padding: 6px 20px; font-size: 11.5px; font-weight: 700;"><i class="fa-solid fa-check"></i> OK</button>
        </div>
    </div>

    <!-- MODAL HAPUS PERMANEN DENGAN FITUR MASS DELETE SEKALIGUS -->
    <div class="custom-modal-overlay" id="modalHapusPermanen">
        <div class="custom-modal-box" style="border-color: #ef4444; max-width: 480px;">
            <div class="custom-modal-title" style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Hapus Riwayat Permanen & Massal</div>
            <div class="custom-modal-desc" style="text-align: left;">
                Pilih satuan identitas mahasiswa atau gunakan tombol merah di bawah untuk membersihkan total seluruh data kelas ini sekaligus.
            </div>
            <form method="POST" action="">
                <input type="hidden" name="jenjang" value="<?php echo htmlspecialchars($jenjang); ?>">
                <input type="hidden" name="kelas" value="<?php echo htmlspecialchars($kelas); ?>">
                <input type="hidden" name="prodi" value="<?php echo htmlspecialchars($prodi); ?>">
                <input type="hidden" name="semester" value="<?php echo htmlspecialchars($semester); ?>">
                <input type="hidden" name="aksi_hapus_permanen" value="1">
                
                <select name="hapus_permanen_id" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 6px; background: #1e293b; color: #f8fafc; border: 1px solid #475569;">
                    <option value="">-- Pilih Mahasiswa Satuan --</option>
                    <?php if(!empty($data_siswa)): foreach($data_siswa as $s): 
                        $identifier = trim((string)($s['nim'] ?? ''));
                        $nama_siswa = !empty($s['nama']) ? $s['nama'] : 'Tanpa Nama';
                        if(!empty($identifier)):
                    ?>
                        <option value="<?php echo htmlspecialchars($identifier); ?>"><?php echo htmlspecialchars($identifier . ' - ' . $nama_siswa); ?></option>
                    <?php endif; endforeach; endif; ?>
                </select>
                
                <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 15px;">
                    <button type="button" onclick="tutupModalHapusPermanen()" class="btn btn-dark" style="padding: 6px 14px;"><i class="fa-solid fa-xmark"></i> Batal</button>
                    <button type="submit" class="btn btn-danger" style="padding: 6px 14px;"><i class="fa-solid fa-trash-can"></i> Hapus Satuan</button>
                </div>
            </form>

            <form method="POST" action="" onsubmit="return confirm('PERINGATAN KERAS: Apakah Anda benar-benar yakin ingin menghapus SEKALI KLIK seluruh riwayat data mahasiswa kelas <?php echo htmlspecialchars($kelas); ?> ini dari database?');">
                <input type="hidden" name="jenjang" value="<?php echo htmlspecialchars($jenjang); ?>">
                <input type="hidden" name="kelas" value="<?php echo htmlspecialchars($kelas); ?>">
                <input type="hidden" name="prodi" value="<?php echo htmlspecialchars($prodi); ?>">
                <input type="hidden" name="semester" value="<?php echo htmlspecialchars($semester); ?>">
                <input type="hidden" name="aksi_hapus_massal_kelas" value="1">
                <button type="submit" class="btn btn-danger" style="background: #b91c1c; width: 100%; padding: 10px; font-weight: 700; border-radius: 6px; justify-content: center;">
                    <i class="fa-solid fa-fire"></i> HAPUS SEKALIGUS SEMUA MAHASISWA KELAS INI
                </button>
            </form>
        </div>
    </div>

    <div class="tour-focus-frame" id="tourFocusFrame" aria-hidden="true"></div>
    <div class="tour-spotlight-backdrop" id="tourBackdrop" onclick="tutupTurInteraktif()"></div>
    <section class="tour-speech-bubble" id="tourBubble" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourDesc" tabindex="-1">
        <div class="tour-speech-header">
            <span class="tour-step-indicator" id="tourStepBadge"></span>
            <button type="button" onclick="tutupTurInteraktif()">× Keluar</button>
        </div>
        <h2 class="tour-speech-title" id="tourTitle"></h2>
        <div class="tour-feature-preview" id="tourFeaturePreview" aria-label="Contoh tampilan fitur"></div>
        <div class="tour-speech-desc" id="tourDesc"></div>
        <div class="tour-speech-footer">
            <button type="button" onclick="langkahTurSebelumnya()" id="tourPrevBtn">← Sebelumnya</button>
            <button type="button" onclick="langkahTurBerikutnya()" id="tourNextBtn">Selanjutnya →</button>
        </div>
    </section>
    
    <!-- MODAL REKAP NILAI: Tombol baru "Simpan & Kirim Nilai ke Lembar Ujian", hapus kop surat di dalam modal -->
    <div class="rekap-modal-overlay" id="rekapModalOverlay">
        <div class="rekap-modal-content">
            <div class="rekap-modal-header">
                <h3><i class="fa-solid fa-calculator" style="color: #38bdf8;"></i> Rekapitulasi & Kalkulasi Nilai Akhir Mahasiswa</h3>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button onclick="simpanKirimNilaiKeLembarUjian()" class="btn btn-primary" style="background: #8b5cf6;" title="Kunci dan kirim nilai ke variabel session lembar ujian"><i class="fa-solid fa-paper-plane"></i> Simpan & Kirim Nilai ke Lembar Ujian</button>
                    <button onclick="cetakRekap()" class="btn btn-warning" title="Cetak atau Print Lembar Rekap Nilai Ini"><i class="fa-solid fa-print"></i> Cetak</button>
                    <button onclick="exportWordRekap()" class="btn btn-primary" title="Unduh Tabel Rekap ke Ms. Word"><i class="fa-solid fa-file-word"></i> Word</button>
                    <button onclick="exportExcelRekap()" class="btn btn-success" title="Unduh Tabel Rekap ke Ms. Excel"><i class="fa-solid fa-file-excel"></i> Excel</button>
                    <button onclick="tutupRekapNilai()" class="btn btn-danger" title="Tutup Jendela Rekap"><i class="fa-solid fa-xmark"></i> Tutup</button>
                </div>
            </div>
            <div class="rekap-modal-body" id="rekapModalBodyContent">
                <div class="rekap-export-content" style="background: #1e293b; padding: 15px; border-radius: 8px; color: #f8fafc;">
                    <div style="margin-bottom: 10px; font-size: 12px; font-weight: 600; color: #38bdf8;">
                        Titik (.) = hadir; A = alpa/tidak hadir; S = sakit; I = izin. Absen adalah jumlah A + S + I. S dan I tetap dihitung terpisah sebagai keterangan, bukan hadir, dan tidak mendapat penalti tambahan. Nilai E otomatis hanya jika A (alpa) minimal 4 kali.
                    </div>
                    <div class="composition-summary">
                        <strong>Penilaian dilakukan dengan komposisi:</strong><br>
                        Kehadiran: <span id="komposisiAbsensi">35%</span> · Poin keaktifan: <span id="komposisiAktivitas">35%</span> · Ujian tengah semester: <span id="komposisiUTS">15%</span> · Ujian akhir semester: <span id="komposisiUAS">15%</span> · Total: <span id="komposisiTotal">100%</span>.
                    </div>
                    <div class="weight-settings">
                        <label>Bobot Kehadiran (%)<input id="bobotAbsensi" type="number" min="0" max="100" step="1" value="35" oninput="perbaruiBobotNilai()"></label>
                        <label>Bobot Keaktifan (%)<input id="bobotAktivitas" type="number" min="0" max="100" step="1" value="35" oninput="perbaruiBobotNilai()"></label>
                        <label>Bobot UTS (%)<input id="bobotUTS" type="number" min="0" max="100" step="1" value="15" oninput="perbaruiBobotNilai()"></label>
                        <label>Bobot UAS (%)<input id="bobotUAS" type="number" min="0" max="100" step="1" value="15" oninput="perbaruiBobotNilai()"></label>
                        <span class="weight-total" id="totalBobotText">Total bobot: 100%</span>
                        <span style="font-size:10px; color:#cbd5e1;">Nilai awal komponen adalah 0. Bobot dihitung proporsional dari jumlah bobot yang diisi.</span>
                    </div>
                    <p class="rekap-activity-help">Poin aktivitas: bertanya = 2 poin setiap kali; aktif/menambah jawaban/usul/saran = 3 poin setiap kontribusi; diskusi individu dapat diatur dosen sampai 25 poin. Nilai aktivitas dihitung dari jumlah poin tersebut (maksimal 100).</p>
                    <div class="table-responsive rekap-table-wrap">
                        <table class="attendance-table" id="tabelRekapNilai" style="width: 100%; background: white; color: black; border-collapse: collapse;">
                            <colgroup><col style="width:3%"><col style="width:15%"><col style="width:10%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:6%"><col style="width:12%"><col style="width:7%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:4%"><col style="width:3%"></colgroup>
                            <thead>
                                <tr style="color: #0f172a;">
                                    <th class="rekap-header-blue" rowspan="2">NO</th>
                                    <th class="rekap-header-blue" rowspan="2">NAMA</th>
                                    <th class="rekap-header-blue" rowspan="2">NIM</th>
                                    <th class="rekap-header-blue" colspan="5">DAFTAR KEHADIRAN</th>
                                    <th class="rekap-header-yellow" colspan="3">KEAKTIFAN</th>
                                    <th class="rekap-header-yellow" rowspan="2">UTS</th>
                                    <th class="rekap-header-blue" rowspan="2">UAS</th>
                                    <th class="rekap-header-blue" colspan="3">NILAI</th>
                                </tr>
                                <tr style="color: #0f172a;">
                                    <th class="rekap-header-yellow">ABSENSI</th>
                                    <th class="rekap-header-yellow" title="Tidak hadir: alpa, sakit, dan izin. Hanya alpa (A) minimal 4 kali memicu E otomatis.">ABSEN<br>(A + S + I)</th>
                                    <th class="rekap-header-yellow">SAKIT (S)</th>
                                    <th class="rekap-header-yellow">IZIN (I)</th>
                                    <th class="rekap-header-yellow">TOTAL</th>
                                    <th class="rekap-header-yellow">BERTANYA<br>(2 POIN)</th>
                                    <th class="rekap-header-yellow">AKTIF / MENAMBAH JAWABAN / USUL / SARAN<br>(3 POIN)</th>
                                    <th class="rekap-header-yellow">DISKUSI INDIVIDU<br>(MAKS. 25)</th>
                                    <th class="rekap-header-blue">SKOR</th>
                                    <th class="rekap-header-blue">NILAI HURUF</th>
                                    <th class="rekap-header-blue">MUTU</th>
                                </tr>
                            </thead>
                            <tbody id="tbodyRekapNilai">
                                <!-- Diisi dinamis via JavaScript -->
                            </tbody>
                        </table>
                    </div>
                    <table class="attendance-table grade-rubric">
                        <thead><tr><th colspan="4">KONVERSI SKOR NILAI</th></tr><tr><th>SKOR</th><th>NILAI HURUF</th><th>MUTU</th><th>PREDIKAT</th></tr></thead>
                        <tbody>
                            <tr><td>80–100</td><td>A</td><td>4</td><td>Sangat Baik</td></tr>
                            <tr><td>66–79</td><td>B</td><td>3</td><td>Baik</td></tr>
                            <tr><td>56–65</td><td>C</td><td>2</td><td>Cukup</td></tr>
                            <tr><td>46–55</td><td>D</td><td>1</td><td>Kurang</td></tr>
                            <tr><td>0–45</td><td>E</td><td>0</td><td>Sangat Kurang</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Floating Tools (Zoom) -->
    <div class="floating-tools">
        <button onclick="ubahZoom(-0.1)" class="btn btn-dark" title="Perkecil Tampilan"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
        <span class="zoom-val" id="zoomValText">100%</span>
        <button onclick="ubahZoom(0.1)" class="btn btn-dark" title="Perbesar Tampilan"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
        <button onclick="resetZoom()" class="btn btn-dark" title="Reset Ukuran Normal"><i class="fa-solid fa-rotate-left"></i></button>
    </div>

    <script>
        // ==============================================================================
        // LOGIKA LENGKAP JAVASCRIPT: Kalkulator, Auto-Sync, Undo/Redo, Zoom, & Modal Rekap
        // ==============================================================================
        let currentZoom = 1.0;
        let selectedElement = null;
        let logoSizeVal = 45;
        let historyStack = [];
        let redoStack = [];
        let draftNilaiPerNim = Object.create(null);
        const absenLayoutSettingsKey = <?php echo json_encode('absen-layout-settings-S1-' . md5($prodi . '|' . $semester . '|' . $kelas)); ?>;
        function aturJarakTandaTangan(value) {
            const px = Math.max(0, Math.min(160, Number(value) || 0));
            document.getElementById('paperSheet').style.setProperty('--signature-space-height', px + 'px');
            document.getElementById('signatureSpaceValue').textContent = px + ' px';
            try { localStorage.setItem(absenLayoutSettingsKey, JSON.stringify({signatureSpace: px})); } catch (error) {}
        }
        try {
            const layoutSettings = JSON.parse(localStorage.getItem(absenLayoutSettingsKey) || '{}');
            const signatureSpace = Number.isFinite(Number(layoutSettings.signatureSpace)) ? Math.max(0, Math.min(160, Number(layoutSettings.signatureSpace))) : 72;
            const signatureControl = document.getElementById('signatureSpaceRange');
            if (signatureControl) { signatureControl.value = String(signatureSpace); aturJarakTandaTangan(signatureSpace); }
        } catch (error) {}

        function simpanStateUndo() {
            const paperHtml = document.getElementById('paperSheet').innerHTML;
            historyStack.push(paperHtml);
            if(historyStack.length > 30) historyStack.shift();
            redoStack = [];
        }

        function undo() {
            if(historyStack.length === 0) {
                showCustomModal('Undo', 'Tidak ada riwayat undo tersisa.');
                return;
            }
            const currentHtml = document.getElementById('paperSheet').innerHTML;
            redoStack.push(currentHtml);
            const prevHtml = historyStack.pop();
            document.getElementById('paperSheet').innerHTML = prevHtml;
            inisialisasiEventEditable();
            showCustomModal('Undo', 'Perubahan sebelumnya berhasil dibatalkan.');
        }

        function redo() {
            if(redoStack.length === 0) {
                showCustomModal('Redo', 'Tidak ada riwayat redo tersisa.');
                return;
            }
            const currentHtml = document.getElementById('paperSheet').innerHTML;
            historyStack.push(currentHtml);
            const nextHtml = redoStack.pop();
            document.getElementById('paperSheet').innerHTML = nextHtml;
            inisialisasiEventEditable();
            showCustomModal('Redo', 'Perubahan berhasil dikembalikan (redo).');
        }

        function toggleToolbar() {
            document.getElementById('topToolbar').classList.toggle('hidden-toolbar');
            sinkronkanPeganganPanel();
        }
        function toggleInspectorPanel() {
            document.getElementById('inspectorPanel').classList.toggle('minimized');
            sinkronkanPeganganPanel();
        }
        function sinkronkanPeganganPanel() {
            const toolbar=document.getElementById('topToolbar'),panel=document.getElementById('inspectorPanel'),menuButton=document.getElementById('toggleToolbarBtn'),panelButton=document.getElementById('inspectorToggleBtn');
            const menuHidden=toolbar.classList.contains('hidden-toolbar'),panelHidden=panel.classList.contains('minimized');
            toolbar.inert=menuHidden;panel.inert=panelHidden;
            menuButton.textContent=menuHidden?'⌄ Menu':'⌃ Menu';
            menuButton.title=menuHidden?'Tampilkan menu atas':'Menu atas sedang tampil';
            menuButton.classList.toggle('show',menuHidden);
            menuButton.setAttribute('aria-expanded',String(!menuHidden));menuButton.setAttribute('aria-label',menuButton.title);
            panelButton.classList.toggle('show',panelHidden);panelButton.setAttribute('aria-expanded',String(!panelHidden));
        }
        function pasangUsapanPanel(element,axis,hide) {
            let start=null;
            element.addEventListener('touchstart',event=>{
                if(event.touches.length!==1||event.target.closest('input,textarea,select,[contenteditable="true"]')){start=null;return;}
                const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,time:Date.now()};
            },{passive:true});
            element.addEventListener('touchend',event=>{
                if(!start||!event.changedTouches.length)return;
                const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y,elapsed=Date.now()-start.time;start=null;
                if(typeof tourActive!=='undefined'&&tourActive)return;
                if(elapsed>1200)return;
                if((axis==='up'&&dy< -44&&Math.abs(dy)>Math.abs(dx)*1.35)||(axis==='right'&&dx>44&&dx>Math.abs(dy)*1.35))hide();
            },{passive:true});
            element.addEventListener('touchcancel',()=>{start=null;},{passive:true});
        }
        const menuPanel=document.getElementById('topToolbar'),layoutPanel=document.getElementById('inspectorPanel');
        pasangUsapanPanel(menuPanel,'up',()=>{menuPanel.classList.add('hidden-toolbar');sinkronkanPeganganPanel();});
        pasangUsapanPanel(layoutPanel,'right',()=>{layoutPanel.classList.add('minimized');sinkronkanPeganganPanel();});
        const panelObserver=new MutationObserver(sinkronkanPeganganPanel);
        [menuPanel,layoutPanel].forEach(el=>panelObserver.observe(el,{attributes:true,attributeFilter:['class']}));
        new ResizeObserver(sinkronkanPeganganPanel).observe(menuPanel);
        window.addEventListener('resize',sinkronkanPeganganPanel);
        sinkronkanPeganganPanel();
        function ubahZoom(delta) {
            currentZoom += delta;
            if(currentZoom < 0.5) currentZoom = 0.5;
            if(currentZoom > 1.8) currentZoom = 1.8;
            document.getElementById('paperSheet').style.transform = `scale(${currentZoom})`;
            document.getElementById('zoomValText').innerText = Math.round(currentZoom * 100) + '%';
        }

        function resetZoom() {
            currentZoom = 1.0;
            document.getElementById('paperSheet').style.transform = 'scale(1)';
            document.getElementById('zoomValText').innerText = '100%';
        }

        function updateUkuranKertas() {
            const ps = document.getElementById('paperSize').value;
            const po = document.getElementById('paperOrientation').value;
            const sheet = document.getElementById('paperSheet');
            
            if(ps === 'a4') {
                sheet.style.width = po === 'portrait' ? '210mm' : '297mm';
                sheet.style.minHeight = po === 'portrait' ? '297mm' : '210mm';
            } else if(ps === 'folio') {
                sheet.style.width = po === 'portrait' ? '215.9mm' : '330mm';
                sheet.style.minHeight = po === 'portrait' ? '330mm' : '215.9mm';
            } else if(ps === 'letter') {
                sheet.style.width = po === 'portrait' ? '215.9mm' : '279.4mm';
                sheet.style.minHeight = po === 'portrait' ? '279.4mm' : '215.9mm';
            }
            showCustomModal('Ukuran Kertas', `Format kertas diubah ke ${ps.toUpperCase()} (${po}).`);
        }

        function terapkanMargin() {
            const m = document.getElementById('marginTemplate').value;
            const sheet = document.getElementById('paperSheet');
            if(m === 'wide') sheet.style.setProperty('--global-padding-sheet', '25mm');
            else if(m === 'normal') sheet.style.setProperty('--global-padding-sheet', '8mm');
            else if(m === 'narrow') sheet.style.setProperty('--global-padding-sheet', '6mm');
        }

        function ubahFontFamily() {
            const font = document.getElementById('fontFamilySelect').value;
            document.getElementById('paperSheet').style.setProperty('--global-font-family', font);
        }

        function ubahUkuranFontCustom() {
            const input = document.getElementById('fontSizeSelect');
            const pt = Math.min(100, Math.max(1, Number(input.value) || 8.5));
            input.value = String(pt);
            document.getElementById('paperSheet').style.setProperty('--global-font-size', `${pt * 4 / 3}px`);
            perbaruiPenandaHalaman();
        }

        function tinggiHalamanLembarPx() {
            const paper = document.getElementById('paperSheet');
            const mm = parseFloat(paper.style.minHeight) || 297;
            return mm * 96 / 25.4;
        }

        function perbaruiPenandaHalaman() {
            const paper = document.getElementById('paperSheet');
            if (!paper) return;
            paper.querySelectorAll('.page-preview-marker').forEach(marker => marker.remove());
            const tinggi = tinggiHalamanLembarPx();
            const jumlahHalaman = Math.max(1, Math.ceil(paper.scrollHeight / tinggi));
            for (let halaman = 2; halaman <= jumlahHalaman; halaman++) {
                const marker = document.createElement('div');
                marker.className = 'page-preview-marker';
                marker.style.top = `${(halaman - 1) * tinggi}px`;
                const label = document.createElement('span');
                label.textContent = `HALAMAN ${halaman} DIMULAI ↓`;
                marker.appendChild(label);
                paper.appendChild(marker);
            }
        }

        function jadwalkanPenandaHalaman() { requestAnimationFrame(perbaruiPenandaHalaman); }
        window.addEventListener('resize', jadwalkanPenandaHalaman);
        document.addEventListener('input', jadwalkanPenandaHalaman);
        document.addEventListener('change', jadwalkanPenandaHalaman);
        document.addEventListener('DOMContentLoaded', () => {
            jadwalkanPenandaHalaman();
            const paper = document.getElementById('paperSheet');
            if (window.ResizeObserver && paper) {
                const observer = new ResizeObserver(jadwalkanPenandaHalaman);
                observer.observe(paper.querySelector('#tabelAbsen') || paper);
                paper.querySelectorAll('img').forEach(img => img.addEventListener('load', jadwalkanPenandaHalaman));
            }
        });

        function previewLogo(event, imgId, iconId, btnHapusId) {
            simpanStateUndo();
            const file = event.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.getElementById(imgId);
                    img.src = e.target.result;
                    img.style.display = 'block';
                    document.getElementById(iconId).style.display = 'none';
                    document.getElementById(btnHapusId).style.display = 'inline-block';
                    img.closest('.logo-box').classList.add('has-image');
                }
                reader.readAsDataURL(file);
            }
        }

        function hapusLogo(imgId, iconId, btnHapusId) {
            simpanStateUndo();
            const img = document.getElementById(imgId);
            img.src = '';
            img.style.display = 'none';
            document.getElementById(iconId).style.display = 'block';
            document.getElementById(btnHapusId).style.display = 'none';
            img.closest('.logo-box').classList.remove('has-image');
        }

        function aturUkuranLogo(delta) {
            logoSizeVal += delta;
            if(logoSizeVal < 25) logoSizeVal = 25;
            if(logoSizeVal > 90) logoSizeVal = 90;
            document.getElementById('paperSheet').style.setProperty('--logo-size', logoSizeVal + 'px');
        }

        function pilihElemen(event, el) {
            event.stopPropagation();
            document.querySelectorAll('.selectable-element').forEach(e => e.classList.remove('selected'));
            selectedElement = el;
            el.classList.add('selected');
            el.tabIndex = 0;
            if (!event.target.closest('input,textarea,select,[contenteditable="true"]')) el.focus({preventScroll:true});
            const typeName = el.getAttribute('data-type') || 'Elemen';
            document.getElementById('activeElementLabel').innerText = typeName;
            
            const container = document.getElementById('inspectorTextContainer');
            container.innerHTML = `<div style="font-size:9px; color:#38bdf8; font-weight:600;">Edit Teks Cepat:</div>`;
            const editables = el.querySelectorAll('[contenteditable="true"]');
            if(editables.length > 0) {
                editables.forEach((ed, idx) => {
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.value = ed.innerText;
                    inp.className = 'btn btn-dark';
                    inp.style.width = '100%';
                    inp.style.textAlign = 'left';
                    inp.style.padding = '3px 6px';
                    inp.style.fontSize = '9px';
                    inp.oninput = function() {
                        simpanStateUndo();
                        ed.innerText = inp.value;
                    };
                    container.appendChild(inp);
                });
            } else {
                container.innerHTML += `<div style="font-size:9px; color:#94a3b8;">Tidak ada teks langsung pada elemen ini.</div>`;
            }
        }

        const absenPositionStorageKey = <?php echo json_encode('absen-layout-S1-' . md5($prodi . '|' . $semester . '|' . $kelas)); ?>;

        function simpanPosisiLembarAbsen() {
            const posisi = {};
            document.querySelectorAll('.selectable-element[id]').forEach(el => {
                if (el.style.transform) posisi[el.id] = el.style.transform;
            });
            try { localStorage.setItem(absenPositionStorageKey, JSON.stringify(posisi)); } catch (error) {}
        }

        function pulihkanPosisiLembarAbsen() {
            try {
                const posisi = JSON.parse(localStorage.getItem(absenPositionStorageKey) || '{}');
                Object.entries(posisi).forEach(([id, transform]) => {
                    const el = document.getElementById(id);
                    if (el && el.matches('.selectable-element')) el.style.transform = transform;
                });
            } catch (error) {}
        }

        pulihkanPosisiLembarAbsen();

        document.addEventListener('click', function(e) {
            if(!e.target.closest('.selectable-element') && !e.target.closest('.inspector-panel') && !e.target.closest('#toggleToolbarBtn,#inspectorToggleBtn,#topToolbar')) {
                document.querySelectorAll('.selectable-element').forEach(el => el.classList.remove('selected'));
                selectedElement = null;
                document.getElementById('activeElementLabel').innerText = 'Pilih elemen di lembar kerja...';
                document.getElementById('inspectorTextContainer').innerHTML = `<div style="font-size: 9px; color: #94a3b8;">Klik elemen pada kertas untuk mengedit teksnya di sini.</div>`;
            }
        });

        function ubahPosisiAktif(axis, delta) {
            if(!selectedElement) {
                showCustomModal('Perhatian', 'Silakan klik salah satu blok elemen di lembar kertas terlebih dahulu.');
                return;
            }
            simpanStateUndo();
            const posisi = el => {
                const match = (el.style.transform || '').match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
                return match ? [parseFloat(match[1]), parseFloat(match[2])] : [0, 0];
            };
            const satuBaris = axis === 'y' ? [selectedElement, ...Array.from(selectedElement.parentElement.children).filter(el => {
                if (el === selectedElement) return false;
                const a = selectedElement.getBoundingClientRect();
                const b = el.getBoundingClientRect();
                const overlapVertikal = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                return b.width > 0 && b.height > 0 && overlapVertikal >= Math.min(a.height, b.height) * 0.45;
            })] : [selectedElement];
            satuBaris.forEach(el => {
                let [x, y] = posisi(el);
                if (axis === 'x') x += delta;
                if (axis === 'y') y += delta;
                el.style.transform = `translate(${x}px, ${y}px)`;
            });
            simpanPosisiLembarAbsen();
        }

        document.addEventListener('keydown', function(event) {
            if (typeof tourActive !== 'undefined' && tourActive) return;
            if (!selectedElement || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            if (event.target.closest && event.target.closest('input,textarea,select,a')) return;
            if (event.target.closest && event.target.closest('button') && !event.target.closest('.inspector-panel,#toggleToolbarBtn,#inspectorToggleBtn')) return;
            event.preventDefault();
            const step = event.shiftKey ? 5 : 1;
            if (event.key === 'ArrowUp') ubahPosisiAktif('y', -step);
            if (event.key === 'ArrowDown') ubahPosisiAktif('y', step);
            if (event.key === 'ArrowLeft') ubahPosisiAktif('x', -step);
            if (event.key === 'ArrowRight') ubahPosisiAktif('x', step);
        });

        function resetPosisiAktif() {
            if(selectedElement) {
                simpanStateUndo();
                selectedElement.style.transform = 'translate(0px, 0px)';
                simpanPosisiLembarAbsen();
                showCustomModal('Reset', 'Posisi elemen terpilih dikembalikan ke asal.');
            }
        }

        function resetPosisiSemua() {
            simpanStateUndo();
            aturJarakTandaTangan(72);
            document.querySelectorAll('.selectable-element').forEach(el => {
                el.style.transform = 'translate(0px, 0px)';
            });
            simpanPosisiLembarAbsen();
            logoSizeVal = 45;
            document.getElementById('paperSheet').style.setProperty('--logo-size', '45px');
            showCustomModal('Reset Semua', 'Seluruh posisi tata letak dikembalikan ke pengaturan pabrik.');
        }

        function formatTeksWord(command) {
            simpanStateUndo();
            document.execCommand(command, false, null);
        }

        function formatWarnaTeks(color) {
            simpanStateUndo();
            document.execCommand('foreColor', false, color);
        }

        function tambahSiswa() {
            simpanStateUndo();
            const tbody = document.getElementById('tbodySiswa');
            const rowCount = tbody.rows.length + 1;
            const tr = document.createElement('tr');
            
            let html = `<td class="row-no">${rowCount}</td>`;
            html += `<td><input type="text" value=""></td>`;
            html += `<td><input type="text" value=""></td>`;
            html += `<td style="text-align: left; padding-left: 3px;"><input type="text" value="" style="text-align: left;"></td>`;
            html += `<td style="text-align: center;"><input type="text" value="L"></td>`;
            const totalPertemuan = parseInt(document.getElementById('headerPertemuan').getAttribute('colspan') || '16', 10);
            for(let i=1; i<=totalPertemuan; i++) {
                html += `<td><input class="attendance-cell" type="text" maxlength="1" autocomplete="off" aria-label="Absensi pertemuan ${i}"></td>`;
            }
            html += `<td><input type="text"></td>`;
            tr.innerHTML = html;
            tbody.appendChild(tr);
            perbaruiNomorUrut();
        }

        function hapusSiswa() {
            simpanStateUndo();
            const tbody = document.getElementById('tbodySiswa');
            if(tbody.rows.length > 1) {
                tbody.deleteRow(tbody.rows.length - 1);
                perbaruiNomorUrut();
            } else {
                showCustomModal('Perhatian', 'Baris minimum tersisa 1.');
            }
        }

        function perbaruiNomorUrut() {
            const rows = document.querySelectorAll('#tbodySiswa tr');
            rows.forEach((r, idx) => {
                const noCell = r.querySelector('.row-no');
                if(noCell) noCell.innerText = idx + 1;
            });
        }

        function inisialisasiInputAbsensi() {
            const tbody = document.getElementById('tbodySiswa');
            if(!tbody || tbody.dataset.keyboardReady === '1') return;
            tbody.dataset.keyboardReady = '1';
            tbody.addEventListener('input', function(event) {
                const input = event.target;
                if(!input.matches('.attendance-cell')) return;
                const typed = input.value.toUpperCase();
                const allowed = typed.split('').filter(char => ['.', 'A', 'S', 'I'].includes(char)).slice(-1).join('');
                input.value = allowed;
            });
            tbody.addEventListener('keydown', function(event) {
                const input = event.target;
                if(!input.matches('.attendance-cell')) return;
                const cells = Array.from(input.closest('tr').querySelectorAll('.attendance-cell'));
                const currentIndex = cells.indexOf(input);
                const row = input.closest('tr');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const currentRow = rows.indexOf(row);

                if(event.key === 'Enter' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const next = cells[currentIndex + 1] || rows[currentRow + 1]?.querySelector('.attendance-cell');
                    if(next) { next.focus(); next.select(); }
                    return;
                }
                if(event.key === 'ArrowLeft' && currentIndex > 0) {
                    event.preventDefault();
                    cells[currentIndex - 1].focus();
                    return;
                }
                if((event.key === 'Backspace' || event.key === 'Delete') && input.value === '') {
                    const previous = cells[currentIndex - 1] || rows[currentRow - 1]?.querySelectorAll('.attendance-cell');
                    const target = previous instanceof NodeList ? previous[previous.length - 1] : previous;
                    if(target) { event.preventDefault(); target.focus(); }
                }
            });
        }

        function tambahKolomPertemuan() {
            simpanStateUndo();
            const header = document.getElementById('headerPertemuan');
            let colspan = parseInt(header.getAttribute('colspan') || 16);
            if(colspan >= 24) {
                showCustomModal('Batas Maksimal', 'Batas maksimal kolom pertemuan adalah 24.');
                return;
            }
            colspan++;
            header.setAttribute('colspan', colspan);
            
            const sub = document.getElementById('subHeaderPertemuan');
            const dateCell = document.createElement('th');
            dateCell.className = 'date-entry';
            dateCell.contentEditable = 'true';
            dateCell.innerHTML = '&nbsp;';
            sub.appendChild(dateCell);

            const numberHeader = document.getElementById('numberHeaderPertemuan');
            const numberCell = document.createElement('th');
            numberCell.className = 'meeting-number';
            numberCell.textContent = String(colspan);
            numberHeader.appendChild(numberCell);
            
            const rows = document.querySelectorAll('#tbodySiswa tr');
            rows.forEach(r => {
                // Sisipkan sebelum kolom ket terakhir
                const refCell = r.cells[r.cells.length - 1];
                const newTd = document.createElement('td');
                newTd.innerHTML = `<input class="attendance-cell" type="text" maxlength="1" autocomplete="off" aria-label="Absensi pertemuan ${colspan}">`;
                r.insertBefore(newTd, refCell);
            });
        }

        function hapusKolomPertemuan() {
            simpanStateUndo();
            const header = document.getElementById('headerPertemuan');
            let colspan = parseInt(header.getAttribute('colspan') || 16);
            if(colspan <= 8) {
                showCustomModal('Batas Minimal', 'Batas minimal kolom pertemuan adalah 8.');
                return;
            }
            colspan--;
            header.setAttribute('colspan', colspan);
            
            const sub = document.getElementById('subHeaderPertemuan');
            if(sub.lastElementChild) sub.removeChild(sub.lastElementChild);
            const numberHeader = document.getElementById('numberHeaderPertemuan');
            if(numberHeader.lastElementChild) numberHeader.removeChild(numberHeader.lastElementChild);
            
            const rows = document.querySelectorAll('#tbodySiswa tr');
            rows.forEach(r => {
                if(r.cells.length > colspan + 6) {
                    r.removeChild(r.cells[r.cells.length - 2]);
                }
            });
        }

        // =====================================================================
        // Rekap absensi dan kalkulasi nilai
        // =====================================================================
        function bukaRekapNilai() {
            const tbodyRekap = document.getElementById('tbodyRekapNilai');
            tbodyRekap.innerHTML = '';
            const totalPertemuan = parseInt(document.getElementById('headerPertemuan').getAttribute('colspan') || '16', 10);
            const rows = document.querySelectorAll('#tbodySiswa tr');
            rows.forEach((r, idx) => {
                const no = r.querySelector('.row-no') ? r.querySelector('.row-no').innerText : (idx + 1);
                const inputs = r.querySelectorAll('input');
                const nim = inputs[0] ? inputs[0].value.trim() : '';
                const nama = inputs[2] ? inputs[2].value.trim() : '';
                if (!nama) return;
                let hadirCount = 0, alpaCount = 0, sakitCount = 0, izinCount = 0, totalDiisi = 0;
                r.querySelectorAll('.attendance-cell').forEach(cell => {
                    const val = cell.value.trim().toUpperCase();
                    if (!['.', 'A', 'S', 'I'].includes(val)) return;
                    totalDiisi++;
                    if (val === '.') hadirCount++;
                    else if (val === 'A') alpaCount++;
                    else if (val === 'S') sakitCount++;
                    else if (val === 'I') izinCount++;
                });
                const persentase = totalPertemuan > 0 ? Math.round((hadirCount / totalPertemuan) * 100) : 0;
                const tr = document.createElement('tr');
                tr.dataset.persenHadir = String(persentase);
                tr.dataset.alpaCount = String(alpaCount);
                const addCell = (text, className = '', style = '') => {
                    const cell = document.createElement('td');
                    cell.textContent = text;
                    if (className) cell.className = className;
                    if (style) cell.style.cssText = style;
                    tr.appendChild(cell);
                    return cell;
                };
                addCell(no, 'number-value', 'text-align:center;');
                addCell(nama, 'name-value', 'text-align:left;padding-left:6px;');
                addCell(nim, 'nim-value', 'text-align:center;');
                addCell(hadirCount, 'present-count', 'text-align:center;');
                addCell(alpaCount + sakitCount + izinCount, 'absent-count', 'text-align:center;color:#dc2626;font-weight:bold;').title = `Alpa (A): ${alpaCount}; Sakit (S): ${sakitCount}; Izin (I): ${izinCount}`;
                addCell(sakitCount, 'sakit-count', 'text-align:center;color:#92400e;font-weight:bold;');
                addCell(izinCount, 'izin-count', 'text-align:center;color:#0369a1;font-weight:bold;');
                addCell(totalDiisi, 'filled-count', 'text-align:center;');
                const oldValues = draftNilaiPerNim[nim] || [0, 0, 0, 0, 0];
                const scores = oldValues.length >= 5 ? oldValues : [0, 0, Math.min(25, Number(oldValues[0]) || 0), oldValues[1] || 0, oldValues[2] || 0];
                const inputDefs = [
                    ['Bertanya (jumlah)', 0, 999, 1],
                    ['Aktif atau menambah jawaban, usul, saran (jumlah)', 0, 999, 1],
                    ['Diskusi individu (maksimal 25 poin)', 0, 25, 1],
                    ['UTS (0 sampai 100)', 0, 100, 1],
                    ['UAS (0 sampai 100)', 0, 100, 1]
                ];
                inputDefs.forEach(([label, min, max, step], scoreIndex) => {
                    const cell = document.createElement('td');
                    const input = document.createElement('input');
                    input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step);
                    input.value = String(scores[scoreIndex] ?? 0); input.className = 'activity-input score-input';
                    input.setAttribute('aria-label', label); input.title = label;
                    input.addEventListener('input', () => {
                        if (scoreIndex === 2 && Number(input.value) > 25) input.value = '25';
                        if (Number(input.value) < 0) input.value = '0';
                        draftNilaiPerNim[nim] = Array.from(tr.querySelectorAll('.score-input')).map(scoreInput => scoreInput.value || '0');
                        hitungSkorBaris(input);
                    });
                    cell.appendChild(input); tr.appendChild(cell);
                });
                addCell('0.00', 'skor-akhir', 'text-align:center;font-weight:bold;');
                addCell('E', 'nilai-huruf', 'text-align:center;font-weight:bold;');
                addCell('0', 'angka-mutu', 'text-align:center;');
                tbodyRekap.appendChild(tr);
                hitungSkorBaris(tr.querySelector('.score-input'));
            });
            perbaruiBobotNilai();
            document.getElementById('rekapModalOverlay').classList.add('show');
            document.body.classList.add('modal-open');
        }

        function perbaruiBobotNilai() {
            const absensi = Math.max(0, Number(document.getElementById('bobotAbsensi').value) || 0);
            const aktivitas = Math.max(0, Number(document.getElementById('bobotAktivitas').value) || 0);
            const uts = Math.max(0, Number(document.getElementById('bobotUTS').value) || 0);
            const uas = Math.max(0, Number(document.getElementById('bobotUAS').value) || 0);
            const total = absensi + aktivitas + uts + uas;
            const totalLabel = document.getElementById('totalBobotText');
            totalLabel.textContent = 'Total bobot: ' + total + '%' + (total !== 100 && total > 0 ? ' (dinormalisasi)' : '');
            totalLabel.style.color = total === 100 ? '#34d399' : '#fbbf24';
            document.getElementById('komposisiAbsensi').textContent = absensi + '%';
            document.getElementById('komposisiAktivitas').textContent = aktivitas + '%';
            document.getElementById('komposisiUTS').textContent = uts + '%';
            document.getElementById('komposisiUAS').textContent = uas + '%';
            document.getElementById('komposisiTotal').textContent = total + '%';
            document.querySelectorAll('#tbodyRekapNilai input[type="number"]').forEach(input => hitungSkorBaris(input));
        }

        function hitungSkorBaris(element) {
            const row = element.closest('tr');
            const inputs = row.querySelectorAll('.score-input');
            const bertanya = Math.max(0, Number(inputs[0].value) || 0);
            const aktif = Math.max(0, Number(inputs[1].value) || 0);
            const diskusi = Math.max(0, Math.min(25, Number(inputs[2].value) || 0));
            const aktivitas = Math.min(100, bertanya * 2 + aktif * 3 + diskusi);
            const uts = Math.max(0, Math.min(100, Number(inputs[3].value) || 0));
            const uas = Math.max(0, Math.min(100, Number(inputs[4].value) || 0));
            const persentaseHadir = Math.max(0, Math.min(100, Number(row.dataset.persenHadir) || 0));
            const bobotAbsensi = Math.max(0, Number(document.getElementById('bobotAbsensi').value) || 0);
            const bobotAktivitas = Math.max(0, Number(document.getElementById('bobotAktivitas').value) || 0);
            const bobotUTS = Math.max(0, Number(document.getElementById('bobotUTS').value) || 0);
            const bobotUAS = Math.max(0, Number(document.getElementById('bobotUAS').value) || 0);
            const totalBobot = bobotAbsensi + bobotAktivitas + bobotUTS + bobotUAS;
            let skorAkhir = totalBobot > 0
                ? ((persentaseHadir * bobotAbsensi) + (aktivitas * bobotAktivitas) + (uts * bobotUTS) + (uas * bobotUAS)) / totalBobot
                : 0;
            const alpaVal = parseInt(row.dataset.alpaCount, 10) || 0;
            let nilaiHuruf, angkaMutu;
            if(alpaVal >= 4) {
                skorAkhir = 0;
                nilaiHuruf = 'E';
                angkaMutu = '0';
            } else {
                if(skorAkhir >= 80) { nilaiHuruf = 'A'; angkaMutu = '4'; }
                else if(skorAkhir >= 66) { nilaiHuruf = 'B'; angkaMutu = '3'; }
                else if(skorAkhir >= 56) { nilaiHuruf = 'C'; angkaMutu = '2'; }
                else if(skorAkhir >= 46) { nilaiHuruf = 'D'; angkaMutu = '1'; }
                else { nilaiHuruf = 'E'; angkaMutu = '0'; }
            }
            row.querySelector('.skor-akhir').textContent = skorAkhir.toFixed(2);
            const elHuruf = row.querySelector('.nilai-huruf');
            elHuruf.textContent = nilaiHuruf;
            elHuruf.style.color = nilaiHuruf === 'E' ? '#dc2626' : '#0f172a';
            row.querySelector('.angka-mutu').textContent = angkaMutu;
        }

        function tutupRekapNilai() {
            document.getElementById('rekapModalOverlay').classList.remove('show');
            document.body.classList.remove('modal-open');
        }

        // SINKRONISASI ANTAR-HALAMAN: TOMBOL BARU KIRIM NILAI KE LEMBAR UJIAN
        function simpanKirimNilaiKeLembarUjian() {
            const rows = document.querySelectorAll('#tbodyRekapNilai tr');
            let dataNilaiKirim = [];
            rows.forEach(r => {
                const nim = r.querySelector('.nim-value').innerText;
                const nama = r.querySelector('.name-value').innerText;
                const skorAkhir = r.querySelector('.skor-akhir').innerText;
                const nilaiHuruf = r.querySelector('.nilai-huruf').innerText;
                const angkaMutu = r.querySelector('.angka-mutu').innerText;
                
                dataNilaiKirim.push({
                    nim: nim,
                    nama: nama,
                    skor_akhir: skorAkhir,
                    nilai_huruf: nilaiHuruf,
                    angka_mutu: angkaMutu,
                    alpa: parseInt(r.dataset.alpaCount, 10) || 0
                });
            });

            // Kirim via AJAX / Fetch ke backend session
            fetch('ujian.php?aksi=simpan_nilai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jenjang: 'S1',
                    prodi: <?php echo json_encode($prodi, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>,
                    semester: <?php echo json_encode($semester, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>,
                    kelas: <?php echo json_encode($kelas, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>,
                    bobot: {
                        absensi: document.getElementById('bobotAbsensi').value,
                        aktivitas: document.getElementById('bobotAktivitas').value,
                        uts: document.getElementById('bobotUTS').value,
                        uas: document.getElementById('bobotUAS').value
                    },
                    data_nilai: dataNilaiKirim
                })
            })
            .then(res => {
                if (!res.ok) throw new Error('Layanan penyimpanan tidak tersedia.');
                return res.json();
            })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error(data && data.msg ? data.msg : 'Penyimpanan nilai gagal.');
                showCustomModal('Nilai Berhasil Disimpan', 'Nilai akhir mahasiswa sudah tersimpan untuk prodi, semester, dan kelas ini. Tutup pemberitahuan, kembali ke halaman Data Mahasiswa, lalu buka tombol Lembar Ujian untuk melihat dan mencetak hasilnya.');
            })
            .catch(err => {
                // Fallback jika file endpoint belum ada
                showCustomModal('Gagal Menyimpan', 'Layanan penyimpanan nilai ke halaman ujian belum tersedia. Data pada lembar ini belum tersimpan ke server.');
            });
        }

        function showCustomModal(title, desc) {
            document.getElementById('customModalTitle').innerText = title;
            document.getElementById('customModalDesc').innerText = desc;
            document.getElementById('customModalOverlay').classList.add('show');
        }

        function tutupCustomModal() {
            const nilaiBerhasilDisimpan = document.getElementById('customModalTitle').innerText === 'Nilai Berhasil Disimpan';
            document.getElementById('customModalOverlay').classList.remove('show');
            if (nilaiBerhasilDisimpan) tutupRekapNilai();
        }

        function bukaModalHapusPermanen() {
            document.getElementById('modalHapusPermanen').classList.add('show');
        }

        function tutupModalHapusPermanen() {
            document.getElementById('modalHapusPermanen').classList.remove('show');
        }

        const tourSteps=[
            {target:'#tourLogoBox',title:'1. Pasang logo dari perangkat',desc:'Klik kotak logo kiri atau kanan, lalu pilih gambar JPG atau PNG. Gambar ditampilkan utuh. Tombol Hapus di bawah logo mengosongkan logo tersebut; ukuran logo dapat diatur pada panel Inspektor.'},
            {target:'#sheetHeader',title:'2. Edit kop dan informasi kuliah',example:'<code>Klik teks</code> → <code>Ketik perubahan</code>',desc:'Klik teks pada kertas untuk mengedit kop, semester, mata kuliah, dan nama dosen. Untuk mengedit dari panel, klik blok sampai garis biru muncul, lalu isi kolom teks di Inspektor. Data mahasiswa resmi ditambah atau diedit melalui halaman Data Mahasiswa.'},
            {target:'#tableWrapper',title:'3. Isi 16 pertemuan',example:'<code>.</code> Hadir · <code>A</code> Alpa · <code>S</code> Sakit · <code>I</code> Izin<br><code>Enter</code> Sel berikutnya · <code>Delete</code> Hapus isian',desc:'Masukkan titik, A, S, atau I pada sel pertemuan. Pada rekap, Absen = A + S + I, dengan jumlah sakit dan izin di kolom terpisah. S dan I bukan hadir, tanpa penalti tambahan. Hanya A dihitung alpa; minimal 4 A membuat nilai akhir E. Kolom pertemuan pada lembar absen tetap sama. Tombol Sisip/Hapus Kolom mengubah jumlah pertemuan pada lembar ini.'},
            {target:'#inspectorPanel',title:'4. Geser elemen yang terseleksi',example:'<code>←</code> <code>↑</code> <code>↓</code> <code>→</code><br><code>Shift + panah</code> = 5 px',desc:'Klik blok sampai garis biru muncul. Gunakan tombol X/Y di panel atau tekan/tahan anak panah keyboard. Usap menu atas ke atas dan panel Inspektor ke kanan untuk menyembunyikannya; klik pegangan Menu atau Inspektor untuk membukanya kembali. Atas/bawah menggeser elemen di sampingnya pada baris yang sama; kiri/kanan hanya menggeser elemen terpilih. Saat mengisi kolom input, panah tetap digunakan untuk mengedit isian. Reset Posisi Ini mengembalikan elemen terpilih.'},
            {target:'#signatureSpaceRange',title:'5. Atur ruang tanda tangan',example:'Nama dosen<br><br><br><u>Ruang tanda tangan</u>',desc:'Geser pengaturan Jarak tanda tangan di Inspektor untuk menambah atau mengurangi ruang kosong sebelum nama pada kedua tanda tangan. Pengaturan ini berbeda dari posisi blok: gunakan panah jika ingin memindahkan seluruh blok tanda tangan.'},
            {target:'#tourBtnRekap',title:'6. Buka rekap dan atur penilaian',desc:'Klik Rekap Nilai untuk membuka tabel penuh. Bobot awal: kehadiran 35%, aktivitas 35%, UTS 15%, UAS 15%; semua bobot bisa diedit. Bertanya dihitung 2 poin per kejadian, aktif/menjawab 3 poin, diskusi individu diisi dosen maksimal 25 poin. UTS/UAS diisi 0–100. Nilai awal setiap komponen 0.'},
            {target:'a[href^="ujian.php"]',title:'7. Kirim nilai ke Lembar Ujian',example:'<code>Rekap Nilai</code> → <code>Simpan &amp; Kirim Nilai</code> → <code>Lembar Ujian</code>',desc:'Di dalam rekap, klik Simpan & Kirim Nilai ke Lembar Ujian dan tunggu pemberitahuan berhasil. Setelah itu buka Lembar Ujian langsung, atau kembali melalui Data Mahasiswa. Gunakan sesi browser, prodi, semester, dan kelas yang sama. Nilai tersimpan pada session PHP; edit teks dan logo ujian tersimpan di browser perangkat.'},
            {target:'#paperSize',title:'8. Atur font dan halaman, lalu cetak',example:'<code>Ukuran 1–100 pt</code> · <code>A4 / F4 / Letter</code><br><code>Garis biru = awal halaman berikutnya</code>',desc:'Ketik ukuran font 1 sampai 100 poin atau pilih angka saran; perubahan diterapkan ke teks seluruh lembar. Garis biru bertanda HALAMAN 2, 3, dan seterusnya menunjukkan posisi awal halaman berikutnya pada tampilan kerja. Garis penanda tidak ikut dicetak. Pilih ukuran kertas, orientasi, dan margin sebelum mencetak; periksa tabel dan tanda tangan pada pratinjau.'},
            {target:'#tourBtnTambah',title:'9. Bedakan baris lembar dan data tersimpan',desc:'Sisip Baris dan Hapus Baris hanya mengatur baris pada lembar yang sedang dikerjakan. Gunakan Data Mahasiswa untuk menyimpan mahasiswa ke database. Hapus Permanen membuka pilihan penghapusan data tersimpan: periksa mahasiswa dan konteks kelas sebelum mengonfirmasi karena data yang dihapus tidak dapat dipulihkan dari tombol Undo.'}
        ];

        let tourStep=0, tourActive=false, tourTarget=null, tourReturnFocus=null, tourHiddenPanels=[], tourPanelStates=[];
        function mulaiTurInteraktif() {
            tourReturnFocus=document.activeElement; tourStep=0; tourActive=true;
            tourPanelStates=[...document.querySelectorAll('.top-toolbar,.inspector-panel')].map(el=>({el,flags:['hidden-toolbar','minimized','hidden-panel'].filter(flag=>el.classList.contains(flag))}));
            document.getElementById('tourBackdrop').classList.add('show');
            document.getElementById('tourBubble').style.display='block';
            tampilkanLangkahTour(); document.getElementById('tourNextBtn').focus({preventScroll:true});
        }
        function tutupTurInteraktif() {
            tourHiddenPanels.forEach(({el,visibility})=>el.style.visibility=visibility);tourHiddenPanels=[];
            tourPanelStates.forEach(({el,flags})=>['hidden-toolbar','minimized','hidden-panel'].forEach(flag=>el.classList.toggle(flag,flags.includes(flag))));
            tourActive=false; tourTarget=null;
            document.getElementById('tourBackdrop').classList.remove('show');
            document.getElementById('tourBackdrop').style.clipPath='';
            document.getElementById('tourFocusFrame').style.display='none';
            document.getElementById('tourBubble').style.display='none';
            if(tourReturnFocus&&tourReturnFocus.isConnected)tourReturnFocus.focus({preventScroll:true});
        }
        function posisikanPanduan() {
            if(!tourActive)return;
            const bubble=document.getElementById('tourBubble'),frame=document.getElementById('tourFocusFrame'),backdrop=document.getElementById('tourBackdrop');
            const vw=window.innerWidth,vh=window.innerHeight;
            if(tourTarget){
                const rect=tourTarget.getBoundingClientRect(),left=Math.max(4,rect.left-5),top=Math.max(4,rect.top-5),right=Math.min(vw-4,rect.right+5),bottom=Math.min(vh-4,rect.bottom+5);
                if(right>left&&bottom>top){
                    frame.style.cssText=`display:block;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;`;
                    backdrop.style.clipPath=`polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${left}px ${top}px,${left}px ${bottom}px,${right}px ${bottom}px,${right}px ${top}px,${left}px ${top}px)`;
                    const bw=bubble.offsetWidth,bh=bubble.offsetHeight;
                    let x=left,y=bottom+12;
                    if(y+bh>vh-12){if(top-bh-12>=12)y=top-bh-12;else if(right+bw+12<vw){x=right+12;y=top;}else if(left-bw-12>=12){x=left-bw-12;y=top;}else y=vh-bh-12;}
                    bubble.style.left=Math.max(12,Math.min(x,vw-bw-12))+'px';bubble.style.top=Math.max(12,Math.min(y,vh-bh-12))+'px';return;
                }
            }
            frame.style.display='none';backdrop.style.clipPath='';bubble.style.left='12px';bubble.style.top='12px';
        }
        function tampilkanLangkahTour() {
            tourHiddenPanels.forEach(({el,visibility})=>el.style.visibility=visibility);tourHiddenPanels=[];
            const step=tourSteps[tourStep];tourTarget=document.querySelector(step.target);
            if(innerWidth<=768){
                document.querySelectorAll('.top-toolbar,.toolbar,.inspector-panel,.inspector-toggle-btn,.inspector-toggle,.toolbar-toggle-btn').forEach(el=>{
                    if(el!==tourTarget&&!el.contains(tourTarget)){tourHiddenPanels.push({el,visibility:el.style.visibility});el.style.visibility='hidden';}
                });
            }
            if(tourTarget){
                const toolbar=tourTarget.closest('.top-toolbar');if(toolbar)toolbar.classList.remove('hidden-toolbar');
                if(tourTarget.id==='inspectorPanel'){tourTarget.classList.remove('minimized','hidden-panel');}
                tourTarget.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
            }
            document.getElementById('tourStepBadge').textContent=`Langkah ${tourStep+1} / ${tourSteps.length}`;
            document.getElementById('tourTitle').textContent=step.title;
            document.getElementById('tourDesc').textContent=step.desc;
            const preview=document.getElementById('tourFeaturePreview');preview.replaceChildren();
            const caption=document.createElement('span');caption.className='tour-example-caption';caption.textContent='Contoh tampilan — penjelasan, bukan tombol aktif';preview.appendChild(caption);
            if(step.example){const example=document.createElement('div');example.innerHTML=step.example;preview.appendChild(example);}
            else if(tourTarget){
                const clone=tourTarget.cloneNode(true);
                [clone,...clone.querySelectorAll('*')].forEach(el=>{
                    [...el.attributes].forEach(attr=>{if(attr.name==='id'||attr.name.startsWith('on')||['href','for','contenteditable'].includes(attr.name))el.removeAttribute(attr.name);});
                    el.removeAttribute('style');el.setAttribute('tabindex','-1');
                });
                clone.querySelectorAll('input,.logo-remove,.btn-hapus-logo').forEach(el=>el.remove());
                if(clone.matches('.logo-box,.logo-slot')){
                    const img=clone.querySelector('img');
                    if(!img||!img.getAttribute('src')||img.hidden){clone.replaceChildren();clone.textContent='▣ Pilih logo';}
                }
                preview.appendChild(clone);
            }
            document.getElementById('tourPrevBtn').disabled=tourStep===0;
            document.getElementById('tourNextBtn').textContent=tourStep===tourSteps.length-1?'✓ Selesai':'Selanjutnya →';
            requestAnimationFrame(posisikanPanduan);
        }
        function langkahTurBerikutnya() { if(tourStep<tourSteps.length-1){tourStep++;tampilkanLangkahTour();}else tutupTurInteraktif(); }
        function langkahTurSebelumnya() { if(tourStep>0){tourStep--;tampilkanLangkahTour();} }
        window.addEventListener('resize',posisikanPanduan);
        window.addEventListener('scroll',posisikanPanduan,true);
        document.addEventListener('keydown',event=>{
            if(!tourActive)return;
            if(event.key==='Escape'){event.preventDefault();tutupTurInteraktif();}
            else if(event.key==='ArrowRight'){event.preventDefault();langkahTurBerikutnya();}
            else if(event.key==='ArrowLeft'){event.preventDefault();langkahTurSebelumnya();}
            else if(event.key==='Tab'){
                const controls=[...document.querySelectorAll('#tourBubble button')].filter(el=>!el.disabled&&!el.closest('.tour-feature-preview'));
                const at=controls.indexOf(document.activeElement),next=(at+(event.shiftKey?-1:1)+controls.length)%controls.length;
                event.preventDefault();controls[next].focus();
            }
        });

        function isAndroidWebView() {
            const ua = navigator.userAgent || '';
            return /android/i.test(ua) && (/\bwv\b|; wv\)/i.test(ua) || !navigator.share);
        }

        function bukaDiBrowserAndroid() {
            const url = location.href;
            const intentUrl = 'intent://' + url.replace(/^https?:\/\//i, '') + '#Intent;scheme=https;package=com.android.chrome;end';
            const link = document.createElement('a');
            link.href = intentUrl;
            link.target = '_system';
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
        }

        function tampilkanBantuanAndroid(judul, pesan) {
            document.getElementById('bantuanAndroidEkspor')?.remove();
            const overlay = document.createElement('div');
            overlay.id = 'bantuanAndroidEkspor';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000000;background:#0009;display:grid;place-items:center;padding:16px;font:16px Arial,sans-serif;';
            overlay.innerHTML = `<section style="max-width:440px;width:100%;background:#fff;color:#172033;border-radius:14px;padding:20px;box-shadow:0 16px 48px #0005"><h2 style="margin:0 0 10px;font-size:19px">${judul}</h2><p style="line-height:1.5;margin:0 0 16px">${pesan}</p><button type="button" data-action="browser" style="min-height:44px;padding:10px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:bold">Buka halaman di Chrome</button> <button type="button" data-action="close" style="min-height:44px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172033">Tutup</button></section>`;
            overlay.addEventListener('click', event => {
                if (event.target === overlay || event.target.closest('[data-action="close"]')) overlay.remove();
                if (event.target.closest('[data-action="browser"]')) { bukaDiBrowserAndroid(); overlay.remove(); }
            });
            document.body.appendChild(overlay);
        }

        function cetakDokumen() {
            if (isAndroidWebView()) {
                const bridge = window.Android || window.AndroidInterface;
                if (typeof bridge?.printPage === 'function') { bridge.printPage(); return; }
                if (typeof bridge?.print === 'function') { bridge.print(); return; }
                tampilkanBantuanAndroid('Cetak dari aplikasi Android', 'Aplikasi ini belum meneruskan perintah cetak ke Android. Buka halaman yang sama di Chrome, lalu pilih Cetak atau Simpan sebagai PDF dari menu cetak.');
                return;
            }
            window.print();
        }

        function cloneUntukEkspor(element) {
            const clone = element.cloneNode(true);
            clone.querySelectorAll('button, input[type="file"], .btn-hapus-logo, .page-preview-marker').forEach(el => el.remove());
            clone.querySelectorAll('input').forEach(input => {
                const value = document.createElement('span');
                value.textContent = input.value || '';
                value.style.whiteSpace = 'pre-wrap';
                input.replaceWith(value);
            });
            clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            clone.querySelectorAll('.selectable-element').forEach(el => el.classList.remove('selectable-element', 'selected'));
            return clone;
        }

        function buatDokumenWord(element, title) {
            const clone = cloneUntukEkspor(element);
            const exportTable = clone.matches('table') ? clone : clone.querySelector('table');
            if (exportTable) { exportTable.style.width = '100%'; exportTable.style.minWidth = '0'; exportTable.style.tableLayout = 'fixed'; }
            const bodyContent = clone.outerHTML;
            return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:0}h1{font-size:16pt;margin:0 0 10px}p{margin:5px 0 10px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px}th,td{border:1px solid #111;padding:5px 4px;text-align:center;vertical-align:middle;white-space:normal;overflow-wrap:break-word;font-size:9pt;color:#111}th{font-weight:bold;background:#dbeafe}th.rekap-header-blue{background:#c7dcf5}th.rekap-header-yellow{background:#fff200}tr{page-break-inside:avoid}</style></head><body><h1>${title}</h1>${bodyContent}</body></html>`;
        }

        function buatTabelExcel(element, title) {
            const table = cloneUntukEkspor(element);
            table.setAttribute('width', '1600');
            table.style.width = '1600px'; table.style.tableLayout = 'fixed'; table.style.borderCollapse = 'collapse';
            table.querySelectorAll('colgroup col').forEach(col => { col.setAttribute('width', String(Math.round(parseFloat(col.style.width || '0') * 16)) + 'px'); });
            return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${title}</x:Name><x:WorksheetOptions><x:DisplayGridlines>True</x:DisplayGridlines><x:FitToPage>True</x:FitToPage></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;table-layout:fixed;mso-displayed-decimal-separator:".";mso-displayed-thousand-separator:","}th,td{border:1px solid #000;padding:5px;text-align:center;vertical-align:middle;white-space:normal;word-wrap:break-word;font-size:9pt;mso-number-format:"\@"}th{font-weight:bold;background:#dbeafe}th.rekap-header-blue{background:#c7dcf5}th.rekap-header-yellow{background:#fff200}tr{page-break-inside:avoid}</style></head><body>${table.outerHTML}</body></html>`;
        }

        async function unduhFileTeks(content, mimeType, filename) {
            const blob = new Blob(['\ufeff', content], { type: mimeType });
            if (isAndroidWebView()) {
                if (typeof File === 'function' && navigator.share && navigator.canShare) {
                    try {
                        const file = new File([blob], filename, { type: mimeType.split(';')[0] });
                        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
                    } catch (error) { if (error?.name === 'AbortError') return; }
                }
                const bridge = window.Android || window.AndroidInterface;
                if (typeof bridge?.saveFile === 'function') {
                    const reader = new FileReader();
                    reader.onload = () => bridge.saveFile(filename, mimeType, String(reader.result).split(',')[1]);
                    reader.readAsDataURL(blob);
                    return;
                }
                tampilkanBantuanAndroid('Simpan berkas dari aplikasi Android', 'Aplikasi ini belum mengaktifkan fitur unduh atau berbagi berkas. Buka halaman yang sama di Chrome, lalu tekan tombol Word atau Excel kembali untuk menyimpan berkas.');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function exportWord() {
            const content = buatDokumenWord(document.getElementById('paperSheet'), 'Lembar Absen');
            unduhFileTeks(content, 'application/msword;charset=utf-8', 'Lembar_Absen_S1_<?php echo htmlspecialchars($kelas); ?>_Semester_<?php echo htmlspecialchars($semester); ?>.doc');
        }

        function exportExcel() {
            const html = buatTabelExcel(document.getElementById('tabelAbsen'), 'Absensi');
            unduhFileTeks(html, 'application/vnd.ms-excel;charset=utf-8', 'Absensi_S1_<?php echo htmlspecialchars($kelas); ?>_Semester_<?php echo htmlspecialchars($semester); ?>.xls');
        }

        function siapkanCetakRekap() {
            const recap=document.getElementById('rekapModalOverlay').classList.contains('show');
            document.body.classList.toggle('cetak-rekap',recap);
            let settings=document.getElementById('rekapPrintSettings');
            if(!settings){settings=document.createElement('style');settings.id='rekapPrintSettings';settings.media='print';document.head.appendChild(settings);}
            settings.textContent=recap?'@page { size:A4 landscape; margin:10mm; }':'';
        }
        function selesaiCetakRekap() {
            document.body.classList.remove('cetak-rekap');
            const settings=document.getElementById('rekapPrintSettings');if(settings)settings.textContent='';
        }
        window.addEventListener('beforeprint',siapkanCetakRekap);
        window.addEventListener('afterprint',selesaiCetakRekap);
        function cetakRekap() {
            siapkanCetakRekap();
            cetakDokumen();
        }

        function exportWordRekap() {
            const content = buatDokumenWord(document.getElementById('tabelRekapNilai'), 'Rekap Nilai S1 — <?php echo htmlspecialchars($kelas_lama . ' / ' . $semester_lama, ENT_QUOTES); ?>');
            unduhFileTeks(content, 'application/msword;charset=utf-8', 'Rekap_Nilai_S1_<?php echo htmlspecialchars($kelas); ?>_Semester_<?php echo htmlspecialchars($semester); ?>.doc');
        }

        function exportExcelRekap() {
            const html = buatTabelExcel(document.getElementById('tabelRekapNilai'), 'Rekap Nilai');
            unduhFileTeks(html, 'application/vnd.ms-excel;charset=utf-8', 'Rekap_Nilai_S1_<?php echo htmlspecialchars($kelas); ?>_Semester_<?php echo htmlspecialchars($semester); ?>.xls');
        }

        function inisialisasiEventEditable() {
            inisialisasiInputAbsensi();
            document.querySelectorAll('[contenteditable="true"]').forEach(el => {
                el.addEventListener('input', function() {
                    simpanStateUndo();
                });
            });
        }

        document.addEventListener('DOMContentLoaded', function() {
            inisialisasiEventEditable();
        });
    </script>
</body>
</html>
