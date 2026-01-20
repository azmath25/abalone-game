import React, { useState, useEffect, useRef } from 'react';

// --- CONFIG & CONSTANTS ---
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

export default function AbaloneGame() {
  const [gameId, setGameId] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('abalone_user_name') || '');
  const [gameState, setGameState] = useState({
    board: {}, currentTurn: 'black', players: {white: null, black: null}, gameStarted: false, scores: {white:0, black:0}, winner: null
  });
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const pollInterval = useRef(null);

  // --- INITIALIZATION & POLLING ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('game');
    if (id) {
      setGameId(id);
      const savedRole = localStorage.getItem(`abalone_role_${id}`);
      if (savedRole) setPlayerRole(savedRole);
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
      if (data) setGameState(data);
    } catch (e) { console.error("Sync Error", e); }
  }

  // Uses a functional update to ensure we never overwrite with old state
  async function updateFirebase(updateFn) {
    setGameState(prevState => {
      const nextState = updateFn(prevState);
      fetch(`${FIREBASE_URL}/games/${gameId}.json`, {
        method: 'PUT',
        body: JSON.stringify(nextState)
      });
      return nextState;
    });
  }

  // --- LOBBY LOGIC ---
  const handleJoin = async () => {
    if (!playerName.trim()) return alert("Enter your name!");
    localStorage.setItem('abalone_user_name', playerName);
    setLoading(true);

    let role = playerRole;
    if (!role) {
      if (!gameState.players.black) role = 'black';
      else if (!gameState.players.white) role = 'white';
      else { alert("Lobby full!"); setLoading(false); return; }
    }

    setPlayerRole(role);
    localStorage.setItem(`abalone_role_${gameId}`, role);

    await updateFirebase(prev => {
      const newBoard = Object.keys(prev.board || {}).length === 0 ? 
        Object.fromEntries([...WHITE_INITIAL.map(c => [c, 'white']), ...BLACK_INITIAL.map(c => [c, 'black'])]) : prev.board;
      
      const newPlayers = { ...prev.players, [role]: { name: playerName, joined: true } };
      return {
        ...prev,
        board: newBoard,
        players: newPlayers,
        gameStarted: !!(newPlayers.white?.joined && newPlayers.black?.joined)
      };
    });
    setLoading(false);
  };

  const handleRematch = async () => {
    const newRole = playerRole === 'black' ? 'white' : 'black';
    setPlayerRole(newRole);
    localStorage.setItem(`abalone_role_${gameId}`, newRole);

    await updateFirebase(prev => ({
      ...prev,
      board: Object.fromEntries([...WHITE_INITIAL.map(c => [c, 'white']), ...BLACK_INITIAL.map(c => [c, 'black'])]),
      scores: {white: 0, black: 0},
      winner: null,
      currentTurn: prev.winner === 'black' ? 'white' : 'black' // Loser usually starts or simple toggle
    }));
    setSelected([]);
  };

  // --- MOVE CALCULATION ---
  const moves = (() => {
    if (selected.length === 0 || gameState.currentTurn !== playerRole || gameState.winner) return [];
    const sorted = [...selected].sort((a,b) => a-b);
    const possible = [];
    [1, -1, 9, -9, 10, -10].forEach(dir => {
      const newCells = sorted.map(c => c + dir);
      if (!newCells.every(c => CELL_SET.has(c))) return;

      if (newCells.every(c => !gameState.board[c] || selected.includes(c))) {
        possible.push({ dir, cells: newCells, type: 'move' });
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
            possible.push({ dir, cells: newCells, type: 'push', pushed, triggerCell: front });
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
    await updateFirebase(prev => {
      const b = { ...prev.board };
      const s = { ...prev.scores };
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
      
      return {
        ...prev,
        board: b,
        scores: s,
        winner: s.white >= 6 ? 'white' : s.black >= 6 ? 'black' : null,
        currentTurn: opp
      };
    });
    setSelected([]);
  };

  // --- RENDER CONFIG ---
  const standardRows = [[15,16,17,18,19],[24,25,26,27,28,29],[33,34,35,36,37,38,39],[42,43,44,45,46,47,48,49],[51,52,53,54,55,56,57,58,59],[61,62,63,64,65,66,67,68],[71,72,73,74,75,76,77],[81,82,83,84,85,86],[91,92,93,94,95]];
  const displayRows = playerRole === 'white' ? [...standardRows].reverse().map(r => [...r].reverse()) : standardRows;

  if (!gameId) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
      <h1 className="text-8xl font-black mb-12 tracking-tighter italic">ABALONE</h1>
      <button onClick={() => window.location.href=`?game=${Math.random().toString(36).substring(2,10)}`} 
        className="px-12 py-6 bg-indigo-600 rounded-2xl font-bold shadow-2xl hover:bg-indigo-500 transition-all">
        START NEW ARENA
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0d10] text-slate-200 flex flex-col items-center p-4 lg:p-12 font-sans overflow-hidden">
      
      {/* HEADER: PLAYER HUD */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-12 bg-[#16161a] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <PlayerCard side="white" name={gameState.players.white?.name} score={gameState.scores.white} isTurn={gameState.currentTurn === 'white'} isWinner={gameState.winner === 'white'} />
        <div className="flex flex-col items-center">
          <div className="text-[10px] tracking-[0.5em] text-slate-500 uppercase font-black mb-1">VS</div>
          <div className="h-px w-12 bg-slate-800" />
        </div>
        <PlayerCard side="black" name={gameState.players.black?.name} score={gameState.scores.black} isTurn={gameState.currentTurn === 'black'} isWinner={gameState.winner === 'black'} />
      </div>

      {/* ARENA BOARDSIDE */}
      <div className="relative group">
        <div className="p-12 lg:p-16 bg-[#1a1a1e] rounded-[6rem] shadow-[0_50px_100px_rgba(0,0,0,0.9)] border border-white/5">
          <div className="bg-[#0a0a0c] p-10 rounded-full shadow-inner border-[6px] border-black/40">
            {displayRows.map((row, idx) => (
              <div key={idx} className="flex justify-center mb-2">
                {row.map(cell => {
                  const color = gameState.board[cell];
                  const isSel = selected.includes(cell);
                  const mv = moveMap[cell];
                  return (
                    <button 
                      key={cell} 
                      onClick={() => mv ? executeMove(mv) : (playerRole && !gameState.winner && color === playerRole && setSelected(prev => prev.includes(cell) ? prev.filter(c => c !== cell) : (prev.length < 3 && isArithmeticSequence([...prev, cell]) ? [...prev, cell] : [cell])))}
                      className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full mx-1.5 transition-all relative duration-300
                        ${color === 'white' ? 'bg-gradient-to-br from-white to-slate-300 shadow-xl' : 
                          color === 'black' ? 'bg-gradient-to-br from-slate-600 to-black shadow-2xl' : 'bg-slate-900/30'}
                        ${isSel ? 'scale-110 ring-[4px] ring-indigo-500 ring-offset-4 ring-offset-[#0a0a0c]' : ''}
                        ${mv ? 'cursor-pointer ring-2 ring-indigo-400/40 scale-105 hover:brightness-125' : ''}`}
                    >
                      {mv && <div className={`absolute inset-0 rounded-full animate-pulse ${mv.type === 'push' ? 'bg-red-500/20' : 'bg-indigo-400/20'}`} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* JOIN MODAL */}
        {!playerRole && (
          <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-2xl bg-black/60 rounded-[6rem]">
            <div className="bg-[#1a1a1e] p-12 rounded-[3rem] border border-white/10 shadow-3xl text-center w-full max-w-sm">
              <h2 className="text-3xl font-black mb-8 italic tracking-tighter">IDENTIFY</h2>
              <input type="text" placeholder="Enter Name" value={playerName} onChange={e => setPlayerName(e.target.value)}
                className="w-full p-5 mb-6 rounded-2xl bg-black text-center border border-white/5 focus:border-indigo-500 outline-none transition-all" />
              <button onClick={handleJoin} className="w-full py-5 bg-indigo-600 rounded-2xl font-black text-lg tracking-widest">{loading ? "JOINING..." : "ENTER ARENA"}</button>
            </div>
          </div>
        )}

        {/* WIN MODAL */}
        {gameState.winner && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center backdrop-blur-md bg-black/30 rounded-[6rem]">
            <div className="text-center">
              <h2 className={`text-9xl font-black italic tracking-tighter drop-shadow-2xl ${gameState.winner === playerRole ? 'text-indigo-400' : 'text-slate-600'}`}>
                {gameState.winner === playerRole ? "VICTORY" : "DEFEAT"}
              </h2>
              <button onClick={handleRematch} className="mt-12 px-14 py-5 bg-white text-black font-black rounded-full hover:scale-110 transition-transform shadow-2xl">PLAY AGAIN</button>
            </div>
          </div>
        )}
      </div>

      {/* SHAREABLE FOOTER */}
      <div className="mt-auto w-full max-w-md pt-12">
        <div className="bg-[#16161a] p-3 rounded-2xl border border-white/5 flex items-center shadow-lg">
          <input readOnly value={window.location.href} className="flex-1 bg-transparent px-4 text-[10px] font-mono opacity-40 overflow-hidden text-ellipsis outline-none" />
          <button onClick={() => {navigator.clipboard.writeText(window.location.href); alert("Copied!");}}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">Copy Link</button>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ side, name, score, isTurn, isWinner }) {
  const isWhite = side === 'white';
  return (
    <div className={`flex items-center gap-6 transition-all duration-700 ${isTurn ? 'opacity-100 scale-105' : 'opacity-30 scale-95'}`}>
      {!isWhite && <div className="text-right">
        <div className="text-lg font-black tracking-tight">{name || "Waiting..."}</div>
        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{isTurn ? 'Active Turn' : 'Waiting'}</div>
        {isWinner && <div className="text-[10px] font-black text-yellow-500 mt-1 animate-pulse">🏆 GOLDEN VICTOR</div>}
      </div>}
      <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black border-[3px] shadow-2xl transition-all duration-500
        ${isWhite ? 'bg-white text-black border-white' : 'bg-[#25252b] text-white border-slate-700'}
        ${isTurn ? 'ring-[6px] ring-indigo-500 ring-offset-8 ring-offset-[#16161a]' : ''}`}>
        {score}
      </div>
      {isWhite && <div className="text-left">
        <div className="text-lg font-black tracking-tight">{name || "Waiting..."}</div>
        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{isTurn ? 'Active Turn' : 'Waiting'}</div>
        {isWinner && <div className="text-[10px] font-black text-yellow-500 mt-1 animate-pulse">🏆 GOLDEN VICTOR</div>}
      </div>}
    </div>
  );
}
