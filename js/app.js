import { createInitialBoard, applySimultaneous, getLegalActions, PLAYER_YOU, PLAYER_ENEMY } from './core/board.js';
import { formatAction } from './core/rules.js';
import { BoardRenderer } from './ui/boardRenderer.js';
import { createBot, PERSONALITIES } from './ai/personalities.js';
import { generateRooms, generateRating, generateChat } from './net/lobby.js';
import { eloDelta, rankName, loadProfile, saveProfile } from './net/rating.js';
import { ARENAS, SKINS, TITLES } from './data/arenas.js';
import { TUTORIAL_STEPS } from './data/tutorial.js';

// --- State ---
let profile = loadProfile();
// migrate achievements set
if(Array.isArray(profile.achievements)) profile.achievements = new Set(profile.achievements);
let gameState = null;
let gameMode = 'bot'; // bot | online | friend | puzzle
let botPersonality = 'tactician';
let selectedPiece = null;
let plannedAction = null;
let currentArena = profile.arena || 'crystal';
let renderer = null;
let botInstance = null;
let isOnline = false;
let ws = null;

// --- DOM ---
const $ = s=> document.querySelector(s);
const $$ = s=> [...document.querySelectorAll(s)];

function init(){
  setupNav();
  setupHero();
  setupLobby();
  setupRating();
  setupCodex();
  setupProfile();
  setupGameOverlay();
  setupModals();
  updateProfileUI();
  setupBoard();
  setupPWA();
  // entrance particles
  spawnBgParticles();
  // daily timer
  setInterval(updateDailyTimer,1000);
  // online count simulation
  setInterval(()=> { const v= document.getElementById('statPlayersOnline'); if(v) v.textContent = (1700 + Math.floor(Math.random()*400)).toLocaleString('ru-RU'); }, 3000);
  // check server
  checkServer();
}
function setupNav(){
  $$('.nav-btn').forEach(b=> b.addEventListener('click', ()=>{
    $$('.nav-btn').forEach(x=> x.classList.remove('active'));
    b.classList.add('active');
    const screen = b.dataset.screen;
    $$('.screen').forEach(s=> s.classList.remove('active'));
    const el = document.getElementById('screen-'+screen);
    if(el) el.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }));
}
function setupHero(){
  // mini preview
  const preview = document.getElementById('miniBoardPreview');
  if(preview){
    const g=document.createElement('div'); g.className='mini-grid';
    for(let y=0;y<7;y++) for(let x=0;x<7;x++){
      const c=document.createElement('div'); c.className='mini-cell';
      if((x===2&&y===2)||(x===2&&y===4)||(x===4&&y===2)||(x===4&&y===4)) c.classList.add('block');
      if(x===3&&y===0||x===3&&y===6) c.classList.add('portal');
      if(x===3&&y===3) c.classList.add('core');
      if((x===2&&y===1)||(x===3&&y===1)||(x===4&&y===1)) c.classList.add('enemy'), c.textContent='⬣';
      if((x===2&&y===5)||(x===3&&y===5)||(x===4&&y===5)) c.classList.add('you'), c.textContent='◉';
      g.appendChild(c);
    }
    preview.appendChild(g);
  }
  document.getElementById('btnQuickPlay').addEventListener('click', ()=> openBotPicker());
  document.getElementById('btnOnline').addEventListener('click', ()=> { $$('.nav-btn').find(b=> b.dataset.screen==='lobby').click(); });
  document.getElementById('btnTutorial').addEventListener('click', ()=> startTutorial());
  document.querySelectorAll('.mode-card').forEach(card=>{
    card.querySelector('button').addEventListener('click', ()=>{
      const mode=card.dataset.mode;
      if(mode==='bot') openBotPicker();
      else if(mode==='online') $$('.nav-btn').find(b=> b.dataset.screen==='lobby').click();
      else if(mode==='friend') openCreateRoom();
      else if(mode==='puzzle') openPuzzle();
    });
  });
}
function openBotPicker(){
  const modal = document.getElementById('modalRoot');
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="modal">
    <h3>ВЫБЕРИ СОПЕРНИКА — БОТЫ-АРХЕТИПЫ</h3>
    <p>Каждый бот — отдельный стиль мышления. <b>АБСОЛЮТ</b> почти не проигрывает. Начни с ВЕКТОРА.</p>
    <div class="bot-grid">
      ${Object.values(PERSONALITIES).map(p=> `
        <button class="bot-card" data-bot="${p.id}" style="border-color:${p.color}">
          <b style="color:${p.color}">${p.avatar} ${p.name} — ${p.elo} ELO</b>
          <small>${p.desc}</small>
          <small style="color:${p.color}">Глубина: ${p.depth} • Узлов: ${p.maxNodes} • Ошибок: ${Math.round(p.mistake*100)}%</small>
        </button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-ghost small" id="closeBotPicker">Отмена</button>
      <span style="font-size:11px;color:var(--muted);margin-left:auto">Совет: включи звук — боты «дышат» резонансом</span>
    </div>
  </div>`;
  modal.querySelectorAll('.bot-card').forEach(b=> b.addEventListener('click', ()=>{
    botPersonality=b.dataset.bot;
    modal.classList.add('hidden');
    startGame('bot');
  }));
  modal.querySelector('#closeBotPicker').addEventListener('click', ()=> modal.classList.add('hidden'));
  modal.addEventListener('click', (e)=> { if(e.target===modal) modal.classList.add('hidden'); });
}
function startTutorial(){
  let step=0;
  const modal=document.getElementById('modalRoot');
  function show(){
    const s=TUTORIAL_STEPS[step];
    modal.classList.remove('hidden');
    modal.innerHTML=`<div class="modal"><h3>${s.title} <small style="color:var(--muted)">(${step+1}/${TUTORIAL_STEPS.length})</small></h3><p>${s.text}</p>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-ghost small" id="tPrev">← Назад</button><button class="btn btn-primary" id="tNext">${step===TUTORIAL_STEPS.length-1?'ИГРАТЬ!':'Далее →'}</button></div></div>`;
    modal.querySelector('#tNext').addEventListener('click', ()=>{ if(step===TUTORIAL_STEPS.length-1){ modal.classList.add('hidden'); startGame('bot'); } else { step++; show(); } });
    modal.querySelector('#tPrev').addEventListener('click', ()=>{ if(step>0){ step--; show(); } });
  }
  show();
}
function setupLobby(){
  const list = document.getElementById('roomList');
  function render(){
    const rooms=generateRooms(8);
    list.innerHTML = rooms.map(r=> `
      <div class="room">
        <div><b>${r.host}</b> <small>${r.arena} • ${r.mode}</small><div style="font-size:11px;color:var(--muted)">ID ${r.id} • ${r.ping}ms • ${r.spec} зрителей</div></div>
        <div style="text-align:right"><div class="badge">${r.elo} ELO</div><button class="btn btn-small btn-primary" data-join="${r.id}">ВОЙТИ</button></div>
      </div>`).join('');
    list.querySelectorAll('[data-join]').forEach(b=> b.addEventListener('click', ()=> {
      toast('Подключение к комнате '+b.dataset.join+'…');
      setTimeout(()=> startGame('online'), 600);
    }));
  }
  render();
  setInterval(render, 5000);
  document.getElementById('btnCreateRoom').addEventListener('click', openCreateRoom);
  document.getElementById('btnQuickMatch').addEventListener('click', ()=>{
    toast('Матчмейкинг: ищем равного...');
    let dots=0;
    const t=setInterval(()=>{ dots=(dots+1)%4; document.getElementById('btnQuickMatch').textContent='Поиск'+'.'.repeat(dots); },300);
    setTimeout(()=>{ clearInterval(t); document.getElementById('btnQuickMatch').textContent='⚡ БЫСТРЫЙ ПОИСК (ELO)'; startGame('online'); toast('Соперник найден!'); }, 1800);
  });
  document.getElementById('btnJoinByCode').addEventListener('click', ()=>{
    const code=document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if(code.length<4) return toast('Код слишком короткий');
    toast('Вход по коду '+code);
    setTimeout(()=> startGame('online'), 500);
  });
  // chat
  const chat=document.getElementById('lobbyChat');
  const msgs=generateChat();
  chat.innerHTML=msgs.map(m=> `<div class="chat-msg"><b>${m.user}</b> <small>${new Date().toLocaleTimeString().slice(0,5)}</small><div>${m.text}</div></div>`).join('');
  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });
  function sendChat(){
    const inp=document.getElementById('chatInput');
    const txt=inp.value.trim(); if(!txt) return;
    const el=document.createElement('div'); el.className='chat-msg'; el.innerHTML=`<b>${profile.name}</b> <small>сейчас</small><div>${escapeHtml(txt)}</div>`; chat.appendChild(el); chat.scrollTop=chat.scrollHeight; inp.value='';
  }
}
function openCreateRoom(){
  const modal=document.getElementById('modalRoot'); modal.classList.remove('hidden');
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  modal.innerHTML=`<div class="modal"><h3>СОЗДАТЬ КОМНАТУ</h3><p>Поделись кодом с другом. Выберите арену и режим.</p>
  <div style="display:flex;gap:8px;align-items:center;background:#0a0e1a;border:1px solid var(--line);padding:10px;border-radius:10px;margin:10px 0">
    <b style="font-family:'JetBrains Mono'">Код: ${code}</b><button class="btn btn-small btn-ghost" onclick="navigator.clipboard.writeText('${code}')">Копировать</button>
    <span style="margin-left:auto;font-size:11px;color:var(--muted)">Ожидание соперника…</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <label>Арена <select id="createArena">${ARENAS.map(a=> `<option value="${a.id}">${a.name}</option>`).join('')}</select></label>
    <label>Режим <select><option>Рейтинг</option><option>Товарищеский</option></select></label>
  </div>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-ghost small" onclick="document.getElementById('modalRoot').classList.add('hidden')">Отмена</button><button class="btn btn-primary" id="startRoom">СТАРТ ДУЭЛИ</button></div></div>`;
  modal.querySelector('#startRoom').addEventListener('click', ()=>{
    currentArena=modal.querySelector('#createArena').value;
    modal.classList.add('hidden');
    startGame('friend');
  });
}
function openPuzzle(){
  toast('Головоломки скоро — 48 задач в разработке. Попробуй пока АБСОЛЮТА 😉');
}
function setupRating(){
  const body=document.getElementById('ratingBody');
  const data=generateRating(30);
  function render(filter=''){
    const q=filter.toLowerCase();
    const filtered=data.filter(r=> !q || r.name.toLowerCase().includes(q));
    body.innerHTML=filtered.slice(0,20).map((r,i)=> `
      <tr class="${r.name===profile.name?'you':''}"><td>${i+1}</td><td><b>${r.name}</b> ${r.bot?'<span style="font-size:10px;background:var(--yellow);color:#000;padding:2px 4px;border-radius:4px">BOT</span>':''}</td><td>${r.division}</td><td><b>${r.elo}</b></td><td>${r.wins}-${r.losses}</td><td>${r.trend}</td></tr>
    `).join('');
    const yours = filtered.find(r=> r.name===profile.name) || { elo:profile.elo, division: rankName(profile.elo) };
    document.getElementById('yourRankCard').innerHTML=`<div><b>${profile.name}</b><div style="font-size:11px;color:var(--muted)">${yours.division}</div></div><div style="margin-left:auto;text-align:right"><b style="font-family:Orbitron;color:var(--cyan)">${yours.elo} ELO</b><div style="font-size:11px">#${filtered.length+1} в сезоне</div></div>`;
  }
  render();
  document.getElementById('ratingSearch').addEventListener('input', e=> render(e.target.value));
}
function setupCodex(){
  const grid=document.getElementById('codexGrid');
  const items=[
    ...ARENAS.map(a=> ({ cover:a.icon, title:a.name, text:a.desc, tag:'Арена' })),
    ...SKINS.slice(0,6).map(s=> ({ cover:'◈', title:s.name, text:`Редкость: ${s.rarity} • Цвет ${s.color}`, tag:'Скин' })),
    { cover:'⚡', title:'Механика Резонанса', text:'Одновременные ходы создают 625 комбинаций в ход. Чтение соперника важнее расчёта.', tag:'Геймплей' },
    { cover:'🧠', title:'Боты-личности', text:'4 архетипа с разной оценкой позиции. АБСОЛЮТ использует дебютную книгу и эндшпиль.', tag:'AI' },
    { cover:'🏆', title:'ELO и сезоны', text:'K=32/24/16. Сезон 30 дней. Топ-3 получают титул и скин.', tag:'Рейтинг' },
  ];
  grid.innerHTML=items.map(it=> `<div class="codex-card"><div class="cover">${it.cover}</div><div class="body"><small style="color:var(--cyan);letter-spacing:.08em">${it.tag}</small><h3>${it.title}</h3><p>${it.text}</p></div></div>`).join('');
  const sel=document.getElementById('arenaSelect');
  sel.innerHTML=ARENAS.map(a=> `<option value="${a.id}" ${a.id===currentArena?'selected':''}>${a.name}</option>`).join('');
  sel.addEventListener('change', e=> { currentArena=e.target.value; profile.arena=currentArena; saveProfile(profile); toast('Арена: '+ARENAS.find(a=> a.id===currentArena).name); });
}
function setupProfile(){
  document.getElementById('btnEditName').addEventListener('click', ()=>{
    const n=prompt('Новое имя резонатора:', profile.name);
    if(n && n.trim().length>=2){ profile.name=n.trim().slice(0,16); saveProfile(profile); updateProfileUI(); toast('Имя изменено'); }
  });
  document.getElementById('btnResetStats').addEventListener('click', ()=>{
    if(confirm('Сбросить все победы, ELO и историю?')){ profile.wins=0; profile.losses=0; profile.draws=0; profile.elo=1284; profile.streak=0; profile.history=[]; saveProfile(profile); updateProfileUI(); toast('Прогресс сброшен'); }
  });
  updateProfileUI();
}
function updateProfileUI(){
  const elo=profile.elo;
  document.getElementById('playerName').textContent=profile.name;
  document.getElementById('playerElo').textContent=elo;
  document.getElementById('playerRank').textContent=rankName(elo);
  document.getElementById('playerAvatar').style.background = `linear-gradient(135deg, var(--cyan), var(--vio))`;
  document.getElementById('profileNameBig').textContent=profile.name;
  document.getElementById('profileEloBig').textContent=elo;
  document.getElementById('profileRankBig').textContent=rankName(elo);
  document.getElementById('profileWins').textContent=profile.wins;
  document.getElementById('profileLosses').textContent=profile.losses;
  document.getElementById('profileWR').textContent= profile.wins+profile.losses>0 ? Math.round(profile.wins/(profile.wins+profile.losses)*100)+'%' : '—';
  document.getElementById('profileStreak').textContent= (profile.streak>0? '🔥 '+profile.streak : '0');
  document.getElementById('youName').textContent=profile.name;
  document.getElementById('youElo').textContent= elo+' ELO';
  // avatar big
  document.getElementById('profileAvatarBig').style.background = `linear-gradient(135deg, var(--cyan), var(--vio))`;
  // history
  const hist=document.getElementById('matchHistory');
  if(hist){
    if(!profile.history || profile.history.length===0) hist.innerHTML='<small style="color:var(--muted)">Пока нет дуэлей. Сыграй с ВЕКТОРОМ!</small>';
    else hist.innerHTML=profile.history.slice(-8).reverse().map(h=> `<div class="history-item ${h.result==='win'?'win':'lose'}"><div><b>${h.vs}</b><div style="font-size:11px;color:var(--muted)">${h.arena} • ${h.date}</div></div><b style="color:${h.result==='win'?'var(--green)':'var(--mag)'}">${h.result==='win'?'ПОБЕДА':'ПОРАЖЕНИЕ'} ${h.delta>0?'+'+h.delta:h.delta}</b></div>`).join('');
  }
  // achievements
  const ach=document.getElementById('achievements');
  if(ach){
    const list=[
      { id:'first_win', name:'Первый резонанс', desc:'Выиграй 1 дуэль', done: profile.wins>=1 },
      { id:'streak3', name:'Серия 3', desc:'3 победы подряд', done: profile.streak>=3 },
      { id:'oracle', name:'Оракул повержен', desc:'Победи ОРАКУЛА', done: profile.history?.some(h=> h.vs.includes('ОРАКУЛ') && h.result==='win') },
      { id:'absolute', name:'Абсолют', desc:'Победи АБСОЛЮТА', done: profile.history?.some(h=> h.vs.includes('АБСОЛЮТ') && h.result==='win') },
      { id:'explorer', name:'Исследователь', desc:'Сыграй на всех 6 аренах', done: new Set(profile.history?.map(h=> h.arena)).size>=6 },
      { id:'collector', name:'Коллекционер', desc:'10 дуэлей', done: profile.wins+profile.losses>=10 },
    ];
    ach.innerHTML=list.map(a=> `<div class="ach ${a.done?'done':''}"><b>${a.done?'✓ ':''}${a.name}</b><small>${a.desc}</small></div>`).join('');
  }
}
function setupBoard(){
  const canvas=document.getElementById('boardCanvas');
  renderer = new BoardRenderer(canvas, ()=> gameState);
  renderer.onCellClick = (cell)=>{
    if(!gameState || gameState.winner!==undefined) return;
    // if piece at cell owned by you and no planned action yet -> select
    const piece = gameState.pieces.find(p=> p.x===cell.x && p.y===cell.y && p.owner===PLAYER_YOU && !p.captured);
    if(piece){
      selectedPiece = piece.id;
      plannedAction=null;
      renderer.setSelected(selectedPiece);
      updateSelectedInfo();
      playSound('select');
      return;
    }
    // if selected and clicked adjacent -> attempt move
    if(selectedPiece){
      const p = gameState.pieces.find(pp=> pp.id===selectedPiece);
      if(!p) return;
      const dx=Math.abs(p.x-cell.x), dy=Math.abs(p.y-cell.y);
      const isNeighbor = Math.max(dx,dy)===1;
      const targetOccupiedByOwn = gameState.pieces.some(pp=> pp.owner===PLAYER_YOU && pp.x===cell.x && pp.y===cell.y && !pp.captured);
      const blocked = gameState.board[cell.y][cell.x]?.type==='block';
      const isCore = gameState.core.x===cell.x && gameState.core.y===cell.y;
      if(isNeighbor && !targetOccupiedByOwn && !blocked && !isCore){
        // queue move action
        plannedAction = { type:'move', pieceId:selectedPiece, target:{...cell}, ability:null, cost:0 };
        renderer.addParticles(cell.x, cell.y, '#00e5ff', 8);
        updateSelectedInfo();
        document.getElementById('btnConfirm').disabled=false;
        playSound('hover');
      } else {
        // maybe clicked enemy to indicate capture intent? but captures are via move onto enemy piece
        // check if enemy piece there
        const enemy = gameState.pieces.find(pp=> pp.owner===PLAYER_ENEMY && pp.x===cell.x && pp.y===cell.y && !pp.captured);
        if(enemy && isNeighbor){
          plannedAction = { type:'move', pieceId:selectedPiece, target:{...cell}, ability:null, cost:0 };
          document.getElementById('btnConfirm').disabled=false;
          renderer.addParticles(cell.x,cell.y,'#ff00a8',10);
        } else {
          toast('Клетка недоступна. Ход только на 1 клетку, не на аномалию/ядро.');
        }
      }
    }
  };
}
function setupGameOverlay(){
  document.getElementById('btnExitGame').addEventListener('click', exitGame);
  document.getElementById('btnSurrender').addEventListener('click', ()=> {
    if(confirm('Сдаться? Поражение засчитается.')) endGame(PLAYER_ENEMY,'Сдача');
  });
  document.getElementById('btnClear').addEventListener('click', ()=>{
    plannedAction=null; selectedPiece=null; renderer.setSelected(null); updateSelectedInfo(); document.getElementById('btnConfirm').disabled=true;
  });
  document.getElementById('btnConfirm').addEventListener('click', confirmAction);
  document.querySelectorAll('.abtn').forEach(b=> b.addEventListener('click', ()=>{
    if(!selectedPiece && b.dataset.ability!=='pass'){ toast('Сначала выбери резонатор'); return; }
    const abil=b.dataset.ability;
    if(abil==='pass'){
      plannedAction={ type:'pass', pieceId:null, target:null, ability:null, cost:0 };
      document.getElementById('btnConfirm').disabled=false;
      updateSelectedInfo('ПАС — блеф и экономия ⚡');
      return;
    }
    if(abil==='move'){
      updateSelectedInfo('Кликни на соседнюю клетку для хода (0⚡)');
      return;
    }
    // abilities need energy check
    if(gameState.energies[PLAYER_YOU]<2){ toast('Нужно 2⚡'); return; }
    const piece=gameState.pieces.find(p=> p.id===selectedPiece);
    if(!piece) return;
    if(abil==='swap' && piece.cd>0){ toast('Импульс на перезарядке: '+piece.cd); return; }
    // for pull/push, we need to validate canSee; renderer will show but we can pre-check
    // create planned ability: target is core new pos? Actually game logic computes target; we just mark ability
    // For UI, we will store ability and let core logic decide delta.
    // But we need to provide coreDelta; we can compute here.
    let coreDelta=null;
    if(abil==='pull'){ coreDelta={ x: Math.sign(piece.x - gameState.core.x), y: Math.sign(piece.y - gameState.core.y)}; }
    if(abil==='push'){ coreDelta={ x: Math.sign(gameState.core.x - piece.x), y: Math.sign(gameState.core.y - piece.y)}; }
    plannedAction={ type:'ability', pieceId:selectedPiece, target: abil==='swap'? {x:gameState.core.x,y:gameState.core.y}: null, ability:abil, cost:2, coreDelta };
    document.getElementById('btnConfirm').disabled=false;
    updateSelectedInfo(`Выбрано: ${b.querySelector('b').textContent} — нажми Подтвердить`);
    $$('.abtn').forEach(x=> x.classList.remove('active'));
    b.classList.add('active');
    playSound('ability');
  }));
  document.getElementById('btnDraw').addEventListener('click', ()=> toast('Запрос ничьей отправлен сопернику…'));
}
function updateSelectedInfo(msg){
  const el=document.getElementById('selectedInfo');
  if(msg){ el.textContent=msg; return; }
  if(!selectedPiece){ el.textContent='Резонатор не выбран — кликни на бирюзовую фигуру'; return; }
  if(!plannedAction){ el.textContent=`Выбран ${selectedPiece} — выбери действие справа или ход на поле`; return; }
  el.textContent=`Готово: ${formatAction(plannedAction)} — нажми Подтвердить (скрыто от врага)`;
}
function startGame(mode){
  gameMode=mode;
  const arena = ARENAS.find(a=> a.id===currentArena) || ARENAS[0];
  gameState = createInitialBoard(currentArena);
  selectedPiece=null; plannedAction=null;
  renderer.setSelected(null);
  document.getElementById('btnConfirm').disabled=true;
  updateSelectedInfo();
  document.getElementById('gameOverlay').classList.remove('hidden');
  document.getElementById('arenaName').textContent='Арена: '+arena.name;
  document.getElementById('turnNum').textContent=gameState.turn;
  document.getElementById('phaseLabel').textContent='ПЛАНИРОВАНИЕ';
  updateEnergyBars();
  updateMiniHistory();
  // set enemy info
  const bot = PERSONALITIES[botPersonality] || PERSONALITIES.tactician;
  document.getElementById('enemyName').textContent= mode==='bot' ? bot.name : 'Соперник_online';
  document.getElementById('enemyElo').textContent= mode==='bot' ? bot.elo+' ELO • '+bot.name : '1350 ELO';
  botInstance = mode==='bot' ? createBot(botPersonality) : null;
  // if online fake, create bot with random personality as stand-in
  if(mode!=='bot'){
    const ids=Object.keys(PERSONALITIES);
    botInstance = createBot(ids[Math.floor(Math.random()*ids.length)]);
  }
  // reset timers
  playSound('start');
  toast('Дуэль началась! Арена '+arena.name);
}
function confirmAction(){
  if(!plannedAction){
    // if no action, treat as pass
    plannedAction={ type:'pass', pieceId:null, target:null, ability:null, cost:0 };
  }
  // lock in
  const youAction = plannedAction;
  // bot chooses
  const enemyState = JSON.parse(JSON.stringify(gameState));
  const botMove = botInstance ? botInstance.chooseMove(enemyState, PLAYER_ENEMY) : { type:'pass', pieceId:null, target:null, ability:null, cost:0 };
  // reveal overlay
  const reveal=document.getElementById('revealOverlay');
  document.getElementById('revealYou').textContent=formatAction(youAction);
  document.getElementById('revealEnemy').textContent=formatAction(botMove);
  reveal.classList.remove('hidden');
  playSound('reveal');
  setTimeout(()=>{
    reveal.classList.add('hidden');
    // apply simultaneous
    const prevCore = {...gameState.core};
    const prevPieces = gameState.pieces.map(p=> ({id:p.id, x:p.x, y:p.y}));
    const next = applySimultaneous(gameState, youAction, botMove);
    // animation: find moves
    const moves = [];
    for(const p of next.pieces){
      const prev = prevPieces.find(pp=> pp.id===p.id);
      if(prev && (prev.x!==p.x || prev.y!==p.y)) moves.push({pieceId:p.id, from:prev, to:{x:p.x,y:p.y}});
    }
    renderer.triggerAnimation(prevCore, {...next.core}, moves);
    // particles on core move
    if(prevCore.x!==next.core.x || prevCore.y!==next.core.y){
      renderer.addParticles(next.core.x, next.core.y, '#00ffa6', 16);
    }
    gameState = next;
    selectedPiece=null; plannedAction=null; renderer.setSelected(null);
    document.getElementById('btnConfirm').disabled=true;
    $$('.abtn').forEach(b=> b.classList.remove('active'));
    updateSelectedInfo();
    document.getElementById('turnNum').textContent=gameState.turn;
    updateEnergyBars();
    updateMiniHistory();
    // win check
    if(gameState.winner!==undefined){
      setTimeout(()=> handleWin(), 600);
    } else {
      playSound('move');
    }
  }, 900);
}
function updateEnergyBars(){
  for(let pl=0; pl<2; pl++){
    const bar=document.getElementById(pl===0?'youEnergy':'enemyEnergy');
    const e=gameState.energies[pl];
    bar.innerHTML = Array.from({length:5}, (_,i)=> `<i class="${i<e?'on':''}"></i>`).join('');
  }
}
function updateMiniHistory(){
  const h=document.getElementById('miniHistory');
  if(!h) return;
  const hist = gameState.history.slice(-6).map(x=> `<div>• Ход ${x.turn}: ${x.note}</div>`).join('') || '<div style="color:var(--dim)">Хроника пуста</div>';
  h.innerHTML=hist;
}
function handleWin(){
  const winner=gameState.winner;
  const isYouWin = winner===PLAYER_YOU;
  const vsName=document.getElementById('enemyName').textContent;
  const arenaName = ARENAS.find(a=> a.id===currentArena)?.name || currentArena;
  const enemyElo = (PERSONALITIES[botPersonality]?.elo) || 1500;
  const delta = eloDelta(profile.elo, enemyElo, isYouWin?1:0);
  profile.elo += delta;
  if(isYouWin){ profile.wins++; profile.streak=(profile.streak||0)+1; } else { profile.losses++; profile.streak=0; }
  profile.history.push({ vs: vsName, arena: arenaName, result: isYouWin?'win':'lose', delta, date: new Date().toLocaleDateString('ru-RU'), turn: gameState.turn });
  saveProfile(profile);
  updateProfileUI();
  const modal=document.getElementById('modalRoot');
  modal.classList.remove('hidden');
  modal.innerHTML=`<div class="modal" style="text-align:center">
    <h3 style="font-size:22px">${isYouWin?'✨ ПОБЕДА!':'💥 ПОРАЖЕНИЕ'}</h3>
    <p>${gameState.winReason}</p>
    <div style="background:#0a0e1a;border:1px solid var(--line);padding:10px;border-radius:10px;margin:10px 0">
      <b>${isYouWin?'+':''}${delta} ELO</b> • Новый рейтинг: <b style="color:var(--cyan)">${profile.elo}</b> • ${rankName(profile.elo)}<br>
      <small>Ходов: ${gameState.turn} • Арена: ${arenaName}</small>
    </div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" id="again">РЕВАНШ</button><button class="btn btn-ghost" id="toMenu">В МЕНЮ</button><button class="btn btn-ghost small" id="saveReplay">Сохранить реплей</button></div>
  </div>`;
  modal.querySelector('#again').addEventListener('click', ()=>{ modal.classList.add('hidden'); startGame(gameMode); });
  modal.querySelector('#toMenu').addEventListener('click', ()=>{ modal.classList.add('hidden'); exitGame(); });
  modal.querySelector('#saveReplay').addEventListener('click', ()=>{ downloadReplay(); toast('Реплей сохранён'); });
  playSound(isYouWin?'win':'lose');
}
function endGame(winner, reason){
  gameState.winner=winner; gameState.winReason=reason;
  handleWin();
}
function exitGame(){
  document.getElementById('gameOverlay').classList.add('hidden');
  gameState=null;
}
function downloadReplay(){
  if(!gameState) return;
  const data = { arena: currentArena, history: gameState.history, turn: gameState.turn, winner: gameState.winner, date: new Date().toISOString(), profile: profile.name };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`synapsis-replay-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
}
function setupModals(){
  document.getElementById('modalRoot').addEventListener('click', e=> { if(e.target.id==='modalRoot') e.currentTarget.classList.add('hidden'); });
  document.getElementById('settingsBtn').addEventListener('click', ()=>{
    const m=document.getElementById('modalRoot'); m.classList.remove('hidden');
    m.innerHTML=`<div class="modal"><h3>НАСТРОЙКИ</h3>
    <label class="switch"><input type="checkbox" id="mSound" ${localStorage.getItem('optSound')!=='0'?'checked':''}> Звук</label>
    <label class="switch"><input type="checkbox" id="mParticles" checked> Частицы</label>
    <label>Громкость <input type="range" id="mVol" min="0" max="100" value="${localStorage.getItem('optVol')||70}"></label>
    <p style="font-size:11px;color:var(--muted)">EXE версия хранит настройки локально. Онлайн требует сервера.</p>
    <button class="btn btn-primary" onclick="document.getElementById('modalRoot').classList.add('hidden')">Закрыть</button></div>`;
  });
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._h); t._h=setTimeout(()=> t.classList.add('hidden'), 2200);
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function spawnBgParticles(){
  const c=document.getElementById('bgParticles');
  if(!c) return;
  for(let i=0;i<30;i++){
    const d=document.createElement('div');
    d.style.cssText=`position:absolute;left:${Math.random()*100}%;top:${Math.random()*100}%;width:2px;height:2px;background:rgba(0,229,255,${0.3+Math.random()*0.5});border-radius:50%;box-shadow:0 0 6px #00e5ff;animation:float ${10+Math.random()*10}s linear infinite`;
    c.appendChild(d);
  }
  const style=document.createElement('style'); style.textContent=`@keyframes float{from{transform:translateY(0)}to{transform:translateY(-100vh)}}`; document.head.appendChild(style);
}
function updateDailyTimer(){
  const el=document.getElementById('dailyTimer');
  if(!el) return;
  const now=new Date();
  const end=new Date(); end.setHours(23,59,59,999);
  const diff=end-now;
  const h=String(Math.floor(diff/3600000)).padStart(2,'0');
  const m=String(Math.floor(diff%3600000/60000)).padStart(2,'0');
  const s=String(Math.floor(diff%60000/1000)).padStart(2,'0');
  el.textContent=`${h}:${m}:${s}`;
}
function checkServer(){
  fetch('/api/status').then(r=> r.json()).then(j=> {
    document.getElementById('serverStatus').textContent='● Сервер арены: онлайн ('+j.players+' игроков)';
    document.getElementById('serverStatus').style.color='var(--green)';
  }).catch(()=> {
    document.getElementById('serverStatus').textContent='● Сервер арены: офлайн (локальный режим)';
  });
}
let audioCtx=null;
function playSound(type){
  try{
    if(localStorage.getItem('optSound')==='0') return;
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const now=audioCtx.currentTime;
    if(type==='select'){ o.frequency.value=880; g.gain.value=0.08; o.start(now); g.gain.exponentialRampToValueAtTime(0.001, now+0.12); o.stop(now+0.13); }
    else if(type==='move'){ o.frequency.value=440; g.gain.value=0.08; o.start(now); o.frequency.linearRampToValueAtTime(660, now+0.08); g.gain.exponentialRampToValueAtTime(0.001, now+0.2); o.stop(now+0.21); }
    else if(type==='ability'){ o.frequency.value=300; g.gain.value=0.09; o.start(now); o.frequency.linearRampToValueAtTime(1200, now+0.15); g.gain.exponentialRampToValueAtTime(0.001, now+0.3); o.stop(now+0.31); }
    else if(type==='reveal'){ o.frequency.value=200; g.gain.value=0.09; o.start(now); o.frequency.linearRampToValueAtTime(100, now+0.4); g.gain.exponentialRampToValueAtTime(0.001, now+0.5); o.stop(now+0.51); }
    else if(type==='win'){ [0,0.12,0.24].forEach((d,i)=>{ const o2=audioCtx.createOscillator(), g2=audioCtx.createGain(); o2.connect(g2); g2.connect(audioCtx.destination); o2.frequency.value=[523,659,784][i]; g2.gain.value=0.09; const t=now+d; o2.start(t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.3); o2.stop(t+0.31); }); }
    else if(type==='lose'){ o.frequency.value=300; g.gain.value=0.09; o.start(now); o.frequency.linearRampToValueAtTime(120, now+0.5); g.gain.exponentialRampToValueAtTime(0.001, now+0.6); o.stop(now+0.61); }
    else if(type==='start'){ o.frequency.value=150; g.gain.value=0.08; o.start(now); o.frequency.linearRampToValueAtTime(900, now+0.5); g.gain.exponentialRampToValueAtTime(0.001, now+0.6); o.stop(now+0.61); }
  }catch{}
}
function setupPWA(){
  // register dummy service worker not needed
}

// expose for inline handlers
window.toast=toast;

init();
