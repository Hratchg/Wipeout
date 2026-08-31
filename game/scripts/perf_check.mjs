// 1080p performance gate. Requires the Vite dev server at :5173.
// Run: node scripts/perf_check.mjs
import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const chromePath = CHROME_PATHS.find((path) => fs.existsSync(path));
const MINIMUM_FPS = 30;
const MAX_P95_MS = 50;
const SAMPLE_MS = 20_000;
const REQUIRED_ASSET = /\.(glb|png|webp)(\?|$)/i;

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
  const failedRequiredAssets = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (REQUIRED_ASSET.test(request.url())) {
      failedRequiredAssets.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "requestfailed",
      });
    }
  });
  page.on("response", (response) => {
    if (REQUIRED_ASSET.test(response.url()) && response.status() >= 400) {
      failedRequiredAssets.push({
        url: response.url(),
        error: `HTTP ${response.status()}`,
      });
    }
  });

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__gameReady && window.__arenaReady, undefined, {
    timeout: 60_000,
  });

  const metrics = await page.evaluate(async ({ sampleMs }) => {
    const scene = window.__wipeout.player.root.getScene();
    const engine = scene.getEngine();
    const gl = engine._gl;
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = rendererInfo
      ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    await new Promise((resolve) => {
      const until = performance.now() + 3_000;
      const warmup = (now) => {
        if (now >= until) resolve();
        else requestAnimationFrame(warmup);
      };
      requestAnimationFrame(warmup);
    });

    const samples = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const until = performance.now() + sampleMs;
      const frame = (now) => {
        samples.push(now - last);
        last = now;
        if (now >= until) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    samples.sort((a, b) => a - b);
    const averageMs = samples.reduce((a, b) => a + b, 0) / samples.length;
    return {
      renderer,
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
      frames: samples.length,
      averageFps: 1000 / averageMs,
      p95FrameMs: samples[Math.floor(samples.length * 0.95)],
    };
  }, { sampleMs: SAMPLE_MS });

  const softwareRenderer = /swiftshader|llvmpipe|lavapipe/i.test(metrics.renderer);
  const report = {
    ...metrics,
    pageErrors,
    failedRequiredAssets,
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (metrics.averageFps < MINIMUM_FPS) {
    failures.push(`average FPS ${metrics.averageFps.toFixed(2)} < ${MINIMUM_FPS}`);
  }
  if (metrics.p95FrameMs > MAX_P95_MS) {
    failures.push(`p95 ${metrics.p95FrameMs.toFixed(2)} ms > ${MAX_P95_MS} ms`);
  }
  if (metrics.width !== 1920 || metrics.height !== 1080) {
    failures.push(`viewport ${metrics.width}x${metrics.height} is not 1920x1080`);
  }
  if (softwareRenderer) failures.push(`software renderer: ${metrics.renderer}`);
  if (pageErrors.length) failures.push(`${pageErrors.length} uncaught page error(s)`);
  if (failedRequiredAssets.length) {
    failures.push(`${failedRequiredAssets.length} failed required asset request(s)`);
  }
  if (failures.length) {
    throw new Error(`perf_check failed: ${failures.join("; ")}`);
  }
} finally {
  await browser.close();
}
