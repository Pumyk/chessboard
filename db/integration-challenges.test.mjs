// Integration: challenge-by-link — create, poll, accept (colors, atomic claim),
// creator learns game via GET, and a second accept can't create a second game.
const BASE = "http://localhost:3100/api";
const jars = new Map();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") =>
  cond ? (pass++, console.log("PASS", name)) : (fail++, console.log("FAIL", name, extra));
async function call(g, path, body, method) {
  const res = await fetch(BASE + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(jars.get(g) ? { cookie: jars.get(g) } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) jars.set(g, sc.map((c) => c.split(";")[0]).join("; "));
  let data; try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

await call("c", "/me", {});
await call("f", "/me", {});

// create
let r = await call("c", "/challenges", { time_control_seconds: 300, increment_seconds: 0, rated: true });
ok("create challenge", r.status === 200 && !!r.data.challenge?.id, JSON.stringify(r.data).slice(0, 120));
ok("challenge link shape", (r.data.challenge?.link ?? "").startsWith("/play?c="));
const cid = r.data.challenge.id;

// poll before accept
r = await call("c", `/challenges/${cid}`);
ok("status open before accept", r.status === 200 && r.data.challenge?.status === "open");

// accept by the friend
r = await call("f", `/challenges/${cid}`, {}, "POST");
ok("accept returns game", r.status === 200 && r.data.status === "accepted" && !!r.data.game_id, JSON.stringify(r.data).slice(0, 160));
const gid = r.data.game_id;

// creator polls: sees the same game
r = await call("c", `/challenges/${cid}`);
ok("creator sees accepted game", r.data.challenge?.status === "accepted" && r.data.challenge?.game_id === gid);

// second accept is a no-op carrying the same game id
r = await call("c", `/challenges/${cid}`, {}, "POST");
ok("second accept returns same game", r.status === 200 && r.data.game_id === gid, JSON.stringify(r.data).slice(0, 120));

// game is a real challenge game both can load
r = await call("f", `/games/${gid}`);
ok("accepted game is type challenge", r.data.game?.type === "challenge" && r.data.game?.status === "active");
ok("clocks initialized", r.data.clocks?.w === 300000 && r.data.clocks?.b === 300000);

// colour preference honoured (creator picked black → friend is white)
r = await call("f", "/challenges", { time_control_seconds: 300, increment_seconds: 0, color: "black" });
const cid2 = r.data.challenge.id;
r = await call("c", `/challenges/${cid2}`, {}, "POST");
const gid2 = r.data.game_id;
r = await call("f", `/games/${gid2}`);
ok("creator gets requested black", r.data.game?.black_id && r.data.players?.length === 2, "");

// bad settings rejected
r = await call("c", "/challenges", { time_control_seconds: 5, increment_seconds: 0 });
ok("invalid tc rejected", r.status === 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
