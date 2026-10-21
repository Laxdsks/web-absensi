<?php
require_once __DIR__.'/app_core.php';

function teacher_avatar($value): string {
    if ($value === '' || $value === null) return '';
    if (!is_string($value) || strlen($value) > 310000 || !preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$~D', $value, $matches)) throw new InvalidArgumentException('Foto profil harus JPG, PNG, atau WebP maksimal 220 KB.');
    $bytes=base64_decode($matches[2], true);
    $image=$bytes===false?false:getimagesizefromstring($bytes);
    $mime=['png'=>'image/png','jpeg'=>'image/jpeg','webp'=>'image/webp'][$matches[1]];
    if ($bytes===false || strlen($bytes)>220000 || !$image || ($image['mime']??'')!==$mime || $image[0]>2048 || $image[1]>2048) throw new InvalidArgumentException('Foto profil tidak valid atau terlalu besar.');
    return $value;
}
function teacher_registration(array $input): array {
    $username=wa_text($input['username']??'',50);
    $name=wa_text($input['display_name']??'',100);
    $password=(string)($input['password']??'');
    $role=(string)($input['role']??'teacher');
    if(!preg_match('/^[A-Za-z][A-Za-z0-9_.-]{3,49}$/D',$username)||mb_strlen($name)<2||strlen($password)<10||strlen($password)>128||!in_array($role,['teacher','admin'],true)) throw new InvalidArgumentException('Isi ID akun, nama, jabatan, dan kata sandi minimal 10 karakter.');
    $avatar=teacher_avatar($input['avatar']??'');
    $bucket=hash('sha256','teacher-register|'.($_SERVER['REMOTE_ADDR']??''));
    $recent=wa_one('SELECT attempts,started_at FROM wa_login_attempts WHERE bucket=?',[$bucket]);
    if($recent&&(int)$recent['started_at']>wa_now()-3600000&&(int)$recent['attempts']>=5) throw new DomainException('Batas pendaftaran tercapai. Coba lagi nanti.');
    if(!$recent||(int)$recent['started_at']<=wa_now()-3600000)wa_query('INSERT INTO wa_login_attempts(bucket,attempts,started_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=1,started_at=VALUES(started_at)',[$bucket,wa_now()]);
    else wa_query('UPDATE wa_login_attempts SET attempts=attempts+1 WHERE bucket=?',[$bucket]);
    if(in_array(strtolower($username),['m.fadillah','fall','zen'],true)||wa_one('SELECT id FROM wa_teacher_accounts WHERE username=?',[$username])) throw new InvalidArgumentException('ID akun sudah digunakan. Pilih ID lain.');
    $id=wa_uuid();
    wa_query('INSERT INTO wa_teacher_accounts(id,username,display_name,password_hash,role,status,avatar,created_at) VALUES(?,?,?,?,?,?,?,?)',[$id,$username,$name,password_hash($password,PASSWORD_DEFAULT),$role,'pending',$avatar,wa_now()]);
    return ['id'=>$id,'status'=>'pending'];
}
function teacher_login(string $username,string $password): ?array {
    $bucket=hash('sha256','teacher-login|'.($_SERVER['REMOTE_ADDR']??'').'|'.strtolower($username));
    $recent=wa_one('SELECT attempts,started_at FROM wa_login_attempts WHERE bucket=?',[$bucket]);
    if($recent&&(int)$recent['started_at']>wa_now()-600000&&(int)$recent['attempts']>=10)throw new DomainException('Terlalu banyak percobaan. Tunggu 10 menit.');
    if(!$recent||(int)$recent['started_at']<=wa_now()-600000)wa_query('INSERT INTO wa_login_attempts(bucket,attempts,started_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=1,started_at=VALUES(started_at)',[$bucket,wa_now()]);
    else wa_query('UPDATE wa_login_attempts SET attempts=attempts+1 WHERE bucket=?',[$bucket]);
    $account=wa_one('SELECT id,username,display_name,password_hash,role,status,avatar FROM wa_teacher_accounts WHERE username=?',[$username]);
    if(!$account||!password_verify($password,$account['password_hash']))return null;
    if($account['status']!=='active')throw new DomainException($account['status']==='pending'?'Pendaftaran menunggu persetujuan administrator.':'Akun ini belum aktif.');
    wa_query('DELETE FROM wa_login_attempts WHERE bucket=?',[$bucket]);
    unset($account['password_hash']);return $account;
}
function teacher_pending_accounts(): array {
    return wa_rows("SELECT id,username,display_name,role,status,created_at FROM wa_teacher_accounts WHERE status='pending' ORDER BY created_at");
}
function teacher_review_account(string $id,string $decision): void {
    $id=wa_id($id);
    if(!in_array($decision,['approve','reject'],true))throw new InvalidArgumentException('Keputusan tidak valid.');
    $account=wa_one('SELECT status FROM wa_teacher_accounts WHERE id=?',[$id]);
    if(!$account||$account['status']!=='pending')throw new InvalidArgumentException('Pendaftaran sudah diproses.');
    wa_query('UPDATE wa_teacher_accounts SET status=? WHERE id=? AND status=?',[$decision==='approve'?'active':'rejected',$id,'pending']);
}
function teacher_home_layout(): string {
    try {$layout=wa_one("SELECT value FROM wa_meta WHERE k='home_layout'")['value']??'left';}
    catch(Throwable $ignored){return 'left';}
    return in_array($layout,['left','center','right'],true)?$layout:'left';
}
function teacher_set_home_layout(string $layout): void {
    if(!in_array($layout,['left','center','right'],true))throw new InvalidArgumentException('Posisi formulir tidak valid.');
    wa_query("INSERT INTO wa_meta(k,value) VALUES('home_layout',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[$layout]);
}
