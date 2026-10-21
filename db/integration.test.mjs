const BASE = "http://localhost:3100/api";
const jars = new Map();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra); }
};
async function call(guest, path, body, method) {
  const res = await fetch(BASE + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(jars.get(guest) ? { cookie: jars.get(guest) } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) jars.set(guest, sc.map(c => c.split(";")[0]).join("; "));
  let data; try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

let r = await call("g1", "/me", {});
ok("guest1 profile", r.status === 200 && r.data.profile?.is_guest === true && !!r.data.profile?.username, JSON.stringify(r.data).slice(0, 200));
r = await call("g2", "/me", {});
ok("guest2 profile", r.status === 200 && !!r.data.profile?.id);
ok("guest cookies set", jars.has("g1") && jars.has("g2"));

r = await call("g1", "/bots", { time_control_seconds: 180, increment_seconds: 2, bot_elo: 800 });
ok("bot game created", r.status === 200 && !!r.data.game_id, JSON.stringify(r.data));
const botGame = r.data.game_id;
r = await call("g1", `/games/${botGame}`);
ok("bot game readable", r.status === 200 && (r.data.game?.fen || "").includes("rnbqkbnr"));

r = await call("g1", `/games/${botGame}/moves`, { from: "e2", to: "e4" });
ok("e4 accepted", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("g1", `/games/${botGame}/bot-move`, {});
ok("bot replied", r.status === 200 && typeof r.data.san === "string" && r.data.san.length > 0, JSON.stringify(r.data));

r = await call("g1", `/games/${botGame}/moves`, { from: "a2", to: "a5" });
ok("illegal move rejected", r.status >= 400 || r.data.ok === false, JSON.stringify(r.data));

r = await call("g1", `/games/${botGame}/resign`, {});
ok("resign", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("g1", `/games/${botGame}`);
ok("game finished 0-1 resign", r.data.game?.status === "finished" && r.data.game?.result === "0-1" && r.data.game?.end_reason === "resign");
r = await call("g1", "/me");
const rapidAfterBot = r.data.ratings.find(x => x.category === "rapid");
ok("bot game unrated", rapidAfterBot?.glicko === 1500 && rapidAfterBot?.games_played === 0, JSON.stringify(rapidAfterBot));

r = await call("g1", "/games/quick", { time_control_seconds: 300, increment_seconds: 0, rated: true });
ok("g1 searching", r.data.status === "searching" || r.data.status === "paired", JSON.stringify(r.data));
r = await call("g2", "/games/quick", { time_control_seconds: 300, increment_seconds: 0, rated: true });
ok("g2 paired", r.data.status === "paired" && !!r.data.game_id, JSON.stringify(r.data));
const paired = r.data.game_id;
r = await call("g1", `/games/${paired}`);
ok("both players read game", r.status === 200);

r = await call("g1", `/games/${paired}/moves`, { from: "e2", to: "e4" });
const g1IsWhite = r.status === 200;
if (!g1IsWhite) r = await call("g2", `/games/${paired}/moves`, { from: "e2", to: "e4" });
ok("first move in paired game", r.status === 200, JSON.stringify(r.data));
r = await call(g1IsWhite ? "g1" : "g2", `/games/${paired}/resign`, {});
ok("paired resign", r.status === 200);

r = await call("g1", "/me"); const r1 = r.data.ratings.find(x => x.category === "blitz");
r = await call("g2", "/me"); const r2 = r.data.ratings.find(x => x.category === "blitz");
ok("winner gained / loser lost", (r1.glicko > 1500 || r2.glicko > 1500) && (r1.glicko < 1500 || r2.glicko < 1500), JSON.stringify({ r1, r2 }));
ok("games_played incremented", r1.games_played === 1 && r2.games_played === 1);

r = await call("g3", "/me", {});
r = await call("g3", `/games/${paired}`);
ok("third user gets 404", r.status === 404, "status " + r.status);
r = await call("g1", "/challenges", { time_control_seconds: 300 });
ok("guest challenges rejected", r.status === 403, "status " + r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
