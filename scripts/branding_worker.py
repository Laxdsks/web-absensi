"""Claim, build, sign and publish account-specific APKs without disclosing signing keys."""
import argparse, base64, ftplib, hashlib, hmac, io, json, os, re, secrets, ssl, subprocess, tempfile, time, zipfile
from pathlib import Path
from deploy_hosting import configuration

ROOT = Path(__file__).resolve().parents[1]
SECRET_FILE = '.wa_brand_worker.php'

def worker_secret(provision=False):
    server, port, protocol, directory, username, password, _ = configuration()
    if protocol != 'ftps':
        raise RuntimeError('APK worker keys require encrypted FTPS.')
    client = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30)
    try:
        client.connect(server, port); client.login(username, password); client.prot_p(); client.cwd(directory)
        if not {'index.php','koneksi.php'}.issubset({Path(name).name for name in client.nlst()}):raise RuntimeError('APK worker directory is not the existing application.')
        data=io.BytesIO()
        try: client.retrbinary('RETR '+SECRET_FILE, data.write)
        except ftplib.error_perm as error:
            if not provision or not str(error).startswith('550'): raise RuntimeError('APK builder has not been provisioned.') from None
            source=("<?php return '"+secrets.token_hex(32)+"';\n").encode()
            temporary=SECRET_FILE+'.'+secrets.token_hex(6)+'.php'
            client.storbinary('STOR '+temporary,io.BytesIO(source)); client.rename(temporary,SECRET_FILE)
            client.retrbinary('RETR '+SECRET_FILE,data.write)
        match=re.fullmatch(rb"<\?php return '([a-f0-9]{64})';\s*",data.getvalue())
        if not match: raise RuntimeError('APK worker key did not pass verification.')
        key=match[1].decode()
        if os.environ.get('GITHUB_ACTIONS')=='true': print('::add-mask::'+key,flush=True)
        return key
    finally:
        try: client.quit()
        except Exception: client.close()

def api(key, operation, **values):
    from verify_hosting import request
    raw=json.dumps({'action':'brand-worker','operation':operation,**values},separators=(',',':')).encode()
    at=str(int(time.time()))
    body,_=request('app_api.php',raw,{'Content-Type':'application/json','X-App-Request':'1','X-Brand-Time':at,'X-Brand-Signature':hmac.new(key.encode(),at.encode()+b'.'+raw,hashlib.sha256).hexdigest()})
    result=json.loads(body)
    if result.get('status')!='success': raise RuntimeError('APK worker API did not complete '+operation)
    return result

def encrypted_identity(key, job, directory):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates
    from cryptography.hazmat.primitives.serialization import Encoding
    cipher=AESGCM(hashlib.sha256(key.encode()).digest())
    path=directory/'identity.p12'
    if job.get('signingEnvelope'):
        envelope=base64.b64decode(job['signingEnvelope'],validate=True)
        identity=json.loads(cipher.decrypt(envelope[:12],envelope[12:],job['config']['package'].encode()))
        path.write_bytes(base64.b64decode(identity['p12'],validate=True))
    else:
        password=secrets.token_urlsafe(32)
        env={**os.environ,'WA_BRAND_KEYPASS':password}
        subprocess.run(['keytool','-genkeypair','-keystore',str(path),'-storetype','PKCS12','-storepass:env','WA_BRAND_KEYPASS','-keypass:env','WA_BRAND_KEYPASS','-alias','brand-release','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Presen Student,OU=Account APK,O=Presen'],check=True,capture_output=True,env=env)
        _,certificate,_=load_key_and_certificates(path.read_bytes(),password.encode())
        identity={'p12':base64.b64encode(path.read_bytes()).decode(),'password':password,'certificate':hashlib.sha256(certificate.public_bytes(Encoding.DER)).hexdigest()}
        nonce=secrets.token_bytes(12)
        envelope=base64.b64encode(nonce+cipher.encrypt(nonce,json.dumps(identity).encode(),job['config']['package'].encode())).decode()
        api(key,'key',id=job['id'],lease=job['lease'],envelope=envelope)
    if os.environ.get('GITHUB_ACTIONS')=='true': print('::add-mask::'+identity['password'],flush=True)
    return path,identity

def build(job,directory):
    config={**job['config'],'revision':job['revision']}
    if not re.fullmatch(r'[a-f0-9-]{36}',job['id']) or not re.fullmatch(r'id\.webabsensi\.brand\.b[a-f0-9]{20}',config['package']):raise ValueError('Invalid job identity')
    config_path=directory/'branding.json';config_path.write_text(json.dumps(config))
    subprocess.run(['gradle','assembleMahasiswaRelease','-PstudentCurrentIdentity','-PstudentBrandFile='+str(config_path),'--no-daemon'],cwd=ROOT/'native/android',check=True,stdout=subprocess.DEVNULL)
    unsigned=next((ROOT/'native/android/app/build/outputs/apk/mahasiswa/release').glob('*-unsigned.apk'))
    with zipfile.ZipFile(unsigned) as apk:
        data=json.loads(apk.read('assets/app/brand.json'))
        if data!={'name':config['name'],'package':config['package'],'revision':config['revision']}:raise RuntimeError('Bundled brand differs from the requested configuration.')
        if apk.read('assets/app/icon-512.png')== (ROOT/'app/icon-512.png').read_bytes():raise RuntimeError('Branded icon was not included.')
    sdk=Path(os.environ['ANDROID_HOME']);aapt=sorted(sdk.glob('build-tools/*/aapt'))[-1]
    details=subprocess.check_output([str(aapt),'dump','badging',str(unsigned)],text=True)
    if "package: name='"+config['package']+"'" not in details or "versionCode='"+str(config['revision'])+"'" not in details:raise RuntimeError('Compiled brand identity is incorrect.')
    label=next((line[len("application-label:'"):-1] for line in details.splitlines() if line.startswith("application-label:'")),None)
    if os.environ.get('WA_BRAND_DEBUG_LABEL')=='1':print('Compiled fixture label: '+repr(label),flush=True)
    normalized=re.sub(r"\\(['\"\\])",r'\1',label or '')
    if normalized!=config['name']:raise RuntimeError('Compiled application name differs from the request.')
    icon_path=re.search(r"application: .* icon='([^']+)'",details)
    if not icon_path:raise RuntimeError('Compiled launcher icon is missing.')
    from PIL import Image
    with zipfile.ZipFile(unsigned) as archive:
        compiled=Image.open(io.BytesIO(archive.read(icon_path[1]))).convert('RGBA')
        expected=Image.open(io.BytesIO(base64.b64decode(config['icon'].split(',',1)[1]))).convert('RGBA')
        if compiled.size!=expected.size or compiled.tobytes()!=expected.tobytes():raise RuntimeError('Compiled launcher icon differs from the requested logo.')
    return unsigned

def sign_file(unsigned,identity_path,identity,directory):
    signed=directory/'Presen-Student.apk'
    signer=sorted(Path(os.environ['ANDROID_HOME']).glob('build-tools/*/apksigner'))[-1]
    env={**os.environ,'WA_BRAND_KEYPASS':identity['password']}
    subprocess.run([str(signer),'sign','--ks',str(identity_path),'--ks-type','PKCS12','--ks-pass','env:WA_BRAND_KEYPASS','--ks-key-alias','brand-release','--key-pass','env:WA_BRAND_KEYPASS','--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',str(signed),str(unsigned)],env=env,check=True,capture_output=True)
    verified=subprocess.check_output([str(signer),'verify','--print-certs',str(signed)],text=True)
    if 'certificate SHA-256 digest: '+identity['certificate'] not in verified:raise RuntimeError('Signing identity changed unexpectedly.')
    return signed

def run_job(key,job):
    with tempfile.TemporaryDirectory(prefix='presen-brand-') as temporary:
        directory=Path(temporary)
        try:
            identity_path,identity=encrypted_identity(key,job,directory)
            unsigned=build(job,directory)
            signed=sign_file(unsigned,identity_path,identity,directory)
            tag='presen-brand-'+job['id'];repository='Laxdsks/web-absensi'
            exists=subprocess.run(['gh','release','view',tag,'--repo',repository],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
            if not exists:subprocess.run(['gh','release','create',tag,'--repo',repository,'--target',os.environ['GITHUB_SHA'],'--title','Aplikasi absensi mahasiswa — versi khusus','--notes','APK khusus akun dosen, dibangun dan ditandatangani otomatis.','--prerelease'],check=True,stdout=subprocess.DEVNULL)
            subprocess.run(['gh','release','upload',tag,str(signed),'--repo',repository,'--clobber'],check=True,stdout=subprocess.DEVNULL)
            url=f'https://github.com/{repository}/releases/download/{tag}/Presen-Student.apk'
            api(key,'complete',id=job['id'],lease=job['lease'],url=url,sha256=hashlib.sha256(signed.read_bytes()).hexdigest(),certificate=identity['certificate'])
            print('Branded APK built, signed with its persistent identity, verified and published.',flush=True)
        except Exception:
            try:api(key,'fail',id=job['id'],lease=job['lease'])
            except Exception:pass
            raise

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--provision',action='store_true');args=parser.parse_args()
    key=worker_secret(args.provision)
    if args.provision:print('Private APK worker connection provisioned and verified; no key disclosed.');return
    job=api(key,'claim')['job']
    if not job:print('No pending branded APKs.');return
    run_job(key,job)
if __name__=='__main__':main()
