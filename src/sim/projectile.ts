// Arrows and fireballs shot by archers and mages. Flat 2D flight: they stop at walls and hurt the player on contact.
import type { Solids } from './movement';

export type ProjectileKind = 'arrow' | 'fireball';

export interface Arrow {
  kind: ProjectileKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  life: number; // seconds left
}

export const ARROW_SPEED = 8;
export const SPEED: Record<ProjectileKind, number> = { arrow: ARROW_SPEED, fireball: 5 };
/** Player body plus the missile's own size. */
export const HIT_RADIUS: Record<ProjectileKind, number> = { arrow: 0.45, fireball: 0.65 };
const LIFE: Record<ProjectileKind, number> = { arrow: 3, fireball: 3.5 };

/** A missile leaving (fromX, fromZ) aimed at where the target stands right now (so it can be dodged). */
export function createArrow(fromX: number, fromZ: number, tx: number, tz: number, damage: number, kind: ProjectileKind = 'arrow'): Arrow {
  const dx = tx - fromX, dz = tz - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  return { kind, x: fromX + ux * 0.5, z: fromZ + uz * 0.5, vx: ux * SPEED[kind], vz: uz * SPEED[kind], damage, life: LIFE[kind] };
}

export interface ArrowHit { damage: number; fromX: number; fromZ: number }

/**
 * Advances all missiles; removes the ones that hit a wall, the player, or run out of life.
 * Those that hit something are also pushed onto `ended` (for impact effects).
 */
export function stepArrows(list: Arrow[], dt: number, solids: Solids, px: number, pz: number, playerAlive: boolean, ended?: Arrow[]): ArrowHit[] {
  const hits: ArrowHit[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    let done = false;
    const steps = Math.max(1, Math.ceil((SPEED[a.kind] * dt) / 0.25)); // small steps so nothing tunnels through a wall
    for (let s = 0; s < steps && !done; s++) {
      a.x += (a.vx * dt) / steps;
      a.z += (a.vz * dt) / steps;
      if (solids.near(a.x, a.z).some((r) => a.x >= r.minX && a.x <= r.maxX && a.z >= r.minZ && a.z <= r.maxZ)) done = true;
      else if (playerAlive && Math.hypot(a.x - px, a.z - pz) < HIT_RADIUS[a.kind]) {
        hits.push({ damage: a.damage, fromX: a.x - a.vx * 0.05, fromZ: a.z - a.vz * 0.05 });
        done = true;
      }
    }
    a.life -= dt;
    if (done) ended?.push(a);
    if (done || a.life <= 0) list.splice(i, 1);
  }
  return hits;
}
