import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { applyServerMove } from "@/lib/server/engine";

const body = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const move = body.parse(await req.json());
  const res = await applyServerMove((await ctx.params).id, me.id, move);
  if (!res.ok) return NextResponse.json({ error: res.message, code: res.code }, { status: res.code === "forbidden" ? 403 : 409 });
  return NextResponse.json({ ok: true });
}
