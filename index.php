<?php
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Penanganan aman koneksi agar tidak memicu HTTP ERROR 500 jika file tidak ditemukan
if (file_exists('koneksi.php')) {
    @include_once 'koneksi.php';
}
if (isset($koneksi) && $koneksi instanceof mysqli) {
    $conn = $koneksi;
} elseif (isset($conn) && $conn instanceof mysqli) {
    // Fallback koneksi
} else {
    $conn = null;
}

// --- KONFIGURASI STATUS WEB & LOG LOGIN ---
$statusFile = 'web_status.json';
if (!file_exists($statusFile)) {
    file_put_contents($statusFile, json_encode(['access' => 'private']));
}
$webStatusData = json_decode(file_get_contents($statusFile), true);
$currentWebStatus = $webStatusData['access'] ?? 'private';
$logFile = 'login_logs.json';
$configFile = 'admin_config.json';

// --- CONFIG DEFAULT GLOBAL ---
$globalConfig = [
    'admin_name' => 'M.Fadillah',
    'admin_role' => 'Administrator Utama',
    'admin_avatar' => 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user-tie.svg',
    'app_title' => 'Database & Absensi'
];
if (file_exists($configFile)) {
    $loadedConfig = json_decode(file_get_contents($configFile), true);
    if ($loadedConfig) {
        $globalConfig = array_merge($globalConfig, $loadedConfig);
    }
}

// --- API PENGATURAN TEMA KE SESSION ---
if (isset($_POST['set_theme_session'])) {
    $allowedThemes = ['malam', 'putih', 'samudra', 'senja'];
    $requestedTheme = trim((string)($_POST['theme_name'] ?? 'malam'));
    if (in_array($requestedTheme, $allowedThemes, true)) {
        $_SESSION['theme'] = $requestedTheme;
    }
    echo json_encode(['status' => 'success']);
    exit;
}

// --- API UBAH STATUS WEB (PRIVAT/PUBLIK) ---
if (isset($_POST['toggle_web_status'])) {
    $newStatus = $_POST['new_status'];
    file_put_contents($statusFile, json_encode(['access' => $newStatus]));
    echo json_encode(['status' => 'success', 'new' => $newStatus]);
    exit;
}

// --- API AMBIL RIWAYAT LOGIN ---
if (isset($_POST['get_login_logs'])) {
    $logs = file_exists($logFile) ? json_decode(file_get_contents($logFile), true) : [];
    echo json_encode(array_reverse($logs));
    exit;
}

// --- API LOGOUT MANDIRI ANTI-404 ---
if (isset($_POST['action']) && $_POST['action'] === 'logout_system') {
    session_unset();
    session_destroy();
    echo json_encode(['status' => 'success']);
    exit;
}

// --- API SUNTING PROFIL KUSTOM DINAMIS ---
if (isset($_POST['action']) && $_POST['action'] === 'update_profile') {
    $newName = trim($_POST['admin_name'] ?? '');
    $newRole = trim($_POST['admin_role'] ?? '');
    $newAvatar = $_POST['admin_avatar'] ?? '';
    
    $currentConfig = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : $globalConfig;
    if (!empty($newName)) $currentConfig['admin_name'] = $newName;
    if (!empty($newRole)) $currentConfig['admin_role'] = $newRole;
    if (!empty($newAvatar)) $currentConfig['admin_avatar'] = $newAvatar;
    
    file_put_contents($configFile, json_encode($currentConfig));
    
    // Perbarui session jika yang aktif adalah user tersebut
    if (isset($_SESSION['nama_user'])) {
        $_SESSION['nama_user'] = $currentConfig['admin_name'];
        $_SESSION['role'] = $currentConfig['admin_role'];
    }
    
    echo json_encode(['status' => 'success', 'msg' => 'Profil identitas berhasil diperbarui!', 'data' => $currentConfig]);
    exit;
}

// --- SISTEM AUTENTIKASI KETAT PRIVAT (M.FADILLAH / ZEN) ---
if (isset($_POST['action']) && $_POST['action'] === 'login_privat') {
    $user = trim($_POST['username'] ?? '');
    $pass = trim($_POST['password'] ?? '');
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
    $date = date('Y-m-d H:i:s');
    
    $webStatusDataCurrent = json_decode(file_get_contents($statusFile), true);
    $webStatus = $webStatusDataCurrent['access'] ?? 'private';
    $login_success = false;
    $role_assigned = '';
    $id_assigned = '';
    $name_assigned = '';
    
    // Validasi Hardcode Absolut
    if (($user === 'M.Fadillah' || $user === 'Fall') && $pass === '28032004Dill') {
        $login_success = true;
        $role_assigned = 'Administrator Utama';
        $id_assigned = 'admin_01';
        $name_assigned = 'M.Fadillah';
    } elseif ($user === 'Zen' && $pass === '111315Zen') {
        $login_success = true;
        $role_assigned = 'Dosen';
        $id_assigned = 'dosen_01';
        $name_assigned = 'Zen';
    }
    
    if ($login_success) {
        // Ikat Murni ke Session Format Teks/String
        $_SESSION['id_user'] = (string)$id_assigned;
        $_SESSION['nama_user'] = (string)$name_assigned;
        $_SESSION['role'] = (string)$role_assigned;
        
        // Catat Log Login
        $logs = file_exists($logFile) ? json_decode(file_get_contents($logFile), true) : [];
        $logs[] = [
            'nama' => $name_assigned,
            'role' => $role_assigned,
            'ip' => $ip,
            'waktu' => $date
        ];
        if(count($logs) > 50) array_shift($logs); 
        file_put_contents($logFile, json_encode($logs));
        
        echo json_encode(['status' => 'success', 'msg' => 'Autentikasi Berhasil!', 'user' => $name_assigned, 'role' => $role_assigned]);
        exit;
    } else {
        if ($webStatus === 'public') {
            if ($user !== '') {
                $_SESSION['id_user'] = 'guest_' . time();
                $_SESSION['nama_user'] = (string)$user;
                $_SESSION['role'] = 'Publik';
                echo json_encode(['status' => 'success', 'msg' => 'Masuk sebagai Tamu Publik', 'user' => $user]);
                exit;
            }
        }
        echo json_encode(['status' => 'error', 'msg' => 'Kredensial Salah atau Akses Ditolak!']);
        exit;
    }
}

// Cek apakah user sudah login
$is_logged_in = isset($_SESSION['id_user']) && isset($_SESSION['nama_user']);
$allowedThemes = ['malam', 'putih', 'samudra', 'senja'];
$active_theme = $_SESSION['theme'] ?? 'malam';
if (!in_array($active_theme, $allowedThemes, true)) $active_theme = 'malam';
$form_context = $_SESSION['konteks_siswa'] ?? ['jenjang' => 'S1', 'kelas' => 'A', 'prodi' => 'Pendidikan Teknologi Informasi', 'semester' => '1'];
$prodi_options = [
    'Pendidikan Teknologi Informasi',
    'Pendidikan Guru Sekolah Dasar',
    'Pendidikan Jasmani Kesehatan dan Rekreasi',
    'Pendidikan Bahasa dan Sastra Indonesia',
    'Pendidikan Sejarah',
    'Pendidikan Bahasa Inggris'
];
if (!in_array($form_context['prodi'] ?? '', $prodi_options, true)) $form_context['prodi'] = $prodi_options[0];
$saved_class = preg_replace('/^Kelas\s+/i', '', trim((string)($form_context['kelas'] ?? 'A')));
$form_context['kelas'] = in_array(strtoupper($saved_class), ['A', 'B', 'C', 'D', 'E'], true) ? strtoupper($saved_class) : 'A';
$saved_semester = preg_replace('/^Semester\s+/i', '', trim((string)($form_context['semester'] ?? '1')));
$form_context['semester'] = ctype_digit($saved_semester) && (int)$saved_semester >= 1 && (int)$saved_semester <= 8 ? (string)(int)$saved_semester : '1';
?>
<!DOCTYPE html>
<html lang="id" data-theme="<?php echo htmlspecialchars($active_theme); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer-when-downgrade">
    <title id="appTitleText"><?php echo htmlspecialchars($globalConfig['app_title']); ?> Terpadu</title>
    
    <script>
        window.SERVER_CONFIG = {
            adminName: "<?php echo addslashes($globalConfig['admin_name']); ?>",
            adminRole: "<?php echo addslashes($globalConfig['admin_role']); ?>",
            adminAvatar: "<?php echo addslashes($globalConfig['admin_avatar']); ?>",
            appTitle: "<?php echo addslashes($globalConfig['app_title']); ?>",
            isLoggedIn: <?php echo $is_logged_in ? 'true' : 'false'; ?>
        };
    </script>
    
    <script src="assets/app-audio.js" defer></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    
    <style>
        select, .form-control select {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 12px center;
            background-size: 16px;
            padding-right: 40px !important;
            cursor: pointer;
        }
        select option, [data-theme="malam"] select option, .form-group select option, select.form-control option {
            color: #ffffff !important;
            background-color: #0f172a !important;
            text-shadow: none !important;
            padding: 10px;
        }
        [data-theme="putih"] select option { color: #0f172a !important; background-color: #ffffff !important; }
        [data-theme="samudra"] select option { color: #f0f9ff !important; background-color: #082f49 !important; }
        [data-theme="senja"] select option { color: #fff1f2 !important; background-color: #4c0519 !important; }
        
        :root, html[data-theme="malam"] {
            --bg-gradient: linear-gradient(-45deg, #0f172a, #1e1b4b, #0f172a);
            --card-bg: rgba(15, 23, 42, 0.9);
            --card-border: rgba(255, 255, 255, 0.1);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --input-bg: rgba(255, 255, 255, 0.05);
            --input-border: rgba(255, 255, 255, 0.15);
            --primary: #3b82f6;
            --primary-hover: #2563eb;
            --sidebar-bg: rgba(15, 23, 42, 0.95);
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
            --sidebar-bg: rgba(255, 255, 255, 0.98);
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
            --sidebar-bg: rgba(8, 47, 73, 0.95);
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
            --sidebar-bg: rgba(76, 5, 25, 0.95);
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        body {
            background: var(--bg-gradient); background-size: 400% 400%;
            color: var(--text-main);
            min-height: 100vh; display: flex; justify-content: center; align-items: center;
            overflow-x: hidden; position: relative;
        }
        @keyframes gradientBG { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        
        /* Kanvas Animasi Partikel Melayang */
        #particleCanvas {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; z-index: 1;
        }
        body.has-custom-wallpaper #particleCanvas { display: none; }
        
        .toast-container { position: fixed; top: 20px; left: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; }
        .toast {
            background: var(--card-bg); backdrop-filter: blur(10px); border-left: 4px solid var(--primary);
            padding: 15px 20px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            color: var(--text-main); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 12px;
            transform: translateX(-120%); opacity: 0; transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .toast.show { transform: translateX(0); opacity: 1; }
        .toast.error { border-left-color: #ef4444; }
        .toast.success { border-left-color: #10b981; }
        
        #authOverlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: var(--bg-gradient); background-size: 400% 400%;
            z-index: 9999; display: flex; justify-content: center; align-items: center;
            transition: opacity 0.4s ease, visibility 0.4s ease;
        }
        .auth-card { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 24px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); text-align: center; }
        
        .top-nav { position: fixed; top: 20px; right: 20px; z-index: 1000; display: flex; gap: 10px; align-items: center; }
        .user-profile-btn { background: var(--card-bg); backdrop-filter: blur(10px); border: 1px solid var(--card-border); color: var(--text-main); padding: 8px 16px; border-radius: 50px; cursor: pointer; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .user-profile-btn:hover { border-color: var(--primary); transform: translateY(-2px); }
        
        /* Widget Statis Kiri Bawah */
        .admin-widget { position: fixed; bottom: 20px; left: 20px; background: var(--card-bg); backdrop-filter: blur(10px); border: 1px solid var(--card-border); padding: 10px 14px; border-radius: 14px; display: flex; align-items: center; gap: 12px; z-index: 990; box-shadow: 0 5px 15px rgba(0,0,0,0.2); opacity: 0.9; cursor: pointer; transition: all 0.3s ease; }
        .admin-widget:hover { opacity: 1; transform: translateY(-3px); border-color: var(--primary); }
        .admin-avatar-small { width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--primary); object-fit: cover; flex-shrink: 0; background: var(--input-bg); }
        .admin-info-small h5 { font-size: 12px; color: var(--text-main); margin-bottom: 2px; font-weight: 700; }
        .admin-info-small p { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
        .badge-admin { background: #10b981; color: white; padding: 1px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; }
        
        /* Modal Pop-up Menu Pengaturan */
        .custom-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 3000; display: none; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s ease; }
        .custom-modal.active { display: flex; opacity: 1; }
        .modal-content { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 30px; width: 90%; max-width: 450px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); text-align: left; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--card-border); padding-bottom: 10px; }
        .modal-header h3 { font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
        .modal-close { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; }
        .modal-close:hover { color: #ef4444; }
        .avatar-preview-container { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }
        .avatar-preview { width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--primary); object-fit: cover; }
        
        .sidebar {
            position: fixed; top: 0; right: -400px; width: 380px; height: 100vh;
            background: var(--sidebar-bg); backdrop-filter: blur(25px);
            border-left: 1px solid var(--card-border); z-index: 2000;
            transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            padding: 25px 20px; display: flex; flex-direction: column; overflow-y: auto;
        }
        .sidebar.active { right: 0; }
        .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--card-border); padding-bottom: 12px; }
        .sidebar-header h3 { font-size: 16px; display: flex; align-items: center; gap: 8px; color: var(--text-main); }
        .close-sidebar { background: none; border: none; color: var(--text-main); font-size: 20px; cursor: pointer; flex-shrink: 0; }
        .close-sidebar:hover { color: #ef4444; }
        
        .menu-section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin: 15px 0 8px 5px; font-weight: 700; }
        
        .menu-item { padding: 12px 15px; border-radius: 12px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.03); font-size: 13px; color: var(--text-main); border: 1px solid transparent; }
        .menu-item:hover { background: rgba(255,255,255,0.08); border-color: var(--card-border); transform: translateX(-4px); }
        .menu-item i { width: 20px; text-align: center; color: var(--primary); font-size: 16px; flex-shrink: 0; }
        
        /* Modul Dosen Khusus */
        .menu-item.modul-dosen { background: linear-gradient(45deg, rgba(16,185,129,0.1), rgba(5,150,105,0.1)); border-color: rgba(16,185,129,0.3); }
        .menu-item.modul-dosen:hover { border-color: #10b981; transform: translateX(-4px); }
        .menu-item.modul-dosen i { color: #10b981; }
        
        .toggle-container { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 8px; }
        .toggle-label { font-size: 13px; color: var(--text-main); display: flex; align-items: center; gap: 12px; }
        .toggle-label i { color: #f59e0b; width: 20px; text-align: center; }
        .switch { position: relative; display: inline-block; width: 40px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ef4444; transition: .4s; border-radius: 20px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #10b981; }
        input:checked + .slider:before { transform: translateX(20px); }
        
        .log-box { background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); border-radius: 12px; padding: 10px; max-height: 150px; overflow-y: auto; margin-top: 10px; }
        .log-item { font-size: 11px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-muted); display:flex; justify-content:space-between; align-items:center;}
        .log-item:last-child { border-bottom: none; }
        .log-user { color: var(--primary); font-weight: bold; }
        
        .theme-selector { margin-top: 15px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 15px; border: 1px solid var(--card-border); }
        .theme-selector p { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; font-weight: 700; text-align: center; }
        .theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .theme-btn { padding: 10px; border: 1px solid var(--card-border); border-radius: 10px; background: var(--input-bg); color: var(--text-main); cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; justify-content: center;}
        .theme-btn:hover { background: var(--primary); border-color: var(--primary); color: white; transform: scale(1.03); }
        
        .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 1500; display: none; opacity: 0; transition: opacity 0.3s; }
        .overlay.active { display: block; opacity: 1; }
        
        .form-group { margin-bottom: 15px; text-align: left; }
        .form-group label { display: block; font-size: 11px; font-weight: 700; margin-bottom: 6px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .form-control { width: 100%; padding: 12px 15px; border-radius: 12px; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); font-size: 13px; outline: none; }
        .form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
        
        .btn-submit { width: 100%; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 10px; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .btn-submit:hover { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        
        .main-card { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border); border-radius: 24px; padding: 35px; width: 100%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); z-index: 10; position: relative; }
        
        /* --- EFEK ANIMASI INTRO SCIFI SINEMATIK --- */
        #introOverlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #000000; z-index: 10000; display: flex; justify-content: center; align-items: center; opacity: 0; visibility: hidden; transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.8s; }
        #introOverlay.active { opacity: 1; visibility: visible; }
        .intro-content { text-align: center; font-family: 'Plus Jakarta Sans', sans-serif; position: relative; }
        .logo-glow { width: 80px; height: 80px; background: transparent; border: 2px solid var(--primary); border-radius: 50%; margin: 0 auto 20px auto; opacity: 0; transform: scale(0.5); transition: all 1s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 0 30px var(--primary), inset 0 0 20px var(--primary); display: flex; justify-content: center; align-items: center; }
        .logo-glow::after { content: '\f023'; font-family: 'Font Awesome 6 Free'; font-weight: 900; color: var(--primary); font-size: 30px; text-shadow: 0 0 10px var(--primary); transition: content 0.3s; }
        .intro-content.show-text .logo-glow { opacity: 1; transform: scale(1); }
        .intro-content.show-text .logo-glow::after { content: '\f09c'; }
        .intro-text-1 { font-size: 24px; color: #ffffff; letter-spacing: 4px; font-weight: 800; margin-bottom: 8px; opacity: 0; transform: translateY(20px) scale(0.95); transition: opacity 1s ease 0.3s, transform 1s ease 0.3s; text-shadow: 0 0 15px rgba(255,255,255,0.5); }
        .intro-text-2 { font-size: 14px; color: var(--primary); font-weight: 600; letter-spacing: 1.5px; opacity: 0; transform: translateY(15px); transition: opacity 1s ease 0.6s, transform 1s ease 0.6s; text-shadow: 0 0 10px var(--primary); }
        .intro-content.show-text .intro-text-1, .intro-content.show-text .intro-text-2 { opacity: 1; transform: translateY(0) scale(1); }
        
        @media screen and (max-width: 768px) {
            .main-card { padding: 25px 20px; width: 92%; border-radius: 18px; margin-top: 50px; }
            .sidebar { width: 100%; right: -100%; padding: 20px 15px; }
            .auth-card { padding: 25px 20px; width: 92%; margin: 10px; }
        }
    </style>
</head>
<body>
    <!-- KANVAS PARTIKEL MELAYANG -->
    <canvas id="particleCanvas"></canvas>
    
    <div class="toast-container" id="toastContainer"></div>
    
    <!-- OVERLAY ANIMASI INTRO SCIFI -->
    <div id="introOverlay">
        <div class="intro-content" id="introContent">
            <div class="logo-glow"></div>
            <div class="intro-text-1">AKSES DITERIMA</div>
            <div class="intro-text-2" id="introGreeting">Mempersiapkan Sistem...</div>
        </div>
    </div>
    
    <!-- OVERLAY LOGIN PRIVAT STANDALONE -->
    <div id="authOverlay">
        <div class="auth-card">
            <div style="margin-bottom: 25px;">
                <h2 style="font-size: 22px; margin-bottom: 5px; color: var(--primary);"><i class="fa-solid fa-lock"></i> Autentikasi Privat</h2>
                <p style="font-size: 12px; color: var(--text-muted);">Sistem Standalone Eksklusif (Hanya Akses Dosen & Admin)</p>
            </div>
            
            <div id="formLoginAuth">
                <div class="form-group">
                    <label>NAMA</label>
                    <input type="text" id="authLogName" class="form-control" placeholder="Masukkan Nama...">
                </div>
                <div class="form-group">
                    <label>PASSWORD</label>
                    <input type="password" id="authLogPass" class="form-control" placeholder="••••••••">
                </div>
                <button type="button" class="btn-submit" onclick="processAuthPrivate()">Buka Kunci Sistem <i class="fa-solid fa-key"></i></button>
            </div>
        </div>
    </div>
    
    <!-- MODAL POP-UP MENU PENGATURAN (POJOK KANAN ATAS) -->
    <div class="custom-modal" id="profileModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fa-solid fa-user-gear" style="color:var(--primary);"></i> Menu Pengaturan</h3>
                <button class="modal-close" onclick="closeProfileModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="avatar-preview-container">
                <img id="previewAvatarImg" src="<?php echo htmlspecialchars($globalConfig['admin_avatar']); ?>" class="avatar-preview" alt="Avatar">
                <div>
                    <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">GANTI FOTO PROFIL</label>
                    <input type="file" id="uploadAvatarFile" accept="image/*" onchange="handleAvatarUpload(event)" style="font-size: 11px; color: var(--text-main);">
                </div>
            </div>
            <div class="form-group">
                <label>Nama Lengkap Pengguna</label>
                <input type="text" id="editAdminName" class="form-control" value="<?php echo htmlspecialchars($globalConfig['admin_name']); ?>">
            </div>
            <div class="form-group">
                <label>Jabatan / Role Sistem</label>
                <input type="text" id="editAdminRole" class="form-control" value="<?php echo htmlspecialchars($globalConfig['admin_role']); ?>">
            </div>
            <div class="form-group">
                <label>Ganti Wallpaper Background</label>
                <input type="file" id="uploadBgFile" accept="image/*" onchange="handleBgUpload(event)" class="form-control" style="font-size: 11px;">
                <div style="margin-top: 10px;">
                    <label for="bgFitMode" style="font-size:11px;font-weight:700;display:block;margin-bottom:5px;">Ukuran wallpaper</label>
                    <select id="bgFitMode" class="form-control" onchange="updateBgWallpaperSizing()">
                        <option value="cover">Otomatis memenuhi layar</option>
                        <option value="contain">Tampilkan seluruh foto</option>
                        <option value="auto">Ukuran asli (hindari pembesaran)</option>
                        <option value="manual">Ukuran manual</option>
                    </select>
                    <div id="bgManualScaleWrap" style="display:none;margin-top:8px;">
                        <label for="bgScaleRange" style="font-size:11px;display:flex;justify-content:space-between;">Skala <span id="bgScaleValue">100%</span></label>
                    <input type="range" id="bgScaleRange" min="1" max="200" step="1" value="100" oninput="updateBgWallpaperSizing()" style="width:100%;min-height:32px;">
                    </div>
                    <div style="margin-top:8px;">
                        <label for="bgPositionX" style="font-size:11px;display:flex;justify-content:space-between;">Geser kiri / kanan <span id="bgPositionXValue">50%</span></label>
                        <input type="range" id="bgPositionX" min="0" max="100" value="50" oninput="updateBgWallpaperPosition()" style="width:100%;min-height:32px;">
                        <label for="bgPositionY" style="font-size:11px;display:flex;justify-content:space-between;margin-top:4px;">Geser atas / bawah <span id="bgPositionYValue">50%</span></label>
                        <input type="range" id="bgPositionY" min="0" max="100" value="50" oninput="updateBgWallpaperPosition()" style="width:100%;min-height:32px;">
                    </div>
                    <small id="bgQualityHint" style="display:block;margin-top:6px;font-size:10px;color:var(--text-muted);line-height:1.45;">Foto disimpan pada resolusi aslinya. Gambar beresolusi rendah tidak dapat dibuat lebih tajam; mode ukuran asli mencegah pembesaran tambahan.</small>
                </div>
                <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;gap:8px;">
                    <span style="font-size: 10px; color: var(--text-muted);">Format: JPG, PNG, WEBP</span>
                    <button type="button" onclick="removeBgWallpaper()" style="background: none; border: none; color: #ef4444; font-size: 11px; font-weight: bold; cursor: pointer;min-height:38px;"><i class="fa-solid fa-trash-can"></i> Hapus Wallpaper</button>
                </div>
            </div>
            <div class="form-group" style="padding:12px;border:1px solid var(--card-border);border-radius:12px;background:rgba(0,0,0,.04);">
                <label>Efek suara tombol</label>
                <select id="uiSoundEffect" class="form-control" onchange="simpanAudioAntarmuka()">
                    <option value="1">1 · Klik lembut</option><option value="2">2 · Nada ganda</option><option value="3">3 · Pop</option><option value="4">4 · Denting</option><option value="5">5 · Geser</option><option value="6">6 · Arpeggio</option>
                </select>
                <label for="uiSoundVolume" style="font-size:11px;display:flex;justify-content:space-between;margin-top:9px;">Volume <span id="uiSoundVolumeValue">25%</span></label>
                <input id="uiSoundVolume" type="range" min="0" max="100" value="25" oninput="simpanAudioAntarmuka()" style="width:100%;min-height:32px;">
                <label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;margin-top:8px;"><input id="uiSoundMuted" type="checkbox" onchange="simpanAudioAntarmuka()"> Senyapkan efek suara</label>
                <button type="button" data-no-click-sound onclick="previewEfekSuara()" class="form-control" style="margin-top:8px;cursor:pointer;"><i class="fa-solid fa-volume-high"></i> Coba efek terpilih</button>
                <small style="display:block;margin-top:5px;font-size:10px;color:var(--text-muted);">Pilihan dan volume berlaku sama di semua halaman.</small>
            </div>
            <div class="form-group" style="padding:12px;border:1px solid var(--card-border);border-radius:12px;background:rgba(0,0,0,.04);">
                <label>Musik tanpa iklan di pemutar arsip</label>
                <p style="font-size:11px;color:var(--text-muted);line-height:1.5;margin:0 0 8px;">Cari audio pada Internet Archive. Pemutar terpisah menjaga musik tetap berjalan saat halaman ini berpindah, selama jendela pemutar dibiarkan terbuka.</p>
                <button type="button" onclick="bukaPemutarMusik()" class="form-control" style="cursor:pointer;"><i class="fa-solid fa-music"></i> Buka pemutar musik</button>
            </div>
            <button type="button" class="btn-submit" onclick="saveProfileChanges()">Simpan Perubahan Pengaturan <i class="fa-solid fa-floppy-disk"></i></button>
        </div>
    </div>
    
    <!-- MODAL MODUL KERJA PENGARAH -->
    <div class="custom-modal" id="featureModal">
        <div class="modal-content" style="text-align: center;">
            <div style="font-size: 40px; color: #10b981; margin-bottom: 15px;"><i class="fa-solid fa-screwdriver-wrench"></i></div>
            <h3 id="modalFeatureTitle" style="font-size: 18px; margin-bottom: 10px; color: var(--text-main);">Modul Asisten AI</h3>
            <p id="modalFeatureDesc" style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px;">Maaf, fitur premium Asisten AI Pengajar ini masih dalam tahap pengembangan atau akan segera hadir!</p>
            <button type="button" class="btn-submit" onclick="closeFeatureModal()" style="background: #10b981;">Mengerti & Tutup</button>
        </div>
    </div>
    
    <!-- WIDGET PROFIL KIRI BAWAH (STATIS ESTETIK) -->
    <div class="admin-widget" id="adminWidget" title="Profil Pengguna Aktif">
        <img id="widgetAvatarImg" src="<?php echo htmlspecialchars($globalConfig['admin_avatar']); ?>" class="admin-avatar-small" alt="Avatar">
        <div class="admin-info-small">
            <h5 id="widgetAdminName"><?php echo htmlspecialchars($globalConfig['admin_name']); ?></h5>
            <p><span id="widgetAdminRole"><?php echo htmlspecialchars($globalConfig['admin_role']); ?></span> <span class="badge-admin">Verified</span></p>
        </div>
    </div>
    
    <!-- TOMBOL NAVIGASI POJOK KANAN ATAS -->
    <div class="top-nav">
        <button class="user-profile-btn" onclick="openProfileModal()" title="Buka Menu Pengaturan">
            <img id="topNavAvatarImg" src="<?php echo htmlspecialchars($globalConfig['admin_avatar']); ?>" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--primary);" alt="Avatar">
            <span id="currentUserNameText"><?php echo $_SESSION['nama_user'] ?? $globalConfig['admin_name']; ?></span>
            <i class="fa-solid fa-gear" style="margin-left: 5px;"></i>
        </button>
        <button class="user-profile-btn" onclick="toggleSidebar()" title="Pusat Kendali">
            <i class="fa-solid fa-bars-staggered"></i>
        </button>
    </div>
    
    <!-- SIDEBAR PENGATURAN & MODUL DOSEN -->
    <div class="overlay" id="overlay" onclick="closeSidebar()"></div>
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <h3><i class="fa-solid fa-gears" style="color: var(--primary);"></i> Pusat Kendali</h3>
            <button class="close-sidebar" onclick="closeSidebar()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="sidebarMenuList">
            
            <!-- TOGGLE STATUS WEB -->
            <div class="menu-section-title">Keamanan Akses Web</div>
            <div class="toggle-container">
                <div class="toggle-label"><i class="fa-solid fa-earth-asia"></i> Akses Publik</div>
                <label class="switch">
                    <input type="checkbox" id="webStatusToggle" onchange="toggleWebStatus()" <?php echo $currentWebStatus === 'public' ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="menu-section-title">Modul Kerja Pengajar</div>
            <div class="menu-item modul-dosen" onclick="showFeatureModal('Generator Kuis & Evaluasi')">
                <i class="fa-solid fa-clipboard-question"></i> Generator Kuis & Evaluasi
            </div>
            
            <div class="menu-item modul-dosen" onclick="showFeatureModal('Manajemen Tugas & Proyek')">
                <i class="fa-solid fa-folder-tree"></i> Manajemen Tugas & Proyek
            </div>
            
            <div class="menu-item modul-dosen" onclick="showFeatureModal('Kalender & Pengingat Agenda')">
                <i class="fa-solid fa-calendar-check"></i> Kalender & Pengingat Agenda
            </div>
            
            <!-- LOG LOGIN HISTORI -->
            <div class="menu-section-title">Riwayat Login Sukses</div>
            <div class="log-box" id="loginLogBox">
                <div style="text-align:center; font-size:10px; color:gray;">Memuat data...</div>
            </div>
        </div>
        
        <!-- TEMA VISUAL -->
        <div class="theme-selector">
            <p><i class="fa-solid fa-palette"></i> KUSTOMISASI TAMPILAN</p>
            <div class="theme-grid">
                <button class="theme-btn" onclick="setTheme('malam')"><i class="fa-solid fa-moon"></i> Malam</button>
                <button class="theme-btn" onclick="setTheme('putih')"><i class="fa-solid fa-sun" style="color:#eab308;"></i> Putih</button>
                <button class="theme-btn" onclick="setTheme('samudra')"><i class="fa-solid fa-water" style="color:#38bdf8;"></i> Samudra</button>
                <button class="theme-btn" onclick="setTheme('senja')"><i class="fa-solid fa-cloud-sun" style="color:#f43f5e;"></i> Senja</button>
            </div>
        </div>
        
        <!-- TOMBOL LOGOUT -->
        <button type="button" onclick="executeLogout()" class="btn-submit" style="background:#ef4444; margin-top:20px;">
            <i class="fa-solid fa-right-from-bracket"></i> Keluar Sistem
        </button>
    </div>
    
    <!-- MAIN DASHBOARD CARD -->
    <div class="main-card">
        <div style="text-align: center; margin-bottom: 25px;">
            <h1 style="font-size: 20px; font-weight: 800; display: flex; justify-content: center; align-items: center; gap: 8px;">
                <i class="fa-solid fa-server" style="color:var(--primary);"></i> 
                <span id="displayAppTitle"><?php echo htmlspecialchars($globalConfig['app_title']); ?></span>
            </h1>
        </div>
        
        <!-- FORM UTAMA -->
        <form action="data_siswa.php" method="GET">
            <input type="hidden" name="user_active" id="activeUserForm" value="<?php echo $_SESSION['nama_user'] ?? ''; ?>">
            <input type="hidden" name="theme" id="selectedThemeInput" value="<?php echo htmlspecialchars($active_theme, ENT_QUOTES, 'UTF-8'); ?>">
            
            <div class="form-group">
                <label>Jenjang Pendidikan</label>
                <select name="jenjang" id="jenjang" class="form-control" onchange="updateFormLogic()">
                    <option value="S1">Perguruan Tinggi / S1</option>
                </select>
            </div>
            
            <div class="form-group" id="prodiGroup">
                <label>Program Studi (Prodi)</label>
                <select name="prodi" id="prodi" class="form-control">
                    <option value="Pendidikan Teknologi Informasi" <?php echo $form_context['prodi'] === 'Pendidikan Teknologi Informasi' ? 'selected' : ''; ?>>Pendidikan Teknologi Informasi (PTI)</option>
                    <option value="Pendidikan Guru Sekolah Dasar" <?php echo $form_context['prodi'] === 'Pendidikan Guru Sekolah Dasar' ? 'selected' : ''; ?>>Pendidikan Guru Sekolah Dasar (PGSD)</option>
                    <option value="Pendidikan Jasmani Kesehatan dan Rekreasi" <?php echo $form_context['prodi'] === 'Pendidikan Jasmani Kesehatan dan Rekreasi' ? 'selected' : ''; ?>>Pendidikan Jasmani Kesehatan dan Rekreasi (PJKR)</option>
                    <option value="Pendidikan Bahasa dan Sastra Indonesia" <?php echo $form_context['prodi'] === 'Pendidikan Bahasa dan Sastra Indonesia' ? 'selected' : ''; ?>>Pendidikan Bahasa dan Sastra Indonesia (PBSI)</option>
                    <option value="Pendidikan Sejarah" <?php echo $form_context['prodi'] === 'Pendidikan Sejarah' ? 'selected' : ''; ?>>Pendidikan Sejarah</option>
                    <option value="Pendidikan Bahasa Inggris" <?php echo $form_context['prodi'] === 'Pendidikan Bahasa Inggris' ? 'selected' : ''; ?>>Pendidikan Bahasa Inggris</option>
                </select>
            </div>
            <div class="form-group" id="semesterGroup">
                <label id="labelSemester">Semester</label>
                <select name="semester" id="semester" class="form-control"></select>
            </div>
            <div class="form-group">
                <label id="labelKelas">Grup Kelas</label>
                <select name="kelas" id="kelas" class="form-control"></select>
            </div>
            <button type="submit" class="btn-submit">
                Masuk Sistem <i class="fa-solid fa-arrow-right"></i>
            </button>
        </form>
    </div>
    
    <script>
        let uploadedBase64Avatar = "<?php echo addslashes($globalConfig['admin_avatar']); ?>";
        
        // --- EFEK PARTIKEL MELAYANG (FLOATING PARTICLES CANVAS) ---
        function initParticleCanvas() {
            const canvas = document.getElementById('particleCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let particles = [];
            
            function resizeCanvas() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            
            for (let i = 0; i < 45; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 2.5 + 1,
                    alpha: Math.random() * 0.5 + 0.2,
                    speedX: (Math.random() - 0.5) * 0.6,
                    speedY: (Math.random() - 0.5) * 0.6
                });
            }
            
            function animateParticles() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                particles.forEach(p => {
                    p.x += p.speedX;
                    p.y += p.speedY;
                    
                    if (p.x < 0) p.x = canvas.width;
                    if (p.x > canvas.width) p.x = 0;
                    if (p.y < 0) p.y = canvas.height;
                    if (p.y > canvas.height) p.y = 0;
                    
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(59, 130, 246, ${p.alpha})`;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#3b82f6';
                    ctx.fill();
                });
                requestAnimationFrame(animateParticles);
            }
            animateParticles();
        }
        
        // --- NADA CHIME AUDIO SCI-FI ASLI ---
        function playSciFiChime() {
            try {
                const settings = window.AbsensiUIAudio?.readSettings() || {volume:25, muted:false};
                if (settings.muted || settings.volume <= 0) return;
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const masterVolume = Math.min(0.12, settings.volume / 100 * 0.12);
                
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(300, ctx.currentTime);
                osc1.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.6);
                
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(600, ctx.currentTime);
                osc2.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.8);
                
                gain1.gain.setValueAtTime(0, ctx.currentTime);
                gain1.gain.linearRampToValueAtTime(masterVolume, ctx.currentTime + 0.1);
                gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);
                
                gain2.gain.setValueAtTime(0, ctx.currentTime);
                gain2.gain.linearRampToValueAtTime(masterVolume * 0.5, ctx.currentTime + 0.2);
                gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
                
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                
                osc1.start(ctx.currentTime);
                osc2.start(ctx.currentTime);
                osc1.stop(ctx.currentTime + 2);
                osc2.stop(ctx.currentTime + 2.5);
            } catch (e) { console.log("Audio API tidak didukung"); }
        }
        
        // --- MANIPULASI WALLPAPER BACKGROUND DARI LOCALSTORAGE ---
        function applyBgWallpaperSizing() {
            let mode = localStorage.getItem('custom_bg_wallpaper_mode') || 'cover';
            let scale = Math.max(1, Math.min(200, parseInt(localStorage.getItem('custom_bg_wallpaper_scale') || '100', 10) || 100));
            const imageWidth = Number(localStorage.getItem('custom_bg_wallpaper_width')) || 0;
            const imageHeight = Number(localStorage.getItem('custom_bg_wallpaper_height')) || 0;
            const canCoverWithoutUpscale = !imageWidth || !imageHeight || (imageWidth >= window.innerWidth && imageHeight >= window.innerHeight);
            if (mode === 'cover' && !canCoverWithoutUpscale) {
                mode = 'auto';
                try { localStorage.setItem('custom_bg_wallpaper_mode', mode); } catch (error) {}
            }
            const maxManualScale = imageWidth && imageHeight ? Math.max(1, Math.min(200, Math.floor(Math.min(imageWidth / Math.max(1, window.innerWidth), imageHeight / Math.max(1, window.innerHeight)) * 100))) : 200;
            scale = Math.min(scale, maxManualScale);
            const selector = document.getElementById('bgFitMode');
            const slider = document.getElementById('bgScaleRange');
            const manualWrap = document.getElementById('bgManualScaleWrap');
            if (selector) selector.value = ['cover','contain','auto','manual'].includes(mode) ? mode : 'cover';
            if (slider) { slider.max = String(maxManualScale); slider.value = String(scale); }
            if (manualWrap) manualWrap.style.display = mode === 'manual' ? 'block' : 'none';
            const label = document.getElementById('bgScaleValue');
            if (label) label.textContent = scale + '%';
            const x = Math.max(0, Math.min(100, parseInt(localStorage.getItem('custom_bg_wallpaper_x') || '50', 10)));
            const y = Math.max(0, Math.min(100, parseInt(localStorage.getItem('custom_bg_wallpaper_y') || '50', 10)));
            const xSlider = document.getElementById('bgPositionX'), ySlider = document.getElementById('bgPositionY');
            if (xSlider) xSlider.value = String(x);
            if (ySlider) ySlider.value = String(y);
            const xLabel = document.getElementById('bgPositionXValue'), yLabel = document.getElementById('bgPositionYValue');
            if (xLabel) xLabel.textContent = x + '%';
            if (yLabel) yLabel.textContent = y + '%';
            if (mode === 'contain') document.body.style.backgroundSize = 'contain';
            else if (mode === 'auto') document.body.style.backgroundSize = 'auto';
            else if (mode === 'manual') document.body.style.backgroundSize = scale + '% auto';
            else document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = `${x}% ${y}%`;
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
            if (parseInt(localStorage.getItem('custom_bg_wallpaper_scale') || '100', 10) !== scale) {
                try { localStorage.setItem('custom_bg_wallpaper_scale', String(scale)); } catch (error) {}
            }
        }

        function updateBgWallpaperPosition() {
            const x = Math.max(0, Math.min(100, Number(document.getElementById('bgPositionX').value) || 0));
            const y = Math.max(0, Math.min(100, Number(document.getElementById('bgPositionY').value) || 0));
            try { localStorage.setItem('custom_bg_wallpaper_x', String(x)); localStorage.setItem('custom_bg_wallpaper_y', String(y)); }
            catch (error) { showToast('Posisi wallpaper tidak dapat disimpan di browser.', 'error'); }
            applyBgWallpaperSizing();
        }

        function updateBgWallpaperSizing() {
            const selector = document.getElementById('bgFitMode');
            const slider = document.getElementById('bgScaleRange');
            if (!selector || !slider) return;
            const mode = selector.value;
            const scale = Math.max(1, Math.min(parseInt(slider.max, 10) || 200, parseInt(slider.value, 10) || 100));
            try {
                localStorage.setItem('custom_bg_wallpaper_mode', mode);
                localStorage.setItem('custom_bg_wallpaper_scale', String(scale));
            } catch (error) { showToast('Pengaturan ukuran wallpaper tidak dapat disimpan di browser.', 'error'); }
            applyBgWallpaperSizing();
        }

        function applySavedBgWallpaper() {
            const savedBg = localStorage.getItem('custom_bg_wallpaper');
            if (savedBg) {
                document.body.classList.add('has-custom-wallpaper');
                document.body.style.backgroundImage = `url("${savedBg}")`;
                const width = Number(localStorage.getItem('custom_bg_wallpaper_width')) || 0;
                const height = Number(localStorage.getItem('custom_bg_wallpaper_height')) || 0;
                if (width && height) document.getElementById('bgQualityHint').textContent = `Resolusi foto asli: ${width} × ${height}px. Pembesaran otomatis dibatasi agar foto kecil tidak makin buram.`;
            } else {
                document.body.classList.remove('has-custom-wallpaper');
                document.body.style.backgroundImage = '';
            }
            applyBgWallpaperSizing();
        }

        function handleBgUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('Pilih berkas gambar yang valid.', 'error'); return; }
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const check = new Image(); check.src = e.target.result; await check.decode();
                    // Simpan piksel sumber tanpa kompresi; ukuran kecil tidak dinaikkan paksa.
                    localStorage.setItem('custom_bg_wallpaper', e.target.result);
                    localStorage.setItem('custom_bg_wallpaper_width', String(check.naturalWidth));
                    localStorage.setItem('custom_bg_wallpaper_height', String(check.naturalHeight));
                    const fitScale = Math.max(window.innerWidth / check.naturalWidth, window.innerHeight / check.naturalHeight);
                    const tooSmall = fitScale > 1.05;
                    const hint = document.getElementById('bgQualityHint');
                    if (tooSmall) {
                        localStorage.setItem('custom_bg_wallpaper_mode', 'auto');
                        if (hint) hint.textContent = `Resolusi foto ${check.naturalWidth} × ${check.naturalHeight}px lebih kecil dari layar. Mode ukuran asli dipilih supaya gambar tidak diperbesar dan terlihat pecah.`;
                    } else if (hint) hint.textContent = `Resolusi foto: ${check.naturalWidth} × ${check.naturalHeight}px. Berkas asli dipertahankan tanpa kompresi atau pembesaran buatan.`;
                    applySavedBgWallpaper();
                    showToast(tooSmall ? 'Foto kecil ditampilkan tanpa pembesaran otomatis agar tidak makin buram.' : 'Wallpaper asli diterapkan tanpa kompresi.', 'success');
                } catch (error) {
                    showToast('Gambar tidak bisa dibaca atau melebihi ruang penyimpanan browser. Coba berkas lain yang lebih kecil.', 'error');
                }
            };
            reader.readAsDataURL(file);
        }

        function removeBgWallpaper() {
            localStorage.removeItem('custom_bg_wallpaper');
            localStorage.removeItem('custom_bg_wallpaper_mode');
            localStorage.removeItem('custom_bg_wallpaper_scale');
            localStorage.removeItem('custom_bg_wallpaper_x');
            localStorage.removeItem('custom_bg_wallpaper_y');
            localStorage.removeItem('custom_bg_wallpaper_width');
            localStorage.removeItem('custom_bg_wallpaper_height');
            document.body.style.backgroundImage = '';
            applyBgWallpaperSizing();
            showToast('Wallpaper background dikembalikan ke bawaan tema', 'success');
        }

        function isiPengaturanAudioAntarmuka() {
            if (!window.AbsensiUIAudio) return;
            const settings = window.AbsensiUIAudio.readSettings();
            document.getElementById('uiSoundEffect').value = String(settings.effect);
            document.getElementById('uiSoundVolume').value = String(settings.volume);
            document.getElementById('uiSoundMuted').checked = settings.muted;
            document.getElementById('uiSoundVolumeValue').textContent = settings.volume + '%';
        }

        function simpanAudioAntarmuka() {
            if (!window.AbsensiUIAudio) return;
            const settings = window.AbsensiUIAudio.saveSettings({
                effect: document.getElementById('uiSoundEffect').value,
                volume: document.getElementById('uiSoundVolume').value,
                muted: document.getElementById('uiSoundMuted').checked
            });
            document.getElementById('uiSoundVolumeValue').textContent = settings.volume + '%';
        }

        function previewEfekSuara() {
            simpanAudioAntarmuka();
            window.AbsensiUIAudio?.preview(document.getElementById('uiSoundEffect').value);
        }

        function bukaPemutarMusik() { window.AbsensiUIAudio?.openMusicPlayer(); }
        document.addEventListener('DOMContentLoaded', isiPengaturanAudioAntarmuka, {once:true});
        
        window.onload = function() {
            initParticleCanvas();
            applySavedBgWallpaper();
            
            if (window.SERVER_CONFIG.isLoggedIn) {
                document.getElementById('authOverlay').style.display = 'none';
                loadLoginLogs();
            } else {
                document.getElementById('authOverlay').style.visibility = 'visible';
                document.getElementById('authOverlay').style.opacity = '1';
            }
            updateFormLogic();
        };
        window.addEventListener('resize', applyBgWallpaperSizing, {passive:true});
        
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>' : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>';
            toast.innerHTML = `${icon} <span>${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }
        
        function processAuthPrivate() {
            const user = document.getElementById('authLogName').value;
            const pass = document.getElementById('authLogPass').value;
            
            if(!user || !pass) {
                showToast("Nama dan Password wajib diisi!", "error");
                return;
            }
            const formData = new FormData();
            formData.append('action', 'login_privat');
            formData.append('username', user);
            formData.append('password', pass);
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    showToast(data.msg, 'success');
                    document.getElementById('currentUserNameText').innerText = data.user;
                    document.getElementById('activeUserForm').value = data.user;
                    
                    const introOverlay = document.getElementById('introOverlay');
                    const introContent = document.getElementById('introContent');
                    const introGreeting = document.getElementById('introGreeting');
                    
                    const isDosen = data.role.toLowerCase().includes('dosen');
                    const greetRole = isDosen ? 'Dosen Pengampu' : 'Administrator Utama';
                    const greetText = isDosen ? 'Selamat Mengajar' : 'Selamat Bekerja';
                    introGreeting.innerText = `Selamat Datang, ${greetRole} ${data.user} - ${greetText}`;
                    
                    introOverlay.classList.add('active');
                    playSciFiChime();
                    
                    setTimeout(() => {
                        introContent.classList.add('show-text');
                    }, 800);
                    
                    setTimeout(() => {
                        introOverlay.classList.remove('active');
                        introContent.classList.remove('show-text');
                        
                        document.getElementById('authOverlay').style.opacity = '0';
                        setTimeout(() => {
                            document.getElementById('authOverlay').style.display = 'none';
                            loadLoginLogs();
                        }, 800);
                        
                    }, 3800);
                    
                } else {
                    showToast(data.msg, 'error');
                }
            })
            .catch(() => {
                showToast('Gagal memproses ke server', 'error');
            });
        }
        
        function executeLogout() {
            const formData = new FormData();
            formData.append('action', 'logout_system');
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success') {
                    showToast('Berhasil Keluar Sistem', 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 500);
                }
            })
            .catch(() => {
                location.reload();
            });
        }
        
        function openProfileModal() {
            document.getElementById('profileModal').classList.add('active');
        }
        
        function closeProfileModal() {
            document.getElementById('profileModal').classList.remove('active');
        }
        
        function handleAvatarUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    uploadedBase64Avatar = e.target.result;
                    document.getElementById('previewAvatarImg').src = uploadedBase64Avatar;
                };
                reader.readAsDataURL(file);
            }
        }
        
        function saveProfileChanges() {
            const newName = document.getElementById('editAdminName').value;
            const newRole = document.getElementById('editAdminRole').value;
            if(!newName || !newRole) {
                showToast("Nama dan Jabatan wajib diisi!", "error");
                return;
            }
            const formData = new FormData();
            formData.append('action', 'update_profile');
            formData.append('admin_name', newName);
            formData.append('admin_role', newRole);
            formData.append('admin_avatar', uploadedBase64Avatar);
            fetch('index.php', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success') {
                    showToast(data.msg, 'success');
                    document.getElementById('widgetAdminName').innerText = newName;
                    document.getElementById('widgetAdminRole').innerText = newRole;
                    document.getElementById('currentUserNameText').innerText = newName;
                    document.getElementById('widgetAvatarImg').src = uploadedBase64Avatar;
                    document.getElementById('topNavAvatarImg').src = uploadedBase64Avatar;
                    closeProfileModal();
                } else {
                    showToast('Gagal memperbarui profil', 'error');
                }
            });
        }
        
        function showFeatureModal(featureName) {
            document.getElementById('modalFeatureTitle').innerText = featureName;
            document.getElementById('featureModal').classList.add('active');
            closeSidebar();
        }
        
        function closeFeatureModal() {
            document.getElementById('featureModal').classList.remove('active');
        }
        
        function toggleSidebar() {
            document.getElementById('sidebar').classList.add('active');
            document.getElementById('overlay').classList.add('active');
        }
        
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('overlay').classList.remove('active');
        }
        
        function updateFormLogic() {
            const kelasSelect = document.getElementById('kelas');
            const semesterSelect = document.getElementById('semester');
            const selectedKelas = <?php echo json_encode((string)$form_context['kelas']); ?>;
            const selectedSemester = <?php echo json_encode((string)$form_context['semester']); ?>;
            kelasSelect.innerHTML = '';
            semesterSelect.innerHTML = '';
            
            ['1', '2', '3', '4', '5', '6', '7', '8'].forEach(v => {
                semesterSelect.add(new Option(`Semester ${v}`, v, false, v === selectedSemester));
            });
            
            ['A', 'B', 'C', 'D', 'E'].forEach(v => {
                kelasSelect.add(new Option(`Kelas ${v}`, v, false, v === selectedKelas));
            });
        }
        
        function setTheme(themeName) {
            const allowedThemes = ['malam', 'putih', 'samudra', 'senja'];
            if (!allowedThemes.includes(themeName)) return;
            document.documentElement.setAttribute('data-theme', themeName);
            window.AbsensiUIAudio?.setTheme(themeName);
            const themeInput = document.getElementById('selectedThemeInput');
            if (themeInput) themeInput.value = themeName;
            
            const formData = new FormData();
            formData.append('set_theme_session', '1');
            formData.append('theme_name', themeName);
            fetch('index.php', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success') {
                    showToast('Tema berhasil diperbarui!', 'success');
                }
            });
        }
        
        function toggleWebStatus() {
            const cb = document.getElementById('webStatusToggle');
            const status = cb.checked ? 'public' : 'private';
            
            const formData = new FormData();
            formData.append('toggle_web_status', '1');
            formData.append('new_status', status);
            fetch('index.php', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                showToast(`Sistem dialihkan ke Mode ${data.new.toUpperCase()}`, 'success');
            });
        }
        
        function loadLoginLogs() {
            const formData = new FormData();
            formData.append('get_login_logs', '1');
            fetch('index.php', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(logs => {
                const box = document.getElementById('loginLogBox');
                box.innerHTML = '';
                if(logs.length === 0) {
                    box.innerHTML = '<div style="text-align:center; font-size:10px; color:gray;">Belum ada riwayat</div>';
                    return;
                }
                logs.forEach(log => {
                    box.innerHTML += `
                        <div class="log-item">
                            <div><span class="log-user">${log.nama}</span> <span style="font-size:9px;">(${log.role})</span></div>
                            <div style="text-align:right;">
                                <div>${log.waktu}</div>
                                <div style="font-size:8px; opacity:0.6;">IP: ${log.ip}</div>
                            </div>
                        </div>
                    `;
                });
            });
        }
    </script>
</body>
</html>
