import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  // dev-friendly: routes that need the DB fail per-request, not at import
}
export const db = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres", {
  max: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  ssl: process.env.DATABASE_URL?.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
});

export type Profile = {
  id: string;
  auth_user_id: string | null;
  username: string;
  skill_level: number | null;
  is_guest: boolean;
};
