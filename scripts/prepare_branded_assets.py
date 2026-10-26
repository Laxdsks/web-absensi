"""Prepare only a branded variant's generated Android assets/resources."""
import base64, html, json, re, sys
from pathlib import Path
from PIL import Image

config_path, asset_path, resource_path = map(Path, sys.argv[1:])
config = json.loads(config_path.read_text())
name = config['name']
if not isinstance(name, str) or not 2 <= len(name) <= 40 or any(ord(c) < 32 or c in '<>' for c in name):
    raise ValueError('Invalid application name')
if not re.fullmatch(r'id\.webabsensi\.brand\.b[a-f0-9]{20}', config['package']):
    raise ValueError('Invalid branded identity')
if not 1 <= config['revision'] <= 2000000000:
    raise ValueError('Invalid branded revision')
raw = base64.b64decode(config['icon'].split(',', 1)[1], validate=True)
if len(raw) > 825000:
    raise ValueError('Icon too large')
import io
image = Image.open(io.BytesIO(raw))
if image.format != 'PNG' or image.size != (512, 512):
    raise ValueError('Invalid icon')
image = image.convert('RGBA')
app = asset_path / 'app'
app.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    image.resize((size, size), Image.Resampling.LANCZOS).save(app / f'icon-{size}.png')
resources = resource_path / 'drawable'
resources.mkdir(parents=True, exist_ok=True)
image.save(resources / 'app_icon.png')
# All artwork is local to the APK, including the installer's SVG fallback.
(app / 'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><image width="512" height="512" href="'+config['icon']+'"/></svg>')
manifest = json.loads((app / 'manifest.webmanifest').read_text())
manifest.update(name=name, short_name=name)
(app / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False))
markup = (app / 'index.html').read_text()
markup = re.sub(r'<title>.*?</title>', '<title>'+html.escape(name)+'</title>', markup, count=1)
markup = markup.replace('<strong>Presen Go</strong>', '<strong>'+html.escape(name)+'</strong>')
markup = markup.replace('</head>', '<script src="branded-student.js" defer></script></head>')
(app / 'index.html').write_text(markup)
worker=asset_path / 'app-sw.js'
if worker.exists():
    worker.write_text(re.sub(r"const BUILD='[^']+'", "const BUILD='brand-"+str(config['revision'])+"'", worker.read_text(), count=1))
script = """(()=>{'use strict';const config=__CONFIG__;function apply(){document.title=config.name;const header=document.querySelector('body>header');if(!header)return;const title=header.querySelector('strong');if(title&&title.textContent!==config.name)title.textContent=config.name;if(!header.querySelector('[data-package-logo]')){const logo=document.createElement('img');logo.src='icon-192.png?brand='+config.revision;logo.alt='Logo '+config.name;logo.dataset.packageLogo='';logo.style.cssText='width:36px;height:36px;object-fit:contain;flex-shrink:0';header.prepend(logo);}}apply();document.addEventListener('DOMContentLoaded',apply,{once:true});})();"""
(app / 'branded-student.js').write_text(script.replace('__CONFIG__', json.dumps({'name':name,'revision':config['revision']}, ensure_ascii=True)))
(app / 'brand.json').write_text(json.dumps({'name':name, 'package':config['package'], 'revision':config['revision']}, ensure_ascii=False))
print('Branded launcher, internal logo, application label and offline manifest prepared.')
