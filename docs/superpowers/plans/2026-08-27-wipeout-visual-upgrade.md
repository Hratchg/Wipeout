# Wipeout Visual Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the functional course into a polished, sunny, asset-rich
television obstacle arena while preserving all gameplay and input behavior.

**Architecture:** A typed arena-asset catalog loads generated GLBs once and
hands visual factories to the existing world and hazard builders. Gameplay
continues to use the current row/lane model and hazard timing; generated models
are presentation children of the existing transforms. Procedural sky, water,
lighting, particles, and broadcast UI unify the generated models and provide
reliable fallbacks.

**Tech Stack:** TypeScript 6, Vite 8, Babylon.js 9, Babylon GUI, Playwright,
Gemini image generation, Tripo3D image-to-GLB, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-08-27-wipeout-visual-upgrade-design.md`

## Global Constraints

- Preserve the normalized actions: `jump`, `left`, `right`, `forward`, `back`.
- Preserve the 23-row course, scoring, lives, checkpoints, and hazard timing.
- A real person jumping in place must map to exactly one on-screen jump; do not
  tune gesture thresholds from simulated footage.
- Use original fictional arena graphics, not exact television-network artwork.
- Treat $10 as an adjustable estimate. Record every paid generation and explain
  any projected overage before incurring it.
- Target 60 FPS at 1920×1080; minimum acceptable performance is stable 30 FPS.
- Keep primitive fallbacks for every generated asset.
- Do not create git commits unless Hratch explicitly requests them.

---

### Task 1: Lock the visual asset contract

**Files:**
- Create: `game/src/assets/arena/manifest.json`
- Create: `game/scripts/verify_arena_assets.mjs`
- Create: `scripts/generate_arena_assets.sh`
- Modify: `game/package.json`
- Modify: `game/package-lock.json`
- Create after generation: `game/src/assets/arena/refs/*.png`
- Create after generation: `game/src/assets/arena/arena_decals.png`
- Create after conversion: `game/src/assets/arena/*.glb`

**Interfaces:**
- Produces manifest entries shaped as
  `{ id, glb, reference, inGameSize, costCents, fallback }`.
- Produces generated IDs:
  `platform`, `ballMount`, `sweeperHub`, `sweeperArm`, `pistonWall`,
  `pistonPad`, `movingPlatform`, `finishGate`, `spectatorStand`,
  `cameraTower`, `arenaProps`.

- [ ] **Step 1: Write the failing asset verifier**

Create `game/scripts/verify_arena_assets.mjs`:

```js
import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync(new URL("../src/assets/arena/manifest.json", import.meta.url)),
);
const required = [
  "platform", "ballMount", "sweeperHub", "sweeperArm", "pistonWall",
  "pistonPad", "movingPlatform", "finishGate", "spectatorStand",
  "cameraTower", "arenaProps",
];
const ids = new Set(manifest.assets.map((asset) => asset.id));
const missingIds = required.filter((id) => !ids.has(id));
const missingFiles = manifest.assets
  .map((asset) => new URL(`../src/assets/arena/${asset.glb}`, import.meta.url))
  .filter((url) => !fs.existsSync(url));
const decal = new URL("../src/assets/arena/arena_decals.png", import.meta.url);
if (missingIds.length || missingFiles.length || !fs.existsSync(decal)) {
  console.error({ missingIds, missingFiles: missingFiles.map(String) });
  process.exit(1);
}
const total = manifest.assets.reduce(
  (sum, asset) => sum + asset.costCents,
  manifest.styleSheetCostCents + manifest.decalCostCents,
);
console.log(`Arena assets verified; recorded spend $${(total / 100).toFixed(2)}`);
```

- [ ] **Step 2: Add the empty manifest and verify the test fails**

Create the manifest with:

```json
{
  "styleSheetCostCents": 0,
  "decalCostCents": 0,
  "assets": []
}
```

Run: `cd game && node scripts/verify_arena_assets.mjs`

Expected: exit 1 listing all eleven missing IDs.

- [ ] **Step 3: Create the resume-safe generation script**

`scripts/generate_arena_assets.sh` must:

1. Generate one 16:9 Gemini style sheet showing a sunny inflatable obstacle
   arena with saturated red/yellow/blue/green forms.
2. Generate one 1K Gemini reference per asset, derived image-to-image from the
   style sheet. Each prompt requests a single centered object, three-quarter
   elevated view, matte/glossy padded vinyl, opaque parts, and a light-gray
   background.
3. Review references before conversion by stopping after image generation when
   invoked with `--references-only`.
4. Convert approved references with Tripo3D normal-quality `glb`.
5. Resume any `.tripo.json` sidecar rather than resubmitting it.
6. Print accumulated cost from each tool's JSON response.

The style prompts must distinguish moving parts: `sweeperHub` and
`sweeperArm` are separate models; `pistonWall` and `pistonPad` are separate
models.

- [ ] **Step 4: Generate and visually review references**

Run: `./scripts/generate_arena_assets.sh --references-only`

Open every PNG under `game/src/assets/arena/refs/`. Reject references with
multiple views, text baked into geometry, cropped silhouettes, checkerboard
transparency, or incompatible style. Review `arena_decals.png` separately:
warning stripes and lane/checkpoint symbols must remain legible when reduced to
256 px; fictional lettering must not contain malformed characters.

- [ ] **Step 5: Convert approved references and update the manifest**

Run: `./scripts/generate_arena_assets.sh`

Record exact costs and in-game dimensions in `manifest.json`. Use these target
sizes:

- Platform: `2.25m × 0.55m × 2.25m`
- Ball mount: `2.2m diameter footprint`
- Sweeper hub: `1.1m diameter × 2.4m high`
- Sweeper arm: `7.2m × 0.5m × 0.7m`
- Piston wall: `0.8m × 2.8m × 2m`
- Piston pad: `1.2m × 1.4m × 1.5m`
- Moving platform: `2.3m × 0.5m × 2m`
- Finish gate: `9m × 4m × 1m`
- Spectator stand: `12m × 5m × 4m`
- Camera tower: `2m × 5m × 2m`
- Arena props: `3m cluster footprint`

- [ ] **Step 6: Inspect and optimize runtime GLBs**

Install the current glTF Transform CLI:

```bash
cd game
npm install -D @gltf-transform/cli
```

For each generated file, run:

```bash
npx gltf-transform inspect src/assets/arena/platform.glb
npx gltf-transform optimize src/assets/arena/platform.glb /tmp/platform.glb \
  --texture-compress webp
mv /tmp/platform.glb src/assets/arena/platform.glb
```

Repeat with each manifest GLB. Reject and regenerate any static prop containing
animations, more than 25 mesh primitives, or textures larger than 2048 px.
Record final byte sizes in the manifest.

- [ ] **Step 7: Verify the asset contract passes**

Run: `cd game && node scripts/verify_arena_assets.mjs`

Expected: exit 0 with recorded spend.

---

### Task 2: Add the resilient arena asset catalog

**Files:**
- Create: `game/src/game/arenaAssets.ts`
- Modify: `game/src/main.ts`
- Create: `game/scripts/visual_smoke.mjs`

**Interfaces:**
- Produces:

```ts
export type ArenaAssetId =
  | "platform" | "ballMount" | "sweeperHub" | "sweeperArm"
  | "pistonWall" | "pistonPad" | "movingPlatform" | "finishGate"
  | "spectatorStand" | "cameraTower" | "arenaProps";

export interface ArenaAssets {
  instantiate(id: ArenaAssetId, name: string): TransformNode | null;
  has(id: ArenaAssetId): boolean;
  failures: ReadonlyArray<ArenaAssetId>;
}

export function loadArenaAssets(scene: Scene): Promise<ArenaAssets>;
```

- `window.__arenaReady` becomes `true` after loading succeeds or falls back.
- Consumes GLB paths from `game/src/assets/arena/manifest.json`.

- [ ] **Step 1: Write a failing Playwright catalog check**

Create `game/scripts/visual_smoke.mjs` that launches Chrome, loads the running
game, waits for `window.__arenaReady`, and asserts:

```js
const result = await page.evaluate(() => ({
  ready: window.__arenaReady,
  failures: window.__wipeout.arenaAssets.failures,
  platformPresent: window.__wipeout.arenaAssets.has("platform"),
}));
if (!result.ready || !result.platformPresent || result.failures.length) {
  throw new Error(JSON.stringify(result));
}
```

- [ ] **Step 2: Run the smoke test and verify it fails**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: FAIL because `window.__arenaReady` and `arenaAssets` do not exist.

- [ ] **Step 3: Implement `loadArenaAssets`**

Load each unique GLB once with `SceneLoader.LoadAssetContainerAsync`. Keep
containers disabled and instantiate copies through
`container.instantiateModelsToScene`. Normalize each returned root using the
manifest target dimensions. Catch individual failures, record the ID, and
return `null` from `instantiate` so builders use primitives.

Resolve manifest filenames through:

```ts
const arenaGlbs = import.meta.glob<string>("../assets/arena/*.glb", {
  query: "?url",
  import: "default",
});
```

Match each manifest `glb` filename to the corresponding glob key before
calling its URL resolver.

- [ ] **Step 4: Bootstrap assets before world construction**

Update `main.ts` to use top-level `await`:

```ts
const arenaAssets = await loadArenaAssets(scene);
(window as unknown as Record<string, unknown>).__arenaReady = true;
const world = buildWorld(scene, arenaAssets);
```

Expose `arenaAssets` on `window.__wipeout` for visual QA.

- [ ] **Step 5: Run build and catalog smoke test**

Run:

```bash
cd game
npm run build
node scripts/visual_smoke.mjs
```

Expected: both exit 0 and `failures` is empty.

---

### Task 3: Build the sunny broadcast arena

**Files:**
- Create: `game/src/game/arena.ts`
- Create: `game/src/game/materials.ts`
- Modify: `game/src/game/builder.ts:1-211`
- Modify: `game/src/game/course.ts` only if decorative anchors need exported
  constants; do not change `COURSE`.

**Interfaces:**
- Produces:

```ts
export interface ArenaEnvironment {
  root: TransformNode;
  water: Mesh;
  update(time: number, dt: number): void;
}

export function buildArenaEnvironment(
  scene: Scene,
  assets: ArenaAssets,
  shadows: ShadowGenerator,
): ArenaEnvironment;
```

- `BuiltWorld` gains `arena: ArenaEnvironment`.
- `buildWorld(scene, assets): BuiltWorld`.

- [ ] **Step 1: Extend the smoke test with arena assertions**

Assert scene nodes named `arena-root`, `ocean`, `spectator-left`,
`spectator-right`, `camera-tower-left`, and `camera-tower-right`.

- [ ] **Step 2: Verify the assertions fail**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: FAIL listing absent arena nodes.

- [ ] **Step 3: Implement coherent PBR materials**

`materials.ts` exports cached material builders:

```ts
export function inflatableMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): PBRMaterial;
export function metalMaterial(scene: Scene, name: string): PBRMaterial;
export function emissiveMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): PBRMaterial;
export function decalMaterial(
  scene: Scene,
  name: string,
  atlasUrl: string,
): PBRMaterial;
```

Inflatables use high roughness, low metallic, and a subtle clear coat. Avoid
per-instance material creation. `decalMaterial` loads
`game/src/assets/arena/arena_decals.png`; warning-stripe and checkpoint planes
reuse the atlas rather than duplicating textures.

- [ ] **Step 4: Implement sky, ocean, and set dressing**

`arena.ts` creates:

- A large animated ocean plane at `WATER_Y`.
- A sky dome with horizon-to-zenith gradient.
- Warm key light and cool fill balanced with existing shadows.
- Generated stands at `x = ±15`, centered near course row 12.
- Generated camera towers at `x = ±9`, rows 5 and 17.
- Repeated buoy/flag clusters along both course edges.

Animate ocean UV/vertices and flags from elapsed time only; do not use a fixed
frame assumption.

- [ ] **Step 5: Replace block tiles visually**

In `builder.ts`, instantiate `platform` for each solid tile at the existing
`laneX(lane), rowZ(row)` position. Retain the hidden primitive body/top as a
fallback and QA reference. Apply checkpoint/finish color accents through child
material overrides or lightweight marker meshes.

- [ ] **Step 6: Add the generated finish gate**

Instantiate `finishGate` at the final row, align it across all three lanes, and
keep the procedural poles/banner disabled only after successful instantiation.
Add six small emissive meshes named `finish-light-0` through
`finish-light-5`; these remain children of the gate root so the effects
controller can flash them without owning finish geometry.

- [ ] **Step 7: Wire arena animation into the render update**

Call `world.arena.update(this.time, dt)` in `Game.update`.

- [ ] **Step 8: Verify the arena**

Run:

```bash
cd game
npm run build
node scripts/visual_smoke.mjs
```

Capture 1280×720 and 1920×1080 screenshots of the title and early course.
Expected: required nodes present, no uncaught errors, course path unobstructed.

---

### Task 4: Replace hero hazard visuals without changing timing

**Files:**
- Modify: `game/src/game/hazards.ts:19-228`
- Modify: `game/src/game/builder.ts:184-208`
- Modify: `game/scripts/visual_smoke.mjs`
- Modify: `game/scripts/proof_video.mjs`

**Interfaces:**
- Constructors accept `assets: ArenaAssets`.
- Every class preserves existing public methods:
  `BigBalls.update/isUp/topY`, `Sweeper.update/isDangerAtLane`,
  `PistonRow.update/extension`, `MovingPlatform.update/currentX`.

- [ ] **Step 1: Add hazard visual assertions**

The smoke test asserts `generated-ball-mount-*`, `generated-sweeper-hub`,
`generated-sweeper-arm`, `generated-piston-wall-*`,
`generated-piston-pad-*`, and `generated-moving-platform`.

- [ ] **Step 2: Verify the hazard assertions fail**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: FAIL with generated hazard nodes absent.

- [ ] **Step 3: Attach Big Ball mounts**

Keep spheres as the moving gameplay surface for predictable top height. Apply
the inflatable PBR material and add one generated `ballMount` beneath each
sphere. Parent each ball and mount to a lane root so bobbing remains identical.

- [ ] **Step 4: Attach sweeper assets**

Parent generated `sweeperHub` and `sweeperArm` to the existing
`sweeper-root`. The arm model and its end caps rotate with the exact existing
`this.angle`; no hit-width or speed changes.

- [ ] **Step 5: Attach piston assets**

Place generated wall models at existing wall coordinates and parent each
generated pad to the mesh currently receiving extension updates. Keep
`PERIOD`, `TRAVEL`, and extension profile unchanged.

- [ ] **Step 6: Attach moving-platform asset**

Replace the visible box with `movingPlatform` under the same moving root.
Preserve `currentX()` and the existing ride/landing tolerances.

- [ ] **Step 7: Re-run deterministic hazard checks**

Run:

```bash
cd game
npm run build
node scripts/visual_smoke.mjs
node scripts/proof_video.mjs
```

Expected: build and smoke pass; proof result prints
`{"state":"win","row":22,...}` and includes the intentional sweeper wipeout.

---

### Task 5: Add effects, character response, and reduced motion

**Files:**
- Modify: `game/src/game/effects.ts`
- Create: `game/src/game/cameraEffects.ts`
- Modify: `game/src/game/player.ts`
- Modify: `game/src/game/game.ts`
- Modify: `game/src/ui/hud.ts`
- Modify: `game/src/types.ts` if a reduced-motion setting type is needed.

**Interfaces:**
- Produces:

```ts
export class EffectsController {
  constructor(scene: Scene, camera: FreeCamera, reducedMotion: () => boolean);
  impact(position: Vector3): void;
  splash(position: Vector3): void;
  checkpoint(position: Vector3): void;
  finish(position: Vector3): void;
  update(dt: number): void;
}
```

- `Ui` produces `setReducedMotion(on: boolean)`, `isReducedMotion(): boolean`,
  `showCheckpoint(row: number): void`, and `showFinalRun(): void`.

- [ ] **Step 1: Extend UI/effects smoke checks**

Test that the select menu includes `MOTION: FULL` or `MOTION: REDUCED`, and that
calling `effects.checkpoint`/`effects.finish` produces named particle systems
without throwing.

- [ ] **Step 2: Verify the checks fail**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: FAIL because the motion option and effects controller are absent.

- [ ] **Step 3: Upgrade splash and celebration effects**

Keep `splashAt` compatibility, then add foam-ring particles, impact flashes,
checkpoint color bursts, and red/yellow/blue finish confetti. Reuse one dynamic
particle texture per effect type.

- [ ] **Step 4: Implement bounded camera impulses**

`cameraEffects.ts` stores translational/rotational impulse values, decays them
exponentially in `update`, and applies them after the chase-camera target is
computed. Reduced motion limits impulses to 15% and disables finish push-in.
`finish` also flashes scene nodes named `finish-light-*` by animating their
shared emissive material for 1.8 seconds.

- [ ] **Step 5: Add character squash and lean**

In `Player.update`, drive a separate `visualRoot` scale/rotation:

- Step: slight forward lean, returning to neutral on landing.
- Leap/bounce: vertical stretch during ascent and mild squash on landing.
- Tumble: keep the existing root rotation.

Do not alter tween duration, row/lane state, or collision decisions.

- [ ] **Step 6: Wire gameplay events**

`Game` invokes:

- `effects.impact` before `startTumble`.
- `effects.splash` from `player.onSplash`.
- `effects.checkpoint` only when a checkpoint is claimed the first time.
- `effects.finish` from `win`.

Construct the controller after the camera is created:

```ts
this.effects = new EffectsController(
  this.scene,
  this.camera,
  () => this.ui.isReducedMotion(),
);
```

Call `effects.update(dt)` after the chase-camera position and target are
computed. When the player triggers a jump from the final checkpoint at row 20,
call `ui.showFinalRun()` before starting the tween.

- [ ] **Step 7: Add reduced-motion menu control**

Add `motion` to `MenuItemId` and `MENU_ITEMS`. Selecting it toggles persisted
localStorage key `wipeout.reducedMotion`; label is `MOTION: FULL` or
`MOTION: REDUCED`.

- [ ] **Step 8: Verify behavior**

Run build and smoke tests, then capture a checkpoint and finish screenshot.
Expected: effects visible in full mode; menu toggle persists after reload; the
same automated path still reaches row 22.

---

### Task 6: Apply the television broadcast UI package

**Files:**
- Modify: `game/src/ui/hud.ts`
- Modify: `game/src/style.css`
- Modify: `game/scripts/ui_check.mjs`

**Interfaces:**
- Preserve every current public `Ui` method.
- Add only `setReducedMotion`, `isReducedMotion`, `showCheckpoint`,
  `showFinalRun`, and private layout helpers.

- [ ] **Step 1: Update screenshot assertions**

`ui_check.mjs` captures title, select, HUD, key overlay, game-over, win, and
checkpoint lower-third at both 1280×720 and 1920×1080. Add pixel-size assertions
using Babylon control measurements so HUD panels remain inside 5% safe margins.

- [ ] **Step 2: Verify new assertions fail**

Run: `cd game && node scripts/ui_check.mjs`

Expected: FAIL because broadcast panel names and checkpoint lower-third are
absent.

- [ ] **Step 3: Build reusable broadcast panels**

Wrap hearts, timer, and score in rounded, semi-opaque dark panels with
red/yellow/blue accent bars. Use `idealHeight = 1080` and alignment-based
anchors rather than viewport-specific pixel positions.

- [ ] **Step 4: Upgrade menus and end screens**

Add:

- A bright header ribbon and fictional `SPLASH ARENA` mark.
- Larger focused rows with an animated yellow selection border.
- Icon-plus-text status treatment for voice and camera.
- Framed game-over/win statistics and stronger button prompt.
- A final-run lower-third that appears when the player leaves the last
  checkpoint and clears before the finish overlay.

- [ ] **Step 5: Add checkpoint lower-third**

`showCheckpoint(row)` displays `CHECKPOINT REACHED` for 1.2 seconds with a
slide/fade animation and does not block pointer or keyboard input.

- [ ] **Step 6: Verify both TV resolutions**

Run: `cd game && node scripts/ui_check.mjs`

Review all outputs for clipping, low contrast, or course obstruction. Expected:
all assertions pass at both sizes.

---

### Task 7: Final integration, performance, proof, and documentation

**Files:**
- Modify: `game/scripts/proof_video.mjs`
- Create: `game/scripts/perf_check.mjs`
- Modify: `README.md`
- Replace: `game/public/proof.mp4`

**Interfaces:**
- `perf_check.mjs` reports average FPS, 95th percentile frame time, renderer,
  uncaught errors, and failed required asset requests at 1920×1080.

- [ ] **Step 1: Write the performance gate**

Record 20 seconds of frame deltas from the running game after assets load:

```js
const metrics = await page.evaluate(async () => {
  const samples = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const until = performance.now() + 20_000;
    const frame = (now) => {
      samples.push(now - last);
      last = now;
      if (now >= until) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  samples.sort((a, b) => a - b);
  return {
    averageFps: 1000 / (samples.reduce((a, b) => a + b) / samples.length),
    p95FrameMs: samples[Math.floor(samples.length * 0.95)],
  };
});
```

Fail below 30 FPS or when p95 exceeds 50 ms.

- [ ] **Step 2: Run all structural gates**

Run:

```bash
cd game
npm run build
node scripts/verify_arena_assets.mjs
node scripts/visual_smoke.mjs
node scripts/ui_check.mjs
node scripts/e2e_cv_test.mjs
node scripts/perf_check.mjs
```

Expected: every command exits 0. The CV test verifies transport and normalized
actions only; it is not a substitute for real-human calibration.

- [ ] **Step 3: Run real-human jump acceptance**

On the target mini-PC with a webcam:

```bash
cd input-service
.venv/bin/python wipeout_input.py --preview
```

Have one person stand neutral through calibration, then jump in place ten
times. Pass criterion: ten physical jumps produce ten on-screen jumps, with no
extra actions during airborne or landing frames. Record misses/duplicates and
camera distance; tune jump threshold/cooldown only from this session.

- [ ] **Step 4: Record and watch the proof**

Run: `cd game && node scripts/proof_video.mjs`

Encode to 15–20 seconds:

```bash
ffmpeg -y -i /tmp/wipeout_proof/*.webm \
  -filter:v "setpts=0.65*PTS" -an -c:v libx264 -pix_fmt yuv420p \
  -movflags +faststart public/proof.mp4
```

Watch the complete MP4. Confirm it shows title, generated contestant, early
course, Big Balls, intentional sweeper wipeout, moving platform, and win.

- [ ] **Step 5: Update durable project status**

Update `README.md` with:

- New visual features and exact remaining hardware UAT.
- Every generated asset, in-game size, path, and actual cost.
- Total spend including references and rejected generations.
- 1080p performance measurements.
- Proof-video path and kiosk launch instructions.

- [ ] **Step 6: Run final repository checks**

Run:

```bash
git status --short
cd game && npm run build
```

Expected: only intentional source/assets/docs changes; build exits 0.

Do not commit unless Hratch explicitly asks for a commit.
