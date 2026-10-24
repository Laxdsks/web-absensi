<?php
session_start();
require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/teacher_accounts.php';
$is_logged_in = app_session_user_is_authenticated();
if($is_logged_in && empty($_SESSION['wa_csrf']))$_SESSION['wa_csrf']=bin2hex(random_bytes(32));
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

// --- LOG LOGIN ---
$logFile = 'login_logs.json';
$configFile = 'admin_config.json';

// --- CONFIG DEFAULT GLOBAL ---
$defaultConfig = [
    'admin_name' => 'M.Fadillah',
    'admin_role' => 'Administrator Utama',
    'admin_avatar' => 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user-tie.svg',
    'app_title' => 'Database & Absensi'
];
$configStore = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
if (!is_array($configStore)) $configStore = [];
$legacyConfig = isset($configStore['profiles']) ? [] : $configStore;
$profiles = is_array($configStore['profiles'] ?? null) ? $configStore['profiles'] : [];
if (!isset($profiles['admin_01']) && $legacyConfig) $profiles['admin_01'] = $legacyConfig;
$profiles['admin_01'] = array_merge($defaultConfig, is_array($profiles['admin_01'] ?? null) ? $profiles['admin_01'] : []);
$profiles['dosen_01'] = array_merge($defaultConfig, [
    'admin_name' => 'Zen', 'admin_role' => 'Dosen',
    'admin_avatar' => 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user.svg'
], is_array($profiles['dosen_01'] ?? null) ? $profiles['dosen_01'] : []);
$profiles['dosen_01']['admin_role']='Dosen';
$profiles['admin_01']['admin_role']='Administrator Utama';
$accountId = $is_logged_in ? (string)$_SESSION['id_user'] : 'guest';
$globalConfig = $is_logged_in ? ($profiles[$accountId] ?? $profiles['admin_01']) : array_merge($defaultConfig,['admin_name'=>'Pengguna','admin_role'=>'','admin_avatar'=>'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/user.svg']);
$teacherRecord = $is_logged_in ? wa_teacher_account($accountId) : null;
if($teacherRecord && !in_array($accountId,['admin_01','dosen_01'],true)){
    $globalConfig=['admin_name'=>$teacherRecord['display_name'],'admin_role'=>$teacherRecord['role']==='admin'?'Administrator Utama':'Dosen','admin_avatar'=>$teacherRecord['avatar']?:$defaultConfig['admin_avatar']];
}
if($teacherRecord){$globalConfig['admin_name']=$teacherRecord['display_name'];$globalConfig['professional_title']=$teacherRecord['professional_title']??'';}
$globalConfig['app_title'] = $configStore['app_title'] ?? $globalConfig['app_title'] ?? $defaultConfig['app_title'];
$homeLayout = defined('APP_TEMPLATE_BUILD') ? 'left' : teacher_home_layout();

// --- API PENGATURAN TEMA KE SESSION ---
if (isset($_POST['set_theme_session'])) {
    app_require_authenticated_user(true);
    $allowedThemes = ['malam', 'putih', 'samudra', 'senja'];
    $requestedTheme = trim((string)($_POST['theme_name'] ?? 'malam'));
    if (in_array($requestedTheme, $allowedThemes, true)) {
        $_SESSION['theme'] = $requestedTheme;
    }
    echo json_encode(['status' => 'success']);
    exit;
}

// --- API AMBIL RIWAYAT LOGIN ---
if (isset($_POST['get_login_logs'])) {
    app_require_authenticated_user(true);
    $logs = file_exists($logFile) ? json_decode(file_get_contents($logFile), true) : [];
    $logs=array_filter(is_array($logs)?$logs:[],static fn($row)=>($row['account_id']??null)===$_SESSION['id_user'] || (!isset($row['account_id']) && ($row['role']??'')===($_SESSION['id_user']==='dosen_01'?'Dosen':'Administrator Utama') && in_array($_SESSION['id_user'],['admin_01','dosen_01'],true)));
    echo json_encode(array_values(array_reverse($logs)));
    exit;
}

// --- API LOGOUT MANDIRI ANTI-404 ---
if (isset($_POST['action']) && $_POST['action'] === 'logout_system') {
    try { wa_revoke_current(); } catch (Throwable $ignored) {}
    session_unset();
    session_destroy();
    echo json_encode(['status' => 'success']);
    exit;
}

// --- API SUNTING PROFIL KUSTOM DINAMIS ---
if (isset($_POST['action']) && $_POST['action'] === 'update_profile') {
    app_require_authenticated_user(true);
    if(!hash_equals((string)($_SESSION['wa_csrf']??''),(string)($_POST['csrf']??''))){http_response_code(403);echo json_encode(['status'=>'error','msg'=>'Muat ulang halaman lalu coba lagi.']);exit;}
    $newName = trim($_POST['admin_name'] ?? '');
    $newRole = trim($_POST['admin_role'] ?? '');
    $professionalTitle=trim($_POST['professional_title']??'');
    $newAvatar = $_POST['admin_avatar'] ?? '';
    if(mb_strlen($newName)<2||mb_strlen($newName)>100){http_response_code(422);echo json_encode(['status'=>'error','msg'=>'Nama harus terdiri dari 2 sampai 100 karakter.']);exit;}
    
    $accountId = (string)($_SESSION['id_user'] ?? 'admin_01');
    $currentConfig = $profiles[$accountId] ?? $globalConfig;
    if (!empty($newName)) $currentConfig['admin_name'] = $newName;
    $currentConfig['admin_role']=(wa_teacher_account($accountId)['role']??'teacher')==='admin'?'Administrator Utama':'Dosen';
    if (!empty($newAvatar)) {
        if($newAvatar===$currentConfig['admin_avatar']){}
        else try{$currentConfig['admin_avatar']=teacher_avatar($newAvatar);}catch(InvalidArgumentException $error){http_response_code(422);echo json_encode(['status'=>'error','msg'=>$error->getMessage()]);exit;}
    }
    
    try{wa_save_teacher_identity($accountId,$currentConfig['admin_name'],$professionalTitle);}catch(InvalidArgumentException $error){http_response_code(422);echo json_encode(['status'=>'error','msg'=>$error->getMessage()]);exit;}
    $currentConfig['professional_title']=$professionalTitle;
    $profiles[$accountId] = $currentConfig;
    $currentConfig['app_title'] = $configStore['app_title'] ?? $defaultConfig['app_title'];
    if(!in_array($accountId,['admin_01','dosen_01'],true)){
        wa_query('UPDATE wa_teacher_accounts SET display_name=?,avatar=? WHERE id=?',[$currentConfig['admin_name'],$currentConfig['admin_avatar'],$accountId]);
    }else file_put_contents($configFile, json_encode(['profiles' => $profiles, 'app_title' => $currentConfig['app_title']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    
    // Perbarui session jika yang aktif adalah user tersebut
    if (isset($_SESSION['nama_user'])) {
        $_SESSION['nama_user'] = $currentConfig['admin_name'];
        $_SESSION['role'] = $currentConfig['admin_role'];
    }
    
    echo json_encode(['status' => 'success', 'msg' => 'Profil identitas berhasil diperbarui!', 'data' => $currentConfig]);
    exit;
}
if (($_POST['action']??'') === 'register_teacher') {
    try {$registered=teacher_registration($_POST);echo json_encode(['status'=>'success','msg'=>'Pendaftaran dikirim. Administrator perlu menyetujui akun sebelum dapat masuk.','account'=>$registered]);}
    catch(Throwable $error){http_response_code($error instanceof DomainException?429:422);echo json_encode(['status'=>'error','msg'=>$error instanceof InvalidArgumentException||$error instanceof DomainException?$error->getMessage():'Pendaftaran belum berhasil.']);}
    exit;
}
if (($_POST['action']??'') === 'teacher_accounts') {
    app_require_authenticated_user(true,true);
    header('Content-Type: application/json; charset=utf-8');echo json_encode(['status'=>'success','accounts'=>teacher_pending_accounts()]);exit;
}
if (($_POST['action']??'') === 'review_teacher') {
    app_require_authenticated_user(true,true);
    if(!hash_equals((string)($_SESSION['wa_csrf']??''),(string)($_POST['csrf']??''))){http_response_code(403);echo json_encode(['status'=>'error','msg'=>'Muat ulang halaman lalu coba lagi.']);exit;}
    try {teacher_review_account((string)($_POST['id']??''),(string)($_POST['decision']??''));echo json_encode(['status'=>'success']);}
    catch(Throwable $error){http_response_code(422);echo json_encode(['status'=>'error','msg'=>'Pendaftaran tidak dapat diproses.']);}exit;
}
if (($_POST['action']??'') === 'set_home_layout') {
    app_require_authenticated_user(true,true);
    if(!hash_equals((string)($_SESSION['wa_csrf']??''),(string)($_POST['csrf']??''))){http_response_code(403);echo json_encode(['status'=>'error','msg'=>'Muat ulang halaman lalu coba lagi.']);exit;}
    try {teacher_set_home_layout((string)($_POST['layout']??''));echo json_encode(['status'=>'success','layout'=>teacher_home_layout()]);}
    catch(Throwable $error){http_response_code(422);echo json_encode(['status'=>'error','msg'=>'Posisi formulir tidak valid.']);}exit;
}

// --- SISTEM AUTENTIKASI KETAT PRIVAT (M.FADILLAH / ZEN) ---
if (isset($_POST['action']) && $_POST['action'] === 'login_privat') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    try {
    $user = trim($_POST['username'] ?? '');
    $pass = trim($_POST['password'] ?? '');
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
    $date = date('Y-m-d H:i:s');
    
    $login_success = false;
    $role_assigned = '';
    $id_assigned = '';
    $name_assigned = '';
    try {$registeredAccount=in_array(strtolower($user),['m.fadillah','fall','zen'],true)?null:teacher_login($user,$pass);}catch(DomainException $error){echo json_encode(['status'=>'error','msg'=>$error->getMessage()]);exit;}
    if($registeredAccount){
        $login_success=true;$role_assigned=$registeredAccount['role']==='admin'?'Administrator Utama':'Dosen';
        $id_assigned=$registeredAccount['id'];$name_assigned=$registeredAccount['display_name'];
    }
    
    // Validasi Hardcode Absolut
    if (!$login_success && $user === 'M.Fadillah' && $pass === '28032004Dilll') {
        $login_success = true;
        $role_assigned = 'Administrator Utama';
        $id_assigned = 'admin_01';
        $name_assigned = 'M.Fadillah';
    } elseif (!$login_success && $user === 'Zen' && $pass === '111315Zen') {
        $login_success = true;
        $role_assigned = 'Dosen';
        $id_assigned = 'dosen_01';
        $name_assigned = 'Zen';
    }
    
    if ($login_success) {
        if(isset($_SESSION['id_user'])&&$_SESSION['id_user']!==$id_assigned)unset($_SESSION['konteks_siswa'],$_SESSION['nilai_ujian']);
        wa_revoke_current();
        session_regenerate_id(true);
        // Ikat Murni ke Session Format Teks/String
        $_SESSION['id_user'] = (string)$id_assigned;
        $_SESSION['nama_user'] = (string)$name_assigned;
        $_SESSION['role'] = (string)$role_assigned;
        $_SESSION['wa_csrf'] = bin2hex(random_bytes(32));
        
        // Catat Log Login
        $logs = file_exists($logFile) ? json_decode(file_get_contents($logFile), true) : [];
        $logs[] = [
            'nama' => $name_assigned,
            'account_id' => $id_assigned,
            'role' => $role_assigned,
            'ip' => $ip,
            'waktu' => $date
        ];
        if(count($logs) > 50) array_shift($logs); 
        file_put_contents($logFile, json_encode($logs));
        
        echo json_encode(['status' => 'success', 'msg' => 'Autentikasi Berhasil!', 'user' => $name_assigned, 'role' => $role_assigned]);
        exit;
    } else {
        echo json_encode(['status' => 'error', 'msg' => 'Kredensial Salah atau Akses Ditolak!']);
        exit;
    }
    } catch(Throwable $error) {
        error_log('WA teacher login failed: '.get_class($error));
        http_response_code(503);
        echo json_encode(['status'=>'error','msg'=>'Layanan login sedang tidak tersedia. Coba lagi sebentar; data akun tetap tersimpan.']);
        exit;
    }
}

// Cek apakah user sudah login
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
        window.SERVER_CONFIG = <?php echo json_encode([
            'adminName'=>$globalConfig['admin_name'],'adminRole'=>$globalConfig['admin_role'],
            'adminAvatar'=>$globalConfig['admin_avatar'],'appTitle'=>$globalConfig['app_title'],
            'accountId'=>$is_logged_in?($_SESSION['id_user']??null):null,
            'isAdmin'=>$is_logged_in&&($teacherRecord['role']??'')==='admin',
            'homeLayout'=>$homeLayout,'isLoggedIn'=>$is_logged_in,'csrf'=>$is_logged_in?$_SESSION['wa_csrf']:null
        ],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); ?>;

        // Establish the saved theme before styles paint. The short intro stays
        // opaque across the one reload needed to initialise the offline bridge.
        (() => {
            const root = document.documentElement;
            root.classList.add('presen-starting');
            let transfer = false, freshIntro = false, ready = false;
            try {
                const theme = localStorage.getItem('presen-theme');
                if (['malam', 'putih', 'samudra', 'senja'].includes(theme)) root.dataset.theme = theme;
                const at = Number(sessionStorage.getItem('presen-intro-transfer'));
                sessionStorage.removeItem('presen-intro-transfer');
                transfer = at > 0 && Date.now() - at >= 0 && Date.now() - at < 15000;
                freshIntro = sessionStorage.getItem('presen-intro-seen') !== '1';
            } catch (_) {}
            if (transfer) root.classList.add('presen-intro-transfer');
            if (freshIntro) root.classList.add('presen-intro-fresh');
            window.PresenStartup = {
                transfer() {
                    try { sessionStorage.setItem('presen-intro-transfer', String(Date.now())); } catch (_) {}
                },
                ready() {
                    if (ready) return;
                    ready = true;
                    const intro = document.getElementById('introOverlay');
                    if ((transfer || freshIntro) && intro) {
                        intro.classList.add('active');
                        document.getElementById('introContent').classList.add('show-text');
                    }
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        root.classList.remove('presen-starting', 'presen-intro-transfer', 'presen-intro-fresh');
                        if ((transfer || freshIntro) && intro) requestAnimationFrame(() => {
                            intro.classList.remove('active');
                            setTimeout(() => { intro.hidden = true; }, 220);
                        });
                        try { sessionStorage.setItem('presen-intro-seen','1'); } catch (_) {}
                    }));
                }
            };
            // A failed asset or offline server must never leave the UI covered.
            setTimeout(() => window.PresenStartup.ready(), 4000);
        })();
    </script>
    
    <script src="assets/app-audio.js?v=20261009-music-panel" defer></script>
    <link rel="stylesheet" href="app/vendor/fontawesome/css/all.min.css">
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
        
        /* One restrained intro; no black flash or staggered text repaint. */
        #introOverlay { position:fixed; inset:0; background:#103451; color:#fff; z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; visibility:hidden; transition:opacity .2s ease,visibility .2s; }
        #introOverlay[hidden] { display:none; }
        #introOverlay.active, html.presen-intro-transfer #introOverlay, html.presen-intro-fresh #introOverlay { opacity:1; visibility:visible; }
        .intro-content { text-align:center; padding:24px; }
        .logo-glow { width:64px; height:64px; margin:0 auto 20px; border:1px solid #ffffff50; border-radius:18px; display:grid; place-items:center; background:#ffffff12; }
        .logo-glow::after { content:'\f058'; font-family:'Font Awesome 6 Free'; font-weight:900; font-size:28px; color:#a6e6d8; }
        .intro-text-1 { font-size:22px; font-weight:800; letter-spacing:.02em; margin-bottom:8px; }
        .intro-text-2 { font-size:13px; color:#d1e1ed; line-height:1.6; }
        html.presen-starting *, html.presen-starting *::before, html.presen-starting *::after { transition:none!important; animation:none!important; }
        html.presen-starting #authOverlay .auth-card { visibility:hidden; }
        html.presen-starting .main-card, html.presen-starting .top-nav,
        html.presen-starting .portal-header, html.presen-starting .portal-hero,
        html.presen-starting .portal-quick, html.presen-starting .portal-footer { visibility:hidden; }
        @media(prefers-reduced-motion:reduce) { #introOverlay { transition:none; } }

        @media screen and (max-width: 768px) {
            .main-card { padding: 25px 20px; width: 92%; border-radius: 18px; margin-top: 50px; }
            .sidebar { width: 100%; right: -100%; padding: 20px 15px; }
            .auth-card { padding: 25px 20px; width: 92%; margin: 10px; }
        }
    </style>
<script src="assets/native-export.js?v=20261010" defer></script>
    <script src="app/runtime-teacher-1.2.8.js" defer></script>
    <link rel="stylesheet" href="assets/teacher-tools.css?v=20261010-reliable-4">
    <script src="app/vendor/qr.js" defer></script>
    <script src="app/vendor/scan.js" defer></script>
<link rel="stylesheet" href="app/guide.css"><script src="app/guide.js" defer></script>
<link rel="stylesheet" href="app/portal.css?v=20261012"><script src="app/portal.js?v=20261012" defer></script><script src="app/appearance.js" defer></script><script src="app/workspace.js" defer></script><script src="app/inbox.js" defer></script><script src="app/grade-assistant.js" defer></script>
<script src="app/account-tools.js?v=20261012" defer></script>
<script src="app/evidence.js" defer></script><script src="app/monitoring.js" defer></script><script src="app/experience.js" defer></script><link rel="stylesheet" href="app/experience.css">
</head>
<body class="portal-home" data-home-layout="<?php echo htmlspecialchars($homeLayout,ENT_QUOTES,'UTF-8'); ?>">
    <!-- KANVAS PARTIKEL MELAYANG -->
    <canvas id="particleCanvas"></canvas>
    
    <div class="toast-container" id="toastContainer"></div>
    
    <!-- Intro remains continuous while the signed-in workspace starts. -->
    <div id="introOverlay">
        <div class="intro-content" id="introContent">
            <div class="logo-glow"></div>
            <div class="intro-text-1">Selamat datang</div>
            <div class="intro-text-2" id="introGreeting">Menyiapkan ruang kerja Anda…</div>
        </div>
    </div>
    
    <!-- OVERLAY LOGIN PRIVAT STANDALONE -->
    <div id="authOverlay"<?php if ($is_logged_in && !defined('APP_TEMPLATE_BUILD')) echo ' style="display:none"'; ?>>
        <div class="auth-card">
            <div style="margin-bottom: 25px;">
                <h2 style="font-size: 22px; margin-bottom: 5px; color: var(--primary);"><i class="fa-solid fa-lock"></i> Masuk ke Sistem</h2>
                <p style="font-size: 12px; color: var(--text-muted);">Gunakan akun administrator atau dosen yang terdaftar.</p>
            </div>
            
            <form id="formLoginAuth" onsubmit="event.preventDefault();processAuthPrivate()">
                <div class="form-group">
                    <label for="authLogName">ID akun</label>
                    <input type="text" id="authLogName" class="form-control" autocomplete="username" placeholder="ID akun Anda">
                </div>
                <div class="form-group">
                    <label for="authLogPass">Kata sandi</label>
                    <div class="auth-password-field">
                        <input type="password" id="authLogPass" class="form-control" autocomplete="current-password" placeholder="••••••••">
                        <button type="button" id="toggleLoginPassword" class="auth-password-toggle" aria-label="Tampilkan kata sandi" aria-controls="authLogPass" aria-pressed="false" onclick="setLoginPasswordVisibility()"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Buka Kunci Sistem <i class="fa-solid fa-key"></i></button>
                <button type="button" class="p-auth-switch" onclick="toggleTeacherRegistration(true)">Belum punya akun? Daftar</button>
            </form>
            <form id="formRegisterTeacher" hidden onsubmit="registerTeacherAccount(event)">
                <div class="form-group"><label>ID akun unik<input name="username" class="form-control" minlength="4" maxlength="50" pattern="[A-Za-z][A-Za-z0-9_.-]{3,49}" required autocomplete="username"></label></div>
                <div class="form-group"><label>Nama lengkap<input name="display_name" class="form-control" maxlength="100" required autocomplete="name"></label></div>
                <div class="form-group"><label>Jabatan yang diajukan<select name="role" class="form-control"><option value="teacher">Dosen / pengguna biasa</option><option value="admin">Administrator</option></select></label><small>Jabatan administrator hanya aktif setelah disetujui administrator yang sudah ada.</small></div>
                <div class="form-group"><label>Foto profil<input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp" class="form-control"></label><small>Foto disimpan di server akun dan ikut tampil saat masuk dari perangkat lain.</small></div>
                <div class="form-group"><label>Kata sandi<input name="password" type="password" class="form-control" minlength="10" maxlength="128" required autocomplete="new-password"></label></div>
                <button type="submit" class="btn-submit">Kirim pendaftaran</button>
                <button type="button" class="p-auth-switch" onclick="toggleTeacherRegistration(false)">Sudah punya akun? Masuk</button>
                <p id="teacherRegistrationStatus" role="status" aria-live="polite"></p>
            </form>
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
                <label>Gelar / jabatan akademik (opsional)</label>
                <input type="text" id="editProfessionalTitle" class="form-control" maxlength="100" value="<?php echo htmlspecialchars($globalConfig['professional_title']??''); ?>" placeholder="Contoh: S.Pd., M.Pd.">
            </div><div class="form-group">
                <label>Jabatan / Role Sistem</label>
                <input type="text" id="editAdminRole" class="form-control" value="<?php echo htmlspecialchars($globalConfig['admin_role']); ?>" readonly>
            </div>
            <?php if($is_logged_in && ($teacherRecord['role']??'')==='admin'): ?>
            <section class="p-admin-settings">
                <h4>Tata letak beranda untuk semua akun</h4>
                <label>Posisi formulir pilihan kelas<select id="adminHomeLayout" class="form-control"><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></label>
                <button type="button" class="btn-submit" onclick="saveAdminHomeLayout()">Terapkan untuk semua akun</button>
                <h4>Persetujuan akun baru</h4><div id="teacherPendingAccounts">Memuat pendaftaran…</div>
            </section>
            <?php endif; ?>
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
                <p style="font-size:11px;color:var(--text-muted);line-height:1.5;margin:0 0 8px;">Cari audio pada Internet Archive. Tutup tampilan pemutar untuk kembali bekerja; musik tetap berjalan. Ikon ♫ membuka kembali kontrol musik.</p>
                <button type="button" onclick="bukaPemutarMusik()" class="form-control" style="cursor:pointer;"><i class="fa-solid fa-music"></i> Buka pemutar musik</button>
            </div>
            <button type="button" class="btn-submit" onclick="saveProfileChanges()">Simpan Perubahan Pengaturan <i class="fa-solid fa-floppy-disk"></i></button>
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
            <span id="currentUserNameText"><?php echo htmlspecialchars((string)($_SESSION['nama_user'] ?? $globalConfig['admin_name']), ENT_QUOTES, 'UTF-8'); ?></span>
            <i class="fa-solid fa-gear" style="margin-left: 5px;"></i>
        </button>
        <button class="user-profile-btn" onclick="toggleSidebar()" title="Pusat Kendali">
            <i class="fa-solid fa-bars-staggered"></i>
        </button>
    </div>
    
    <!-- SIDEBAR PENGATURAN -->
    <div class="overlay" id="overlay" onclick="closeSidebar()"></div>
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <h3><i class="fa-solid fa-gears" style="color: var(--primary);"></i> Pusat Kendali</h3>
            <button class="close-sidebar" onclick="closeSidebar()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="sidebarMenuList">
<div id="teacherTools" class="teacher-tools" data-page="index" hidden>
    <h2>Akun mahasiswa & sinkronisasi</h2><span id="toolConnection"></span><button type="button" id="sync">Sinkronkan</button>
    <p id="toolNotice" role="status" aria-live="polite"></p><div id="toolBody"></div>
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
            <div class="form-group"><label>Tahun Akademik</label><select name="year" id="academicYear" class="form-control"><?php for($y=2025;$y<=2035;$y++):$v=$y.'/'.($y+1); ?><option value="<?php echo $v; ?>" <?php echo ($form_context['year']??'2026/2027')===$v?'selected':''; ?>><?php echo $v; ?></option><?php endfor; ?></select></div>
            <div class="form-group"><label>Periode Kuliah</label><select name="period" id="academicPeriod" class="form-control"><option value="Ganjil" <?php echo ($form_context['period']??((int)$form_context['semester']%2?'Ganjil':'Genap'))==='Ganjil'?'selected':''; ?>>Ganjil</option><option value="Genap" <?php echo ($form_context['period']??((int)$form_context['semester']%2?'Ganjil':'Genap'))==='Genap'?'selected':''; ?>>Genap</option></select></div>
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
            if(window.Android||window.AbsensiDesktop||matchMedia('(prefers-reduced-motion: reduce)').matches||navigator.deviceMemory<=4){canvas.hidden=true;return;}
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
                if(document.hidden||document.body.classList.contains('has-custom-wallpaper')){setTimeout(animateParticles,1000);return;}
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
            if(window.PresenAppearance){window.PresenAppearance.apply();return;}
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
            if(window.PresenAppearance){window.PresenAppearance.apply();return;}
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
            if (!document.body.classList.contains('portal-home')) initParticleCanvas();
            applySavedBgWallpaper();
            
            if (window.SERVER_CONFIG.isLoggedIn) {
                document.getElementById('authOverlay').style.display = 'none';
                loadLoginLogs();
            } else {
                document.getElementById('authOverlay').style.display = 'flex';
                document.getElementById('authOverlay').style.visibility = 'visible';
                document.getElementById('authOverlay').style.opacity = '1';
            }
            updateFormLogic();
            window.PresenStartup?.ready();
        };
        window.addEventListener('resize', applyBgWallpaperSizing, {passive:true});
        
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>' : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>';
            toast.innerHTML = icon;
            const label=document.createElement('span');label.textContent=String(message);toast.appendChild(label);
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }
        
        function setLoginPasswordVisibility() {
            const input=document.getElementById('authLogPass'),button=document.getElementById('toggleLoginPassword');
            const visible=input.type==='password';
            input.type=visible?'text':'password';
            button.setAttribute('aria-pressed',String(visible));
            button.setAttribute('aria-label',visible?'Sembunyikan kata sandi':'Tampilkan kata sandi');
            button.querySelector('i').className=visible?'fa-solid fa-eye-slash':'fa-solid fa-eye';
        }
        async function processAuthPrivate() {
            const form=document.getElementById('formLoginAuth'),button=form.querySelector('.btn-submit');
            if(button.disabled)return;
            const user = document.getElementById('authLogName').value.trim();
            const pass = document.getElementById('authLogPass').value;
            
            if(!user || !pass) {
                showToast("Isi ID akun dan kata sandi.", "error");
                return;
            }
            button.disabled=true;form.setAttribute('aria-busy','true');
            let stage='login';
            try {
                // Match the request format checked on live hosting; never save the password.
                const response=await fetch('index.php',{method:'POST',credentials:'same-origin',cache:'no-store',body:new URLSearchParams({action:'login_privat',username:user,password:pass})});
                let data;
                try {data=await response.json();}
                catch (_) {throw Error('Server mengirim respons login yang tidak terbaca'+(response.status!==200?' (HTTP '+response.status+')':'')+'. Coba lagi sebentar.');}
                if(!response.ok||data.status!=='success')throw Error(data.msg||data.message||'Login belum berhasil. Coba lagi.');
                stage='sync';
                try {
                    await window.WATeacher?.prepare();
                } catch(error) {
                    if(['QuotaExceededError','InvalidStateError','SecurityError','NotAllowedError'].includes(error.name))throw Error('Penyimpanan browser belum dapat digunakan. Izinkan penyimpanan situs lalu coba lagi; data tidak dihapus.');
                    throw error;
                }
                stage='intro';
                showToast(data.msg, 'success');
                document.getElementById('currentUserNameText').innerText = data.user;
                document.getElementById('activeUserForm').value = data.user;
                // Decorative effects must not turn an accepted login into an error.
                try {
                    const introOverlay = document.getElementById('introOverlay');
                    introOverlay.hidden = false;
                    introOverlay.classList.add('active');
                    document.getElementById('introContent').classList.add('show-text');
                    playSciFiChime();
                } catch (_) {}
                if (window.WATeacher) {
                    window.PresenStartup?.transfer();
                    setTimeout(() => location.reload(), matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 180);
                } else {
                    document.getElementById('authOverlay').style.display = 'none';
                    loadLoginLogs();
                    setTimeout(() => document.getElementById('introOverlay')?.classList.remove('active'),180);
                }
            } catch(error) {
                const message=error instanceof TypeError?'Sambungan ke server terputus. Periksa internet lalu coba lagi.':error.message||'Permintaan belum berhasil. Coba lagi.';
                showToast((stage==='sync'?'Login diterima, tetapi sinkronisasi belum siap: ':'')+message,'error');
            } finally {button.disabled=false;form.removeAttribute('aria-busy');}
        }
        function toggleTeacherRegistration(show) {
            document.getElementById('formLoginAuth').hidden=show;
            document.getElementById('formRegisterTeacher').hidden=!show;
            document.querySelector('#authOverlay .auth-card h2').textContent=show?'Daftar akun':'Masuk ke Sistem';
        }
        async function registerTeacherAccount(event) {
            event.preventDefault();
            const form=event.target,status=document.getElementById('teacherRegistrationStatus'),button=form.querySelector('[type=submit]');
            button.disabled=true;status.textContent='Menyiapkan pendaftaran…';
            try {
                const fields=new FormData(form),file=fields.get('avatar_file');fields.delete('avatar_file');fields.set('action','register_teacher');
                if(file?.size){
                    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('Pilih foto JPG, PNG, atau WebP maksimal 4 MB.');
                    const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height));
                    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
                    const avatar=canvas.toDataURL('image/jpeg',.78);if(avatar.length>310000)throw Error('Foto terlalu besar. Coba foto lain.');fields.set('avatar',avatar);
                }
                const response=await fetch('index.php',{method:'POST',body:fields,credentials:'same-origin'}),result=await response.json();
                if(!response.ok||result.status!=='success')throw Error(result.msg||'Pendaftaran gagal.');
                status.textContent=result.msg;form.reset();
            }catch(error){status.textContent=error.message||'Pendaftaran belum berhasil.';}finally{button.disabled=false;}
        }
        async function saveAdminHomeLayout() {
            const select=document.getElementById('adminHomeLayout'),body=new FormData();body.set('action','set_home_layout');body.set('layout',select.value);body.set('csrf',window.SERVER_CONFIG.csrf);
            const result=await fetch('index.php',{method:'POST',body,credentials:'same-origin'}).then(r=>r.json());
            if(result.status==='success'){document.body.dataset.homeLayout=result.layout;showToast('Tata letak berlaku untuk semua akun.','success');}
            else showToast(result.msg||'Tata letak belum tersimpan.','error');
        }
        async function loadTeacherPendingAccounts() {
            const box=document.getElementById('teacherPendingAccounts');if(!box)return;
            const body=new FormData();body.set('action','teacher_accounts');
            try{const result=await fetch('index.php',{method:'POST',body,credentials:'same-origin'}).then(r=>r.json());if(result.status!=='success')throw Error();
                box.replaceChildren();if(!result.accounts.length){box.textContent='Tidak ada pendaftaran menunggu.';return;}
                for(const account of result.accounts){const row=document.createElement('div');row.className='p-teacher-request';const text=document.createElement('span');text.textContent=account.display_name+' · '+account.username+' · '+(account.role==='admin'?'meminta akses administrator':'dosen');row.append(text);
                    for(const [decision,label] of [['approve','Setujui'],['reject','Tolak']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;const request=new FormData();request.set('action','review_teacher');request.set('id',account.id);request.set('decision',decision);request.set('csrf',window.SERVER_CONFIG.csrf);try{const answer=await fetch('index.php',{method:'POST',body:request,credentials:'same-origin'}).then(r=>r.json());if(answer.status!=='success')throw Error(answer.msg||'Keputusan belum tersimpan.');await loadTeacherPendingAccounts();}catch(error){showToast(error.message,'error');button.disabled=false;}};row.append(button);}box.append(row);
                }
            }catch(_){box.textContent='Pendaftaran belum dapat dimuat.';}
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
            const layout=document.getElementById('adminHomeLayout');if(layout){layout.value=document.body.dataset.homeLayout||'left';void loadTeacherPendingAccounts();}
        }
        
        function closeProfileModal() {
            document.getElementById('profileModal').classList.remove('active');
        }
        
        async function handleAvatarUpload(event) {
            const file = event.target.files[0];
            if (file) {
                try{
                    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('Pilih JPG, PNG, atau WebP maksimal 4 MB.');
                    const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height));
                    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
                    uploadedBase64Avatar=canvas.toDataURL('image/jpeg',.78);
                    document.getElementById('previewAvatarImg').src=uploadedBase64Avatar;
                }catch(error){showToast(error.message||'Foto belum dapat dibaca.','error');}
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
            formData.append('csrf', window.SERVER_CONFIG.csrf || '');
            formData.append('admin_name', newName);
            formData.append('admin_role', newRole);
            formData.append('professional_title', document.getElementById('editProfessionalTitle').value);
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
                    document.getElementById('currentUserNameText').innerText = newName + (document.getElementById('editProfessionalTitle').value ? ', '+document.getElementById('editProfessionalTitle').value : '');
                    void window.WA?.sync();
                    document.getElementById('widgetAvatarImg').src = uploadedBase64Avatar;
                    document.getElementById('topNavAvatarImg').src = uploadedBase64Avatar;
                    closeProfileModal();
                } else {
                    showToast('Gagal memperbarui profil', 'error');
                }
            });
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
            semesterSelect.onchange=()=>{document.getElementById('academicPeriod').value=Number(semesterSelect.value)%2?'Ganjil':'Genap';};
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
