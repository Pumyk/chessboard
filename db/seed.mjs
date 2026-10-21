// Seed: bot profiles. Bots are system guests: is_guest=true satisfies the
// member_has_auth check and correctly excludes them from rated games and
// member challenges (bot games are always unrated anyway). No real people.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined });
for (const elo of [400, 800, 1200, 1600, 2000]) {
  const [p] = await sql`insert into profiles (username, skill_level, is_guest) values (${"bot-" + elo}, 1, true)
    on conflict (username) do nothing returning *`;
  if (p) await sql`insert into ratings (user_id, category) values (${p.id},'bullet'),(${p.id},'blitz'),(${p.id},'rapid')`;
  console.log("bot ok:", "bot-" + elo);
}
await sql.end();
