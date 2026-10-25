<?php
/* An account-owned catalogue; hiding a course never destroys its academic records. */
function wa_courses_key(string $owner): string { return 'courses:'.substr(hash('sha256',$owner),0,48); }
function wa_courses_snapshot(array $device,array $sessions,array $documents): array {
    if($device['role']!=='teacher')return ['courses'=>[],'courseSelections'=>[]];
    $saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=?',[wa_courses_key($device['account_id'])])['value']??'{}',true)?:[];
    $courses=[];$selections=[];
    foreach(array_merge($sessions,$documents) as $row){
        $name=trim((string)$row['matkul']);if($name==='')continue;
        $ctx=is_array($row['ctx'])?$row['ctx']:json_decode($row['ctx'],true);$key=wa_ctx_key($ctx);$id=hash('sha256',$name);
        $at=(int)($row['updated_at']??$row['starts']??0);
        if(!isset($courses[$key][$id])||$at>$courses[$key][$id]['updatedAt'])$courses[$key][$id]=['ctx'=>$ctx,'matkul'=>$name,'hidden'=>false,'updatedAt'=>$at];
    }
    foreach($saved as $key=>$entry){
        foreach($entry['items']??[] as $id=>$item)$courses[$key][$id]=['ctx'=>$entry['ctx'],'matkul'=>$item['name'],'hidden'=>(bool)$item['hidden'],'updatedAt'=>(int)$item['at']];
        $selections[]=['ctx'=>$entry['ctx'],'matkul'=>(string)($entry['selected']??'')];
    }
    $flat=[];foreach($courses as $items)foreach($items as $item)$flat[]=$item;
    return ['courses'=>$flat,'courseSelections'=>$selections];
}
function wa_course_operation(array $device,array $op,array $ctx): array {
    $key=wa_courses_key($device['account_id']);$class=wa_ctx_key($ctx);$name=wa_text($op['matkul']??'',180);$type=$op['type'];
    if($name===''&&$type!=='course-select')throw new InvalidArgumentException('Isi nama mata kuliah.');
    wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES(?,'{}')",[$key]);
    $saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=? FOR UPDATE',[$key])['value'],true)?:[];
    $entry=$saved[$class]??['ctx'=>$ctx,'items'=>[],'selected'=>''];
    if($name!==''){
        $id=hash('sha256',$name);
        if(count($entry['items'])>=200&&!isset($entry['items'][$id]))throw new InvalidArgumentException('Maksimal 200 mata kuliah per kelas.');
        $entry['items'][$id]=['name'=>$name,'hidden'=>$type==='course-hide','at'=>wa_now()];
    }
    if($type==='course-select'||$type==='course-upsert')$entry['selected']=$name;
    if($type==='course-hide'&&$entry['selected']===$name)$entry['selected']='';
    $saved[$class]=$entry;
    wa_query('UPDATE wa_meta SET value=? WHERE k=?',[wa_json($saved),$key]);
    wa_audit($device,$type,$class,['matkul'=>$name]);
    return ['status'=>'success'];
}
