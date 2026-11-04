export const OPENING_BOOK = {
  crystal: [
    { move:{ type:'move', pieceId:'e1', target:{x:3,y:2}}, weight:3, note:'Центр!' },
    { move:{ type:'move', pieceId:'e0', target:{x:2,y:2}}, weight:1, note:'Фланг' },
  ],
  lab: [
    { move:{ type:'move', pieceId:'e1', target:{x:3,y:2}}, weight:4 },
  ],
  abyss: [
    { move:{ type:'ability', pieceId:'e1', target:{x:3,y:2}, ability:'pull'}, weight:2 },
  ]
};
export function getOpeningMove(state){
  if(state.turn>3) return null;
  const book = OPENING_BOOK[state.arenaId] || OPENING_BOOK.crystal;
  // pick weighted random favoring center
  const r = Math.random();
  return r<0.7 ? book[0].move : book[Math.floor(Math.random()*book.length)].move;
}
