import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((path) => fs.existsSync(path));
const outputDir =
  "../.superpowers/sdd/2026-08-27-wipeout-visual-upgrade";

if (!chromePath) {
  throw new Error(`Chrome not found in: ${CHROME_PATHS.join(", ")}`);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});

const results = [];
try {
  for (const reducedMotion of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
      timeout: 60_000,
    });
    await page.evaluate((on) => {
      window.__wipeout.game.ui.setReducedMotion(on);
    }, reducedMotion);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__wipeout && window.__gameReady, {
      timeout: 60_000,
    });
    await page.waitForTimeout(1200);

    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { actionBus, player } = window.__wipeout;
      actionBus.emit("jump", "remote");
      await sleep(150);
      for (let index = 0; index < 3; index++) {
        actionBus.emit("back", "remote");
        await sleep(100);
      }
      actionBus.emit("jump", "remote");
      await sleep(250);
      player.respawn(1, 6);
      actionBus.emit("jump", "remote");
      while (player.row !== 8 || player.motion !== "idle") await sleep(16);
      await sleep(90);
    });

    const mode = reducedMotion ? "reduced" : "full";
    await page.screenshot({
      path: `${outputDir}/task-5-${mode}-checkpoint-1920x1080.png`,
    });

    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { actionBus, game, player } = window.__wipeout;
      player.respawn(1, 20);
      actionBus.emit("jump", "remote");
      while (game.state !== "win") await sleep(16);
      await sleep(120);
    });
    await page.screenshot({
      path: `${outputDir}/task-5-${mode}-finish-1920x1080.png`,
    });
    await page.evaluate(() => {
      window.__wipeout.game.ui.screens.win.isVisible = false;
    });
    await page.screenshot({
      path: `${outputDir}/task-5-${mode}-finish-effects-1920x1080.png`,
    });

    const result = await page.evaluate(
      ({ mode, pageErrors }) => {
        const { game, player } = window.__wipeout;
        const scene = player.root.getScene();
        const gl = scene.getEngine()._gl;
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          mode,
          reducedMotion: game.ui.isReducedMotion(),
          state: game.state,
          row: player.row,
          cameraOffset: {
            x: game.camera.position.x - game.cameraFollowPosition.x,
            y: game.camera.position.y - game.cameraFollowPosition.y,
            z: game.camera.position.z - game.cameraFollowPosition.z,
          },
          activeParticles: Object.fromEntries(
            scene.particleSystems.map((system) => [
              system.name,
              system.getActiveCount(),
            ]),
          ),
          finishLightMaterialNames: [
            ...new Set(
              scene.meshes
                .filter((mesh) => mesh.name.startsWith("finish-light-"))
                .map((mesh) => mesh.material?.name ?? null),
            ),
          ],
          sourceFinishLightIntensity: scene.getMaterialByName(
            "finish-light-material",
          )?.emissiveIntensity,
          flashingFinishLightIntensity: scene.getMaterialByName(
            "finish-light-material-effects",
          )?.emissiveIntensity,
          renderer: info
            ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
            : "unknown",
          pageErrors,
        };
      },
      { mode, pageErrors },
    );
    await page.waitForTimeout(1900);
    const settled = await page.evaluate(() => {
      const { game, player } = window.__wipeout;
      const scene = player.root.getScene();
      const settledFinishLightIntensity = scene.getMaterialByName(
        "finish-light-material-effects",
      )?.emissiveIntensity;
      scene.getEngine().stopRenderLoop();
      game.effects.update(10);
      game.camera.position.copyFrom(game.cameraFollowPosition);
      const base = game.camera.position.clone();
      game.effects.impact(player.root.position.clone());
      game.effects.update(0);
      return {
        settledFinishLightIntensity,
        impactOffset: {
          x: game.camera.position.x - base.x,
          y: game.camera.position.y - base.y,
          z: game.camera.position.z - base.z,
        },
      };
    });
    results.push({ ...result, ...settled });
    await page.close();
  }
} finally {
  await browser.close();
}

if (
  results.some(
    (result) =>
      result.state !== "win" ||
      result.row !== 22 ||
      result.reducedMotion !== (result.mode === "reduced") ||
      result.sourceFinishLightIntensity !== 2.2 ||
      result.flashingFinishLightIntensity <= 2.2 ||
      result.settledFinishLightIntensity !== 2.2 ||
      result.pageErrors.length > 0,
  )
) {
  throw new Error(JSON.stringify(results));
}
const [full, reduced] = results;
const reducedImpulseRatio = Math.abs(
  reduced.impactOffset.x / full.impactOffset.x,
);
if (Math.abs(reducedImpulseRatio - 0.15) > 0.01) {
  throw new Error(
    `Reduced impulse ratio ${reducedImpulseRatio}: ${JSON.stringify(results)}`,
  );
}
console.log(JSON.stringify(results));
