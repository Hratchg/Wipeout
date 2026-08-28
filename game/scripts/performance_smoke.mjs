import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((path) => fs.existsSync(path));
const MINIMUM_FPS = 30;
const SAMPLE_MS = 12_000;

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
  await page.waitForFunction(() => window.__gameReady, undefined, {
    timeout: 60_000,
  });

  const result = await page.evaluate(async ({ sampleMs }) => {
    const scene = window.__wipeout.player.root.getScene();
    const engine = scene.getEngine();
    const gl = engine._gl;
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = rendererInfo
      ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const updateDynamicVertexBuffer =
      engine.updateDynamicVertexBuffer.bind(engine);
    let dynamicVertexUploads = 0;
    let arrayVertexUploads = 0;
    engine.updateDynamicVertexBuffer = (buffer, data, ...args) => {
      dynamicVertexUploads++;
      if (data instanceof Array) arrayVertexUploads++;
      return updateDynamicVertexBuffer(buffer, data, ...args);
    };

    await new Promise((resolve) => {
      const warmupStart = performance.now();
      const warmup = (now) => {
        if (now - warmupStart >= 3_000) resolve();
        else requestAnimationFrame(warmup);
      };
      requestAnimationFrame(warmup);
    });

    const frameTimes = await new Promise((resolve) => {
      const samples = [];
      let startedAt = 0;
      let previous = 0;
      const sample = (now) => {
        if (startedAt === 0) startedAt = now;
        if (previous !== 0) samples.push(now - previous);
        previous = now;
        if (now - startedAt >= sampleMs) resolve(samples);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    const sorted = [...frameTimes].sort((a, b) => a - b);
    const totalMs = frameTimes.reduce((sum, frameTime) => sum + frameTime, 0);
    const averageFrameMs = totalMs / frameTimes.length;
    const percentileIndex = Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * 0.95) - 1,
    );
    engine.updateDynamicVertexBuffer = updateDynamicVertexBuffer;
    return {
      renderer,
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
      sampleMs: totalMs,
      frames: frameTimes.length,
      averageFps: 1000 / averageFrameMs,
      averageFrameMs,
      p95FrameMs: sorted[percentileIndex],
      maxFrameMs: sorted[sorted.length - 1],
      dynamicVertexUploads,
      arrayVertexUploads,
    };
  }, { sampleMs: SAMPLE_MS });

  const softwareRenderer = /swiftshader|llvmpipe|lavapipe/i.test(
    result.renderer,
  );
  if (
    pageErrors.length ||
    softwareRenderer ||
    result.width !== 1920 ||
    result.height !== 1080 ||
    result.arrayVertexUploads !== 0 ||
    result.averageFps < MINIMUM_FPS
  ) {
    throw new Error(JSON.stringify({ ...result, pageErrors }));
  }

  console.log(JSON.stringify({ ...result, pageErrors }));
} finally {
  await browser.close();
}
