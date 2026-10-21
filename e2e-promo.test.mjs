// E2E: promotion picker (full a-pawn run in two browser contexts), opening
// header after e4, and coordinate labels on both board orientations.
import { chromium } from "playwright";

const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " — " + extra}`);

const browser = await chromium.launch();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const a = await ctxA.newPage();
const b = await ctxB.newPage();

await a.goto("http://localhost:3100/");
await b.goto("http://localhost:3100/");
await a.getByRole("button", { name: "Play 10 min online" }).click();
await b.getByRole("button", { name: "Play 10 min online" }).click();
await a.waitForURL(/\/play\?g=/, { timeout: 15000 });
await b.waitForURL(/\/play\?g=/, { timeout: 15000 });

const white = (await a.getByText("Your move").isVisible().catch(() => false)) ? a : b;
const black = white === a ? b : a;
const sq = (pg, name) => pg.locator(`[aria-label^="${name},"]`).first();
const waitTurn = async (pg) => {
  try {
    await pg.getByText("Your move", { exact: true }).waitFor({ timeout: 8000 });
  } catch {
    await pg.screenshot({ path: "/tmp/waitfail.png" });
    const txt = await pg.locator("[aria-live]").textContent().catch(() => "?");
    const moves = await pg.locator("ol li").allTextContents().catch(() => []);
    throw new Error("waitTurn failed: live=" + txt.slice(0, 80) + " moves=" + moves.join(" | "));
  }
};
// coordinate labels: 16 edge spans per board regardless of orientation
for (const [label, pg] of [["white", white], ["black", black]]) {
  const n = await pg.locator('[role="grid"] > button > span[aria-hidden][class*="text-[10px]"]').count();
  ok(`coordinates on ${label} board`, n === 16, `got ${n}`);
}

// opening header appears after 1. e4 and switches to Open Game after ...e5
await sq(white, "e2").click();
await sq(white, "e4").click();
await waitTurn(black);
ok("opening header after e4", await white.getByText("King's Pawn").isVisible().catch(() => false));
await sq(black, "e7").click();
await sq(black, "e5").click();
await waitTurn(white);
ok(
  "opening updates to Open Game",
  await white.getByText("Open Game").waitFor({ timeout: 6000 }).then(() => true).catch(() => false)
);

// full white a-pawn run: a4 a5 a6 axb7 bxa8 — black king walks, never blocking
const line = [
  [white, "a2", "a4"], [black, "e8", "e7"],
  [white, "a4", "a5"], [black, "e7", "d6"],
  [white, "a5", "a6"], [black, "d6", "e6"],
  [white, "a6", "b7"],
  [black, "e6", "d6"],
];
for (const [pg, from, to] of line) {
  await sq(pg, from).click();
  await sq(pg, to).click();
  // wait until the other side can move
  await (pg === white ? waitTurn(black) : waitTurn(white));
}

// promotion: picker appears with all four pieces
await sq(white, "b7").click();
await sq(white, "a8").click();

await waitTurn(white);
const promo = white.getByRole("dialog", { name: "Choose promotion piece" });
await promo.waitFor({ timeout: 4000 });
ok("promotion picker appears", true);
const buttons = await promo.getByRole("button").count();
ok("picker offers 4 pieces + cancel", buttons === 5, `got ${buttons}`);
await white.screenshot({ path: "screens/ui-promotion.png" });
await promo.getByRole("button", { name: "Promote to n" }).click();

// knight lands: SAN shows =N on both sides; no auto-queen
await waitTurn(black);
const sanWhite = await white.locator("ol li").last().textContent();
ok("SAN shows bxa8=N", /a8=N/.test(sanWhite ?? ""), sanWhite ?? "");
const blackSees = await black.locator("ol li").last().textContent();
ok("opponent sees =N via polling", /a8=N/.test(blackSees ?? ""), blackSees ?? "");

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
await browser.close();
process.exit(failed ? 1 : 0);
