<?php
/* Editable institutional defaults shared by attendance and exam sheets. */
function wa_letterhead_logo(string $side): string {
    $file=__DIR__.'/assets/'.($side==='left'?'logo-yapis-dompu.png':'logo-stkip-yapis-dompu.png');
    return 'data:image/png;base64,'.base64_encode(file_get_contents($file));
}
function wa_letterhead_lines(bool $exam=false): string {
    $lines=[
        'inst-1'=>'YAYASAN PENDIDIKAN ISLAM',
        'inst-2'=>'SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN',
        'inst-3'=>'(STKIP) YAPIS DOMPU',
        'inst-accreditation'=>'Status Akreditasi: Baik Sekali (SK. No. 554/SK/BAN-PT/Ak/PT/VIII/2023)',
        'inst-address'=>'Jln. STKIP Yapis Dompu No. 1, Sorisakolo, Dompu, Nusa Tenggara Barat',
        'inst-contact'=>'E-mail: akademik@stkipyapisdompu.ac.id | Website: http://www.stkipyapisdompu.ac.id'
    ];
    $classes=$exam?['line line-one','line line-two','line line-three','contact letterhead-status','contact letterhead-address','contact letterhead-contact']:['line-1','line-2','line-3','line-4 letterhead-status','line-4 letterhead-address','line-5 letterhead-contact'];
    $out='';$i=0;foreach($lines as $key=>$text){
        $safe=htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$markup=$safe;
        if($key==='inst-contact')$markup='E-mail: <a href="mailto:akademik@stkipyapisdompu.ac.id" contenteditable="false">akademik@stkipyapisdompu.ac.id</a> | Website: <a href="https://www.stkipyapisdompu.ac.id" target="_blank" rel="noopener noreferrer" contenteditable="false">http://www.stkipyapisdompu.ac.id</a>';
        $out.='<span class="'.$classes[$i++].'" contenteditable="true" data-edit-key="'.$key.'" data-default-text="'.$safe.'">'.$markup.'</span>';
    }return $out;
}
