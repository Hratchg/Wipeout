// Real-human jump acceptance. Requires the Vite server at :5173 and the
// camera input service on :8765 with a person in front of the webcam.
//
// Stand still until the HUD says tracking, then jump in place ten times
// with a short pause between jumps. The script resets the contestant to
// the first water-gap after each leap so every physical jump can land.
//
// Pass: 10 camera jumps, 10 on-screen leaps, no extra camera actions.
// Run: node scripts/jump_uat.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));
const TARGET_JUMPS = 10;
const SESSION_MS = 90_000;

if (!chromePath) {
  console.error("No Chrome found");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: false,
  args: ["--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
  timeout: 20_000,
});

const started = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { game, actionBus } = window.__wipeout;
  const emit = (a) => actionBus.emit(a, "remote");
  emit("jump");
  await sleep(400);
  emit("back");
  await sleep(150);
  emit("jump");
  await sleep(400);
  emit("back");
  await sleep(150);
  emit("back");
  await sleep(150);
  emit("jump");
  await sleep(500);
  return {
    state: game.state,
    camera: actionBus.isEnabled("camera"),
  };
});

if (started.state !== "playing" || !started.camera) {
  await browser.close();
  throw new Error(`Could not start a camera run: ${JSON.stringify(started)}`);
}

console.log(
  `Camera run started. Stand still for calibration, then jump in place ${TARGET_JUMPS} times.`,
);

const result = await page.evaluate(
  async ({ targetJumps, sessionMs }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const { game, player, actionBus } = window.__wipeout;
    const cameraActions = [];
    const leaps = [];
    actionBus.on((action, source) => {
      if (source === "camera") {
        cameraActions.push({ action, at: performance.now() });
      }
    });

    const parkAtGap = () => {
      player.respawn(1, 3);
    };
    parkAtGap();

    const deadline = performance.now() + sessionMs;
    let lastRow = player.row;
    while (performance.now() < deadline) {
      if (player.row > lastRow && lastRow === 3) {
        leaps.push({ at: performance.now(), row: player.row, lane: player.lane });
      }
      if (
        leaps.length >= targetJumps &&
        (player.motion === "idle" || player.motion === "riding")
      ) {
        break;
      }
      if (lastRow === 3 && player.row !== 3 && player.motion === "idle") {
        parkAtGap();
      }
      lastRow = player.row;
      game.ui.setScore(leaps.length);
      await sleep(30);
    }

    const cameraJumps = cameraActions.filter((entry) => entry.action === "jump");
    const extras = cameraActions.filter((entry) => entry.action !== "jump");
    return {
      state: game.state,
      cameraJumps: cameraJumps.length,
      onScreenLeaps: leaps.length,
      extras: extras.map((entry) => entry.action),
      cameraActions: cameraActions.map((entry) => entry.action),
    };
  },
  { targetJumps: TARGET_JUMPS, sessionMs: SESSION_MS },
);

await browser.close();
console.log(JSON.stringify(result, null, 2));

const passed =
  result.cameraJumps === TARGET_JUMPS &&
  result.onScreenLeaps === TARGET_JUMPS &&
  result.extras.length === 0;
if (!passed) {
  process.exit(1);
}
