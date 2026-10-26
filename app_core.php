<?php
// Shared storage and identity services. This file never returns database secrets.
const WA_BUILD = '20261026-presen-1210-print-layout-r3';
const WA_PRODI = ['Pendidikan Teknologi Informasi', 'Pendidikan Guru Sekolah Dasar', 'Pendidikan Jasmani Kesehatan dan Rekreasi', 'Pendidikan Bahasa dan Sastra Indonesia', 'Pendidikan Sejarah', 'Pendidikan Bahasa Inggris'];

function wa_teacher_startup_head(): void {
    echo '<style id="presenTeacherStartupStyle">'.file_get_contents(__DIR__.'/app/teacher-startup.css').'</style>';
    echo '<script data-teacher-startup>/* app/teacher-startup.js */'.file_get_contents(__DIR__.'/app/teacher-startup.js').'</script>';
}
function wa_teacher_shell_assets(): void {
    echo '<style id="presenTeacherShellStyle">'.file_get_contents(__DIR__.'/app/teacher-shell.css').'</style>';
    $entry = 'app/runtime-teacher-1.2.10-'.WA_BUILD.'.js';
    echo '<script data-teacher-bundle src="'.$entry.'?v='.WA_BUILD.'" defer></script>';
}

function wa_db(): mysqli {
    static $db;
    if ($db instanceof mysqli) return $db;
    $koneksi = null; $conn = null;
    require 'koneksi.php';
    $db = $koneksi instanceof mysqli ? $koneksi : $conn;
    if (!($db instanceof mysqli)) throw new RuntimeException('Database belum tersedia.');
    $db->set_charset('utf8mb4');
    wa_schema($db);
    return $db;
}

function wa_schema(mysqli $db): void {
    try { $v=$db->query("SELECT value FROM wa_meta WHERE k='schema_version'")->fetch_assoc(); if(($v['value']??'')==='10')return; } catch(mysqli_sql_exception $ignored) {}
    if((int)($db->query("SELECT GET_LOCK(CONCAT('wa_schema:',DATABASE()),10) AS acquired")->fetch_assoc()['acquired']??0)!==1)throw new RuntimeException('Pembaruan penyimpanan sedang diproses. Coba lagi.');
    try {
        try {$v=$db->query("SELECT value FROM wa_meta WHERE k='schema_version'")->fetch_assoc();if(($v['value']??'')==='10')return;}catch(mysqli_sql_exception $ignored){}
    $tables = [
        "CREATE TABLE IF NOT EXISTS wa_push_devices (device_id CHAR(36) PRIMARY KEY, subscription TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_push_sent (device_id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, phase VARCHAR(100) NOT NULL, PRIMARY KEY(device_id,session_id,phase)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_meta (k VARCHAR(60) PRIMARY KEY, value MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_accounts (id CHAR(36) PRIMARY KEY, nim VARCHAR(50) NOT NULL, nama VARCHAR(255) NOT NULL, jk CHAR(1) NOT NULL, ctx TEXT NOT NULL, ctx_key CHAR(64) NOT NULL, pin_hash VARCHAR(255) NOT NULL, approved TINYINT NOT NULL DEFAULT 0, approved_by VARCHAR(60), created_at BIGINT NOT NULL, UNIQUE KEY account_identity(ctx_key,nim)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_class_invites (token_hash CHAR(64) PRIMARY KEY, owner_id VARCHAR(60) NOT NULL, ctx TEXT NOT NULL, matkul VARCHAR(180) NOT NULL, reset_epoch INT NOT NULL, created_at BIGINT NOT NULL, KEY invite_owner(owner_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_devices (id CHAR(36) PRIMARY KEY, account_id VARCHAR(60) NOT NULL, role VARCHAR(12) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, pubkey TEXT NOT NULL, revoked TINYINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_sessions (id CHAR(36) PRIMARY KEY, scope CHAR(64) NOT NULL, ctx TEXT NOT NULL, matkul VARCHAR(180) NOT NULL, slot SMALLINT NOT NULL, day CHAR(10) NOT NULL, starts BIGINT NOT NULL, deadline BIGINT NOT NULL, ends BIGINT NOT NULL, version INT NOT NULL, challenge MEDIUMTEXT NOT NULL, teacher_id CHAR(36) NOT NULL, roster MEDIUMTEXT NOT NULL, finalized TINYINT NOT NULL DEFAULT 0, UNIQUE KEY session_meeting(scope,slot)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_marks (scope CHAR(64) NOT NULL, slot SMALLINT NOT NULL, nim VARCHAR(50) NOT NULL, mark CHAR(1) NOT NULL, session_id CHAR(36), reason TEXT NOT NULL, location TEXT, source VARCHAR(20) NOT NULL, review_status VARCHAR(20) NOT NULL, revision INT NOT NULL DEFAULT 1, recorded_at BIGINT NOT NULL, PRIMARY KEY(scope,slot,nim)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_documents (scope CHAR(64) NOT NULL, kind VARCHAR(40) NOT NULL, ctx TEXT NOT NULL, matkul VARCHAR(180) NOT NULL, content MEDIUMTEXT NOT NULL, revision INT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(scope,kind)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_operations (id CHAR(36) PRIMARY KEY, device_id CHAR(36) NOT NULL, result TEXT NOT NULL, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, device_id CHAR(36) NOT NULL, action VARCHAR(40) NOT NULL, reference_id VARCHAR(120) NOT NULL, details TEXT NOT NULL, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_login_attempts (bucket CHAR(64) PRIMARY KEY, attempts INT NOT NULL, started_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    ];
    foreach ($tables as $sql) $db->query($sql);
    if(!$db->query("SHOW COLUMNS FROM wa_sessions LIKE 'finalized'")->num_rows)$db->query("ALTER TABLE wa_sessions ADD finalized TINYINT NOT NULL DEFAULT 0");
    foreach (['siswa','wa_accounts','wa_sessions','wa_marks','wa_documents'] as $table) {
        if (!$db->query("SHOW COLUMNS FROM {$table} LIKE 'owner_id'")->num_rows)
            $db->query("ALTER TABLE {$table} ADD owner_id VARCHAR(60) NOT NULL DEFAULT 'admin_01'");
    }
    if (!$db->query("SHOW COLUMNS FROM siswa LIKE 'academic_year'")->num_rows) $db->query("ALTER TABLE siswa ADD academic_year VARCHAR(9) NOT NULL DEFAULT '2026/2027'");
    if (!$db->query("SHOW COLUMNS FROM siswa LIKE 'academic_period'")->num_rows) $db->query("ALTER TABLE siswa ADD academic_period VARCHAR(6) NOT NULL DEFAULT ''");
    $db->query("UPDATE siswa SET academic_period=IF(MOD(CAST(REPLACE(semester,'Semester ','') AS UNSIGNED),2)=0,'Genap','Ganjil') WHERE academic_period=''");
    // One NIM per owner/class/year/period, including legacy label variants.
    if(!$db->query("SHOW COLUMNS FROM siswa LIKE 'wa_identity_key'")->num_rows){
        $db->query("ALTER TABLE siswa ADD wa_identity_key CHAR(64) GENERATED ALWAYS AS (CASE WHEN jenjang='S1' AND TRIM(nim)<>'' THEN SHA2(CONCAT_WS('|',TRIM(owner_id),LOWER(TRIM(prodi)),REPLACE(REPLACE(LOWER(TRIM(semester)),'semester',''),' ',''),UPPER(REPLACE(REPLACE(LOWER(TRIM(kelas)),'kelas',''),' ','')),TRIM(academic_year),LOWER(TRIM(academic_period)),UPPER(TRIM(nim))),256) ELSE NULL END) STORED");
    }
    if(!$db->query("SHOW INDEX FROM siswa WHERE Key_name='wa_unique_student_identity'")->num_rows){
        $db->query("UPDATE siswa kept JOIN (SELECT wa_identity_key,MIN(id) keep_id,MAX(NULLIF(TRIM(nama),'')) nonempty_name,MAX(NULLIF(TRIM(jk),'')) nonempty_sex FROM siswa WHERE wa_identity_key IS NOT NULL GROUP BY wa_identity_key HAVING COUNT(*)>1) duplicates ON kept.id=duplicates.keep_id SET kept.nama=IF(TRIM(kept.nama)='',duplicates.nonempty_name,kept.nama),kept.jk=IF(TRIM(kept.jk)='',COALESCE(duplicates.nonempty_sex,''),kept.jk)");
        $db->query("DELETE duplicate FROM siswa duplicate JOIN siswa kept ON duplicate.wa_identity_key=kept.wa_identity_key AND duplicate.id>kept.id WHERE duplicate.wa_identity_key IS NOT NULL");
        $db->query("UPDATE siswa SET nim=UPPER(TRIM(nim)),semester=REPLACE(REPLACE(LOWER(TRIM(semester)),'semester',''),' ',''),kelas=UPPER(REPLACE(REPLACE(LOWER(TRIM(kelas)),'kelas',''),' ','')) WHERE jenjang='S1' AND TRIM(nim)<>''");
        $db->query("ALTER TABLE siswa ADD UNIQUE KEY wa_unique_student_identity(wa_identity_key)");
    }

    if (!$db->query("SHOW COLUMNS FROM wa_accounts LIKE 'approval_status'")->num_rows){$db->query("ALTER TABLE wa_accounts ADD approval_status VARCHAR(12) NOT NULL DEFAULT 'pending'");$db->query("UPDATE wa_accounts SET approval_status='approved' WHERE approved=1");}
    $db->query("CREATE TABLE IF NOT EXISTS wa_evidence (id CHAR(36) PRIMARY KEY, owner_id VARCHAR(60) NOT NULL, account_id CHAR(36) NOT NULL, ctx_key CHAR(64) NOT NULL, session_id CHAR(36) NOT NULL, nim VARCHAR(50) NOT NULL, mime VARCHAR(30) NOT NULL, sha256 CHAR(64) NOT NULL, image_bytes MEDIUMBLOB NOT NULL, width INT NOT NULL, height INT NOT NULL, created_at BIGINT NOT NULL, KEY evidence_owner(owner_id), KEY evidence_session(account_id,session_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->query("CREATE TABLE IF NOT EXISTS wa_teacher_accounts (id CHAR(36) PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, display_name VARCHAR(100) NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(12) NOT NULL DEFAULT 'teacher', status VARCHAR(12) NOT NULL DEFAULT 'pending', avatar MEDIUMTEXT NULL, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach(['attachments','verification'] as $column)if(!$db->query("SHOW COLUMNS FROM wa_marks LIKE '{$column}'")->num_rows)$db->query("ALTER TABLE wa_marks ADD {$column} TEXT NULL");
    $db->query("INSERT INTO wa_meta(k,value) VALUES('schema_version','10') ON DUPLICATE KEY UPDATE value='10'");
    } finally {$db->query("SELECT RELEASE_LOCK(CONCAT('wa_schema:',DATABASE()))");}
}

function wa_query(string $sql, array $values = [], string $types = ''): mysqli_stmt {
    $stmt = wa_db()->prepare($sql);
    if ($values) $stmt->bind_param($types ?: str_repeat('s', count($values)), ...$values);
    $stmt->execute();
    return $stmt;
}
function wa_rows(string $sql, array $values = []): array { return wa_query($sql, $values)->get_result()->fetch_all(MYSQLI_ASSOC); }
function wa_one(string $sql, array $values = []): ?array { return wa_rows($sql, $values)[0] ?? null; }
function wa_json($value): string { return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); }
function wa_now(): int { return (int)round(microtime(true) * 1000); }
function wa_uuid(): string { $b = random_bytes(16); $b[6] = chr((ord($b[6]) & 15) | 64); $b[8] = chr((ord($b[8]) & 63) | 128); $h = bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20); }
function wa_id($id): string { if (!is_string($id) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $id)) throw new InvalidArgumentException('ID tidak valid.'); return $id; }
function wa_text($value, int $max = 255): string { if (!is_scalar($value)) throw new InvalidArgumentException('Teks tidak valid.'); $text = trim((string)$value); if (strlen($text) > $max) throw new InvalidArgumentException('Teks terlalu panjang.'); return $text; }
function wa_teacher_account(string $id): ?array {
    if($id==='admin_01')$account=['id'=>$id,'username'=>'M.Fadillah','display_name'=>'M.Fadillah','role'=>'admin','status'=>'active'];
    elseif($id==='dosen_01')$account=['id'=>$id,'username'=>'Zen','display_name'=>'Zen','role'=>'teacher','status'=>'active'];
    else $account=wa_one('SELECT id,username,display_name,role,status,avatar FROM wa_teacher_accounts WHERE id=?',[$id]);
    if(!$account)return null;
    if(defined('APP_TEMPLATE_BUILD'))return $account+['professional_title'=>''];
    if(in_array($id,['admin_01','dosen_01'],true)){
        $store=json_decode(@file_get_contents(__DIR__.'/admin_config.json')?:'{}',true);$profile=$store['profiles'][$id]??($id==='admin_01'&&!isset($store['profiles'])?$store:[]);
        if(!empty($profile['admin_name']))$account['display_name']=wa_text($profile['admin_name'],100);
        $account['avatar']=$profile['admin_avatar']??'';
    }
    $custom=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=?',['teacher-profile:'.$id])['value']??'{}',true)?:[];
    if(!empty($custom['name']))$account['display_name']=$custom['name'];$account['professional_title']=$custom['title']??'';
    return $account;
}
function wa_teacher_label(array $account): string {return $account['display_name'].(!empty($account['professional_title'])?', '.$account['professional_title']:'');}
function wa_save_teacher_identity(string $id,string $name,string $title): void {
    $name=wa_text($name,100);$title=wa_text($title,100);if(mb_strlen($name)<2)throw new InvalidArgumentException('Isi nama dosen minimal 2 karakter.');
    wa_query('INSERT INTO wa_meta(k,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',['teacher-profile:'.$id,wa_json(['name'=>$name,'title'=>$title])]);
}
function wa_active_teacher(string $id): bool { $account=wa_teacher_account($id);return $account!==null&&$account['status']==='active'; }
function wa_owner(): string { return (string)($GLOBALS['wa_request_owner'] ?? $_SESSION['id_user'] ?? 'admin_01'); }
function wa_context_owner(array $ctx): string { return (string)($ctx['owner'] ?? 'admin_01'); }
function wa_teacher_context(array $device,array $ctx): array {
    wa_teacher($device); if(!isset($ctx['owner']))$ctx['owner']=$device['account_id']; $ctx=wa_ctx($ctx);
    if (wa_context_owner($ctx)!==$device['account_id']) throw new DomainException('Data kelas ini milik akun dosen lain.');
    return $ctx;
}
function wa_academic_year(array $ctx): string {return $ctx['year']??'2026/2027';}
function wa_academic_period(array $ctx): string {return $ctx['period']??((int)$ctx['semester']%2?'Ganjil':'Genap');}
function wa_ctx($value): array {
    if (!is_array($value)) throw new InvalidArgumentException('Pilih kelas terlebih dahulu.');
    $ctx = ['jenjang'=>'S1', 'prodi'=>wa_text($value['prodi'] ?? '',180), 'semester'=>(string)($value['semester'] ?? ''), 'kelas'=>strtoupper(wa_text($value['kelas'] ?? '',20))];
    if (($value['jenjang'] ?? 'S1') !== 'S1' || !in_array($ctx['prodi'], WA_PRODI,true) || !preg_match('/^[1-8]$/',$ctx['semester']) || !preg_match('/^[A-E]$/',$ctx['kelas'])) throw new InvalidArgumentException('Prodi, semester, jenjang, atau kelas tidak valid.');
    $owner=(string)($value['owner']??'admin_01');
    if(!wa_active_teacher($owner))throw new InvalidArgumentException('Pilih dosen penanggung jawab yang valid.');
    if($owner!=='admin_01')$ctx['owner']=$owner;
    $year=(string)($value['year']??'2026/2027'); $natural=(int)$ctx['semester']%2?'Ganjil':'Genap'; $period=(string)($value['period']??$natural);
    if(!preg_match('/^(20[0-9]{2})\/(20[0-9]{2})$/',$year,$years)||(int)$years[2]!==((int)$years[1]+1)||!in_array($period,['Ganjil','Genap'],true))throw new InvalidArgumentException('Tahun akademik atau periode kuliah tidak valid.');
    if($year!=='2026/2027'||$period!==$natural){$ctx['year']=$year;$ctx['period']=$period;}
    return $ctx;
}
function wa_page_context(array $ctx): array {
    $saved=$_SESSION['konteks_siswa']??[];
    $natural=(int)$ctx['semester']%2?'Ganjil':'Genap';
    $sameSemester=(string)($saved['semester']??'')===(string)$ctx['semester'];
    return wa_ctx(array_merge($ctx,[
        'owner'=>wa_owner(),
        'year'=>$ctx['year']??$_GET['year']??$saved['year']??'2026/2027',
        'period'=>$ctx['period']??$_GET['period']??($sameSemester?($saved['period']??$natural):$natural)
    ]));
}
function wa_ctx_key(array $ctx): string { return hash('sha256', wa_json(wa_ctx($ctx))); }
function wa_student_data_epoch(): int {
    $key='student_data_epoch:'.wa_owner();
    wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES(?,COALESCE((SELECT value FROM (SELECT value FROM wa_meta WHERE k='student_data_epoch') legacy),'0'))",[$key]);
    return (int)(wa_one("SELECT value FROM wa_meta WHERE k=?",[$key])['value'] ?? 0);
}
function wa_reset_all_student_data(array $device,string $confirmation): array {
    wa_teacher($device);
    if ($confirmation !== 'HAPUS SEMUA MAHASISWA') throw new InvalidArgumentException('Ketik HAPUS SEMUA MAHASISWA dengan tepat untuk melanjutkan.');
    $owner=$device['account_id']; wa_student_data_epoch();
    wa_db()->begin_transaction();
    try {
        $counts=[];
        foreach (['siswa','wa_accounts','wa_sessions','wa_marks','wa_documents','wa_evidence','wa_class_invites'] as $table)
            $counts[$table]=(int)(wa_one("SELECT COUNT(*) AS n FROM {$table} WHERE owner_id=?",[$owner])['n']??0);
        wa_query("UPDATE wa_meta SET value=CAST(value AS UNSIGNED)+1 WHERE k=?",['student_data_epoch:'.$owner]);
        $studentIds=wa_rows("SELECT d.id FROM wa_devices d JOIN wa_accounts a ON a.id=d.account_id WHERE d.role='student' AND a.owner_id=?",[$owner]);
        foreach($studentIds as $row){
            wa_query('DELETE FROM wa_push_devices WHERE device_id=?',[$row['id']]);
            wa_query('DELETE FROM wa_push_sent WHERE device_id=?',[$row['id']]);
            wa_query('UPDATE wa_devices SET revoked=1 WHERE id=?',[$row['id']]);
        }
        foreach (['wa_evidence','wa_accounts','wa_sessions','wa_marks','wa_documents','wa_class_invites','siswa'] as $table) wa_query("DELETE FROM {$table} WHERE owner_id=?",[$owner]);
        wa_query('DELETE FROM wa_meta WHERE k=?',[wa_courses_key($owner)]);
        wa_audit($device,'reset-all-student-data','own-account',['counts'=>$counts]);
        wa_db()->commit();
        return ['status'=>'success','deleted'=>$counts,'resetEpoch'=>wa_student_data_epoch()];
    } catch (Throwable $error) { wa_db()->rollback(); throw $error; }
}
function wa_course($value): string { $value = wa_text($value,180); if ($value === '') throw new InvalidArgumentException('Isi mata kuliah.'); return $value; }
function wa_scope(array $ctx, string $matkul): string { return hash('sha256', wa_json([wa_ctx($ctx), wa_text($matkul,180)])); }
function wa_nim($value): string { $nim = strtoupper(wa_text($value,50)); if (!preg_match('/^[A-Z0-9][A-Z0-9.-]{3,49}$/', $nim)) throw new InvalidArgumentException('NIM tidak valid.'); return $nim; }
function wa_day(int $timestamp): string { return gmdate('Y-m-d', (int)floor($timestamp/1000) + 7*3600); }
function wa_b64(string $value): string { return rtrim(strtr(base64_encode($value),'+/','-_'),'='); }
function wa_unb64(string $value): string { if (!preg_match('/^[A-Za-z0-9_-]+$/', $value)) throw new InvalidArgumentException('Kode QR tidak valid.'); $raw = base64_decode(strtr($value,'-_','+/'),true); if ($raw === false) throw new InvalidArgumentException('Kode QR tidak valid.'); return $raw; }
function wa_pub_pem(string $pub): string { $raw = wa_unb64($pub); if (strlen($raw) > 200) throw new InvalidArgumentException('Kunci perangkat tidak valid.'); $pem = "-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($raw),64,"\n")."-----END PUBLIC KEY-----\n"; $key = openssl_pkey_get_public($pem); $details = $key ? openssl_pkey_get_details($key) : []; if (($details['type'] ?? -1) !== OPENSSL_KEYTYPE_EC || ($details['ec']['curve_name'] ?? '') !== 'prime256v1') throw new InvalidArgumentException('Kunci perangkat harus P-256.'); return $pem; }
function wa_sig_der(string $raw): string {
    if (strlen($raw) !== 64) throw new InvalidArgumentException('Tanda tangan QR tidak valid.');
    $integers = '';
    foreach ([substr($raw,0,32),substr($raw,32,32)] as $number) { $number=ltrim($number,"\0") ?: "\0"; if (ord($number[0]) & 128) $number="\0".$number; $integers.="\x02".chr(strlen($number)).$number; }
    return "\x30".chr(strlen($integers)).$integers;
}
function wa_sig_raw(string $der): string {
    $offset=2; $raw='';
    for ($i=0;$i<2;$i++) { if (($der[$offset++] ?? '') !== "\x02") throw new RuntimeException('Format tanda tangan tidak didukung.'); $length=ord($der[$offset++]); $number=substr($der,$offset,$length); $offset+=$length; $number=ltrim($number,"\0"); if(strlen($number)>32)throw new RuntimeException('Tanda tangan tidak valid.'); $raw.=str_pad($number,32,"\0",STR_PAD_LEFT); }
    return $raw;
}
function wa_signing_key(): array {
    $existing=wa_one("SELECT value FROM wa_meta WHERE k='signing_key'");
    if (!$existing) {
        $key=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1']);
        if (!$key || !openssl_pkey_export($key,$private)) throw new RuntimeException('Layanan tanda tangan belum tersedia.');
        wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES('signing_key',?)",[$private]);
        $existing=wa_one("SELECT value FROM wa_meta WHERE k='signing_key'");
    }
    $details=openssl_pkey_get_details(openssl_pkey_get_private($existing['value']));
    $pub=wa_b64(base64_decode(preg_replace('/-----[^-]+-----|\s/','',$details['key'])));
    return ['private'=>$existing['value'],'public'=>$pub];
}
function wa_seal(array $payload): string { $body=wa_b64(wa_json($payload)); if (!openssl_sign($body,$sig,wa_signing_key()['private'],OPENSSL_ALGO_SHA256)) throw new RuntimeException('Tanda tangan gagal.'); return $body.'.'.wa_b64(wa_sig_raw($sig)); }
function wa_open(string $envelope, string $pub): array {
    if (strlen($envelope)>10000 || substr_count($envelope,'.')!==1) throw new InvalidArgumentException('Kode QR tidak valid.');
    [$body,$sig]=explode('.',$envelope);
    if (openssl_verify($body,wa_sig_der(wa_unb64($sig)),wa_pub_pem($pub),OPENSSL_ALGO_SHA256)!==1) throw new InvalidArgumentException('Tanda tangan QR tidak cocok.');
    $data=json_decode(wa_unb64($body),true,32,JSON_THROW_ON_ERROR);
    if (!is_array($data)) throw new InvalidArgumentException('Isi QR tidak valid.');
    return $data;
}
function wa_cookie(string $token): void { setcookie('wa_device',$token,['expires'=>$token===''?1:time()+34560000,'path'=>'/','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']); }
function wa_device(): ?array {
    $authorization=(string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $token=str_starts_with($authorization,'Bearer ')?substr($authorization,7):(string)($_COOKIE['wa_device']??'');
    if (!preg_match('/^[a-f0-9]{64}$/',$token)) return null;
    $device=wa_one('SELECT * FROM wa_devices WHERE token_hash=? AND revoked=0',[hash('sha256',$token)]);
    if($device)$GLOBALS['wa_request_owner']=$device['role']==='teacher'?$device['account_id']:(wa_one('SELECT owner_id FROM wa_accounts WHERE id=?',[$device['account_id']])['owner_id']??'admin_01');
    return $device;
}
function wa_restore_teacher(): void {
    if (isset($_SESSION['id_user']) || empty($_COOKIE['wa_device']) || defined('APP_TEMPLATE_BUILD')) return;
    try { $device=wa_device(); if ($device && $device['role']==='teacher' && wa_active_teacher($device['account_id'])) { $account=wa_teacher_account($device['account_id']); $_SESSION['id_user']=$device['account_id']; $_SESSION['nama_user']=$account['display_name']; $_SESSION['role']=$account['role']==='admin'?'Administrator Utama':'Dosen'; } } catch (Throwable $ignored) { /* A missing database never grants access. */ }
}
function wa_revoke_current(): void { $device=wa_device(); if ($device) wa_query('UPDATE wa_devices SET revoked=1 WHERE id=?',[$device['id']]); wa_cookie(''); }
function wa_issue_device(string $account, string $role, string $pub): array {
    wa_pub_pem($pub);
    $token=bin2hex(random_bytes(32)); $id=wa_uuid();
    wa_query('INSERT INTO wa_devices(id,account_id,role,token_hash,pubkey,created_at) VALUES(?,?,?,?,?,?)',[$id,$account,$role,hash('sha256',$token),$pub,wa_now()]);
    wa_cookie($token);
    return ['device'=>wa_one('SELECT * FROM wa_devices WHERE id=?',[$id]),'token'=>$token];
}
function wa_profile(array $device): array {
    $account=$device['role']==='student'?wa_one('SELECT id,nim,nama,jk,ctx,approved,approval_status,owner_id FROM wa_accounts WHERE id=?',[$device['account_id']]):wa_teacher_account($device['account_id']);
    if (!$account) throw new InvalidArgumentException('Akun tidak ditemukan.');
    if($device['role']==='teacher'){$account['nama']=wa_teacher_label($account);$account['approved']=$account['status']==='active';}
    if (isset($account['ctx'])) $account['ctx']=json_decode($account['ctx'],true);
    $account['owner_id']=$account['owner_id']??$device['account_id'];
    $account['approved']=(bool)$account['approved'];
    $certificate=wa_seal(['v'=>1,'type'=>'identity','device'=>$device['id'],'account'=>$device['account_id'],'role'=>$device['role'],'pub'=>$device['pubkey'],'nim'=>$account['nim']??null,'name'=>$account['nama'],'ctx'=>$account['ctx']??null,'approved'=>$account['approved']]);
    return ['device'=>$device['id'],'role'=>$device['role'],'account'=>$account,'certificate'=>$certificate,'serverPublicKey'=>wa_signing_key()['public']];
}
function wa_teacher(array $device): void { if ($device['role']!=='teacher' || !wa_active_teacher($device['account_id'])) throw new DomainException('Fitur ini hanya tersedia untuk dosen aktif.'); }
function wa_approved_student(array $device): array { if ($device['role']!=='student') throw new DomainException('Gunakan akun mahasiswa.'); $account=wa_one('SELECT * FROM wa_accounts WHERE id=?',[$device['account_id']]); if (!$account || !$account['approved']) throw new DomainException('Pendaftaran menunggu persetujuan dosen.'); return $account; }
function wa_roster(array $ctx): array {
    $ctx=wa_ctx($ctx);
    return wa_rows("SELECT id,nim,nama,jk,jenjang,prodi,semester,kelas FROM siswa WHERE jenjang='S1' AND prodi=? AND semester IN (?,?) AND kelas IN (?,?) AND owner_id=? AND academic_year=? AND academic_period=? ORDER BY id",[$ctx['prodi'],$ctx['semester'],'Semester '.$ctx['semester'],$ctx['kelas'],'Kelas '.$ctx['kelas'],wa_context_owner($ctx),wa_academic_year($ctx),wa_academic_period($ctx)]);
}
function wa_finalize(): void {
    foreach(wa_rows('SELECT id FROM wa_sessions WHERE finalized=0 AND deadline<=?',[wa_now()]) as $candidate){
        wa_db()->begin_transaction();
        try{
            $session=wa_one('SELECT id,scope,slot,roster,deadline,finalized,owner_id FROM wa_sessions WHERE id=? FOR UPDATE',[$candidate['id']]);
            if($session&&!$session['finalized']&&(int)$session['deadline']<=wa_now()){
                foreach(json_decode($session['roster'],true)??[] as $nim)wa_query("INSERT INTO wa_marks(scope,slot,nim,mark,session_id,reason,source,review_status,recorded_at,owner_id) VALUES(?,?,?,'A',?,'Batas waktu absen telah berakhir.','automatic','final',?,?) ON DUPLICATE KEY UPDATE session_id=IF(mark='',VALUES(session_id),session_id),reason=IF(mark='',VALUES(reason),reason),source=IF(mark='',VALUES(source),source),review_status=IF(mark='',VALUES(review_status),review_status),recorded_at=IF(mark='',VALUES(recorded_at),recorded_at),revision=IF(mark='',revision+1,revision),mark=IF(mark='',VALUES(mark),mark)",[$session['scope'],$session['slot'],$nim,$session['id'],$session['deadline'],$session['owner_id']]);
                wa_query('UPDATE wa_sessions SET finalized=1 WHERE id=?',[$session['id']]);
            }
            wa_db()->commit();
        }catch(Throwable $error){wa_db()->rollback();throw $error;}
    }
}

function wa_document(array $ctx, string $course, string $kind): ?array { $row=wa_one('SELECT * FROM wa_documents WHERE scope=? AND kind=?',[wa_scope($ctx,$course),$kind]); if($row)$row['content']=json_decode($row['content'],true); return $row; }
function wa_save_document(array $ctx, string $course, string $kind, array $content, ?int $expected): array {
    if (!in_array($kind,['grade','attendance-layout','exam-layout','attendance-sheet','exam-sheet'],true) || strlen(wa_json($content))>3000000) throw new InvalidArgumentException('Dokumen tidak valid atau terlalu besar.');
    $scope=wa_scope($ctx,$course);
    $old=wa_one('SELECT * FROM wa_documents WHERE scope=? AND kind=? FOR UPDATE',[$scope,$kind]);
    $revision=$old?(int)$old['revision']:0;
    if ($expected!==null && $expected!==$revision) return ['status'=>'conflict','revision'=>$revision,'remote'=>$old?json_decode($old['content'],true):null];
    wa_query('INSERT INTO wa_documents(scope,kind,ctx,matkul,content,revision,updated_at,owner_id) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),revision=VALUES(revision),updated_at=VALUES(updated_at)',[$scope,$kind,wa_json(wa_ctx($ctx)),$course,wa_json($content),$revision+1,wa_now(),wa_context_owner(wa_ctx($ctx))]);
    return ['status'=>'success','revision'=>$revision+1];
}
function wa_snapshot(array $device): array {
    wa_finalize();
    $profile=wa_profile($device);
    if($device['role']==='teacher') {
        $roster=wa_rows("SELECT id,nim,nama,jk,jenjang,prodi,semester,kelas,owner_id,academic_year,academic_period FROM siswa WHERE jenjang='S1' AND owner_id=? ORDER BY prodi,semester,kelas,id",[$device['account_id']]);
        $sessions=wa_rows('SELECT * FROM wa_sessions WHERE owner_id=? ORDER BY starts',[$device['account_id']]);
        $marks=wa_rows('SELECT * FROM wa_marks WHERE owner_id=? ORDER BY recorded_at',[$device['account_id']]);
        $documents=wa_rows('SELECT * FROM wa_documents WHERE owner_id=?',[$device['account_id']]);
        $registrations=wa_rows('SELECT id,nim,nama,jk,ctx,approved,approval_status,created_at FROM wa_accounts WHERE owner_id=? ORDER BY created_at DESC',[$device['account_id']]);
    } else {
        $account=$profile['account']; $ctx=$account['ctx'];
        $roster=[]; $documents=[]; $registrations=[]; $sessions=[]; $marks=[];
        if($account['approved']) {
            $sessions=array_values(array_filter(wa_rows('SELECT * FROM wa_sessions WHERE owner_id=?',[$account['owner_id']]),static function($r)use($ctx){return wa_ctx_key(json_decode($r['ctx'],true))===wa_ctx_key($ctx);}));
            $seen=[];foreach($sessions as $session){if(isset($seen[$session['scope']]))continue;$seen[$session['scope']]=true;$marks=array_merge($marks,wa_rows('SELECT * FROM wa_marks WHERE scope=? AND nim=?',[$session['scope'],$account['nim']]));}
        }
    }
    foreach($roster as &$row) { $row['semester']=preg_replace('/^Semester\s+/i','',$row['semester']); $row['kelas']=preg_replace('/^Kelas\s+/i','',$row['kelas']); $row['nim']=strtoupper($row['nim']); if(($row['owner_id']??'admin_01')!=='admin_01')$row['owner']=$row['owner_id']; if(($row['academic_year']??'2026/2027')!=='2026/2027'||($row['academic_period']??((int)$row['semester']%2?'Ganjil':'Genap'))!==((int)$row['semester']%2?'Ganjil':'Genap')){$row['year']=$row['academic_year'];$row['period']=$row['academic_period'];} unset($row['owner_id'],$row['academic_year'],$row['academic_period']); } unset($row);
    $teacherKeys=[];foreach(wa_rows("SELECT id,pubkey FROM wa_devices WHERE role='teacher' AND revoked=0") as $key)$teacherKeys[$key['id']]=$key['pubkey'];
    foreach($sessions as &$row) { $row['teacher_pub']=$teacherKeys[$row['teacher_id']]??''; $row['ctx']=json_decode($row['ctx'],true); $row['roster']=$device['role']==='teacher'?json_decode($row['roster'],true):[]; foreach(['slot','starts','deadline','ends','version']as$k)$row[$k]=(int)$row[$k]; } unset($row);
    $availableEvidence=[];foreach(wa_rows('SELECT id,sha256 FROM wa_evidence WHERE owner_id=?',[wa_owner()]) as $photo)$availableEvidence[$photo['id']]=$photo['sha256'];
    foreach($marks as &$row) { $row['attachments']=json_decode($row['attachments']??'[]',true)?:[];$row['verification']=json_decode($row['verification']??'null',true);$row['evidence_ready']=count($row['attachments'])>0&&!array_filter($row['attachments'],static fn($ref)=>($availableEvidence[$ref['id']]??'')!==$ref['hash']); $row['location']=$row['location']?json_decode($row['location'],true):null; $row['slot']=(int)$row['slot']; $row['revision']=(int)$row['revision']; $row['recorded_at']=(int)$row['recorded_at']; } unset($row);
    foreach($documents as &$row) { $row['ctx']=json_decode($row['ctx'],true); $row['content']=json_decode($row['content'],true); $row['revision']=(int)$row['revision']; } unset($row);
    foreach($registrations as &$row) { $row['ctx']=json_decode($row['ctx'],true); $row['approved']=(bool)$row['approved']; } unset($row);
    $catalogue=wa_courses_snapshot($device,$sessions,$documents);
    $catalogue['appearance']=wa_appearance_read($device,true);
    $epoch=wa_student_data_epoch();
    return $catalogue+['tag'=>hash('sha256',wa_json([$profile['device'],$profile['account'],$roster,$sessions,$marks,$documents,$registrations,$catalogue,$epoch])),'profile'=>$profile,'roster'=>$roster,'sessions'=>$sessions,'marks'=>$marks,'documents'=>$documents,'registrations'=>$registrations,'resetEpoch'=>$epoch,'serverTime'=>wa_now(),'build'=>WA_BUILD];
}
function wa_audit(array $device,string $action,string $reference,array $details): void { wa_query('INSERT INTO wa_audit(device_id,action,reference_id,details,created_at) VALUES(?,?,?,?,?)',[$device['id'],$action,$reference,wa_json($details),wa_now()]); }

require_once __DIR__.'/app_courses.php';
require_once __DIR__.'/app_preferences.php';
