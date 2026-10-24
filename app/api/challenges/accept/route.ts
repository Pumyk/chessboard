import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

// Join a friend's room by code (the short code shown on their waiting screen).
const body = z.object({ code: z.string().trim().min(4).max(12) });

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid code" }, { status: 400 });
  const code = parsed.data.code.toUpperCase();

  // atomic claim: only one accept wins
  const claimed = await db`update challenges
    set status = 'accepted', updated_at = now()
    where code = ${code} and status = 'open'
    returning *`;
  const c = claimed[0];
  if (!c) {
    const [existing] = await db`select status, game_id from challenges where code = ${code}`;
    if (!existing) return NextResponse.json({ error: "no open game with that code" }, { status: 404 });
    if (existing.status === "accepted")
      return NextResponse.json({ status: "accepted", game_id: existing.game_id });
    return NextResponse.json({ error: `challenge ${existing.status}` }, { status: 409 });
  }
  if (c.creator_id === me.id) {
    // give the claim back — the creator can't join their own room
    await db`update challenges set status = 'open', updated_at = now() where id = ${c.id}`;
    return NextResponse.json({ error: "this is your own room — share the code with your friend" }, { status: 409 });
  }

  const creatorWhite = c.color === "white" ? false : c.color === "black" ? true : Math.random() < 0.5;
  const whiteId = creatorWhite ? c.creator_id : me.id;
  const blackId = creatorWhite ? me.id : c.creator_id;

  const [g] = await db`insert into games
      (type, white_id, black_id, time_control_seconds, increment_seconds,
       category, rated, clock_white_ms, clock_black_ms)
    values ('challenge', ${whiteId}, ${blackId}, ${c.time_control_seconds},
            ${c.increment_seconds}, ${c.category}, ${c.rated},
            ${c.time_control_seconds * 1000}, ${c.time_control_seconds * 1000})
    returning id`;
  await db`update challenges set game_id = ${g.id}, updated_at = now() where id = ${c.id}`;

  return NextResponse.json({ status: "accepted", game_id: g.id });
}
