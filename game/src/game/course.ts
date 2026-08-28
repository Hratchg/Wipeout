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
