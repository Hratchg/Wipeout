/** Shared movement and hazard-overlap helpers. */

export const FORWARD_DOUBLE_TAP_MS = 280;
export const PLAYER_HIT_RADIUS = 0.4;

/**
 * First up-tap waits to see if a second arrives. A second tap inside the
 * window is a leap; a lone tap becomes a one-tile step.
 */
export function classifyForwardTap(
  now: number,
  pendingAt: number | null,
  windowMs = FORWARD_DOUBLE_TAP_MS,
): "jump" | "pending" {
  if (pendingAt !== null && now - pendingAt <= windowMs) return "jump";
  return "pending";
}

/** Circle vs axis-aligned box in XZ. */
export function circleHitsAabb2D(
  px: number,
  pz: number,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const qx = Math.min(Math.max(px, minX), maxX);
  const qz = Math.min(Math.max(pz, minZ), maxZ);
  const dx = px - qx;
  const dz = pz - qz;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * Circle vs a box centered at (cx, cz), half-extents along local X/Z,
 * rotated by `angle` around Y (Babylon left-handed RotationY).
 */
export function circleHitsObb2D(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  angle: number,
): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return circleHitsAabb2D(lx, lz, radius, -halfX, halfX, -halfZ, halfZ);
}

/** True when the rotating sweeper arm overlaps the player in XZ. */
export function sweeperHitsPlayer(
  angle: number,
  armHalfWidth: number,
  armHalfDepth: number,
  hubZ: number,
  px: number,
  pz: number,
  radius: number,
): boolean {
  return circleHitsObb2D(
    px,
    pz,
    radius,
    0,
    hubZ,
    armHalfWidth,
    armHalfDepth,
    angle,
  );
}
