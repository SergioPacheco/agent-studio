const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studioDesktop',Object.freeze({chooseProject:()=>ipcRenderer.invoke('studio:choose-project')}));
