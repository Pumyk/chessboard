import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const res = await db`update games set draw_offer_by = ${me.id}, updated_at = now()
    where id = ${(await ctx.params).id} and status = 'active'
      and (${me.id} in (white_id, black_id)) and draw_offer_by is null`;
  return NextResponse.json({ ok: res.count > 0 });
}
