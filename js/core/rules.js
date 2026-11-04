// Helpers for game flow validation
export function isTerminal(state){ return state.winner!==undefined; }
export function turnToString(turn){ return `Ход ${turn}`; }
export function formatAction(a){
  if(!a || a.type==='pass') return 'ПАС';
  if(a.type==='move') return `Ход ${a.pieceId} → ${String.fromCharCode(65+a.target.x)}${7-a.target.y}`;
  if(a.type==='ability'){
    const map={ pull:'Тяготение', push:'Толчок', swap:'Импульс' };
    return `${map[a.ability]||a.ability} ${a.pieceId}`;
  }
  return '?';
}
