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
