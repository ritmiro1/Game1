import { evaluatePosition, getLegalActions } from '../core/board.js';
export function quickEvaluate(state, player){
  return evaluatePosition(state, player);
}
export function orderMoves(state, moves, player){
  // order by heuristic: captures first, then core-approaching
  return moves.sort((a,b)=>{
    const sa = scoreMove(state,a,player);
    const sb = scoreMove(state,b,player);
    return sb-sa;
  });
}
function scoreMove(state, move, player){
  let s=0;
  if(move.type==='pass') return -50;
  if(move.type==='move'){
    // capture?
    const target = move.target;
    const victim = state.pieces.find(p=> p.x===target.x && p.y===target.y && p.owner!==player && !p.captured);
    if(victim) s+=200;
    // moving towards core?
    const piece = state.pieces.find(p=> p.id===move.pieceId);
    if(piece){
      const dBefore = Math.max(Math.abs(piece.x - state.core.x), Math.abs(piece.y - state.core.y));
      const dAfter = Math.max(Math.abs(target.x - state.core.x), Math.abs(target.y - state.core.y));
      s += (dBefore - dAfter)*10;
      // center
      const center = {x:3,y:3};
      const dcAfter = Math.max(Math.abs(target.x-center.x), Math.abs(target.y-center.y));
      s += (3-dcAfter)*3;
    }
  } else if(move.type==='ability'){
    if(move.ability==='pull' || move.ability==='push'){
      // if core moving towards my portal, good
      const myPortal = player===0 ? {x:3,y:0} : {x:3,y:6};
      const dBefore = Math.abs(state.core.x - myPortal.x)+Math.abs(state.core.y - myPortal.y);
      const dAfter = Math.abs(move.target.x - myPortal.x)+Math.abs(move.target.y - myPortal.y);
      s += (dBefore - dAfter)*30;
      s+=50;
    } else if(move.ability==='swap'){
      s+=80;
    }
  }
  return s;
}
