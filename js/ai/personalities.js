import { Searcher } from './search.js';
import { getOpeningMove } from './openingBook.js';
import { getLegalActions } from '../core/board.js';

export const PERSONALITIES = {
  novice: { id:'novice', name:'НОВОБРАНЕЦ', elo: 900, color:'#8ea0c2', desc:'Учится. Делает случайные ходы, иногда зевает победу.', depth:1, maxNodes:500, mistake:0.35, style:'random', avatar:'◯' },
  tactician: { id:'tactician', name:'ВЕКТОР', elo: 1350, color:'#00e5ff', desc:'Математик. Любит центр и контроль, считает на 2 хода.', depth:2, maxNodes:2000, mistake:0.12, style:'positional', avatar:'⬢' },
  oracle: { id:'oracle', name:'ОРАКУЛ', elo: 1720, color:'#7c4dff', desc:'Читает твои намерения. Ставит ловушки, любит обмен.', depth:3, maxNodes:6000, mistake:0.05, style:'trap', avatar:'◎' },
  phantom: { id:'phantom', name:'ПРИЗРАК', elo: 1850, color:'#ff00a8', desc:'Агрессор. Жертвует фигурой ради темпа и давления на ядро.', depth:3, maxNodes:6000, mistake:0.04, style:'aggressive', avatar:'⬣' },
  absolute: { id:'absolute', name:'АБСОЛЮТ', elo: 2280, color:'#ffcc00', desc:'Финальный босс. Видит на 5 ходов, знает дебюты, почти не ошибается.', depth:4, maxNodes:12000, mistake:0.01, style:'perfect', avatar:'⬔' }
};

export function createBot(id){
  const p = PERSONALITIES[id] || PERSONALITIES.tactician;
  return new Bot(p);
}

class Bot {
  constructor(personality){
    this.p = personality;
    this.searcher = new Searcher(personality.depth, { maxNodes: personality.maxNodes });
  }
  chooseMove(state, player){
    if(state.turn<=2 && this.p.id!=='novice' && Math.random()<0.8){
      const op = getOpeningMove(state);
      if(op){
        const exists = state.pieces.some(p=> p.id===op.pieceId && p.owner===player && !p.captured);
        if(exists) return adaptMove(state, op, player);
        // still adapt to nearest piece
        return adaptMove(state, op, player);
      }
    }
    if(this.p.style==='random' && Math.random()<0.5){
      const moves = getLegalActions(state,player).slice(0,8);
      return moves[Math.floor(Math.random()*moves.length)];
    }
    const result = this.searcher.findBest(state, player);
    let move = result.move;
    if(Math.random() < this.p.mistake){
      const legal = getLegalActions(state,player);
      if(legal.length>2) move = legal[1 + Math.floor(Math.random()*Math.min(2, legal.length-2))];
    }
    if(this.p.style==='aggressive'){
      const cap = getLegalActions(state,player).find(m=> isCapture(state,m,player));
      if(cap && Math.random()<0.6) move = cap;
    }
    if(this.p.style==='trap'){
      const sw = getLegalActions(state,player).find(m=> m.ability==='swap');
      if(sw && Math.random()<0.5) move = sw;
    }
    return move;
  }
}
function adaptMove(state, op, player){
  let m = {...op, target:{...op.target}};
  const owned = state.pieces.filter(p=> p.owner===player && !p.captured);
  if(!owned.some(p=> p.id===m.pieceId)){
    const central = owned.find(p=> p.x===3) || owned[0];
    if(central) m.pieceId = central.id;
  }
  return m;
}
function isCapture(state, move, player){
  if(move.type!=='move') return false;
  const t = move.target;
  return state.pieces.some(p=> p.x===t.x && p.y===t.y && p.owner!==player && !p.captured);
}
export { Bot };
