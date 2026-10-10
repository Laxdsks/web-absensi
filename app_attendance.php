<?php
require_once __DIR__.'/app_core.php';

function wa_session_operation(array $device,array $op): array {
    wa_teacher($device);
    $challenge=wa_text($op['challenge']??'',9000);
    $data=wa_open($challenge,$device['pubkey']);
    if(($data['type']??'')!=='session' || ($data['device']??'')!==$device['id'])throw new InvalidArgumentException('QR sesi bukan milik perangkat dosen ini.');
    $id=wa_id($data['id']??''); $ctx=wa_ctx($data['ctx']??null); $course=wa_course($data['matkul']??''); $slot=(int)($data['slot']??0);
    $starts=(int)($data['starts']??0); $deadline=(int)($data['deadline']??0); $ends=(int)($data['ends']??0); $version=(int)($data['version']??0);
    if($slot<1||$slot>24||$starts>$deadline||$deadline>$ends||$starts>=$ends||$ends-$starts>86400000||wa_day($starts)!==wa_day($ends)||$starts<wa_now()-400*86400000||$starts>wa_now()+90*86400000||$version<1||!preg_match('/^[a-f0-9]{32,64}$/',(string)($data['nonce']??'')))throw new InvalidArgumentException('Waktu, pertemuan, atau kode sesi tidak valid.');
    $scope=wa_scope($ctx,$course);
    $old=wa_one('SELECT * FROM wa_sessions WHERE scope=? AND slot=? FOR UPDATE',[$scope,$slot]);
    if($old) {
        if($old['id']!==$id||$old['day']!==wa_day($starts))throw new InvalidArgumentException('Kolom pertemuan sudah digunakan pada tanggal lain. Pilih pertemuan berikutnya.');
        if((int)$old['version']>=$version)return ['status'=>'conflict','message'=>'Kode sesi sudah diganti pada perangkat lain.','remote'=>$old];
        if($old['teacher_id']!==$device['id'])throw new DomainException('Reset kode harus dilakukan pada perangkat pembuat sesi.');
        $roster=array_values(array_unique(array_merge(json_decode($old['roster'],true),array_map(static function($s){return strtoupper($s['nim']);},wa_roster($ctx)))));
    }else $roster=array_values(array_unique(array_map(static function($s){return strtoupper($s['nim']);},wa_roster($ctx))));
    wa_query('INSERT INTO wa_sessions(id,scope,ctx,matkul,slot,day,starts,deadline,ends,version,challenge,teacher_id,roster) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE starts=VALUES(starts),deadline=VALUES(deadline),ends=VALUES(ends),version=VALUES(version),challenge=VALUES(challenge),roster=VALUES(roster),finalized=0',[$id,$scope,wa_json($ctx),$course,$slot,wa_day($starts),$starts,$deadline,$ends,$version,$challenge,$device['id'],wa_json($roster)]);
    if($deadline>wa_now())wa_query("DELETE FROM wa_marks WHERE scope=? AND slot=? AND source='automatic'",[$scope,$slot]);
    wa_audit($device,$old?'reset-qr':'open-session',$id,['slot'=>$slot,'day'=>wa_day($starts),'version'=>$version]);
    return ['status'=>'success','session'=>$id];
}

function wa_location($location): ?array {
    if($location===null)return null;
    if(!is_array($location)||!is_numeric($location['lat']??null)||!is_numeric($location['lon']??null)||!is_numeric($location['accuracy']??null)||!is_numeric($location['at']??null))throw new InvalidArgumentException('Keterangan lokasi tidak valid.');
    $out=['lat'=>(float)$location['lat'],'lon'=>(float)$location['lon'],'accuracy'=>(float)$location['accuracy'],'at'=>(int)$location['at']];
    if(!is_finite($out['lat'])||!is_finite($out['lon'])||!is_finite($out['accuracy'])||abs($out['lat'])>90||abs($out['lon'])>180||$out['accuracy']<0||$out['accuracy']>100000||abs(wa_now()-$out['at'])>400*86400000)throw new InvalidArgumentException('Keterangan lokasi berada di luar batas.');
    return $out;
}

function wa_reply_wrapper(string $code): array {
    if(!str_starts_with($code,'WA1:')||strlen($code)>14000)throw new InvalidArgumentException('Gunakan QR balasan dari aplikasi mahasiswa.');
    $wrapper=json_decode(wa_unb64(substr($code,4)),true,32,JSON_THROW_ON_ERROR);
    if(($wrapper['type']??'')!=='reply')throw new InvalidArgumentException('QR ini bukan balasan mahasiswa.');
    $identity=wa_open(wa_text($wrapper['certificate']??'',7000),wa_signing_key()['public']);
    if(($identity['type']??'')!=='identity'||($identity['role']??'')!=='student'||empty($identity['approved']))throw new DomainException('Pendaftaran mahasiswa belum disetujui.');
    $device=wa_one('SELECT * FROM wa_devices WHERE id=? AND revoked=0',[wa_id($identity['device']??'')]);
    if(!$device||$device['role']!=='student'||$device['pubkey']!==($identity['pub']??'')||$device['account_id']!==($identity['account']??''))throw new DomainException('Perangkat mahasiswa sudah keluar akun atau tidak terdaftar.');
    $reply=wa_open(wa_text($wrapper['reply']??'',7000),$device['pubkey']);
    if(($reply['type']??'')!=='reply'||($reply['device']??'')!==$device['id'])throw new InvalidArgumentException('Tanda tangan mahasiswa tidak cocok.');
    return ['reply'=>$reply,'device'=>$device,'account'=>wa_approved_student($device)];
}

function wa_accept_reply(array $device,array $op): array {
    $receipt=false; $code=wa_text($op['code']??'',14000); $at=wa_now();
    if($device['role']==='teacher') {
        wa_teacher($device);
        $proof=wa_open(wa_text($op['receipt']??'',23000),$device['pubkey']);
        if(($proof['type']??'')!=='receipt'||($proof['device']??'')!==$device['id']||($proof['code']??'')!==$code)throw new InvalidArgumentException('Bukti pemindaian dosen tidak cocok.');
        $at=(int)($proof['at']??0); $receipt=true;
        if($at>wa_now()+300000||$at<wa_now()-400*86400000)throw new InvalidArgumentException('Waktu pemindaian dosen tidak valid.');
    }
    $opened=wa_reply_wrapper($code); $reply=$opened['reply']; $student=$opened['account'];
    if(!$receipt && $opened['device']['id']!==$device['id'])throw new DomainException('Mahasiswa hanya dapat mengirim absennya sendiri.');
    $session=wa_one('SELECT * FROM wa_sessions WHERE id=? FOR UPDATE',[wa_id($reply['session']??'')]);
    if(!$session)throw new InvalidArgumentException('Sesi belum tersinkron. Minta dosen membuka atau menyinkronkan sesi terlebih dahulu.');
    $teacher=wa_one('SELECT * FROM wa_devices WHERE id=? AND revoked=0',[$session['teacher_id']]);
    if(!$teacher)throw new DomainException('Sesi ini sudah tidak aktif.');
    $challenge=wa_open($session['challenge'],$teacher['pubkey']);
    if(!hash_equals((string)$challenge['nonce'],(string)($reply['nonce']??'')))throw new InvalidArgumentException('Kode QR sudah direset. Pindai kode terbaru.');
    $ctx=json_decode($session['ctx'],true);
    if(wa_ctx_key($ctx)!==$student['ctx_key']||!in_array($student['nim'],json_decode($session['roster'],true),true))throw new DomainException('Mahasiswa tidak terdaftar dalam kelas pada QR ini.');
    $mark=wa_text($reply['mark']??'',1);
    if(!in_array($mark,['.','S','I'],true))throw new InvalidArgumentException('Pilih hadir, sakit, atau izin.');
    if(wa_day($at)!==$session['day']||$at>(int)$session['ends'])throw new InvalidArgumentException('Sesi telah berakhir atau QR berasal dari tanggal lain.');
    if($mark==='.'&&($at<(int)$session['starts']||$at>(int)$session['deadline']))throw new InvalidArgumentException('Absen hadir berada di luar batas waktu yang ditetapkan dosen.');
    $reason=wa_text($reply['reason']??'',500);
    if($mark!=='.'&&$reason==='')throw new InvalidArgumentException('Isi alasan sakit atau izin.');
    $location=wa_location($reply['location']??null);
    if($location && abs((int)($reply['at']??0)-$location['at'])>300000)throw new InvalidArgumentException('Lokasi sudah terlalu lama. Ambil lokasi kembali.');
    $old=wa_one('SELECT * FROM wa_marks WHERE scope=? AND slot=? AND nim=? FOR UPDATE',[$session['scope'],$session['slot'],$student['nim']]);
    if($old && $old['mark']!=='' && $old['source']!=='automatic')return ['status'=>'success','duplicate'=>true,'mark'=>$old['mark'],'message'=>'Absen sudah tercatat; perubahan berikutnya dilakukan dosen.'];
    wa_query('INSERT INTO wa_marks(scope,slot,nim,mark,session_id,reason,location,source,review_status,revision,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE mark=VALUES(mark),reason=VALUES(reason),location=VALUES(location),source=VALUES(source),review_status=VALUES(review_status),revision=revision+1,recorded_at=VALUES(recorded_at)',[$session['scope'],$session['slot'],$student['nim'],$mark,$session['id'],$reason,$location?wa_json($location):null,$receipt?'qr-offline':'qr-online',$mark==='.'?'final':'pending',1,$at]);
    wa_audit($device,$receipt?'scan-reply':'submit-attendance',$session['id'].':'.$student['nim'],['mark'=>$mark,'locationIncluded'=>$location!==null,'receivedAt'=>$at]);
    return ['status'=>'success','mark'=>$mark];
}

function wa_operation(array $device,array $op): array {
    $type=(string)($op['type']??'');
    if($type==='session')return wa_session_operation($device,$op);
    if($type==='reply')return wa_accept_reply($device,$op);
    wa_teacher($device);
    if($type==='approve') {
        $id=wa_id($op['account']??''); $account=wa_one('SELECT * FROM wa_accounts WHERE id=? FOR UPDATE',[$id]);
        if(!$account)throw new InvalidArgumentException('Pendaftaran tidak ditemukan.');
        $ctx=json_decode($account['ctx'],true); $nim=$account['nim'];
        $match=array_values(array_filter(wa_roster($ctx),static function($s)use($nim){return strtoupper($s['nim'])===$nim;}));
        if(!$match)wa_query("INSERT INTO siswa(jenjang,prodi,semester,kelas,nim,nama,jk) VALUES('S1',?,?,?,?,?,?)",[$ctx['prodi'],$ctx['semester'],$ctx['kelas'],$nim,$account['nama'],$account['jk']]);
        else wa_query('UPDATE wa_accounts SET nama=?,jk=? WHERE id=?',[$match[0]['nama'],$match[0]['jk'],$id]);
        wa_query('UPDATE wa_accounts SET approved=1,approved_by=? WHERE id=?',[$device['account_id'],$id]);
        foreach(wa_rows('SELECT id,ctx,roster FROM wa_sessions WHERE deadline>? FOR UPDATE',[wa_now()]) as $session){
            if(wa_ctx_key(json_decode($session['ctx'],true))!==wa_ctx_key($ctx))continue;
            $roster=json_decode($session['roster'],true);if(!in_array($nim,$roster,true)){$roster[]=$nim;wa_query('UPDATE wa_sessions SET roster=? WHERE id=?',[wa_json($roster),$session['id']]);}
        }
        wa_audit($device,'approve-student',$id,['nim'=>$nim]);
        return ['status'=>'success'];
    }
    if($type==='revoke-student') {
        $id=wa_id($op['account']??''); wa_query('UPDATE wa_accounts SET approved=0 WHERE id=?',[$id]); wa_query('UPDATE wa_devices SET revoked=1 WHERE account_id=?',[$id]); wa_audit($device,'revoke-student',$id,[]); return ['status'=>'success'];
    }
    $ctx=wa_ctx($op['ctx']??null);
    if($type==='student-upsert'||$type==='student-delete') {
        $nim=wa_nim($op['nim']??'');
        $matches=array_values(array_filter(wa_roster($ctx),static function($s)use($nim){return strtoupper($s['nim'])===$nim;}));
        $old=$matches[0]??null;
        if(isset($op['base'])&&!($type==='student-delete'&&!$old)&&($old['nama']??null)!==($op['base']['nama']??null))return ['status'=>'conflict','remote'=>$old,'message'=>'Identitas mahasiswa telah diedit pada perangkat lain.'];
        if($type==='student-delete') { if($old)wa_query('DELETE FROM siswa WHERE id=?',[$old['id']]); wa_audit($device,'delete-student',$nim,['ctx'=>$ctx]); return ['status'=>'success']; }
        $name=wa_text($op['nama']??''); $jk=wa_text($op['jk']??'',1);
        if($name===''||!in_array($jk,['L','P'],true))throw new InvalidArgumentException('Lengkapi nama dan L/P.');
        if($old)wa_query('UPDATE siswa SET nama=?,jk=? WHERE id=?',[$name,$jk,$old['id']]);
        else wa_query("INSERT INTO siswa(jenjang,prodi,semester,kelas,nim,nama,jk) VALUES('S1',?,?,?,?,?,?)",[$ctx['prodi'],$ctx['semester'],$ctx['kelas'],$nim,$name,$jk]);
        wa_audit($device,'save-student',$nim,['ctx'=>$ctx]); return ['status'=>'success'];
    }
    $course=wa_text($op['matkul']??'',180); $scope=wa_scope($ctx,$course);
    if($type==='document')return wa_save_document($ctx,$course,wa_text($op['kind']??'',40),is_array($op['content']??null)?$op['content']:[],isset($op['baseRevision'])?(int)$op['baseRevision']:0);
    if($type==='mark'||$type==='review') {
        $slot=(int)($op['slot']??0); $nim=wa_nim($op['nim']??''); $mark=wa_text($op['mark']??'',1);
        if($slot<1||$slot>24||!in_array($mark,['.','A','S','I',''],true))throw new InvalidArgumentException('Isian absen tidak valid.');
        if(!array_filter(wa_roster($ctx),static function($s)use($nim){return strtoupper($s['nim'])===$nim;}))throw new InvalidArgumentException('NIM tidak ada dalam kelas.');
        $old=wa_one('SELECT * FROM wa_marks WHERE scope=? AND slot=? AND nim=? FOR UPDATE',[$scope,$slot,$nim]);
        if(isset($op['baseRevision'])&&(int)$op['baseRevision']!==(int)($old['revision']??0))return ['status'=>'conflict','revision'=>(int)($old['revision']??0),'remote'=>$old,'message'=>'Absensi telah berubah pada perangkat lain.'];
        $reason=wa_text($op['reason']??($old['reason']??''),500); $review=$type==='review'?wa_text($op['decision']??$op['review_status']??'reviewed',20):'final';
        if(!in_array($review,['reviewed','accepted','rejected','final'],true))throw new InvalidArgumentException('Tinjauan tidak valid.');
        wa_query('INSERT INTO wa_marks(scope,slot,nim,mark,reason,location,source,review_status,revision,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE mark=VALUES(mark),reason=VALUES(reason),source=VALUES(source),review_status=VALUES(review_status),revision=revision+1,recorded_at=VALUES(recorded_at)',[$scope,$slot,$nim,$mark,$reason,$old['location']??null,'manual',$review,1,wa_now()]);
        wa_audit($device,$type,$scope.':'.$slot.':'.$nim,['mark'=>$mark,'review'=>$review]); return ['status'=>'success','revision'=>(int)($old['revision']??0)+1];
    }
    throw new InvalidArgumentException('Jenis perubahan tidak dikenali.');
}

function wa_sync(array $device,array $operations): array {
    if(count($operations)>100)throw new InvalidArgumentException('Kirim maksimal 100 perubahan per sinkronisasi.');
    $results=[];
    foreach($operations as $op) {
        $id=wa_id($op['id']??''); $saved=wa_one('SELECT * FROM wa_operations WHERE id=?',[$id]);
        if($saved) { if($saved['device_id']!==$device['id'])throw new DomainException('ID perubahan digunakan perangkat lain.'); $results[]=array_merge(json_decode($saved['result'],true),['id'=>$id]); continue; }
        wa_db()->begin_transaction();
        try {
            $result=wa_operation($device,$op);
            if(($result['status']??'')==='success')wa_query('INSERT INTO wa_operations(id,device_id,result,created_at) VALUES(?,?,?,?)',[$id,$device['id'],wa_json($result),wa_now()]);
            wa_db()->commit();
        }catch(DomainException|InvalidArgumentException|JsonException $error) { wa_db()->rollback(); $result=['status'=>'error','message'=>$error->getMessage()]; }
        catch(Throwable $error) { wa_db()->rollback(); error_log('WA sync error: '.get_class($error)); $result=['status'=>'retry','message'=>'Penyimpanan belum berhasil. Perubahan tetap berada di perangkat.']; }
        $results[]=array_merge($result,['id'=>$id]);
    }
    return $results;
}
