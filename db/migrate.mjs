// Runs every migration in db/migrations against DATABASE_URL, in order, once
// (tracked in the migrations table).
import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
const sql = postgres(url, { ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined });

await sql`create schema if not exists auth`;
await sql`create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now())`; // no-op on Supabase; local shim
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
