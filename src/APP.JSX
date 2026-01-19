import React, { useState, useEffect, useRef } from 'react';

// All valid cell positions on the board
const CELLS = [
  15,16,17,18,19,
  24,25,26,27,28,29,
  33,34,35,36,37,38,39,
  42,43,44,45,46,47,48,49,
  51,52,53,54,55,56,57,58,59,
  61,62,63,64,65,66,67,68,
  71,72,73,74,75,76,77,
  81,82,83,84,85,86,
  91,92,93,94,95
];

const CELL_SET = new Set(CELLS);

// Initial positions
const WHITE_INITIAL = [15,16,17,18,19,24,25,26,27,28,29,35,36,37];
const BLACK_INITIAL = [73,74,75,81,82,83,84,85,86,91,92,93,94,95];

function getNeighbors(cell) {
  const neighbors = [];
  const candidates = [cell-1, cell+1, cell-9, cell+9, cell-10, cell+10];
  for (let c of candidates) {
    if (CELL_SET.has(c)) neighbors.push(c);
  }
  return neighbors;
}

function isArithmeticSequence(cells) {
  if (cells.length <= 1) return true;
  const sorted = [...cells].sort((a,b) => a-b);
  const diff = sorted[1] - sorted[0];
  if (![1, 9, 10].includes(diff)) return false;
  for (let i = 2; i < sorted.length; i++) {
    if (sorted[i] - sorted[i-1] !== diff) return false;
  }
  return true;
}

function generateGameId() {
  return Math.random().toString(36).substring(2, 10);
}

function AbaloneGame() {
  const [gameId, setGameId] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);
  const [board, setBoard] = useState({});
  const [currentTurn, setCurrentTurn] = useState('black');
  const [selected, setSelected] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [players, setPlayers] = useState({ white: false, black: false });
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState({ white: 0, black: 0 });
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('game');
    if (id) {
      setGameId(id);
      const savedRole = localStorage.getItem(`abalone_role_${id}`);
      if (savedRole) setPlayerRole(savedRole);
    }
  }, []);

  function createNewGame() {
    const id = generateGameId();
    window.location.href = `${window.location.origin}${window.location.pathname}?game=${id}`;
  }

  async function startGame() {
    if (!gameId) return;
    setLoading(true);
    
    let role = playerRole;
    if (!role) {
      if (!players.black) role = 'black';
      else if (!players.white) role = 'white';
      else { setMessage('Game is full!'); setLoading(false); return; }
    }

    setPlayerRole(role);
    localStorage.setItem(`abalone_role_${gameId}`, role);

    let newBoard = {};
    if (Object.keys(board).length === 0) {
      WHITE_INITIAL.forEach(c => newBoard[c] = 'white');
      BLACK_INITIAL.forEach(c => newBoard[c] = 'black');
    }

    const newPlayers = { ...players, [role]: true };
    setPlayers(newPlayers);
    setBoard(newBoard);
    setGameStarted(newPlayers.white && newPlayers.black);
    setLoading(false);
  }

  function handleCellClick(cell) {
    if (winner || !playerRole || (gameStarted && currentTurn !== playerRole)) return;
    const cellColor = board[cell];
    if (selected.includes(cell)) {
      setSelected(selected.filter(c => c !== cell));
      return;
    }
    if (cellColor === playerRole) {
      if (selected.length === 0) setSelected([cell]);
      else if (selected.length < 3) {
        const sortedPlus = [...selected, cell].sort((a,b)=>a-b);
        if (isArithmeticSequence(sortedPlus)) setSelected(sortedPlus);
        else setMessage('Must form a line!');
      } else setMessage('Max 3 balls!');
    }
  }

  function getPossibleMoves() {
    if (selected.length === 0) return [];
    const sorted = [...selected].sort((a,b) => a-b);
    const moves = [];
    const directions = [1, -1, 9, -9, 10, -10];

    for (let dir of directions) {
      const newCells = sorted.map(c => c + dir);
      if (!newCells.every(c => CELL_SET.has(c))) continue;

      if (newCells.every(c => !board[c] || selected.includes(c))) {
        moves.push({ dir, cells: newCells, type: 'move' });
        continue;
      }

      const diff = sorted.length > 1 ? sorted[1] - sorted[0] : null;
      if (diff && (dir === diff || dir === -diff)) {
        const front = dir > 0 ? sorted[sorted.length - 1] : sorted[0];
        let pushCells = [];
        let current = front + dir;
        while (CELL_SET.has(current) && board[current] && board[current] !== playerRole) {
          pushCells.push(current);
          current += dir;
        }
        if (pushCells.length > 0 && pushCells.length < selected.length) {
          if (!CELL_SET.has(current) || !board[current]) {
            moves.push({ dir, cells: newCells, type: 'push', pushed: pushCells, pushTo: current, triggerCell: front });
          }
        }
      }
    }
    return moves;
  }

  function makeMove(move) {
    const newBoard = { ...board };
    let newScores = { ...scores };
    const opponentRole = playerRole === 'black' ? 'white' : 'black';

    if (move.type === 'push') {
      move.pushed.forEach(c => delete newBoard[c]);
      move.pushed.forEach(c => {
        const target = c + move.dir;
        if (CELL_SET.has(target)) newBoard[target] = opponentRole;
        else newScores[playerRole] += 1;
      });
    }

    selected.forEach(c => delete newBoard[c]);
    move.cells.forEach(c => newBoard[c] = playerRole);

    const newTurn = currentTurn === 'black' ? 'white' : 'black';
    const newWinner = newScores.white >= 6 ? 'white' : newScores.black >= 6 ? 'black' : null;

    setBoard(newBoard);
    setCurrentTurn(newTurn);
    setScores(newScores);
    setWinner(newWinner);
    setSelected([]);
  }

  const moves = getPossibleMoves();
  const moveMap = {};
  moves.forEach(m => {
    if (m.type === 'push') {
      moveMap[m.pushed[0]] = m;
      moveMap[m.triggerCell] = m;
    } else {
      const target = m.cells.find(c => !selected.includes(c));
      if (target) moveMap[target] = m;
    }
  });

  // Get ghost positions for hologram effect
  const ghostPositions = {};
  moves.forEach(m => {
    if (m.type === 'move') {
      m.cells.forEach(cell => {
        if (!selected.includes(cell)) {
          ghostPositions[cell] = playerRole;
        }
      });
    }
  });

  // Get pushable enemy balls
  const pushableEnemies = new Set();
  moves.forEach(m => {
    if (m.type === 'push') {
      m.pushed.forEach(c => pushableEnemies.add(c));
    }
  });

  const standardRows = [
    [15,16,17,18,19],[24,25,26,27,28,29],[33,34,35,36,37,38,39],
    [42,43,44,45,46,47,48,49],[51,52,53,54,55,56,57,58,59],[61,62,63,64,65,66,67,68],
    [71,72,73,74,75,76,77],[81,82,83,84,85,86],[91,92,93,94,95]
  ];

  const displayRows = playerRole === 'white' 
    ? [...standardRows].reverse().map(r => [...r].reverse()) 
    : standardRows;

  if (!gameId) return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950">
      <button onClick={createNewGame} className="px-10 py-5 bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 hover:shadow-amber-500/50">
        CREATE NEW ABALONE GAME
      </button>
    </div>
  );

  if (!gameStarted) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 p-4 text-white">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-700">
        <h1 className="text-3xl mb-6 font-bold text-center bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">Lobby ID: {gameId}</h1>
        <button onClick={startGame} disabled={loading} className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl text-lg font-bold shadow-lg hover:shadow-blue-500/50 transition-all">
          JOIN AS {players.black ? 'WHITE' : 'BLACK'}
        </button>
        <p className="mt-6 text-center text-slate-400 text-sm">Share this URL with your opponent</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 p-4 font-sans">
      <style>{`
        @keyframes bloom-pulse {
          0%, 100% { box-shadow: 0 0 20px 8px currentColor, 0 0 40px 12px currentColor; }
          50% { box-shadow: 0 0 30px 12px currentColor, 0 0 60px 18px currentColor; }
        }
        @keyframes vibrate {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1px, 0); }
          20% { transform: translate(1px, 0); }
          30% { transform: translate(-1px, 0); }
          40% { transform: translate(1px, 0); }
          50% { transform: translate(0, 0); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 10px 3px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 20px 6px rgba(239, 68, 68, 0.7); }
        }
        .bloom-white {
          animation: bloom-pulse 2s ease-in-out infinite;
          color: rgba(248, 250, 252, 0.8);
        }
        .bloom-black {
          animation: bloom-pulse 2s ease-in-out infinite;
          color: rgba(71, 85, 105, 0.8);
        }
        .vibrate {
          animation: vibrate 0.5s ease-in-out infinite;
        }
        .pulse-vulnerable {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }
        .socket-shadow {
          background: radial-gradient(circle at 40% 40%, rgba(34, 197, 94, 0.2), rgba(21, 128, 61, 0.5) 40%, rgba(20, 83, 45, 0.9));
          box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(255, 255, 255, 0.1);
        }
        .pebble-white {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
          box-shadow: 
            0 2px 4px rgba(0, 0, 0, 0.1),
            inset 0 -2px 4px rgba(0, 0, 0, 0.1),
            inset 0 2px 4px rgba(255, 255, 255, 0.7);
        }
        .pebble-black {
          background: linear-gradient(135deg, #334155 0%, #1e293b 50%, #0f172a 100%);
          box-shadow: 
            0 4px 8px rgba(0, 0, 0, 0.4),
            inset 0 -2px 4px rgba(255, 255, 255, 0.1),
            inset 0 2px 6px rgba(0, 0, 0, 0.8);
        }
        .ghost-hologram {
          opacity: 0.35;
          filter: blur(0.5px);
        }
      `}</style>

      <div className="bg-gradient-to-br from-amber-900 via-amber-950 to-amber-900 p-8 rounded-3xl shadow-2xl border-8 border-amber-800">
        <div className="flex justify-between text-white font-bold mb-6 bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-2xl shadow-inner">
          <div className={`px-3 py-1 rounded-lg ${currentTurn === 'white' ? 'bg-slate-700 ring-2 ring-white' : ''}`}>
            ⚪ {scores.white}
          </div>
          <div className="text-amber-400">{winner ? 'GAME OVER' : `${currentTurn.toUpperCase()}'S TURN`}</div>
          <div className={`px-3 py-1 rounded-lg ${currentTurn === 'black' ? 'bg-slate-700 ring-2 ring-slate-400' : ''}`}>
            ⚫ {scores.black}
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900 p-6 rounded-full border-4 border-emerald-700 shadow-2xl" style={{ transform: 'scale(1.15)' }}>
          {displayRows.map((row, idx) => (
            <div key={idx} className="flex justify-center mb-1.5">
              {row.map(cell => {
                const isSel = selected.includes(cell);
                const color = board[cell];
                const mv = moveMap[cell];
                const isGhost = ghostPositions[cell] && !color;
                const isPushable = pushableEnemies.has(cell);
                
                return (
                  <div key={cell} className="relative">
                    <button 
                      onClick={() => mv ? makeMove(mv) : handleCellClick(cell)}
                      className={`w-12 h-12 rounded-full mx-1 border-2 transition-all relative
                        ${!color && !isGhost ? 'socket-shadow border-emerald-950' : ''}
                        ${color === 'white' ? 'pebble-white border-slate-200' : ''}
                        ${color === 'black' ? 'pebble-black border-slate-900' : ''}
                        ${isSel && color === 'white' ? 'bloom-white scale-110 z-20' : ''}
                        ${isSel && color === 'black' ? 'bloom-black scale-110 z-20' : ''}
                        ${isPushable ? 'vibrate pulse-vulnerable' : ''}
                        ${mv ? 'cursor-pointer hover:brightness-110' : ''}`}
                    />
                    
                    {isGhost && (
                      <div className={`absolute inset-0 w-12 h-12 rounded-full pointer-events-none ghost-hologram
                        ${ghostPositions[cell] === 'white' ? 'pebble-white border-2 border-slate-200' : 'pebble-black border-2 border-slate-900'}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        <button onClick={() => setSelected([])} className="w-full mt-6 py-3 bg-gradient-to-r from-amber-700 to-amber-800 text-amber-100 rounded-xl text-sm uppercase tracking-widest font-bold shadow-lg hover:shadow-amber-700/50 transition-all">
          Clear Selection
        </button>
        <p className="text-center text-xs text-amber-500 mt-3 uppercase tracking-wider">Playing as {playerRole}</p>
      </div>
    </div>
  );
}

export default AbaloneGame;
