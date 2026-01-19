# Abalone - Multiplayer Game

A web-based multiplayer implementation of the classic Abalone board game.

## Features

- 🎮 Real-time multiplayer gameplay
- 🌐 Share game links to play with friends
- ♟️ Full Abalone rules implementation
- 🎨 Beautiful green and amber theme
- 💥 Push mechanics with scoring
- 🏆 Win condition (first to 6 points)
- 🔓 Developer easter egg (Ctrl+Shift+D+E+S)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build for Production

```bash
npm run build
```

## How to Play

1. Click "Create New Game" to generate a unique game link
2. Share the link with your opponent
3. Both players click "Join Game" - first player gets black, second gets white
4. Black goes first
5. Select 1-3 balls in a line, then choose a direction to move
6. Push opponent balls off the board to score points
7. First player to score 6 points wins!

## Rules

- Select up to 3 balls of your color that form a straight line
- Balls must be adjacent (differ by 1, 9, or 11 positions)
- You can push opponent balls if you have more balls in the line
- Pushing balls off the board scores points

## Deployment

Deploy to Vercel, Netlify, or any static hosting service that supports Vite.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- Claude.ai Persistent Storage API

## License

MIT
