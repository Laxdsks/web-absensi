<?php
/* Per-account signed student packages. Private signing material is never returned to a teacher/client. */
function wa_brand_schema(): void {
    static $done=false;if($done)return;
    wa_db()->query("CREATE TABLE IF NOT EXISTS wa_brand_jobs (id CHAR(36) PRIMARY KEY, owner_id VARCHAR(60) NOT NULL, revision INT NOT NULL, config MEDIUMTEXT NOT NULL, state VARCHAR(12) NOT NULL DEFAULT 'queued', attempts INT NOT NULL DEFAULT 0, lease_until BIGINT NOT NULL DEFAULT 0, lease_hash CHAR(64) NOT NULL DEFAULT '', created_at BIGINT NOT NULL, completed_at BIGINT NOT NULL DEFAULT 0, artifact TEXT NULL, checksum CHAR(64) NOT NULL DEFAULT '', certificate CHAR(64) NOT NULL DEFAULT '', error TEXT NULL, UNIQUE KEY brand_revision(owner_id,revision), KEY brand_queue(state,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$done=true;
}
function wa_brand_key(string $owner,string $prefix='brand:'): string {return $prefix.substr(hash('sha256',$owner),0,40);}
function wa_brand_secret(): string {$file=__DIR__.'/.wa_brand_worker.php';$key=is_file($file)?require $file:'';return is_string($key)&&preg_match('/^[a-f0-9]{64}$/D',$key)?$key:'';}
function wa_brand_job_view(?array $job): ?array {if(!$job)return null;return ['id'=>$job['id'],'revision'=>(int)$job['revision'],'state'=>$job['state'],'createdAt'=>(int)$job['created_at'],'url'=>$job['state']==='ready'?$job['artifact']:'','sha256'=>$job['checksum'],'error'=>$job['state']==='failed'?$job['error']:''];}
function wa_brand_read(array $device,bool $full=true): array {
    wa_teacher($device);wa_brand_schema();$owner=$device['account_id'];$saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=?',[wa_brand_key($owner)])['value']??'{}',true)?:[];
    $job=wa_one('SELECT * FROM wa_brand_jobs WHERE owner_id=? ORDER BY revision DESC LIMIT 1',[$owner]);
    return ['revision'=>(int)($saved['revision']??0),'config'=>isset($saved['config'])?($full?$saved['config']:['name'=>$saved['config']['name']]):null,'job'=>wa_brand_job_view($job),'builderAvailable'=>wa_brand_secret()!==''];
}
function wa_brand_image($value,bool $icon=false): string {
    if(!is_string($value)||strlen($value)>($icon?1100000:1450000)||!preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$~D',$value,$m))throw new InvalidArgumentException('Gunakan gambar PNG/JPG/WebP yang lebih kecil.');
    $raw=base64_decode($m[2],true);$info=$raw!==false?@getimagesizefromstring($raw):false;
    if(!$info||!in_array($info['mime'],['image/png','image/jpeg','image/webp'],true)||$info[0]*$info[1]>24000000||($icon&&($info[0]!==512||$info[1]!==512||$info['mime']!=='image/png')))throw new InvalidArgumentException('Ikon hasil potong harus PNG 512 × 512 piksel.');return $value;
}
function wa_brand_save(array $device,array $input): array {
    wa_teacher($device);wa_brand_schema();if(!wa_brand_secret())throw new DomainException('Pembuat APK belum tersambung. Coba lagi setelah pengelola mengaktifkannya.');
    $config=$input['config']??[];$name=trim((string)($config['name']??''));if(mb_strlen($name)<2||mb_strlen($name)>40||preg_match('/[\x00-\x1f<>]/u',$name))throw new InvalidArgumentException('Nama aplikasi harus 2–40 karakter tanpa tanda < atau >.');
    $clean=['name'=>$name,'icon'=>wa_brand_image($config['icon']??null,true),'source'=>wa_brand_image($config['source']??null),'shape'=>(string)($config['shape']??'round'),'scale'=>(float)($config['scale']??1),'x'=>(float)($config['x']??0),'y'=>(float)($config['y']??0)];
    if(!in_array($clean['shape'],['round','circle','square'],true)||!is_finite($clean['scale'])||$clean['scale']<.5||$clean['scale']>3||!is_finite($clean['x'])||!is_finite($clean['y'])||abs($clean['x'])>512||abs($clean['y'])>512)throw new InvalidArgumentException('Pengaturan potong ikon tidak valid.');
    $owner=$device['account_id'];$key=wa_brand_key($owner);wa_db()->begin_transaction();try{
        wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES(?,'{}')",[$key]);$saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=? FOR UPDATE',[$key])['value'],true)?:[];
        if((int)($input['baseRevision']??0)!==(int)($saved['revision']??0))throw new DomainException('Pengaturan berubah di perangkat lain. Tutup lalu buka pengaturan ini kembali.');
        $existing=wa_one("SELECT id,state FROM wa_brand_jobs WHERE owner_id=? AND state IN ('queued','building') ORDER BY revision DESC LIMIT 1",[$owner]);if($existing)throw new DomainException('APK sebelumnya masih diproses. Tunggu hingga selesai sebelum membuat versi lain.');
        if((int)(wa_one('SELECT COUNT(*) AS n FROM wa_brand_jobs WHERE owner_id=? AND created_at>?',[$owner,wa_now()-86400000])['n']??0)>=5)throw new DomainException('Maksimal 5 pembuatan APK sehari. Anda tetap dapat mengunduh dan membagikan APK yang sudah selesai.');
        $revision=(int)($saved['revision']??0)+1;$jobConfig=['name'=>$name,'icon'=>$clean['icon'],'package'=>'id.webabsensi.brand.b'.substr(hash('sha256',$owner),0,20)];
        wa_query('INSERT INTO wa_brand_jobs(id,owner_id,revision,config,created_at) VALUES(?,?,?,?,?)',[wa_uuid(),$owner,$revision,wa_json($jobConfig),wa_now()]);
        wa_query('UPDATE wa_meta SET value=? WHERE k=?',[wa_json(['revision'=>$revision,'config'=>$clean]),$key]);wa_db()->commit();
    }catch(Throwable $error){wa_db()->rollback();throw $error;}return wa_brand_read($device);
}
function wa_brand_worker_auth(string $raw): void {
    $key=wa_brand_secret();$at=(string)($_SERVER['HTTP_X_BRAND_TIME']??'');$signature=(string)($_SERVER['HTTP_X_BRAND_SIGNATURE']??'');if(!$key||!ctype_digit($at)||abs(time()-(int)$at)>300||!hash_equals(hash_hmac('sha256',$at.'.'.$raw,$key),$signature))throw new DomainException('Pekerja APK tidak diizinkan.');
}
function wa_brand_worker(array $input): array {
    wa_brand_schema();$op=(string)($input['operation']??'');$now=wa_now();
    if($op==='claim'){
        wa_db()->begin_transaction();try{
            wa_query("UPDATE wa_brand_jobs SET state='failed',error='Pembuatan terhenti beberapa kali. Simpan kembali untuk mencoba.' WHERE state='building' AND lease_until<? AND attempts>=3",[$now]);
            $job=wa_one("SELECT * FROM wa_brand_jobs WHERE state='queued' OR (state='building' AND lease_until<? AND attempts<3) ORDER BY created_at LIMIT 1 FOR UPDATE",[$now]);
            if(!$job){wa_db()->commit();return ['job'=>null];}$lease=bin2hex(random_bytes(32));
            wa_query("UPDATE wa_brand_jobs SET state='building',attempts=attempts+1,lease_until=?,lease_hash=? WHERE id=?",[$now+1800000,hash('sha256',$lease),$job['id']]);
            $key=wa_one('SELECT value FROM wa_meta WHERE k=?',[wa_brand_key($job['owner_id'],'brandkey:')]);wa_db()->commit();
            return ['job'=>['id'=>$job['id'],'revision'=>(int)$job['revision'],'config'=>json_decode($job['config'],true),'lease'=>$lease,'signingEnvelope'=>$key['value']??null]];
        }catch(Throwable $error){wa_db()->rollback();throw $error;}
    }
    $job=wa_one('SELECT * FROM wa_brand_jobs WHERE id=?',[wa_id($input['id']??'')]);if(!$job||$job['state']!=='building'||!hash_equals($job['lease_hash'],hash('sha256',(string)($input['lease']??'')))||(int)$job['lease_until']<$now)throw new DomainException('Tugas APK sudah tidak aktif.');
    if($op==='key'){
        $value=$input['envelope']??null;if(!is_string($value)||strlen($value)>30000||!preg_match('/^[A-Za-z0-9+\/=]+$/D',$value))throw new InvalidArgumentException('Cadangan kunci tidak valid.');
        wa_query('INSERT IGNORE INTO wa_meta(k,value) VALUES(?,?)',[wa_brand_key($job['owner_id'],'brandkey:'),$value]);return ['saved'=>true];
    }
    if($op==='complete'){
        $url=(string)($input['url']??'');$sha=(string)($input['sha256']??'');$cert=(string)($input['certificate']??'');
        if(!preg_match('~^https://github\.com/Laxdsks/web-absensi/releases/download/presen-brand-[a-f0-9-]{36}/Presen-Student\.apk$~D',$url)||!preg_match('/^[a-f0-9]{64}$/D',$sha)||!preg_match('/^[a-f0-9]{64}$/D',$cert))throw new InvalidArgumentException('Hasil APK tidak valid.');
        wa_query("UPDATE wa_brand_jobs SET state='ready',artifact=?,checksum=?,certificate=?,completed_at=? WHERE id=?",[$url,$sha,$cert,$now,$job['id']]);return ['saved'=>true];
    }
    if($op==='fail'){wa_query("UPDATE wa_brand_jobs SET state='failed',error='APK belum berhasil dibuat. Pengaturan tetap tersimpan; silakan coba kembali.' WHERE id=?",[$job['id']]);return ['saved'=>true];}
    throw new InvalidArgumentException('Operasi pekerja tidak dikenali.');
}
