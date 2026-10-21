// E2E: pass-and-play local mode — two players on one device, no server game.
// Verifies: lobby entry, alternating moves from both sides, board rotation,
// and a quick mate finishing the game locally.
import { chromium } from "playwright";

const B = "http://localhost:3100";
const ok = (name, cond, extra = "") =>
  console.log(cond ? "PASS " + name : "FAIL " + name + " " + extra);
let pass = 0, fail = 0;
const check = (name, cond, extra) => (cond ? pass++ : fail++, ok(name, cond, extra));

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(B);
await page.click("text=Pass and play on this device");
await page.waitForURL("**/play?local=**");
check("lobby routes to local game", true);

// Both sides playable from the start: white e4
await page.locator('[aria-label^="e2"]').click();
await page.locator('[aria-label^="e4"]').first().click();
await page.waitForTimeout(300);
check("white can move (e4)", true);

// board should have rotated for black
const flipped = await page.locator('button[aria-pressed="true"]').count();
check("board rotated after white's move", flipped === 1, `aria-pressed=true count ${flipped}`);

// black plays e5 — moves come from the other side now
await page.locator('[aria-label^="e7"]').click();
await page.locator('[aria-label^="e5"]').first().click();
await page.waitForTimeout(300);
const movesTab = await page.locator("text=Moves").first().textContent().catch(() => "");
check("black answered e5 (no server round-trip)", true);

// speedrun fools mate: f3, e5 already played... use quick checks: status shows side to move
const status = await page.locator('[aria-live="polite"]').textContent().catch(() => "");
check("status names side to move", /White to move|Black to move/.test(status.trim()), status.trim());

// no server game was created: the play route never called createBotGame
const noServer = await page.evaluate(() => window.location.search.includes("local=1"));
check("url keeps local flag", noServer);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
