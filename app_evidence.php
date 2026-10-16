<?php
// Photos are private database records, never public uploads or snapshot payloads.
require_once __DIR__.'/app_core.php';

function wa_attachment_refs($value): array {
    if ($value===null) return [];
    if (!is_array($value)||count($value)>1) throw new InvalidArgumentException('Lampirkan satu foto bukti untuk kiriman ini.');
    $out=[];
    foreach($value as $item){
        if(!is_array($item)||!preg_match('/^[a-f0-9]{64}$/',(string)($item['hash']??'')))throw new InvalidArgumentException('Bukti foto tidak valid.');
        $out[]=['id'=>wa_id($item['id']??''),'hash'=>$item['hash']];
    }
    return $out;
}

function wa_face_report($value,int $at): ?array {
    if($value===null)return null;
    if(!is_array($value)||($value['method']??'')!=='local-face-v1'||($value['status']??'')!=='matched'||!is_numeric($value['at']??null)||abs((int)$value['at']-$at)>300000)throw new InvalidArgumentException('Verifikasi wajah sudah kedaluwarsa. Pindai kembali.');
    // This is a signed device report, not server-side identity or anti-spoofing proof.
    return ['method'=>'local-face-v1','status'=>'matched','at'=>(int)$value['at']];
}

function wa_evidence_upload(array $device,array $input): array {
    if($device['role']!=='student')throw new DomainException('Foto bukti dikirim dari akun mahasiswa sendiri.');
    $account=wa_approved_student($device); $id=wa_id($input['id']??'');
    $session=wa_one('SELECT * FROM wa_sessions WHERE id=?',[wa_id($input['session']??'')]);
    if(!$session||$session['owner_id']!==$account['owner_id']||wa_ctx_key(json_decode($session['ctx'],true))!==$account['ctx_key']||!in_array($account['nim'],json_decode($session['roster'],true),true))throw new DomainException('Foto ini tidak sesuai dengan kelas dan dosen Anda.');
    $image=wa_text($input['image']??'',360000);
    if(!preg_match('~^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$~D',$image,$match))throw new InvalidArgumentException('Gunakan foto JPG, PNG, atau WEBP.');
    $bytes=base64_decode($match[2],true);$info=$bytes!==false?@getimagesizefromstring($bytes):false;
    if($bytes===false||strlen($bytes)>250000||!$info||($info['mime']??'')!==$match[1]||$info[0]<32||$info[1]<32||$info[0]>2048||$info[1]>2048||$info[0]*$info[1]>2400000)throw new InvalidArgumentException('Foto tidak terbaca atau terlalu besar. Pilih ulang foto bukti.');
    $hash=hash('sha256',$bytes);$old=wa_one('SELECT id,account_id,session_id,sha256 FROM wa_evidence WHERE id=?',[$id]);
    if($old){if($old['account_id']!==$account['id']||$old['session_id']!==$session['id']||!hash_equals($old['sha256'],$hash))throw new DomainException('Identitas foto sudah digunakan.');return ['status'=>'success','id'=>$id,'hash'=>$hash];}
    $prior=wa_one('SELECT attachments FROM wa_marks WHERE scope=? AND slot=? AND nim=?',[$session['scope'],$session['slot'],$account['nim']]);
    if($prior){$refs=json_decode($prior['attachments']??'[]',true)?:[];if(!array_filter($refs,static fn($ref)=>$ref['id']===$id&&hash_equals($ref['hash'],$hash)))throw new DomainException('Bukti pada absensi yang sudah terkirim tidak dapat diganti.');}
    if((int)(wa_one('SELECT COUNT(*) AS n FROM wa_evidence WHERE account_id=? AND session_id=?',[$account['id'],$session['id']])['n']??0)>=3)throw new InvalidArgumentException('Batas unggahan sesi ini tercapai. Hubungi dosen untuk meninjau kiriman.');
    wa_query('INSERT INTO wa_evidence(id,owner_id,account_id,ctx_key,session_id,nim,mime,sha256,image_bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$account['owner_id'],$account['id'],$account['ctx_key'],$session['id'],$account['nim'],$match[1],$hash,$bytes,$info[0],$info[1],wa_now()]);
    return ['status'=>'success','id'=>$id,'hash'=>$hash];
}

function wa_evidence_read(array $device,string $id): array {
    $photo=wa_one('SELECT * FROM wa_evidence WHERE id=?',[wa_id($id)]);
    $allowed=$photo&&($device['role']==='teacher'?$photo['owner_id']===$device['account_id']:$photo['account_id']===$device['account_id']);
    if(!$allowed)throw new DomainException('Bukti belum tersinkron atau Anda tidak memiliki akses.');
    return ['status'=>'success','id'=>$id,'hash'=>$photo['sha256'],'image'=>'data:'.$photo['mime'].';base64,'.base64_encode($photo['image_bytes']),'at'=>(int)$photo['created_at']];
}

function wa_check_evidence_binding(array $refs,array $session,string $nim): void {
    foreach($refs as $ref){$photo=wa_one('SELECT owner_id,session_id,nim,sha256 FROM wa_evidence WHERE id=?',[$ref['id']]);
        if($photo&&($photo['owner_id']!==$session['owner_id']||$photo['session_id']!==$session['id']||$photo['nim']!==$nim||!hash_equals($photo['sha256'],$ref['hash'])))throw new DomainException('Bukti foto tidak sesuai dengan mahasiswa atau sesi ini.');
    }
}

function wa_evidence_ready(array $mark): bool {
    $refs=json_decode($mark['attachments']??'[]',true)?:[];
    if(!$refs)return false;
    foreach($refs as $ref){$photo=wa_one('SELECT id FROM wa_evidence WHERE id=? AND owner_id=? AND session_id=? AND nim=? AND sha256=?',[$ref['id'],$mark['owner_id'],$mark['session_id'],$mark['nim'],$ref['hash']]);if(!$photo)return false;}
    return true;
}
