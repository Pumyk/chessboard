import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

const body = z.object({ body: z.string().trim().min(1).max(300) });

async function participant(gameId: string, meId: string): Promise<boolean> {
  const [g] = await db`select white_id, black_id from games where id = ${gameId}`;
  return !!g && (g.white_id === meId || g.black_id === meId);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await params;
  if (!(await participant(id, me.id)))
    return NextResponse.json({ error: "not your game" }, { status: 403 });
  const messages = await db`
    select m.body, m.created_at, p.username
    from chat_messages m join profiles p on p.id = m.user_id
    where m.game_id = ${id} order by m.created_at asc limit 100`;
  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession();
  if (!me) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid message" }, { status: 400 });
  if (!(await participant(id, me.id)))
    return NextResponse.json({ error: "not your game" }, { status: 403 });
  await db`insert into chat_messages (game_id, user_id, body) values (${id}, ${me.id}, ${parsed.data.body})`;
  return NextResponse.json({ ok: true });
}
