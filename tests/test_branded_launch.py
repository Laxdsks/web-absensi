"""Install actual signed fixtures, verify nonblank launch and an in-place branded upgrade."""
import json,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/results/branded-apk';PACKAGE='id.webabsensi.brand.b0123456789abcdef0123'
def adb(*args,check=True):return subprocess.run(['adb',*args],check=check,capture_output=True).stdout
adb('install','-g',str(OUT/'Branded-Student.apk'))
def launch(name,suffix):
 adb('shell','am','force-stop',PACKAGE)
 adb('shell','am','start','-W','-n',PACKAGE+'/id.webabsensi.app.MainActivity')
 deadline=time.time()+55
 while time.time()<deadline:
  adb('shell','uiautomator','dump','/sdcard/brand-screen.xml',check=False)
  raw=adb('shell','cat','/sdcard/brand-screen.xml',check=False)
  try:
   nodes=list(ET.fromstring(raw).iter('node'));texts=[n.get('text','') for n in nodes]
   controls=[n for n in nodes if n.get('clickable')=='true' and n.get('enabled')=='true' and n.get('class') in ('android.widget.Button','android.widget.EditText')]
   if any(name in t for t in texts) and len(controls)>=2:
    (OUT/(suffix+'.xml')).write_bytes(raw);(OUT/(suffix+'.png')).write_bytes(adb('exec-out','screencap','-p'));return
  except ET.ParseError:pass
  time.sleep(2)
 (OUT/(suffix+'-failed.png')).write_bytes(adb('exec-out','screencap','-p'))
 raise RuntimeError('Branded student app did not show its custom name and usable main controls.')
launch('Absen Kampus & "Uji"','first-launch')
adb('root');adb('wait-for-device');adb('shell','touch','/data/data/'+PACKAGE+'/files/branding-upgrade-marker')
adb('install','-r','-g',str(OUT/'Branded-Student-update.apk'))
launch('Absen Kampus Baru','updated-launch')
assert adb('shell','test','-f','/data/data/'+PACKAGE+'/files/branding-upgrade-marker')==b''
(OUT/'launch-report.json').write_text(json.dumps({'firstLaunch':'usable','updatedName':'Absen Kampus Baru','installationData':'preserved'},indent=2))
print('Real branded APK launches with usable controls; signed upgrade updates its name and preserves application files.')
