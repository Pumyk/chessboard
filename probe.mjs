
import { chromium } from "playwright";
const browser = await chromium.launch();
const ctxA = await browser.newContext(); const ctxB = await browser.newContext();
const a = await ctxA.newPage(); const b = await ctxB.newPage();
const jar = {};
async function call(g, p, body) {
  const res = await fetch("http://localhost:3100/api" + p, { method: body === undefined ? "GET" : "POST",
    headers: { ...(body ? {"content-type":"application/json"} : {}), ...(jar[g] ? {cookie: jar[g]} : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) jar[g] = sc.map(c => c.split(";")[0]).join("; ");
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
await call("w", "/me", {});
await call("bl", "/me", {});
const wq = await call("w", "/games/quick", { time_control_seconds: 600, increment_seconds: 0 });
const blq = await call("bl", "/games/quick", { time_control_seconds: 600, increment_seconds: 0 });
const gid = (wq.data.game_id || blq.data.game_id);
const line = [["w","a2","a4"],["bl","e7","e5"],["w","a4","a5"],["bl","e8","e7"],["w","a5","a6"],["bl","e7","d6"],["w","a6","b7"],["bl","d6","e6"]];
for (const [g, from, to] of line) { const r = await call(g, "/games/" + gid + "/moves", { from, to }); if (!r.ok) console.log("move failed", from, to, r.data); }
const state = await call("w", "/games/" + gid);
console.log("fen after line:", state.data.game?.fen ?? state.data.fen ?? JSON.stringify(state.data).slice(0,200));
await a.goto("http://localhost:3100/play?g=" + gid);
await a.locator('[role="grid"]').waitFor();
const errs = [];
a.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 200)));
a.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 200)); });
await a.waitForTimeout(2500);
await a.waitForTimeout(1500);
console.log("BODY BEFORE:", (await a.evaluate(() => document.body.innerText)).replace(/\n/g, " | ").slice(0, 400));
const b7class = await a.locator('[aria-label^="b7,"]').getAttribute("class");
await a.locator('[aria-label^="b7,"]').click();
await a.waitForTimeout(300);
const b7after = await a.locator('[aria-label^="b7,"]').getAttribute("class");
console.log("b7 class before/after click:", b7class, "=>", b7after);
await a.locator('[aria-label^="a8,"]').click();
await a.waitForTimeout(800);
const dialogs = await a.getByRole("dialog").count();
console.log("dialogs visible:", dialogs);
await a.screenshot({ path: "/tmp/promo-probe.png" });
// check aria-live text
console.log("live:", await a.locator("[aria-live]").textContent().catch(()=>"?"));
console.log("errors:", errs);
console.log("url:", a.url());
await browser.close();
