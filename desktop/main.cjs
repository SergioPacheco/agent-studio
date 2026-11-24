const {app,BrowserWindow,ipcMain,dialog,shell,session}=require('electron');
const {spawn}=require('node:child_process');const net=require('node:net');const http=require('node:http');const path=require('node:path');const crypto=require('node:crypto');
let child,base,window,shuttingDown=false;
const port=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
async function ready(token){for(let i=0;i<150;i++){const ok=await new Promise(resolve=>{const request=http.get(base+'/api/config',{headers:{Authorization:'Bearer '+token}},response=>{response.resume();resolve(response.statusCode===200);});request.on('error',()=>resolve(false));request.setTimeout(500,()=>{request.destroy();resolve(false);});});if(ok)return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Servidor local não iniciou.');}
app.whenReady().then(async()=>{
 const selectedPort=await port(),token=crypto.randomBytes(32).toString('hex');base='http://127.0.0.1:'+selectedPort;
 child=spawn(process.execPath,['--env-file-if-exists='+path.join(__dirname,'..','.env'),'--env-file-if-exists='+path.join(app.getPath('userData'),'.env'),path.join(__dirname,'..','server.mjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PORT:String(selectedPort),STUDIO_DATA_DIR:path.join(app.getPath('userData'),'workspace'),STUDIO_AUTH_TOKEN:token,STUDIO_PUBLIC_ORIGIN:''},stdio:'ignore'});
 child.on('error',()=>dialog.showErrorBox('Agent Studio','Não foi possível iniciar o servidor local.'));
 await ready(token);
 session.defaultSession.webRequest.onBeforeSendHeaders({urls:[base+'/*']},(details,callback)=>callback({requestHeaders:{...details.requestHeaders,Authorization:'Bearer '+token}}));
 session.defaultSession.setPermissionRequestHandler((_contents,permission,callback)=>{if(permission==='media')dialog.showMessageBox(window,{type:'question',buttons:['Permitir microfone','Cancelar'],defaultId:1,message:'Permitir o microfone para ditado nesta sessão?'}).then(({response})=>callback(response===0));else callback(false);});
 window=new BrowserWindow({width:1510,height:980,minWidth:390,minHeight:640,title:'Agent Studio',backgroundColor:'#111113',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(({url})=>{try{if(new URL(url).protocol==='https:')shell.openExternal(url);}catch{}return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(base+'/'))event.preventDefault();});
 ipcMain.handle('studio:choose-project',async event=>{if(new URL(event.senderFrame.url).origin!==base)throw new Error('Origem inválida.');const result=await dialog.showOpenDialog(window,{properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
 await window.loadURL(base);
 if(process.argv.includes('--smoke-test')){const count=await window.webContents.executeJavaScript('new Promise(resolve=>{let attempts=0;const timer=setInterval(()=>{const count=document.querySelectorAll("#agents .agent").length;if(count||++attempts>100){clearInterval(timer);resolve(count);}},100);})');console.log('Desktop smoke: '+count+' agents');child?.kill('SIGTERM');app.exit(count===5?0:1);}
}).catch(error=>{console.error(error.message);dialog.showErrorBox('Agent Studio',error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(child&&child.exitCode===null&&!shuttingDown){event.preventDefault();shuttingDown=true;child.once('exit',()=>app.quit());child.kill('SIGTERM');setTimeout(()=>{child?.kill('SIGKILL');app.quit();},4000).unref();}});
