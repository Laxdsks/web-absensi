"""Install original and Android 2 APKs together on an isolated rooted emulator."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import re
import struct
import zlib
import xml.etree.ElementTree as ET

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


# Exercise the actual WebView editor and Android launcher using only local images.
def ui():
    try:
        adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/absensi-ui.xml')
        return ET.fromstring(adb('shell', 'cat', '/sdcard/absensi-ui.xml'))
    except (ET.ParseError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return ET.Element('hierarchy')


def tap_label(pattern, scroll=False, attempts=12, button=False):
    for attempt in range(attempts):
        for node in ui().iter('node'):
            labels = (node.get('text', ''), node.get('content-desc', ''))
            bounds = re.findall(r'\d+', node.get('bounds', ''))
            if any(re.search(pattern, label, re.I) for label in labels) and len(bounds) == 4 and (not button or node.get('class', '').endswith('Button')):
                x1, y1, x2, y2 = map(int, bounds)
                if x2 > x1 and y2 > y1:
                    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                    time.sleep(1)
                    return
        if scroll:
            size = re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))[-1]
            w, h = map(int, size)
            adb('shell', 'input', 'swipe', str(w//2), str(h*3//4), str(w//2), str(h//3), '400')
        time.sleep(1)
    raise RuntimeError('Android icon control not found: ' + pattern)


def icon_test(package, role):
    # Deterministic PNG fixture; no production/student image is used.
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data) & 0xffffffff)
    row = bytes([0]) + bytes([37, 99, 235, 255]) * 512
    fixture = RESULTS / 'icon-test.png'
    fixture.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',512,512,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(row*512)) + chunk(b'IEND',b''))
    adb('push', str(fixture), '/sdcard/Download/icon-test.png')
    tap_label('^Ikon aplikasi$' if role == 'dosen' else '^Ikon$')
    tap_label(r'^1\. Pilih gambar|Choose File|Pilih File|Browse|Pilih berkas')
    # Android DocumentsUI opens Recent by default; select Downloads explicitly.
    tap_label('Show roots|Open navigation drawer|Tampilkan akar')
    tap_label('^Downloads$|^Unduhan$')
    tap_label('^icon-test.png$')
    tap_label(r'^3\. Simpan ikon$', scroll=True)
    custom = '/data/user/0/' + package + '/files/custom-app-icon.png'
    until = time.monotonic() + 30
    while True:
        try:
            saved_hash = adb('shell','sha256sum',custom).split()[0]
            if len(saved_hash) == 64:
                break
        except subprocess.CalledProcessError:
            pass
        if time.monotonic() > until:
            raise RuntimeError('Actual Android editor did not persist the selected icon')
        time.sleep(1)
    tap_label('^Buat / perbarui pintasan$', scroll=True)
    tap_label('^Add to home screen$|Add automatically|^Add$|Tambahkan otomatis|^Tambahkan$', button=True)
    # dumpsys lists launcher-owned Package sections before the app section;
    # selecting its first Package header therefore misses ShortcutInfo flags.
    # Query only this app's pinned shortcuts (ShortcutManager.FLAG_MATCH_PINNED
    # = 1 << 2, unlike LauncherApps.ShortcutQuery's flag), and allow
    # the launcher to finish accepting the system confirmation asynchronously.
    until = time.monotonic() + 30
    while True:
        shortcuts = adb('shell', 'cmd', 'shortcut', 'get-shortcuts', '--user', '0', '--flags', '4', package)
        (RESULTS / (role + '-pinned-shortcut.txt')).write_text(shortcuts)
        if re.search(r'ShortcutInfo \{id=custom-app-icon, flags=0x[0-9a-f]+ \[[^\]]*Pin[^\]]*\]', shortcuts) and 'packageName=' + package in shortcuts:
            break
        if time.monotonic() > until:
            (RESULTS / (role + '-shortcut-dump.txt')).write_text(adb('shell', 'dumpsys', 'shortcut'))
            raise RuntimeError('Custom Android shortcut was not registered')
        time.sleep(1)
    # The package and private attendance markers remain; reinstall keeps its icon.
    install(ROOT / 'installers' / ('Absensi-Dosen-Android.apk' if role == 'dosen' else 'Absen-Mahasiswa-Android.apk'))
    if adb('shell', 'sha256sum', custom).split()[0] != saved_hash:
        raise RuntimeError('APK update lost the selected icon')
    adb('shell', 'am', 'start', '-W', '-n', package + '/id.webabsensi.app.MainActivity')
    time.sleep(3)
    tap_label('^Ikon aplikasi$' if role == 'dosen' else '^Ikon$')
    tap_label('^Ikon bawaan$', scroll=True)
    if adb('shell', 'test', '!', '-f', custom) != '':
        raise RuntimeError('Default icon reset did not clear custom image')
    adb('shell', 'input', 'keyevent', '4')
    print(role + ': real icon image selected, saved, pinned, retained across APK reinstall and reset.')


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
        raise RuntimeError('Updating Android 2 from 1.0.8 lost private application data')
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
        try:
            dump = adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/absensi-ui.xml')
            hierarchy = adb('shell', 'cat', '/sdcard/absensi-ui.xml')
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # UIAutomator can return success before it writes XML while WebView
            # is laying out the page, or be killed under emulator memory pressure.
            # Retry within this deadline; a missing login UI still fails the test.
            dump = 'UIAutomator did not finish; retrying within the login deadline.'
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
    try:
        icon_test(new, role)
    except Exception:
        (RESULTS / (role + '-icon-failed-ui.xml')).write_text(ET.tostring(ui(), encoding='unicode'))
        (RESULTS / (role + '-icon-runtime.log')).write_text(adb('logcat', '-d', '-s', 'AndroidRuntime', 'chromium'))
        adb('shell', 'screencap', '-p', '/sdcard/icon-failed.png')
        adb('pull', '/sdcard/icon-failed.png', str(RESULTS / (role + '-icon-failed.png')))
        raise
    if role == 'mahasiswa':
        # No login or token: the watch stays idle and never queries production.
        # Verify the OS notification has an explicit stop action and that its
        # exact service intent removes the foreground service and notification.
        adb('shell', 'pm', 'grant', new, 'android.permission.POST_NOTIFICATIONS')
        component = new + '/id.webabsensi.app.AttendanceWatch'
        adb('shell', 'am', 'start-foreground-service', '-n', component)
        until = time.monotonic() + 30
        while True:
            notifications = adb('shell', 'dumpsys', 'notification', '--noredact')
            if new in notifications and 'Matikan pengingat' in notifications:
                break
            if time.monotonic() > until:
                raise RuntimeError('Android reminder notification lacks its stop control')
            time.sleep(1)
        adb('shell', 'am', 'startservice', '-n', component, '-a', 'id.webabsensi.STOP_WATCH')
        until = time.monotonic() + 30
        while True:
            services = adb('shell', 'dumpsys', 'activity', 'services', new)
            if 'AttendanceWatch' not in services:
                break
            if time.monotonic() > until:
                raise RuntimeError('Android reminder stop action did not stop the service')
            time.sleep(1)
        print('mahasiswa: foreground reminder exposes a stop action; stop intent removes the service without an account token.')
    if adb('shell', 'cat', marker) != sentinel or adb('shell', 'cat', new_marker) != 'new-app-data':
        raise RuntimeError('Icon editing changed private attendance data')
    report.append({'custom_icon_editor_and_launcher_tested': True, 'reminder_stop_action_tested': role == 'mahasiswa', 'role': role, 'old_package': old, 'new_package': new,
                   'coinstalled': True, 'old_private_data_retained': True,
                   'same_key_update_retained_data': True, 'login_ui_rendered': True,
                   'upgrade_from_version': '1.0.8', 'teacher_homepage_original': role == 'dosen',
                   'student_navigation_only': role == 'mahasiswa',
                   'apk_sha256': hashlib.sha256((ROOT / 'installers' / filename).read_bytes()).hexdigest()})
    print(role + ': old/new apps installed together; original data retained; update retained new data; login UI rendered.')
    # Both packages stay installed. Release the finished role's WebView before
    # testing the next one on the memory-limited emulator; never clear app data.
    adb('shell', 'am', 'force-stop', new)
(RESULTS / 'report.json').write_text(json.dumps({'device': adb('shell', 'getprop', 'ro.build.version.release'), 'tests': report}, indent=2))
