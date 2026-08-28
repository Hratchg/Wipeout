// Records a full playthrough for the proof video: navigates the course,
// takes one deliberate sweeper wipeout for drama, then finishes the run.
// Output: /tmp/wipeout_proof/<hash>.webm  Run: node scripts/proof_video.mjs
import fs from "fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));

fs.rmSync("/tmp/wipeout_proof", { recursive: true, force: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: "/tmp/wipeout_proof", size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
  timeout: 20000,
});
await page.waitForTimeout(3500); // character load + a beat on the title screen

const outcome = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { game, player, actionBus, world } = window.__wipeout;
  const hz = world.hazards;
  const LANE_W = 2.4;
  const laneX = (l) => (l - 1) * LANE_W;
  const emit = (a) => actionBus.emit(a, "remote");
  let sweeperWipeout = false;

  const waitSettled = async (timeout = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (player.motion === "idle" || player.motion === "riding") return;
      await sleep(40);
    }
  };
  const act = async (a, pause = 120) => {
    emit(a);
    await sleep(80);
    await waitSettled();
    await sleep(pause);
  };
  const until = async (fn, timeout = 10000) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < timeout) await sleep(30);
  };

  // Menu: title -> select -> start (keeps remote-only controls)
  emit("jump");
  await sleep(600);
  emit("back");
  await sleep(250);
  emit("back");
  await sleep(250);
  emit("back");
  await sleep(250);
  emit("jump");
  await sleep(800);

  // Rows 0-2, dodge the row-3 hole, leap the row-4 gap
  await act("forward");
  await act("forward");
  await act("left");
  await act("forward");
  await act("jump"); // row 5
  await act("right");
  await act("forward"); // row 6 (middle tile)
  await act("jump"); // row 8 checkpoint
  await act("forward"); // row 9

  // Big Balls: step on as the middle ball rises, bounce to row 12
  await until(() => !hz.balls.isUp(1));
  await until(() => hz.balls.isUp(1));
  emit("forward");
  await until(() => player.row === 12 && player.motion === "idle", 6000);
  await sleep(150);
  await act("forward"); // row 13 checkpoint

  // Deliberate sweeper wipeout for the cameras
  await act("left");
  await until(() => !hz.sweeper.isDangerAtLane(0));
  await act("forward", 0); // stand on row 14 and take the hit
  await until(() => player.motion === "tumble", 6000);
  sweeperWipeout = player.motion === "tumble";
  await until(() => game.state === "playing" && player.motion === "idle", 6000);
  await sleep(1600); // respawn + invulnerability beat

  // Cross the sweeper properly this time
  await act("left");
  await until(() => hz.sweeper.isDangerAtLane(0));
  await until(() => !hz.sweeper.isDangerAtLane(0));
  await act("forward", 0);
  await act("forward"); // row 15
  await act("right"); // lane 1: safe from both pistons
  await act("forward"); // row 16
  await act("forward"); // row 17

  // Moving platform
  await until(() => Math.abs(hz.platform.currentX() - laneX(1)) < 0.5);
  emit("forward");
  await sleep(500);
  await until(
    () =>
      [0, 1, 2].some((k) => Math.abs(hz.platform.currentX() - laneX(k)) < 0.4),
    8000,
  );
  await act("forward"); // step off to row 19
  await act("forward"); // row 20 checkpoint
  await act("jump"); // over the final gap -> row 22 FINISH
  await until(() => game.state === "win", 5000);
  await sleep(2500); // hold on the win screen
  return {
    state: game.state,
    row: player.row,
    lane: player.lane,
    sweeperWipeout,
  };
});
const proofFailed =
  outcome.state !== "win" ||
  outcome.row !== 22 ||
  !outcome.sweeperWipeout;
await context.close();
await browser.close();
if (proofFailed) {
  throw new Error(`Deterministic proof failed: ${JSON.stringify(outcome)}`);
}
console.log(JSON.stringify(outcome));
const files = fs.readdirSync("/tmp/wipeout_proof");
console.log("video:", files.map((f) => `/tmp/wipeout_proof/${f}`).join(", "));
