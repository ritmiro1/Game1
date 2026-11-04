const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
let mainWindow;
function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 680,
    backgroundColor: '#070b16',
    title: 'СИНАПСИС: Хронорезонанс — Дуэль Архитекторов',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration:false, contextIsolation:true }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({url})=>{ shell.openExternal(url); return {action:'deny'}; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', ()=> { if(process.platform!=='darwin') app.quit(); });
app.on('activate', ()=> { if(BrowserWindow.getAllWindows().length===0) createWindow(); });
