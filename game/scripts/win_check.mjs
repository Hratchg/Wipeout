// Verifies the win screen on a fresh page. Run: node scripts/win_check.mjs
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
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
  timeout: 20000,
});

const state = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { game, player, actionBus } = window.__wipeout;
  actionBus.emit("jump", "remote"); // title -> select (focus 0: voice)
  await sleep(200);
  actionBus.emit("back", "remote"); // focus 1: camera
  await sleep(150);
  actionBus.emit("back", "remote"); // focus 2: motion
  await sleep(150);
  actionBus.emit("back", "remote"); // focus 3: start
  await sleep(150);
  actionBus.emit("jump", "remote"); // start run
  await sleep(300);
  player.respawn(1, 20);
  await sleep(150);
  actionBus.emit("jump", "remote"); // leap final gap -> finish
  await sleep(1500);
  return game.state;
});
await page.screenshot({ path: "/tmp/wipeout_ui/5-win.png" });
console.log("state:", state);
await browser.close();
