import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession, setGuestCookie, guestName } from "@/lib/server/session";

// Onboarding: picking a skill level sets the initial rating estimate while
// the player is still provisional with no games played.
const SKILL_RATING: Record<number, number> = { 1: 800, 2: 1100, 3: 1400, 4: 1700 };

export async function GET() {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const ratings = await db`select category, glicko, games_played, provisional
    from ratings where user_id = ${me.id}`;
  return NextResponse.json({ profile: me, ratings });
}

export async function POST(req: Request) {
  const body = z.object({ skill_level: z.number().min(1).max(4).optional() }).parse(await req.json().catch(() => ({})));
  let me = await getSession();
  if (!me) {
    const [p] = await db`insert into profiles (username, skill_level, is_guest)
      values (${guestName()}, ${body.skill_level ?? null}, true) returning *`;
    await db`insert into ratings (user_id, category) values
      (${p.id},'bullet'),(${p.id},'blitz'),(${p.id},'rapid')`;
    await setGuestCookie(p.id);
    me = { id: p.id, auth_user_id: p.auth_user_id, username: p.username,
           skill_level: p.skill_level, is_guest: p.is_guest };
  }
  const ratings = await db`select category, glicko, games_played, provisional
    from ratings where user_id = ${me.id}`;
  return NextResponse.json({ profile: me, ratings });
}

export async function PATCH(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const parsed = z.object({ skill_level: z.number().int().min(1).max(4) })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "skill_level must be 1-4" }, { status: 400 });
  const { skill_level } = parsed.data;
  await db`update profiles set skill_level = ${skill_level}, updated_at = now() where id = ${me.id}`;
  await db`update ratings set glicko = ${SKILL_RATING[skill_level]}, updated_at = now()
    where user_id = ${me.id} and provisional and games_played = 0`;
  const ratings = await db`select category, glicko, games_played, provisional
    from ratings where user_id = ${me.id}`;
  return NextResponse.json({ profile: me, ratings });
}
