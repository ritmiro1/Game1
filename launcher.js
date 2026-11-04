#!/usr/bin/env node
console.log("СИНАПСИС: Хронорезонанс — запуск...");
// Simple launcher: opens default browser to local server
import { spawn, exec } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const PORT=3000;
// try to start server
try{
  const serverPath=path.join(__dirname,'server','server.js');
  if(fs.existsSync(serverPath)){
    const child=spawn(process.execPath,[serverPath],{detached:true,stdio:'ignore'});
    child.unref();
  }
}catch{}
const url=`http://localhost:${PORT}`;
console.log(`Открываю ${url}`);
const plat=process.platform;
let cmd;
if(plat==='win32') cmd=`start "" "${url}"`;
else if(plat==='darwin') cmd=`open "${url}"`;
else cmd=`xdg-open "${url}"`;
exec(cmd,()=>{});
setTimeout(()=>{ console.log("Если браузер не открылся, открой вручную: "+url); },1000);
