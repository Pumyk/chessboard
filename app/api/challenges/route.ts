import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function GET() {
  const rows = await db`select c.id, c.category, c.time_control_seconds, c.increment_seconds,
      c.rated, c.color, c.rating_range, p.username as creator
    from challenges c join profiles p on p.id = c.creator_id
    where c.status = 'open' order by c.created_at desc limit 50`;
  return NextResponse.json({ challenges: rows });
}

const body = z.object({
  time_control_seconds: z.number().int().min(15).max(10800),
  increment_seconds: z.number().int().min(0).max(60).default(0),
  rated: z.boolean().default(true),
  color: z.enum(["white", "black", "random"]).default("random"),
  rating_range: z.number().int().min(0).max(1000).default(200),
});

export async function POST(req: Request) {
  const me = await getSession();
  if (!me || me.is_guest)
    return NextResponse.json({ error: "members only" }, { status: 403 }); // guests excluded from challenges per recon
  const b = body.parse(await req.json());
  const category = b.time_control_seconds < 180 ? "bullet" : b.time_control_seconds < 600 ? "blitz" : "rapid";
  const [c] = await db`insert into challenges
    (creator_id, category, time_control_seconds, increment_seconds, rated, color, rating_range)
    values (${me.id}, ${category}, ${b.time_control_seconds}, ${b.increment_seconds},
            ${b.rated}, ${b.color}, ${b.rating_range}) returning id`;
  return NextResponse.json({ challenge_id: c.id });
}
