// Local Postgres for dev/tests: real Postgres compiled to WASM, speaking the
// postgres wire protocol on :5432. Supabase replaces it in production.
import { readFileSync, readdirSync } from "fs";

const { PGlite } = await import("@electric-sql/pglite");
const db = await PGlite.create();

// auth schema shim (Supabase has these natively)
await db.exec(`create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('app.current_user', true), '')::uuid $$;`);

for (const f of readdirSync("db/migrations").sort()) {
  console.log("applying", f);
  await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
}
await db.exec(`create role app_user nologin;
grant usage on schema public to app_user;
grant select on games, moves, ratings, profiles, chat_messages to app_user;`);
console.log("migrations + shim applied");

const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
const server = new PGLiteSocketServer({ db, port: 5432 });
await server.start();
console.log("pglite listening on 5432");
