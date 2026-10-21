import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { remainingMs, type GameRow } from "@/lib/server/engine";

// Claim the win when your opponent's clock has run out but they never moved
// again to trigger the server-side flag.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const res = await db.begin(async (sql) => {
    const [g] = await sql<GameRow[]>`select * from games where id = ${(await ctx.params).id} for update`;
    if (!g || (g.white_id !== me.id && g.black_id !== me.id)) return { code: 404, msg: "not found" };
    if (g.status !== "active") return { code: 409, msg: "already over" };
    if (!g.first_move_at) return { code: 409, msg: "game not started" };
    const clocks = remainingMs(g);
    const flaggedSide = g.turn === "w" ? "w" : "b";
    if (clocks[flaggedSide] > 0) return { code: 409, msg: "no flag to claim" };
    await sql`select finalize_game(${g.id},
      ${flaggedSide === "w" ? "0-1" : "1-0"}::game_result, 'timeout'::game_end_reason)`;
    return { code: 200 };
  });
  return NextResponse.json(res.code === 200 ? { ok: true } : { error: res.msg }, { status: res.code });
}
