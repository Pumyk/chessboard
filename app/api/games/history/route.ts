import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function GET() {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const rows = await db`select g.id, g.result, g.end_reason, g.category, g.rated,
      g.time_control_seconds, g.increment_seconds, g.pgn as pgn
    from games g where ${me.id} in (g.white_id, g.black_id) and g.status = 'finished'
    order by g.ended_at desc limit 50`;
  return NextResponse.json({ games: rows });
}
