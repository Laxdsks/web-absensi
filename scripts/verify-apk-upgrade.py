"""Check APK bundle contents and compatibility with the previous installation."""
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
    old_cert, old_package = details(previous)
    new_cert, new_package = details(current)
    if old_cert != new_cert or old_package[0] != new_package[0]:
        raise RuntimeError('APK cannot update the existing installation: ' + name)
    if int(new_package[1]) <= int(old_package[1]) or new_package[2] != '1.0.1':
        raise RuntimeError('APK version was not advanced: ' + name)
    paths = ['app/index.html', 'app/app.js', 'app/core.js', 'app-sw.js', 'app/vendor/qr.js', 'app/vendor/scan.js']
    if name.startswith('Absensi-Dosen'):
        paths += ['app/templates/absen.html', 'app/templates/ujian.html', 'assets/offline-bridge.js']
    with zipfile.ZipFile(current) as apk:
        for path in paths:
            if hashlib.sha256(apk.read('assets/' + path)).digest() != hashlib.sha256((root / path).read_bytes()).digest():
                raise RuntimeError('APK contains an outdated asset: ' + path)
    print(name + ': signature and package identity retained; version 1.0.1 and offline assets verified.')
