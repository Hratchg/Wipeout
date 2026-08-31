import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { smootherstep } from "./collision";
import { laneX, rowZ, WATER_Y } from "./course";

export type MoveKind = "step" | "leap" | "bounce";
export type PlayerMotion = "idle" | "tween" | "riding" | "tumble" | "fall" | "gone";

interface Tween {
  from: Vector3;
  to: Vector3;
  duration: number;
  elapsed: number;
  hop: number;
  kind: MoveKind;
  targetLane: number;
  targetRow: number;
}

const MOVE_PARAMS: Record<MoveKind, { duration: number; hop: number }> = {
  step: { duration: 0.32, hop: 0.38 },
  leap: { duration: 0.62, hop: 1.45 },
  bounce: { duration: 0.68, hop: 1.9 },
};

/** Hooks the GLB character wires into later; capsule placeholder ignores them. */
export interface CharacterAnimator {
  play(name: "idle" | "run" | "jump"): void;
}

export class Player {
  root: TransformNode;
  visualRoot: TransformNode;
  lane = 1;
  row = 0;
  motion: PlayerMotion = "idle";

  onLand?: (lane: number, row: number, kind: MoveKind) => void;
  onSplash?: (position: Vector3) => void;

  animator: CharacterAnimator | null = null;
  private placeholder: Mesh[] = [];
  private tween: Tween | null = null;
  private vel = Vector3.Zero();
  private angVel = Vector3.Zero();
  private age = 0;
  private settle = 0;

  constructor(scene: Scene, shadows: ShadowGenerator) {
    this.root = new TransformNode("player-root", scene);
    this.visualRoot = new TransformNode("player-visual-root", scene);
    this.visualRoot.parent = this.root;
    this.buildPlaceholder(scene, shadows);
    this.root.position = new Vector3(laneX(this.lane), 0, rowZ(this.row));
  }

  private buildPlaceholder(scene: Scene, shadows: ShadowGenerator): void {
    const bodyMat = new StandardMaterial("player-body-mat", scene);
    bodyMat.diffuseColor = new Color3(0.1, 0.7, 0.35);
    const helmetMat = new StandardMaterial("player-helmet-mat", scene);
    helmetMat.diffuseColor = new Color3(0.95, 0.95, 0.98);

    const body = MeshBuilder.CreateCapsule(
      "player-body",
      { height: 1.4, radius: 0.35 },
      scene,
    );
    body.material = bodyMat;
    body.parent = this.visualRoot;
    body.position.y = 0.7;

    const helmet = MeshBuilder.CreateSphere(
      "player-helmet",
      { diameter: 0.55 },
      scene,
    );
    helmet.material = helmetMat;
    helmet.parent = this.visualRoot;
    helmet.position.y = 1.45;

    this.placeholder = [body, helmet];
    for (const m of this.placeholder) shadows.addShadowCaster(m);
  }

  /** Swap the capsule for a loaded character model. */
  attachCharacter(
    node: TransformNode,
    animator: CharacterAnimator,
    shadows: ShadowGenerator,
  ): void {
    for (const m of this.placeholder) m.dispose();
    this.placeholder = [];
    node.parent = this.visualRoot;
    for (const m of node.getChildMeshes()) shadows.addShadowCaster(m);
    this.animator = animator;
    this.animator.play("idle");
  }

  get isBusy(): boolean {
    return this.motion === "tween" || this.motion === "tumble" || this.motion === "fall" || this.motion === "gone";
  }

  /** Grounded or taking a short step — leaps stay above the rotating arms. */
  get isExposedToHazards(): boolean {
    return (
      this.motion === "idle" ||
      this.motion === "riding" ||
      (this.motion === "tween" && this.tween?.kind === "step")
    );
  }

  moveTo(lane: number, row: number, kind: MoveKind): void {
    const params = MOVE_PARAMS[kind];
    const span = Math.abs(row - this.row);
    const longLeap = kind === "leap" && span > 2;
    this.resetVisualPose();
    this.tween = {
      from: this.root.position.clone(),
      to: new Vector3(laneX(lane), 0, rowZ(row)),
      duration: longLeap ? 0.7 : params.duration,
      elapsed: 0,
      hop: longLeap ? 2.1 : params.hop,
      kind,
      targetLane: lane,
      targetRow: row,
    };
    this.motion = "tween";
    this.animator?.play(kind === "step" ? "run" : "jump");
  }

  /** Snap the current tween's landing height (used when landing on a ball). */
  setY(y: number): void {
    this.root.position.y = y;
  }

  /** Knocked flying by a hazard. Impulse is world-space m/s. */
  startTumble(direction: Vector3, angular?: Vector3): void {
    this.resetVisualPose();
    this.motion = "tumble";
    this.settle = 1;
    if (direction.lengthSquared() < 0.01) {
      this.vel = new Vector3(1.2, 5.8, 0.4);
    } else if (direction.y > 2) {
      this.vel = direction.clone();
    } else {
      this.vel = direction.normalize().scale(6.2).add(new Vector3(0, 5.8, 0));
    }
    this.angVel =
      angular?.clone() ??
      new Vector3(this.vel.z * 0.35, this.vel.x * -0.25, -this.vel.x * 0.55);
    this.animator?.play("jump");
  }

  /** Dropping straight into a hole/water. */
  startFall(): void {
    this.resetVisualPose();
    this.motion = "fall";
    this.vel = new Vector3(0, -0.4, 0.55);
    this.angVel = new Vector3(1.8, 0.4, 0);
  }

  respawn(lane: number, row: number): void {
    this.lane = lane;
    this.row = row;
    this.tween = null;
    this.motion = "idle";
    this.settle = 0;
    this.vel = Vector3.Zero();
    this.angVel = Vector3.Zero();
    this.root.position = new Vector3(laneX(lane), 0, rowZ(row));
    this.root.rotation = Vector3.Zero();
    this.resetVisualPose();
    this.root.setEnabled(true);
    this.animator?.play("idle");
  }

  hide(): void {
    this.motion = "gone";
    this.root.setEnabled(false);
  }

  update(dt: number): void {
    this.age += dt;
    this.settle *= Math.exp(-dt * 10);
    switch (this.motion) {
      case "tween": {
        const tw = this.tween;
        if (!tw) break;
        tw.elapsed += dt;
        const u = Math.min(tw.elapsed / tw.duration, 1);
        const eased = smootherstep(u);
        const pos = Vector3.Lerp(tw.from, tw.to, eased);
        pos.y += Math.sin(Math.PI * u) * tw.hop;
        this.root.position = pos;
        this.updateVisualPose(tw.kind, u);
        if (u >= 1) {
          this.lane = tw.targetLane;
          this.row = tw.targetRow;
          this.motion = "idle";
          const kind = tw.kind;
          this.tween = null;
          this.settle = kind === "step" ? 0.45 : 0.85;
          this.resetVisualPose();
          this.animator?.play("idle");
          this.onLand?.(this.lane, this.row, kind);
        }
        break;
      }
      case "tumble": {
        this.vel.y -= 18 * dt;
        const drag = Math.exp(-dt * 0.55);
        this.vel.x *= drag;
        this.vel.z *= drag;
        this.root.position.addInPlace(this.vel.scale(dt));
        this.root.rotation.addInPlace(this.angVel.scale(dt));
        this.angVel.scaleInPlace(Math.exp(-dt * 0.65));
        this.applyHitSquash();
        if (this.root.position.y < WATER_Y + 0.3) this.finishInWater();
        break;
      }
      case "fall": {
        this.vel.y -= 20 * dt;
        this.root.position.addInPlace(this.vel.scale(dt));
        this.root.rotation.addInPlace(this.angVel.scale(dt));
        if (this.root.position.y < WATER_Y + 0.3) this.finishInWater();
        break;
      }
      case "idle":
      case "riding":
        this.applyIdleMotion();
        break;
      default:
        break;
    }
  }

  private finishInWater(): void {
    const splashPos = this.root.position.clone();
    splashPos.y = WATER_Y + 0.1;
    this.hide();
    this.onSplash?.(splashPos);
  }

  private updateVisualPose(kind: MoveKind, progress: number): void {
    if (kind === "step") {
      this.visualRoot.rotation.x = Math.sin(Math.PI * progress) * 0.1;
      this.visualRoot.position.y = Math.sin(Math.PI * progress) * 0.04;
      this.visualRoot.scaling.set(1, 1, 1);
      return;
    }

    this.visualRoot.rotation.x = Math.sin(Math.PI * progress) * -0.18;
    const stretchPhase = Math.min(progress / 0.55, 1);
    const stretch = Math.sin(Math.PI * stretchPhase) * 0.16;
    const landingPhase =
      progress > 0.58 ? (progress - 0.58) / (1 - 0.58) : 0;
    const squash = Math.sin(Math.PI * landingPhase) * 0.12;
    this.visualRoot.position.y = 0;
    this.visualRoot.scaling.set(
      1 - stretch * 0.22 + squash * 0.45,
      1 + stretch - squash,
      1 - stretch * 0.22 + squash * 0.45,
    );
  }

  private applyIdleMotion(): void {
    const breathe = Math.sin(this.age * 2.15) * 0.018;
    const land = this.settle * this.settle;
    this.visualRoot.position.y = breathe - land * 0.07;
    this.visualRoot.scaling.set(1 + land * 0.08, 1 - land * 0.1 + breathe, 1 + land * 0.08);
    this.visualRoot.rotation.x = land * 0.08;
  }

  private applyHitSquash(): void {
    const s = this.settle * this.settle;
    this.visualRoot.scaling.set(1 + s * 0.22, 1 - s * 0.18, 1 + s * 0.22);
  }

  private resetVisualPose(): void {
    this.visualRoot.position.set(0, 0, 0);
    this.visualRoot.rotation.set(0, 0, 0);
    this.visualRoot.scaling.set(1, 1, 1);
  }
}
