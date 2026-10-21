import { Chess, type Move } from "chess.js";
import { db } from "./db";

// The server is the only clock. Clients render, they never decide.

export type GameRow = {
  id: string;
  type: "quick" | "challenge" | "bot" | "pass_and_play";
  white_id: string;
  black_id: string;
  time_control_seconds: number;
  increment_seconds: number;
  category: "bullet" | "blitz" | "rapid";
  rated: boolean;
  status: "active" | "finished";
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  end_reason: string | null;
  fen: string;
  pgn: string;
  clock_white_ms: number;
  clock_black_ms: number;
  turn: "w" | "b";
  turn_started_at: string;
  draw_offer_by: string | null;
  first_move_at: string | null;
};

export function remainingMs(g: GameRow): { w: number; b: number } {
  const elapsed = g.status === "active" && g.first_move_at
    ? Date.now() - new Date(g.turn_started_at).getTime()
    : 0;
  return {
    w: Math.max(0, g.clock_white_ms - (g.turn === "w" ? elapsed : 0)),
    b: Math.max(0, g.clock_black_ms - (g.turn === "b" ? elapsed : 0)),
  };
}

export function terminalReason(chess: Chess): { result: "1-0" | "0-1" | "1/2-1/2" | "*"; reason: string } | null {
  if (chess.isCheckmate())
    return { result: chess.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  if (chess.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient_material" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", reason: "repetition" };
  if (chess.isDraw()) return { result: "1/2-1/2", reason: "fifty_move" };
  return null;
}

// Apply a move with full authority: locks the row, checks the player, the
// turn, and the mover's own clock, then persists. Unique (game_id, ply)
// makes a racing double-submit die at the insert, not in the UI.
export async function applyServerMove(
  gameId: string,
  moverProfileId: string,
  move: { from: string; to: string; promotion?: string }
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  return db.begin(async (sql) => {
    const [g] = await sql<GameRow[]>`select * from games where id = ${gameId} for update`;
    if (!g) return { ok: false as const, code: "not_found", message: "No such game" };
    if (g.status !== "active") return { ok: false as const, code: "over", message: "Game is over" };

    const side = g.white_id === moverProfileId ? "w" : g.black_id === moverProfileId ? "b" : null;
    if (!side) return { ok: false as const, code: "forbidden", message: "You are not in this game" };
    if (g.turn !== side)
      return { ok: false as const, code: "not_your_turn", message: "Not your turn" };

    const elapsed = g.first_move_at ? Date.now() - new Date(g.turn_started_at).getTime() : 0;
    let moverClock = (side === "w" ? g.clock_white_ms : g.clock_black_ms) - elapsed;
    if (moverClock <= 0) {
      // mover flagged on their own clock
      await sql`select finalize_game(${gameId},
        ${side === "w" ? "0-1" : "1-0"}::game_result, 'timeout'::game_end_reason)`;
      return { ok: false as const, code: "timeout", message: "You ran out of time" };
    }

    const chess = new Chess(g.fen);
    let applied: Move;
    try {
      applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
    } catch {
      return { ok: false as const, code: "illegal", message: "Illegal move" };
    }
    if (chess.history().length < 1) return { ok: false as const, code: "illegal", message: "Illegal move" };

    moverClock += g.increment_seconds * 1000;
    const whiteMs = side === "w" ? moverClock : g.clock_white_ms;
    const blackMs = side === "b" ? moverClock : g.clock_black_ms;
    const [cnt] = await sql`select count(*)::int as n from moves where game_id = ${gameId}`;
    const ply = cnt.n + 1; // unique(game_id, ply) kills racing double-submits here
    const fen = chess.fen();
    const pgn = g.pgn + (g.pgn ? " " : "") + applied.san;

    await sql`insert into moves (game_id, ply, san, uci, fen_after, clock_white_ms, clock_black_ms)
      values (${gameId}, ${ply}, ${applied.san},
              ${applied.from + applied.to + (applied.promotion ?? "")},
              ${fen}, ${whiteMs}, ${blackMs})`;

    await sql`update games set fen = ${fen}, pgn = ${pgn}, turn = ${chess.turn()},
        clock_white_ms = ${whiteMs}, clock_black_ms = ${blackMs},
        turn_started_at = now(), draw_offer_by = null,
        first_move_at = coalesce(first_move_at, now()), updated_at = now()
      where id = ${gameId}`;

    const t = terminalReason(chess);
    if (t)
      await sql`select finalize_game(${gameId}, ${t.result}::game_result, ${t.reason}::game_end_reason)`;

    return { ok: true as const };
  });
}
