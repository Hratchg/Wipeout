import { FreeCamera, Scene, Vector3 } from "@babylonjs/core";
import type { Action, GameState } from "../types";
import { COURSE, FINISH_ROW, LANE_W, laneX, leapLandingRow } from "./course";
import type { BuiltWorld } from "./builder";
import { Player } from "./player";
import { EffectsController } from "./effects";
import { Ui } from "../ui/hud";
import { actionBus } from "../input/actionBus";
import { startVoice, stopVoice } from "../input/voice";
import { startCv, stopCv } from "../input/cvSocket";

const START_LIVES = 3;
const RESPAWN_DELAY_MS = 1000;
const INVULN_S = 1.5;

export class Game {
  state: GameState = "title";

  private lives = START_LIVES;
  private score = 0;
  private maxRow = 0;
  private checkpointRow = 0;
  private claimedCheckpoints = new Set<number>();
  private startTime = 0;
  private elapsed = 0;
  private invulnUntil = 0;
  private time = 0;

  private camera: FreeCamera;
  private cameraFollowPosition: Vector3;
  private effects: EffectsController;
  private voiceOn = false;
  private cameraOn = false;

  private scene: Scene;
  private world: BuiltWorld;
  private player: Player;
  private ui: Ui;

  constructor(
    scene: Scene,
    world: BuiltWorld,
    player: Player,
    ui: Ui,
  ) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.ui = ui;
    this.camera = new FreeCamera("cam", new Vector3(0, 7, -10), scene);
    this.camera.setTarget(new Vector3(0, 0.5, 4));
    this.cameraFollowPosition = this.camera.position.clone();
    this.effects = new EffectsController(
      this.scene,
      this.camera,
      () => this.ui.isReducedMotion(),
    );

    player.onLand = (lane, row) => this.evaluateLanding(lane, row);
    player.onSplash = (pos) => {
      this.effects.splash(pos);
      this.loseLife();
    };
  }

  onAction(action: Action): void {
    switch (this.state) {
      case "title":
        if (action === "jump" || action === "forward") this.toSelect();
        break;
      case "select":
        if (action === "forward") this.ui.menuMove(-1);
        else if (action === "back") this.ui.menuMove(1);
        else if (action === "jump") this.activateMenuItem();
        break;
      case "playing":
        this.handlePlayAction(action);
        break;
      case "gameover":
      case "win":
        if (action === "jump") this.toSelect();
        break;
      case "respawning":
        break;
    }
  }

  private toSelect(): void {
    this.state = "select";
    this.ui.showScreen("select");
  }

  private activateMenuItem(): void {
    const item = this.ui.menuFocused();
    if (item === "voice") {
      this.voiceOn = !this.voiceOn;
      this.ui.setVoiceEnabled(this.voiceOn);
      actionBus.setEnabled("voice", this.voiceOn);
      if (this.voiceOn) startVoice();
      else stopVoice();
    } else if (item === "camera") {
      this.cameraOn = !this.cameraOn;
      this.ui.setCameraEnabled(this.cameraOn);
      actionBus.setEnabled("camera", this.cameraOn);
      if (this.cameraOn) startCv();
      else stopCv();
    } else if (item === "motion") {
      this.ui.setReducedMotion(!this.ui.isReducedMotion());
    } else {
      this.startRun();
    }
  }

  private startRun(): void {
    this.lives = START_LIVES;
    this.score = 0;
    this.maxRow = 0;
    this.checkpointRow = 0;
    this.claimedCheckpoints.clear();
    this.startTime = this.time;
    this.elapsed = 0;
    this.invulnUntil = 0;
    this.ui.setHearts(this.lives);
    this.ui.setScore(0);
    this.ui.setTimer(0);
    this.ui.showScreen("hud");
    this.player.respawn(1, 0);
    this.state = "playing";
  }

  private handlePlayAction(action: Action): void {
    const p = this.player;

    if (p.motion === "riding") {
      // On the moving platform: step off at whichever lane it's nearest.
      const nearestLane = Math.max(
        0,
        Math.min(2, Math.round(this.world.hazards.platform.currentX() / LANE_W) + 1),
      );
      if (action === "forward") this.tryMove(nearestLane, p.row + 1, "step");
      else if (action === "back") this.tryMove(nearestLane, p.row - 1, "step");
      else if (action === "jump") {
        const dest = leapLandingRow(nearestLane, p.row);
        if (dest !== null) this.tryMove(nearestLane, dest, "leap");
      }
      return;
    }

    if (p.motion !== "idle") return;

    switch (action) {
      case "left":
        this.tryMove(p.lane - 1, p.row, "step");
        break;
      case "right":
        this.tryMove(p.lane + 1, p.row, "step");
        break;
      case "forward":
        this.tryMove(p.lane, p.row + 1, "step");
        break;
      case "back":
        this.tryMove(p.lane, p.row - 1, "step");
        break;
      case "jump": {
        const dest = leapLandingRow(p.lane, p.row);
        if (dest !== null) this.tryMove(p.lane, dest, "leap");
        break;
      }
    }
  }

  private tryMove(lane: number, row: number, kind: "step" | "leap"): void {
    if (lane < 0 || lane > 2 || row < 0 || row > FINISH_ROW) return;
    const spec = COURSE[row];
    if (!spec) return;
    if (spec.kind === "solid" && spec.blocked?.[lane]) return; // pillar etc.
    if (kind === "leap" && this.player.row === 20 && row === FINISH_ROW) {
      this.ui.showFinalRun();
    }
    this.player.moveTo(lane, row, kind);
  }

  private evaluateLanding(lane: number, row: number): void {
    if (this.state !== "playing") return;
    const spec = COURSE[row];
    if (!spec) return;
    const hz = this.world.hazards;

    switch (spec.kind) {
      case "solid": {
        if (!spec.tiles?.[lane]) {
          this.player.startFall();
          return;
        }
        if (spec.checkpoint) {
          this.checkpointRow = Math.max(this.checkpointRow, row);
          if (!this.claimedCheckpoints.has(row)) {
            this.claimedCheckpoints.add(row);
            this.score += 100;
            this.ui.showCheckpoint(row);
            this.effects.checkpoint(this.player.root.position.clone());
          }
        }
        if (row > this.maxRow) {
          this.score += (row - this.maxRow) * 10;
          this.maxRow = row;
        }
        this.ui.setScore(this.score);
        if (spec.finish) this.win();
        break;
      }
      case "gap":
        this.player.startFall();
        break;
      case "balls": {
        if (hz.balls.isUp(lane)) {
          this.player.setY(hz.balls.topY(lane));
          // A beat on top of the ball, then it bounces you onward.
          window.setTimeout(() => {
            if (this.state === "playing" && this.player.motion === "idle") {
              this.player.moveTo(lane, row + 2, "bounce");
            }
          }, 180);
        } else {
          this.player.startFall();
        }
        break;
      }
      case "platform": {
        const px = hz.platform.currentX();
        if (Math.abs(px - laneX(lane)) < LANE_W * 0.55) {
          this.player.motion = "riding";
          this.player.setY(0.02);
        } else {
          this.player.startFall();
        }
        break;
      }
    }
  }

  private wipeout(direction: Vector3): void {
    this.effects.impact(this.player.root.position.clone());
    this.player.startTumble(direction);
  }

  private loseLife(): void {
    this.lives -= 1;
    this.ui.setHearts(this.lives);
    if (this.lives <= 0) {
      this.state = "gameover";
      this.ui.setEndStats("gameover", `SCORE: ${this.score}`);
      this.ui.showScreen("gameover");
      return;
    }
    this.state = "respawning";
    window.setTimeout(() => {
      this.player.respawn(1, this.checkpointRow);
      this.invulnUntil = this.time + INVULN_S;
      this.state = "playing";
      this.ui.showScreen("hud");
    }, RESPAWN_DELAY_MS);
  }

  private win(): void {
    this.effects.finish(this.player.root.position.clone());
    this.state = "win";
    const timeBonus = Math.max(0, Math.round(240 - this.elapsed)) * 5;
    this.score += 500 + timeBonus;
    this.ui.setScore(this.score);
    const m = Math.floor(this.elapsed / 60);
    const s = (this.elapsed % 60).toFixed(1).padStart(4, "0");
    this.ui.setEndStats("win", `TIME: ${m}:${s}   SCORE: ${this.score}`);
    this.ui.showScreen("win");
  }

  update(dt: number): void {
    this.time += dt;
    this.world.arena.update(this.time, dt);
    const hz = this.world.hazards;
    hz.balls.update(this.time);
    hz.sweeper.update(dt);
    hz.pistons.update(this.time);
    hz.platform.update(this.time);
    this.player.update(dt);

    if (this.state === "playing") {
      this.elapsed = this.time - this.startTime;
      this.ui.setTimer(this.elapsed);

      const p = this.player;
      if (p.motion === "riding") {
        p.root.position.x = hz.platform.currentX();
      }

      // Hazard hits use the real arm/pad volume, not just the side-lane edges.
      if (p.isExposedToHazards && this.time > this.invulnUntil) {
        const px = p.root.position.x;
        const pz = p.root.position.z;
        if (hz.sweeper.hitsPlayer(px, pz)) {
          this.wipeout(hz.sweeper.knockDirection(px, pz));
        } else if (hz.pistons.hitsPlayer(px, pz)) {
          this.wipeout(hz.pistons.knockDirection(px));
        }
      }
    }

    // Camera follows the player with a soft lag, framed for a TV.
    const target = this.player.root.position;
    const desired = new Vector3(target.x * 0.35, 7, target.z - 9);
    const k = 1 - Math.exp(-dt * 4);
    this.cameraFollowPosition = Vector3.Lerp(
      this.cameraFollowPosition,
      desired,
      k,
    );
    this.camera.position.copyFrom(this.cameraFollowPosition);
    this.camera.setTarget(
      new Vector3(target.x * 0.6, 0.6, target.z + 3.5),
    );
    this.effects.update(dt);
  }
}
