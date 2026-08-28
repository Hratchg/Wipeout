import {
  Color3,
  PBRMaterial,
  Scene,
  Texture,
  TransformNode,
} from "@babylonjs/core";

function cachedPbr(
  scene: Scene,
  name: string,
  configure: (material: PBRMaterial) => void,
): PBRMaterial {
  const cached = scene.getMaterialByName(name);
  if (cached instanceof PBRMaterial) return cached;

  const material = new PBRMaterial(name, scene);
  configure(material);
  return material;
}

export function inflatableMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): PBRMaterial {
  return cachedPbr(scene, name, (material) => {
    material.albedoColor = color;
    material.metallic = 0.02;
    material.roughness = 0.68;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.28;
    material.clearCoat.roughness = 0.42;
  });
}

export function metalMaterial(scene: Scene, name: string): PBRMaterial {
  return cachedPbr(scene, name, (material) => {
    material.albedoColor = new Color3(0.62, 0.7, 0.78);
    material.metallic = 0.72;
    material.roughness = 0.3;
  });
}

export function emissiveMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): PBRMaterial {
  return cachedPbr(scene, name, (material) => {
    material.albedoColor = color.scale(0.12);
    material.emissiveColor = color;
    material.emissiveIntensity = 2.2;
    material.metallic = 0;
    material.roughness = 0.4;
  });
}

export function decalMaterial(
  scene: Scene,
  name: string,
  atlasUrl: string,
): PBRMaterial {
  return cachedPbr(scene, name, (material) => {
    const atlas = new Texture(atlasUrl, scene);
    atlas.name = `${name}-atlas`;
    atlas.wrapU = Texture.CLAMP_ADDRESSMODE;
    atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
    material.albedoTexture = atlas;
    material.metallic = 0;
    material.roughness = 0.58;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.18;
    material.clearCoat.roughness = 0.5;
  });
}

export function tuneGeneratedAssetMaterials(root: TransformNode): void {
  const visited = new Set<PBRMaterial>();
  for (const mesh of root.getChildMeshes()) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial) || visited.has(material)) continue;
    visited.add(material);

    // Tripo's baked metallic channel expects an IBL. Keep its authored color
    // texture, but make the inflatable assets respond well to arena lights
    // even when the game is running without an external environment map.
    material.metallic = 0.02;
    material.roughness = 0.58;
    material.directIntensity = 1.1;
    if (material.albedoTexture) {
      material.emissiveTexture = material.albedoTexture;
      material.emissiveColor = new Color3(0.32, 0.32, 0.32);
      material.emissiveIntensity = 0.9;
    }
  }
}
