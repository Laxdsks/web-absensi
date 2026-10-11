const fs=require('node:fs'),path=require('node:path');
// Accept only the bounded, square PNG produced by the editor, before decoding it.
function decode(data,nativeImage){
 if(typeof data!=='string'||data.length>2000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('Gunakan gambar PNG dari pratinjau ikon.');
 const bytes=Buffer.from(data.slice(22),'base64');
 if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==512||bytes.readUInt32BE(20)!==512)throw Error('Ukuran ikon harus 512 × 512 piksel.');
 const image=nativeImage.createFromBuffer(bytes);
 if(image.isEmpty()||image.getSize().width!==512||image.getSize().height!==512)throw Error('Gambar ikon tidak dapat dibaca.');
 return image;
}
function ico(image){const png=image.resize({width:256,height:256}).toPNG(),head=Buffer.alloc(22);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(png.length,14);head.writeUInt32LE(22,18);return Buffer.concat([head,png]);}
function register({app,main,ipcMain,nativeImage,shell,trusted,root}){
 const dir=path.join(app.getPath('userData'),'app-icon'),pngFile=path.join(dir,'icon.png'),defaultFile=path.join(root,'app/icon-512.png');
 const target=process.env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');
 const shortcut=()=>path.join(app.getPath('desktop'),'Presen Desk - Ikon saya.lnk');
 function current(){try{return decode('data:image/png;base64,'+fs.readFileSync(pngFile).toString('base64'),nativeImage);}catch(_){return nativeImage.createFromPath(defaultFile);}}
 function owned(file){try{return path.resolve(shell.readShortcutLink(file).target).toLowerCase()===path.resolve(target).toLowerCase();}catch(_){return false;}}
 function writeShortcut(image){
  if(process.platform!=='win32')throw Error('Pintasan desktop tersedia pada Windows.');
  const file=shortcut();if(fs.existsSync(file)&&!owned(file))throw Error('Nama pintasan sudah digunakan aplikasi lain. Ubah nama pintasan tersebut terlebih dahulu.');
  // New filenames avoid the Windows shell icon cache retaining the previous image.
  const hash=require('node:crypto').createHash('sha256').update(image.toPNG()).digest('hex').slice(0,16),iconFile=path.join(dir,'icon-'+hash+'.ico');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(iconFile,ico(image));
  if(!shell.writeShortcutLink(file,fs.existsSync(file)?'update':'create',{target,cwd:path.dirname(target),description:'Presen Desk',icon:iconFile,iconIndex:0,appUserModelId:'id.webabsensi.dosen'}))throw Error('Pintasan desktop belum dapat dibuat.');
 }
 main.setIcon(current());
 ipcMain.handle('app-icon-get',event=>{if(!trusted(event))throw Error('Halaman tidak diizinkan.');return {platform:process.platform,png:'data:image/png;base64,'+current().toPNG().toString('base64')};});
 ipcMain.handle('app-icon-set',(event,data)=>{if(!trusted(event))throw Error('Halaman tidak diizinkan.');const image=decode(data,nativeImage);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(pngFile+'.tmp',image.toPNG());fs.renameSync(pngFile+'.tmp',pngFile);main.setIcon(image);return true;});
 ipcMain.handle('app-icon-shortcut',event=>{if(!trusted(event))throw Error('Halaman tidak diizinkan.');writeShortcut(current());return true;});
 ipcMain.handle('app-icon-reset',event=>{if(!trusted(event))throw Error('Halaman tidak diizinkan.');const image=nativeImage.createFromPath(defaultFile);if(image.isEmpty())throw Error('Ikon bawaan tidak tersedia.');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(pngFile+'.tmp',image.toPNG());fs.renameSync(pngFile+'.tmp',pngFile);main.setIcon(image);if(process.platform==='win32'&&owned(shortcut()))writeShortcut(image);return true;});
}
module.exports={decode,ico,register};
