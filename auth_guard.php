<?php
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
require_once __DIR__.'/app_core.php';
wa_restore_teacher();

function app_session_user_is_authenticated(): bool
{
    if(!isset($_SESSION['id_user']))return false;
    if(!wa_active_teacher((string)$_SESSION['id_user'])){
        unset($_SESSION['id_user'],$_SESSION['nama_user'],$_SESSION['role'],$_SESSION['konteks_siswa']);
        return false;
    }
    if(!empty($_COOKIE['wa_device'])){
        $device=wa_device();
        if(!$device || $device['role']!=='teacher'||$device['account_id']!==(string)$_SESSION['id_user']){
            unset($_SESSION['id_user'],$_SESSION['nama_user'],$_SESSION['role'],$_SESSION['konteks_siswa']);
            return false;
        }
    }
    $GLOBALS['wa_request_owner']=(string)$_SESSION['id_user'];
    return true;
}

function app_require_authenticated_user(bool $jsonResponse = false, bool $adminOnly = false): void
{
    $isAuthenticated = app_session_user_is_authenticated();
    $isAdmin = $isAuthenticated && (wa_teacher_account((string)$_SESSION['id_user'])['role'] ?? '') === 'admin';
    if ($isAuthenticated && (!$adminOnly || $isAdmin)) {
        return;
    }

    if ($jsonResponse) {
        http_response_code($isAuthenticated ? 403 : 401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'error',
            'message' => $isAuthenticated ? 'Fitur ini hanya tersedia untuk administrator.' : 'Silakan masuk untuk melanjutkan.'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        header('Location: index.php?auth=required', true, 302);
    }
    exit;
}
