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
