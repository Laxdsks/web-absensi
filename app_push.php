<?php
require_once __DIR__.'/app_core.php';
function wa_push_key(): array {
    $row=wa_one("SELECT value FROM wa_meta WHERE k='push_key'");
    if(!$row){$key=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1']);if(!$key||!openssl_pkey_export($key,$pem))throw new RuntimeException('Kunci notifikasi belum tersedia.');wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES('push_key',?)",[$pem]);$row=wa_one("SELECT value FROM wa_meta WHERE k='push_key'");}
    $key=openssl_pkey_get_private($row['value']);$d=openssl_pkey_get_details($key);return ['key'=>$key,'public'=>wa_b64("\x04".str_pad($d['ec']['x'],32,"\0",STR_PAD_LEFT).str_pad($d['ec']['y'],32,"\0",STR_PAD_LEFT))];
}
function wa_push_subscribe(array $device,array $subscription): void {
    wa_approved_student($device);$url=wa_text($subscription['endpoint']??'',2000);$p=parse_url($url);$host=strtolower($p['host']??'');
    if(($p['scheme']??'')!=='https'||isset($p['user'])||isset($p['pass'])||isset($p['port'])&&!in_array($p['port'],[443],true)||!preg_match('/^(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com|web\.push\.apple\.com)$/',$host))throw new InvalidArgumentException('Layanan pemberitahuan tidak dikenali.');
    if(strlen(wa_unb64($subscription['keys']['p256dh']??''))!==65||strlen(wa_unb64($subscription['keys']['auth']??''))!==16)throw new InvalidArgumentException('Kunci pemberitahuan tidak valid.');
    wa_query('INSERT INTO wa_push_devices(device_id,subscription) VALUES(?,?) ON DUPLICATE KEY UPDATE subscription=VALUES(subscription)',[$device['id'],wa_json($subscription)]);
}
function wa_push_send(array $subscription,array $message): int {
    $client=wa_unb64($subscription['keys']['p256dh']);$auth=wa_unb64($subscription['keys']['auth']);$pem="-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode(hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200').$client),64,"\n")."-----END PUBLIC KEY-----\n";
    $key=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1']);$d=openssl_pkey_get_details($key);$pub="\x04".str_pad($d['ec']['x'],32,"\0",STR_PAD_LEFT).str_pad($d['ec']['y'],32,"\0",STR_PAD_LEFT);$secret=openssl_pkey_derive(openssl_pkey_get_public($pem),$key,32);if(!$secret)return 0;
    $prk=hash_hmac('sha256',$secret,$auth,true);$ikm=hash_hmac('sha256',"WebPush: info\0".$client.$pub."\x01",$prk,true);$salt=random_bytes(16);$prk=hash_hmac('sha256',$ikm,$salt,true);$cek=substr(hash_hmac('sha256',"Content-Encoding: aes128gcm\0\x01",$prk,true),0,16);$nonce=substr(hash_hmac('sha256',"Content-Encoding: nonce\0\x01",$prk,true),0,12);$cipher=openssl_encrypt(wa_json($message)."\x02",'aes-128-gcm',$cek,OPENSSL_RAW_DATA,$nonce,$tag);$body=$salt.pack('N',4096).chr(65).$pub.$cipher.$tag;
    $key=wa_push_key();$u=parse_url($subscription['endpoint']);$aud='https://'.$u['host'];$jwt=wa_b64('{"typ":"JWT","alg":"ES256"}').'.'.wa_b64(wa_json(['aud'=>$aud,'exp'=>time()+3600,'sub'=>'https://datasiswasekolah.42web.io/']));openssl_sign($jwt,$sig,$key['key'],OPENSSL_ALGO_SHA256);$jwt.='.'.wa_b64(wa_sig_raw($sig));
    $headers=['Content-Type: application/octet-stream','Content-Encoding: aes128gcm','TTL: 600','Urgency: high','Authorization: vapid t='.$jwt.', k='.$key['public']];
    if(!function_exists('curl_init'))return 0;$curl=curl_init($subscription['endpoint']);curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>2,CURLOPT_CONNECTTIMEOUT=>1,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);curl_exec($curl);$status=curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);return $status;
}
function wa_push_pending(): void {
    // Separate bounded dispatch keeps attendance writes responsive.
    $attempts=0;
    $sessions=wa_rows('SELECT * FROM wa_sessions WHERE deadline>?',[wa_now()]);
    foreach($sessions as $s){$phase=(int)$s['deadline']-wa_now()<=60000?'reminder':'start';$accounts=wa_rows('SELECT a.nim,d.id,p.subscription FROM wa_accounts a JOIN wa_devices d ON d.account_id=a.id JOIN wa_push_devices p ON p.device_id=d.id WHERE a.ctx_key=? AND a.approved=1 AND d.revoked=0',[wa_ctx_key(json_decode($s['ctx'],true))]);
        foreach($accounts as $a){if(wa_one('SELECT mark FROM wa_marks WHERE scope=? AND slot=? AND nim=?',[$s['scope'],$s['slot'],$a['nim']]))continue;$tag=$s['id'].':'.$s['version'].':'.$phase;if(wa_one('SELECT phase FROM wa_push_sent WHERE device_id=? AND session_id=? AND phase=?',[$a['id'],$s['id'],$tag]))continue;$attempts++;if($attempts>4)return;$status=wa_push_send(json_decode($a['subscription'],true),['title'=>'Absen mahasiswa','body'=>$s['matkul'].($phase==='start'?': absen dimulai. Pindai QR dosen.':': segera absen, waktu tersisa kurang dari 1 menit.'),'tag'=>'wa-'.$s['id']]);if($status>=200&&$status<300)wa_query('INSERT IGNORE INTO wa_push_sent(device_id,session_id,phase) VALUES(?,?,?)',[$a['id'],$s['id'],$tag]);if(in_array($status,[404,410],true))wa_query('DELETE FROM wa_push_devices WHERE device_id=?',[$a['id']]);}
    }
}
