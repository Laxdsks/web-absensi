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
if not adb('get-serialno').startswith('emulator-') or adb('shell','getprop','ro.kernel.qemu')!='1':raise RuntimeError('This fixture is restricted to an isolated emulator.')
old=ROOT/'previous-v2-installers/Absen-Mahasiswa-Android.apk';new=ROOT/'native/android/prebuilt/Presen-Go-1.2.5.apk'
if hashlib.sha256(old.read_bytes()).hexdigest()!='6b86ff328d2b73be29b1972d0f3bf53fe337f2b45d1485834b2f6e782507d9c6':raise RuntimeError('Unexpected original APK.')
previous=ROOT/'previous-current-installers/Presen-Go-1.2.4.apk'
tests=ROOT/'native/android/prebuilt/Presen-Go-1.2.5-tests.apk'
adb('root');time.sleep(2);install(old);write_sentinel(OLD,'original-data-retained')
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
install(previous);install(tests)
adb('shell','pm','grant',NEW,'android.permission.ACCESS_COARSE_LOCATION')
adb('shell','pm','grant',NEW,'android.permission.ACCESS_FINE_LOCATION')
def instrument(method):
    # Each instrumentation run owns a separate app process. Finish the previous
    # runner and its WebView callbacks before starting another instrumentation.
    adb('shell','am','force-stop',NEW)
    result=adb('shell','am','instrument','-w','-r','-e','class','id.webabsensi.app.StudentLifecycleTest#'+method,NEW+'.test/android.test.InstrumentationTestRunner')
    (OUT/(method+'.txt')).write_text(result)
    if 'OK (1 test)' not in result:
        logs=adb('logcat','-d','-b','all','-t','2000')
        (OUT/'android-failure-logcat.txt').write_text(logs)
        (OUT/'failure.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p']))
        raise RuntimeError('Saved-student Android verification failed: '+result[-2000:]+'\nAndroid diagnostics:\n'+logs[-12000:])
    print('PASS signed Android: '+method,flush=True)
instrument('testSeedSavedStudent')
adb('shell','svc','wifi','enable');time.sleep(5)
instrument('testSeedStaleWorker')
write_sentinel(NEW,'current-data-retained');install(new)
assert adb('shell','cat',sentinel(NEW))=='current-data-retained'
instrument('testOnlineAfterStaleWorker')
instrument('testMissingRuntimeRecovery')
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
instrument('testRelaunchSavedStudent')
packages=adb('shell','pm','list','packages');assert 'package:'+OLD in packages and 'package:'+NEW in packages
assert adb('shell','cat',sentinel(OLD))=='original-data-retained'
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');adb('logcat','-c')
# End instrumentation ownership before testing an ordinary launcher cold start.
adb('shell','am','force-stop',NEW)
launch_result=adb('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n',NEW+'/id.webabsensi.app.MainActivity');(OUT/'manual-launch.txt').write_text(launch_result)
def saved_screen(name):
    rendered=False;labels='';xml='';stable=0
    for _ in range(18):
        time.sleep(2)
        try:
            adb('shell','rm','-f','/sdcard/presen-current-ui.xml')
            dump=adb('shell','uiautomator','dump','--compressed','/sdcard/presen-current-ui.xml')
            if 'dumped' not in dump.lower():continue
            xml=adb('shell','cat','/sdcard/presen-current-ui.xml');tree=ET.fromstring(xml)
            labels=' '.join(n.get('text','')+' '+n.get('content-desc','') for n in tree.iter('node'))
            foreground=adb('shell','dumpsys','window','windows')
            focus=next((line for line in foreground.splitlines() if 'mCurrentFocus=' in line),'')
            owns_ui=any(n.get('package')==NEW for n in tree.iter('node'))
            if NEW in focus and owns_ui and any(text in labels.lower() for text in ['mahasiswa uji buka ulang','nimreopen123','mata kuliah tersimpan']):stable+=1
            else:stable=0
            if stable>=2:
                screenshot=subprocess.check_output(['adb','exec-out','screencap','-p'])
                focus_after=next((line for line in adb('shell','dumpsys','window','windows').splitlines() if 'mCurrentFocus=' in line),'')
                if NEW not in focus_after:stable=0;continue
                (OUT/(name+'.png')).write_bytes(screenshot);(OUT/(name+'-ui.xml')).write_text(xml)
                (OUT/(name+'-focus.txt')).write_text(focus_after);rendered=True;break
        except (subprocess.CalledProcessError,ET.ParseError):stable=0
    if not rendered:
        (OUT/(name+'-ui.xml')).write_text(xml)
        (OUT/(name+'-failure.png')).write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p']))
        logs=adb('logcat','-d','-b','all','-t','2500');(OUT/(name+'-logcat.txt')).write_text(logs)
        (OUT/(name+'-events.txt')).write_text(adb('logcat','-b','events','-d'))
        (OUT/(name+'-activities.txt')).write_text(adb('shell','dumpsys','activity','activities'))
        raise RuntimeError('Student UI did not remain in the foreground: '+labels+'\nDiagnostics: '+logs[-10000:])
    (OUT/(name+'-logcat.txt')).write_text(adb('logcat','-d','-b','all','-t','1000'))
saved_screen('offline-launch')
write_sentinel(NEW,'current-data-retained');install(new)
assert adb('shell','cat',sentinel(OLD))=='original-data-retained'
assert adb('shell','cat',sentinel(NEW))=='current-data-retained'
adb('shell','am','force-stop',NEW);adb('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n',NEW+'/id.webabsensi.app.MainActivity');saved_screen('reinstalled-launch')
crashes=adb('logcat','-d','-s','AndroidRuntime:E');assert 'FATAL EXCEPTION' not in crashes,crashes[-1500:]
# Only after persistence has been checked: clear this isolated emulator fixture to test a first installation.
assert 'Success' in adb('shell','pm','clear',NEW)
adb('shell','svc','wifi','enable');time.sleep(5)
instrument('testFreshReadOnlyApiHandshake')
report={'package':NEW,'freshNativeReadOnlyApiVerified':True,'separateFrom121':True,'oldPrivateDataRetained':True,'offlineScreenRendered':True,'sameCertificateReinstallRetainedData':True,'upgradeFromVersion':'1.2.4','upgradeRetainedLoginAndHistory':True,'savedStudentOfflineRecreation':True,'corruptOptionalDraftRecovered':True,'nativeCrashes':False,'headerOnlyBlankPageReproducedOnPreviousVersion':True,'staleServiceWorkerBypassedOnline':True,'missingJavaScriptShowsNativeRecovery':True,'retryRetainsAccountAndHistory':True,'apkSha256':hashlib.sha256(new.read_bytes()).hexdigest(),'physicalCameraGpsTested':False}
(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
