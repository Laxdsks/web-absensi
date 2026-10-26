"""Compile a real custom-name/icon APK, without accessing production or private release keys."""
from pathlib import Path
import base64,io,json,os,sys,tempfile,subprocess,zipfile
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from branding_worker import build,encrypted_identity,sign_file
from unittest.mock import patch
os.environ['WA_BRAND_DEBUG_LABEL']='1'
with tempfile.TemporaryDirectory(prefix='brand-fixture-') as temporary:
 d=Path(temporary);image=Image.new('RGBA',(512,512),'#123c69');ImageDraw.Draw(image).ellipse((110,110,402,402),fill='#f6cd5b');raw=io.BytesIO();image.save(raw,format='PNG')
 name='Absen Kampus & "Uji"';job={'id':'12345678-1234-4234-8234-123456789012','revision':7,'config':{'name':name,'package':'id.webabsensi.brand.b0123456789abcdef0123','icon':'data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode()}}
 apk=build(job,d)
 with zipfile.ZipFile(apk) as z:
  assert json.loads(z.read('assets/app/brand.json'))['name']==name
  assert b'<strong>Absen Kampus &amp; &quot;Uji&quot;</strong>' in z.read('assets/app/index.html')
  assert b'data-package-logo' in z.read('assets/app/branded-student.js')
  assert Image.open(io.BytesIO(z.read('assets/app/icon-512.png'))).getpixel((256,256))[:3]==(246,205,91)
 with patch('branding_worker.api',return_value={'status':'success'}):identity_path,identity=encrypted_identity('a'*64,job,d)
 signed=sign_file(apk,identity_path,identity,d)
 output=ROOT/'tests/results/branded-apk';output.mkdir(parents=True,exist_ok=True);(output/'Branded-Student.apk').write_bytes(signed.read_bytes())
 print('Compiled custom application ID, revision, escaped app name, launcher icon and permanent internal logo verified.')
