import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

// Bot games are real game rows: white = player, black = bot profile.
// Bot profiles are seeded (see db/seed.mjs). Bot games are never rated.

const body = z.object({
  time_control_seconds: z.number().int().min(15).max(10800),
  increment_seconds: z.number().int().min(0).max(60).default(0),
  bot_elo: z.number().int().min(100).max(2500).default(800),
});

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { time_control_seconds, increment_seconds, bot_elo } = body.parse(await req.json());
  const category = time_control_seconds < 180 ? "bullet" : time_control_seconds < 600 ? "blitz" : "rapid";
  const [bot] = await db`select id from profiles where username = ${"bot-" + bot_elo}`;
  const [g] = await db`insert into games
    (type, white_id, black_id, time_control_seconds, increment_seconds, category, rated,
     clock_white_ms, clock_black_ms)
    values ('bot', ${me.id}, ${bot.id}, ${time_control_seconds}, ${increment_seconds},
            ${category}, false, ${time_control_seconds * 1000}, ${time_control_seconds * 1000})
    returning id`;
  return NextResponse.json({ game_id: g.id });
}
