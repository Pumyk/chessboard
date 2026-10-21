import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me || me.is_guest) return NextResponse.json({ error: "members only" }, { status: 403 });
  const res = await db.begin(async (sql) => {
    const [c] = await sql`select * from challenges where id = ${(await ctx.params).id} for update skip locked`;
    if (!c || c.status !== "open") return { code: 409, msg: "challenge no longer open" };
    if (c.creator_id === me.id) return { code: 409, msg: "your own challenge" };
    await sql`update challenges set status = 'accepted', updated_at = now() where id = ${c.id}`;
    const colors = await sql`select id from profiles where id in (${c.creator_id}, ${me.id})`;
    const white = c.color === "white" ? c.creator_id : c.color === "black" ? me.id
      : (Math.random() < 0.5 ? c.creator_id : me.id);
    const [g] = await sql`insert into games
      (type, white_id, black_id, time_control_seconds, increment_seconds, category, rated,
       clock_white_ms, clock_black_ms)
      values ('challenge', ${white}, ${white === c.creator_id ? me.id : c.creator_id},
              ${c.time_control_seconds}, ${c.increment_seconds}, ${c.category}, ${c.rated},
              ${c.time_control_seconds * 1000}, ${c.time_control_seconds * 1000})
      returning id`;
    await sql`update challenges set game_id = ${g.id} where id = ${c.id}`;
    return { code: 200, game_id: g.id };
  });
  return NextResponse.json(res.code === 200 ? { game_id: res.game_id } : { error: res.msg }, { status: res.code });
}
