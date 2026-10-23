// Pure player movement + collision. No Three.js or DOM imports (see AGENTS.md).

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** Anything that can say which wall rects are near a point (a flat list, or a tile grid). */
export interface Solids {
  near(x: number, z: number): Rect[];
}

export const rectSolids = (rects: Rect[]): Solids => ({ near: () => rects });

/** Base solids plus a few always-included extras (e.g. a cage). */
export function withExtras(base: Solids, extras: Rect[]): Solids {
  return { near: (x, z) => (extras.length ? [...base.near(x, z), ...extras] : base.near(x, z)) };
}

export interface PlayerState {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  sprint: boolean;
  speedMul?: number;
}

export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 3.2;
export const SPRINT_SPEED = 5.4;

export function stepPlayer(p: PlayerState, input: MoveInput, dt: number, solids: Solids): void {
  let f = input.forward;
  let s = input.strafe;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }

  const speed = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * (input.speedMul ?? 1);
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // yaw 0 faces -Z; forward = (-sin, -cos), right = (cos, -sin)
  const dx = (-sin * f + cos * s) * speed * dt;
  const dz = (-cos * f - sin * s) * speed * dt;

  // Axis-separated moves so the player slides along walls.
  p.x += dx;
  pushOutCircle(p, PLAYER_RADIUS, solids.near(p.x, p.z));
  p.z += dz;
  pushOutCircle(p, PLAYER_RADIUS, solids.near(p.x, p.z));
}

/** Pushes a circle at (p.x, p.z) out of any overlapping rect. */
export function pushOutCircle(p: { x: number; z: number }, radius: number, walls: Rect[]): void {
  for (const w of walls) {
    const cx = Math.max(w.minX, Math.min(p.x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
    const ox = p.x - cx;
    const oz = p.z - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      p.x += (ox / d) * push;
      p.z += (oz / d) * push;
    } else {
      // Centre inside the rect: push out along the shallowest axis.
      const left = p.x - w.minX, right = w.maxX - p.x;
      const up = p.z - w.minZ, down = w.maxZ - p.z;
      const m = Math.min(left, right, up, down);
      if (m === left) p.x = w.minX - radius;
      else if (m === right) p.x = w.maxX + radius;
      else if (m === up) p.z = w.minZ - radius;
      else p.z = w.maxZ + radius;
    }
  }
}
