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

export const COURSE: RowSpec[] = [
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

export const FINISH_ROW = COURSE.length - 1;

/** Row indices that are checkpoints, in course order. */
export const CHECKPOINT_ROWS = COURSE.map((spec, row) => ({ spec, row }))
  .filter(({ spec }) => spec.checkpoint)
  .map(({ row }) => row);

/** True when this lane/row can be stood on (not open water or a blocked tile). */
export function isLandable(lane: number, row: number): boolean {
  if (lane < 0 || lane > 2 || row < 0 || row > FINISH_ROW) return false;
  const spec = COURSE[row];
  if (spec.kind === "gap") return false;
  if (spec.kind === "solid") {
    if (spec.blocked?.[lane]) return false;
    return spec.tiles?.[lane] === true;
  }
  return spec.kind === "balls" || spec.kind === "platform";
}

/**
 * Jump always aims two rows ahead. If that landing is water or a hole, the
 * leap continues to the next safe tile so a jump actually clears the gap.
 */
export function leapLandingRow(lane: number, fromRow: number): number | null {
  const preferred = fromRow + 2;
  if (isLandable(lane, preferred)) return preferred;
  for (
    let row = preferred + 1;
    row <= Math.min(fromRow + 4, FINISH_ROW);
    row++
  ) {
    if (isLandable(lane, row)) return row;
  }
  if (preferred >= 0 && preferred <= FINISH_ROW) return preferred;
  return null;
}
