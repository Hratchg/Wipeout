// Captures and measures every broadcast UI state at both TV target sizes.
// Run from game/: node scripts/ui_check.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(
  scriptDir,
  "../../.superpowers/sdd/2026-08-30-wipeout-qualifier",
);
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const expectedStates = [
  "title",
  "select",
  "hud",
  "key-overlay",
  "checkpoint",
  "gameover",
  "win",
];

assert.ok(chromePath, `Chrome not found in: ${CHROME_PATHS.join(", ")}`);
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});
const results = [];

function parseAlpha(color) {
  const match = color?.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)$/);
  return match ? Number(match[1]) : color === "transparent" ? 0 : 1;
}

async function settleUi(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function measureSafeControls(page, names, viewport, state) {
  await settleUi(page);
  const measurements = await page.evaluate((controlNames) => {
    const ui = window.__wipeout.game.ui;
    return controlNames.map((name) => {
      const control = ui.adt.getControlByName(name);
      if (!control) return { name, missing: true };
      const measure = control._currentMeasure;
      return {
        name,
        missing: false,
        left: measure.left,
        top: measure.top,
        width: measure.width,
        height: measure.height,
        right: measure.left + measure.width,
        bottom: measure.top + measure.height,
        visible: control.isVisible,
        pointerBlocker: control.isPointerBlocker,
      };
    });
  }, names);
  const safeX = viewport.width * 0.05;
  const safeY = viewport.height * 0.05;
  const tolerance = 1;
  for (const measurement of measurements) {
    assert.equal(
      measurement.missing,
      false,
      `${state} is missing ${measurement.name}`,
    );
    assert.equal(
      measurement.visible,
      true,
      `${state} ${measurement.name} is not visible`,
    );
    assert.ok(
      measurement.left >= safeX - tolerance,
      `${state} ${measurement.name} left ${measurement.left}px < ${safeX}px`,
    );
    assert.ok(
      measurement.top >= safeY - tolerance,
      `${state} ${measurement.name} top ${measurement.top}px < ${safeY}px`,
    );
    assert.ok(
      measurement.right <= viewport.width - safeX + tolerance,
      `${state} ${measurement.name} right ${measurement.right}px > ${viewport.width - safeX}px`,
    );
    assert.ok(
      measurement.bottom <= viewport.height - safeY + tolerance,
      `${state} ${measurement.name} bottom ${measurement.bottom}px > ${viewport.height - safeY}px`,
    );
  }
  return measurements;
}

async function capture(page, viewport, state, controls) {
  const size = `${viewport.width}x${viewport.height}`;
  const measurements = await measureSafeControls(
    page,
    controls,
    viewport,
    state,
  );
  const file = path.join(outputDir, `task-4-${size}-${state}.png`);
  await page.screenshot({ path: file });
  return { state, file, measurements };
}

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    const consoleErrors = [];
    const ignoredConsoleErrors = [];
    const httpErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        const record = {
          text: message.text(),
          location: message.location(),
        };
        if (record.location.url.endsWith("/favicon.ico")) {
          ignoredConsoleErrors.push(record);
        } else {
          consoleErrors.push(record);
        }
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        httpErrors.push({ status: response.status(), url: response.url() });
      }
    });
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
      timeout: 60_000,
    });
    await page.waitForTimeout(500);

    const captures = [];
    captures.push(
      await capture(page, viewport, "title", [
        "broadcast-header-title",
        "title-card",
      ]),
    );

    await page.evaluate(() => window.__wipeout.actionBus.emit("jump", "remote"));
    await page.waitForFunction(() => window.__wipeout.game.state === "select");
    const initialFocus = await page.evaluate(() =>
      window.__wipeout.game.ui.menuFocused(),
    );
    assert.equal(initialFocus, "voice", "Select focus order no longer starts on voice");
    const focusVisual = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const row = window.__wipeout.game.ui.menuRows.voice;
      const thicknesses = [];
      for (let sample = 0; sample < 20; sample++) {
        thicknesses.push(row.thickness);
        await sleep(80);
      }
      return {
        color: row.color,
        minimumThickness: Math.min(...thicknesses),
        maximumThickness: Math.max(...thicknesses),
      };
    });
    assert.equal(focusVisual.color, "#ffd23e");
    assert.ok(
      focusVisual.maximumThickness - focusVisual.minimumThickness > 1,
      `Focused row border did not animate: ${JSON.stringify(focusVisual)}`,
    );
    await page.evaluate(() => window.__wipeout.actionBus.emit("back", "remote"));
    assert.equal(
      await page.evaluate(() => window.__wipeout.game.ui.menuFocused()),
      "camera",
      "Remote down navigation no longer reaches camera second",
    );
    await page.evaluate(() =>
      window.__wipeout.actionBus.emit("forward", "remote"),
    );
    assert.equal(
      await page.evaluate(() => window.__wipeout.game.ui.menuFocused()),
      "voice",
      "Remote up navigation no longer returns to voice",
    );

    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { actionBus } = window.__wipeout;
      for (let index = 0; index < 3; index++) {
        actionBus.emit("back", "remote");
        await sleep(40);
      }
    });
    captures.push(
      await capture(page, viewport, "select", [
        "broadcast-header-select",
        "select-card",
        "menu-row-remote",
        "menu-row-voice",
        "menu-row-camera",
        "menu-row-motion",
        "menu-row-startQualifier",
        "menu-row-startMain",
      ]),
    );
    assert.equal(
      await page.evaluate(() => window.__wipeout.game.ui.menuFocused()),
      "startQualifier",
      "Three downs from Voice no longer land on START QUALIFIER",
    );
    const selectHeader = await page.evaluate(
      () =>
        window.__wipeout.game.ui.adt.getControlByName(
          "broadcast-header-select-strap",
        )?.text,
    );
    assert.equal(selectHeader, "CONTROL DESK");

    const startedByMenu = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { actionBus, game } = window.__wipeout;
      actionBus.emit("jump", "remote");
      await sleep(250);
      return { state: game.state, courseId: game.course.id };
    });
    assert.deepEqual(
      startedByMenu,
      { state: "playing", courseId: "qualifier" },
      "startQualifier jump must call startRun(\"qualifier\")",
    );
    await page.evaluate(() => {
      const { game } = window.__wipeout;
      game.startRun("qualifier");
      game.ui.setHearts(3);
      game.ui.setTimer(41.2);
      game.ui.setScore(1250);
      game.ui.voiceFeedback({ state: "listening", lastWord: "jump" });
      game.ui.cvFeedback({ state: "tracking" });
    });
    const hudCopy = await page.evaluate(() => {
      const ui = window.__wipeout.game.ui;
      return {
        timerLabel: ui.adt.getControlByName("hud-timer-label")?.text,
        strap: ui.adt.getControlByName("broadcast-header-hud-strap")?.text,
      };
    });
    assert.deepEqual(hudCopy, {
      timerLabel: "TIME LEFT",
      strap: "QUALIFIER LIVE",
    });
    captures.push(
      await capture(page, viewport, "hud", [
        "broadcast-header-hud",
        "hud-lives-panel",
        "hud-timer-panel",
        "hud-timer-label",
        "hud-score-panel",
        "hud-input-panel",
      ]),
    );

    await page.keyboard.press("F2");
    await page.waitForTimeout(80);
    captures.push(
      await capture(page, viewport, "key-overlay", ["key-overlay"]),
    );
    assert.equal(
      await page.evaluate(
        () => window.__wipeout.game.ui.keyOverlay.isPointerBlocker,
      ),
      false,
      "Key overlay unexpectedly blocks pointer input",
    );
    await page.keyboard.press("F2");

    await page.evaluate(() => {
      window.__wipeout.player.respawn(1, 1);
      window.__checkpointStartedAt = performance.now();
      window.__wipeout.game.ui.showCheckpoint(8);
    });
    await page.waitForTimeout(250);
    const checkpointCopy = await page.evaluate(() => {
      const ui = window.__wipeout.game.ui;
      return {
        eyebrow: ui.adt.getControlByName("lower-third-eyebrow")?.text,
        detail: ui.adt.getControlByName("lower-third-detail")?.text,
        pointerBlocker:
          ui.adt.getControlByName("checkpoint-lower-third")?.isPointerBlocker,
      };
    });
    assert.deepEqual(checkpointCopy, {
      eyebrow: "CHECKPOINT REACHED",
      detail: "CHECKPOINT 8",
      pointerBlocker: false,
    });
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () =>
        window.__wipeout.player.lane === 2 &&
        window.__wipeout.player.motion === "idle",
      { timeout: 2_000 },
    );
    captures.push(
      await capture(page, viewport, "checkpoint", [
        "checkpoint-lower-third",
      ]),
    );
    await page.waitForFunction(
      () => performance.now() - window.__checkpointStartedAt >= 1050,
    );
    assert.equal(
      await page.evaluate(
        () => window.__wipeout.game.ui.checkpointLowerThird.isVisible,
      ),
      true,
      "Checkpoint lower-third ended before 1.2 seconds",
    );
    await page.waitForFunction(
      () => performance.now() - window.__checkpointStartedAt >= 1280,
    );
    assert.equal(
      await page.evaluate(
        () => window.__wipeout.game.ui.checkpointLowerThird.isVisible,
      ),
      false,
      "Checkpoint lower-third exceeded its 1.2 second duration",
    );

    await page.evaluate(() => {
      const { game } = window.__wipeout;
      game.startRun("qualifier");
      game.debugSetElapsed(50.05);
      game.update(0.016);
    });
    assert.equal(
      await page.evaluate(() => window.__wipeout.game.state),
      "gameover",
      "Qualifier clock-out did not enter gameover",
    );
    const gameoverCopy = await page.evaluate(() => {
      const ui = window.__wipeout.game.ui;
      return {
        title: ui.gameoverTitle?.text,
        strap: ui.adt.getControlByName("broadcast-header-gameover-strap")?.text,
      };
    });
    assert.deepEqual(gameoverCopy, {
      title: "TIME'S UP!",
      strap: "QUALIFIER LIVE",
    });
    captures.push(
      await capture(page, viewport, "gameover", [
        "broadcast-header-gameover",
        "end-card-gameover",
      ]),
    );

    const finalRunProof = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { actionBus, game, player } = window.__wipeout;
      game.startRun("qualifier");
      player.respawn(1, 12);
      actionBus.emit("jump", "remote");
      await sleep(25);
      const lowerThird = game.ui.checkpointLowerThird;
      const started = {
        visible: lowerThird.isVisible,
        eyebrow: game.ui.adt.getControlByName("lower-third-eyebrow")?.text,
      };
      while (game.state !== "win") await sleep(16);
      await sleep(80);
      return {
        started,
        state: game.state,
        strap: game.ui.adt.getControlByName("broadcast-header-win-strap")?.text,
        clearedBeforeOverlay:
          !lowerThird.isVisible &&
          game.ui.adt.getControlByName("lower-third-eyebrow")?.text === "",
        winBackdrop: game.ui.screens.win.background,
        winCard: game.ui.adt.getControlByName("end-card-win")?.background,
      };
    });
    assert.deepEqual(finalRunProof.started, {
      visible: true,
      eyebrow: "FINAL RUN",
    });
    assert.equal(finalRunProof.state, "win");
    assert.equal(finalRunProof.strap, "QUALIFIER LIVE");
    assert.equal(
      finalRunProof.clearedBeforeOverlay,
      true,
      "Final-run lower-third remained under the finish overlay",
    );
    assert.ok(
      parseAlpha(finalRunProof.winBackdrop) <= 0.3,
      `Win backdrop opacity ${finalRunProof.winBackdrop} obscures finish effects`,
    );
    assert.ok(
      parseAlpha(finalRunProof.winCard) >= 0.8,
      `Win stat card opacity ${finalRunProof.winCard} is too low contrast`,
    );
    captures.push(
      await capture(page, viewport, "win", [
        "broadcast-header-win",
        "end-card-win",
      ]),
    );

    assert.deepEqual(
      captures.map(({ state }) => state),
      expectedStates,
      "A required screenshot state was skipped",
    );
    assert.deepEqual(
      { pageErrors, consoleErrors, httpErrors },
      { pageErrors: [], consoleErrors: [], httpErrors: [] },
      "Browser errors occurred during UI proof",
    );
    const renderer = await page.evaluate(() => {
      const gl = window.__wipeout.player.root.getScene().getEngine()._gl;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    results.push({
      viewport,
      renderer,
      captures,
      finalRunProof,
      pageErrors,
      consoleErrors,
      ignoredConsoleErrors,
      httpErrors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(
  path.join(outputDir, "task-4-ui-check-results.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    viewports: results.map(({ viewport }) => viewport),
    screenshots: results.flatMap(({ captures }) =>
      captures.map(({ file }) => file),
    ),
    renderers: results.map(({ renderer }) => renderer),
  }),
);
