import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((path) => fs.existsSync(path));
const REQUIRED_ARENA_NODES = [
  "arena-root",
  "ocean",
  "spectator-left",
  "spectator-right",
  "camera-tower-left",
  "camera-tower-right",
];
const REQUIRED_HAZARD_NODES = [
  "generated-ball-mount-0",
  "generated-ball-mount-1",
  "generated-ball-mount-2",
  "generated-sweeper-hub",
  "generated-sweeper-arm",
  "generated-piston-wall-0",
  "generated-piston-wall-2",
  "generated-piston-pad-0",
  "generated-piston-pad-2",
  "generated-moving-platform",
];
const HAZARD_GLB_FILES = [
  "ball_mount.glb",
  "sweeper_hub.glb",
  "sweeper_arm.glb",
  "piston_wall.glb",
  "piston_pad.glb",
  "moving_platform.glb",
];

if (!chromePath) {
  throw new Error(`Chrome not found in: ${CHROME_PATHS.join(", ")}`);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=metal"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const shadowWarnings = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      message.text().includes("receiveShadows")
    ) {
      shadowWarnings.push(message.text());
    }
  });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__arenaReady, undefined, {
    timeout: 60_000,
  });
  await page.evaluate(() => localStorage.removeItem("wipeout.reducedMotion"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__arenaReady, undefined, {
    timeout: 60_000,
  });

  const result = await page.evaluate(
    ({ requiredArenaNodes, requiredHazardNodes, shadowWarnings }) => {
      const scene = window.__wipeout.player.root.getScene();
      const game = window.__wipeout.game;
      const ui = game.ui;
      const effects = game.effects;
      const effectTextureCountBefore = scene.textures.filter((texture) =>
        texture.name.startsWith("effect-"),
      ).length;
      const particleSystemCountBefore = scene.particleSystems.length;
      let effectError = null;
      if (effects) {
        try {
          const position = window.__wipeout.player.root.position.clone();
          effects.checkpoint(position);
          effects.finish(position);
          effects.checkpoint(position);
          effects.finish(position);
        } catch (error) {
          effectError = String(error);
        }
      } else {
        effectError = "EffectsController absent";
      }
      const particleNames = scene.particleSystems.map((system) => system.name);
      const effectTextureCountAfter = scene.textures.filter((texture) =>
        texture.name.startsWith("effect-"),
      ).length;
      const hasMotionApi =
        typeof ui?.setReducedMotion === "function" &&
        typeof ui?.isReducedMotion === "function";
      const motionFullLabel = ui?.menuLabels?.motion?.text ?? null;
      if (hasMotionApi) ui.setReducedMotion(true);
      scene.getEngine().stopRenderLoop();
      const player = window.__wipeout.player;
      player.respawn(1, 0);
      player.moveTo(1, 1, "step");
      player.update(0.12);
      const stepMidLean = player.visualRoot?.rotation.x ?? 0;
      const stepMidMotion = player.motion;
      player.update(0.12);
      const stepLanding = {
        motion: player.motion,
        row: player.row,
        lean: player.visualRoot?.rotation.x ?? null,
      };
      player.moveTo(1, 3, "leap");
      player.update(0.18);
      const leapAscentScaleY = player.visualRoot?.scaling.y ?? 1;
      player.update(0.25);
      const leapLandingScaleY = player.visualRoot?.scaling.y ?? 1;
      player.update(0.12);
      const leapLanding = {
        motion: player.motion,
        row: player.row,
        scaleY: player.visualRoot?.scaling.y ?? null,
      };
      return {
        ready: window.__arenaReady,
        failures: window.__wipeout.arenaAssets.failures,
        platformPresent: window.__wipeout.arenaAssets.has("platform"),
        hasMotionApi,
        motionFullLabel,
        motionStored:
          localStorage.getItem("wipeout.reducedMotion") === "true",
        effectError,
        particleNames,
        effectTextureCountBefore,
        effectTextureCountAfter,
        particleSystemCountBefore,
        particleSystemCountAfter: scene.particleSystems.length,
        playerResponse: {
          stepMidLean,
          stepMidMotion,
          stepLanding,
          leapAscentScaleY,
          leapLandingScaleY,
          leapLanding,
        },
        absentArenaNodes: requiredArenaNodes.filter(
          (name) => !scene.getNodeByName(name),
        ),
        absentHazardNodes: requiredHazardNodes.filter(
          (name) => !scene.getNodeByName(name),
        ),
        hazardPrimitiveFallbacksHidden:
          scene.getMeshByName("sweeper-hub")?.isEnabled() === false &&
          scene.getMeshByName("sweeper-arm")?.isEnabled() === false &&
          scene.getMeshByName("piston-wall-0")?.isEnabled() === false &&
          scene.getMeshByName("piston-wall-2")?.isEnabled() === false &&
          scene.getMeshByName("piston-pad-0")?.isVisible === false &&
          scene.getMeshByName("piston-pad-2")?.isVisible === false &&
          scene.getMeshByName("moving-platform")?.isVisible === false,
        platformReceivesShadows:
          scene.getNodeByName("platform-0-0")?.getChildMeshes()[0]
            ?.receiveShadows === true,
        shadowWarnings,
      };
    },
    {
      requiredArenaNodes: REQUIRED_ARENA_NODES,
      requiredHazardNodes: REQUIRED_HAZARD_NODES,
      shadowWarnings,
    },
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__arenaReady, undefined, {
    timeout: 60_000,
  });
  const persistedMotionResult = await page.evaluate(() => {
    const ui = window.__wipeout.game.ui;
    const result = {
      reducedMotion: ui?.isReducedMotion?.() ?? null,
      motionReducedLabel: ui?.menuLabels?.motion?.text ?? null,
    };
    ui?.setReducedMotion?.(false);
    return result;
  });
  const normalFailed =
    !result.ready ||
    !result.platformPresent ||
    result.failures.length ||
    !result.hasMotionApi ||
    result.motionFullLabel !== "MOTION: FULL" ||
    !result.motionStored ||
    result.effectError !== null ||
    result.effectTextureCountBefore !== 4 ||
    result.effectTextureCountAfter !== result.effectTextureCountBefore ||
    result.particleSystemCountAfter !== result.particleSystemCountBefore ||
    result.playerResponse.stepMidMotion !== "tween" ||
    result.playerResponse.stepMidLean <= 0.1 ||
    result.playerResponse.stepLanding.motion !== "idle" ||
    result.playerResponse.stepLanding.row !== 1 ||
    result.playerResponse.stepLanding.lean !== 0 ||
    result.playerResponse.leapAscentScaleY <= 1.05 ||
    result.playerResponse.leapLandingScaleY >= 0.98 ||
    result.playerResponse.leapLanding.motion !== "idle" ||
    result.playerResponse.leapLanding.row !== 3 ||
    result.playerResponse.leapLanding.scaleY !== 1 ||
    !result.particleNames.includes("checkpoint-burst") ||
    !result.particleNames.includes("finish-confetti") ||
    persistedMotionResult.reducedMotion !== true ||
    persistedMotionResult.motionReducedLabel !== "MOTION: REDUCED" ||
    result.absentArenaNodes.length ||
    result.absentHazardNodes.length ||
    !result.hazardPrimitiveFallbacksHidden ||
    !result.platformReceivesShadows ||
    result.shadowWarnings.length;

  const fallbackPage = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const interceptedHazardRequests = [];
  await fallbackPage.route(
    /(?:spectator_stand|camera_tower|arena_props|ball_mount|sweeper_hub|sweeper_arm|piston_wall|piston_pad|moving_platform)\.glb(?:\?|$)/,
    (route) => {
      const file = new URL(route.request().url()).pathname.split("/").at(-1);
      if (file && HAZARD_GLB_FILES.includes(file)) {
        interceptedHazardRequests.push(file);
      }
      return route.abort();
    },
  );
  await fallbackPage.goto("http://localhost:5173/", {
    waitUntil: "networkidle",
  });
  await fallbackPage.waitForFunction(() => window.__gameReady, undefined, {
    timeout: 60_000,
  });
  const fallbackResult = await fallbackPage.evaluate(
    (requiredHazardNodes) => {
      const scene = window.__wipeout.player.root.getScene();
      const fallbackNames = [
        "spectator-left",
        "camera-tower-left",
        "arena-props-left-0",
      ];
      return {
        fallbackRootY: Object.fromEntries(
          fallbackNames.map((name) => [
            name,
            scene.getNodeByName(name)?.position.y ?? null,
          ]),
        ),
        fallbackAssetFailures: window.__wipeout.arenaAssets.failures,
        absentFallbackHazardNodes: requiredHazardNodes.filter(
          (name) => !scene.getNodeByName(name),
        ),
        hazardPrimitiveFallbacksVisible:
          scene.getMeshByName("ball-0")?.isVisible === true &&
          scene.getMeshByName("sweeper-hub")?.isEnabled() === true &&
          scene.getMeshByName("sweeper-arm")?.isEnabled() === true &&
          scene.getMeshByName("piston-wall-0")?.isEnabled() === true &&
          scene.getMeshByName("piston-wall-2")?.isEnabled() === true &&
          scene.getMeshByName("piston-pad-0")?.isVisible === true &&
          scene.getMeshByName("piston-pad-2")?.isVisible === true &&
          scene.getMeshByName("moving-platform")?.isVisible === true,
      };
    },
    REQUIRED_HAZARD_NODES,
  );
  const expectedFallbackRootY = {
    "spectator-left": -2.12,
    "camera-tower-left": -2.12,
    "arena-props-left-0": -2.16,
  };
  const fallbackFailed =
    Object.entries(expectedFallbackRootY).some(([name, expected]) => {
      const actual = fallbackResult.fallbackRootY[name];
      return actual === null || Math.abs(actual - expected) > 0.02;
    }) ||
    !fallbackResult.hazardPrimitiveFallbacksVisible ||
    !fallbackResult.fallbackAssetFailures.includes("ballMount") ||
    fallbackResult.absentFallbackHazardNodes.length !==
      REQUIRED_HAZARD_NODES.length ||
    HAZARD_GLB_FILES.some(
      (file) => !interceptedHazardRequests.includes(file),
    );
  const combinedResult = {
    ...result,
    ...persistedMotionResult,
    ...fallbackResult,
    interceptedHazardRequests,
  };
  if (normalFailed || fallbackFailed) {
    throw new Error(JSON.stringify(combinedResult));
  }

  console.log(JSON.stringify(combinedResult));
} finally {
  await browser.close();
}
