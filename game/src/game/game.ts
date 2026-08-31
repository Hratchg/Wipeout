import { FreeCamera, Scene, Vector3 } from "@babylonjs/core";
import type { Action, GameState } from "../types";
import {
  type Course,
  type CourseId,
  finishRowOf,
  finishTimeBonus,
  getCourse,
  LANE_W,
  laneX,
  leapLandingRow,
} from "./course";
import type { ArenaAssets } from "./arenaAssets";
import { rebuildPlayfield, type BuiltWorld } from "./builder";
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
  course: Course;
  ui: Ui;

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
  private arenaAssets: ArenaAssets;

  constructor(
    scene: Scene,
    world: BuiltWorld,
    player: Player,
    ui: Ui,
    arenaAssets: ArenaAssets,
  ) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.ui = ui;
    this.arenaAssets = arenaAssets;
    this.course = getCourse("main");
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
    } else if (item === "startQualifier") {
      this.startRun("qualifier");
    } else if (item === "startMain") {
      this.startRun("main");
    }
  }

  startRun(id: CourseId): void {
    this.course = getCourse(id);
    rebuildPlayfield(this.world, this.scene, this.arenaAssets, this.course);
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
    this.ui.applyCourse(this.course);
    this.ui.showScreen("hud");
    this.player.respawn(1, 0);
    this.state = "playing";
  }

  debugSetElapsed(seconds: number): void {
    this.startTime = this.time - seconds;
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
        const dest = leapLandingRow(nearestLane, p.row, this.course.rows);
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
        const dest = leapLandingRow(p.lane, p.row, this.course.rows);
        if (dest !== null) this.tryMove(p.lane, dest, "leap");
        break;
      }
    }
  }

  private tryMove(lane: number, row: number, kind: "step" | "leap"): void {
    const finishRow = finishRowOf(this.course.rows);
    if (lane < 0 || lane > 2 || row < 0 || row > finishRow) return;
    const spec = this.course.rows[row];
    if (!spec) return;
    if (spec.kind === "solid" && spec.blocked?.[lane]) return; // pillar etc.
    if (kind === "leap" && row === finishRow) {
      this.ui.showFinalRun();
    }
    this.player.moveTo(lane, row, kind);
  }

  private evaluateLanding(lane: number, row: number): void {
    if (this.state !== "playing") return;
    const spec = this.course.rows[row];
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

  private wipeout(impulse: { linear: Vector3; angular: Vector3 }): void {
    this.effects.impact(this.player.root.position.clone());
    this.player.startTumble(impulse.linear, impulse.angular);
  }

  private loseLife(): void {
    if (this.state !== "playing") return;
    this.lives -= 1;
    this.ui.setHearts(this.lives);
    if (this.lives <= 0) {
      this.state = "gameover";
      this.ui.setEndStats("gameover", `SCORE: ${this.score}`);
      this.ui.setGameoverTitle("TOTAL WIPEOUT!");
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
    this.score += 500 + finishTimeBonus(this.course, this.elapsed);
    this.ui.setScore(this.score);
    const countdown = this.course.rules.countdownSeconds;
    const shown =
      countdown == null ? this.elapsed : Math.max(0, countdown - this.elapsed);
    const m = Math.floor(shown / 60);
    const s = (shown % 60).toFixed(1).padStart(4, "0");
    const label = countdown == null ? "TIME" : "TIME LEFT";
    this.ui.setEndStats("win", `${label}: ${m}:${s}   SCORE: ${this.score}`);
    this.ui.showScreen("win");
  }

  private timeUp(): void {
    this.state = "gameover";
    this.ui.setEndStats("gameover", `SCORE: ${this.score}`);
    this.ui.setGameoverTitle("TIME'S UP!");
    this.ui.showScreen("gameover");
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
      const countdown = this.course.rules.countdownSeconds;
      if (countdown == null) {
        this.ui.setTimer(this.elapsed);
      } else {
        const remaining = countdown - this.elapsed;
        this.ui.setTimer(Math.max(0, remaining));
        if (remaining <= 0 && this.state === "playing") this.timeUp();
      }
    }

    if (this.state === "playing") {
      const p = this.player;
      if (p.motion === "riding") {
        p.root.position.x = hz.platform.currentX();
      }

      // Hazard hits use the real arm/pad volume, not just the side-lane edges.
      if (p.isExposedToHazards && this.time > this.invulnUntil) {
        const px = p.root.position.x;
        const pz = p.root.position.z;
        if (hz.sweeper.hitsPlayer(px, pz)) {
          this.wipeout(hz.sweeper.knockImpulse(px, pz));
        } else if (hz.pistons.hitsPlayer(px, pz)) {
          this.wipeout(hz.pistons.knockImpulse(px, pz));
        }
      }
    }

    // Camera follows the player with a soft lag, framed for a TV.
    const target = this.player.root.position;
    const desired = new Vector3(
      target.x * 0.35,
      7 + Math.max(target.y, 0) * 0.18,
      target.z - 9,
    );
    const k = 1 - Math.exp(-dt * 3.2);
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
