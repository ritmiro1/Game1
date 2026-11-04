export const BOARD_SIZE = 7;
export const PLAYER_YOU = 0;
export const PLAYER_ENEMY = 1;

export function createInitialBoard(arenaId='crystal'){
  const size = BOARD_SIZE;
  const board = Array.from({length:size}, ()=> Array.from({length:size}, ()=> null));
  // anomalies symmetric
  const blocks = [[2,2],[2,4],[4,2],[4,4]];
  for(const [x,y] of blocks) board[y][x] = { type:'block' };
  // portals
  const portals = [{x:3,y:0,owner:PLAYER_ENEMY},{x:3,y:6,owner:PLAYER_YOU}];
  // core
  const core = { x:3, y:3, type:'core' };
  // pieces
  const pieces = [];
  // You (bottom side): y=5 and 6
  pieces.push({ id:'y0', owner:PLAYER_YOU, x:2, y:5, cd:0, skin:'default', lastMoved:-99 });
  pieces.push({ id:'y1', owner:PLAYER_YOU, x:3, y:5, cd:0, skin:'default', lastMoved:-99 });
  pieces.push({ id:'y2', owner:PLAYER_YOU, x:4, y:5, cd:0, skin:'default', lastMoved:-99 });
  // Enemy top
  pieces.push({ id:'e0', owner:PLAYER_ENEMY, x:2, y:1, cd:0, skin:'default', lastMoved:-99 });
  pieces.push({ id:'e1', owner:PLAYER_ENEMY, x:3, y:1, cd:0, skin:'default', lastMoved:-99 });
  pieces.push({ id:'e2', owner:PLAYER_ENEMY, x:4, y:1, cd:0, skin:'default', lastMoved:-99 });
  return { size, board, pieces, core, portals, blocks, arenaId, turn:1, energies:[3,3], stunned:[false,false], history:[] };
}

export function cloneState(s){
  return JSON.parse(JSON.stringify(s));
}
export function inBounds(x,y){ return x>=0 && x<BOARD_SIZE && y>=0 && y<BOARD_SIZE; }
export function isBlocked(state,x,y){
  if(!inBounds(x,y)) return true;
  const cell = state.board[y][x];
  return cell && cell.type==='block';
}
export function pieceAt(state,x,y){
  return state.pieces.find(p=> p.x===x && p.y===y && !p.captured);
}
export function canSee(state, from, to){
  // line of sight orthogonal or diagonal? For abilities: need straight line without blocks
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if(dx===0 && dy===0) return true;
  // check if aligned orthogonal or diagonal or any? Our abilities allow pull if distance <=3 and path clear (any direction)
  // For simplicity, allow if Manhattan or Chebyshev? We'll check ray
  let x = from.x + dx, y = from.y + dy;
  while(inBounds(x,y)){
    if(isBlocked(state,x,y)) return false;
    if(x===to.x && y===to.y) return true;
    // if direction is not purely orthogonal/diagonal, we need to handle; but our step-by-step dx/dy will trace correctly for orthogonal/diagonal only.
    // For other slopes (e.g., 2,1) path not defined -> allow if distance <=3 anyway
    if(Math.abs(to.x-from.x)<=1 || Math.abs(to.y-from.y)<=1) return true;
    // fallback: if not aligned, break
    if(dx!==0 && dy!==0 && Math.abs(to.x-from.x)!==Math.abs(to.y-from.y)) break;
    x+=dx; y+=dy;
    if(Math.abs(x-from.x)>4) break;
  }
  // If not aligned strictly, allow if distance <=2
  const cheb = Math.max(Math.abs(to.x-from.x), Math.abs(to.y-from.y));
  return cheb<=2;
}
export function distance(a,b){ return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)); } // Chebyshev
export function manhattan(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }

export function getLegalActions(state, player){
  const actions = [];
  const myPieces = state.pieces.filter(p=> p.owner===player && !p.captured);
  const energy = state.energies[player];
  if(state.stunned[player]) {
    // stunned -> only pass allowed
    return [{ type:'pass', pieceId:null, target:null, ability:null, cost:0 }];
  }
  for(const p of myPieces){
    // moves: 8 directions
    for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++){
      if(dx===0 && dy===0) continue;
      const nx = p.x+dx, ny = p.y+dy;
      if(!inBounds(nx,ny)) continue;
      if(isBlocked(state,nx,ny)) continue;
      const occupier = pieceAt(state,nx,ny);
      if(occupier && occupier.owner===player) continue; // own piece blocks
      // moving onto core allowed? core is not piece, but occupies cell. We allow moving onto core? For swap ability only; move onto core should be considered blocked (core is entity)
      if(state.core.x===nx && state.core.y===ny) continue; // core cell not walkable (must use abilities)
      actions.push({ type:'move', pieceId:p.id, target:{x:nx,y:ny}, ability:null, cost:0 });
    }
    // abilities if enough energy and piece not in cooldown for swap
    if(energy>=2){
      // pull: can pull if canSee core
      if(canSee(state,p,state.core)){
        // pull moves core 1 step towards p if possible
        const vec = { x: Math.sign(p.x - state.core.x), y: Math.sign(p.y - state.core.y) };
        // if already adjacent? still pull: core moves towards p
        const nc = { x: state.core.x + vec.x, y: state.core.y + vec.y };
        if(inBounds(nc.x,nc.y) && !isBlocked(state,nc.x,nc.y) && !pieceAt(state,nc.x,nc.y) && !(nc.x===p.x && nc.y===p.y)){
          actions.push({ type:'ability', pieceId:p.id, target:{...nc}, ability:'pull', cost:2, coreDelta:vec });
        }
      }
      // push: opposite
      if(canSee(state,p,state.core)){
        const vec = { x: Math.sign(state.core.x - p.x), y: Math.sign(state.core.y - p.y) };
        const nc = { x: state.core.x + vec.x, y: state.core.y + vec.y };
        if(inBounds(nc.x,nc.y) && !isBlocked(state,nc.x,nc.y) && !pieceAt(state,nc.x,nc.y)){
          actions.push({ type:'ability', pieceId:p.id, target:{...nc}, ability:'push', cost:2, coreDelta:vec });
        }
      }
      // swap: if distance <=2 and not on cooldown
      if(p.cd===0 && distance(p, state.core)<=2){
        // check target (core cell) not blocked, and piece moves to core, core moves to piece pos
        // pieceAt check already: core cell may be considered not piece-occupied
        actions.push({ type:'ability', pieceId:p.id, target:{x:state.core.x,y:state.core.y}, ability:'swap', cost:2 });
      }
    }
  }
  // pass always
  actions.push({ type:'pass', pieceId:null, target:null, ability:null, cost:0 });
  // deduplicate? keep limited for AI branching
  return actions;
}

export function applySimultaneous(state, actionYou, actionEnemy){
  const next = cloneState(state);
  const actions = [actionYou, actionEnemy]; // 0 is you, 1 is enemy
  // energy costs
  for(let pl=0; pl<2; pl++){
    const a = actions[pl];
    if(a && a.cost) next.energies[pl] = Math.max(0, next.energies[pl]-a.cost);
  }
  // abilities first
  // collect core deltas
  let coreMoves = [];
  let swaps = [];
  for(let pl=0; pl<2; pl++){
    const a = actions[pl];
    if(!a || a.type!=='ability') continue;
    const piece = next.pieces.find(p=> p.id===a.pieceId);
    if(!piece || piece.captured) continue;
    if(a.ability==='pull' || a.ability==='push'){
      // recalc delta based on current before move
      const vec = a.coreDelta || {x:0,y:0};
      coreMoves.push({ pl, vec, from:piece });
    } else if(a.ability==='swap'){
      swaps.push({ pl, piece });
    }
  }
  // handle swaps: if both swap simultaneously -> they both target core, weird: resolve by priority to lower turn player? For simplicity, if both swap, both swap with core sequentially: first you, then enemy. But core moved after first swap, second swap would be with new core pos.
  // We'll process swaps in order You then Enemy, but second's target is old core? We'll just handle one swap max per turn: if both try swap, both fail (resonance interference) and core stays, pieces stunned
  if(swaps.length===2){
    // interference
    coreMoves = [];
    // both pieces get cd
    swaps.forEach(s=> s.piece.cd=3);
    next.history.push({ turn: next.turn, note:'⚡ Интерференция обменов — резонанс схлопнулся!' });
  } else if(swaps.length===1){
    const s = swaps[0];
    const piece = s.piece;
    const cx = next.core.x, cy = next.core.y;
    // swap positions
    const px = piece.x, py = piece.y;
    // ensure destination not blocked (core cell is always free)
    // check target not occupied by another piece (it is core)
    next.core.x = px; next.core.y = py;
    piece.x = cx; piece.y = cy;
    piece.cd = 3; // cooldown 2 turns + current
    next.history.push({ turn: next.turn, note: `${plName(s.pl)} использовал ИМПУЛЬС (обмен)!` });
    // after swap, coreMoves from that player invalidated already, but opponent's push/pull should apply to new core position?
    // We'll still apply opponent coreMoves to new core pos
  }
  // apply core pushes/pulls
  if(coreMoves.length===1){
    const m = coreMoves[0];
    const nc = { x: next.core.x + m.vec.x, y: next.core.y + m.vec.y };
    if(inBounds(nc.x,nc.y) && !isBlocked(next,nc.x,nc.y) && !pieceAt(next,nc.x,nc.y)){
      next.core.x = nc.x; next.core.y = nc.y;
      next.history.push({ turn: next.turn, note: `${plName(m.pl)} сдвинул Ядро ${m.vec.x},${m.vec.y}` });
    } else {
      next.history.push({ turn: next.turn, note: `${plName(m.pl)} резонанс заблокирован` });
    }
  } else if(coreMoves.length===2){
    // vector sum
    const sum = { x: coreMoves[0].vec.x + coreMoves[1].vec.x, y: coreMoves[0].vec.y + coreMoves[1].vec.y };
    // normalize to 1 step max? In our design each is 1 step, sum could be 0,1,2. We clamp to 1 chebyshev
    const norm = { x: Math.sign(sum.x), y: Math.sign(sum.y) };
    if(norm.x===0 && norm.y===0){
      next.history.push({ turn: next.turn, note:'Резонансы взаимно погасли (0)' });
    } else {
      const nc = { x: next.core.x + norm.x, y: next.core.y + norm.y };
      if(inBounds(nc.x,nc.y) && !isBlocked(next,nc.x,nc.y) && !pieceAt(next,nc.x,nc.y)){
        next.core.x = nc.x; next.core.y = nc.y;
        next.history.push({ turn: next.turn, note:`Сложный резонанс сдвинул Ядро ${norm.x},${norm.y}` });
      } else {
        next.history.push({ turn: next.turn, note:'Сложный резонанс заблокирован' });
      }
    }
  }
  // now moves
  // detect collisions: both move to same cell
  const moves = [];
  for(let pl=0; pl<2; pl++){
    const a = actions[pl];
    if(!a || a.type!=='move') continue;
    const piece = next.pieces.find(p=> p.id===a.pieceId);
    if(!piece || piece.captured) continue;
    moves.push({ pl, piece, target:a.target, a });
  }
  if(moves.length===2 && moves[0].target.x===moves[1].target.x && moves[0].target.y===moves[1].target.y){
    // collision
    next.stunned = [true,true];
    next.history.push({ turn: next.turn, note:'💥 Столкновение! Оба оглушены на ход' });
    // no movement
  } else {
    // resolve captures and moves sequentially: you first
    // To avoid order bias, check if one moves onto other's start position -> capture if other moves away? We'll handle.
    // Sort by player 0 then 1
    for(const m of moves){
      const occupant = pieceAt(next,m.target.x,m.target.y);
      if(occupant && occupant.owner!==m.piece.owner){
        // capture
        occupant.captured = true;
        occupant.x = -1; occupant.y = -1;
        next.history.push({ turn: next.turn, note:`${plName(m.pl)} захватил ${occupant.id}!` });
      } else if(occupant && occupant.owner===m.piece.owner){
        // should not happen (filtered)
        continue;
      }
      // check stunned target: if target is where opponent piece currently stands and opponent is not moving away -> capture attempt but opponent still there
      // For simplicity, if opponent piece is moving away, capture not needed
      m.piece.x = m.target.x; m.piece.y = m.target.y;
      m.piece.lastMoved = next.turn;
    }
    // if only one collision was not detected but second move would capture first's new position -> it's allowed? We'll handle as capture only if both moved to same? Already handled. So second move capturing first's new pos is like chase — allow.
    if(moves.length>0) next.stunned = [false,false];
  }
  // cooldown ticks
  for(const p of next.pieces){
    if(p.cd>0) p.cd--;
  }
  // energy regen
  for(let pl=0; pl<2; pl++){
    if(next.energies[pl] < 5) next.energies[pl]++;
  }
  // win checks
  // core at portal
  if(next.core.x===3 && next.core.y===0){
    next.winner = PLAYER_YOU; next.winReason='Ядро доставлено в портал врага!';
  } else if(next.core.x===3 && next.core.y===6){
    next.winner = PLAYER_ENEMY; next.winReason='Ядро доставлено в твой портал!';
  } else {
    // annihilation
    const youAlive = next.pieces.some(p=> p.owner===PLAYER_YOU && !p.captured);
    const enemyAlive = next.pieces.some(p=> p.owner===PLAYER_ENEMY && !p.captured);
    if(!youAlive){ next.winner = PLAYER_ENEMY; next.winReason='Все твои резонаторы захвачены'; }
    else if(!enemyAlive){ next.winner = PLAYER_YOU; next.winReason='Все враги захвачены'; }
  }
  next.turn++;
  // if no winner after 40 turns, draw by material (portal distance)
  if(!next.winner && next.turn>40){
    // evaluate who closer
    const dYou = manhattan(next.core, {x:3,y:0});
    const dEn = manhattan(next.core, {x:3,y:6});
    if(dYou < dEn) { next.winner = PLAYER_YOU; next.winReason='Победа по позиции ядра (тай-брейк)'; }
    else if(dEn < dYou) { next.winner = PLAYER_ENEMY; next.winReason='Победа по позиции ядра (тай-брейк)'; }
    else { next.winner = 2; next.winReason='Ничья — резонанс стабилизирован'; }
  }
  return next;
}
function plName(pl){ return pl===PLAYER_YOU ? 'Ты' : 'Враг'; }

export function evaluatePosition(state, perspective=PLAYER_YOU){
  // heuristic for AI: positive favors perspective
  if(state.winner!==undefined){
    if(state.winner===perspective) return 10000 - state.turn;
    if(state.winner===2) return 0;
    return -10000 + state.turn;
  }
  let score = 0;
  const youPieces = state.pieces.filter(p=> p.owner===perspective && !p.captured).length;
  const enemyPieces = state.pieces.filter(p=> p.owner!==perspective && !p.captured).length;
  score += (youPieces - enemyPieces)*300;
  // core distances to portals
  const myPortal = perspective===PLAYER_YOU ? {x:3,y:0} : {x:3,y:6};
  const enemyPortal = perspective===PLAYER_YOU ? {x:3,y:6} : {x:3,y:0};
  const dMy = manhattan(state.core, myPortal);
  const dEnemy = manhattan(state.core, enemyPortal);
  score += (dEnemy - dMy)*25; // want core far from enemy portal, close to my portal
  // piece proximity to core
  let myDistToCore = Infinity, enDistToCore = Infinity;
  for(const p of state.pieces){
    if(p.captured) continue;
    const d = distance(p, state.core);
    if(p.owner===perspective) myDistToCore = Math.min(myDistToCore, d);
    else enDistToCore = Math.min(enDistToCore, d);
  }
  score += (enDistToCore - myDistToCore)*12;
  // energy
  const myE = state.energies[perspective], enE = state.energies[perspective===0?1:0];
  score += (myE - enE)*8;
  // center control
  const center = {x:3,y:3};
  let myCenter=0, enCenter=0;
  for(const p of state.pieces){
    if(p.captured) continue;
    const d = distance(p, center);
    if(d<=2){
      if(p.owner===perspective) myCenter++; else enCenter++;
    }
  }
  score += (myCenter - enCenter)*10;
  // mobility
  const myMob = getLegalActions(state,perspective).length;
  const enMob = getLegalActions(state,perspective===0?1:0).length;
  score += (myMob - enMob)*2;
  return score;
}
