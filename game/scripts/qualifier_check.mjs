// Qualifier startRun + countdown time-up. Requires Vite at :5173.
// Run: node scripts/qualifier_check.mjs
import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((path) => fs.existsSync(path));

if (!chromePath) {
  throw new Error(`Chrome not found in: ${CHROME_PATHS.join(", ")}`);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__wipeout && window.__gameReady);

  const started = await page.evaluate(() => {
    const { game } = window.__wipeout;
    game.startRun("qualifier");
    return {
      id: game.course.id,
      rows: game.course.rows.length,
      finish: game.course.rows.length - 1,
      state: game.state,
    };
  });

  const timedOut = await page.evaluate(() => {
    const { game } = window.__wipeout;
    game.startRun("qualifier");
    game.debugSetElapsed(50.05);
    game.update(0.016);
    return {
      state: game.state,
      title: game.ui.gameoverTitle?.text ?? null,
    };
  });

  const splashAfterTimeUp = await page.evaluate(() => {
    const { game, player } = window.__wipeout;
    game.startRun("qualifier");
    game.debugSetElapsed(50.05);
    game.update(0.016);
    player.onSplash?.(player.root.position.clone());
    return {
      state: game.state,
      title: game.ui.gameoverTitle?.text ?? null,
    };
  });

  const main = await page.evaluate(() => {
    const { game } = window.__wipeout;
    game.startRun("main");
    return { id: game.course.id, rows: game.course.rows.length };
  });

  // Qualifier 15-row finish: hole dodge, leap, Big Balls, sweeper clear,
  // pistons center, platform, final leap.
  const finished = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const { game, player, actionBus, world } = window.__wipeout;
    const LANE_W = 2.4;
    const laneX = (l) => (l - 1) * LANE_W;
    const emit = (a) => actionBus.emit(a, "remote");

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

    game.startRun("qualifier");
    await sleep(200);
    const hz = world.hazards;

    // start at 0, go to lane 0 to dodge the row-2 hole, leap 2→4,
    // balls at 5 when up, bounce to 7, left, wait sweeper clear, 8, 9,
    // right to center, 10 pistons, wait platform, 11, 12, leap 12→14.
    await act("left");
    await act("forward");
    await act("forward");
    await act("jump");
    await act("right");
    await until(() => !hz.balls.isUp(1));
    await until(() => hz.balls.isUp(1));
    emit("forward");
    await until(() => player.row === 7 && player.motion === "idle", 6000);
    await sleep(150);
    if (player.row !== 7 || game.state !== "playing") {
      return {
        state: game.state,
        courseId: game.course.id,
        row: player.row,
        winStats: game.ui.winStats?.text ?? null,
      };
    }

    const leftX = laneX(0);
    const sweeperZ = 8 * 2.4;
    const exitZ = 9 * 2.4;
    const leftClear = () =>
      !hz.sweeper.hitsPlayer(player.root.position.x, player.root.position.z) &&
      !hz.sweeper.hitsPlayer(leftX, sweeperZ);
    const exitHit = () => hz.sweeper.hitsPlayer(leftX, exitZ);

    let crossedSweeper = false;
    for (let attempt = 0; attempt < 3 && !crossedSweeper; attempt++) {
      await until(() => game.state === "playing" && player.motion === "idle", 8000);
      if (game.state !== "playing") break;
      while (player.row > 7 && player.motion === "idle") {
        await act("back");
      }
      while (player.lane > 0 && player.motion === "idle") {
        await act("left");
      }
      // Wait out the exit-lane sweep, then dash on the rising clear edge.
      await until(() => exitHit() || game.state !== "playing", 8000);
      if (game.state !== "playing") break;
      await until(
        () => !exitHit() && leftClear() && game.state === "playing",
        8000,
      );
      await sleep(40);
      if (!leftClear() || game.state !== "playing") continue;
      emit("forward");
      await waitSettled();
      emit("forward");
      await waitSettled();
      crossedSweeper = player.row >= 9 && game.state === "playing";
    }
    if (!crossedSweeper) {
      return {
        state: game.state,
        courseId: game.course.id,
        row: player.row,
        winStats: game.ui.winStats?.text ?? null,
      };
    }

    // Wait for the platform from row 9 — do not linger on the piston row.
    await act("right");
    await until(() => Math.abs(hz.platform.currentX() - laneX(1)) < 0.5);
    emit("forward");
    await waitSettled();
    emit("forward");
    await sleep(500);
    await until(
      () =>
        [0, 1, 2].some((k) => Math.abs(hz.platform.currentX() - laneX(k)) < 0.4),
      8000,
    );
    await act("forward");
    await act("jump");
    await until(() => game.state === "win", 5000);

    return {
      state: game.state,
      courseId: game.course.id,
      row: player.row,
      winStats: game.ui.winStats?.text ?? null,
    };
  }, { timeout: 90000 });

  const leak = await page.evaluate(() => {
    const { game, player, world } = window.__wipeout;
    const scene = player.root.getScene();
    const snapshot = (courseId) => ({
      courseId,
      animationGroups: scene.animationGroups.length,
      shadowCasters: world.shadows.getShadowMap()?.renderList?.length ?? 0,
    });

    const samples = [];
    for (let i = 0; i < 10; i++) {
      const courseId = i % 2 === 0 ? "qualifier" : "main";
      game.startRun(courseId);
      samples.push(snapshot(courseId));
    }

    const qualifier = samples.filter((sample) => sample.courseId === "qualifier");
    const mainSamples = samples.filter((sample) => sample.courseId === "main");
    const same = (rows, key) => rows.every((row) => row[key] === rows[0][key]);

    return {
      samples,
      qualifierBaseline: qualifier[0],
      mainBaseline: mainSamples[0],
      qualifierStable:
        same(qualifier, "animationGroups") && same(qualifier, "shadowCasters"),
      mainStable:
        same(mainSamples, "animationGroups") && same(mainSamples, "shadowCasters"),
    };
  });

  const report = { started, timedOut, splashAfterTimeUp, main, finished, leak, pageErrors };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (started.id !== "qualifier" || started.rows !== 15 || started.finish !== 14 || started.state !== "playing") {
    failures.push(
      `qualifier start: expected qualifier/15/14/playing, got ${JSON.stringify(started)}`,
    );
  }
  if (timedOut.state !== "gameover" || timedOut.title !== "TIME'S UP!") {
    failures.push(
      `time-up: expected gameover + TIME'S UP!, got ${JSON.stringify(timedOut)}`,
    );
  }
  if (
    splashAfterTimeUp.state !== "gameover" ||
    splashAfterTimeUp.title !== "TIME'S UP!"
  ) {
    failures.push(
      `splash after time-up: expected gameover + TIME'S UP!, got ${JSON.stringify(splashAfterTimeUp)}`,
    );
  }
  if (main.id !== "main" || main.rows !== 23) {
    failures.push(`main start: expected main/23, got ${JSON.stringify(main)}`);
  }
  if (
    finished.state !== "win" ||
    finished.courseId !== "qualifier" ||
    !String(finished.winStats ?? "").includes("TIME LEFT")
  ) {
    failures.push(
      `finish: expected win + qualifier + TIME LEFT, got ${JSON.stringify(finished)}`,
    );
  }
  if (!leak.qualifierStable || !leak.mainStable) {
    failures.push(
      `rebuild leftovers grew across 10 startRuns: ${JSON.stringify(leak)}`,
    );
  }
  if (
    (leak.qualifierBaseline?.shadowCasters ?? 0) <= 0 ||
    (leak.mainBaseline?.shadowCasters ?? 0) <= 0
  ) {
    failures.push(
      `rebuild leftovers: expected shadow casters on both courses, got ${JSON.stringify(leak)}`,
    );
  }
  if (pageErrors.length) {
    failures.push(`${pageErrors.length} uncaught page error(s): ${pageErrors.join("; ")}`);
  }
  if (failures.length) {
    throw new Error(`qualifier_check failed: ${failures.join("; ")}`);
  }
} finally {
  await browser.close();
}
