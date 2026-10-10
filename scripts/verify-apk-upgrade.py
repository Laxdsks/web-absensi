"""Check Android 2 signing, assets and isolation from the original APKs."""
import hashlib
from pathlib import Path
import re
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
signer = Path(sys.argv[1])

def details(path):
    verified = subprocess.check_output([str(signer), 'verify', '--print-certs', str(path)], text=True)
    certificates = re.findall(r'certificate SHA-256 digest: ([0-9a-fA-F]{64})', verified)
    if not certificates:
        raise RuntimeError('APK signing certificate is missing')
    badging = subprocess.check_output([str(signer.with_name('aapt')), 'dump', 'badging', str(path)], text=True)
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not package:
        raise RuntimeError('APK package metadata is missing')
    return certificates, package.groups()

for name in ('Absensi-Dosen-Android.apk', 'Absen-Mahasiswa-Android.apk'):
    previous = root / 'previous-installers' / name
    current = root / 'installers' / name
    new_cert, new_package = details(current)
    contents_only = '--contents-only' in sys.argv[2:]
    if not contents_only:
        old_cert, old_package = details(previous)
        if old_package[0] == new_package[0]:
            raise RuntimeError('APK must not replace the original application: ' + name)
        expected_cert = (root / 'native/android/signing-certificate.sha256').read_text().strip()
        if new_cert != [expected_cert]:
            raise RuntimeError('APK was not signed by the reusable Android 2 identity: ' + name)
    expected_package = 'id.webabsensi.parallel2026.' + ('dosen' if name.startswith('Absensi-Dosen') else 'mahasiswa')
    if new_package[0] != expected_package or new_package[2] != '1.0.4':
        raise RuntimeError('APK version was not advanced: ' + name)
    previous_v2 = root / 'previous-v2-installers' / name
    if not contents_only and previous_v2.exists():
        previous_cert, previous_package = details(previous_v2)
        if previous_cert != new_cert or previous_package[0] != new_package[0] or int(previous_package[1]) >= int(new_package[1]):
            raise RuntimeError('APK cannot safely update Android 2 version 1.0.3: ' + name)
    paths = ['app/index.html', 'app/app.js', 'app/core.js', 'app/qr-files.js','app/guide.js','app/guide.css','app/guide-images/student-login.png','app/guide-images/student-qr.png', 'app/app.css', 'app-sw.js', 'app/vendor/qr.js', 'app/vendor/scan.js']
    if name.startswith('Absensi-Dosen'):
        paths += ['app/templates/absen.html', 'app/templates/ujian.html', 'assets/offline-bridge.js', 'assets/teacher-tools.js', 'assets/teacher-tools.css', 'app/templates/index.html']
    with zipfile.ZipFile(current) as apk:
        for path in paths:
            if hashlib.sha256(apk.read('assets/' + path)).digest() != hashlib.sha256((root / path).read_bytes()).digest():
                raise RuntimeError('APK contains an outdated asset: ' + path)
    if contents_only:
        print(name + ': Android 2 identity, build and offline assets verified only; release signing NOT checked.')
    else:
        print(name + ': reusable Android 2 certificate verified; package differs from the original APK; version 1.0.4 and offline assets verified.')
