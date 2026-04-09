/**
 * Chess Game UI — PlayHive
 * Handles board rendering, user interaction, game state, and scoring.
 */
'use strict';

(function () {
  /* ── Config ── */
  const POINTS = { easy: 50, medium: 100, hard: 250 };
  const PIECE_SYMBOLS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

  /* ── State ── */
  let game = new Chess();
  let difficulty = 'easy';
  let score = 0;
  let best = parseInt(localStorage.getItem('chess-best') || '0');
  let gameActive = false;
  let isPlayerTurn = true;
  let selectedSq = null;
  let validMoves = [];

  /* ── DOM refs ── */
  const scoreEl     = document.getElementById('score');
  const bestEl      = document.getElementById('best');
  const statusText  = document.getElementById('status-text');
  const chessGrid   = document.getElementById('chess-grid');
  const gameContent = document.getElementById('game-content');
  const screenStart = document.getElementById('screen-start');
  const goOverlay   = document.getElementById('overlay-gameover');
  const boardWrap   = document.getElementById('board-wrap');
  const diffLabel   = document.getElementById('diff-label');
  const endEmoji    = document.getElementById('end-emoji');
  const endTitle    = document.getElementById('end-title');
  const endStats    = document.getElementById('end-stats');
  const endMsg      = document.getElementById('end-msg');

  /* ── Score delta animation ── */
  function showDelta(val) {
    const d = document.createElement('div');
    d.className = 'score-delta plus';
    d.textContent = '+' + val;
    boardWrap.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  /* ── Board Rendering ── */
  function renderBoard() {
    chessGrid.innerHTML = '';
    const board = game.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sqName = String.fromCharCode(97 + c) + (8 - r);
        const isLight = (r + c) % 2 === 0;

        const sqDiv = document.createElement('div');
        sqDiv.className = 'sq ' + (isLight ? 'light' : 'dark');
        sqDiv.dataset.sq = sqName;

        if (selectedSq === sqName) sqDiv.classList.add('selected');
        if (validMoves.some(m => m.to === sqName)) sqDiv.classList.add('highlight');

        const piece = board[r][c];
        if (piece) {
          const pSpan = document.createElement('span');
          pSpan.className = 'piece ' + piece.color;
          pSpan.textContent = PIECE_SYMBOLS[piece.type];
          sqDiv.appendChild(pSpan);
        }

        sqDiv.addEventListener('click', () => handleSqClick(sqName));
        chessGrid.appendChild(sqDiv);
      }
    }
  }

  /* ── Interaction ── */
  function handleSqClick(sq) {
    if (!isPlayerTurn || !gameActive) return;

    // If a square is already selected, try to move there
    if (selectedSq) {
      const isMoveValid = validMoves.find(m => m.to === sq);
      if (isMoveValid) {
        const result = game.move({ from: selectedSq, to: sq, promotion: 'q' });
        if (!result) {
          // Move was rejected by chess.js — deselect and let player retry
          selectedSq = null;
          validMoves = [];
          renderBoard();
          return;
        }
        selectedSq = null;
        validMoves = [];
        renderBoard();

        if (checkGameState()) return;

        isPlayerTurn = false;
        statusText.textContent = "AI is thinking\u2026";
        setTimeout(makeAIMove, 200);
        return;
      }
    }

    // Select a piece if it belongs to White
    const piece = game.get(sq);
    if (piece && piece.color === 'w') {
      selectedSq = sq;
      validMoves = game.moves({ square: sq, verbose: true });
    } else {
      selectedSq = null;
      validMoves = [];
    }
    renderBoard();
  }

  /* ── AI Move (async, non-blocking) ── */
  function makeAIMove() {
    if (!gameActive || game.game_over()) return;

    ChessEngine.getBestMoveAsync(game, difficulty).then(function (bestMove) {
      if (!gameActive) return;
      if (!bestMove) return;

      var result = game.move(bestMove);
      if (!result) {
        var fallback = game.moves();
        if (fallback.length > 0) game.move(fallback[0]);
      }
      renderBoard();

      if (!checkGameState()) {
        isPlayerTurn = true;
        statusText.textContent = game.in_check() ? "Check!" : "Your Turn!";
      }
    });
  }

  /* ── Game State ── */
  function checkGameState() {
    if (game.in_checkmate()) {
      endGame(game.turn() === 'b' ? 'win' : 'lose');
      return true;
    }
    if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
      endGame('draw');
      return true;
    }
    return false;
  }

  function endGame(result) {
    gameActive = false;
    statusText.textContent = "Game Over";

    setTimeout(() => {
      let pointsEarned = 0;
      if (result === 'win') {
        pointsEarned = POINTS[difficulty];
        score += pointsEarned;
        endEmoji.textContent = '🏆';
        endTitle.innerHTML = '<em>You Won!</em>';
        endMsg.textContent = 'Brilliant Checkmate! Ready for another round?';
        showDelta(pointsEarned);
      } else if (result === 'lose') {
        score = 0;
        endEmoji.textContent = '💀';
        endTitle.innerHTML = '<span class="bad">Checkmate!</span>';
        endMsg.textContent = 'The AI bested your king. Try again!';
      } else {
        endEmoji.textContent = '🤝';
        endTitle.innerHTML = '<em>Draw!</em>';
        endMsg.textContent = 'Stalemate or repetition. Go again!';
      }

      if (score > best) {
        best = score;
        localStorage.setItem('chess-best', best);
      }
      scoreEl.textContent = score;
      bestEl.textContent = best;

      endStats.innerHTML = result === 'win'
        ? '<div class="stat-pill"><div class="stat-val">+' + pointsEarned + '</div><div class="stat-lbl">Points</div></div>'
        : '';

      goOverlay.classList.remove('hidden');
    }, 800);
  }

  /* ── Start / Restart ── */
  function startGame() {
    screenStart.classList.add('hidden');
    goOverlay.classList.add('hidden');
    gameContent.style.display = 'flex';

    game.reset();
    gameActive = true;
    isPlayerTurn = true;
    selectedSq = null;
    validMoves = [];
    statusText.textContent = "Your Turn!";

    diffLabel.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    renderBoard();
  }

  /* ── Event Listeners ── */
  document.querySelectorAll('.diff-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.diff-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      difficulty = pill.dataset.diff;
      diffLabel.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
      score = 0;
      scoreEl.textContent = score;
    });
  });

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);

  /* ── Init ── */
  bestEl.textContent = best;
})();
