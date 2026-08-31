import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import {
  circleHitsAabb2D,
  PLAYER_HIT_RADIUS,
  sweeperHitsPlayer,
  sweeperTangent,
} from "./collision";
import { LANE_W, laneX, rowZ, WATER_Y } from "./course";
import type { ArenaAssets } from "./arenaAssets";
import {
  inflatableMaterial,
  tuneGeneratedAssetMaterials,
} from "./materials";

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

  constructor(
    scene: Scene,
    row: number,
    assets: ArenaAssets,
    parent?: TransformNode,
  ) {
    const mat = inflatableMaterial(
      scene,
      "ball-mat",
      new Color3(0.85, 0.1, 0.12),
    );
    for (let lane = 0; lane < 3; lane++) {
      const root = new TransformNode(`ball-root-${lane}`, scene);
      if (parent) root.parent = parent;
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

  dispose(): void {
    for (const root of this.roots) {
      root.dispose();
    }
    this.roots.length = 0;
    this.balls.length = 0;
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
  private static readonly ARM_Y = 0.45;
  private static readonly ARM_HALF_WIDTH = (LANE_W * 2 + 2.4) / 2;
  private static readonly ARM_HALF_DEPTH = 0.45;

  private root: TransformNode;
  private hubZ: number;
  private angle = 0;

  constructor(
    scene: Scene,
    row: number,
    assets: ArenaAssets,
    parent?: TransformNode,
  ) {
    this.hubZ = rowZ(row);
    this.root = new TransformNode("sweeper-root", scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(0, Sweeper.ARM_Y, this.hubZ);

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

  dispose(): void {
    this.root.dispose();
  }

  update(dt: number): void {
    this.angle = (this.angle + Sweeper.SPEED * dt) % (Math.PI * 2);
    this.root.rotation.y = this.angle;
  }

  /** True when the physical arm volume overlaps the player in XZ. */
  hitsPlayer(px: number, pz: number, radius = PLAYER_HIT_RADIUS): boolean {
    return sweeperHitsPlayer(
      this.angle,
      Sweeper.ARM_HALF_WIDTH,
      Sweeper.ARM_HALF_DEPTH,
      this.hubZ,
      px,
      pz,
      radius,
    );
  }

  knockDirection(px: number, pz: number): Vector3 {
    return this.knockImpulse(px, pz).linear;
  }

  /** Throw in the arm's swing direction, with spin from the contact offset. */
  knockImpulse(px: number, pz: number): { linear: Vector3; angular: Vector3 } {
    const { vx, vz } = sweeperTangent(px, pz, this.hubZ, Sweeper.SPEED);
    const tangent = new Vector3(vx, 0, vz);
    const outward = new Vector3(px, 0, pz - this.hubZ);
    if (outward.lengthSquared() < 0.01) outward.set(1, 0, 0);
    else outward.normalize();
    const speed = tangent.length();
    const linear = tangent.scale(2.2).add(outward.scale(2.4));
    linear.y = 5.4 + Math.min(speed, 4) * 0.4;
    return {
      linear,
      angular: new Vector3(-vz * 1.15, Sweeper.SPEED * 3.4, vx * 1.15),
    };
  }
}

/** Punching walls: pistons that slam across the outer lanes. */
export class PistonRow {
  private static readonly PERIOD = 2.8; // seconds
  private static readonly TRAVEL = LANE_W; // how far the pad slides

  private root: TransformNode;
  private pads: Partial<Record<number, Mesh>> = {};
  private offsets: Partial<Record<number, number>> = {};
  private extensions: Partial<Record<number, number>> = {};
  private padSpeed: Partial<Record<number, number>> = {};
  private lastT = 0;

  constructor(
    scene: Scene,
    row: number,
    lanes: Array<0 | 2>,
    assets: ArenaAssets,
    parent?: TransformNode,
  ) {
    this.root = new TransformNode("piston-row-root", scene);
    if (parent) this.root.parent = parent;
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
      wall.parent = this.root;
      wall.position = new Vector3(wallX, 1.0, rowZ(row));

      const pad = MeshBuilder.CreateBox(
        `piston-pad-${lane}`,
        { width: 1.2, height: 1.4, depth: 1.5 },
        scene,
      );
      pad.material = padMat;
      pad.parent = this.root;
      pad.position = new Vector3(wallX - side * 0.4, 0.7, rowZ(row));

      const generatedWall = assets.instantiate(
        "pistonWall",
        `generated-piston-wall-${lane}`,
      );
      if (generatedWall) {
        generatedWall.parent = this.root;
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

  dispose(): void {
    this.root.dispose();
  }

  update(t: number): void {
    const dt = Math.max(t - this.lastT, 1 / 120);
    this.lastT = t;
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
      const prev = this.extensions[lane] ?? 0;
      this.extensions[lane] = ext;
      const pad = this.pads[lane];
      if (pad) {
        const baseX = laneX(lane) + side * (LANE_W * 0.9 - 0.4);
        pad.position.x = baseX - side * ext * PistonRow.TRAVEL;
        this.padSpeed[lane] = ((-side * (ext - prev) * PistonRow.TRAVEL) / dt);
      }
    }
  }

  /** True when a protruding pad overlaps the player, including center lane. */
  hitsPlayer(px: number, pz: number, radius = PLAYER_HIT_RADIUS): boolean {
    for (const pad of Object.values(this.pads)) {
      if (!pad) continue;
      pad.computeWorldMatrix(true);
      const bounds = pad.getHierarchyBoundingVectors(true);
      if (
        circleHitsAabb2D(
          px,
          pz,
          radius,
          bounds.min.x,
          bounds.max.x,
          bounds.min.z,
          bounds.max.z,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  knockDirection(px: number): Vector3 {
    return this.knockImpulse(px, 0).linear;
  }

  /** Shove along the pad's current punch velocity. */
  knockImpulse(px: number, pz: number): { linear: Vector3; angular: Vector3 } {
    let vx = 0;
    for (const laneKey of Object.keys(this.pads)) {
      const lane = Number(laneKey);
      const pad = this.pads[lane];
      if (!pad) continue;
      pad.computeWorldMatrix(true);
      const bounds = pad.getHierarchyBoundingVectors(true);
      if (
        circleHitsAabb2D(
          px,
          pz,
          PLAYER_HIT_RADIUS,
          bounds.min.x,
          bounds.max.x,
          bounds.min.z,
          bounds.max.z,
        )
      ) {
        vx = this.padSpeed[lane] ?? 0;
        break;
      }
    }
    if (Math.abs(vx) < 0.4) vx = px === 0 ? 5 : -Math.sign(px) * 5;
    return {
      linear: new Vector3(vx * 1.15, 5.3, 0.55),
      angular: new Vector3(0.4, vx * 0.35, -vx * 0.85),
    };
  }
}

/** A platform sliding side-to-side across a water gap. */
export class MovingPlatform {
  private static readonly SPEED = 0.9; // rad/s
  mesh: Mesh;
  private t = 0;

  constructor(
    scene: Scene,
    row: number,
    assets: ArenaAssets,
    parent?: TransformNode,
  ) {
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
    if (parent) this.mesh.parent = parent;
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

  dispose(): void {
    this.mesh.dispose();
  }

  update(t: number): void {
    this.t = t;
    this.mesh.position.x = this.currentX();
  }

  currentX(): number {
    return Math.sin(this.t * MovingPlatform.SPEED) * LANE_W;
  }
}
