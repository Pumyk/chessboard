import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";
import { newRoomCode } from "@/lib/server/roomcode";

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

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    try {
      const [c] = await db`insert into challenges
        (creator_id, category, time_control_seconds, increment_seconds, rated, color, code)
        values (${me.id}, ${category}, ${b.time_control_seconds}, ${b.increment_seconds},
                ${b.rated}, ${b.color}, ${code})
        returning *`;
      return NextResponse.json({
        challenge: { id: c.id, category, code, link: `/play?c=${c.id}` },
      });
    } catch (e) {
      // room codes are short; a rare collision just picks a new one
      if (String(e).includes("challenges_code_uidx") || String(e).includes("duplicate key")) continue;
      throw e;
    }
  }
  return NextResponse.json({ error: "could not allocate a room code — please retry" }, { status: 500 });
}
