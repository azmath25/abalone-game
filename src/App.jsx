import React, { useState, useEffect, useRef } from 'react';

// --- CONFIG ---
const CELLS = [
  15,16,17,18,19, 24,25,26,27,28,29, 33,34,35,36,37,38,39,
  42,43,44,45,46,47,48,49, 51,52,53,54,55,56,57,58,59,
  61,62,63,64,65,66,67,68, 71,72,73,74,75,76,77,
  81,82,83,84,85,86, 91,92,93,94,95
];
const CELL_SET = new Set(CELLS);
const WHITE_INITIAL = [15,16,17,18,19,24,25,26,27,28,29,35,36,37];
const BLACK_INITIAL = [73,74,75,81,82,83,84,85,86,91,92,93,94,95];
const FIREBASE_URL = 'https://abalone-game-c31e4-default-rtdb.europe-west1.firebasedatabase.app/';

// Helper
const isArithmeticSequence = (cells) => {
  if (cells.length <= 1) return true;
  const sorted = [...cells].sort((a,b) => a-b);
  const diff = sorted[1] - sorted[0];
  if (![1, 9, 10].includes(diff)) return false;
  return sorted.every((val, i) => i === 0 || val - sorted[i-1] === diff);
};

export default function AbaloneGame() {
  const [gameId, setGameId] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('abalone_user_name') || '');
  const [gameState, setGameState] = useState(null); // Start as null to show loading
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const pollInterval = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('game');
    if (id) {
      setGameId(id);
      setPlayerRole(localStorage.getItem(`abalone_role_${id}`));
      fetchGame(id);
    }
  }, []);

  useEffect(() => {
    if (gameId) {
      pollInterval.current = setInterval(() => fetchGame(gameId), 2000);
      return () => clearInterval(pollInterval.current);
    }
  }, [gameId]);

  async function fetchGame(id) {
    try {
      const response = await fetch(`${FIREBASE_URL}/games/${id}.json`);
      const data = await response.json();
      // Initialize state if Firebase is empty
      setGameState(data || { board: {}, currentTurn: 'black', players: {}, scores: {white:0, black:0} });
    } catch (e) { console.error("Fetch failed", e); }
  }

  async function updateFirebase(next) {
    await fetch(`${FIREBASE_URL}/games/${gameId}.json`, {
      method: 'PUT',
      body: JSON.stringify(next)
    });
    setGameState(next);
  }

  const handleJoin = async () => {
    if (!playerName.trim()) return alert("Name required");
    localStorage.setItem('abalone_user_name', playerName);
    setLoading(true);

    const players = gameState?.players || {};
    let role = playerRole;
    if (!role) {
      if (!players.black) role = 'black';
      else if (!players.white) role = 'white';
      else return alert("Full");
    }

    const board = Object.keys(gameState?.board || {}).length === 0 ? 
      Object.fromEntries([...WHITE_INITIAL.map(c => [c, 'white']), ...BLACK_INITIAL.map(c => [c, 'black'])]) : gameState.board;

    const nextState = {
      ...gameState,
      board,
      players: { ...players, [role]: { name: playerName, joined: true } },
      gameStarted: !!(players.black || role === 'black') && !!(players.white || role === 'white'),
      scores: gameState?.scores || {white: 0, black: 0}
    };

    setPlayerRole(role);
    localStorage.setItem(`abalone_role_${gameId}`, role);
    await updateFirebase(nextState);
    setLoading(false);
  };

  // --- LOGIC ---
  const moves = (() => {
    if (!gameState || selected.length === 0 || gameState.currentTurn !== playerRole) return [];
    const sorted = [...selected].sort((a,b) => a-b);
    const possible = [];
    [1, -1, 9, -9, 10, -10].forEach(dir => {
      const targetCells = sorted.map(c => c + dir);
      if (!targetCells.every(c => CELL_SET.has(c))) return;
      if (targetCells.every(c => !gameState.board[c] || selected.includes(c))) {
        possible.push({ dir, cells: targetCells, type: 'move' });
      } else if (selected.length > 1) {
        const diff = sorted[1] - sorted[0];
        if (dir === diff || dir === -diff) {
          const front = dir > 0 ? sorted[sorted.length - 1] : sorted[0];
          let pushed = [];
          let cur = front + dir;
          while (CELL_SET.has(cur) && gameState.board[cur] && gameState.board[cur] !== playerRole) {
            pushed.push(cur);
            cur += dir;
          }
          if (pushed.length > 0 && pushed.length < selected.length && (!CELL_SET.has(cur) || !gameState.board[cur])) {
            possible.push({ dir, cells: targetCells, type: 'push', pushed, triggerCell: front });
          }
        }
      }
    });
    return possible;
  })();

  const moveMap = {};
  moves.forEach(m => {
    const key = m.type === 'push' ? m.pushed[0] : m.cells.find(c => !selected.includes(c));
    if (key) moveMap[key] = m;
  });

  const executeMove = async (m) => {
    const b = { ...gameState.board };
    const s = { ...gameState.scores };
    const opp = playerRole === 'black' ? 'white' : 'black';
    if (m.type === 'push') {
      m.pushed.forEach(c => {
        delete b[c];
        if (CELL_SET.has(c + m.dir)) b[c + m.dir] = opp;
        else s[playerRole]++;
      });
    }
    selected.forEach(c => delete b[c]);
    m.cells.forEach(c => b[c] = playerRole);
    const win = s.white >= 6 ? 'white' : s.black >= 6 ? 'black' : null;
    await updateFirebase({ ...gameState, board: b, scores: s, winner: win, currentTurn: opp });
    setSelected([]);
  };

  if (!gameId) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
      <button onClick={() => window.location.href=`?game=${Math.random().toString(36).substring(2,10)}`} 
        className="px-12 py-6 bg-indigo-600 rounded-2xl font-bold">CREATE GAME</button>
    </div>
  );

  if (!gameState) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading Arena...</div>;

  const standardRows = [[15,16,17,18,19],[24,25,26,27,28,29],[33,34,35,36,37,38,39],[42,43,44,45,46,47,48,49],[51,52,53,54,55,56,57,58,59],[61,62,63,64,65,66,67,68],[71,72,73,74,75,76,77],[81,82,83,84,85,86],[91,92,93,94,95]];
  const displayRows = playerRole === 'white' ? [...standardRows].reverse().map(r => [...r].reverse()) : standardRows;

  return (
    <div className="min-h-screen bg-[#0d0d10] text-slate-200 flex flex-col items-center p-4">
      
      {/* HUD */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8 bg-[#16161a] p-6 rounded-3xl border border-white/5">
        <div className={`flex flex-col ${gameState.currentTurn === 'white' ? 'opacity-100 scale-105' : 'opacity-40'}`}>
           <span className="text-2xl font-black">W: {gameState.scores?.white || 0}</span>
           <span className="text-xs">{gameState.players?.white?.name || 'Waiting...'}</span>
        </div>
        <div className="text-indigo-500 font-bold tracking-widest text-xs">ABALONE</div>
        <div className={`flex flex-col items-end ${gameState.currentTurn === 'black' ? 'opacity-100 scale-105' : 'opacity-40'}`}>
           <span className="text-2xl font-black">B: {gameState.scores?.black || 0}</span>
           <span className="text-xs">{gameState.players?.black?.name || 'Waiting...'}</span>
        </div>
      </div>

      {/* BOARD */}
      <div className="relative p-8 bg-[#1a1a1e] rounded-[4rem] shadow-2xl">
        <div className="bg-black p-6 rounded-full">
          {displayRows.map((row, idx) => (
            <div key={idx} className="flex justify-center mb-2">
              {row.map(cell => {
                const color = gameState.board[cell];
                const isSel = selected.includes(cell);
                const mv = moveMap[cell];
                return (
                  <button key={cell} onClick={() => mv ? executeMove(mv) : (color === playerRole && (isSel ? setSelected(selected.filter(c => c !== cell)) : (selected.length < 3 && isArithmeticSequence([...selected, cell]) ? setSelected([...selected, cell]) : setSelected([cell]))))}
                    className={`w-10 h-10 lg:w-14 lg:h-14 rounded-full mx-1 transition-all relative
                      ${color === 'white' ? 'bg-white shadow-lg' : color === 'black' ? 'bg-slate-700 shadow-xl' : 'bg-slate-900/40'}
                      ${isSel ? 'ring-4 ring-indigo-500 scale-110 z-10' : ''}
                      ${mv ? 'ring-2 ring-blue-400 animate-pulse' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* JOIN OVERLAY */}
        {!playerRole && (
          <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-xl bg-black/40 rounded-[4rem]">
            <div className="bg-[#1a1a1e] p-10 rounded-3xl border border-white/10 text-center">
              <input type="text" placeholder="Name" value={playerName} onChange={e => setPlayerName(e.target.value)}
                className="w-full p-4 mb-4 rounded-xl bg-black text-white text-center border border-white/5" />
              <button onClick={handleJoin} className="w-full py-4 bg-indigo-600 rounded-xl font-bold">{loading ? "JOINING..." : "JOIN GAME"}</button>
            </div>
          </div>
        )}

        {/* WIN OVERLAY */}
        {gameState.winner && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center backdrop-blur-md bg-black/40 rounded-[4rem]">
             <div className="text-center">
                <h2 className="text-6xl font-black mb-6 text-white italic">{gameState.winner.toUpperCase()} WINS</h2>
                <button onClick={() => window.location.reload()} className="px-10 py-4 bg-white text-black font-bold rounded-full">REMATCH</button>
             </div>
          </div>
        )}
      </div>

      {/* SHARE */}
      <div className="mt-10 p-4 bg-[#16161a] rounded-xl border border-white/5 flex gap-4">
        <input readOnly value={window.location.href} className="bg-transparent text-[10px] opacity-30 outline-none w-48" />
        <button onClick={() => {navigator.clipboard.writeText(window.location.href); alert("Copied!");}} className="text-[10px] font-bold text-indigo-400">COPY LINK</button>
      </div>
    </div>
  );
}
