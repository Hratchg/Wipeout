import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { LANE_W, laneX, rowZ, WATER_Y } from "./course";
import type { ArenaAssets } from "./arenaAssets";
import {
  inflatableMaterial,
  tuneGeneratedAssetMaterials,
} from "./materials";

function angularDist(a: number, b: number): number {
  const TWO_PI = Math.PI * 2;
  let d = Math.abs(a - b) % TWO_PI;
  if (d > Math.PI) d = TWO_PI - d;
  return d;
}

function centerGeneratedAt(root: TransformNode, target: Vector3): void {
  root.computeWorldMatrix(true);
  const bounds = root.getHierarchyBoundingVectors(true);
  root.position.addInPlace(
    target.subtract(bounds.min.add(bounds.max).scale(0.5)),
  );
  root.computeWorldMatrix(true);
  tuneGeneratedAssetMaterials(root);
}

function centerGeneratedAbove(
  root: TransformNode,
  x: number,
  bottomY: number,
  z: number,
): void {
  root.computeWorldMatrix(true);
  const bounds = root.getHierarchyBoundingVectors(true);
  root.position.addInPlace(
    new Vector3(
      x - (bounds.min.x + bounds.max.x) / 2,
      bottomY - bounds.min.y,
      z - (bounds.min.z + bounds.max.z) / 2,
    ),
  );
  root.computeWorldMatrix(true);
  tuneGeneratedAssetMaterials(root);
}

function orientLongAxisAlongX(
  root: TransformNode,
  targetWidth: number,
  targetDepth: number,
): void {
  root.rotation.y = Math.PI / 2;
  root.computeWorldMatrix(true);
  const bounds = root.getHierarchyBoundingVectors(true);
  const size = bounds.max.subtract(bounds.min);
  root.scaling.x *= targetDepth / size.z;
  root.scaling.z *= targetWidth / size.x;
}

/** The Big Balls: three huge bouncy spheres bobbing in the water. */
export class BigBalls {
  static readonly RADIUS = 1.15;
  private static readonly BASE_Y = WATER_Y + 0.3;
  private static readonly AMP = 1.15;
  private static readonly SPEED = 1.5; // rad/s

  private balls: Mesh[] = [];
  private roots: TransformNode[] = [];
  private phases = [0, 2.1, 4.2];
  private bob = [0, 0, 0]; // current sin value per lane

  constructor(scene: Scene, row: number, assets: ArenaAssets) {
    const mat = inflatableMaterial(
      scene,
      "ball-mat",
      new Color3(0.85, 0.1, 0.12),
    );
    for (let lane = 0; lane < 3; lane++) {
      const root = new TransformNode(`ball-root-${lane}`, scene);
      root.position = new Vector3(laneX(lane), BigBalls.BASE_Y, rowZ(row));

      const ball = MeshBuilder.CreateSphere(
        `ball-${lane}`,
        { diameter: BigBalls.RADIUS * 2, segments: 24 },
        scene,
      );
      ball.material = mat;
      ball.parent = root;

      const generatedMount = assets.instantiate(
        "ballMount",
        `generated-ball-mount-${lane}`,
      );
      if (generatedMount) {
        generatedMount.parent = root;
        centerGeneratedAbove(
          generatedMount,
          laneX(lane),
          BigBalls.BASE_Y - BigBalls.RADIUS,
          rowZ(row),
        );
      }

      this.balls.push(ball);
      this.roots.push(root);
    }
  }

  update(t: number): void {
    for (let lane = 0; lane < 3; lane++) {
      this.bob[lane] = Math.sin(t * BigBalls.SPEED + this.phases[lane]);
      this.roots[lane].position.y =
        BigBalls.BASE_Y + this.bob[lane] * BigBalls.AMP;
    }
  }

  /** Can the player land on this lane's ball right now? */
  isUp(lane: number): boolean {
    return this.bob[lane] > 0.35;
  }

  topY(lane: number): number {
    this.balls[lane].computeWorldMatrix(true);
    return this.balls[lane].getAbsolutePosition().y + BigBalls.RADIUS;
  }
}

/** Rotating sweeper arm around a hub pillar on the middle lane. */
export class Sweeper {
  private static readonly SPEED = 1.5; // rad/s
  private static readonly HIT_WIDTH = 0.32; // rad
  private static readonly ARM_Y = 0.45;

  private root: TransformNode;
  private angle = 0;

  constructor(scene: Scene, row: number, assets: ArenaAssets) {
    this.root = new TransformNode("sweeper-root", scene);
    this.root.position = new Vector3(0, Sweeper.ARM_Y, rowZ(row));

    const hubMat = inflatableMaterial(
      scene,
      "sweeper-hub-mat",
      new Color3(0.9, 0.75, 0.1),
    );
    const armMat = inflatableMaterial(
      scene,
      "sweeper-arm-mat",
      new Color3(0.95, 0.25, 0.15),
    );

    const hub = MeshBuilder.CreateCylinder(
      "sweeper-hub",
      { diameter: 1.1, height: 2.4, tessellation: 20 },
      scene,
    );
    hub.material = hubMat;
    hub.parent = this.root;
    hub.position.y = 0.5;

    const arm = MeshBuilder.CreateBox(
      "sweeper-arm",
      { width: LANE_W * 2 + 2.4, height: 0.32, depth: 0.4 },
      scene,
    );
    arm.material = armMat;
    arm.parent = this.root;

    // Padded tips like the show's foam sweeper.
    for (const side of [-1, 1]) {
      const pad = MeshBuilder.CreateBox(
        `sweeper-pad-${side}`,
        { width: 0.9, height: 0.5, depth: 0.7 },
        scene,
      );
      pad.material = hubMat;
      pad.parent = this.root;
      pad.position.x = side * (LANE_W + 0.9);
    }

    const generatedHub = assets.instantiate(
      "sweeperHub",
      "generated-sweeper-hub",
    );
    if (generatedHub) {
      generatedHub.parent = this.root;
      centerGeneratedAt(
        generatedHub,
        new Vector3(0, Sweeper.ARM_Y + 0.5, rowZ(row)),
      );
      hub.setEnabled(false);
    }

    const generatedArm = assets.instantiate(
      "sweeperArm",
      "generated-sweeper-arm",
    );
    if (generatedArm) {
      generatedArm.parent = this.root;
      orientLongAxisAlongX(
        generatedArm,
        LANE_W * 2 + 2.4,
        0.7,
      );
      centerGeneratedAt(
        generatedArm,
        new Vector3(0, Sweeper.ARM_Y, rowZ(row)),
      );
      arm.setEnabled(false);
      for (const pad of this.root
        .getChildMeshes()
        .filter((mesh) => mesh.name.startsWith("sweeper-pad-"))) {
        pad.setEnabled(false);
      }
    }
  }

  update(dt: number): void {
    this.angle = (this.angle + Sweeper.SPEED * dt) % (Math.PI * 2);
    this.root.rotation.y = this.angle;
  }

  /**
   * The arm spans the full diameter, so it points at `angle` and `angle + PI`.
   * A side lane is hit when either end sweeps past that lane's bearing.
   * With root Y-rotation, the arm's +X end points at world direction
   * (cos(-angle), sin(-angle)) in the XZ plane -> bearing atan2(x, z).
   */
  isDangerAtLane(lane: number): boolean {
    if (lane === 1) return false; // hub pillar: not enterable anyway
    const playerBearing = lane === 0 ? -Math.PI / 2 : Math.PI / 2;
    const armBearing = Math.atan2(Math.cos(this.angle), Math.sin(this.angle));
    return (
      angularDist(armBearing, playerBearing) < Sweeper.HIT_WIDTH ||
      angularDist(armBearing + Math.PI, playerBearing) < Sweeper.HIT_WIDTH
    );
  }
}

/** Punching walls: pistons that slam across the outer lanes. */
export class PistonRow {
  private static readonly PERIOD = 2.8; // seconds
  private static readonly TRAVEL = LANE_W; // how far the pad slides

  private pads: Partial<Record<number, Mesh>> = {};
  private offsets: Partial<Record<number, number>> = {};
  private extensions: Partial<Record<number, number>> = {};

  constructor(
    scene: Scene,
    row: number,
    lanes: Array<0 | 2>,
    assets: ArenaAssets,
  ) {
    const wallMat = inflatableMaterial(
      scene,
      "piston-wall-mat",
      new Color3(0.25, 0.25, 0.3),
    );
    const padMat = inflatableMaterial(
      scene,
      "piston-pad-mat",
      new Color3(0.95, 0.75, 0.05),
    );

    lanes.forEach((lane, i) => {
      const side = lane === 0 ? -1 : 1;
      const wallX = laneX(lane) + side * (LANE_W * 0.9);

      const wall = MeshBuilder.CreateBox(
        `piston-wall-${lane}`,
        { width: 0.6, height: 2.6, depth: 1.8 },
        scene,
      );
      wall.material = wallMat;
      wall.position = new Vector3(wallX, 1.0, rowZ(row));

      const pad = MeshBuilder.CreateBox(
        `piston-pad-${lane}`,
        { width: 1.2, height: 1.4, depth: 1.5 },
        scene,
      );
      pad.material = padMat;
      pad.position = new Vector3(wallX - side * 0.4, 0.7, rowZ(row));

      const generatedWall = assets.instantiate(
        "pistonWall",
        `generated-piston-wall-${lane}`,
      );
      if (generatedWall) {
        centerGeneratedAt(generatedWall, wall.position);
        wall.setEnabled(false);
      }

      const generatedPad = assets.instantiate(
        "pistonPad",
        `generated-piston-pad-${lane}`,
      );
      if (generatedPad) {
        generatedPad.parent = pad;
        generatedPad.rotation.y = -side * (Math.PI / 2);
        centerGeneratedAt(generatedPad, pad.position);
        pad.isVisible = false;
      }

      this.pads[lane] = pad;
      this.offsets[lane] = i * (PistonRow.PERIOD / 2);
      this.extensions[lane] = 0;
    });
  }

  update(t: number): void {
    for (const laneKey of Object.keys(this.pads)) {
      const lane = Number(laneKey);
      const side = lane === 0 ? -1 : 1;
      const phase =
        ((t + (this.offsets[lane] ?? 0)) % PistonRow.PERIOD) / PistonRow.PERIOD;
      // Profile: rest 45%, punch out 15%, hold 15%, retract 25%.
      let ext = 0;
      if (phase < 0.45) ext = 0;
      else if (phase < 0.6) ext = (phase - 0.45) / 0.15;
      else if (phase < 0.75) ext = 1;
      else ext = 1 - (phase - 0.75) / 0.25;
      this.extensions[lane] = ext;
      const pad = this.pads[lane];
      if (pad) {
        const baseX = laneX(lane) + side * (LANE_W * 0.9 - 0.4);
        pad.position.x = baseX - side * ext * PistonRow.TRAVEL;
      }
    }
  }

  /** 0..1 — how far the piston covering this lane is extended. */
  extension(lane: number): number {
    return this.extensions[lane] ?? 0;
  }
}

/** A platform sliding side-to-side across a water gap. */
export class MovingPlatform {
  private static readonly SPEED = 0.9; // rad/s
  mesh: Mesh;
  private t = 0;

  constructor(scene: Scene, row: number, assets: ArenaAssets) {
    const mat = inflatableMaterial(
      scene,
      "platform-mat",
      new Color3(0.15, 0.55, 0.85),
    );
    this.mesh = MeshBuilder.CreateBox(
      "moving-platform",
      { width: LANE_W * 0.95, height: 0.5, depth: 2.0 },
      scene,
    );
    this.mesh.material = mat;
    this.mesh.position = new Vector3(0, -0.25, rowZ(row));

    const generatedPlatform = assets.instantiate(
      "movingPlatform",
      "generated-moving-platform",
    );
    if (generatedPlatform) {
      generatedPlatform.parent = this.mesh;
      centerGeneratedAt(
        generatedPlatform,
        new Vector3(0, -0.25, rowZ(row)),
      );
      this.mesh.isVisible = false;
    }
  }

  update(t: number): void {
    this.t = t;
    this.mesh.position.x = this.currentX();
  }

  currentX(): number {
    return Math.sin(this.t * MovingPlatform.SPEED) * LANE_W;
  }
}
