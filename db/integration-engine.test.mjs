// Integration: Stockfish engine — rated bot moves + post-game analysis.
const BASE = "http://localhost:3100/api";
const jars = new Map();
let pass = 0, fail = 0;
const ok = (n, c, e = "") => (c ? (pass++, console.log("PASS", n)) : (fail++, console.log("FAIL", n, e)));
async function call(g, p, b, method) {
  const res = await fetch(BASE + p, {
    method: method ?? (b === undefined ? "GET" : "POST"),
    headers: { ...(b !== undefined ? { "content-type": "application/json" } : {}), ...(jars.get(g) ? { cookie: jars.get(g) } : {}) },
    body: b !== undefined ? JSON.stringify(b) : undefined,
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) jars.set(g, sc.map((c) => c.split(";")[0]).join("; "));
  let d; try { d = await res.json(); } catch { d = {}; }
  return { status: res.status, data: d };
}

await call("u", "/me", {});

// --- bot strength ladder: 800 and 1500 bots both answer with stockfish ---
let r = await call("u", "/bots", { time_control_seconds: 300, increment_seconds: 0, bot_elo: 800 });
ok("800-bot game created", r.status === 200 && !!r.data.game_id, JSON.stringify(r.data).slice(0, 100));
const gid = r.data.game_id;
r = await call("u", `/games/${gid}/moves`, { from: "e2", to: "e4" });
ok("human opening move", r.status === 200, JSON.stringify(r.data).slice(0, 100));
r = await call("u", `/games/${gid}/bot-move`, {});
ok("800-bot replies via stockfish", r.status === 200 && r.data.engine === "stockfish", JSON.stringify(r.data).slice(0, 100));

r = await call("u", "/bots", { time_control_seconds: 300, increment_seconds: 0, bot_elo: 1600 });
const g1500 = r.data.game_id;
r = await call("u", `/games/${g1500}/moves`, { from: "e2", to: "e4" });
r = await call("u", `/games/${g1500}/bot-move`, {});
ok("1600-bot replies via stockfish", r.status === 200 && r.data.engine === "stockfish", JSON.stringify(r.data).slice(0, 100));

// --- analysis: blocked while live, works after resignation ---
r = await call("u", `/games/${g1500}/analysis`, {}, "POST");
ok("analysis blocked while live", r.status === 409, "status " + r.status);

r = await call("u", `/games/${g1500}/resign`, {}, "POST");
ok("resign finishes game", r.status === 200);
r = await call("u", `/games/${g1500}/analysis`, {}, "POST");
ok("analysis returns evals", r.status === 200 && Array.isArray(r.data.evals) && r.data.evals.length === 3, "status " + r.status + " " + JSON.stringify(r.data).slice(0, 160));
if (r.status === 200 && Array.isArray(r.data.evals)) {
  const evs = r.data.evals;
  ok("start eval is ply 0", evs[0]?.ply === 0 && evs[0]?.san === null);
  ok("evals follow the moves", evs[1]?.san === "e4" && /^[a-hKQRBN]\w+/.test(evs[2]?.san ?? ""), JSON.stringify(evs.map((e) => e.san)));
  ok("evals are white perspective numbers", evs.every((e) => typeof e.cp === "number" && Math.abs(e.cp) <= 10000));
}

// --- a mated game reports mate for the winner ---
r = await call("u", "/bots", { time_control_seconds: 300, increment_seconds: 0, bot_elo: 800 });
const g3 = r.data.game_id;
// white forces its own loss: 1.e4 f6?? — no: human is white; let the bot mate us is unreliable.
// instead: resign then confirm analysis endpoint doesn't crash on 0-move games
r = await call("u", `/games/${g3}/resign`, {}, "POST");
r = await call("u", `/games/${g3}/analysis`, {}, "POST");
ok("analysis of an instantly resigned game", r.status === 200 && r.data.evals?.length === 1, "status " + r.status);

// --- strangers cannot analyse your game ---
await call("v", "/me", {});
r = await call("v", `/games/${gid}/analysis`, {}, "POST");
ok("stranger analysis rejected", r.status === 403, "status " + r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
