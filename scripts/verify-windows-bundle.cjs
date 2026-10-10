const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const asar=await import('@electron/asar'),root=path.resolve(__dirname,'..'),archive=path.join(root,'dist/windows/win-unpacked/resources/app.asar');
 for(const file of ['app/app.js','app/core.js','app/qr-files.js','app/guide.js','app/guide.css','app/guide-images/student-login.png','app/guide-images/student-qr.png','app/app.css','app-sw.js','app/templates/absen.html','app/templates/ujian.html','assets/offline-bridge.js','assets/teacher-tools.js','assets/teacher-tools.css','app/templates/index.html','native/windows/main.cjs']){
  assert.deepEqual(asar.extractFile(archive,path.normalize(file)),fs.readFileSync(path.join(root,file)),`Outdated Windows asset: ${file}`);
 }
 const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(pkg.version,'1.0.4');
 const exe=path.join(root,'dist/windows/Absensi-Dosen-Windows-1.0.4.exe'),handle=fs.openSync(exe,'r'),magic=Buffer.alloc(2);fs.readSync(handle,magic,0,2,0);fs.closeSync(handle);assert.equal(magic.toString(),'MZ');
 console.log('Windows 1.0.4 executable and bundled offline assets verified.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
