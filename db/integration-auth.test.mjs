// Integration tests for the account/chat/leaderboard batch:
// email signup + login + logout, skill-level rating estimate, in-game chat,
// and the leaderboard. Run with the dev stack up (bash scripts/restart.sh).
const BASE = "http://localhost:3100/api";
const EMAIL = `alice${Date.now()}@test.io`;
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
  if (sc.length) jars.set(guest, sc.map((c) => c.split(";")[0]).join("; "));
  let data; try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// ---- signup ----
let r = await call("alice", "/auth/signup", { email: EMAIL, password: "hunter22", skill_level: 3 });
ok("signup 200", r.status === 200 && r.data.profile?.username.startsWith("alice"), JSON.stringify(r.data).slice(0, 200));
ok("signup sets member cookie", (jars.get("alice") ?? "").includes("cb_member"));
ok("skill drives rating estimate", r.data.ratings?.every((x) => x.glicko === 1400), JSON.stringify(r.data.ratings));

r = await call("alice", "/me");
ok("member session resolves", r.status === 200 && r.data.profile?.username.startsWith("alice") && r.data.profile?.is_guest === false, JSON.stringify(r.data).slice(0, 120));

// weak password / bad email rejected
r = await call("b", "/auth/signup", { email: "not-an-email", password: "hunter22" });
ok("invalid email rejected", r.status === 400);
r = await call("b", "/auth/signup", { email: "short@test.io", password: "123" });
ok("short password rejected", r.status === 400);

// duplicate email
r = await call("b", "/auth/signup", { email: EMAIL, password: "hunter22" });
ok("duplicate email 409", r.status === 409);

// ---- login ----
r = await call("b", "/auth/login", { email: EMAIL, password: "wrong" });
ok("wrong password 401", r.status === 401 && !(jars.get("b") ?? "").includes("cb_member"));

r = await call("b", "/auth/login", { email: EMAIL, password: "hunter22" });
ok("login 200", r.status === 200 && r.data.profile?.username.startsWith("alice"));

// ---- skill PATCH as guest ----
r = await call("g", "/me", {});
ok("guest created", r.status === 200 && r.data.profile?.is_guest === true);
r = await call("g", "/me", { skill_level: 4 }, "PATCH");
ok("skill PATCH sets estimate", r.status === 200 && r.data.ratings?.every((x) => x.glicko === 1700), JSON.stringify(r.data.ratings).slice(0, 120));
r = await call("g", "/me", { skill_level: 9 }, "PATCH");
ok("out-of-range skill 400", r.status === 400);

// ---- logout ----
r = await call("b", "/auth/logout", {}, "POST");
ok("logout 200", r.status === 200);
r = await call("b", "/me");
ok("session cleared after logout", r.status === 401);

// ---- chat inside a quick game ----
r = await call("p1", "/me", {});
r = await call("p2", "/me", {});
r = await call("p1", "/games/quick", { time_control_seconds: 300, increment_seconds: 0, rated: true });
r = await call("p2", "/games/quick", { time_control_seconds: 300, increment_seconds: 0, rated: true });
const gid = r.data.game_id;
ok("pairing for chat test", !!gid, JSON.stringify(r.data).slice(0, 120));

r = await call("p1", `/games/${gid}/chat`, { body: "good luck!" });
ok("chat send 200", r.status === 200, JSON.stringify(r.data));
r = await call("p2", `/games/${gid}/chat`);
ok("opponent reads chat", r.status === 200 && r.data.messages?.some((m) => m.body === "good luck!"), JSON.stringify(r.data).slice(0, 160));
ok("chat carries sender name", r.data.messages?.[0]?.username?.length > 0);

r = await call("p1", `/games/${gid}/chat`, { body: "" });
ok("empty chat rejected", r.status === 400);
r = await call("p1", `/games/${gid}/chat`, { body: "x".repeat(301) });
ok("oversized chat rejected", r.status === 400);

// outsider can't read the chat
r = await call("p3", "/me", {});
r = await call("p3", `/games/${gid}/chat`);
ok("outsider blocked from chat", r.status === 403, `status ${r.status}`);

// ---- leaderboard ----
r = await call("x", "/leaderboard?category=blitz");
ok("leaderboard lists rated players", r.status === 200 && Array.isArray(r.data.players));
ok("leaderboard sorted by glicko", r.data.players.every((p, i, a) => i === 0 || a[i - 1].glicko >= p.glicko));
r = await call("x", "/leaderboard?category=bogus");
ok("bad category 400", r.status === 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
