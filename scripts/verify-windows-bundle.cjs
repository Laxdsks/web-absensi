const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const asar=await import('@electron/asar'),root=path.resolve(__dirname,'..'),archive=path.join(root,'dist/windows/win-unpacked/resources/app.asar');
 const version=require('../package.json').version;
 for(const file of [`app/core-${version}.js`,`app/runtime-teacher-${version}.js`,'app/icon-settings.js','app/portal.css','app/portal.js','app/appearance.js','app/portal-background.svg','app/student-tools.js','app/account-tools.js','app/locations.js','app/inbox.js','app/grade-assistant.js','app/workspace.js','app/app.js','app/core.js','app/qr-files.js','app/guide.js','app/guide.css','app/guide-images/student-login.png','app/guide-images/student-qr.png','app/app.css','app-sw.js','app/templates/data_siswa.html', 'app/vendor/tesseract.min.js', 'app/vendor/worker.min.js', 'app/vendor/eng.traineddata', 'app/templates/absen.html','app/templates/ujian.html','app/templates/music_player.html','assets/app-audio.js','assets/sheet-fit.js','assets/sheet-fit.css','assets/offline-bridge.js','assets/teacher-tools.js','assets/teacher-tools.css','app/templates/index.html','native/windows/main.cjs','native/windows/icon-actions.cjs','native/windows/preload.cjs']){
  assert.deepEqual(asar.extractFile(archive,path.normalize(file)),fs.readFileSync(path.join(root,file)),`Outdated Windows asset: ${file}`);
 }
 const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(pkg.version,version);
 const exe=path.join(root,`dist/windows/Absensi-Dosen-Windows-${version}.exe`),handle=fs.openSync(exe,'r'),magic=Buffer.alloc(2);fs.readSync(handle,magic,0,2,0);fs.closeSync(handle);assert.equal(magic.toString(),'MZ');
 console.log(`Windows ${version} executable and bundled offline assets verified.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
