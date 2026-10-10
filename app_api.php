<?php
require_once __DIR__.'/auth_guard.php';
require_once __DIR__.'/app_attendance.php';
require_once __DIR__.'/app_push.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function wa_response(array $data,int $code=200): void { http_response_code($code); echo wa_json($data); exit; }
try {
    if($_SERVER['REQUEST_METHOD']==='GET'&&($_GET['action']??'')==='health')wa_response(['status'=>'success','build'=>WA_BUILD,'timezone'=>'Asia/Jakarta']);
    $origin=(string)($_SERVER['HTTP_ORIGIN']??'');
    $sameHost=$origin===''||parse_url($origin,PHP_URL_HOST)===preg_replace('/:\d+$/','',(string)($_SERVER['HTTP_HOST']??''));
    if(!$sameHost)wa_response(['status'=>'error','message'=>'Buka aplikasi dari alamat resminya.'],403);
    if($_SERVER['REQUEST_METHOD']!=='POST'||($_SERVER['HTTP_X_APP_REQUEST']??'')!=='1'||!str_starts_with((string)($_SERVER['CONTENT_TYPE']??''),'application/json'))wa_response(['status'=>'error','message'=>'Permintaan aplikasi tidak valid.'],405);
    $raw=file_get_contents('php://input');
    if(strlen($raw)>4000000)wa_response(['status'=>'error','message'=>'Permintaan terlalu besar.'],413);
    $input=json_decode($raw,true,64,JSON_THROW_ON_ERROR); if(!is_array($input))throw new InvalidArgumentException('Permintaan tidak terbaca.');
    $action=(string)($input['action']??'');
    if($action==='bootstrap') {
        if(!app_session_user_is_authenticated())wa_response(['status'=>'error','message'=>'Masuk dengan akun dosen terlebih dahulu.'],401);
        $pub=wa_text($input['pubkey']??'',300); wa_pub_pem($pub);
        $device=wa_device();
        if($device&&$device['role']==='teacher'&&$device['account_id']===$_SESSION['id_user']&&$device['pubkey']===$pub)$issued=['device'=>$device,'token'=>str_starts_with($_SERVER['HTTP_AUTHORIZATION']??'','Bearer ')?substr($_SERVER['HTTP_AUTHORIZATION'],7):($_COOKIE['wa_device']??'')];
        else $issued=wa_issue_device($_SESSION['id_user'],'teacher',$pub);
        wa_response(['status'=>'success','token'=>$issued['token'],'snapshot'=>wa_snapshot($issued['device'])]);
    }
    if($action==='register'||$action==='student-login') {
        $ctx=wa_ctx($input['ctx']??null); $nim=wa_nim($input['nim']??''); $pin=wa_text($input['pin']??'',12); $pub=wa_text($input['pubkey']??'',300); wa_pub_pem($pub);
        if(!preg_match('/^\d{6,12}$/',$pin))throw new InvalidArgumentException('Gunakan PIN 6–12 angka.');
        $bucket=hash('sha256',($_SERVER['REMOTE_ADDR']??'').'|'.$nim.'|'.wa_ctx_key($ctx));
        $attempt=wa_one('SELECT * FROM wa_login_attempts WHERE bucket=?',[$bucket]);
        if($attempt&&(int)$attempt['attempts']>=10&&(int)$attempt['started_at']>wa_now()-600000)wa_response(['status'=>'error','message'=>'Terlalu banyak percobaan. Tunggu 10 menit.'],429);
        if(!$attempt||(int)$attempt['started_at']<wa_now()-600000)wa_query('INSERT INTO wa_login_attempts(bucket,attempts,started_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=1,started_at=VALUES(started_at)',[$bucket,wa_now()]);
        else wa_query('UPDATE wa_login_attempts SET attempts=attempts+1 WHERE bucket=?',[$bucket]);
        $account=wa_one('SELECT * FROM wa_accounts WHERE nim=? AND ctx_key=?',[$nim,wa_ctx_key($ctx)]);
        if($action==='register') {
            if($account&&!password_verify($pin,$account['pin_hash']))throw new InvalidArgumentException('NIM di kelas ini sudah didaftarkan. Gunakan menu Masuk mahasiswa dengan PIN sebelumnya.');
            $name=wa_text($input['nama']??''); $jk=wa_text($input['jk']??'',1);
            if(strlen($name)<2||!in_array($jk,['L','P'],true))throw new InvalidArgumentException('Lengkapi nama dan L/P.');
            if(!$account){
            $id=wa_uuid();
            wa_query('INSERT INTO wa_accounts(id,nim,nama,jk,ctx,ctx_key,pin_hash,created_at) VALUES(?,?,?,?,?,?,?,?)',[$id,$nim,$name,$jk,wa_json($ctx),wa_ctx_key($ctx),password_hash($pin,PASSWORD_DEFAULT),wa_now()]);
            $account=wa_one('SELECT * FROM wa_accounts WHERE id=?',[$id]);
            }
        }elseif(!$account||!password_verify($pin,$account['pin_hash']))wa_response(['status'=>'error','message'=>'NIM, PIN, atau kelas tidak cocok.'],401);
        wa_query('DELETE FROM wa_login_attempts WHERE bucket=?',[$bucket]);
        session_unset();
        $issued=wa_issue_device($account['id'],'student',$pub);
        wa_response(['status'=>'success','token'=>$issued['token'],'snapshot'=>wa_snapshot($issued['device'])]);
    }
    $device=wa_device(); if(!$device)wa_response(['status'=>'error','message'=>'Silakan masuk kembali.','code'=>'AUTH_REQUIRED'],401);
    if($action==='push-key')wa_response(['status'=>'success','publicKey'=>wa_push_key()['public']]);
    if($action==='push-subscribe'){wa_push_subscribe($device,$input['subscription']??[]);wa_response(['status'=>'success']);}
    if($action==='dispatch-push'){wa_teacher($device);session_write_close();try{wa_push_pending();}catch(Throwable $ignored){error_log('WA push deferred');}wa_response(['status'=>'success']);}
    if($action==='logout') { wa_revoke_current(); session_unset(); session_destroy(); wa_response(['status'=>'success']); }
    if($action==='snapshot'){ $snapshot=wa_snapshot($device); if(isset($input['knownTag'])&&hash_equals($snapshot['tag'],(string)$input['knownTag']))wa_response(['status'=>'success','unchanged'=>true,'serverTime'=>$snapshot['serverTime']]); wa_response(['status'=>'success','snapshot'=>$snapshot]); }
    if($action==='sync') { $ops=is_array($input['operations']??null)?$input['operations']:[]; $results=wa_sync($device,$ops); wa_response(['status'=>'success','results'=>$results,'snapshot'=>wa_snapshot($device)]); }
    if($action==='audit') { wa_teacher($device); wa_response(['status'=>'success','audit'=>wa_rows('SELECT device_id,action,reference_id,details,created_at FROM wa_audit ORDER BY id DESC LIMIT 500')]); }
    throw new InvalidArgumentException('Fitur aplikasi tidak dikenali.');
}catch(DomainException $error) { wa_response(['status'=>'error','message'=>$error->getMessage()],403); }
catch(InvalidArgumentException|JsonException $error) { wa_response(['status'=>'error','message'=>$error->getMessage()],422); }
catch(Throwable $error) { error_log('WA API error: '.get_class($error)); wa_response(['status'=>'error','message'=>'Layanan belum dapat menyimpan data. Salinan di perangkat tetap tersedia.'],503); }
