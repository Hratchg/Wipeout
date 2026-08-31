# Wipeout Qualifier Design

## Goal

Add a second single-player course and a timed Qualifier mode without changing
the five-action control model, the existing 23-row Main Event, or input
integrations.

Players pick Qualifier or Main Event from the select screen with two Start
buttons. Qualifier is a shorter authored layout that reuses the current
hazard kit and ends the run if the countdown hits zero.

## Locked decisions

- Course catalog: each course is a record with `id`, `title`, `rows`, and
  rules. Game, builder, and arena read the active course for the run. There
  is no global `COURSE` array.
- Menu: two explicit starts — **START QUALIFIER** and **START MAIN EVENT**.
  No COURSE toggle. Initial focus stays on Voice, as today.
- Main Event is the current 23-row course with the current count-up timer,
  3 lives, checkpoints, and `max(0, 240 - elapsed) * 5` time bonus.
- Qualifier is the 15-row layout below, 3 lives, checkpoints, a **50.0s**
  countdown. Finish before 0:00. Remaining whole seconds × 5 are added to
  the score. At 0:00 the run ends as game over with copy `TIME'S UP!`.
- Reuse the existing generated hazard kit only. No new paid assets.
- Same 3 lanes, same actions (`jump`, `left`, `right`, `forward`, `back`),
  same leap-only-over-water rule, same collision volumes.
- Original Splash Arena branding only. Do not reproduce a real television
  set, network logo, or branded graphics.

## Course catalog

```ts
type CourseId = "qualifier" | "main";

interface CourseRules {
  lives: 3;
  /** Qualifier: countdown from this many seconds. Main: null (count-up). */
  countdownSeconds: number | null;
  /** Score added per whole remaining second on a Qualifier finish. */
  remainingTimeBonus: number;
  /** Main Event only: max(0, parSeconds - elapsed) * 5. */
  parSeconds: number | null;
}

interface Course {
  id: CourseId;
  title: string;          // "QUALIFIER" | "MAIN EVENT"
  broadcastLabel: string; // "QUALIFIER LIVE" | "LIVE FROM YOUR LIVING ROOM"
  rows: RowSpec[];
  rules: CourseRules;
}
```

`startRun(courseId)` copies that course onto the Game instance. Helpers
(`isLandable`, `leapLandingRow`, finish row, checkpoint list) take the
active row list. If a layout omits Big Balls, sweeper, pistons, or the
moving platform, those hazards are not built and are not updated.

## Select screen

Replace the single **START GAME** row with two rows, in this order after
Motion:

1. START QUALIFIER
2. START MAIN EVENT

OK / jump on a Start row begins that course. Voice, camera, and motion
toggles are unchanged. The header on the select screen stays `CONTROL DESK`.

## Qualifier layout (15 rows, 50s)

Lanes left / center / right. Camera looks toward increasing row index.

| Row | Kind | Tiles / notes |
|-----|------|----------------|
| 0 | solid | all, checkpoint (start) |
| 1 | solid | all |
| 2 | solid | left and right only (center hole) |
| 3 | gap | leap |
| 4 | solid | all |
| 5 | balls | Big Balls |
| 6 | gap | bounce over |
| 7 | solid | all, checkpoint |
| 8 | solid | sweeper; center blocked (hub) |
| 9 | solid | all |
| 10 | solid | pistons from left and right walls |
| 11 | platform | moving platform |
| 12 | solid | all, checkpoint |
| 13 | gap | final leap |
| 14 | solid | all, finish |

Every current kit piece appears once. No new obstacle types.

## Qualifier rules

- Lives: 3. Wipeout, tumble, splash, and checkpoint respawn match Main Event.
- Invulnerability after respawn is unchanged (1.5s).
- Timer panel label: `TIME LEFT`. Value counts down from `50.0`.
- Header ribbon right label: `QUALIFIER LIVE` while playing or on Qualifier
  end screens.
- At `timeLeft <= 0` while `playing`: state becomes `gameover`, copy
  `TIME'S UP!`, score is kept, no remaining-time bonus.
- On finish: remaining whole seconds × 5 are added, then the usual finish
  bonus (500) still applies. Win copy stays `YOU MADE IT!` and shows
  `TIME LEFT` plus score.
- Losing all lives still shows the existing game-over presentation
  (`SCORE: …`), not `TIME'S UP!`.
- Reduced-motion toggle still applies to camera and finish effects.

## Engine changes

- Split `game/src/game/course.ts` into shared `RowSpec` helpers plus a
  catalog module that exports `COURSES` and `getCourse(id)`.
- `builder.ts` and `arena.ts` size water, sky, and dressing from
  `course.rows.length` and only instantiate hazards present on that course.
- `game.ts` stores `this.course` for the run and uses it for movement,
  finish detection, and the timer.
- `hud.ts` menu items become
  `voice | camera | motion | startQualifier | startMain`.
- Proof and smoke scripts that assume the 23-row Main Event pass an explicit
  course id (default `main`). Qualifier gets its own short automated
  playthrough that finishes or hits the clock.

## Verification

1. Production build completes without TypeScript errors.
2. Start Qualifier and Start Main Event each load the matching row count
   (15 vs 23) and the matching timer mode (countdown vs count-up).
3. Qualifier playthrough can finish with time remaining; the win screen
   shows a remaining-time bonus.
4. Qualifier clock reaching 0:00 ends the run with `TIME'S UP!` and does
   not award remaining-time bonus.
5. Main Event still reaches the finish with the current 23-row path and
   an intentional sweeper wipeout.
6. Visual review of select (both Start rows), Qualifier HUD, Qualifier
   win, Qualifier time-up, and Main Event HUD at 1280×720 and 1920×1080.
7. Remote, voice, and camera still emit the same five normalized actions.
8. README lists both courses and the Qualifier clock rule.

## Out of scope

- Multiplayer.
- Offline speech recognition.
- Final forward/back/left/right body-gesture tuning.
- New generated assets or a third course.
- Exact reproduction of a real television set, logo, or branded graphics.
- Unlocking Main Event behind a Qualifier clear. The two starts are
  independent.
