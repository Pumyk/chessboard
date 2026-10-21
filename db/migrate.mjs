// Runs every migration in db/migrations against DATABASE_URL, in order, once
// (tracked in the migrations table).
import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
const sql = postgres(url, { ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined });

// best-effort: on hosted Supabase the auth schema is owned by supabase_auth_admin
// and auth.users already exists; on plain Postgres/pglite we create the shim.
try {
  await sql`create schema if not exists auth`;
  await sql`create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now())`;
} catch (e) { console.log("auth schema managed externally, skipping"); };
// auth.uid() shim so migrations with RLS policies also apply on a plain
// Postgres (CI); Supabase and the local pglite server already define it.
await sql`create schema if not exists auth`;
try {
  await sql`create or replace function auth.uid() returns uuid language sql stable
    as \$\$ select nullif(current_setting('app.current_user', true), '')::uuid \$\$`;
} catch (e) { console.log("auth.uid() exists (Supabase), skipping"); }
await sql`create table if not exists migrations (name text primary key, applied_at timestamptz default now())`;

for (const f of readdirSync("db/migrations").sort()) {
  const done = await sql`select 1 from migrations where name = ${f}`;
  if (done.length) { console.log("skip", f); continue; }
  const body = readFileSync(join("db/migrations", f), "utf8");
  await sql.unsafe(body);
  await sql`insert into migrations (name) values (${f})`;
  console.log("applied", f);
}
await sql.end();
