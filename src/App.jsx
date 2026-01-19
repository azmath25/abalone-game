import React, { useState, useEffect, useRef } from 'react';

// All valid cell positions on the board
const CELLS = [
  11,12,13,14,15,
  21,22,23,24,25,26,
  31,32,33,34,35,36,37,
  41,42,43,44,45,46,47,48,
  51,52,53,54,55,56,57,58,59,
  61,62,63,64,65,66,67,68,
  71,72,73,74,75,76,77,
  81,82,83,84,85,86,
  91,92,93,94,95
];

const CELL_SET = new Set(CELLS);

// Initial positions
const WHITE_INITIAL = [11,12,13,14,15,21,22,23,24,25,26,33,34,35];
const BLACK_INITIAL = [73,74,75,81,82,83,84,85,86,91,92,93,94,95];

// Firebase config - REPLACE WITH YOUR OWN
const FIREBASE_URL = 'https://abalone-game-c31e4-default-rtdb.europe-west1.firebasedatabase.app/';

// Get neighbors (differ by 1, 9, or 11)
function getNeighbors(cell) {
  const neighbors = [];
  const candidates = [cell-1, cell+1, cell-9, cell+9, cell-11, cell+11];
  for (let c of candidates) {
    if (CELL_SET.has(c)) neighbors.push(c);
  }
  return neighbors;
}

// Check if cells form arithmetic sequence with valid differences (±1, ±9, ±11)
function isArithmeticSequence(cells) {
  if (cells.length <= 1) return true;
  const sorted = [...cells].sort((a,b) => a-b);
  const diff = sorted[1] - sorted[0];
  
  // Difference must be 1, 9, or 11
  if (![1, 9, 11].includes(diff)) return false;
  
  for (let i = 2; i < sorted.length; i++) {
    if (sorted[i] - sorted[i-1] !== diff) return false;
  }
  return true;
}

// Generate game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 10);
}

// Firebase API helpers
async function saveGameToFirebase(gameId, gameData) {
  try {
    const response = await fetch(`${FIREBASE_URL}/games/${gameId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData)
    });
    return await response.json();
  } catch (err) {
    console.error('Save failed:', err);
  }
}

async function loadGameFromFirebase(gameId) {
  try {
    const response = await fetch(`${FIREBASE_URL}/games/${gameId}.json`);
    return await response.json();
  } catch (err) {
    console.error('Load failed:', err);
    return null;
  }
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
  const [destroyed, setDestroyed] = useState(false);
  const [loading, setLoading] = useState(false);
  const keySequence = useRef([]);
  const pollInterval = useRef(null);

  // Parse URL for game ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('game');
    if (id) {
      setGameId(id);
      loadGame(id);
    }
  }, []);

  // Poll for updates
  useEffect(() => {
    if (!gameId || !gameStarted) return;
    
    pollInterval.current = setInterval(() => {
      loadGame(gameId);
    }, 2000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [gameId, gameStarted]);

  // Cheat code
  useEffect(() => {
    function handleKey(e) {
      if (e.ctrlKey && e.shiftKey) {
        keySequence.current.push(e.key.toUpperCase());
        if (keySequence.current.length > 5) keySequence.current.shift();
        
        if (keySequence.current.slice(-3).join('') === 'DES') {
          e.preventDefault();
          setDestroyed(true);
          setTimeout(() => setDestroyed(false), 10000);
          keySequence.current = [];
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

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
    const url = `${window.location.origin}${window.location.pathname}?game=${id}`;
    window.location.href = url;
  }

  async function startGame() {
    if (!gameId) return;
    setLoading(true);
    
    // Load current game state
    const currentData = await loadGameFromFirebase(gameId);
    
    // Determine role
    let role = null;
    const currentPlayers = currentData?.players || { white: false, black: false };
    
    if (!currentPlayers.black) {
      role = 'black';
      setPlayerRole('black');
    } else if (!currentPlayers.white) {
      role = 'white';
      setPlayerRole('white');
    } else {
      setMessage('Game is full!');
      setLoading(false);
      return;
    }

    // Initialize board if first player
    let newBoard = currentData?.board || {};
    if (!currentPlayers.black && !currentPlayers.white) {
      WHITE_INITIAL.forEach(c => newBoard[c] = 'white');
      BLACK_INITIAL.forEach(c => newBoard[c] = 'black');
    }

    const newPlayers = { ...currentPlayers, [role]: true };
    const gameData = {
      board: newBoard,
      currentTurn: 'black',
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
    if (!gameStarted || currentTurn !== playerRole || winner) return;

    const cellColor = board[cell];
    
    if (selected.includes(cell)) {
      setSelected(selected.filter(c => c !== cell));
      return;
    }

    if (cellColor === playerRole) {
      if (selected.length === 0) {
        setSelected([cell]);
      } else if (selected.length === 1) {
        const neighbors = getNeighbors(selected[0]);
        if (neighbors.includes(cell)) {
          setSelected([...selected, cell]);
        } else {
          setMessage('Must be adjacent!');
        }
      } else if (selected.length === 2) {
        if (isArithmeticSequence([...selected, cell])) {
          setSelected([...selected, cell]);
        } else {
          setMessage('Must form a line!');
        }
      } else {
        setMessage('Max 3 balls!');
      }
    }
  }

  function getPossibleMoves() {
    if (selected.length === 0) return [];
    
    const sorted = [...selected].sort((a,b) => a-b);
    const moves = [];
    const directions = [1, -1, 9, -9, 11, -11];

    for (let dir of directions) {
      const newCells = sorted.map(c => c + dir);
      
      // Check all new cells are valid
      if (!newCells.every(c => CELL_SET.has(c))) continue;

      // Simple move: all cells empty
      if (newCells.every(c => !board[c])) {
        moves.push({ dir, cells: newCells, type: 'move' });
        continue;
      }

      // Push move logic
      if (selected.length >= 2) {
        const diff = sorted[1] - sorted[0];
        if (dir === diff || dir === -diff) {
          // Check for push
          const front = dir > 0 ? sorted[sorted.length - 1] : sorted[0];
          let pushCells = [];
          let current = front + dir;
          
          while (CELL_SET.has(current) && board[current]) {
            if (board[current] === playerRole) break;
            pushCells.push(current);
            current += dir;
          }

          if (pushCells.length > 0 && pushCells.length < selected.length) {
            const nextCell = current;
            if (!CELL_SET.has(nextCell) || !board[nextCell]) {
              moves.push({ dir, cells: newCells, type: 'push', pushed: pushCells, pushTo: nextCell });
            }
          }
        }
      }
    }

    return moves;
  }

  async function makeMove(move) {
    const newBoard = { ...board };
    
    // Clear old positions
    selected.forEach(c => delete newBoard[c]);
    
    // Move selected balls
    move.cells.forEach(c => newBoard[c] = playerRole);

    let newScores = { ...scores };

    // Handle push
    if (move.type === 'push') {
      move.pushed.forEach(c => delete newBoard[c]);
      
      if (CELL_SET.has(move.pushTo)) {
        // Push to valid cell
        move.pushed.forEach(c => {
          const offset = move.pushed.indexOf(c);
          newBoard[move.pushTo + offset * move.dir] = currentTurn === 'black' ? 'white' : 'black';
        });
      } else {
        // Pushed off board - score!
        newScores[playerRole] += move.pushed.length;
      }
    }

    const newTurn = currentTurn === 'black' ? 'white' : 'black';
    const newWinner = newScores.white >= 6 ? 'white' : newScores.black >= 6 ? 'black' : null;

    const gameData = {
      board: newBoard,
      currentTurn: newTurn,
      players,
      gameStarted: true,
      scores: newScores,
      winner: newWinner
    };

    await saveGameToFirebase(gameId, gameData);
    setSelected([]);
    await loadGame(gameId);
  }

  const moves = getPossibleMoves();

  // Render
  if (destroyed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-700">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-red-500 mb-4 animate-pulse">💥 BOARD DESTROYED! 💥</h1>
          <p className="text-2xl text-yellow-300">Bad weather caused erosion...</p>
          <p className="text-xl text-gray-400 mt-4">Rebuilding in 10 seconds...</p>
        </div>
      </div>
    );
  }

  if (!gameId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-900 to-green-700">
        <div className="bg-amber-900 p-12 rounded-lg shadow-2xl text-center">
          <h1 className="text-5xl font-bold text-white mb-6">ABALONE</h1>
          <button
            onClick={createNewGame}
            className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white text-xl font-bold rounded-lg transition"
          >
            Create New Game
          </button>
          <p className="text-xs text-gray-400 mt-4">Note: You need to set up Firebase first!</p>
        </div>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-900 to-green-700">
        <div className="bg-amber-900 p-12 rounded-lg shadow-2xl text-center max-w-2xl">
          <h1 className="text-4xl font-bold text-white mb-4">Waiting for Players</h1>
          <p className="text-lg text-gray-300 mb-6">Share this link with your opponent:</p>
          <input
            type="text"
            value={window.location.href}
            readOnly
            className="w-full px-4 py-2 mb-6 rounded bg-gray-800 text-white font-mono text-sm"
            onClick={(e) => e.target.select()}
          />
          <button
            onClick={startGame}
            disabled={loading}
            className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xl font-bold rounded-lg transition"
          >
            {loading ? 'Joining...' : 'Join Game (Click to Start)'}
          </button>
          <p className="text-sm text-gray-400 mt-4">
            {players.black ? '⚫ Black joined' : '⚫ Waiting...'}
            {' | '}
            {players.white ? '⚪ White joined' : '⚪ Waiting...'}
          </p>
          {message && <p className="text-yellow-300 mt-4">{message}</p>}
        </div>
      </div>
    );
  }

  const rows = [
    [11,12,13,14,15],
    [21,22,23,24,25,26],
    [31,32,33,34,35,36,37],
    [41,42,43,44,45,46,47,48],
    [51,52,53,54,55,56,57,58,59],
    [61,62,63,64,65,66,67,68],
    [71,72,73,74,75,76,77],
    [81,82,83,84,85,86],
    [91,92,93,94,95]
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-4">
      <div className="bg-amber-900 p-8 rounded-lg shadow-2xl">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">ABALONE</h1>
        
        <div className="bg-amber-800 p-4 rounded mb-6 text-center">
          <p className="text-xl font-bold text-white">
            {winner ? `🎉 ${winner.toUpperCase()} WINS! 🎉` : `${currentTurn === 'black' ? '⚫' : '⚪'} ${currentTurn.toUpperCase()}'s Turn`}
          </p>
          <p className="text-gray-300 mt-2">You are: {playerRole ? (playerRole === 'black' ? '⚫ Black' : '⚪ White') : 'Spectator'}</p>
          <p className="text-yellow-300 mt-2">Score: ⚪ {scores.white} - {scores.black} ⚫</p>
          {message && <p className="text-red-300 mt-2">{message}</p>}
          {selected.length > 0 && <p className="text-blue-300 mt-2">Selected: {selected.join(', ')}</p>}
        </div>

        {/* Board */}
        <div className="bg-green-700 p-8 rounded-lg mb-6">
          {rows.map((row, idx) => (
            <div key={idx} className="flex justify-center mb-2">
              {row.map(cell => {
                const isSelected = selected.includes(cell);
                const color = board[cell];
                const canExtend = selected.length > 0 && selected.length < 3 && 
                  color === playerRole && !isSelected && 
                  (selected.length === 1 ? getNeighbors(selected[0]).includes(cell) :
                   selected.length === 2 ? isArithmeticSequence([...selected, cell]) : false);

                return (
                  <button
                    key={cell}
                    onClick={() => handleCellClick(cell)}
                    className={`w-10 h-10 rounded-full mx-1 border-2 transition transform hover:scale-110
                      ${color === 'white' ? 'bg-white border-gray-400' : 
                        color === 'black' ? 'bg-black border-gray-600' : 
                        'bg-amber-700 border-amber-600'}
                      ${isSelected ? 'ring-4 ring-yellow-400 scale-125' : ''}
                      ${canExtend ? 'ring-2 ring-gray-400' : ''}
                    `}
                    disabled={currentTurn !== playerRole || winner}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Move buttons */}
        {moves.length > 0 && (
          <div className="mb-4">
            <p className="text-white text-center mb-2">Available Moves:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {moves.map((move, idx) => {
                const arrow = {1: '→', [-1]: '←', 9: '↘', [-9]: '↖', 11: '↙', [-11]: '↗'}[move.dir];
                return (
                  <button
                    key={idx}
                    onClick={() => makeMove(move)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition"
                  >
                    {arrow} {move.type === 'push' ? '💥' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => setSelected([])}
          className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded transition"
        >
          Clear Selection
        </button>

        <p className="text-gray-400 text-center text-xs mt-4">
          🔓 Ctrl+Shift+D+E+S for developer surprise
        </p>
      </div>
    </div>
  );
}

export default AbaloneGame;
