"""Exercise the delivered signed student APK on an isolated Android emulator."""
import hashlib,json,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/results/student-current';OUT.mkdir(parents=True,exist_ok=True)
OLD='id.webabsensi.parallel2026.mahasiswa';NEW='id.webabsensi.presengo.mahasiswa'
def adb(*args):return subprocess.check_output(['adb',*args],stderr=subprocess.STDOUT,text=True,timeout=90).strip()
def install(file):
    if 'Success' not in adb('install','-r',str(file)):raise RuntimeError('Android installation failed.')
def sentinel(package):return '/data/user/0/'+package+'/files/presen-install-sentinel.txt'
def write_sentinel(package,text):
    adb('shell','mkdir','-p','/data/user/0/'+package+'/files')
    adb('shell','sh','-c',"'printf %s "+text+' > '+sentinel(package)+"'")
old=ROOT/'previous-v2-installers/Absen-Mahasiswa-Android.apk';new=ROOT/'native/android/prebuilt/Presen-Go-1.2.2.apk'
if hashlib.sha256(old.read_bytes()).hexdigest()!='6b86ff328d2b73be29b1972d0f3bf53fe337f2b45d1485834b2f6e782507d9c6':raise RuntimeError('Unexpected original APK.')
adb('root');time.sleep(2);install(old);write_sentinel(OLD,'original-data-retained');install(new)
packages=adb('shell','pm','list','packages');assert 'package:'+OLD in packages and 'package:'+NEW in packages
assert adb('shell','cat',sentinel(OLD))=='original-data-retained'
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');adb('logcat','-c')
adb('shell','am','start','-W','-n',NEW+'/id.webabsensi.app.MainActivity')
rendered=False
for _ in range(18):
    time.sleep(2)
    try:
        adb('shell','uiautomator','dump','--compressed','/sdcard/presen-current-ui.xml')
        xml=adb('shell','cat','/sdcard/presen-current-ui.xml');tree=ET.fromstring(xml)
        labels=' '.join(n.get('text','')+' '+n.get('content-desc','') for n in tree.iter('node'))
        if any(s in labels.lower() for s in ['absen','mahasiswa','presen','lokasi','kamera','daftar','masuk']):rendered=True;break
    except (subprocess.CalledProcessError,ET.ParseError):pass
if not rendered:raise RuntimeError('Bundled student screen did not render while offline.')
(OUT/'offline-launch.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p']))
write_sentinel(NEW,'current-data-retained');install(new)
assert adb('shell','cat',sentinel(OLD))=='original-data-retained'
assert adb('shell','cat',sentinel(NEW))=='current-data-retained'
adb('shell','am','force-stop',NEW);adb('shell','am','start','-W','-n',NEW+'/id.webabsensi.app.MainActivity');time.sleep(4)
crashes=adb('logcat','-d','-s','AndroidRuntime:E');assert 'FATAL EXCEPTION' not in crashes,crashes[-1500:]
report={'package':NEW,'separateFrom121':True,'oldPrivateDataRetained':True,'offlineScreenRendered':True,'sameCertificateReinstallRetainedData':True,'nativeCrashes':False,'apkSha256':hashlib.sha256(new.read_bytes()).hexdigest(),'physicalCameraGpsTested':False}
(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
