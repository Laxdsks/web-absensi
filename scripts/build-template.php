<?php
$pages=['data_siswa','absen','ujian','index','music_player'];
$page=$argv[1]??''; if(!in_array($page,$pages,true))exit(2);
define('APP_TEMPLATE_BUILD',true);
ini_set('display_errors','0');
$root=dirname(__DIR__);$stub=sys_get_temp_dir().'/wa-build-stub';if(!is_dir($stub))mkdir($stub,0700,true);file_put_contents($stub.'/koneksi.php','<?php $koneksi=null; $conn=null;');
chdir($stub);set_include_path($stub.PATH_SEPARATOR.$root);
$_SERVER['REQUEST_METHOD']='GET';$_SERVER['PHP_SELF']='/'.$page.'.php';$_SERVER['HTTP_HOST']='localhost';
session_start();$_SESSION=['id_user'=>'admin_01','nama_user'=>'Dosen','role'=>'Administrator Utama','theme'=>'putih'];
$_GET=['jenjang'=>'S1','prodi'=>'Pendidikan Teknologi Informasi','semester'=>'1','kelas'=>'A','theme'=>'putih'];
ob_start();require $root.'/'.$page.'.php';$html=ob_get_clean();
if(!str_contains($html,'<html'))exit(3);
if($page==='index')$html=preg_replace('/isLoggedIn: (?:true|false)/','isLoggedIn: false',$html);
file_put_contents($root.'/app/templates/'.$page.'.html',$html);
