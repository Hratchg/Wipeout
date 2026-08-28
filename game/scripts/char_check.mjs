// Verifies the Tripo3D per-clip character: loads, faces down the course,
// and animates. Screenshots idle and mid-leap. Run: node scripts/char_check.mjs
import fs from "fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") console.log("PAGE:", m.text());
});
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
  timeout: 20000,
});
await page.waitForTimeout(3500); // character GLBs load async

const info = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { player, actionBus } = window.__wipeout;
  actionBus.emit("jump", "remote");
  await sleep(200);
  actionBus.emit("back", "remote");
  await sleep(150);
  actionBus.emit("back", "remote");
  await sleep(150);
  actionBus.emit("back", "remote");
  await sleep(150);
  actionBus.emit("jump", "remote"); // start run
  await sleep(600);
  return { hasAnimator: !!player.animator, motion: player.motion };
});
console.log(JSON.stringify(info));
fs.mkdirSync("/tmp/wipeout_char", { recursive: true });
await page.screenshot({ path: "/tmp/wipeout_char/idle.png" });

// Mid-leap shot: emit jump and screenshot during the arc.
await page.evaluate(() => window.__wipeout.actionBus.emit("jump", "remote"));
await page.waitForTimeout(280);
await page.screenshot({ path: "/tmp/wipeout_char/leap.png" });
await page.waitForTimeout(600);
await page.evaluate(() => window.__wipeout.actionBus.emit("forward", "remote"));
await page.waitForTimeout(150);
await page.screenshot({ path: "/tmp/wipeout_char/run.png" });
await browser.close();
console.log("done");
