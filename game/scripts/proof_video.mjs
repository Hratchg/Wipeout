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
  const at = (row, lane) =>
    player.row === row && player.lane === lane && player.motion === "idle";
  const actTo = async (action, row, lane, timeout = 5000) => {
    const t0 = performance.now();
    while (!at(row, lane) && game.state === "playing" && performance.now() - t0 < timeout) {
      if (player.motion === "idle") emit(action);
      await sleep(80);
      await waitSettled();
      await sleep(80);
    }
  };

  // Menu: title -> select -> startMain (keeps remote-only controls)
  emit("jump");
  await sleep(600);
  while (game.ui.menuFocused() !== "startMain") {
    emit("back");
    await sleep(250);
  }
  emit("jump");
  await sleep(800);
  const hazards = () => world.hazards;

  // Rows 0-2, dodge the row-3 hole, leap the row-4 gap
  await actTo("forward", 1, 1);
  await actTo("forward", 2, 1);
  await actTo("left", 2, 0);
  await actTo("forward", 3, 0);
  await actTo("jump", 5, 0);
  await actTo("right", 5, 1);
  await actTo("forward", 6, 1);
  await actTo("jump", 8, 1);
  await actTo("forward", 9, 1);

  // Big Balls: step on as the middle ball rises, bounce to row 12
  let bounced = false;
  for (let attempt = 0; attempt < 4 && !bounced && game.state === "playing"; attempt++) {
    await until(() => game.state === "playing" && player.motion === "idle", 8000);
    if (game.state !== "playing") break;
    while (player.row > 9 && player.motion === "idle") await act("back");
    while (player.row < 9 && player.motion === "idle") await act("forward");
    while (player.lane !== 1 && player.motion === "idle") {
      await act(player.lane < 1 ? "right" : "left");
    }
    await until(() => !hazards().balls.isUp(1));
    await until(() => hazards().balls.isUp(1));
    if (player.lane !== 1 || player.row !== 9) continue;
    emit("forward");
    await until(
      () =>
        (player.row === 12 && player.motion === "idle") ||
        player.motion === "fall" ||
        player.motion === "tumble" ||
        player.motion === "gone" ||
        game.state !== "playing",
      6000,
    );
    bounced = player.row === 12 && game.state === "playing";
    if (!bounced) {
      await until(() => game.state !== "playing" || player.motion === "idle", 8000);
    }
  }
  if (!bounced) {
    return {
      state: game.state,
      row: player.row,
      lane: player.lane,
      courseId: game.course.id,
      sweeperWipeout,
    };
  }
  await sleep(150);
  const leftX = laneX(0);
  const sweeperZ = 14 * 2.4;
  const approachZ = 13 * 2.4;
  const leftClear = () =>
    !hazards().sweeper.hitsPlayer(leftX, approachZ) &&
    !hazards().sweeper.hitsPlayer(leftX, sweeperZ);

  // Stay on safe row 12, claim 13 only when the approach tile is clear,
  // then take the intentional wipeout on the approach/sweeper.
  await act("left");
  await until(() => leftClear() && game.state === "playing", 8000);
  emit("forward");
  await until(
    () => player.row === 13 || player.motion === "fall" || player.motion === "tumble",
    4000,
  );
  await until(
    () => player.motion === "tumble" || player.motion === "fall",
    8000,
  );
  sweeperWipeout =
    player.motion === "tumble" || player.motion === "fall";
  await until(() => game.state === "playing" && player.motion === "idle", 8000);
  await sleep(400);

  // Step back to row 12 — the arm no longer reaches here — then dash
  // through the left lane on a clear window. Retry if a late clip hits.
  let crossedSweeper = false;
  for (let attempt = 0; attempt < 3 && !crossedSweeper; attempt++) {
    await until(() => game.state === "playing" && player.motion === "idle", 8000);
    if (game.state !== "playing") break;
    while (player.row > 12 && player.motion === "idle") {
      await act("back");
    }
    if (player.row < 12 && game.state === "playing") {
      while (player.row > 9 && player.motion === "idle") await act("back");
      while (player.row < 9 && player.motion === "idle") await act("forward");
      while (player.lane !== 1 && player.motion === "idle") {
        await act(player.lane < 1 ? "right" : "left");
      }
      await until(() => !hazards().balls.isUp(1));
      await until(() => hazards().balls.isUp(1));
      if (player.row === 9 && player.lane === 1) {
        emit("forward");
        await until(
          () =>
            player.row === 12 ||
            player.motion === "fall" ||
            game.state !== "playing",
          6000,
        );
      }
      if (player.row === 12 && game.state === "playing") {
        await act("forward");
      }
      continue;
    }
    if (player.row < 12 || game.state !== "playing") continue;
    while (player.lane > 0 && player.motion === "idle") {
      await act("left");
    }
    await until(leftClear, 8000);
    await sleep(60);
    if (!leftClear() || player.row !== 12) continue;
    emit("forward");
    await waitSettled();
    emit("forward");
    await waitSettled();
    emit("forward");
    await waitSettled();
    crossedSweeper = player.row >= 15 && game.state === "playing";
  }
  if (!crossedSweeper) {
    return {
      state: game.state,
      row: player.row,
      lane: player.lane,
      courseId: game.course.id,
      sweeperWipeout,
    };
  }

  await act("right"); // lane 1: safe from both pistons
  await act("forward"); // row 16
  await act("forward"); // row 17

  // Moving platform
  await until(() => Math.abs(hazards().platform.currentX() - laneX(1)) < 0.5);
  emit("forward");
  await sleep(500);
  await until(
    () =>
      [0, 1, 2].some((k) => Math.abs(hazards().platform.currentX() - laneX(k)) < 0.4),
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
    courseId: game.course.id,
    sweeperWipeout,
  };
}, { timeout: 120000 });
const proofFailed =
  outcome.state !== "win" ||
  outcome.row !== 22 ||
  outcome.courseId !== "main" ||
  !outcome.sweeperWipeout;
await context.close();
await browser.close();
if (proofFailed) {
  throw new Error(`Deterministic proof failed: ${JSON.stringify(outcome)}`);
}
console.log(JSON.stringify(outcome));
const files = fs.readdirSync("/tmp/wipeout_proof");
console.log("video:", files.map((f) => `/tmp/wipeout_proof/${f}`).join(", "));
