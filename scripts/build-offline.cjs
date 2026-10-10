const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const root=path.join(__dirname,'..'),php=process.env.WA_PHP||(fs.existsSync('/workspace/cloud-web-absensi/bin/php')?'/workspace/cloud-web-absensi/bin/php':'php');const version=require('../package.json').version;
// These generated public entry points retain one source for each implementation.
for(const file of fs.readdirSync(path.join(root,'app')))if(/^(runtime-teacher|core)-[0-9].*\.js$/.test(file))fs.unlinkSync(path.join(root,'app',file));
fs.writeFileSync(path.join(root,'app','core-'+version+'.js'),fs.readFileSync(path.join(root,'app/core.js')));
fs.writeFileSync(path.join(root,'app','runtime-teacher-'+version+'.js'),['app/core.js','assets/offline-bridge.js','assets/teacher-tools.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n;\n'));
for(const file of ['index.php','data_siswa.php','absen.php','ujian.php','music_player.php','app/index.html','app-sw.js']){const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/(runtime-teacher|core)-\d+\.\d+\.\d+\.js/g,(_,name)=>name+'-'+version+'.js'));}
for(const page of ['index','data_siswa','absen','ujian','music_player']){const result=spawnSync(php,[path.join(__dirname,'build-template.php'),page],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const expected=['app_core.php','app_attendance.php','app_push.php','app_api.php'];for(const file of expected){const result=spawnSync(php,['-l',path.join(root,file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('Lembar offline dibuat tanpa data akun atau mahasiswa.');
