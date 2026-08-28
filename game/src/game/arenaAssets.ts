import {
  InstancedMesh,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
  type AssetContainer,
} from "@babylonjs/core";
import manifest from "../assets/arena/manifest.json";

export type ArenaAssetId =
  | "platform"
  | "ballMount"
  | "sweeperHub"
  | "sweeperArm"
  | "pistonWall"
  | "pistonPad"
  | "movingPlatform"
  | "finishGate"
  | "spectatorStand"
  | "cameraTower"
  | "arenaProps";

export interface ArenaAssets {
  instantiate(id: ArenaAssetId, name: string): TransformNode | null;
  has(id: ArenaAssetId): boolean;
  failures: ReadonlyArray<ArenaAssetId>;
}

interface ManifestAsset {
  id: ArenaAssetId;
  glb: string;
  inGameSize: string;
}

type TargetSize =
  | { width: number; height: number; depth: number }
  | { footprint: number };

interface LoadedAsset {
  container: AssetContainer;
  targetSize: TargetSize;
}

const arenaGlbs = import.meta.glob<string>("../assets/arena/*.glb", {
  query: "?url",
  import: "default",
});

const manifestAssets = manifest.assets as unknown as ReadonlyArray<ManifestAsset>;

function parseTargetSize(description: string): TargetSize {
  const dimensions = description.match(
    /^([\d.]+)m × ([\d.]+)m × ([\d.]+)m$/,
  );
  if (dimensions) {
    return {
      width: Number(dimensions[1]),
      height: Number(dimensions[2]),
      depth: Number(dimensions[3]),
    };
  }

  const diameterAndHeight = description.match(
    /^([\d.]+)m diameter × ([\d.]+)m high$/,
  );
  if (diameterAndHeight) {
    const diameter = Number(diameterAndHeight[1]);
    return {
      width: diameter,
      height: Number(diameterAndHeight[2]),
      depth: diameter,
    };
  }

  const footprint = description.match(
    /^([\d.]+)m (?:diameter|cluster) footprint$/,
  );
  if (footprint) {
    return { footprint: Number(footprint[1]) };
  }

  throw new Error(`Unsupported arena target size: ${description}`);
}

function normalizeRoot(root: TransformNode, targetSize: TargetSize): void {
  root.computeWorldMatrix(true);
  const bounds = root.getHierarchyBoundingVectors(true);
  const size = bounds.max.subtract(bounds.min);

  if ("footprint" in targetSize) {
    const footprint = Math.max(size.x, size.z);
    if (footprint <= 0.0001) {
      throw new Error("Arena asset has no measurable footprint");
    }
    const scale = targetSize.footprint / footprint;
    root.scaling.multiplyInPlace(new Vector3(scale, scale, scale));
    return;
  }

  if (size.x <= 0.0001 || size.y <= 0.0001 || size.z <= 0.0001) {
    throw new Error("Arena asset has no measurable volume");
  }
  root.scaling.multiplyInPlace(
    new Vector3(
      targetSize.width / size.x,
      targetSize.height / size.y,
      targetSize.depth / size.z,
    ),
  );
}

async function loadContainer(
  glb: string,
  scene: Scene,
): Promise<AssetContainer | null> {
  try {
    const resolver = Object.entries(arenaGlbs).find(([path]) =>
      path.endsWith(`/${glb}`),
    )?.[1];
    if (!resolver) {
      throw new Error(`No Vite URL resolver found for ${glb}`);
    }

    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      await resolver(),
      scene,
    );
    for (const mesh of container.meshes) {
      if (!(mesh instanceof InstancedMesh)) {
        mesh.receiveShadows = true;
      }
    }
    for (const root of container.rootNodes) {
      root.setEnabled(false);
    }
    return container;
  } catch (error) {
    console.warn(`Arena asset load failed for ${glb}; using primitives:`, error);
    return null;
  }
}

export async function loadArenaAssets(scene: Scene): Promise<ArenaAssets> {
  const glbs = [...new Set(manifestAssets.map((asset) => asset.glb))];
  const loadResults = await Promise.all(
    glbs.map(async (glb) => [glb, await loadContainer(glb, scene)] as const),
  );
  const containers = new Map(loadResults);
  const loaded = new Map<ArenaAssetId, LoadedAsset>();
  const failed: ArenaAssetId[] = [];

  for (const asset of manifestAssets) {
    const container = containers.get(asset.glb);
    if (!container) {
      failed.push(asset.id);
      continue;
    }

    try {
      loaded.set(asset.id, {
        container,
        targetSize: parseTargetSize(asset.inGameSize),
      });
    } catch (error) {
      failed.push(asset.id);
      console.warn(
        `Arena asset catalog failed for ${asset.id}; using primitives:`,
        error,
      );
    }
  }

  const failures: ReadonlyArray<ArenaAssetId> = Object.freeze([...failed]);
  return {
    instantiate(id: ArenaAssetId, name: string): TransformNode | null {
      const asset = loaded.get(id);
      if (!asset) return null;

      let root: TransformNode | null = null;
      try {
        const instance = asset.container.instantiateModelsToScene(
          (sourceName) => `${name}-${sourceName}`,
          false,
          { doNotInstantiate: false },
        );
        if (instance.rootNodes.length === 0) return null;

        root = new TransformNode(name, scene);
        for (const node of instance.rootNodes) {
          node.parent = root;
          node.setEnabled(true);
        }
        normalizeRoot(root, asset.targetSize);
        return root;
      } catch (error) {
        root?.dispose();
        console.warn(
          `Arena asset instantiation failed for ${id}; using primitives:`,
          error,
        );
        return null;
      }
    },
    has(id: ArenaAssetId): boolean {
      return loaded.has(id);
    },
    failures,
  };
}
