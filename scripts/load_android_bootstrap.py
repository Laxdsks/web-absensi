"""Load the initial signed APKs only while their public build inputs still match."""
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request
from android_inputs import ROOT, digest


def ready(value):
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('ready=' + ('true' if value else 'false') + '\n')


def main():
    if os.environ.get('HAS_SIGNING_KEY') == 'true':
        ready(True)
        return
    path = ROOT / 'native/android/bootstrap-apks.json'
    if not path.exists():
        ready(False)
        print('No signed bootstrap APKs are configured; Android publication withheld.')
        return
    manifest = json.loads(path.read_text())
    if manifest['source_inputs_sha256'] != digest():
        ready(False)
        print('::warning::Android inputs changed since the initial signed APKs. Configure ANDROID_V2 signing secrets to publish an updated APK.')
        return
    commit = manifest['artifact_commit']
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise RuntimeError('Invalid APK artifact commit')
    output = ROOT / 'installers'
    output.mkdir(exist_ok=True)
    for apk in manifest['apks']:
        if Path(apk['path']).name != apk['path'] or Path(apk['installer']).name != apk['installer']:
            raise RuntimeError('Invalid APK artifact path')
        url = 'https://raw.githubusercontent.com/Laxdsks/web-absensi/' + commit + '/' + apk['path']
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(32 * 1024 * 1024 + 1)
        if len(data) != apk['size'] or hashlib.sha256(data).hexdigest() != apk['sha256']:
            raise RuntimeError('Signed APK artifact checksum or size mismatch')
        (output / apk['installer']).write_bytes(data)
    ready(True)
    print('Initial signed Android 2 APKs loaded; source inputs, file sizes and checksums match. No private signing key was uploaded.')


if __name__ == '__main__':
    main()
