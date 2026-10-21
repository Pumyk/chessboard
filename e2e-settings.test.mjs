// E2E: settings page — theme choice and coordinate toggle persist to
// localStorage and reach the game board.
import { chromium } from "playwright";

const B = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (n, c, e = "") => (c ? (pass++, console.log("PASS " + n)) : (fail++, console.log("FAIL " + n + " " + e)));

const browser = await chromium.launch();

// pick the Wood theme and turn coordinates off
const page = await browser.newPage();
await page.goto(B + "/settings");
await page.locator('button[aria-label="Wood board"]').click();
await page.locator('label:has-text("Show coordinates") input').uncheck();
await page.waitForTimeout(200);

const stored = await page.evaluate(() => ({
  theme: localStorage.getItem("cb-theme"),
  coords: localStorage.getItem("cb-coords"),
}));
ok("theme saved", stored.theme === "wood" || stored.theme === "brown", JSON.stringify(stored));
ok("coords off saved", stored.coords === "off");

// open a local game: board colors and no coordinate labels
await page.locator('a[href="/"]').click();
await page.waitForURL("**/");
await page.click("text=Pass and play on this device");
await page.waitForURL("**/play?local=**");
await page.waitForTimeout(400);
const boardBg = await page.evaluate(() => {
  const sq = document.querySelector('[role="gridcell"]');
  return sq ? getComputedStyle(sq).backgroundColor : "";
});
const cellColors = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="gridcell"]')).slice(0, 2).map((el) => getComputedStyle(el).backgroundColor));
ok("board uses Wood theme colors", cellColors.every((c) => /240, 217, 181|181, 136, 99/.test(c)), cellColors.join(", "));
const coordLabels = await page.locator('[role="gridcell"] span.absolute').count();
ok("coordinates hidden", coordLabels === 0, "found " + coordLabels);

// settings toggle visible from lobby
await page.goto(B);
const hasSettings = await page.locator('a[href="/settings"]').count();
ok("settings link in lobby", hasSettings === 1);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
