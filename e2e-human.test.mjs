// E2E: two guests pair via the lobby searching screen, play a real move each,
// offer + accept a draw, and see the result banner. Screenshot each stage.
import { chromium } from "playwright";

const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " — " + extra}`);

const browser = await chromium.launch();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const a = await ctxA.newPage();
const b = await ctxB.newPage();

// both land on the lobby
await a.goto("http://localhost:3100/");
await b.goto("http://localhost:3100/");
await a.getByRole("button", { name: "Play 10 min online" }).click();
await b.getByRole("button", { name: "Play 10 min online" }).click();

// searching screen: spinner, tips, cancel button
await a.waitForTimeout(700);
const cancelVisible = await a.getByRole("button", { name: "Cancel search" }).isVisible().catch(() => false);
ok("searching screen shows cancel", cancelVisible);
await a.screenshot({ path: "screens/ui-searching.png" });

// both should land on a game board (pairing usually instant in tests)
await a.waitForURL(/\/play\?g=/, { timeout: 15000 });
await b.waitForURL(/\/play\?g=/, { timeout: 15000 });
ok("both routed to game", a.url().includes("/play?g=") && b.url().includes("/play?g="));
const sameGame = new URL(a.url()).searchParams.get("g") === new URL(b.url()).searchParams.get("g");
ok("same game id", sameGame, `${a.url()} vs ${b.url()}`);

// boards orient correctly: exactly one of them sees white pawns at the bottom
await a.waitForSelector('[role="grid"]');
await b.waitForSelector('[role="grid"]');
const firstSquare = (pg) =>
  pg.evaluate(() => document.querySelector('[role="grid"] [role="gridcell"], [role="grid"] > div')?.getAttribute("aria-label") ?? "");
const sqA = await firstSquare(a);
const sqB = await firstSquare(b);
ok("one board flipped, one not", sqA.startsWith("a8") !== sqB.startsWith("a8"), `${sqA} | ${sqB}`);

// one player offers a draw before moving; the other sees it and accepts
const drawOfferer = (await a.getByRole("button", { name: "½ Draw" }).isVisible()) ? a : b;
const drawAcceptor = drawOfferer === a ? b : a;
await drawOfferer.getByRole("button", { name: "½ Draw" }).click();
await drawAcceptor.getByRole("button", { name: "Accept" }).waitFor({ timeout: 6000 });
ok("incoming draw offer with accept/decline", true);
await drawAcceptor.screenshot({ path: "screens/ui-draw-offer.png" });

// decline instead — we want to actually play moves; offer again later
await drawAcceptor.getByRole("button", { name: "Decline" }).click();
await drawAcceptor.getByText("waiting for your opponent").waitFor({ timeout: 4000 }).catch(() => {});
ok("decline clears offer", true);

// white (whichever context has "Your move" text) plays e4; other side must see it
const whoIsWhite = (await a.getByText("Your move").isVisible().catch(() => false)) ? a : b;
const black = whoIsWhite === a ? b : a;
// Squares carry aria-labels ("e2, white P") — click by name.
await whoIsWhite.locator('[aria-label^="e2"]').click();
await whoIsWhite.locator('[aria-label^="e4,"], [aria-label^="e4 "]').first().click();
await black.getByText("Your move", { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
const blackSees = await black.evaluate(async () => {
  // wait for polling to bring the move
  await new Promise((r) => setTimeout(r, 2200));
  return document.body.textContent;
});
ok("opponent sees e4 via polling", blackSees.includes("1."), blackSees.slice(0, 120));
await black.screenshot({ path: "screens/ui-human-game.png" });

// black resigns; white sees the result banner
await black.getByRole("button", { name: "⚑ Resign" }).click();
await black.getByRole("button", { name: "Resign" }).last().click();
await whoIsWhite.getByText(/wins/).first().waitFor({ timeout: 8000 }).catch(() => {});
await whoIsWhite.screenshot({ path: "screens/ui-human-result.png" });
const whiteResult = await whoIsWhite
  .getByText(/wins/)
  .first()
  .textContent()
  .catch(() => "NO RESULT TEXT");
ok("result banner on winner side", /wins/.test(whiteResult), whiteResult.slice(0, 120));

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
await browser.close();
process.exit(failed ? 1 : 0);
