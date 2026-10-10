"""Fingerprint the public inputs embedded or compiled into Android APKs."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest():
    files = [ROOT / 'app-sw.js', ROOT / 'native/android/build.gradle',
             ROOT / 'native/android/settings.gradle', ROOT / 'native/android/app/build.gradle',
             ROOT / 'native/android/signing-certificate.sha256']
    for directory in ('app', 'assets', 'native/android/app/src'):
        files += [path for path in (ROOT / directory).rglob('*') if path.is_file()]
    result = hashlib.sha256()
    for path in sorted(set(files)):
        result.update(path.relative_to(ROOT).as_posix().encode() + b'\0')
        result.update(hashlib.sha256(path.read_bytes()).digest())
    return result.hexdigest()
