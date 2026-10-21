import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { setMemberCookie, verifyPassword } from "@/lib/server/session";

const body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const { email, password } = parsed.data;

  const [p] = await db`select * from profiles where email = ${email.toLowerCase()}`;
  if (!p || !verifyPassword(password, p.password_hash))
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });

  await setMemberCookie(p.id);
  return NextResponse.json({ profile: { id: p.id, username: p.username, is_guest: false }, ratings:
    (await db`select category, glicko, games_played, provisional from ratings where user_id = ${p.id}`) });
}
