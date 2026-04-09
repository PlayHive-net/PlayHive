/**
 * Chess AI Engine — PlayHive
 * Lightweight minimax with alpha-beta pruning, piece-square tables,
 * and move ordering. All moves validated through chess.js legal move generator.
 */
'use strict';

const ChessEngine = (function () {

  /* ── Material Values ── */
  const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  /* ── Piece-Square Tables (White's perspective; mirrored for Black) ── */
  // prettier-ignore
  const PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    n: [
     -50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50
    ],
    b: [
     -20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20
    ],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0
    ],
    q: [
     -20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20
    ],
    k: [
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20
    ],
    k_end: [
     -50,-40,-30,-20,-20,-30,-40,-50,
     -30,-20,-10,  0,  0,-10,-20,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-30,  0,  0,  0,  0,-30,-30,
     -50,-30,-30,-30,-30,-30,-30,-50
    ]
  };

  /* ── Evaluate board position ── */
  function evaluate(game) {
    const board = game.board();
    let score = 0;
    let totalMaterial = 0;

    // First pass: count total material (for endgame detection)
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const pc = board[r][c];
        if (pc && pc.type !== 'k') {
          totalMaterial += PIECE_VAL[pc.type];
        }
      }
    }

    const isEndgame = totalMaterial < 2600; // roughly Q + R worth left

    // Second pass: compute score
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const pc = board[r][c];
        if (!pc) continue;

        const material = PIECE_VAL[pc.type];
        let table = pc.type === 'k' && isEndgame ? PST.k_end : PST[pc.type];
        const idx = pc.color === 'w' ? (r * 8 + c) : ((7 - r) * 8 + c);
        const positional = table ? table[idx] : 0;

        if (pc.color === 'w') {
          score += material + positional;
        } else {
          score -= material + positional;
        }
      }
    }

    // Bonus for mobility (number of legal moves)
    // Approximate: the side to move having more options is good
    // This is cheap since chess.js caches move generation
    return score;
  }

  /* ── Move ordering (fast, no make/undo) ── */
  function scoreMoveForOrdering(san) {
    let s = 0;
    if (san.includes('#')) return 100000;    // checkmate — always first
    if (san.includes('+')) s += 800;         // check
    if (san.includes('x')) s += 4000;        // capture
    if (san.includes('=')) s += 6000;        // promotion
    // Prioritize capturing with less valuable pieces (heuristic via piece letter)
    // SAN starts with uppercase piece letter for non-pawns
    const firstChar = san.charAt(0);
    if (san.includes('x')) {
      // Pawn captures are highest priority in MVV-LVA
      if (firstChar === firstChar.toLowerCase()) s += 500; // pawn capture
      else if (firstChar === 'N' || firstChar === 'B') s += 300;
      else if (firstChar === 'R') s += 200;
      else if (firstChar === 'Q') s += 100;
    }
    return s;
  }

  function orderMoves(moves) {
    if (moves.length <= 1) return moves;
    return moves
      .map(m => ({ move: m, score: scoreMoveForOrdering(m) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.move);
  }

  /* ── Minimax with Alpha-Beta Pruning ── */
  function minimax(game, depth, alpha, beta, isMaximizing) {
    if (depth === 0 || game.game_over()) {
      return evaluate(game);
    }

    const moves = orderMoves(game.moves());

    if (isMaximizing) {
      let best = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        best = Math.max(best, minimax(game, depth - 1, alpha, beta, false));
        game.undo();
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        best = Math.min(best, minimax(game, depth - 1, alpha, beta, true));
        game.undo();
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  /* ── Public: Pick the best move ── */
  function getBestMove(game, difficulty) {
    const moves = game.moves();
    if (moves.length === 0) return null;

    /* Easy: mostly random, slight preference for captures */
    if (difficulty === 'easy') {
      const captures = moves.filter(m => m.includes('x'));
      const checks = moves.filter(m => m.includes('+'));
      // 30% chance to play a capture if available
      if (captures.length > 0 && Math.random() < 0.3) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
      // 20% chance to play a check if available
      if (checks.length > 0 && Math.random() < 0.2) {
        return checks[Math.floor(Math.random() * checks.length)];
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    /* Medium (depth 2) and Hard (depth 3) use minimax */
    const depth = difficulty === 'hard' ? 3 : 2;
    const ordered = orderMoves(moves);

    // AI plays Black → minimizing (lower score = better for Black)
    let bestValue = Infinity;
    let bestMove = ordered[0];

    for (let i = 0; i < ordered.length; i++) {
      game.move(ordered[i]);
      const val = minimax(game, depth - 1, -Infinity, Infinity, true);
      game.undo();
      if (val < bestValue) {
        bestValue = val;
        bestMove = ordered[i];
      }
    }

    return bestMove;
  }

  /* ── Async non-blocking search (time-sliced, no Web Worker needed) ── */
  function getBestMoveAsync(game, difficulty) {
    return new Promise(function (resolve) {
      if (difficulty === 'easy') {
        resolve(getBestMove(game, difficulty));
        return;
      }

      var depth = difficulty === 'hard' ? 3 : 2;
      var moves = orderMoves(game.moves());
      if (moves.length === 0) { resolve(null); return; }

      var bestValue = Infinity;
      var bestMove = moves[0];
      var i = 0;

      function step() {
        var deadline = Date.now() + 8;
        while (i < moves.length) {
          game.move(moves[i]);
          var val = minimax(game, depth - 1, -Infinity, Infinity, true);
          game.undo();
          if (val < bestValue) {
            bestValue = val;
            bestMove = moves[i];
          }
          i++;
          if (Date.now() >= deadline) break;
        }
        if (i < moves.length) {
          setTimeout(step, 0);
        } else {
          resolve(bestMove);
        }
      }

      setTimeout(step, 0);
    });
  }

  /* ── Public API ── */
  return {
    getBestMove: getBestMove,
    getBestMoveAsync: getBestMoveAsync,
    evaluate: evaluate,
    PIECE_VAL: PIECE_VAL
  };
})();
