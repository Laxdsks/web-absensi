const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const root=path.join(__dirname,'..'),php=process.env.WA_PHP||(fs.existsSync('/workspace/cloud-web-absensi/bin/php')?'/workspace/cloud-web-absensi/bin/php':'php');const version=require('../package.json').version;
function teacherCore(){return fs.readFileSync(path.join(root,'app/core.js'),'utf8')
 .replace('timer=setTimeout(()=>controller.abort(),20000)','timer=setTimeout(()=>controller.abort(),window.PresenTeacherStartup?.ready===false&&["snapshot","sync","appearance-read"].includes(action)?1800:20000)')
 .replace("new URL('app-sw.js',ROOT)","new URL('teacher-sw.js',ROOT)")
 .replace('async function prepareOffline()','async function prepareOffline(options={})')
 .replace("bundled:!!(window.Android||window.AbsensiDesktop)","bundled:!!(window.Android||window.AbsensiDesktop),full:options.full===true")
 .replace("if(s.profile?.role!=='teacher'||dispatching)return;","if(s.profile?.role!=='teacher'||dispatching||!s.snapshot.sessions.some(x=>x.deadline>now(s)))return;")
 .replace('if(r.unchanged){await change(','if(r.unchanged){if(Math.abs(now(s)-Number(r.serverTime))>1000)await change(');}
// These generated public entry points retain one source for each implementation.
for(const file of fs.readdirSync(path.join(root,'app')))if(/^(runtime-teacher|core)-[0-9].*\.js$/.test(file))fs.unlinkSync(path.join(root,'app',file));
fs.writeFileSync(path.join(root,'app','core-'+version+'.js'),fs.readFileSync(path.join(root,'app/core.js')));
// The teacher variant exposes an account reload hook without changing student APK assets.
const appearance=fs.readFileSync(path.join(root,'app/appearance.js'),'utf8'),appearanceExport='window.PresenAppearance={open,apply,ready:appearanceReady};';
if(!appearance.includes(appearanceExport))throw Error('Update the teacher appearance adapter for the shared export.');
fs.writeFileSync(path.join(root,'app/teacher-appearance.js'),appearance.replace(appearanceExport,`window.PresenAppearance={open,apply,ready:appearanceReady,reloadAccount:async()=>{wallpaperTicket++;wallpaperImage='';if(saved('db','')==='1')wallpaperImage=await WA.get('wallpaper-source')||'';apply();applyBrand();const p=document.getElementById('presenAppearanceDialog');if(p){p.querySelector('#pTheme').value=document.documentElement.dataset.theme||'putih';p.querySelector('#pAccent').value=localStorage.getItem('presen-accent')||'#2463dc';p.querySelector('#pBrandSize').value=localStorage.getItem('presen-brand-size')||'48';p.querySelector('#pBrandPreview').src=document.querySelector('.portal-brand>img,.p-workspace-brand')?.src||'';}const src=wallpaperImage||saved('','');if(src){const image=new Image();image.src=src;await Promise.race([image.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,200))]);}}};`));
// Teacher tours share the maintained chapter catalogue; the student APK keeps its own renderer.
const guide=fs.readFileSync(path.join(root,'app/guide.js'),'utf8'),guideSplit=guide.indexOf(",host=document.createElement('div');");
if(guideSplit<0)throw Error('Update the teacher guide adapter for the shared chapter catalogue.');
fs.writeFileSync(path.join(root,'app/teacher-guide.js'),guide.slice(0,guideSplit)+';\n'+fs.readFileSync(path.join(root,'app/teacher-guide-tour.js'),'utf8')+'\n})();\n');
for(const file of ['index.php','data_siswa.php','absen.php','ujian.php','music_player.php','app_core.php','app/index.html','app-sw.js']){const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/(runtime-teacher|core)-\d+\.\d+\.\d+(?=\.js|-)/g,(_,name)=>name+'-'+version));}
require('./build-teacher-bundle.cjs').build(version,teacherCore);
// Teacher pages must request one coherent set of layout assets after deployment.
const build=fs.readFileSync(path.join(root,'app_core.php'),'utf8').match(/const WA_BUILD = '([^']+)'/)[1];
// A distinct pathname also bypasses older workers that ignore query strings.
fs.copyFileSync(path.join(root,'app','runtime-teacher-'+version+'.js'),path.join(root,'app','runtime-teacher-'+version+'-'+build+'.js'));
require('./build-teacher-worker.cjs')(build);
for(const file of ['index.php','data_siswa.php','absen.php','ujian.php','music_player.php','app_core.php']){const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/((?:src|href)=["'](?:app|assets)\/[a-z][a-z0-9.-]*\.(?:js|css))(?:\?[^"']*)?/gi,(_,asset)=>asset+'?v='+build));}
for(const page of ['index','data_siswa','absen','ujian','music_player']){const result=spawnSync(php,[path.join(__dirname,'build-template.php'),page],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const expected=['app_core.php','app_preferences.php','app_courses.php','app_attendance.php','app_evidence.php','app_push.php','app_api.php','app_branding.php','teacher_accounts.php'];for(const file of expected){const result=spawnSync(php,['-l',path.join(root,file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('Lembar offline dibuat tanpa data akun atau mahasiswa.');
