import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

// Accept an open challenge by id: creates the game, assigns colors (the
// creator's colour preference, random resolved here), marks the challenge
// accepted. The creator polls GET to learn their game.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await params;
  const [c] = await db`select * from challenges where id = ${id}`;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ challenge: { status: c.status, game_id: c.game_id } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await params;

  // atomic claim: only one accept wins
  const claimed = await db`update challenges
    set status = 'accepted', updated_at = now()
    where id = ${id} and status = 'open'
    returning *`;
  const c = claimed[0];
  if (!c) {
    const [existing] = await db`select status, game_id from challenges where id = ${id}`;
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.status === "accepted")
      return NextResponse.json({ status: "accepted", game_id: existing.game_id });
    return NextResponse.json({ error: `challenge ${existing.status}` }, { status: 409 });
  }

  // resolve the creator's colour preference
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
  await db`update challenges set game_id = ${g.id}, updated_at = now() where id = ${id}`;

  return NextResponse.json({ status: "accepted", game_id: g.id });
}
