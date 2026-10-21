import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const res = await db.begin(async (sql) => {
    const [g] = await sql`select * from games where id = ${(await ctx.params).id} for update`;
    if (!g || (g.white_id !== me.id && g.black_id !== me.id)) return { code: 404, msg: "not found" };
    if (g.status !== "active") return { code: 409, msg: "already over" };
    if (g.first_move_at !== null) return { code: 409, msg: "too late to abort" };
    await sql`select finalize_game(${g.id}, '*'::game_result, 'aborted'::game_end_reason)`;
    return { code: 200 };
  });
  return NextResponse.json(res.code === 200 ? { ok: true } : { error: res.msg }, { status: res.code });
}
