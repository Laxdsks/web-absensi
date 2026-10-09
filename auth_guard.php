<?php
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
require_once __DIR__.'/app_core.php';
wa_restore_teacher();

function app_session_user_is_authenticated(): bool
{
    return isset($_SESSION['id_user'])
        && in_array((string)$_SESSION['id_user'], ['admin_01', 'dosen_01'], true);
}

function app_require_authenticated_user(bool $jsonResponse = false, bool $adminOnly = false): void
{
    $isAuthenticated = app_session_user_is_authenticated();
    $isAdmin = isset($_SESSION['id_user']) && (string)$_SESSION['id_user'] === 'admin_01';
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
