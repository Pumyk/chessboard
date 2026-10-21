import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

// Public leaderboard: top rated players per category. Only established
// (non-provisional) ratings with games played are ranked.
export async function GET(req: Request) {
  const category = new URL(req.url).searchParams.get("category") ?? "blitz";
  if (!["bullet", "blitz", "rapid"].includes(category))
    return NextResponse.json({ error: "unknown category" }, { status: 400 });
  const rows = await db`
    select p.username, p.is_guest, r.glicko, r.games_played
    from ratings r join profiles p on p.id = r.user_id
    where r.category = ${category} and r.games_played > 0
    order by r.glicko desc, r.games_played desc
    limit 20`;
  return NextResponse.json({ category, players: rows });
}
