import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  // dev-friendly: routes that need the DB fail per-request, not at import
}
const raw = process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres";
const isSupabase = raw.includes("supabase.co");
const url = new URL(raw);
// Supabase's session pooler caps at 15 client slots and every serverless
// instance holds its own pool, which exhausts it (EMAXCONNSESSION). The
// transaction pooler (6543) is built for serverless: it multiplexes, so we
// keep one connection per instance and disable prepared statements.
if (isSupabase && url.port === "5432") url.port = "6543";
export const db = postgres(url.toString(), {
  max: 1,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  prepare: !isSupabase || url.port !== "6543" ? undefined : false,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
});

export type Profile = {
  id: string;
  auth_user_id: string | null;
  username: string;
  skill_level: number | null;
  is_guest: boolean;
};
