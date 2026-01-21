import React, { useState, useEffect, useRef } from 'react';

// --- ORIGINAL CONSTANTS ---
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
const WHITE_INITIAL = [15,16,17,18,19,24,25,26,27,28,29,35,36,37];
const BLACK_INITIAL = [73,74,75,81,82,83,84,85,86,91,92,93,94,95];
const FIREBASE_URL = 'https://abalone-game-c31e4-default-rtdb.europe-west1.firebasedatabase.app/';

// --- ORIGINAL LOGIC FUNCTIONS ---
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

export default function AbaloneGame() {
  // --- STATE (Original logic variables) ---
  const [gameId, setGameId] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);
  const [board, setBoard] = useState({});
  const [currentTurn, setCurrentTurn] = useState('black');
  const [selected, setSelected] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [players, setPlayers] = useState({ white: false, black: false });
  const [scores, setScores] = useState({ white: 0, black: 0 });
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollInterval = useRef(null);

  // --- PERSISTENCE & SYNC (Original logic) ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('game');
    if (id) {
      setGameId(id);
      const savedRole = localStorage.getItem(`abalone_role_${id}`);
      if (savedRole) setPlayerRole(savedRole);
      loadGame(id);
    }
  }, []);

  useEffect(() => {
    if (!gameId || !gameStarted) return;
    pollInterval.current = setInterval(() => loadGame(gameId), 2000);
    return () => clearInterval(pollInterval.current);
  }, [gameId, gameStarted]);

  async function loadGame(id) {
    try {
      const response = await fetch(`${FIREBASE_URL}/games/${id}.json`);
      const data = await response.json();
      if (data) {
        setBoard(data.board || {});
        setCurrentTurn(data.currentTurn || 'black');
        setPlayers(data.players || { white: false, black: false });
        setGameStarted(data.gameStarted || false);
        setScores(data.scores || { white: 0, black: 0 });
        setWinner(data.winner || null);
      }
    } catch (e) { console.error(e); }
  }

  async function saveGame(gameData) {
    try {
      await fetch(`${FIREBASE_URL}/games/${gameId}.json`, {
        method: 'PUT',
        body: JSON.stringify(gameData)
      });
    } catch (err) { console.error('Save failed:', err); }
  }

  // --- ACTIONS (Original logic) ---
  function createNewGame() {
    const id = generateGameId();
    window.location.href = `${window.location.origin}${window.location.pathname}?game=${id}`;
  }

  async function startGame() {
    if (!gameId) return;
    setLoading(true);
    const response = await fetch(`${FIREBASE_URL}/games/${gameId}.json`);
    const currentData = await response.json();
    const currentPlayers = currentData?.players || { white: false, black: false };
    
    let role = playerRole;
    if (!role) {
      if (!currentPlayers.black) role = 'black';
      else if (!currentPlayers.white) role = 'white';
      else { alert('Game is full!'); setLoading(false); return; }
    }

    setPlayerRole(role);
    localStorage.setItem(`abalone_role_${gameId}`, role);

    let newBoard = currentData?.board || {};
    if (Object.keys(newBoard).length === 0) {
      WHITE_INITIAL.forEach(c => newBoard[c] = 'white');
      BLACK_INITIAL.forEach(c => newBoard[c] = 'black');
    }

    const newPlayers = { ...currentPlayers, [role]: true };
    const gameData = {
      board: newBoard,
      currentTurn: currentData?.currentTurn || 'black',
      players: newPlayers,
      gameStarted: newPlayers.white && newPlayers.black,
      scores: currentData?.scores || { white: 0, black: 0 },
      winner: null
    };

    await saveGame(gameData);
    await loadGame(gameId);
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
      } else {
        setSelected([cell]);
      }
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
            moves.push({ dir, cells: newCells, type: 'push', pushed: pushCells, triggerCell: front });
          }
        }
      }
    }
    return moves;
  }

  async function makeMove(move) {
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

    const newWinner = newScores.white >= 6 ? 'white' : newScores.black >= 6 ? 'black' : null;

    await saveGame({
      board: newBoard, 
      currentTurn: opponentRole, 
      players, 
      gameStarted: true, 
      scores: newScores, 
      winner: newWinner
    });
    setSelected([]);
    await loadGame(gameId);
  }

  // --- UI MAPPING ---
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

  const standardRows = [
    [15,16,17,18,19],[24,25,26,27,28,29],[33,34,35,36,37,38,39],
    [42,43,44,45,46,47,48,49],[51,52,53,54,55,56,57,58,59],[61,62,63,64,65,66,67,68],
    [71,72,73,74,75,76,77],[81,82,83,84,85,86],[91,92,93,94,95]
  ];

  const displayRows = playerRole === 'white' 
    ? [...standardRows].reverse().map(r => [...r].reverse()) 
    : standardRows;

  // --- RENDER MODES ---
  if (!gameId) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0c] text-white">
      <h1 className="text-8xl font-black italic tracking-tighter mb-10 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-600">ABALONE</h1>
      <button onClick={createNewGame} className="px-12 py-6 bg-blue-600 rounded-2xl font-black text-xl hover:scale-105 transition-transform shadow-[0_0_40px_rgba(37,99,235,0.4)]">NEW ARENA</button>
    </div>
  );

  if (!gameStarted) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0c] text-white p-6">
      <div className="bg-[#16161a] p-12 rounded-[3rem] border border-white/5 text-center shadow-3xl">
        <h2 className="text-xs uppercase tracking-[0.4em] text-blue-500 font-black mb-2">Match Lobby</h2>
        <h1 className="text-4xl font-black mb-8 font-mono">{gameId}</h1>
        <button onClick={startGame} disabled={loading} className="w-full py-5 bg-white text-black rounded-2xl font-black text-lg hover:bg-blue-500 hover:text-white transition-all">
          {loading ? "CONNECTING..." : `JOIN AS ${players.black ? 'WHITE' : 'BLACK'}`}
        </button>
        <div className="mt-8 p-4 bg-black/40 rounded-xl border border-white/5">
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Share Link to Battle</p>
          <p className="text-xs font-mono opacity-40 break-all">{window.location.href}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0d10] text-slate-200 flex flex-col items-center p-4 lg:p-12 font-sans overflow-hidden">
      
      {/* HEADER: SCORES */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-12 bg-[#16161a] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <PlayerUI side="white" score={scores.white} isTurn={currentTurn === 'white'} isWinner={winner === 'white'} />
        <div className="flex flex-col items-center">
          <div className="text-[10px] tracking-[0.5em] text-slate-500 uppercase font-black mb-1">Status</div>
          <div className="text-sm font-black italic">{winner ? 'VICTORY' : 'IN BATTLE'}</div>
        </div>
        <PlayerUI side="black" score={scores.black} isTurn={currentTurn === 'black'} isWinner={winner === 'black'} />
      </div>

      {/* THE ARENA */}
      <div className="relative group">
        <div className="p-12 lg:p-16 bg-[#7d9c78] rounded-[6rem] shadow-[0_50px_100px_rgba(0,0,0,20)] border border-white/5">
          <div className="bg-[#65f7e4] p-10 rounded-full shadow-inner border-[6px] border-black/40">
            {displayRows.map((row, idx) => (
              <div key={idx} className="flex justify-center mb-2">
                {row.map(cell => {
                  const color = board[cell];
                  const isSel = selected.includes(cell);
                  const mv = moveMap[cell];
                  return (
                    <button 
                      key={cell} 
                      onClick={() => mv ? makeMove(mv) : handleCellClick(cell)}
                      className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full mx-1.5 transition-all relative duration-300
                        ${color === 'white' ? 'bg-gradient-to-br from-white to-slate-600 to-black shadow-2xl' : 
                          color === 'black' ? 'bg-gradient-to-br from-slate-600 to-black shadow-2xl' : 'bg-blue-600/30'}
                        ${isSel ? 'scale-110 ring-[4px] ring-blue-500 ring-offset-4 ring-offset-[#0a0a0c]' : ''}
                        ${mv ? 'cursor-pointer ring-2 ring-blue-400/50 scale-105' : ''}`}
                    >
                      {mv && (
                        <div className={`absolute inset-0 rounded-full animate-pulse flex items-center justify-center ${mv.type === 'push' ? 'bg-red-500/30' : 'bg-blue-400/30'}`}>
                          <span className="text-[10px]">{mv.type === 'push' ? '.' : '.'}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* WIN MODAL */}
        {winner && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center backdrop-blur-md bg-black/30 rounded-[6rem]">
            <div className="text-center">
              <h2 className="text-9xl font-black italic tracking-tighter drop-shadow-2xl text-white">
                {winner.toUpperCase()} WINS
              </h2>
              <button onClick={() => window.location.reload()} className="mt-12 px-14 py-5 bg-white text-black font-black rounded-full hover:scale-110 transition-transform">REMATCH</button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="mt-auto flex flex-col items-center gap-4">
        <button onClick={() => setSelected([])} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 transition-all">Clear Selection</button>
        <p className="text-[10px] font-black tracking-widest text-slate-600 uppercase">Playing as {playerRole}</p>
      </div>
    </div>
  );
}

function PlayerUI({ side, score, isTurn, isWinner }) {
  const isWhite = side === 'white';
  return (
    <div className={`flex items-center gap-6 transition-all duration-700 ${isTurn ? 'opacity-100 scale-105' : 'opacity-30 scale-95'}`}>
      {!isWhite && <div className="text-right">
        <div className="text-lg font-black tracking-tight">BLACK</div>
        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{isTurn ? 'Active' : 'Waiting'}</div>
      </div>}
      <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black border-[3px] shadow-2xl transition-all
        ${isWhite ? 'bg-white text-black border-white' : 'bg-[#25252b] text-white border-slate-700'}
        ${isTurn ? 'ring-[6px] ring-blue-500 ring-offset-8 ring-offset-[#16161a]' : ''}`}>
        {score}
      </div>
      {isWhite && <div className="text-left">
        <div className="text-lg font-black tracking-tight">WHITE</div>
        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{isTurn ? 'Active' : 'Waiting'}</div>
      </div>}
    </div>
  );
}
