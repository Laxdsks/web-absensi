const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),dest=path.join(root,'app/vendor');fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
function copy(pkg,file,name=path.basename(file)){const src=path.join(root,'node_modules',pkg,file),out=path.join(dest,name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(src,out);}
copy('qrcode-generator','qrcode.js','qr.js');copy('jsqr','dist/jsQR.js','scan.js');
copy('tesseract.js','dist/tesseract.min.js');copy('tesseract.js','dist/worker.min.js');
for(const f of fs.readdirSync(path.join(root,'node_modules/tesseract.js-core')))if(/\.wasm(?:\.js)?$/.test(f))copy('tesseract.js-core',f);
copy('@e965/xlsx','dist/xlsx.full.min.js');copy('mammoth','mammoth.browser.min.js');
copy('pdfjs-dist','build/pdf.min.mjs');copy('pdfjs-dist','build/pdf.worker.min.mjs');
for(const dir of ['cmaps','standard_fonts','wasm']){const src=path.join(root,'node_modules/pdfjs-dist',dir);if(fs.existsSync(src))fs.cpSync(src,path.join(dest,dir),{recursive:true});}
function find(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory()){const r=find(p);if(r)return r;}else if(f.name==='eng.traineddata.gz')return p;}}
const eng=path.join(root,'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');if(!eng)throw Error('Data OCR belum tersedia');fs.writeFileSync(path.join(dest,'eng.traineddata'),zlib.gunzipSync(fs.readFileSync(eng)));
for(const pkg of ['qrcode-generator','jsqr','tesseract.js','tesseract.js-core','@tesseract.js-data/eng','@e965/xlsx','mammoth','pdfjs-dist','@fortawesome/fontawesome-free','@fontsource/plus-jakarta-sans']){const dir=path.join(root,'node_modules',pkg);for(const file of fs.readdirSync(dir))if(/^licen[sc]e|^notice/i.test(file))copy(pkg,file,'licenses/'+pkg.replaceAll('/','-')+'-'+file);}
copy('@fortawesome/fontawesome-free','css/all.min.css','fontawesome/css/all.min.css');
for(const f of fs.readdirSync(path.join(root,'node_modules/@fortawesome/fontawesome-free/webfonts')))copy('@fortawesome/fontawesome-free','webfonts/'+f,'fontawesome/webfonts/'+f);
for(const f of ['400.css','500.css','600.css','700.css'])copy('@fontsource/plus-jakarta-sans',f,'jakarta/'+f);
for(const f of fs.readdirSync(path.join(root,'node_modules/@fontsource/plus-jakarta-sans/files')))if(/-(?:400|500|600|700)-normal\.woff2?$/.test(f))copy('@fontsource/plus-jakarta-sans','files/'+f,'jakarta/files/'+f);
const files=[];function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else files.push({path:path.relative(root,p).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),bytes:fs.statSync(p).size});}}walk(dest);fs.writeFileSync(path.join(root,'app/vendor-manifest.json'),JSON.stringify(files,null,2)+'\n');console.log(`${files.length} berkas pustaka offline, ${Math.round(files.reduce((s,f)=>s+f.bytes,0)/1048576)} MB`);
