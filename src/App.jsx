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

const FIREBASE_URL = 'https://abalone-game-c31e4-default-rtdb.europe-west1.firebasedatabase.app/';

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

async function saveGameToFirebase(gameId, gameData) {
  try {
    await fetch(`${FIREBASE_URL}/games/${gameId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData)
    });
  } catch (err) { console.error('Save failed:', err); }
}

async function loadGameFromFirebase(gameId) {
  try {
    const response = await fetch(`${FIREBASE_URL}/games/${gameId}.json`);
    return await response.json();
  } catch (err) { return null; }
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
  const pollInterval = useRef(null);

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
    const data = await loadGameFromFirebase(id);
    if (data) {
      setBoard(data.board || {});
      setCurrentTurn(data.currentTurn || 'black');
      setPlayers(data.players || { white: false, black: false });
      setGameStarted(data.gameStarted || false);
      setScores(data.scores || { white: 0, black: 0 });
      setWinner(data.winner || null);
    }
  }

  function createNewGame() {
    const id = generateGameId();
    window.location.href = `${window.location.origin}${window.location.pathname}?game=${id}`;
  }

  async function startGame() {
    if (!gameId) return;
    setLoading(true);
    const currentData = await loadGameFromFirebase(gameId);
    const currentPlayers = currentData?.players || { white: false, black: false };
    
    let role = playerRole;
    if (!role) {
      if (!currentPlayers.black) role = 'black';
      else if (!currentPlayers.white) role = 'white';
      else { setMessage('Game is full!'); setLoading(false); return; }
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

    await saveGameToFirebase(gameId, gameData);
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

    const newTurn = currentTurn === 'black' ? 'white' : 'black';
    const newWinner = newScores.white >= 6 ? 'white' : newScores.black >= 6 ? 'black' : null;

    await saveGameToFirebase(gameId, {
      ...players, board: newBoard, currentTurn: newTurn, players, 
      gameStarted: true, scores: newScores, winner: newWinner
    });
    setSelected([]);
    await loadGame(gameId);
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

  const standardRows = [
    [15,16,17,18,19],[24,25,26,27,28,29],[33,34,35,36,37,38,39],
    [42,43,44,45,46,47,48,49],[51,52,53,54,55,56,57,58,59],[61,62,63,64,65,66,67,68],
    [71,72,73,74,75,76,77],[81,82,83,84,85,86],[91,92,93,94,95]
  ];

  const displayRows = playerRole === 'white' 
    ? [...standardRows].reverse().map(r => [...r].reverse()) 
    : standardRows;

  if (!gameId) return (
    <div className="flex items-center justify-center min-h-screen bg-green-800">
      <button onClick={createNewGame} className="px-8 py-4 bg-amber-600 text-white font-bold rounded-lg shadow-xl">CREATE NEW ABALONE GAME</button>
    </div>
  );

  if (!gameStarted) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-800 p-4 text-white">
      <h1 className="text-2xl mb-4">Lobby ID: {gameId}</h1>
      <button onClick={startGame} disabled={loading} className="px-6 py-3 bg-blue-600 rounded">JOIN AS {players.black ? 'WHITE' : 'BLACK'}</button>
      <p className="mt-4">Share URL with opponent</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-900 p-5 font-sans">
      <div className="bg-amber-900 p-7 rounded-3xl shadow-2xl border-8 border-amber-800">
        <div className="flex justify-between text-white font-bold mb-4 bg-amber-950 p-3 rounded-xl">
          <div className={currentTurn === 'white' ? 'ring-2 ring-white rounded p-1' : ''}>⚪ {scores.white}</div>
          <div>{winner ? 'GAME OVER' : `${currentTurn.toUpperCase()}'S TURN`}</div>
          <div className={currentTurn === 'black' ? 'ring-2 ring-black rounded p-1' : ''}>⚫ {scores.black}</div>
        </div>

        <div className="bg-green-700 p-4 rounded-full border-4 border-green-600 shadow-inner">
          {displayRows.map((row, idx) => (
            <div key={idx} className="flex justify-center mb-1">
              {row.map(cell => {
                const isSel = selected.includes(cell);
                const color = board[cell];
                const mv = moveMap[cell];
                return (
                  <button key={cell} onClick={() => mv ? makeMove(mv) : handleCellClick(cell)}
                    className={`w-9 h-9 rounded-full mx-0.5 border-2 transition-all relative
                      ${color === 'white' ? 'bg-slate-100 border-slate-300 shadow-md' : 
                        color === 'black' ? 'bg-slate-900 border-slate-700 shadow-md' : 'bg-green-800 border-green-900 opacity-40'}
                      ${isSel ? 'scale-110 ring-4 ring-yellow-400 z-10' : ''}
                      ${mv ? 'cursor-pointer hover:brightness-125' : ''}`}>
                    {mv && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`w-full h-full rounded-full animate-pulse opacity-40 ${mv.type === 'push' ? 'bg-red-500' : 'bg-blue-400'}`} />
                        <span className="text-xs">{mv.type === 'push' ? '💥' : '🎯'}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <button onClick={() => setSelected([])} className="w-full mt-4 py-2 bg-amber-700 text-amber-100 rounded-lg text-xs uppercase tracking-widest font-bold">Clear Selection</button>
        <p className="text-center text-[10px] text-amber-600 mt-2 uppercase">Playing as {playerRole}</p>
      </div>
    </div>
  );
}

export default AbaloneGame;
