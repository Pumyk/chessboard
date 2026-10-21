import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { ticket_id } = z.object({ ticket_id: z.string().uuid() }).parse(await req.json());
  const res = await db`update search_tickets set status = 'cancelled', updated_at = now()
    where id = ${ticket_id} and user_id = ${me.id} and status = 'searching'`;
  return NextResponse.json({ ok: res.count > 0 });
}
