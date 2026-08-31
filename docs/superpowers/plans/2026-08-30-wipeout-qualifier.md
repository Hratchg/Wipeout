# Wipeout Qualifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player start either a 15-row timed Qualifier or the current
23-row Main Event from two select-screen buttons, without changing the five
actions or Main Event rules.

**Architecture:** A course catalog holds two `Course` records. Helpers take
the active row list. `buildWorld` still creates lighting, shadows, and the
arena once, sized for the longest catalog course. The playfield (tiles,
finish gate, hazards) is parented under `course-playfield` and rebuilt in
`startRun(courseId)` so the scene matches the chosen layout. `Game` stores
`this.course` and drives the timer, win bonus, and time-up from `course.rules`.

**Tech Stack:** TypeScript 6, Vite 8, Babylon.js 9, Babylon GUI, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-wipeout-qualifier-design.md`

## Global Constraints

- Preserve the normalized actions: `jump`, `left`, `right`, `forward`, `back`.
- Main Event stays the current 23-row course, 3 lives, checkpoints, and
  `max(0, 240 - elapsed) * 5` time bonus.
- Qualifier is the spec's 15-row layout, 50.0s countdown, 3 lives,
  remaining whole seconds × 5 on finish, `TIME'S UP!` at 0:00.
- Same 3 lanes, leap-only-over-water, and current collision volumes.
- Reuse the existing generated hazard kit only. No new paid assets.
- Original Splash Arena branding only. Do not reproduce a real television
  set, network logo, or branded graphics.
- The two starts are independent. Do not unlock Main Event behind Qualifier.
- Do not create git commits unless Hratch explicitly requests them.

## File map

| File | Responsibility |
|------|----------------|
| `game/src/game/course.ts` | `RowSpec`, geometry constants, helpers that take `rows`, catalog, `finishTimeBonus` |
| `game/src/game/builder.ts` | `buildWorld(scene, assets)` once; `buildPlayfield(scene, assets, course)` for tiles/hazards |
| `game/src/game/arena.ts` | Size ocean/sky from `maxCourseRowCount()` |
| `game/src/game/game.ts` | `this.course`, `startRun(id)`, countdown, time-up, rebuild playfield |
| `game/src/ui/hud.ts` | Two Start rows, timer label, ribbons, `TIME'S UP!` |
| `game/scripts/course_catalog_check.mjs` | Catalog, helper, and bonus assertions |
| `game/scripts/qualifier_check.mjs` | Browser: start both courses, finish Qualifier, force time-up |
| `game/scripts/ui_check.mjs` | Capture both Start rows and Qualifier HUD/end states |
| `game/scripts/proof_video.mjs` | Explicit Main Event start; keep sweeper wipeout + win |
| `README.md` | Both courses and the Qualifier clock rule |

---

### Task 1: Course catalog and row helpers

**Files:**
- Modify: `game/src/game/course.ts`
- Modify: `game/scripts/controls_collision_check.mjs`
- Create: `game/scripts/course_catalog_check.mjs`

**Interfaces:**
- Produces:

```ts
export type CourseId = "qualifier" | "main";

export interface CourseRules {
  lives: 3;
  countdownSeconds: number | null;
  remainingTimeBonus: number;
  parSeconds: number | null;
}

export interface Course {
  id: CourseId;
  title: string;
  broadcastLabel: string;
  rows: RowSpec[];
  rules: CourseRules;
}

export function getCourse(id: CourseId): Course;
export function maxCourseRowCount(): number;
export function finishRowOf(rows: RowSpec[]): number;
export function checkpointRowsOf(rows: RowSpec[]): number[];
export function isLandable(lane: number, row: number, rows: RowSpec[]): boolean;
export function isWaterAt(lane: number, row: number, rows: RowSpec[]): boolean;
export function leapLandingRow(
  lane: number,
  fromRow: number,
  rows: RowSpec[],
): number | null;
export function finishTimeBonus(course: Course, elapsed: number): number;
```

- `getCourse("main").rows` is the current 23-row layout, unchanged.
- `getCourse("qualifier").rows` is the spec table (15 rows, finish at 14).
- Qualifier rules: `countdownSeconds: 50`, `remainingTimeBonus: 5`,
  `parSeconds: null`.
- Main rules: `countdownSeconds: null`, `remainingTimeBonus: 0`,
  `parSeconds: 240`.
- `finishTimeBonus` for Main: `Math.max(0, Math.round(240 - elapsed)) * 5`.
- `finishTimeBonus` for Qualifier: `Math.max(0, Math.floor(50 - elapsed)) * 5`.
- Keep exporting `COURSE` as `getCourse("main").rows` and
  `FINISH_ROW` as `finishRowOf(COURSE)` so later tasks can migrate callers
  incrementally. Do not keep helpers closed over those globals.

- [ ] **Step 1: Write the failing catalog checks**

Create `game/scripts/course_catalog_check.mjs`:

```js
import {
  getCourse,
  maxCourseRowCount,
  finishRowOf,
  checkpointRowsOf,
  isWaterAt,
  isLandable,
  leapLandingRow,
  finishTimeBonus,
} from "../src/game/course.ts";

let failed = 0;
function assert(name, condition) {
  if (condition) console.log(`  ok  ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

const main = getCourse("main");
const qual = getCourse("qualifier");
assert("main has 23 rows", main.rows.length === 23);
assert("qualifier has 15 rows", qual.rows.length === 15);
assert("max row count is 23", maxCourseRowCount() === 23);
assert("qualifier finish is 14", finishRowOf(qual.rows) === 14);
assert("qualifier title", qual.title === "QUALIFIER");
assert("qualifier ribbon", qual.broadcastLabel === "QUALIFIER LIVE");
assert("qualifier countdown 50", qual.rules.countdownSeconds === 50);
assert("main has no countdown", main.rules.countdownSeconds === null);
assert("qualifier leap from row 2 lands on 4", leapLandingRow(1, 2, qual.rows) === 4);
assert("qualifier cannot leap from row 0", leapLandingRow(1, 0, qual.rows) === null);
assert("qualifier center hole is water", isWaterAt(1, 2, qual.rows) === true);
assert("qualifier sweeper hub blocked", isLandable(1, 8, qual.rows) === false);
assert("qualifier finish landable", isLandable(1, 14, qual.rows) === true);
assert("qualifier checkpoints", checkpointRowsOf(qual.rows).join(",") === "0,7,12");
assert("main bonus 10s elapsed", finishTimeBonus(main, 10) === 1150);
assert("qual bonus 12.4 remaining", finishTimeBonus(qual, 37.6) === 60);
assert("qual bonus at time-up", finishTimeBonus(qual, 50) === 0);
assert("qual bonus overtime", finishTimeBonus(qual, 51) === 0);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
```

Fix the leap comment in the assert name to a short string:
`"qualifier leap from row 2 lands on 4"`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd game && node scripts/course_catalog_check.mjs`

Expected: FAIL because `getCourse` is not exported.

- [ ] **Step 3: Implement the catalog and parameterize helpers**

In `course.ts`:

- Keep `RowSpec`, `LANE_*`, `ROW_D`, `laneX`, `rowZ`, `WATER_Y`.
- Move the current `COURSE` array literal into `MAIN_ROWS`.
- Add `QUALIFIER_ROWS` exactly as the spec table.
- Export `COURSES` / `getCourse` / `maxCourseRowCount`.
- Change `isLandable`, `isWaterAt`, and `leapLandingRow` to take `rows` and
  use `finishRowOf(rows)` instead of the `COURSE` global.
- Add `finishTimeBonus`.
- Re-export `COURSE = getCourse("main").rows` and
  `FINISH_ROW = finishRowOf(COURSE)` for the not-yet-migrated callers.

- [ ] **Step 4: Update the existing leap assertion**

In `controls_collision_check.mjs`, pass `COURSE` (or `getCourse("main").rows`)
as the third argument to every `leapLandingRow` call.

- [ ] **Step 5: Run both checks**

Run:

```bash
cd game
node scripts/course_catalog_check.mjs
node scripts/controls_collision_check.mjs
```

Expected: both exit 0.

Do not commit unless Hratch asks.

---

### Task 2: Builder and arena take a Course

**Files:**
- Modify: `game/src/game/builder.ts`
- Modify: `game/src/game/arena.ts`
- Modify: `game/src/game/hazards.ts` (add `dispose()` on each hazard class)

**Interfaces:**
- Consumes: `Course` from Task 1.
- Produces:

```ts
export interface BuiltWorld {
  hazards: CourseHazards;
  shadows: ShadowGenerator;
  arena: ArenaEnvironment;
  playfield: TransformNode;
}

export function buildWorld(
  scene: Scene,
  arenaAssets: ArenaAssets,
  course: Course = getCourse("main"),
): BuiltWorld;

export function rebuildPlayfield(
  world: BuiltWorld,
  scene: Scene,
  arenaAssets: ArenaAssets,
  course: Course,
): void;
```

- `buildArenaEnvironment` uses `maxCourseRowCount()` for water/sky length so
  the arena is not rebuilt when switching courses.
- Playfield node name: `course-playfield`. Tiles, finish gate, and hazard
  roots parent to it.
- `CourseHazards.dispose()` (or each class `dispose()`) disposes those roots
  so a rebuild does not leak meshes.
- Both catalog courses include balls, sweeper, pistons, and platform, so
  `CourseHazards` fields stay required. If a future course omits one, find
  the row with `rows.findIndex` and skip constructing that hazard — but do
  not invent optional fields in this task unless a course actually omits one.
- `buildWorld` default course is Main Event so `main.ts` can stay a one-line
  change until Task 3.

- [ ] **Step 1: Add a failing smoke assertion for playfield rebuild**

In `game/scripts/visual_smoke.mjs`, after `__arenaReady`, assert:

```js
const playfield = scene.getNodeByName("course-playfield");
const qualifierMissing = !window.__wipeout.rebuildPlayfield;
```

Do not call rebuild yet. Add:

```js
playfieldPresent: !!playfield,
```

to the result and fail when it is missing.

- [ ] **Step 2: Run visual smoke and confirm the new assertion fails**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: FAIL on missing `course-playfield` (dev server at :5173).

- [ ] **Step 3: Implement playfield build/rebuild**

- Add `dispose()` to `BigBalls`, `Sweeper`, `PistonRow`, and `MovingPlatform`
  that disposes their root node(s).
- Extract the current tile/finish/hazard block from `buildWorld` into
  `buildPlayfield(scene, assets, course, shadows)` returning
  `{ playfield, hazards }`.
- Replace every `COURSE` read inside that block with `course.rows`.
- `buildWorld` builds sun/shadows/arena, then `buildPlayfield` for the given
  course.
- `rebuildPlayfield` disposes `world.playfield` and `world.hazards`, then
  assigns the new playfield and hazards onto `world`.

- [ ] **Step 4: Re-run visual smoke**

Run: `cd game && node scripts/visual_smoke.mjs`

Expected: exit 0. Main Event nodes from Task 4 of the visual plan still exist
(`generated-sweeper-arm`, etc.).

Do not commit unless Hratch asks.

---

### Task 3: Game binds a course, countdown, and time-up

**Files:**
- Modify: `game/src/game/game.ts`
- Modify: `game/src/main.ts`
- Create: `game/scripts/qualifier_check.mjs`

**Interfaces:**
- Consumes: `getCourse`, `leapLandingRow(lane, row, rows)`,
  `finishTimeBonus`, `rebuildPlayfield`.
- Produces:

```ts
class Game {
  course: Course; // current run; Main Event before the first start
  startRun(id: CourseId): void;
}
```

- `activateMenuItem` calls `startRun("qualifier")` or `startRun("main")`
  once Task 4 exists. In this task, temporarily map the existing `start`
  menu id to `startRun("main")` so Main Event still launches.
- `startRun(id)`:
  1. `this.course = getCourse(id)`
  2. `rebuildPlayfield(this.world, this.scene, this.arenaAssets, this.course)`
  3. Reset lives/score/checkpoints/elapsed as today
  4. `this.ui.applyCourse(this.course)` — Task 3 adds a minimal
     `applyCourse` / `setGameoverTitle` on `Ui` so the browser check can
     read copy; Task 4 fills in ribbon and timer-label presentation.
  5. `player.respawn(1, 0)` and `state = "playing"`
- Replace `COURSE` / `FINISH_ROW` / `leapLandingRow(lane, row)` in
  `tryMove`, `evaluateLanding`, and `handlePlayAction` with
  `this.course.rows` and `finishRowOf(this.course.rows)`.
- Final-run banner: show when leaping onto the finish row of **this**
  course, not hardcoded row 20.
- `win()`: `this.score += 500 + finishTimeBonus(this.course, this.elapsed)`.
  Qualifier win stats: `TIME LEFT: m:ss.t   SCORE: n`.
  Main Event win stats stay `TIME: m:ss.t   SCORE: n`.
- `update` while playing:
  - Main: `elapsed = time - startTime`; `ui.setTimer(elapsed)`.
  - Qualifier: `elapsed = time - startTime`;
    `remaining = course.rules.countdownSeconds - elapsed`;
    `ui.setTimer(Math.max(0, remaining))`.
    If `remaining <= 0` and state is `playing`, call `timeUp()`.
- `timeUp()`: `state = "gameover"`; keep score; no remaining-time bonus;
  `ui.setEndStats("gameover", \`SCORE: ${score}\`)`;
  `ui.setGameoverTitle("TIME'S UP!")`; `ui.showScreen("gameover")`.
- `loseLife` to zero uses `ui.setGameoverTitle("TOTAL WIPEOUT!")` so a
  clock-out and a wipeout-out are distinct.
- `main.ts` keeps `buildWorld(scene, arenaAssets)` (defaults to Main) and
  passes `arenaAssets` into `Game` so `startRun` can rebuild.

- [ ] **Step 1: Write the failing browser check**

Create `game/scripts/qualifier_check.mjs` (Playwright, Chrome, :5173,
1920×1080 Metal, same launch pattern as `perf_check.mjs`):

```js
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
// expect qualifier / 15 / 14 / playing

const timedOut = await page.evaluate(async () => {
  const { game } = window.__wipeout;
  game.startRun("qualifier");
  game.startTime = game.time - 50.05;
  game.update(0.016);
  return {
    state: game.state,
    title: game.ui.gameoverTitle?.text ?? null,
  };
});
// expect gameover + TIME'S UP!

const main = await page.evaluate(() => {
  const { game } = window.__wipeout;
  game.startRun("main");
  return { id: game.course.id, rows: game.course.rows.length };
});
// expect main / 23
```

Expose `game.startTime` as a test seam: make it public on `Game` (it is
already a private field — change to public `startTime` / keep
`this.time` readable, or add `debugSetElapsed(seconds)`). Prefer
`debugSetElapsed(seconds)` so production code stays clean:

```ts
debugSetElapsed(seconds: number): void {
  this.startTime = this.time - seconds;
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd game && node scripts/qualifier_check.mjs`

Expected: FAIL (`startRun` does not take an id, or `course` is missing).

- [ ] **Step 3: Implement Game + main.ts wiring**

If `ui.applyCourse` / `setGameoverTitle` do not exist yet, call nothing
and set a `Game` field `endTitle` that Task 4 reads, **or** add the two
Ui methods in this task as thin setters. Prefer adding the Ui setters
here so the check can read `game.ui.gameoverTitle.text`.

- [ ] **Step 4: Re-run the qualifier check**

Run: `cd game && node scripts/qualifier_check.mjs`

Expected: exit 0.

Do not commit unless Hratch asks.

---

### Task 4: Select screen and Qualifier HUD copy

**Files:**
- Modify: `game/src/ui/hud.ts`
- Modify: `game/src/game/game.ts` (`activateMenuItem` only)
- Modify: `game/scripts/ui_check.mjs`

**Interfaces:**
- Produces:

```ts
export type MenuItemId =
  | "voice"
  | "camera"
  | "motion"
  | "startQualifier"
  | "startMain";

class Ui {
  applyCourse(course: Course): void;
  setGameoverTitle(title: string): void;
  setTimerLabel(label: string): void;
}
```

- `MENU_ITEMS = ["voice", "camera", "motion", "startQualifier", "startMain"]`.
- Labels: `START QUALIFIER` and `START MAIN EVENT`. Both use the play icon.
- Initial `focusIndex` still 0 (Voice).
- `applyCourse`:
  - Timer eyebrow: Qualifier `TIME LEFT`, Main `COURSE TIME`.
  - HUD header strap (add `broadcast-header-hud` if the HUD has no ribbon
    today): `course.broadcastLabel`. Place it behind the three stat
    panels (`zOffset` lower) or as a 72px bar at `SAFE_Y` and move the
    three panels to `SAFE_Y + 78` so they do not cover the strap. Do the
    panel shift for **both** courses so layout stays one code path.
  - Win header strap: Qualifier `QUALIFIER LIVE`, Main
    `FINISH LINE LIVE`.
  - Gameover header strap: Qualifier `QUALIFIER LIVE`, Main
    `RESULTS DESK`.
- `setGameoverTitle` writes the big gameover card title
  (`TOTAL WIPEOUT!` vs `TIME'S UP!`). Default remains `TOTAL WIPEOUT!`.
- `activateMenuItem`: `startQualifier` → `startRun("qualifier")`;
  `startMain` → `startRun("main")`.
- Select header stays `CONTROL DESK`.

- [ ] **Step 1: Update ui_check for the new rows and Qualifier states**

In `game/scripts/ui_check.mjs`:

- Replace capture id `menu-row-start` with
  `menu-row-startQualifier` and `menu-row-startMain`.
- After opening select, assert `menuFocused() === "voice"`.
- Navigate down to `startQualifier` (3 × `back`) and capture `select`.
- Drive `game.startRun("qualifier")`, capture `hud`.
- Force time-up via `debugSetElapsed(50.05)` + `game.update(0.016)`,
  capture `gameover`.
- `game.startRun("qualifier")` then teleport/win path **or**
  `game.ui.showScreen("win")` after `applyCourse(getCourse("qualifier"))`
  and capture `win`. Prefer a real finish if the check already has a
  win path; otherwise `applyCourse` + `showScreen("win")` is enough for
  copy, and `qualifier_check.mjs` already covers real time-up.
- Keep the existing 720p/1080p loop.

- [ ] **Step 2: Run ui_check and confirm it fails**

Run: `cd game && node scripts/ui_check.mjs`

Expected: FAIL on missing `menu-row-startQualifier`.

- [ ] **Step 3: Implement the HUD and menu wiring**

Name the timer eyebrow `hud-timer-label` so tests can read
`TIME LEFT` / `COURSE TIME`.

- [ ] **Step 4: Re-run ui_check and qualifier_check**

Run:

```bash
cd game
node scripts/ui_check.mjs
node scripts/qualifier_check.mjs
```

Expected: both exit 0. Review the new PNGs under
`.superpowers/sdd/2026-08-27-wipeout-visual-upgrade/` (or a new
`.superpowers/sdd/2026-08-30-wipeout-qualifier/` folder if you do not
want to mix them — prefer a new qualifier SDD folder).

Do not commit unless Hratch asks.

---

### Task 5: Qualifier finish path, Main Event proof, docs

**Files:**
- Modify: `game/scripts/proof_video.mjs`
- Create: `game/scripts/qualifier_proof.mjs` (or extend `qualifier_check.mjs`
  with a finish playthrough — prefer extending `qualifier_check.mjs`)
- Modify: `README.md`

**Interfaces:**
- Qualifier automated finish: start Qualifier, walk the 15-row path
  (hole dodge, leap, Big Balls, sweeper clear, pistons center, platform,
  final leap), assert `state === "win"`, `course.id === "qualifier"`,
  and win stats contain `TIME LEFT`.
- Main Event `proof_video.mjs`: after the menu, navigate to
  `startMain` (or call `game.startRun("main")` after the title beat so
  the video still shows the new select rows). Keep the intentional
  sweeper wipeout and win. Do not switch this video to Qualifier.
- README **What is built**: both courses, two Start buttons, Qualifier
  50s countdown and `TIME'S UP!`.
- README **What is left**: standing jump UAT, mini-PC FPS, Vosk — do not
  drop those.

Qualifier finish choreography (row numbers are Qualifier rows):

```js
// start at 0, go to lane 0 to dodge the row-2 hole, leap 2→4,
// balls at 5 when up, bounce to 7, left, wait sweeper clear, 8, 9,
// right to center, 10 pistons, wait platform, 11, 12, leap 12→14.
```

Use the same `waitSettled` / `until` helpers as `proof_video.mjs`.
Sweeper wait must use the **player position** plus the Qualifier sweeper
row (8), and step back to row 7 if the arm reaches the approach tile —
copy the retry pattern already in `proof_video.mjs`, with
`sweeperZ = 8 * 2.4`.

- [ ] **Step 1: Extend qualifier_check with a finish playthrough**

Assert win + `TIME LEFT` in the stats string.

- [ ] **Step 2: Run it red if the path still uses Main Event rows**

Run: `cd game && node scripts/qualifier_check.mjs`

Expected: FAIL until the choreography matches the 15-row course.

- [ ] **Step 3: Implement the choreography and proof_video menu start**

`proof_video.mjs` must not emit a lone `jump` on a `start` item that no
longer exists. After title → select, send `back` until
`menuFocused() === "startMain"`, then `jump`.

- [ ] **Step 4: Run structural gates**

Run:

```bash
cd game
npm run build
node scripts/course_catalog_check.mjs
node scripts/controls_collision_check.mjs
node scripts/visual_smoke.mjs
node scripts/ui_check.mjs
node scripts/qualifier_check.mjs
node scripts/proof_video.mjs
node scripts/perf_check.mjs
```

Expected: every command exits 0. Watch `public/proof.mp4` only if you
re-encode; otherwise confirm the proof script's JSON is
`{"state":"win",...}`. Re-encode to `public/proof.mp4` only when the
visible playthrough changed enough to need a new clip.

- [ ] **Step 5: Update README**

Add Qualifier vs Main Event under **What is built**. Mention
`START QUALIFIER` / `START MAIN EVENT` and the 50s clock.

- [ ] **Step 6: Final repo check**

Run: `git status --short && cd game && npm run build`

Expected: intentional source/script/doc changes only; build exits 0.

Do not commit unless Hratch asks.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Course catalog, no global-only COURSE | 1 |
| Qualifier 15-row table | 1 |
| Helpers use active rows | 1, 3 |
| Builder/arena from course / max length | 2 |
| Rebuild playfield on start | 2, 3 |
| Two Start buttons, focus on Voice | 4 |
| 50s countdown, TIME LEFT | 3, 4 |
| TIME'S UP! vs TOTAL WIPEOUT! | 3, 4 |
| Remaining seconds × 5 then +500 | 1, 3 |
| Main Event rules unchanged | 3, 5 |
| QUALIFIER LIVE ribbon | 4 |
| Proof + Qualifier playthrough | 5 |
| README | 5 |
| No new assets / no real logos / no multiplayer | Global constraints |
