import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { accept } = z.object({ accept: z.boolean() }).parse(await req.json());
  const res = await db.begin(async (sql) => {
    const [g] = await sql`select * from games where id = ${(await ctx.params).id} for update`;
    if (!g || (g.white_id !== me.id && g.black_id !== me.id)) return { code: 404, msg: "not found" };
    if (g.status !== "active" || g.draw_offer_by === null || g.draw_offer_by === me.id)
      return { code: 409, msg: "no offer to answer" };
    if (accept)
      await sql`select finalize_game(${g.id}, '1/2-1/2'::game_result, 'draw_agreement'::game_end_reason)`;
    else
      await sql`update games set draw_offer_by = null, updated_at = now() where id = ${g.id}`;
    return { code: 200, accepted: accept };
  });
  return NextResponse.json(res.code === 200 ? { ok: true, accepted: res.accepted } : { error: res.msg }, { status: res.code });
}
