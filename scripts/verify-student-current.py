"""Verify public APK bytes and certificate without reading a private signing key."""
import hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
from android_inputs import ROOT,digest
candidate=ROOT/'native/android/prebuilt/Presen-Go-1.2.6.apk'
if not candidate.exists():
    print('Unsigned APK built; waiting for signing with the private Presen Go identity.')
    raise SystemExit(0)
metadata=json.loads((candidate.parent/'release.json').read_text())
if metadata['source_inputs_sha256']!=digest():raise RuntimeError('Signed APK inputs do not match this source revision.')
if hashlib.sha256(candidate.read_bytes()).hexdigest()!=metadata['apk_sha256']:raise RuntimeError('Signed APK checksum mismatch.')
sdk=Path(os.environ['ANDROID_HOME']);signer=sorted(sdk.glob('build-tools/*/apksigner'))[-1]
certs=re.findall(r'certificate SHA-256 digest: ([0-9a-fA-F]{64})',subprocess.check_output([str(signer),'verify','--print-certs',str(candidate)],text=True))
expected=(ROOT/'native/android/student-current-certificate.sha256').read_text().strip()
if certs!=[expected]:raise RuntimeError('Unexpected permanent student signing identity.')
info=subprocess.check_output([str(signer.with_name('aapt')),'dump','badging',str(candidate)],text=True)
if "package: name='id.webabsensi.presengo.mahasiswa' versionCode='26' versionName='1.2.6'" not in info:raise RuntimeError('Unexpected student package or version.')
if 'application-debuggable' in info:raise RuntimeError('Published APK must not be debuggable.')
unsigned=next((ROOT/'native/android/app/build/outputs/apk/mahasiswa/release').glob('*-unsigned.apk'))
with zipfile.ZipFile(candidate) as signed,zipfile.ZipFile(unsigned) as built:
    public=[n for n in built.namelist() if n.startswith('assets/') or re.fullmatch(r'classes\d*\.dex',n)]
    for name in public:
        if signed.read(name)!=built.read(name):raise RuntimeError('Stale APK payload: '+name)
    if any('templates/absen.html' in n or n.endswith('/monitoring.js') for n in signed.namelist()):raise RuntimeError('Teacher workspace must not be bundled in student app.')
print('Permanent signing certificate, non-debuggable student package, compiled code and all bundled offline assets verified.')

test_candidate=candidate.with_name('Presen-Go-1.2.6-tests.apk')
test_built=next((ROOT/'native/android/app/build/outputs/apk/androidTest/mahasiswa/release').glob('*.apk'))
test_certs=re.findall(r'certificate SHA-256 digest: ([0-9a-fA-F]{64})',subprocess.check_output([str(signer),'verify','--print-certs',str(test_candidate)],text=True))
if test_certs!=[expected]:raise RuntimeError('Instrumentation signing identity must match the delivered app.')
with zipfile.ZipFile(test_candidate) as signed,zipfile.ZipFile(test_built) as built:
    for name in built.namelist():
        if re.fullmatch(r'classes\d*\.dex',name) and signed.read(name)!=built.read(name):raise RuntimeError('Stale Android lifecycle test: '+name)
print('Signed lifecycle instrumentation matches the current Android test source.')
