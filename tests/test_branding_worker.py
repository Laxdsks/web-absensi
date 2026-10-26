"""Verify persistent signing identity restore and local, permanent asset branding."""
import base64,io,json,sys,tempfile,unittest,subprocess
from pathlib import Path
from unittest.mock import patch
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from branding_worker import encrypted_identity
class BrandingWorkerTests(unittest.TestCase):
 def test_signing_identity_is_encrypted_and_reused_for_the_same_package(self):
  key='a'*64;job={'id':'12345678-1234-4234-8234-123456789012','lease':'lease','config':{'package':'id.webabsensi.brand.b0123456789abcdef0123'}}
  saved=[]
  with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b:
   with patch('branding_worker.api',side_effect=lambda key,op,**data:saved.append(data)):
    first,identity=encrypted_identity(key,job,Path(a))
   envelope=saved[0]['envelope'];self.assertNotIn(identity['password'],envelope)
   second,restored=encrypted_identity(key,{**job,'signingEnvelope':envelope},Path(b))
   self.assertEqual(first.read_bytes(),second.read_bytes());self.assertEqual(identity['certificate'],restored['certificate'])
   with self.assertRaises(Exception):encrypted_identity(key,{**job,'config':{'package':'id.webabsensi.brand.b11111111111111111111'},'signingEnvelope':envelope},Path(b))
 def test_asset_generator_bakes_name_and_both_icon_sizes_without_external_urls(self):
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp);app=d/'assets/app';app.mkdir(parents=True);(app/'index.html').write_bytes((ROOT/'app/index.html').read_bytes());(app/'manifest.webmanifest').write_bytes((ROOT/'app/manifest.webmanifest').read_bytes());image=Image.new('RGBA',(512,512),(12,120,210,255));raw=io.BytesIO();image.save(raw,format='PNG');name='Kampus & "Absen"';config={'name':name,'revision':2,'package':'id.webabsensi.brand.b0123456789abcdef0123','icon':'data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode()};(d/'config.json').write_text(json.dumps(config))
   subprocess.run([sys.executable,str(ROOT/'scripts/prepare_branded_assets.py'),str(d/'config.json'),str(d/'assets'),str(d/'res')],check=True,capture_output=True)
   self.assertEqual(json.loads((app/'brand.json').read_text())['name'],name);self.assertIn('Kampus &amp; &quot;Absen&quot;', (app/'index.html').read_text());self.assertEqual(Image.open(app/'icon-192.png').size,(192,192));self.assertEqual(Image.open(d/'res/drawable/app_icon.png').getpixel((10,10)),(12,120,210,255));self.assertIn('data-package-logo',(app/'branded-student.js').read_text())
if __name__=='__main__':unittest.main()
