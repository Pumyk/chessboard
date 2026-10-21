import postgres from "postgres";

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

// Clean slate: stale search tickets from crashed runs break pairing tests.
// The pglite socket shim occasionally resets new connections — retry a few
// times and degrade silently if the DB can't be reached.
if (process.env.DATABASE_URL) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const sql = postgres(process.env.DATABASE_URL, { max: 1 });
      await sql`delete from search_tickets`;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 750));
    }
  }
  // no sql.end: closing the socket emits an unhandled error event in the
  // pglite shim that kills the process; the connection dies with the test.
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
ok("guest can create a challenge", r.status === 200 && !!r.data.challenge?.id, "status " + r.status);


// --- polling: first searcher learns about the pairing via re-POST ---
r = await call("g4", "/me", {});
r = await call("g4", "/games/quick", { time_control_seconds: 300, increment_seconds: 0 });
ok("g4 searching first", r.data.status === "searching" && !!r.data.ticket_id, JSON.stringify(r.data));
const g4Ticket = r.data.ticket_id;
r = await call("g5", "/me", {});
r = await call("g5", "/games/quick", { time_control_seconds: 300, increment_seconds: 0 });
ok("g5 paired", r.data.status === "paired" && !!r.data.game_id, JSON.stringify(r.data));
const pollGame = r.data.game_id;
r = await call("g4", "/games/quick", { time_control_seconds: 300, increment_seconds: 0 });
ok("g4 poll returns paired", r.data.status === "paired" && r.data.game_id === pollGame, JSON.stringify(r.data));

// --- draw offer + accept ---
r = await call("g4", `/games/${pollGame}/draw-offer`, {});
ok("draw offer", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("g5", `/games/${pollGame}`);
ok("offerer visible to opponent", r.data.game?.draw_offer_by !== null, JSON.stringify(r.data.game?.draw_offer_by));
r = await call("g4", `/games/${pollGame}/draw-respond`, { accept: true });
ok("offerer cannot self-accept", r.status >= 400, JSON.stringify(r.data));
r = await call("g5", `/games/${pollGame}/draw-respond`, { accept: true });
ok("draw accepted", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("g5", `/games/${pollGame}`);
ok("game drawn 1/2-1/2", r.data.game?.status === "finished" && r.data.game?.result === "1/2-1/2" && r.data.game?.end_reason === "draw_agreement");

// --- abort before first move ---
r = await call("g6", "/me", {});
r = await call("g6", "/bots", { time_control_seconds: 180, increment_seconds: 0 });
const abortGame = r.data.game_id;
r = await call("g6", `/games/${abortGame}/abort`, {});
ok("abort pre-move", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("g6", `/games/${abortGame}`);
ok("aborted game result *", r.data.game?.status === "finished" && r.data.game?.result === "*" && r.data.game?.end_reason === "aborted");

// --- claim-timeout: mover flagged, opponent claims ---
r = await call("g7", "/me", {});
r = await call("g8", "/me", {});
r = await call("g7", "/games/quick", { time_control_seconds: 15, increment_seconds: 0 }); // bullet 15s
r = await call("g8", "/games/quick", { time_control_seconds: 15, increment_seconds: 0 });
ok("g7/g8 paired bullet", r.data.status === "paired" || r.data.status === "searching", JSON.stringify(r.data));
const bulletGame = r.data.game_id ?? (await call("g7", "/games/quick", { time_control_seconds: 15, increment_seconds: 0 })).data.game_id;
r = await call("g7", `/games/${bulletGame}/moves`, { from: "e2", to: "e4" });
ok("bullet first move", r.status === 200, JSON.stringify(r.data));
r = await call("g8", `/games/${bulletGame}/claim-timeout`, {});
ok("claim rejected while clock runs", r.status >= 400, JSON.stringify(r.data));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
