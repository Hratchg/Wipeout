/**
 * Failing-first checks for facing yaw, double-tap jump, and sweeper overlap.
 * Run: node scripts/controls_collision_check.mjs
 */
import {
  classifyForwardTap,
  FORWARD_DOUBLE_TAP_MS,
  circleHitsObb2D,
  sweeperHitsPlayer,
  smootherstep,
  sweeperTangent,
} from "../src/game/collision.ts";
import { COURSE, leapLandingRow } from "../src/game/course.ts";

const LANE_W = 2.4;
const ROW_D = 2.4;
const ARM_HALF_W = (LANE_W * 2 + 2.4) / 2;
const ARM_HALF_D = 0.45;
const PLAYER_R = 0.4;
const SWEEPER_ROW = 14;
const hubZ = SWEEPER_ROW * ROW_D;

let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${name}`);
}

console.log("double-tap");
assert(
  "first tap is pending",
  classifyForwardTap(1000, null) === "pending",
);
assert(
  "second tap inside window is jump",
  classifyForwardTap(1000 + FORWARD_DOUBLE_TAP_MS - 10, 1000) === "jump",
);
assert(
  "tap after window is pending again",
  classifyForwardTap(1000 + FORWARD_DOUBLE_TAP_MS + 10, 1000) === "pending",
);

console.log("motion");
assert("smootherstep starts still", smootherstep(0) === 0);
assert("smootherstep ends still", smootherstep(1) === 1);
assert("smootherstep midpoint is half", Math.abs(smootherstep(0.5) - 0.5) < 1e-9);
const tan = sweeperTangent(-2.4, 0, 0, 1.5);
assert("sweeper throws along +Z at the left tip", Math.abs(tan.vx) < 1e-9 && tan.vz > 3);

console.log("leap only over water");
assert("no leap from the start tile", leapLandingRow(1, 0, COURSE) === null);
assert("no leap across solid tiles", leapLandingRow(0, 2, COURSE) === null);
assert(
  "leap from the tile before the first gap",
  leapLandingRow(0, 3, COURSE) === 5,
);
assert(
  "leap from a hole immediately ahead",
  leapLandingRow(1, 2, COURSE) === 5,
);
assert(
  "no leap from the middle of a platform",
  leapLandingRow(1, 8, COURSE) === null,
);
assert("leap the final water gap", leapLandingRow(1, 20, COURSE) === 22);

console.log("sweeper overlap");
const sideX = -LANE_W;
const centerX = 0;
const onRowZ = hubZ;
const approachZ = (SWEEPER_ROW - 1) * ROW_D;

assert(
  "side lane hit when arm is across the course",
  sweeperHitsPlayer(0, ARM_HALF_W, ARM_HALF_D, hubZ, sideX, onRowZ, PLAYER_R),
);
assert(
  "center approach hit when arm points down the course",
  sweeperHitsPlayer(
    Math.PI / 2,
    ARM_HALF_W,
    ARM_HALF_D,
    hubZ,
    centerX,
    approachZ,
    PLAYER_R,
  ),
);
assert(
  "center of sweeper row hit when arm points down the course",
  sweeperHitsPlayer(
    Math.PI / 2,
    ARM_HALF_W,
    ARM_HALF_D,
    hubZ,
    centerX,
    onRowZ,
    PLAYER_R,
  ),
);
assert(
  "far-away tile is safe",
  !sweeperHitsPlayer(0, ARM_HALF_W, ARM_HALF_D, hubZ, sideX, 0, PLAYER_R),
);
assert(
  "obb helper hits a point inside the box",
  circleHitsObb2D(0, 0, 0.1, 0, 0, 1, 0.2, 0),
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
