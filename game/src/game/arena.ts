import {
  Color3,
  Color4,
  DynamicTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import type { ArenaAssetId, ArenaAssets } from "./arenaAssets";
import { maxCourseRowCount, rowZ, WATER_Y } from "./course";
import {
  emissiveMaterial,
  inflatableMaterial,
  metalMaterial,
  tuneGeneratedAssetMaterials,
} from "./materials";

export interface ArenaEnvironment {
  root: TransformNode;
  water: Mesh;
  update(time: number, dt: number): void;
}

interface AssetPlacement {
  id: ArenaAssetId;
  name: string;
  x: number;
  z: number;
  groundY: number;
  rotationY: number;
  fallback: (root: TransformNode) => TransformNode;
}

function addShadowHierarchy(
  node: TransformNode,
  shadows: ShadowGenerator,
): void {
  for (const mesh of node.getChildMeshes()) {
    shadows.addShadowCaster(mesh);
  }
}

function alignChildToWrapper(
  child: TransformNode,
  wrapper: TransformNode,
): void {
  child.computeWorldMatrix(true);
  const bounds = child.getHierarchyBoundingVectors(true);
  child.position.x += wrapper.position.x - (bounds.min.x + bounds.max.x) / 2;
  child.position.y += wrapper.position.y - bounds.min.y;
  child.position.z += wrapper.position.z - (bounds.min.z + bounds.max.z) / 2;
}

function placeAsset(
  scene: Scene,
  assets: ArenaAssets,
  shadows: ShadowGenerator,
  parent: TransformNode,
  placement: AssetPlacement,
): TransformNode {
  const wrapper = new TransformNode(placement.name, scene);
  wrapper.parent = parent;
  wrapper.position.set(placement.x, placement.groundY, placement.z);

  const fallback = placement.fallback(wrapper);
  const generated = assets.instantiate(
    placement.id,
    `${placement.name}-generated`,
  );
  if (!generated) return wrapper;

  generated.parent = wrapper;
  generated.rotation.y = placement.rotationY;
  alignChildToWrapper(generated, wrapper);
  tuneGeneratedAssetMaterials(generated);
  addShadowHierarchy(generated, shadows);
  fallback.setEnabled(false);
  return wrapper;
}

function createStandFallback(
  scene: Scene,
  wrapper: TransformNode,
): TransformNode {
  const root = new TransformNode(`${wrapper.name}-fallback`, scene);
  root.parent = wrapper;
  const frame = metalMaterial(scene, "arena-fallback-metal");
  const colors = [
    inflatableMaterial(scene, "arena-red", new Color3(0.86, 0.08, 0.08)),
    inflatableMaterial(scene, "arena-blue", new Color3(0.03, 0.32, 0.86)),
    inflatableMaterial(scene, "arena-yellow", new Color3(1, 0.72, 0.02)),
  ];

  const base = MeshBuilder.CreateBox(
    `${wrapper.name}-fallback-base`,
    { width: 10, height: 0.6, depth: 3.5 },
    scene,
  );
  base.parent = root;
  base.position.y = 0.3;
  base.material = frame;

  for (let row = 0; row < 3; row++) {
    const bench = MeshBuilder.CreateBox(
      `${wrapper.name}-fallback-bench-${row}`,
      { width: 9.2, height: 0.45, depth: 0.9 },
      scene,
    );
    bench.parent = root;
    bench.position.set(0, 0.65 + row * 0.5, -1 + row * 0.9);
    bench.material = colors[row];
  }
  return root;
}

function createTowerFallback(
  scene: Scene,
  wrapper: TransformNode,
): TransformNode {
  const root = new TransformNode(`${wrapper.name}-fallback`, scene);
  root.parent = wrapper;
  const metal = metalMaterial(scene, "arena-fallback-metal");
  const blue = inflatableMaterial(
    scene,
    "arena-blue",
    new Color3(0.03, 0.32, 0.86),
  );

  const mast = MeshBuilder.CreateCylinder(
    `${wrapper.name}-fallback-mast`,
    { diameter: 0.45, height: 4 },
    scene,
  );
  mast.parent = root;
  mast.position.y = 2;
  mast.material = metal;

  const camera = MeshBuilder.CreateBox(
    `${wrapper.name}-fallback-camera`,
    { width: 1.7, height: 0.8, depth: 0.8 },
    scene,
  );
  camera.parent = root;
  camera.position.set(0, 4.2, 0);
  camera.material = blue;
  return root;
}

function createPropFallback(
  scene: Scene,
  wrapper: TransformNode,
): TransformNode {
  const root = new TransformNode(`${wrapper.name}-fallback`, scene);
  root.parent = wrapper;
  const red = inflatableMaterial(
    scene,
    "arena-red",
    new Color3(0.86, 0.08, 0.08),
  );
  const yellow = inflatableMaterial(
    scene,
    "arena-yellow",
    new Color3(1, 0.72, 0.02),
  );
  const metal = metalMaterial(scene, "arena-fallback-metal");

  const buoy = MeshBuilder.CreateCylinder(
    `${wrapper.name}-fallback-buoy`,
    { diameter: 1, height: 0.65, tessellation: 16 },
    scene,
  );
  buoy.parent = root;
  buoy.position.y = 0.25;
  buoy.material = yellow;

  const pole = MeshBuilder.CreateCylinder(
    `${wrapper.name}-fallback-pole`,
    { diameter: 0.08, height: 2.2, tessellation: 10 },
    scene,
  );
  pole.parent = root;
  pole.position.y = 1.4;
  pole.material = metal;

  const flag = MeshBuilder.CreatePlane(
    `${wrapper.name}-fallback-flag`,
    { width: 1.05, height: 0.65, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  flag.parent = root;
  flag.position.set(0.54, 2.05, 0);
  flag.material = red;
  return root;
}

function createSky(scene: Scene, root: TransformNode, rowCount: number): void {
  const sky = MeshBuilder.CreateSphere(
    "arena-sky",
    {
      diameter: 180,
      segments: 24,
      sideOrientation: Mesh.BACKSIDE,
    },
    scene,
  );
  sky.parent = root;
  sky.position.set(0, 12, rowZ(rowCount / 2));
  sky.infiniteDistance = true;
  sky.isPickable = false;

  const gradient = new DynamicTexture(
    "arena-sky-gradient",
    { width: 16, height: 512 },
    scene,
    false,
  );
  const context = gradient.getContext() as CanvasRenderingContext2D;
  const fill = context.createLinearGradient(0, 0, 0, 512);
  fill.addColorStop(0, "#188be0");
  fill.addColorStop(0.5, "#69c8f5");
  fill.addColorStop(0.78, "#c7efff");
  fill.addColorStop(1, "#fff2ca");
  context.fillStyle = fill;
  context.fillRect(0, 0, 16, 512);
  gradient.update();

  const material = emissiveMaterial(
    scene,
    "arena-sky-material",
    new Color3(0.25, 0.65, 1),
  );
  material.emissiveTexture = gradient;
  material.unlit = true;
  material.backFaceCulling = false;
  sky.material = material;
}

function createOceanTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    "ocean-wave-texture",
    { width: 256, height: 256 },
    scene,
    false,
  );
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#087ac4";
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = "rgba(119, 224, 255, 0.45)";
  context.lineWidth = 5;
  for (let y = -16; y < 280; y += 32) {
    context.beginPath();
    for (let x = -16; x < 280; x += 8) {
      const waveY = y + Math.sin(x * 0.065 + y * 0.035) * 6;
      if (x === -16) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    context.stroke();
  }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 9;
  texture.vScale = 14;
  return texture;
}

export function buildArenaEnvironment(
  scene: Scene,
  assets: ArenaAssets,
  shadows: ShadowGenerator,
): ArenaEnvironment {
  const root = new TransformNode("arena-root", scene);
  scene.clearColor = new Color4(0.48, 0.78, 0.98, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 58;
  scene.fogEnd = 135;
  scene.fogColor = new Color3(0.65, 0.86, 0.98);

  const rowCount = maxCourseRowCount();
  createSky(scene, root, rowCount);

  const fill = new HemisphericLight(
    "arena-cool-fill",
    new Vector3(-0.25, 1, -0.15),
    scene,
  );
  fill.intensity = 0.58;
  fill.diffuse = new Color3(0.62, 0.82, 1);
  fill.groundColor = new Color3(0.08, 0.22, 0.36);

  const courseLength = rowZ(rowCount) + 40;
  const water = MeshBuilder.CreateGround(
    "ocean",
    {
      width: 90,
      height: courseLength + 60,
      subdivisions: 64,
      updatable: true,
    },
    scene,
  );
  water.parent = root;
  water.position = new Vector3(0, WATER_Y, rowZ(rowCount / 2));
  water.receiveShadows = true;
  water.isPickable = false;

  const waterMaterial = inflatableMaterial(
    scene,
    "ocean-material",
    new Color3(0.01, 0.35, 0.72),
  );
  waterMaterial.metallic = 0.08;
  waterMaterial.roughness = 0.24;
  waterMaterial.clearCoat.intensity = 0.75;
  waterMaterial.clearCoat.roughness = 0.12;
  const oceanTexture = createOceanTexture(scene);
  waterMaterial.albedoTexture = oceanTexture;
  water.material = waterMaterial;

  const spectatorZ = rowZ(12);
  placeAsset(scene, assets, shadows, root, {
    id: "spectatorStand",
    name: "spectator-left",
    x: -15,
    z: spectatorZ,
    groundY: WATER_Y + 0.08,
    rotationY: Math.PI / 2,
    fallback: (wrapper) => createStandFallback(scene, wrapper),
  });
  placeAsset(scene, assets, shadows, root, {
    id: "spectatorStand",
    name: "spectator-right",
    x: 15,
    z: spectatorZ,
    groundY: WATER_Y + 0.08,
    rotationY: -Math.PI / 2,
    fallback: (wrapper) => createStandFallback(scene, wrapper),
  });

  placeAsset(scene, assets, shadows, root, {
    id: "cameraTower",
    name: "camera-tower-left",
    x: -9,
    z: rowZ(5),
    groundY: WATER_Y + 0.08,
    rotationY: Math.PI / 2,
    fallback: (wrapper) => createTowerFallback(scene, wrapper),
  });
  placeAsset(scene, assets, shadows, root, {
    id: "cameraTower",
    name: "camera-tower-right",
    x: 9,
    z: rowZ(17),
    groundY: WATER_Y + 0.08,
    rotationY: -Math.PI / 2,
    fallback: (wrapper) => createTowerFallback(scene, wrapper),
  });

  const animatedProps: TransformNode[] = [];
  const propRows = [1, 5, 9, 13, 17, 21];
  for (const [index, row] of propRows.entries()) {
    for (const side of [-1, 1] as const) {
      const name = `arena-props-${side < 0 ? "left" : "right"}-${index}`;
      const props = placeAsset(scene, assets, shadows, root, {
        id: "arenaProps",
        name,
        x: side * 6.4,
        z: rowZ(row),
        groundY: WATER_Y + 0.04,
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        fallback: (wrapper) => createPropFallback(scene, wrapper),
      });
      animatedProps.push(props);
    }
  }

  const sourcePositions = water.getVerticesData(VertexBuffer.PositionKind);
  if (!sourcePositions) {
    throw new Error("Ocean mesh is missing position data");
  }
  const basePositions = new Float32Array(sourcePositions);
  const animatedPositions = new Float32Array(basePositions);

  return {
    root,
    water,
    update(time: number, dt: number): void {
      void dt;
      oceanTexture.uOffset = (time * 0.012) % 1;
      oceanTexture.vOffset = (time * 0.008) % 1;

      for (let index = 0; index < animatedPositions.length; index += 3) {
        const x = basePositions[index];
        const z = basePositions[index + 2];
        animatedPositions[index + 1] =
          Math.sin(x * 0.2 + time * 0.9) * 0.055 +
          Math.sin(z * 0.15 - time * 0.65) * 0.04;
      }
      water.updateVerticesData(
        VertexBuffer.PositionKind,
        animatedPositions,
        false,
        false,
      );

      for (let index = 0; index < animatedProps.length; index++) {
        const props = animatedProps[index];
        const phase = index * 0.67;
        props.rotation.z = Math.sin(time * 1.8 + phase) * 0.022;
        props.rotation.x = Math.cos(time * 1.35 + phase) * 0.012;
      }
    },
  };
}
