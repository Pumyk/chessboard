import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { sfGo } from "@/lib/server/stockfish";
import { Chess } from "chess.js";

// Post-game engine analysis: every position of the game evaluated by
// Stockfish at a fast movetime. Only available once the game is over —
// no engine help while it is still being played.

const MAX_PLIES = 80;
const MOVETIME = 100;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await ctx.params;
  const [g] = await db`select * from games where id = ${id}`;
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (g.white_id !== me.id && g.black_id !== me.id)
    return NextResponse.json({ error: "not your game" }, { status: 403 });
  if (g.status === "active")
    return NextResponse.json({ error: "game still in progress" }, { status: 409 });

  const moves = await db`select ply, san, fen_after from moves
    where game_id = ${id} order by ply asc limit ${MAX_PLIES}`;

  // positions to evaluate: start, then after every move
  const fens: string[] = [new Chess().fen()];
  for (const m of moves) fens.push(m.fen_after);

  const evals: { ply: number; san: string | null; cp: number; mate: boolean }[] = [];
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i];
    const turn = fen.split(" ")[1] as "w" | "b";
    let cpWhite = 0;
    let isMate = false;
    try {
      const ev = await sfGo(fen, { movetimeMs: MOVETIME, skill: 20 });
      if (ev.mate != null) {
        const v = ev.mate > 0 ? 10000 - ev.mate * 10 : -10000 - ev.mate * 10;
        cpWhite = turn === "w" ? v : -v;
        isMate = true;
      } else if (ev.cp != null) {
        cpWhite = turn === "w" ? ev.cp : -ev.cp;
      }
    } catch {
      return NextResponse.json({ error: "engine unavailable" }, { status: 503 });
    }
    evals.push({
      ply: i,
      san: i === 0 ? null : (moves[i - 1] as { san: string }).san,
      cp: Math.max(-10000, Math.min(10000, cpWhite)),
      mate: isMate,
    });
  }
  return NextResponse.json({ evals });
}
