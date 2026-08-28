import {
  Color4,
  DynamicTexture,
  FreeCamera,
  ParticleSystem,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { CameraEffects } from "./cameraEffects";

type EffectTexture = "impact" | "splash" | "checkpoint" | "finish";

const textureCache = new WeakMap<
  Scene,
  Partial<Record<EffectTexture, DynamicTexture>>
>();
const splashSystemCache = new WeakMap<Scene, ParticleSystem>();

function getParticleTexture(
  scene: Scene,
  kind: EffectTexture,
): DynamicTexture {
  let sceneTextures = textureCache.get(scene);
  if (!sceneTextures) {
    sceneTextures = {};
    textureCache.set(scene, sceneTextures);
  }
  const cached = sceneTextures[kind];
  if (cached) return cached;

  const size = 64;
  const tex = new DynamicTexture(`effect-${kind}-texture`, size, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  if (kind === "finish") {
    ctx.fillStyle = "white";
    ctx.fillRect(18, 8, 28, 48);
  } else if (kind === "checkpoint") {
    ctx.fillStyle = "white";
    ctx.beginPath();
    for (let index = 0; index < 10; index++) {
      const radius = index % 2 === 0 ? 28 : 12;
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const x = 32 + Math.cos(angle) * radius;
      const y = 32 + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(
      kind === "impact" ? 0.35 : 0.58,
      "rgba(255,255,255,0.8)",
    );
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  tex.update();
  tex.hasAlpha = true;
  sceneTextures[kind] = tex;
  return tex;
}

function createSplashDrops(scene: Scene): ParticleSystem {
  const ps = new ParticleSystem("splash", 120, scene);
  ps.particleTexture = getParticleTexture(scene, "splash");
  ps.minEmitBox = new Vector3(-0.4, 0, -0.4);
  ps.maxEmitBox = new Vector3(0.4, 0.2, 0.4);
  ps.color1 = new Color4(0.85, 0.95, 1.0, 0.9);
  ps.color2 = new Color4(0.55, 0.8, 1.0, 0.8);
  ps.colorDead = new Color4(0.6, 0.85, 1.0, 0);
  ps.minSize = 0.15;
  ps.maxSize = 0.55;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.8;
  ps.emitRate = 600;
  ps.direction1 = new Vector3(-2.5, 5, -2.5);
  ps.direction2 = new Vector3(2.5, 8, 2.5);
  ps.gravity = new Vector3(0, -18, 0);
  ps.minEmitPower = 0.8;
  ps.maxEmitPower = 1.6;
  ps.updateSpeed = 0.016;
  ps.targetStopDuration = 0.25;
  return ps;
}

function getSplashDrops(scene: Scene): ParticleSystem {
  let system = splashSystemCache.get(scene);
  if (!system) {
    system = createSplashDrops(scene);
    splashSystemCache.set(scene, system);
  }
  return system;
}

function trigger(system: ParticleSystem, position: Vector3): void {
  system.stop();
  system.reset();
  system.emitter = position.clone();
  system.start();
}

/** Compatibility entry point backed by one reusable system per scene. */
export function splashAt(scene: Scene, position: Vector3): void {
  trigger(getSplashDrops(scene), position);
}

export class EffectsController {
  private cameraEffects: CameraEffects;
  private impactFlash: ParticleSystem;
  private splashDrops: ParticleSystem;
  private splashFoam: ParticleSystem;
  private checkpointBurst: ParticleSystem;
  private finishConfetti: ParticleSystem[];

  constructor(
    scene: Scene,
    camera: FreeCamera,
    reducedMotion: () => boolean,
  ) {
    this.cameraEffects = new CameraEffects(scene, camera, reducedMotion);
    this.impactFlash = this.createImpact(scene);
    this.splashDrops = getSplashDrops(scene);
    this.splashFoam = this.createSplashFoam(scene);
    this.checkpointBurst = this.createCheckpoint(scene);
    this.finishConfetti = this.createFinishConfetti(scene);
  }

  impact(position: Vector3): void {
    trigger(this.impactFlash, position);
    this.cameraEffects.impact(position);
  }

  splash(position: Vector3): void {
    trigger(this.splashDrops, position);
    trigger(this.splashFoam, position);
    this.cameraEffects.splash(position);
  }

  checkpoint(position: Vector3): void {
    trigger(this.checkpointBurst, position);
    this.cameraEffects.checkpoint(position);
  }

  finish(position: Vector3): void {
    for (const system of this.finishConfetti) trigger(system, position);
    this.cameraEffects.finish();
  }

  update(dt: number): void {
    this.cameraEffects.update(dt);
  }

  private createImpact(scene: Scene): ParticleSystem {
    const system = new ParticleSystem("impact-flash", 36, scene);
    system.particleTexture = getParticleTexture(scene, "impact");
    system.color1 = new Color4(1, 0.95, 0.35, 1);
    system.color2 = new Color4(1, 0.25, 0.08, 1);
    system.colorDead = new Color4(1, 0.1, 0.02, 0);
    system.minSize = 0.18;
    system.maxSize = 0.65;
    system.minLifeTime = 0.12;
    system.maxLifeTime = 0.28;
    system.emitRate = 220;
    system.direction1 = new Vector3(-4, -1, -4);
    system.direction2 = new Vector3(4, 4, 4);
    system.minEmitPower = 0.4;
    system.maxEmitPower = 1.1;
    system.targetStopDuration = 0.12;
    system.updateSpeed = 0.016;
    return system;
  }

  private createSplashFoam(scene: Scene): ParticleSystem {
    const system = new ParticleSystem("splash-foam-ring", 64, scene);
    system.particleTexture = getParticleTexture(scene, "splash");
    system.color1 = new Color4(1, 1, 1, 0.95);
    system.color2 = new Color4(0.65, 0.88, 1, 0.82);
    system.colorDead = new Color4(0.7, 0.9, 1, 0);
    system.minSize = 0.15;
    system.maxSize = 0.32;
    system.minLifeTime = 0.5;
    system.maxLifeTime = 0.85;
    system.emitRate = 320;
    system.createCylinderEmitter(0.4, 0.08, 1, 0.12);
    system.minEmitPower = 1.8;
    system.maxEmitPower = 3;
    system.gravity = new Vector3(0, -2.5, 0);
    system.targetStopDuration = 0.16;
    system.updateSpeed = 0.016;
    return system;
  }

  private createCheckpoint(scene: Scene): ParticleSystem {
    const system = new ParticleSystem("checkpoint-burst", 150, scene);
    system.particleTexture = getParticleTexture(scene, "checkpoint");
    system.color1 = new Color4(1, 0.82, 0.18, 1);
    system.color2 = new Color4(0.12, 0.72, 1, 1);
    system.colorDead = new Color4(0.3, 0.82, 1, 0);
    system.minSize = 0.12;
    system.maxSize = 0.38;
    system.minLifeTime = 0.45;
    system.maxLifeTime = 1.05;
    system.emitRate = 500;
    system.createCylinderEmitter(0.45, 0.2, 1, 0.35);
    system.minEmitPower = 2.2;
    system.maxEmitPower = 5;
    system.gravity = new Vector3(0, -7, 0);
    system.targetStopDuration = 0.24;
    system.updateSpeed = 0.016;
    return system;
  }

  private createFinishConfetti(scene: Scene): ParticleSystem[] {
    const colors = [
      new Color4(1, 0.12, 0.12, 1),
      new Color4(1, 0.82, 0.1, 1),
      new Color4(0.12, 0.55, 1, 1),
    ];
    return colors.map((color, index) => {
      const name =
        index === 0
          ? "finish-confetti"
          : `finish-confetti-${index === 1 ? "yellow" : "blue"}`;
      const system = new ParticleSystem(name, 90, scene);
      system.particleTexture = getParticleTexture(scene, "finish");
      system.color1 = color;
      system.color2 = color;
      system.colorDead = new Color4(color.r, color.g, color.b, 0);
      system.minSize = 0.1;
      system.maxSize = 0.28;
      system.minLifeTime = 1.1;
      system.maxLifeTime = 2.2;
      system.emitRate = 340;
      system.minEmitBox = new Vector3(-3.2, 0.2, -0.4);
      system.maxEmitBox = new Vector3(3.2, 1.2, 0.4);
      system.direction1 = new Vector3(-2.5, 5, -1.5);
      system.direction2 = new Vector3(2.5, 9, 1.5);
      system.gravity = new Vector3(0, -5.5, 0);
      system.minAngularSpeed = -8;
      system.maxAngularSpeed = 8;
      system.targetStopDuration = 0.55;
      system.updateSpeed = 0.016;
      return system;
    });
  }
}
