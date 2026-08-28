import "@babylonjs/loaders/glTF";
import { Engine, Scene } from "@babylonjs/core";
import { buildWorld } from "./game/builder";
import { Player } from "./game/player";
import { Game } from "./game/game";
import { Ui } from "./ui/hud";
import { actionBus } from "./input/actionBus";
import { initKeyboard } from "./input/keyboard";
import { onVoiceStatus } from "./input/voice";
import { onCvStatus } from "./input/cvSocket";
import { loadCharacter } from "./game/character";
import { loadArenaAssets } from "./game/arenaAssets";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const arenaAssets = await loadArenaAssets(scene);
(window as unknown as Record<string, unknown>).__arenaReady = true;
const world = buildWorld(scene, arenaAssets);
const ui = new Ui();
const player = new Player(scene, world.shadows);
const game = new Game(scene, world, player, ui);

// Generated character (falls back to the capsule placeholder if missing).
loadCharacter(scene, player, world.shadows);

actionBus.on((action) => {
  ui.actionFlash(action);
  game.onAction(action);
});

onVoiceStatus((status) => ui.voiceFeedback(status));
onCvStatus((status) => ui.cvFeedback(status));

initKeyboard(
  (e) => {
    if (e.code === "F2") {
      ui.toggleKeyOverlay();
      return true;
    }
    return ui.handleOverlayKey(e);
  },
  () => game.state === "playing",
);

let last = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  scene.render();
  (window as unknown as Record<string, unknown>).__gameReady = true;
});

window.addEventListener("resize", () => engine.resize());

// Debug/testing handle (harmless in kiosk use; no UI exposure).
(window as unknown as Record<string, unknown>).__wipeout = {
  game,
  player,
  world,
  actionBus,
  arenaAssets,
};
