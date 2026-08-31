import {
  Color3,
  DirectionalLight,
  DynamicTexture,
  type Material,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import arenaDecalsUrl from "../assets/arena/arena_decals.png?url";
import {
  type Course,
  finishRowOf,
  getCourse,
  LANE_COUNT,
  LANE_W,
  laneX,
  ROW_D,
  rowZ,
  TILE_H,
  WATER_Y,
} from "./course";
import { BigBalls, MovingPlatform, PistonRow, Sweeper } from "./hazards";
import type { ArenaAssets } from "./arenaAssets";
import {
  buildArenaEnvironment,
  type ArenaEnvironment,
} from "./arena";
import {
  decalMaterial,
  emissiveMaterial,
  inflatableMaterial,
  tuneGeneratedAssetMaterials,
} from "./materials";

export interface CourseHazards {
  balls: BigBalls;
  sweeper: Sweeper;
  sweeperRow: number;
  pistons: PistonRow;
  pistonRow: number;
  platform: MovingPlatform;
  platformRow: number;
  dispose(): void;
}

export interface BuiltWorld {
  hazards: CourseHazards;
  shadows: ShadowGenerator;
  arena: ArenaEnvironment;
  playfield: TransformNode;
}

function makeCheckerTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName("checker");
  if (existing instanceof DynamicTexture) return existing;
  const size = 256;
  const tex = new DynamicTexture("checker", size, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cells = 4;
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#111111";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  tex.update();
  return tex;
}

function finishTopMaterial(scene: Scene): StandardMaterial {
  const cached = scene.getMaterialByName("finish-top-mat");
  if (cached instanceof StandardMaterial) return cached;
  const finishTopMat = new StandardMaterial("finish-top-mat", scene);
  finishTopMat.diffuseTexture = makeCheckerTexture(scene);
  finishTopMat.specularColor = new Color3(0.1, 0.1, 0.1);
  return finishTopMat;
}

function poleMaterial(scene: Scene): StandardMaterial {
  const cached = scene.getMaterialByName("pole-mat");
  if (cached instanceof StandardMaterial) return cached;
  const poleMat = new StandardMaterial("pole-mat", scene);
  poleMat.diffuseColor = new Color3(0.85, 0.85, 0.9);
  return poleMat;
}

export function buildWorld(
  scene: Scene,
  arenaAssets: ArenaAssets,
  course: Course = getCourse("main"),
): BuiltWorld {
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.6), scene);
  sun.intensity = 1.22;
  sun.position = new Vector3(15, 30, -20);
  sun.diffuse = new Color3(1, 0.82, 0.66);
  sun.specular = new Color3(1, 0.9, 0.76);
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;

  const arena = buildArenaEnvironment(scene, arenaAssets, shadows);
  const { playfield, hazards } = buildPlayfield(
    scene,
    arenaAssets,
    course,
    shadows,
  );

  return { hazards, shadows, arena, playfield };
}

function removeShadowCastersUnder(
  root: TransformNode,
  shadows: ShadowGenerator,
): void {
  for (const mesh of root.getChildMeshes()) {
    shadows.removeShadowCaster(mesh);
  }
}

function pruneDisposedShadowCasters(shadows: ShadowGenerator): void {
  const list = shadows.getShadowMap()?.renderList;
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const mesh = list[i];
    if (!mesh || mesh.isDisposed()) {
      list.splice(i, 1);
    }
  }
}

export function rebuildPlayfield(
  world: BuiltWorld,
  scene: Scene,
  arenaAssets: ArenaAssets,
  course: Course,
): void {
  removeShadowCastersUnder(world.playfield, world.shadows);
  world.hazards.dispose();
  world.playfield.dispose();
  pruneDisposedShadowCasters(world.shadows);
  const next = buildPlayfield(scene, arenaAssets, course, world.shadows);
  world.playfield = next.playfield;
  world.hazards = next.hazards;
}

function buildPlayfield(
  scene: Scene,
  arenaAssets: ArenaAssets,
  course: Course,
  shadows: ShadowGenerator,
): { playfield: TransformNode; hazards: CourseHazards } {
  // Materials
  const tileMat = inflatableMaterial(
    scene,
    "tile-mat",
    new Color3(0.82, 0.12, 0.14),
  );

  const tileTopMat = inflatableMaterial(
    scene,
    "tile-top-mat",
    new Color3(0.92, 0.9, 0.88),
  );

  const checkpointTopMat = inflatableMaterial(
    scene,
    "cp-top-mat",
    new Color3(0.15, 0.75, 0.3),
  );

  const finishTopMat = finishTopMaterial(scene);
  const courseDecalMat = decalMaterial(
    scene,
    "course-decal-material",
    arenaDecalsUrl,
  );
  courseDecalMat.zOffset = -2;

  const playfield = new TransformNode("course-playfield", scene);

  // Template meshes, instanced per tile.
  const bodyTemplate = MeshBuilder.CreateBox(
    "tile-body-template",
    { width: LANE_W * 0.94, height: TILE_H, depth: ROW_D * 0.94 },
    scene,
  );
  bodyTemplate.material = tileMat;
  bodyTemplate.parent = playfield;
  bodyTemplate.setEnabled(false);

  const makeTop = (name: string, mat: Material): Mesh => {
    const top = MeshBuilder.CreateBox(
      name,
      { width: LANE_W * 0.94, height: 0.08, depth: ROW_D * 0.94 },
      scene,
    );
    top.material = mat;
    top.parent = playfield;
    top.setEnabled(false);
    return top;
  };
  const topTemplate = makeTop("tile-top-template", tileTopMat);
  const cpTopTemplate = makeTop("cp-top-template", checkpointTopMat);
  const finishTopTemplate = makeTop("finish-top-template", finishTopMat);

  const placeGeneratedPlatform = (
    generated: TransformNode,
    x: number,
    z: number,
  ): void => {
    generated.parent = playfield;
    generated.computeWorldMatrix(true);
    const bounds = generated.getHierarchyBoundingVectors(true);
    generated.position.x += x - (bounds.min.x + bounds.max.x) / 2;
    generated.position.y += -TILE_H + 0.02 - bounds.min.y;
    generated.position.z += z - (bounds.min.z + bounds.max.z) / 2;
    tuneGeneratedAssetMaterials(generated);
    for (const mesh of generated.getChildMeshes()) {
      shadows.addShadowCaster(mesh);
    }
  };

  const createCourseMarker = (
    name: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    uvRect: readonly [number, number, number, number],
  ): void => {
    const marker = MeshBuilder.CreateGround(
      name,
      { width, height: depth, updatable: true },
      scene,
    );
    marker.parent = playfield;
    marker.position.set(x, 0.025, z);
    marker.material = courseDecalMat;
    marker.isPickable = false;
    const uvs = marker.getVerticesData(VertexBuffer.UVKind);
    if (uvs) {
      const [uMin, vMin, uMax, vMax] = uvRect;
      for (let index = 0; index < uvs.length; index += 2) {
        uvs[index] = uMin + uvs[index] * (uMax - uMin);
        uvs[index + 1] = vMin + uvs[index + 1] * (vMax - vMin);
      }
      marker.updateVerticesData(VertexBuffer.UVKind, uvs);
    }
  };

  course.rows.forEach((spec, row) => {
    if (spec.kind !== "solid") return;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (!spec.tiles?.[lane]) continue;
      const body = bodyTemplate.createInstance(`tile-${row}-${lane}`);
      body.position = new Vector3(laneX(lane), -TILE_H / 2, rowZ(row));
      body.parent = playfield;

      const topSource = spec.finish
        ? finishTopTemplate
        : spec.checkpoint
          ? cpTopTemplate
          : topTemplate;
      const top = topSource.createInstance(`tile-top-${row}-${lane}`);
      top.position = new Vector3(laneX(lane), 0.04, rowZ(row));
      top.parent = playfield;

      const generated = arenaAssets.instantiate(
        "platform",
        `platform-${row}-${lane}`,
      );
      if (generated) {
        placeGeneratedPlatform(generated, laneX(lane), rowZ(row));
        body.setEnabled(false);
        top.setEnabled(false);

        if (spec.finish) {
          createCourseMarker(
            `finish-marker-${row}-${lane}`,
            laneX(lane),
            rowZ(row),
            1.8,
            0.58,
            [0.51, 0.84, 0.98, 0.98],
          );
        } else if (spec.checkpoint) {
          createCourseMarker(
            `checkpoint-marker-${row}-${lane}`,
            laneX(lane),
            rowZ(row),
            0.94,
            0.94,
            [0.8, 0.48, 0.99, 0.7],
          );
        } else if (course.rows[row + 1]?.kind === "gap") {
          createCourseMarker(
            `warning-marker-${row}-${lane}`,
            laneX(lane),
            rowZ(row) + ROW_D * 0.27,
            1.85,
            0.56,
            [0.02, 0.83, 0.49, 0.98],
          );
        }
      }

      // Support pillar down into the water for depth.
      const pillar = MeshBuilder.CreateBox(
        `tile-pillar-${row}-${lane}`,
        { width: LANE_W * 0.4, height: Math.abs(WATER_Y) + 1, depth: 0.6 },
        scene,
      );
      pillar.material = tileMat;
      pillar.position = new Vector3(
        laneX(lane),
        WATER_Y / 2 - 0.5,
        rowZ(row),
      );
      pillar.parent = playfield;
    }
  });

  // Finish flag
  const finishRow = finishRowOf(course.rows);
  const finishRoot = new TransformNode("finish-gate-root", scene);
  finishRoot.parent = playfield;
  const proceduralFinish = new TransformNode("finish-gate-fallback", scene);
  proceduralFinish.parent = finishRoot;
  const poleMat = poleMaterial(scene);
  for (const side of [-1, 1]) {
    const pole = MeshBuilder.CreateCylinder(
      `finish-pole-${side}`,
      { diameter: 0.15, height: 3.5 },
      scene,
    );
    pole.material = poleMat;
    pole.position = new Vector3(side * (LANE_W * 1.5), 1.75, rowZ(finishRow));
    pole.parent = proceduralFinish;
  }
  const banner = MeshBuilder.CreatePlane(
    "finish-banner",
    { width: LANE_W * 3, height: 0.8 },
    scene,
  );
  banner.material = finishTopMat;
  banner.position = new Vector3(0, 3.1, rowZ(finishRow));
  banner.parent = proceduralFinish;

  const generatedFinish = arenaAssets.instantiate(
    "finishGate",
    "finish-gate-generated",
  );
  if (generatedFinish) {
    generatedFinish.parent = finishRoot;
    generatedFinish.computeWorldMatrix(true);
    const bounds = generatedFinish.getHierarchyBoundingVectors(true);
    generatedFinish.position.x -= (bounds.min.x + bounds.max.x) / 2;
    generatedFinish.position.y += -0.42 - bounds.min.y;
    generatedFinish.position.z +=
      rowZ(finishRow) - (bounds.min.z + bounds.max.z) / 2;
    tuneGeneratedAssetMaterials(generatedFinish);
    for (const mesh of generatedFinish.getChildMeshes()) {
      shadows.addShadowCaster(mesh);
    }
    proceduralFinish.setEnabled(false);
  }

  const finishLightMat = emissiveMaterial(
    scene,
    "finish-light-material",
    new Color3(1, 0.16, 0.05),
  );
  for (let index = 0; index < 6; index++) {
    const light = MeshBuilder.CreateSphere(
      `finish-light-${index}`,
      { diameter: 0.24, segments: 10 },
      scene,
    );
    light.parent = finishRoot;
    light.position.set(
      -3.1 + index * 1.24,
      3.35 + Math.sin((index / 5) * Math.PI) * 0.34,
      rowZ(finishRow) - 0.54,
    );
    light.material = finishLightMat;
  }

  // Hazards
  let ballsRow = 0;
  let sweeperRow = 0;
  let pistonRow = 0;
  let pistonLanes: Array<0 | 2> = [];
  let platformRow = 0;
  course.rows.forEach((spec, row) => {
    if (spec.kind === "balls") ballsRow = row;
    if (spec.sweeper) sweeperRow = row;
    if (spec.pistons) {
      pistonRow = row;
      pistonLanes = spec.pistons;
    }
    if (spec.kind === "platform") platformRow = row;
  });

  const hazards: CourseHazards = {
    balls: new BigBalls(scene, ballsRow, arenaAssets, playfield),
    sweeper: new Sweeper(scene, sweeperRow, arenaAssets, playfield),
    sweeperRow,
    pistons: new PistonRow(
      scene,
      pistonRow,
      pistonLanes,
      arenaAssets,
      playfield,
    ),
    pistonRow,
    platform: new MovingPlatform(scene, platformRow, arenaAssets, playfield),
    platformRow,
    dispose() {
      this.balls.dispose();
      this.sweeper.dispose();
      this.pistons.dispose();
      this.platform.dispose();
      pruneDisposedShadowCasters(shadows);
    },
  };

  return { playfield, hazards };
}
