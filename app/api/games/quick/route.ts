import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

const body = z.object({
  time_control_seconds: z.number().int().min(15).max(10800),
  increment_seconds: z.number().int().min(0).max(60).default(0),
  rated: z.boolean().default(true),
});

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { time_control_seconds, increment_seconds, rated } = body.parse(await req.json());

  const category = time_control_seconds < 180 ? "bullet" : time_control_seconds < 600 ? "blitz" : "rapid";
  const [r] = await db`select glicko from ratings where user_id = ${me.id} and category = ${category}`;
  const [latest] = await db`select * from search_tickets
    where user_id = ${me.id} order by created_at desc limit 1`;

  // Already paired: hand back the game while it's still live (the poller
  // navigates to it; once it ends, a fresh search creates a new ticket).
  if (latest?.status === "paired" && latest.game_id) {
    const [g] = await db`select status from games where id = ${latest.game_id}`;
    if (g?.status === "active")
      return NextResponse.json({ status: "paired", game_id: latest.game_id, ticket_id: latest.id });
  }

  if (latest?.status === "searching") {
    // Re-POST = poll. Someone may have queued since our ticket was created,
    // so retry the pairing window before answering "searching" again.
    const [paired] = await db`select pair_queue(${me.id}) as game_id`;
    if (paired?.game_id)
      return NextResponse.json({ status: "paired", game_id: paired.game_id, ticket_id: latest.id });
    return NextResponse.json({ status: "searching", ticket_id: latest.id });
  }

  // Fresh ticket: insert first so pair_queue can see it and match us against
  // anyone already searching in this category.
  const [ticket] = await db`insert into search_tickets
    (user_id, category, time_control_seconds, increment_seconds, rated, rating_glicko)
    values (${me.id}, ${category}, ${time_control_seconds}, ${increment_seconds}, ${rated},
            ${r?.glicko ?? 1500}) returning *`;

  const [paired] = await db`select pair_queue(${me.id}) as game_id`;
  if (paired?.game_id)
    return NextResponse.json({ status: "paired", game_id: paired.game_id, ticket_id: ticket.id });
  return NextResponse.json({ status: "searching", ticket_id: ticket.id });
}
