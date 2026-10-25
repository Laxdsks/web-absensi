<?php
/* Private appearance settings, patched per field to avoid overwriting other devices. */
function wa_appearance_key(string $owner): string { return 'appearance:'.substr(hash('sha256',$owner),0,45); }
function wa_appearance_read(array $device,bool $summary=false): array {
    if($device['role']!=='teacher')return [];
    $saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=?',[wa_appearance_key($device['account_id'])])['value']??'{}',true)?:[];
    $result=['revision'=>(int)($saved['revision']??0),'versions'=>$saved['versions']??new stdClass(),'updatedAt'=>(int)($saved['updatedAt']??0)];
    if(!$summary)$result['settings']=$saved['settings']??new stdClass();
    return $result;
}
function wa_appearance_value(string $key,$value) {
    $keys=['presen-theme','presen-accent','presen-brand-image','presen-brand-size','custom_bg_wallpaper','custom_bg_wallpaper_width','custom_bg_wallpaper_height','custom_bg_wallpaper_mode','custom_bg_wallpaper_scale','custom_bg_wallpaper_x','custom_bg_wallpaper_y'];
    if(!in_array($key,$keys,true))throw new InvalidArgumentException('Pengaturan tampilan tidak dikenali.');
    if($value===null)return null;
    if(!is_string($value))throw new InvalidArgumentException('Nilai tampilan tidak valid.');
    if(in_array($key,['presen-brand-image','custom_bg_wallpaper'],true)){
        if(strlen($value)>1450000||!preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$~D',$value,$m))throw new InvalidArgumentException('Gunakan gambar PNG, JPG, atau WebP yang lebih kecil.');
        $binary=base64_decode($m[2],true);$size=$binary!==false?@getimagesizefromstring($binary):false;
        if(!$size||!in_array($size['mime']??'',['image/png','image/jpeg','image/webp'],true)||$size[0]*$size[1]>24000000)throw new InvalidArgumentException('Gambar tampilan tidak valid atau terlalu besar.');
        return $value;
    }
    if($key==='presen-theme'&&!in_array($value,['putih','malam','samudra','senja'],true))throw new InvalidArgumentException('Pilih tema yang tersedia.');
    if($key==='presen-accent'&&!preg_match('/^#[0-9a-f]{6}$/iD',$value))throw new InvalidArgumentException('Warna tampilan tidak valid.');
    if($key==='custom_bg_wallpaper_mode'&&!in_array($value,['cover','contain','auto','manual'],true))throw new InvalidArgumentException('Mode wallpaper tidak valid.');
    $ranges=['presen-brand-size'=>[24,80],'custom_bg_wallpaper_width'=>[1,50000],'custom_bg_wallpaper_height'=>[1,50000],'custom_bg_wallpaper_scale'=>[1,1000],'custom_bg_wallpaper_x'=>[0,100],'custom_bg_wallpaper_y'=>[0,100]];
    if(isset($ranges[$key])&&(!is_numeric($value)||(float)$value<$ranges[$key][0]||(float)$value>$ranges[$key][1]))throw new InvalidArgumentException('Ukuran atau posisi gambar tidak valid.');
    return $value;
}
function wa_appearance_save(array $device,array $input): array {
    wa_teacher($device);
    if(isset($input['owner'])&&$input['owner']!==$device['account_id'])throw new DomainException('Tampilan ini milik akun lain.');
    $field=(string)($input['key']??'');$value=wa_appearance_value($field,$input['value']??null);$expected=(int)($input['baseVersion']??0);$key=wa_appearance_key($device['account_id']);
    wa_db()->begin_transaction();
    try{
        wa_query("INSERT IGNORE INTO wa_meta(k,value) VALUES(?,'{}')",[$key]);
        $saved=json_decode(wa_one('SELECT value FROM wa_meta WHERE k=? FOR UPDATE',[$key])['value'],true)?:[];
        $version=(int)($saved['versions'][$field]??0);
        if($expected!==$version){$same=array_key_exists($field,$saved['settings']??[])&&$saved['settings'][$field]===$value;wa_db()->rollback();return ['status'=>'success','conflict'=>!$same,'appearance'=>wa_appearance_read($device)];}
        $saved['settings'][$field]=$value;$saved['versions'][$field]=$version+1;$saved['revision']=(int)($saved['revision']??0)+1;$saved['updatedAt']=wa_now();
        if(strlen(wa_json($saved))>3300000)throw new InvalidArgumentException('Ukuran tampilan akun terlalu besar. Gunakan gambar yang lebih kecil.');
        wa_query('UPDATE wa_meta SET value=? WHERE k=?',[wa_json($saved),$key]);
        wa_db()->commit();
        return ['status'=>'success','appearance'=>wa_appearance_read($device)];
    }catch(Throwable $error){wa_db()->rollback();throw $error;}
}
