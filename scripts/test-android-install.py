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
adb('shell', 'svc', 'data', 'disable')
adb('shell', 'settings', 'put', 'global', 'airplane_mode_on', '1')
adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE', '--ez', 'state', 'true')
time.sleep(3)
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
    install(ROOT / 'previous-v2-installers' / filename)
    new_marker = '/data/user/0/' + new + '/files/update-test.txt'
    adb('shell', 'mkdir', '-p', str(Path(new_marker).parent))
    adb('shell', 'sh', '-c', "'printf new-app-data > " + new_marker + "'")
    install(ROOT / 'installers' / filename)
    packages = adb('shell', 'pm', 'list', 'packages')
    if 'package:' + old not in packages or 'package:' + new not in packages:
        raise RuntimeError('Both old and new applications must remain installed')
    if adb('shell', 'cat', marker) != sentinel or adb('shell', 'pm', 'path', old) != old_path or adb('shell', 'sha256sum', old_path.removeprefix('package:')) != old_hash:
        raise RuntimeError('Original application or its private data changed')
    if adb('shell', 'cat', new_marker) != 'new-app-data':
        raise RuntimeError('Updating Android 2 from 1.0.5 lost private application data')
    install(ROOT / 'installers' / filename)
    if adb('shell', 'cat', new_marker) != 'new-app-data' or adb('shell', 'cat', marker) != sentinel:
        raise RuntimeError('A same-key APK update lost private application data')
    adb('logcat', '-c')
    launched = adb('shell', 'am', 'start', '-W', '-n', new + '/id.webabsensi.app.MainActivity')
    if 'Status: ok' not in launched:
        raise RuntimeError('Android 2 activity did not launch')
    # Wait for WebView rendering without entering a production account.
    until = time.monotonic() + 90
    while True:
        dump = adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/absensi-ui.xml')
        try:
            hierarchy = adb('shell', 'cat', '/sdcard/absensi-ui.xml')
        except subprocess.CalledProcessError:
            # UIAutomator can return success before it writes XML while WebView
            # is still laying out the offline homepage. Retry the read, not installation.
            hierarchy = ''
        expected = 'masuk ke sistem' if role == 'dosen' else 'masuk mahasiswa'
        if expected in hierarchy.lower():
            break
        if time.monotonic() > until:
            (RESULTS / (role + '-dump-error.txt')).write_text(dump)
            (RESULTS / (role + '-runtime.log')).write_text(adb('logcat', '-d', '-s', 'AndroidRuntime', 'chromium'))
            adb('shell', 'screencap', '-p', '/sdcard/absensi-failed.png')
            adb('pull', '/sdcard/absensi-failed.png', str(RESULTS / (role + '-failed.png')))
            raise RuntimeError('Login UI did not render for ' + role)
        time.sleep(2)
    (RESULTS / (role + '-ui.xml')).write_text(hierarchy)
    if role == 'mahasiswa' and any(label in hierarchy.lower() for label in ('dosen / pengelola', 'ruang kerja dosen', 'pusat kendali')):
        raise RuntimeError('Student APK exposes teacher navigation')
    if role == 'dosen' and 'aplikasi offline &amp; absen qr' in hierarchy.lower():
        raise RuntimeError('Teacher APK still exposes the obsolete second-dashboard link')
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
                   'upgrade_from_version': '1.0.5', 'teacher_homepage_original': role == 'dosen',
                   'student_navigation_only': role == 'mahasiswa',
                   'apk_sha256': hashlib.sha256((ROOT / 'installers' / filename).read_bytes()).hexdigest()})
    print(role + ': old/new apps installed together; original data retained; update retained new data; login UI rendered.')
(RESULTS / 'report.json').write_text(json.dumps({'device': adb('shell', 'getprop', 'ro.build.version.release'), 'tests': report}, indent=2))
