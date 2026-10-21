import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { remainingMs, type GameRow } from "@/lib/server/engine";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const [g] = await db<GameRow[]>`select * from games where id = ${(await ctx.params).id}`;
  if (!g || (g.white_id !== me.id && g.black_id !== me.id))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const moves = await db`select ply, san from moves where game_id = ${g.id} order by ply`;
  const clocks = remainingMs(g);
  const names = await db`select id, username from profiles
    where id in (${g.white_id}, ${g.black_id})`;
  return NextResponse.json({ game: g, moves, clocks, players: names });
}
