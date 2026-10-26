<?php
require_once __DIR__.'/auth_guard.php';
require_once __DIR__.'/teacher_accounts.php';
require_once __DIR__.'/app_attendance.php';
require_once __DIR__.'/app_evidence.php';
require_once __DIR__.'/app_push.php';
require_once __DIR__.'/app_classes.php';
require_once __DIR__.'/app_branding.php';
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
    if($action==='brand-worker'){wa_brand_worker_auth($raw);wa_response(['status'=>'success']+wa_brand_worker($input));}
    if($action==='teacher-directory'){
        $teachers=[];foreach(array_merge(['admin_01','dosen_01'],array_column(wa_rows("SELECT id FROM wa_teacher_accounts WHERE status='active' ORDER BY display_name"),'id')) as $id){$teacher=wa_teacher_account($id);if($teacher)$teachers[]=['id'=>$id,'name'=>wa_teacher_label($teacher)];}
        wa_response(['status'=>'success','teachers'=>$teachers]);
    }
    if($action==='resolve-class-invite')wa_response(['status'=>'success','invite'=>wa_resolve_class_invite((string)($input['token']??''))]);
    if($action==='home-layout')wa_response(['status'=>'success','layout'=>teacher_home_layout()]);
    if($action==='bootstrap') {
        // Login establishes a PHP session and cookie. A bearer left in IndexedDB
        // belongs to the previous device/account and must not override that cookie.
        unset($_SERVER['HTTP_AUTHORIZATION']);
        if(!app_session_user_is_authenticated())wa_response(['status'=>'error','message'=>'Masuk dengan akun dosen terlebih dahulu.'],401);
        $pub=wa_text($input['pubkey']??'',300); wa_pub_pem($pub);
        $device=wa_device();
        if($device&&$device['role']==='teacher'&&$device['account_id']===$_SESSION['id_user']&&$device['pubkey']===$pub)$issued=['device'=>$device,'token'=>str_starts_with($_SERVER['HTTP_AUTHORIZATION']??'','Bearer ')?substr($_SERVER['HTTP_AUTHORIZATION'],7):($_COOKIE['wa_device']??'')];
        else $issued=wa_issue_device($_SESSION['id_user'],'teacher',$pub);
        wa_response(['status'=>'success','token'=>$issued['token'],'snapshot'=>wa_snapshot($issued['device'])]);
    }
    if($action==='register'||$action==='student-login') {
        $GLOBALS['wa_request_owner']='admin_01'; $ctx=wa_ctx($input['ctx']??null); if(!empty($input['invite'])){$invitation=wa_resolve_class_invite((string)$input['invite']);if(wa_ctx_key($ctx)!==wa_ctx_key($invitation['ctx']))throw new DomainException('Undangan tidak sesuai dengan kelas yang dipilih.');$ctx=$invitation['ctx'];} $nim=wa_nim($input['nim']??''); $pin=wa_text($input['pin']??'',12); $pub=wa_text($input['pubkey']??'',300); wa_pub_pem($pub);
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
            wa_query('INSERT INTO wa_accounts(id,nim,nama,jk,ctx,ctx_key,pin_hash,created_at,owner_id) VALUES(?,?,?,?,?,?,?,?,?)',[$id,$nim,$name,$jk,wa_json($ctx),wa_ctx_key($ctx),password_hash($pin,PASSWORD_DEFAULT),wa_now(),wa_context_owner($ctx)]);
            $account=wa_one('SELECT * FROM wa_accounts WHERE id=?',[$id]);
            }
        }elseif(!$account||!password_verify($pin,$account['pin_hash']))wa_response(['status'=>'error','message'=>'NIM, PIN, atau kelas tidak cocok.'],401);
        wa_query('DELETE FROM wa_login_attempts WHERE bucket=?',[$bucket]);
        session_unset();
        $GLOBALS['wa_request_owner']=$account['owner_id']; $issued=wa_issue_device($account['id'],'student',$pub);
        wa_response(['status'=>'success','token'=>$issued['token'],'snapshot'=>wa_snapshot($issued['device'])]);
    }
    $device=wa_device(); if(!$device)wa_response(['status'=>'error','message'=>'Silakan masuk kembali.','code'=>'AUTH_REQUIRED'],401);
    // Read-only refreshes must not hold the browser's PHP session lock while building responses.
    if(in_array($action,['snapshot','appearance-read','maps-config'],true)&&session_status()===PHP_SESSION_ACTIVE)session_write_close();
    if($action==='brand-status'){wa_response(['status'=>'success','branding'=>wa_brand_read($device,false)]);}
    if($action==='brand-read'){wa_response(['status'=>'success','branding'=>wa_brand_read($device)]);}
    if($action==='brand-save'){wa_response(['status'=>'success','branding'=>wa_brand_save($device,$input)]);}
    if($action==='appearance-read'){wa_teacher($device);wa_response(['status'=>'success','appearance'=>wa_appearance_read($device)]);}
    if($action==='appearance-save')wa_response(wa_appearance_save($device,$input));
    if($action==='create-class-invite')wa_response(['status'=>'success','invite'=>wa_create_class_invite($device,$input)]);
    if($action==='update-teacher-profile'){wa_teacher($device);wa_save_teacher_identity($device['account_id'],(string)($input['name']??''),(string)($input['title']??''));wa_response(['status'=>'success','teacher'=>wa_teacher_account($device['account_id'])]);}
    if($action==='resolve-session-qr'){
        $student=wa_approved_student($device);
        $session=wa_one('SELECT * FROM wa_sessions WHERE id=?',[wa_id($input['id']??'')]);
        if(!$session||$session['owner_id']!==$student['owner_id']||wa_ctx_key(json_decode($session['ctx'],true))!==$student['ctx_key'])throw new DomainException('QR tidak sesuai dengan dosen atau kelas Anda.');
        $teacher=wa_one('SELECT * FROM wa_devices WHERE id=? AND revoked=0',[$session['teacher_id']]);
        if(!$teacher)throw new DomainException('Sesi dosen sudah tidak aktif.');wa_teacher($teacher);
        $challenge=wa_open($session['challenge'],$teacher['pubkey']);
        if((int)($input['version']??0)!==(int)$session['version']||!hash_equals((string)$challenge['nonce'],(string)($input['nonce']??'')))throw new InvalidArgumentException('QR sudah diganti atau tidak valid. Pindai QR terbaru.');
        if(wa_now()<(int)$session['starts']||wa_now()>=(int)$session['deadline'])throw new InvalidArgumentException('Sesi absensi belum dimulai atau sudah selesai.');
        if(!in_array($student['nim'],json_decode($session['roster'],true),true))throw new DomainException('Mahasiswa belum terdaftar pada sesi ini.');
        $profile=wa_profile($teacher);
        wa_response(['status'=>'success','code'=>'WA1:'.wa_b64(wa_json(['type'=>'session','certificate'=>$profile['certificate'],'challenge'=>$session['challenge']]))]);
    }
    if($action==='maps-config'){
        wa_teacher($device);
        wa_response(['status'=>'success','embedKey'=>(string)(getenv('GOOGLE_MAPS_BROWSER_KEY')?:wa_one("SELECT value FROM wa_meta WHERE k='google_maps_browser_key'")['value']??''),'javascriptKey'=>(string)(getenv('GOOGLE_MAPS_JAVASCRIPT_BROWSER_KEY')?:wa_one("SELECT value FROM wa_meta WHERE k='google_maps_javascript_browser_key'")['value']??'')]);
    }
    if($action==='set-maps-config'){
        wa_teacher($device);if((wa_teacher_account($device['account_id'])['role']??'')!=='admin')throw new DomainException('Hanya administrator yang dapat mengatur Google Maps.');
        $key=wa_text($input['key']??'',180);if($key!==''&&!preg_match('/^[A-Za-z0-9_-]{20,180}$/D',$key))throw new InvalidArgumentException('Kunci Google Maps tidak valid.');
        $javascriptKey=array_key_exists('javascriptKey',$input)?wa_text($input['javascriptKey'],180):null;
        if($javascriptKey!==null&&$javascriptKey!==''&&!preg_match('/^[A-Za-z0-9_-]{20,180}$/D',$javascriptKey))throw new InvalidArgumentException('Kunci Maps JavaScript tidak valid.');
        if($javascriptKey===null)wa_query("INSERT INTO wa_meta(k,value) VALUES('google_maps_browser_key',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[$key]);
        else wa_query("INSERT INTO wa_meta(k,value) VALUES('google_maps_browser_key',?),('google_maps_javascript_browser_key',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[$key,$javascriptKey]);
        wa_response(['status'=>'success']);
    }
    if($action==='upload-evidence')wa_response(wa_evidence_upload($device,$input));
    if($action==='read-evidence')wa_response(wa_evidence_read($device,wa_text($input['id']??'',36)));
    if($action==='delete-account')wa_response(wa_delete_account($device,$input));
    if($action==='reset-all-student-data')wa_response(wa_reset_all_student_data($device,wa_text($input['confirmation']??'',80)));
    if($action==='push-unsubscribe'){wa_query('DELETE FROM wa_push_devices WHERE device_id=?',[$device['id']]);wa_response(['status'=>'success']);}
    if($action==='push-key')wa_response(['status'=>'success','publicKey'=>wa_push_key()['public']]);
    if($action==='push-subscribe'){wa_push_subscribe($device,$input['subscription']??[]);wa_response(['status'=>'success']);}
    if($action==='dispatch-push'){wa_teacher($device);session_write_close();try{wa_push_pending();}catch(Throwable $ignored){error_log('WA push deferred');}wa_response(['status'=>'success']);}
    if($action==='logout') { wa_revoke_current(); session_unset(); session_destroy(); wa_response(['status'=>'success']); }
    if($action==='snapshot'){ $snapshot=wa_snapshot($device); if(isset($input['knownTag'])&&hash_equals($snapshot['tag'],(string)$input['knownTag']))wa_response(['status'=>'success','unchanged'=>true,'serverTime'=>$snapshot['serverTime']]); wa_response(['status'=>'success','snapshot'=>$snapshot]); }
    if($action==='sync') {
        $ops=is_array($input['operations']??null)?$input['operations']:[];
        $epoch=wa_student_data_epoch();
        if($device['role']==='teacher'&&array_filter($ops,static fn($op)=>(int)($op['resetEpoch']??0)!==$epoch))wa_response(['status'=>'success','resetRequired'=>true,'snapshot'=>wa_snapshot($device)]);
        $results=wa_sync($device,$ops); wa_response(['status'=>'success','results'=>$results,'snapshot'=>wa_snapshot($device)]);
    }
    if($action==='audit') { wa_teacher($device); wa_response(['status'=>'success','audit'=>wa_rows('SELECT a.device_id,a.action,a.reference_id,a.details,a.created_at FROM wa_audit a JOIN wa_devices d ON d.id=a.device_id WHERE d.account_id=? ORDER BY a.id DESC LIMIT 500',[$device['account_id']])]); }
    throw new InvalidArgumentException('Fitur aplikasi tidak dikenali.');
}catch(DomainException $error) { wa_response(['status'=>'error','message'=>$error->getMessage()],403); }
catch(InvalidArgumentException|JsonException $error) { wa_response(['status'=>'error','message'=>$error->getMessage()],422); }
catch(Throwable $error) { error_log('WA API error: '.get_class($error)); wa_response(['status'=>'error','message'=>'Layanan belum dapat menyimpan data. Salinan di perangkat tetap tersedia.'],503); }
