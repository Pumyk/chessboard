import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { hashPassword, setMemberCookie } from "@/lib/server/session";

// Skill level picked at onboarding drives the initial rating estimate.
export const SKILL_RATING: Record<number, number> = { 1: 800, 2: 1100, 3: 1400, 4: 1700 };

const body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  skill_level: z.number().int().min(1).max(4).optional(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a valid email and a password of at least 6 characters." }, { status: 400 });
  const { email, password, skill_level } = parsed.data;

  const existing = await db`select id from profiles where email = ${email.toLowerCase()}`;
  if (existing.length)
    return NextResponse.json({ error: "That email is already registered — log in instead." }, { status: 409 });

  const initial = SKILL_RATING[skill_level ?? 2] ?? 1100;
  const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) ||
    `player${Math.floor(Math.random() * 9000 + 1000)}`;
  const [nameClash] = await db`select id from profiles where username = ${username}`;
  const finalName = nameClash ? `${username}${Math.floor(Math.random() * 900 + 100)}` : username;

  const [p] = await db`insert into profiles (username, email, password_hash, skill_level, is_guest)
    values (${finalName}, ${email.toLowerCase()}, ${hashPassword(password)},
            ${skill_level ?? null}, false) returning *`;
  await db`insert into ratings (user_id, category, glicko) values
    (${p.id},'bullet',${initial}),(${p.id},'blitz',${initial}),(${p.id},'rapid',${initial})`;
  await setMemberCookie(p.id);
  return NextResponse.json({ profile: { id: p.id, username: p.username, is_guest: false }, ratings:
    (await db`select category, glicko, games_played, provisional from ratings where user_id = ${p.id}`) });
}
