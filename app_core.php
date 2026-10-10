<?php
// Shared storage and identity services. This file never returns database secrets.
const WA_BUILD = '20261010-guided-4';
const WA_PRODI = ['Pendidikan Teknologi Informasi', 'Pendidikan Guru Sekolah Dasar', 'Pendidikan Jasmani Kesehatan dan Rekreasi', 'Pendidikan Bahasa dan Sastra Indonesia', 'Pendidikan Sejarah', 'Pendidikan Bahasa Inggris'];

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
    try { $v=$db->query("SELECT value FROM wa_meta WHERE k='schema_version'")->fetch_assoc(); if(($v['value']??'')==='2')return; } catch(mysqli_sql_exception $ignored) {}
    $tables = [
        "CREATE TABLE IF NOT EXISTS wa_push_devices (device_id CHAR(36) PRIMARY KEY, subscription TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_push_sent (device_id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, phase VARCHAR(100) NOT NULL, PRIMARY KEY(device_id,session_id,phase)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_meta (k VARCHAR(60) PRIMARY KEY, value MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS wa_accounts (id CHAR(36) PRIMARY KEY, nim VARCHAR(50) NOT NULL, nama VARCHAR(255) NOT NULL, jk CHAR(1) NOT NULL, ctx TEXT NOT NULL, ctx_key CHAR(64) NOT NULL, pin_hash VARCHAR(255) NOT NULL, approved TINYINT NOT NULL DEFAULT 0, approved_by VARCHAR(60), created_at BIGINT NOT NULL, UNIQUE KEY account_identity(ctx_key,nim)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
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
    $db->query("INSERT INTO wa_meta(k,value) VALUES('schema_version','2') ON DUPLICATE KEY UPDATE value='2'");
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
function wa_ctx($value): array {
    if (!is_array($value)) throw new InvalidArgumentException('Pilih kelas terlebih dahulu.');
    $ctx = ['jenjang'=>'S1', 'prodi'=>wa_text($value['prodi'] ?? '',180), 'semester'=>(string)($value['semester'] ?? ''), 'kelas'=>strtoupper(wa_text($value['kelas'] ?? '',20))];
    if (($value['jenjang'] ?? 'S1') !== 'S1' || !in_array($ctx['prodi'], WA_PRODI,true) || !preg_match('/^[1-8]$/',$ctx['semester']) || !preg_match('/^[A-E]$/',$ctx['kelas'])) throw new InvalidArgumentException('Prodi, semester, jenjang, atau kelas tidak valid.');
    return $ctx;
}
function wa_ctx_key(array $ctx): string { return hash('sha256', wa_json(wa_ctx($ctx))); }
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
    return wa_one('SELECT * FROM wa_devices WHERE token_hash=? AND revoked=0',[hash('sha256',$token)]);
}
function wa_restore_teacher(): void {
    if (isset($_SESSION['id_user']) || empty($_COOKIE['wa_device']) || defined('APP_TEMPLATE_BUILD')) return;
    try { $device=wa_device(); if ($device && $device['role']==='teacher' && in_array($device['account_id'],['admin_01','dosen_01'],true)) { $_SESSION['id_user']=$device['account_id']; $_SESSION['nama_user']=$device['account_id']==='admin_01'?'M.Fadillah':'Zen'; $_SESSION['role']=$device['account_id']==='admin_01'?'Administrator Utama':'Dosen'; } } catch (Throwable $ignored) { /* A missing database never grants access. */ }
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
    $account=$device['role']==='student'?wa_one('SELECT id,nim,nama,jk,ctx,approved FROM wa_accounts WHERE id=?',[$device['account_id']]):['id'=>$device['account_id'],'nama'=>$device['account_id']==='admin_01'?'M.Fadillah':'Zen','approved'=>1];
    if (!$account) throw new InvalidArgumentException('Akun tidak ditemukan.');
    if (isset($account['ctx'])) $account['ctx']=json_decode($account['ctx'],true);
    $account['approved']=(bool)$account['approved'];
    $certificate=wa_seal(['v'=>1,'type'=>'identity','device'=>$device['id'],'account'=>$device['account_id'],'role'=>$device['role'],'pub'=>$device['pubkey'],'nim'=>$account['nim']??null,'name'=>$account['nama'],'ctx'=>$account['ctx']??null,'approved'=>$account['approved']]);
    return ['device'=>$device['id'],'role'=>$device['role'],'account'=>$account,'certificate'=>$certificate,'serverPublicKey'=>wa_signing_key()['public']];
}
function wa_teacher(array $device): void { if ($device['role']!=='teacher' || !in_array($device['account_id'],['admin_01','dosen_01'],true)) throw new DomainException('Fitur ini hanya tersedia untuk dosen.'); }
function wa_approved_student(array $device): array { if ($device['role']!=='student') throw new DomainException('Gunakan akun mahasiswa.'); $account=wa_one('SELECT * FROM wa_accounts WHERE id=?',[$device['account_id']]); if (!$account || !$account['approved']) throw new DomainException('Pendaftaran menunggu persetujuan dosen.'); return $account; }
function wa_roster(array $ctx): array {
    $ctx=wa_ctx($ctx);
    return wa_rows("SELECT id,nim,nama,jk,jenjang,prodi,semester,kelas FROM siswa WHERE jenjang='S1' AND prodi=? AND semester IN (?,?) AND kelas IN (?,?) ORDER BY id",[$ctx['prodi'],$ctx['semester'],'Semester '.$ctx['semester'],$ctx['kelas'],'Kelas '.$ctx['kelas']]);
}
function wa_finalize(): void {
    foreach(wa_rows('SELECT id FROM wa_sessions WHERE finalized=0 AND deadline<=?',[wa_now()]) as $candidate){
        wa_db()->begin_transaction();
        try{
            $session=wa_one('SELECT id,scope,slot,roster,deadline,finalized FROM wa_sessions WHERE id=? FOR UPDATE',[$candidate['id']]);
            if($session&&!$session['finalized']&&(int)$session['deadline']<=wa_now()){
                foreach(json_decode($session['roster'],true)??[] as $nim)wa_query("INSERT INTO wa_marks(scope,slot,nim,mark,session_id,reason,source,review_status,recorded_at) VALUES(?,?,?,'A',?,'Batas waktu absen telah berakhir.','automatic','final',?) ON DUPLICATE KEY UPDATE session_id=IF(mark='',VALUES(session_id),session_id),reason=IF(mark='',VALUES(reason),reason),source=IF(mark='',VALUES(source),source),review_status=IF(mark='',VALUES(review_status),review_status),recorded_at=IF(mark='',VALUES(recorded_at),recorded_at),revision=IF(mark='',revision+1,revision),mark=IF(mark='',VALUES(mark),mark)",[$session['scope'],$session['slot'],$nim,$session['id'],$session['deadline']]);
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
    wa_query('INSERT INTO wa_documents(scope,kind,ctx,matkul,content,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),revision=VALUES(revision),updated_at=VALUES(updated_at)',[$scope,$kind,wa_json(wa_ctx($ctx)),$course,wa_json($content),$revision+1,wa_now()]);
    return ['status'=>'success','revision'=>$revision+1];
}
function wa_snapshot(array $device): array {
    wa_finalize();
    $profile=wa_profile($device);
    if($device['role']==='teacher') {
        $roster=wa_rows("SELECT id,nim,nama,jk,jenjang,prodi,semester,kelas FROM siswa WHERE jenjang='S1' ORDER BY prodi,semester,kelas,id");
        $sessions=wa_rows('SELECT * FROM wa_sessions ORDER BY starts');
        $marks=wa_rows('SELECT * FROM wa_marks ORDER BY recorded_at');
        $documents=wa_rows('SELECT * FROM wa_documents');
        $registrations=wa_rows('SELECT id,nim,nama,jk,ctx,approved,created_at FROM wa_accounts ORDER BY created_at DESC');
    } else {
        $account=$profile['account']; $ctx=$account['ctx'];
        $roster=[]; $documents=[]; $registrations=[]; $sessions=[]; $marks=[];
        if($account['approved']) {
            $sessions=array_values(array_filter(wa_rows('SELECT * FROM wa_sessions WHERE ends>=?',[wa_now()-7*86400000]),static function($r)use($ctx){return wa_ctx_key(json_decode($r['ctx'],true))===wa_ctx_key($ctx);}));
            $seen=[];foreach($sessions as $session){if(isset($seen[$session['scope']]))continue;$seen[$session['scope']]=true;$marks=array_merge($marks,wa_rows('SELECT * FROM wa_marks WHERE scope=? AND nim=?',[$session['scope'],$account['nim']]));}
        }
    }
    foreach($roster as &$row) { $row['semester']=preg_replace('/^Semester\s+/i','',$row['semester']); $row['kelas']=preg_replace('/^Kelas\s+/i','',$row['kelas']); $row['nim']=strtoupper($row['nim']); } unset($row);
    foreach($sessions as &$row) { $teacher=wa_one('SELECT pubkey FROM wa_devices WHERE id=? AND revoked=0',[$row['teacher_id']]);$row['teacher_pub']=$teacher['pubkey']??''; $row['ctx']=json_decode($row['ctx'],true); $row['roster']=$device['role']==='teacher'?json_decode($row['roster'],true):[]; foreach(['slot','starts','deadline','ends','version']as$k)$row[$k]=(int)$row[$k]; } unset($row);
    foreach($marks as &$row) { $row['location']=$row['location']?json_decode($row['location'],true):null; $row['slot']=(int)$row['slot']; $row['revision']=(int)$row['revision']; $row['recorded_at']=(int)$row['recorded_at']; } unset($row);
    foreach($documents as &$row) { $row['ctx']=json_decode($row['ctx'],true); $row['content']=json_decode($row['content'],true); $row['revision']=(int)$row['revision']; } unset($row);
    foreach($registrations as &$row) { $row['ctx']=json_decode($row['ctx'],true); $row['approved']=(bool)$row['approved']; } unset($row);
    return ['tag'=>hash('sha256',wa_json([$profile['device'],$profile['account'],$roster,$sessions,$marks,$documents,$registrations])),'profile'=>$profile,'roster'=>$roster,'sessions'=>$sessions,'marks'=>$marks,'documents'=>$documents,'registrations'=>$registrations,'serverTime'=>wa_now(),'build'=>WA_BUILD];
}
function wa_audit(array $device,string $action,string $reference,array $details): void { wa_query('INSERT INTO wa_audit(device_id,action,reference_id,details,created_at) VALUES(?,?,?,?,?)',[$device['id'],$action,$reference,wa_json($details),wa_now()]); }
