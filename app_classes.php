<?php
/* Class invitations contain class context only, never a student's identity. */
function wa_create_class_invite(array $device,array $input): array {
    wa_teacher($device);$ctx=wa_teacher_context($device,is_array($input['ctx']??null)?$input['ctx']:[]);$course=wa_text($input['matkul']??'',180);$token=bin2hex(random_bytes(16));
    wa_query('INSERT INTO wa_class_invites(token_hash,owner_id,ctx,matkul,reset_epoch,created_at) VALUES(?,?,?,?,?,?)',[hash('sha256',$token),$device['account_id'],wa_json($ctx),$course,wa_student_data_epoch(),wa_now()]);
    return ['token'=>$token,'ctx'=>$ctx,'matkul'=>$course,'teacher'=>wa_teacher_label(wa_teacher_account($device['account_id']))];
}
function wa_resolve_class_invite(string $token): array {
    if(!preg_match('/^[a-f0-9]{32}$/D',$token))throw new InvalidArgumentException('Kode undangan kelas tidak valid.');
    $invite=wa_one('SELECT * FROM wa_class_invites WHERE token_hash=?',[hash('sha256',$token)]);if(!$invite)throw new InvalidArgumentException('Undangan tidak tersedia atau sudah direset. Minta undangan terbaru dari dosen.');
    $teacher=wa_teacher_account($invite['owner_id']);$epoch=(int)(wa_one('SELECT value FROM wa_meta WHERE k=?',['student_data_epoch:'.$invite['owner_id']])['value']??0);
    if(!$teacher||$teacher['status']!=='active'||(int)$invite['reset_epoch']!==$epoch)throw new DomainException('Undangan sudah tidak berlaku. Minta undangan terbaru dari dosen.');
    return ['token'=>$token,'ctx'=>json_decode($invite['ctx'],true),'matkul'=>$invite['matkul'],'teacher'=>wa_teacher_label($teacher)];
}
