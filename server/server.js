import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(ROOT));

let playersOnline = 1847;
setInterval(()=> playersOnline = 1700 + Math.floor(Math.random()*400), 5000);

app.get('/api/status', (req,res)=> {
  res.json({ ok:true, players: playersOnline, version:'1.2.0', season:'Пробуждение Архитектора', uptime: process.uptime() });
});
app.get('/api/leaderboard', (req,res)=>{
  // mock
  const top = Array.from({length:20}, (_,i)=> ({ rank:i+1, name:'Player'+i, elo: 2400 - i*30 }));
  res.json(top);
});
app.get('/health', (req,res)=> res.send('ok'));

const server = createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new Map();
wss.on('connection', (ws)=>{
  playersOnline++;
  ws.send(JSON.stringify({ type:'hello', players: playersOnline }));
  ws.on('message', (msg)=>{
    try{
      const data=JSON.parse(msg);
      if(data.type==='createRoom'){
        const code=Math.random().toString(36).slice(2,6).toUpperCase();
        rooms.set(code, { code, host: ws, arena: data.arena||'crystal' });
        ws.roomCode=code;
        ws.send(JSON.stringify({ type:'roomCreated', code }));
      } else if(data.type==='joinRoom'){
        const room=rooms.get(data.code);
        if(room){ room.guest=ws; ws.roomCode=data.code; ws.send(JSON.stringify({ type:'joined', code:data.code })); room.host.send(JSON.stringify({ type:'opponentJoined' })); }
        else ws.send(JSON.stringify({ type:'error', msg:'Комната не найдена' }));
      } else if(data.type==='move'){
        const room=rooms.get(ws.roomCode);
        if(room){
          const other = room.host===ws ? room.guest : room.host;
          if(other) other.send(JSON.stringify({ type:'opponentMove', move:data.move }));
        }
      } else if(data.type==='chat'){
        wss.clients.forEach(c=> { if(c.readyState===1) c.send(JSON.stringify({ type:'chat', user:data.user, text:data.text, time: Date.now() })); });
      }
    }catch(e){ console.error(e); }
  });
  ws.on('close', ()=> { if(ws.roomCode) rooms.delete(ws.roomCode); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', ()=> {
  console.log(`[SYNAPSIS] Сервер арены запущен на http://0.0.0.0:${PORT}`);
  console.log(`[SYNAPSIS] Открой http://localhost:${PORT} для игры`);
});
