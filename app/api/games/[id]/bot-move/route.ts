import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { applyServerMove } from "@/lib/server/engine";
import { Chess } from "chess.js";
import { botMove } from "@/lib/bot";
import { sfGo } from "@/lib/server/stockfish";

// The bot's move is computed server-side and applied with the same authority
// path as a human move. Since the Stockfish milestone, strength follows the
// bot's ELO (UCI_LimitStrength for 1350+, Skill Level + short movetime below).

function eloFromName(username: string): number {
  const m = /bot-(\d+)/.exec(username);
  return m ? Number(m[1]) : 1000;
}

function settingsFor(elo: number) {
  if (elo >= 1350)
    return { uciElo: Math.min(elo, 2850), skill: 20, movetimeMs: Math.min(120 + elo / 10, 600) };
  return { uciElo: undefined, skill: Math.max(0, Math.min(10, Math.round((elo - 250) / 110))), movetimeMs: Math.max(40, Math.round(elo / 6)) };
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const res = await db.begin(async (sql) => {
    const [g] = await sql`select * from games where id = ${(await ctx.params).id} for update`;
    if (!g || (g.white_id !== me.id && g.black_id !== me.id)) return { code: 404 };
    if (g.type !== "bot") return { code: 403 };
    if (g.status !== "active") return { code: 409 };
    if (g.turn !== "b") return { code: 409 }; // not the bot's turn
    const [bot] = await sql`select username from profiles where id = ${g.black_id}`;
    return { code: 200 as const, g, botName: bot?.username ?? "bot-1000" };
  });
  if (res.code !== 200) return NextResponse.json({ error: "cannot move" }, { status: res.code });

  const gameRow = res.g as typeof res.g & { fen: string };
  let m = null;
  try {
    const cfg = settingsFor(eloFromName(res.botName as string));
    const ev = await sfGo(gameRow.fen, cfg);
    const uci = ev.bestmove;
    if (/^[a-h][1-8][a-h][1-8]/.test(uci))
      m = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4], san: "" };
  } catch {
    // engine unavailable: fall back to the casual heuristic bot
  }
  const applied = m
    ? await applyServerMove((await ctx.params).id, gameRow.black_id, {
        from: m.from, to: m.to, promotion: m.promotion,
      })
    : null;
  if (m && applied?.ok) {
    let san = "";
    try {
      san = new Chess(gameRow.fen).move({ from: m.from, to: m.to, promotion: m.promotion }).san;
    } catch {}
    return NextResponse.json({ ok: true, engine: "stockfish", san });
  }
  if (applied && !applied.ok) {
    // engine gave an unusable move — fall through to heuristic
  }
  const hb = botMove(gameRow.fen);
  if (!hb) return NextResponse.json({ ok: true, note: "no legal bot move" });
  const applied2 = await applyServerMove((await ctx.params).id, gameRow.black_id, {
    from: hb.from, to: hb.to, promotion: hb.promotion,
  });
  if (!applied2.ok) return NextResponse.json({ error: applied2.message }, { status: 409 });
  return NextResponse.json({ ok: true, engine: "heuristic", san: hb.san });
}
