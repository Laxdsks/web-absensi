const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('AbsensiDesktop',{saveFile:(name,mime,data)=>ipcRenderer.invoke('save-file',{name,mime,data}),printDocument:(html,base)=>ipcRenderer.invoke('print-document',{html,base})});
