import {
  Color3,
  FreeCamera,
  PBRMaterial,
  Scene,
  Vector3,
} from "@babylonjs/core";

const MAX_TRANSLATION = new Vector3(0.4, 0.34, 1.5);
const MAX_ROTATION = new Vector3(0.055, 0.065, 0.045);
const REDUCED_MOTION_SCALE = 0.15;
const FINISH_FLASH_SECONDS = 1.8;

interface FlashMaterial {
  material: PBRMaterial;
  baseColor: Color3;
  baseIntensity: number;
}

function clampVector(value: Vector3, limit: Vector3): void {
  value.x = Math.max(-limit.x, Math.min(limit.x, value.x));
  value.y = Math.max(-limit.y, Math.min(limit.y, value.y));
  value.z = Math.max(-limit.z, Math.min(limit.z, value.z));
}

/**
 * Camera-only feedback. Game owns the chase pose and invokes update after it
 * has restored that pose for the current frame.
 */
export class CameraEffects {
  private translation = Vector3.Zero();
  private rotation = Vector3.Zero();
  private flashMaterials: FlashMaterial[] = [];
  private flashRemaining = 0;
  private camera: FreeCamera;
  private reducedMotion: () => boolean;

  constructor(
    scene: Scene,
    camera: FreeCamera,
    reducedMotion: () => boolean,
  ) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.prepareFinishLightMaterials(scene);
  }

  impact(position: Vector3): void {
    const side = position.x >= this.camera.position.x ? -1 : 1;
    this.addImpulse(
      new Vector3(side * 0.28, 0.22, -0.18),
      new Vector3(-0.035, side * 0.025, side * 0.04),
    );
  }

  splash(position: Vector3): void {
    const side = position.x >= this.camera.position.x ? -1 : 1;
    this.addImpulse(
      new Vector3(side * 0.12, -0.1, -0.08),
      new Vector3(0.018, side * 0.012, 0),
    );
  }

  checkpoint(position: Vector3): void {
    const side = position.x >= this.camera.position.x ? -1 : 1;
    this.addImpulse(
      new Vector3(side * 0.08, 0.12, 0.12),
      new Vector3(-0.014, side * 0.012, 0),
    );
  }

  finish(): void {
    // The finish push-in is intentionally absent in reduced-motion mode.
    const pushIn = this.reducedMotion() ? 0 : 1.35;
    this.addImpulse(
      new Vector3(0, 0.18, pushIn),
      new Vector3(-0.022, 0, 0.025),
    );
    this.flashRemaining = FINISH_FLASH_SECONDS;
  }

  update(dt: number): void {
    const motionScale = this.reducedMotion() ? REDUCED_MOTION_SCALE : 1;
    this.camera.position.x += this.translation.x * motionScale;
    this.camera.position.y += this.translation.y * motionScale;
    this.camera.position.z += this.translation.z * motionScale;
    this.camera.rotation.x += this.rotation.x * motionScale;
    this.camera.rotation.y += this.rotation.y * motionScale;
    this.camera.rotation.z += this.rotation.z * motionScale;

    const translationDecay = Math.exp(-dt * 9);
    const rotationDecay = Math.exp(-dt * 12);
    this.translation.scaleInPlace(translationDecay);
    this.rotation.scaleInPlace(rotationDecay);

    this.updateFinishLights(dt);
  }

  private addImpulse(translation: Vector3, rotation: Vector3): void {
    this.translation.addInPlace(translation);
    this.rotation.addInPlace(rotation);
    clampVector(this.translation, MAX_TRANSLATION);
    clampVector(this.rotation, MAX_ROTATION);
  }

  private prepareFinishLightMaterials(scene: Scene): void {
    const clones = new Map<PBRMaterial, PBRMaterial>();
    for (const mesh of scene.meshes) {
      if (!mesh.name.startsWith("finish-light-")) continue;
      const source = mesh.material;
      if (!(source instanceof PBRMaterial)) continue;

      let flashMaterial = clones.get(source);
      if (!flashMaterial) {
        flashMaterial = source.clone(`${source.name}-effects`);
        clones.set(source, flashMaterial);
        this.flashMaterials.push({
          material: flashMaterial,
          baseColor: flashMaterial.emissiveColor.clone(),
          baseIntensity: flashMaterial.emissiveIntensity,
        });
      }
      mesh.material = flashMaterial;
    }
  }

  private updateFinishLights(dt: number): void {
    if (this.flashRemaining <= 0) return;

    this.flashRemaining = Math.max(0, this.flashRemaining - dt);
    if (this.flashRemaining === 0) {
      for (const entry of this.flashMaterials) {
        entry.material.emissiveColor.copyFrom(entry.baseColor);
        entry.material.emissiveIntensity = entry.baseIntensity;
      }
      return;
    }

    const elapsed = FINISH_FLASH_SECONDS - this.flashRemaining;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 10);
    for (const entry of this.flashMaterials) {
      const blend = pulse * 0.7;
      entry.material.emissiveColor.set(
        entry.baseColor.r + (1 - entry.baseColor.r) * blend,
        entry.baseColor.g + (1 - entry.baseColor.g) * blend,
        entry.baseColor.b + (1 - entry.baseColor.b) * blend,
      );
      entry.material.emissiveIntensity = entry.baseIntensity + pulse * 6;
    }
  }
}
