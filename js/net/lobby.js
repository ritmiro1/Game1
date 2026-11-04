import { PERSONALITIES } from '../ai/personalities.js';

const NAMES = ['NeonVortex','Astra_K','VoidWalker','KRY0N','SYNAPSE','EchoPrime','Архитектор_07','Резонанс_X','Кузнец_3','Хроно_Ткач','Lumen','Tessellate','Orbitron','QBit','Plasma_Drift','Null_Sect'];
const DIVISIONS = ['Бронза','Серебро','Золото','Платина','Архитектор','Гранд-Архитектор'];
function randomElo(){ return 800 + Math.floor(Math.pow(Math.random(),1.2)*1500); }
function division(elo){
  if(elo>=2100) return 'Гранд-Архитектор';
  if(elo>=1850) return 'Архитектор';
  if(elo>=1600) return 'Платина';
  if(elo>=1350) return 'Золото';
  if(elo>=1100) return 'Серебро';
  return 'Бронза';
}
export function generateRooms(count=8){
  const arenas=['crystal','nebula','lab','temple','ark','abyss'];
  return Array.from({length:count}, (_,i)=> ({
    id: 'R'+Math.random().toString(36).slice(2,6).toUpperCase(),
    host: NAMES[Math.floor(Math.random()*NAMES.length)] + '_' + (Math.floor(Math.random()*900)+100),
    elo: randomElo(),
    arena: arenas[Math.floor(Math.random()*arenas.length)],
    mode: Math.random()<0.5? 'Рейтинг 1vs1' : 'Кастом • 5 ELO',
    players: Math.random()<0.3? 2 : 1,
    spec: Math.floor(Math.random()*14),
    ping: 12+Math.floor(Math.random()*40)
  }));
}
export function generateRating(count=30){
  const arr = [];
  for(let i=0;i<count;i++){
    const elo = randomElo();
    arr.push({ name: NAMES[i % NAMES.length] + (i> NAMES.length? '_'+Math.floor(Math.random()*99):''), elo, division: division(elo), wins: 20+Math.floor(Math.random()*120), losses: 15+Math.floor(Math.random()*90), trend: Math.random()<0.5? '↗' : '↘' });
  }
  arr.sort((a,b)=> b.elo-a.elo);
  // inject bots as top players
  arr.splice(2,0,{ name:'АБСОЛЮТ', elo:2280, division:'Гранд-Архитектор', wins:312, losses:18, trend:'↗', bot:true });
  arr.splice(5,0,{ name:'ОРАКУЛ', elo:1920, division:'Архитектор', wins:187, losses:42, trend:'→', bot:true });
  arr.splice(8,0,{ name:'ПРИЗРАК', elo:1855, division:'Архитектор', wins:201, losses:55, trend:'↗', bot:true });
  return arr;
}
export function generateChat(){
  const msgs=[
    { user:'KRY0N', text:'кто в Бездну? го 1vs1 рейтинг' },
    { user:'Astra_K', text:'Оракул опять читает как книгу 😭' },
    { user:'VoidWalker', text:'ищу тиммейта на турнир 2x2 (скоро)' },
    { user:'SYNAPSE', text:'Пас — имба, если умеешь блефовать' },
  ];
  return msgs;
}
