// Bot: shallow material search with random noise — plays like a casual bot (~800).
// Replaced by server-side Stockfish skill levels in milestone 2 (see architecture.md).

import { Chess, type Move } from "chess.js";

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export function materialEval(chess: Chess): number {
  // + white advantage in centipawns
  let score = 0;
  for (const row of chess.board())
    for (const sq of row)
      if (sq) score += (sq.color === "w" ? 1 : -1) * VALUE[sq.type];
  return score;
}

export function botMove(fen: string): Move | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true }) as Move[];
  if (moves.length === 0) return null;
  const scored = moves.map((m) => {
    let score = Math.random() * 60; // keeps it human-ish
    if (m.captured) score += VALUE[m.captured] * 0.9;
    if (m.san.includes("#")) score += 100000;
    if (m.promotion) score += 800;
    if (m.san.includes("+")) score += 30;
    // punish moving into obvious recapture: simulate opponent best reply
    chess.move(m);
    const replies = chess.moves({ verbose: true }) as Move[];
    let worst = 0;
    for (const r of replies) if (r.captured) worst = Math.max(worst, VALUE[r.captured]);
    score -= worst * 0.6;
    chess.undo();
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].m;
}
