import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

// Create an open challenge: returns an id the creator shares as a link.
// The other player accepts by visiting /play?c=<id>.
const body = z.object({
  time_control_seconds: z.number().int().min(15).max(10800),
  increment_seconds: z.number().int().min(0).max(60).default(0),
  rated: z.boolean().default(true),
  color: z.enum(["white", "black", "random"]).default("random"),
});

const RATE = z.enum(["bullet", "blitz", "rapid"]);

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid challenge settings" }, { status: 400 });
  const b = parsed.data;
  const category = b.time_control_seconds < 180 ? "bullet" : b.time_control_seconds < 600 ? "blitz" : "rapid";
  RATE.parse(category);

  const [c] = await db`insert into challenges
    (creator_id, category, time_control_seconds, increment_seconds, rated, color)
    values (${me.id}, ${category}, ${b.time_control_seconds}, ${b.increment_seconds},
            ${b.rated}, ${b.color})
    returning *`;
  return NextResponse.json({ challenge: { id: c.id, category, link: `/play?c=${c.id}` } });
}
