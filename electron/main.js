import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
let serverProc;

function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 680,
    backgroundColor: '#070b16',
    title: 'СИНАПСИС: Хронорезонанс — Дуэль Архитекторов',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { nodeIntegration:false, contextIsolation:true }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({url})=>{ shell.openExternal(url); return {action:'deny'}; });
}
app.whenReady().then(()=>{
  // start local server for online features if possible
  try{
    serverProc = spawn(process.execPath, [path.join(__dirname,'..','server','server.js')], { stdio:'ignore', detached:true });
  }catch{}
  createWindow();
  app.on('activate', ()=> { if(BrowserWindow.getAllWindows().length===0) createWindow(); });
});
app.on('window-all-closed', ()=> { if(process.platform!=='darwin') app.quit(); if(serverProc) try{ process.kill(-serverProc.pid);}catch{} });
