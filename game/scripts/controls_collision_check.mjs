/**
 * Failing-first checks for facing yaw, double-tap jump, and sweeper overlap.
 * Run: node scripts/controls_collision_check.mjs
 */
import {
  classifyForwardTap,
  FORWARD_DOUBLE_TAP_MS,
  circleHitsObb2D,
  sweeperHitsPlayer,
} from "../src/game/collision.ts";

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
