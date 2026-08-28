// End-to-end test: game consumes actions from the CV input service.
// Assumes the dev server (:5173) and the input service (:8765, fresh video
// timeline) were just started. Run: node scripts/e2e_cv_test.mjs
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

import fs from "fs";
const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error("No Chrome found");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
  timeout: 20000,
});

const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log("WebGL renderer:", renderer);

const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { game, player, actionBus } = window.__wipeout;
  const log = [];
  actionBus.on((a, s) => log.push(`${s}:${a}`));
  actionBus.emit("jump", "remote"); // title -> select
  await sleep(200);
  actionBus.emit("back", "remote"); // focus camera
  await sleep(150);
  actionBus.emit("jump", "remote"); // camera ON (starts WS)
  await sleep(200);
  const camEnabled = actionBus.isEnabled("camera");
  actionBus.emit("back", "remote"); // focus motion
  await sleep(150);
  actionBus.emit("back", "remote"); // focus start
  await sleep(150);
  actionBus.emit("jump", "remote"); // start run
  await sleep(15000); // let the test video's gestures play out
  return {
    camEnabled,
    log,
    state: game.state,
    lane: player.lane,
    row: player.row,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
