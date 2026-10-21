import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { applyServerMove } from "@/lib/server/engine";
import { botMove } from "@/lib/bot";

// The bot's move is computed server-side (as the architecture demands) and
// applied with the same authority path as a human move: the bot can also
// lose on time, and a racing client move still hits unique(game_id, ply).

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const res = await db.begin(async (sql) => {
    const [g] = await sql`select * from games where id = ${(await ctx.params).id} for update`;
    if (!g || (g.white_id !== me.id && g.black_id !== me.id)) return { code: 404 };
    if (g.type !== "bot") return { code: 403 };
    if (g.status !== "active") return { code: 409 };
    if (g.turn !== "b") return { code: 409 }; // not the bot's turn
    return { code: 200 as const, g };
  });
  if (res.code !== 200) return NextResponse.json({ error: "cannot move" }, { status: res.code });

  if (res.code !== 200 || !res.g) return NextResponse.json({ error: "cannot move" }, { status: res.code });
  const gameRow = res.g;
  const m = botMove(gameRow.fen);
  if (!m) return NextResponse.json({ ok: true, note: "no legal bot move" });
  const applied = await applyServerMove((await ctx.params).id, gameRow.black_id, {
    from: m.from, to: m.to, promotion: m.promotion,
  });
  if (!applied.ok) return NextResponse.json({ error: applied.message }, { status: 409 });
  return NextResponse.json({ ok: true, san: m.san });
}
