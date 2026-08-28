import {
  AnimationGroup,
  Scene,
  SceneLoader,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Player } from "./player";

/**
 * Loads the character model, supporting two layouts:
 *
 * 1. `char_main.glb` — a single rigged GLB whose animation groups are matched
 *    by name (idle / walk|run / jump|samba...). Used by the free fallback
 *    character and by any single-file export.
 * 2. `char_<clip>.glb` — one GLB per clip (char_idle.glb, char_run.glb,
 *    char_jump.glb), as produced by the Tripo3D retarget pipeline; visibility
 *    toggling switches clips.
 *
 * If no GLB exists, the capsule placeholder stays.
 */

const CHARACTER_HEIGHT = 1.6; // meters in game world

type ClipName = "idle" | "run" | "jump";

const CLIP_PATTERNS: Record<ClipName, RegExp> = {
  idle: /idle|stand|breath/i,
  run: /run|walk|jog/i,
  jump: /jump|samba|dance|hop|leap/i,
};

const glbUrls = import.meta.glob<string>("../assets/glb/char_*.glb", {
  query: "?url",
  import: "default",
});

async function importGlb(url: string, scene: Scene) {
  const slash = url.lastIndexOf("/");
  return SceneLoader.ImportMeshAsync(
    "",
    url.substring(0, slash + 1),
    url.substring(slash + 1),
    scene,
  );
}

function normalizeAndAttach(
  root: TransformNode,
  measureNode: TransformNode,
  player: Player,
  shadows: ShadowGenerator,
  animator: { play(name: ClipName): void },
  faceRotationY: number,
): void {
  measureNode.computeWorldMatrix(true);
  const bounds = measureNode.getHierarchyBoundingVectors();
  const height = bounds.max.y - bounds.min.y;
  if (height > 0.01) {
    const scale = CHARACTER_HEIGHT / height;
    root.scaling = new Vector3(scale, scale, scale);
  }
  root.rotation = new Vector3(0, faceRotationY, 0);
  player.attachCharacter(root, animator, shadows);
}

async function loadSingleFile(
  url: string,
  scene: Scene,
  player: Player,
  shadows: ShadowGenerator,
): Promise<boolean> {
  const result = await importGlb(url, scene);
  const root = new TransformNode("character-root", scene);
  for (const mesh of result.meshes) {
    if (!mesh.parent) mesh.parent = root;
  }
  for (const group of result.animationGroups) group.stop();

  const groups: Partial<Record<ClipName, AnimationGroup>> = {};
  for (const clip of Object.keys(CLIP_PATTERNS) as ClipName[]) {
    groups[clip] = result.animationGroups.find((g) =>
      CLIP_PATTERNS[clip].test(g.name),
    );
  }
  if (!groups.idle && result.animationGroups.length > 0) {
    groups.idle = result.animationGroups[0];
  }

  let current: AnimationGroup | null = null;
  const animator = {
    play(name: ClipName): void {
      const next = groups[name] ?? groups.idle ?? null;
      if (!next || next === current) return;
      current?.stop();
      current = next;
      next.start(true, name === "run" ? 1.3 : 1.0);
    },
  };

  // The Babylon sample character natively faces +Z (down the course).
  normalizeAndAttach(root, root, player, shadows, animator, 0);
  return true;
}

async function loadPerClipFiles(
  entries: Array<[string, () => Promise<string>]>,
  scene: Scene,
  player: Player,
  shadows: ShadowGenerator,
): Promise<boolean> {
  interface Variant {
    node: TransformNode;
    groups: AnimationGroup[];
  }
  const root = new TransformNode("character-root", scene);
  const variants: Partial<Record<ClipName, Variant>> = {};

  for (const [path, resolve] of entries) {
    const clip = path.match(/char_(\w+)\.glb$/)?.[1] as ClipName | undefined;
    if (!clip || !(clip in CLIP_PATTERNS)) continue;
    const url = await resolve();
    const result = await importGlb(url, scene);
    const node = new TransformNode(`char-${clip}`, scene);
    for (const mesh of result.meshes) {
      if (!mesh.parent) mesh.parent = node;
    }
    node.parent = root;
    node.setEnabled(false);
    for (const group of result.animationGroups) group.stop();
    variants[clip] = { node, groups: result.animationGroups };
  }

  const idle = variants.idle;
  if (!idle) {
    root.dispose();
    return false;
  }

  let current: ClipName | null = null;
  const animator = {
    play(name: ClipName): void {
      if (current === name) return;
      current = name;
      const target = variants[name] ?? idle;
      for (const key of Object.keys(variants) as ClipName[]) {
        const v = variants[key];
        if (!v) continue;
        const active = v === target;
        v.node.setEnabled(active);
        for (const g of v.groups) {
          if (active) g.start(true, 1.0);
          else g.stop();
        }
      }
    },
  };

  idle.node.setEnabled(true);
  // Tripo3D exports face -Z; verify and adjust when those assets land.
  normalizeAndAttach(root, idle.node, player, shadows, animator, Math.PI);
  idle.node.setEnabled(true);
  animator.play("idle");
  return true;
}

export async function loadCharacter(
  scene: Scene,
  player: Player,
  shadows: ShadowGenerator,
): Promise<void> {
  const entries = Object.entries(glbUrls);
  if (entries.length === 0) return; // no character assets yet

  try {
    const mainEntry = entries.find(([path]) => path.endsWith("char_main.glb"));
    const clipEntries = entries.filter(
      ([path]) => !path.endsWith("char_main.glb"),
    );
    // Prefer the per-clip Tripo3D character when present.
    if (clipEntries.length > 0) {
      if (await loadPerClipFiles(clipEntries, scene, player, shadows)) return;
    }
    if (mainEntry) {
      await loadSingleFile(await mainEntry[1](), scene, player, shadows);
    }
  } catch (err) {
    console.warn("Character load failed; keeping placeholder:", err);
  }
}
