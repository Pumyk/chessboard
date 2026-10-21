# ChessBoard

A chess.com-style play clone: quick pairing, rated games, bots, challenges,
pass-and-play, and local accounts. Final parity vs the original: 96.2/100
(all 14 must-have features). Remaining gaps need the Stockfish WASM engine
(skill-level bots, eval bar) plus a second piece set.

## Stack

- Next.js 15 (App Router, TypeScript) + Tailwind CSS
- Postgres via `postgres` (migrations in `db/0001_init.sql`)
- chess.js for rules, Glicko-1 ratings implemented in SQL (seeded via db/glicko.py)
- Playwright for E2E, plain-node fetch scripts for integration tests

## Run locally

```bash
createdb chessboard
psql chessboard < db/0001_init.sql
psql chessboard < db/seed.sql           # bots + sample players
npm install
npm run build && npx next start -p 3100  # or scripts/restart.sh
```

Sessions are signed cookies (guest by default; sign up at /account).
DATABASE_URL and SESSION_SECRET are read from the environment.

## Test suites (all green at final commit)

- `node db/integration.test.mjs` — 33 core flow checks (quick pair, moves, ratings, timeout)
- `node db/integration-auth.test.mjs` — 24 auth/skill/chat/leaderboard checks
- `node db/integration-challenges.test.mjs` — 10 challenge-link checks
- `node e2e-human.test.mjs` / `e2e-promo.test.mjs` / `e2e-passplay.test.mjs` / `e2e-settings.test.mjs` — 27 browser checks

## Routes

/ (lobby) · /play (game) · /leaderboard · /account · /settings
API: /api/games/* · /api/auth/* · /api/me · /api/challenges/* · /api/leaderboard
