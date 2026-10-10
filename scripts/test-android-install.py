"""Install original and Android 2 APKs together on an isolated rooted emulator."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
ADB = os.environ.get('WA_ADB', 'adb')
SERIAL = os.environ.get('ANDROID_SERIAL')
COMMAND = [ADB] + (['-s', SERIAL] if SERIAL else [])
RESULTS = ROOT / 'tests/results/android'
RESULTS.mkdir(parents=True, exist_ok=True)


def adb(*args):
    return subprocess.check_output(COMMAND + list(args), text=True, stderr=subprocess.STDOUT, timeout=60).strip()


def install(path):
    result = adb('install', '-r', str(path))
    if 'Success' not in result:
        raise RuntimeError('APK installation did not succeed')


adb('root')
adb('wait-for-device')
adb('shell', 'svc', 'wifi', 'disable')
# Exercise the packaged offline login page without production credentials.
roles = [('dosen', 'Absensi-Dosen-Android.apk'), ('mahasiswa', 'Absen-Mahasiswa-Android.apk')]
report = []
for role, filename in roles:
    old, new = 'id.webabsensi.app.' + role, 'id.webabsensi.parallel2026.' + role
    install(ROOT / 'previous-installers' / filename)
    marker = '/data/user/0/' + old + '/files/coexistence-test.txt'
    sentinel = 'old-app-data-' + role
    adb('shell', 'mkdir', '-p', str(Path(marker).parent))
    adb('shell', 'sh', '-c', "'printf " + sentinel + ' > ' + marker + "'")
    old_path = adb('shell', 'pm', 'path', old)
    old_hash = adb('shell', 'sha256sum', old_path.removeprefix('package:'))
    install(ROOT / 'installers' / filename)
    packages = adb('shell', 'pm', 'list', 'packages')
    if 'package:' + old not in packages or 'package:' + new not in packages:
        raise RuntimeError('Both old and new applications must remain installed')
    if adb('shell', 'cat', marker) != sentinel or adb('shell', 'pm', 'path', old) != old_path or adb('shell', 'sha256sum', old_path.removeprefix('package:')) != old_hash:
        raise RuntimeError('Original application or its private data changed')
    new_marker = '/data/user/0/' + new + '/files/update-test.txt'
    adb('shell', 'mkdir', '-p', str(Path(new_marker).parent))
    adb('shell', 'sh', '-c', "'printf new-app-data > " + new_marker + "'")
    install(ROOT / 'installers' / filename)
    if adb('shell', 'cat', new_marker) != 'new-app-data' or adb('shell', 'cat', marker) != sentinel:
        raise RuntimeError('A same-key APK update lost private application data')
    adb('logcat', '-c')
    launched = adb('shell', 'am', 'start', '-W', '-n', new + '/id.webabsensi.app.MainActivity')
    if 'Status: ok' not in launched:
        raise RuntimeError('Android 2 activity did not launch')
    # Wait for WebView rendering without entering a production account.
    until = time.monotonic() + 45
    while True:
        adb('shell', 'uiautomator', 'dump', '/sdcard/absensi-ui.xml')
        hierarchy = adb('shell', 'cat', '/sdcard/absensi-ui.xml')
        if 'dosen' in hierarchy.lower() or 'mahasiswa' in hierarchy.lower():
            break
        if time.monotonic() > until:
            raise RuntimeError('Login UI did not render for ' + role)
        time.sleep(2)
    log = adb('logcat', '-d', '-s', 'AndroidRuntime', 'chromium')
    if 'FATAL EXCEPTION' in log or 'Uncaught SyntaxError' in log:
        raise RuntimeError('Android/WebView runtime failure for ' + role)
    if not adb('shell', 'pidof', new):
        raise RuntimeError('Android 2 process stopped after launch')
    (RESULTS / (role + '-ui.xml')).write_text(hierarchy)
    adb('shell', 'screencap', '-p', '/sdcard/absensi-' + role + '.png')
    adb('pull', '/sdcard/absensi-' + role + '.png', str(RESULTS / (role + '.png')))
    report.append({'role': role, 'old_package': old, 'new_package': new,
                   'coinstalled': True, 'old_private_data_retained': True,
                   'same_key_update_retained_data': True, 'login_ui_rendered': True,
                   'apk_sha256': hashlib.sha256((ROOT / 'installers' / filename).read_bytes()).hexdigest()})
    print(role + ': old/new apps installed together; original data retained; update retained new data; login UI rendered.')
(RESULTS / 'report.json').write_text(json.dumps({'device': adb('shell', 'getprop', 'ro.build.version.release'), 'tests': report}, indent=2))
