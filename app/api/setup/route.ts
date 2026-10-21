// One-shot migration endpoint for deploys where the operator can't reach the
// database directly (e.g. an HTTPS-only CI). Idempotent: applies pending
// migrations once (tracked in the migrations table) and seeds bot profiles.
// Guarded by SERVER_SECRET; remove the header and you get nothing.
import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-setup-key") ?? "";
  const secret = process.env.SERVER_SECRET ?? "";
  if (!secret || key.length !== secret.length || key !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  const sql = postgres(url, { ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined });
  const log: string[] = [];
  try {
    // same preamble as db/migrate.mjs
    await sql`create schema if not exists auth`;
    await sql`create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now())`;
    await sql`create or replace function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.current_user', true), '')::uuid $$`;
    await sql`create table if not exists migrations (name text primary key, applied_at timestamptz default now())`;
    const dir = join(process.cwd(), "db", "migrations");
    let names: string[] = [];
    try { names = readdirSync(dir).sort(); } catch (e) { log.push(`migrations dir unreadable: ${String(e)}`); }
    for (const f of names) {
      const done = await sql`select 1 from migrations where name = ${f}`;
      if (done.length) { log.push(`skip ${f}`); continue; }
      const body = readFileSync(join(dir, f), "utf8");
      await sql.unsafe(body);
      await sql`insert into migrations (name) values (${f})`;
      log.push(`applied ${f}`);
    }
    // seed bots (same as db/seed.mjs)
    for (const elo of [400, 800, 1200, 1600, 2000]) {
      const [p] = await sql`insert into profiles (username, skill_level, is_guest) values (${"bot-" + elo}, 1, true)
        on conflict (username) do nothing returning *`;
      if (p) await sql`insert into ratings (user_id, category) values (${p.id},'bullet'),(${p.id},'blitz'),(${p.id},'rapid')`;
      log.push(`bot ok bot-${elo}`);
    }
    const [{ profiles }] = await sql`select count(*)::int as profiles from profiles`;
    log.push(`profiles: ${profiles}`);
    return NextResponse.json({ ok: true, log });
  } catch (e: any) {
    return NextResponse.json({ ok: false, log, error: e?.message, detail: e?.cause?.message ?? String(e) }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
