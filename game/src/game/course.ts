export type RowKind = "solid" | "gap" | "balls" | "platform";

export interface RowSpec {
  kind: RowKind;
  /** Which lanes have a tile (solid rows). Missing lane = hole into water. */
  tiles?: [boolean, boolean, boolean];
  /** Lanes that cannot be entered (e.g. the sweeper hub pillar). */
  blocked?: [boolean, boolean, boolean];
  checkpoint?: boolean;
  /** Rotating sweeper arm centered on this row's middle lane. */
  sweeper?: boolean;
  /** Piston hazards: source lanes (0 = left wall, 2 = right wall). */
  pistons?: Array<0 | 2>;
  finish?: boolean;
}

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

export const LANE_COUNT = 3;
export const LANE_W = 2.4; // meters between lane centers
export const ROW_D = 2.4; // meters between row centers
export const TILE_H = 0.5;
export const TILE_TOP_Y = 0; // player stands at y=0
export const WATER_Y = -2.2;

export function laneX(lane: number): number {
  return (lane - 1) * LANE_W;
}

export function rowZ(row: number): number {
  return row * ROW_D;
}

const ALL: [boolean, boolean, boolean] = [true, true, true];

const MAIN_ROWS: RowSpec[] = [
  /* 0 */ { kind: "solid", tiles: ALL, checkpoint: true }, // start platform
  /* 1 */ { kind: "solid", tiles: ALL },
  /* 2 */ { kind: "solid", tiles: ALL },
  /* 3 */ { kind: "solid", tiles: [true, false, true] },
  /* 4 */ { kind: "gap" }, // first leap
  /* 5 */ { kind: "solid", tiles: ALL },
  /* 6 */ { kind: "solid", tiles: [false, true, false] },
  /* 7 */ { kind: "gap" },
  /* 8 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 9 */ { kind: "solid", tiles: ALL },
  /* 10 */ { kind: "balls" }, // the Big Balls: step on when the ball is up
  /* 11 */ { kind: "gap" }, // the bounce carries you over this
  /* 12 */ { kind: "solid", tiles: ALL },
  /* 13 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 14 */ {
    kind: "solid",
    tiles: ALL,
    blocked: [false, true, false],
    sweeper: true,
  },
  /* 15 */ { kind: "solid", tiles: ALL },
  /* 16 */ { kind: "solid", tiles: ALL, pistons: [0, 2] },
  /* 17 */ { kind: "solid", tiles: [true, true, false] },
  /* 18 */ { kind: "platform" }, // moving platform over water
  /* 19 */ { kind: "solid", tiles: ALL },
  /* 20 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 21 */ { kind: "gap" }, // final leap
  /* 22 */ { kind: "solid", tiles: ALL, finish: true },
];

const QUALIFIER_ROWS: RowSpec[] = [
  /* 0 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 1 */ { kind: "solid", tiles: ALL },
  /* 2 */ { kind: "solid", tiles: [true, false, true] },
  /* 3 */ { kind: "gap" },
  /* 4 */ { kind: "solid", tiles: ALL },
  /* 5 */ { kind: "balls" },
  /* 6 */ { kind: "gap" },
  /* 7 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 8 */ {
    kind: "solid",
    tiles: ALL,
    blocked: [false, true, false],
    sweeper: true,
  },
  /* 9 */ { kind: "solid", tiles: ALL },
  /* 10 */ { kind: "solid", tiles: ALL, pistons: [0, 2] },
  /* 11 */ { kind: "platform" },
  /* 12 */ { kind: "solid", tiles: ALL, checkpoint: true },
  /* 13 */ { kind: "gap" },
  /* 14 */ { kind: "solid", tiles: ALL, finish: true },
];

export const COURSES: Record<CourseId, Course> = {
  main: {
    id: "main",
    title: "MAIN EVENT",
    broadcastLabel: "LIVE FROM YOUR LIVING ROOM",
    rows: MAIN_ROWS,
    rules: {
      lives: 3,
      countdownSeconds: null,
      remainingTimeBonus: 0,
      parSeconds: 240,
    },
  },
  qualifier: {
    id: "qualifier",
    title: "QUALIFIER",
    broadcastLabel: "QUALIFIER LIVE",
    rows: QUALIFIER_ROWS,
    rules: {
      lives: 3,
      countdownSeconds: 50,
      remainingTimeBonus: 5,
      parSeconds: null,
    },
  },
};

export function getCourse(id: CourseId): Course {
  return COURSES[id];
}

export function maxCourseRowCount(): number {
  return Math.max(...Object.values(COURSES).map((course) => course.rows.length));
}

export function finishRowOf(rows: RowSpec[]): number {
  const finishIndex = rows.findIndex((spec) => spec.finish);
  return finishIndex >= 0 ? finishIndex : rows.length - 1;
}

export function checkpointRowsOf(rows: RowSpec[]): number[] {
  return rows
    .map((spec, row) => ({ spec, row }))
    .filter(({ spec }) => spec.checkpoint)
    .map(({ row }) => row);
}

export const COURSE = getCourse("main").rows;
export const FINISH_ROW = finishRowOf(COURSE);

/** Row indices that are checkpoints, in course order. */
export const CHECKPOINT_ROWS = checkpointRowsOf(COURSE);

/** True when this lane/row can be stood on (not open water or a blocked tile). */
export function isLandable(
  lane: number,
  row: number,
  rows: RowSpec[],
): boolean {
  const finishRow = finishRowOf(rows);
  if (lane < 0 || lane > 2 || row < 0 || row > finishRow) return false;
  const spec = rows[row];
  if (spec.kind === "gap") return false;
  if (spec.kind === "solid") {
    if (spec.blocked?.[lane]) return false;
    return spec.tiles?.[lane] === true;
  }
  return spec.kind === "balls" || spec.kind === "platform";
}

/** Open water: a full gap row or a hole in this lane. Pillars are not water. */
export function isWaterAt(lane: number, row: number, rows: RowSpec[]): boolean {
  const finishRow = finishRowOf(rows);
  if (row < 0 || row > finishRow) return false;
  const spec = rows[row];
  if (spec.kind === "gap") return true;
  if (spec.kind === "solid") {
    if (spec.blocked?.[lane]) return false;
    return spec.tiles?.[lane] !== true;
  }
  return false;
}

/**
 * Leap only from a tile with water immediately ahead. Then aim two rows
 * forward, and keep going if that landing is still water so the gap clears.
 */
export function leapLandingRow(
  lane: number,
  fromRow: number,
  rows: RowSpec[],
): number | null {
  const finishRow = finishRowOf(rows);
  if (!isWaterAt(lane, fromRow + 1, rows)) return null;
  const preferred = fromRow + 2;
  if (isLandable(lane, preferred, rows)) return preferred;
  for (
    let row = preferred + 1;
    row <= Math.min(fromRow + 4, finishRow);
    row++
  ) {
    if (isLandable(lane, row, rows)) return row;
  }
  if (preferred >= 0 && preferred <= finishRow) return preferred;
  return null;
}

export function finishTimeBonus(course: Course, elapsed: number): number {
  if (course.rules.countdownSeconds != null) {
    return (
      Math.max(0, Math.floor(course.rules.countdownSeconds - elapsed)) *
      course.rules.remainingTimeBonus
    );
  }
  if (course.rules.parSeconds != null) {
    return Math.max(0, Math.round(course.rules.parSeconds - elapsed)) * 5;
  }
  return 0;
}
