import { cloneState, getLegalActions, applySimultaneous, evaluatePosition } from '../core/board.js';
import { orderMoves } from './evaluator.js';

export class Searcher {
  constructor(depth=3, limits={ maxNodes: 8000 }){
    this.depth = depth;
    this.limits = limits;
    this.nodes = 0;
  }
  // Maximin for simultaneous moves: we pick move that maximizes worst-case opponent reply
  findBest(state, player){
    this.nodes=0;
    const myMoves = orderMoves(state, getLegalActions(state, player), player).slice(0,6);
    const enemy = player===0?1:0;
    const enemyMoves = orderMoves(state, getLegalActions(state, enemy), enemy).slice(0,6);
    let bestMove = myMoves[0];
    let bestScore = -Infinity;
    let bestReply = null;
    for(const my of myMoves){
      // worst enemy reply
      let worst = Infinity;
      let worstMove = null;
      for(const en of enemyMoves){
        const next = applySimultaneous(cloneState(state), player===0?my:en, player===0?en:my);
        const score = this.minimax(next, this.depth-1, -Infinity, Infinity, enemy, player);
        this.nodes++;
        if(score < worst){ worst=score; worstMove=en; }
        // alpha pruning for inner loop: if worst already < bestScore, this myMove cannot be better than current best, skip
        if(worst <= bestScore) break;
        if(this.nodes > this.limits.maxNodes) break;
      }
      if(worst > bestScore){
        bestScore = worst;
        bestMove = my;
        bestReply = worstMove;
      }
    }
    return { move: bestMove, score: bestScore, nodes: this.nodes, reply: bestReply };
  }
  minimax(state, depth, alpha, beta, toMove, perspective){
    if(depth===0 || state.winner!==undefined) return evaluatePosition(state, perspective);
    const player = toMove;
    const moves = orderMoves(state, getLegalActions(state, player), player).slice(0,5);
    // For simultaneous depth, we treat as alternating to approximate: max for perspective, min for opponent
    const isMax = player===perspective;
    if(isMax){
      let maxEval = -Infinity;
      for(const mv of moves){
        // need opponent move? For depth, we do simple 1-ply expansion: assume opponent passes, then next ply opponent moves.
        // This approximates sequential. To keep branching manageable, we expand only one side per ply.
        // Create next state assuming opponent passes (costless) and we apply our move alone vs pass.
        const dummy = { type:'pass', pieceId:null, target:null, ability:null, cost:0 };
        const next = applySimultaneous(cloneState(state), perspective===0 ? mv : dummy, perspective===1 ? mv : dummy);
        const evalScore = this.minimax(next, depth-1, alpha, beta, player===0?1:0, perspective);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if(beta <= alpha) break;
        this.nodes++;
        if(this.nodes > this.limits.maxNodes) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for(const mv of moves){
        const dummy = { type:'pass', pieceId:null, target:null, ability:null, cost:0 };
        const next = applySimultaneous(cloneState(state), perspective===0 ? dummy : mv, perspective===1 ? dummy : mv);
        const evalScore = this.minimax(next, depth-1, alpha, beta, perspective, perspective);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if(beta <= alpha) break;
        this.nodes++;
        if(this.nodes > this.limits.maxNodes) break;
      }
      return minEval;
    }
  }
}
