import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession, setGuestCookie, guestName } from "@/lib/server/session";

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
