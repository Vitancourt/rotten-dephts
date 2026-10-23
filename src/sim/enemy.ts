// Undead enemy AI. Pure logic: no Three.js or DOM imports.
import { pushOutCircle, type Solids } from './movement';
import { findPath, lineClear, type NavGrid } from './nav';
import type { ProjectileKind } from './projectile';

export type EnemyKind = 'skeleton' | 'zombie' | 'archer' | 'mage';
export type EnemyState = 'dormant' | 'rising' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  reach: number; // attack range between bodies' centres
  trigger: number; // distance at which an idle enemy wakes (skeletons stand watch; zombies lie still)
  riseTime: number;
  /** Ranged enemies only: how far they shoot from, the distance they back off to, and what they throw. */
  range?: number;
  keepAway?: number;
  projectile?: ProjectileKind;
  windup: number;
  recover: number;
  staggerTime: number;
  superArmor: boolean; // not staggered while winding up
  xp: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  skeleton: {
    hp: 36, speed: 2.7, radius: 0.35, damage: 8, reach: 1.45, trigger: 6.5, riseTime: 0.55,
    windup: 0.6, recover: 0.9, staggerTime: 0.35, superArmor: false, xp: 10,
  },
  archer: {
    hp: 26, speed: 2.3, radius: 0.33, damage: 9, reach: 0, trigger: 11, riseTime: 0.55, range: 16, keepAway: 5, projectile: 'arrow',
    windup: 1.0, recover: 1.5, staggerTime: 0.35, superArmor: false, xp: 14,
  },
  mage: {
    hp: 22, speed: 2.1, radius: 0.33, damage: 15, reach: 0, trigger: 10, riseTime: 0.55, range: 14, keepAway: 6, projectile: 'fireball',
    windup: 1.3, recover: 2.0, staggerTime: 0.4, superArmor: false, xp: 20,
  },
  zombie: {
    hp: 80, speed: 1.35, radius: 0.42, damage: 20, reach: 1.55, trigger: 3.6, riseTime: 2.3,
    windup: 0.95, recover: 1.2, staggerTime: 0.3, superArmor: true, xp: 18,
  },
};

// Pathfinding is the costliest thing enemies do, so only a few searches run per tick;
// the rest simply wait one more tick for their turn.
const PATHS_PER_TICK = 3;
let pathBudget = PATHS_PER_TICK;
export const beginEnemyTick = (): void => { pathBudget = PATHS_PER_TICK; };

export interface Enemy {
  kind: EnemyKind;
  spawnX: number;
  spawnZ: number;
  x: number;
  z: number;
  yaw: number; // 0 faces -Z, same as the player
  hp: number;
  state: EnemyState;
  stateTime: number;
  radius: number;
  speedMul: number;
  flash: number; // hit-flash seconds left
  kx: number; // knockback velocity
  kz: number;
  path: { x: number; z: number }[];
  repath: number;
  walkPhase: number; // advances while moving, drives leg swing
  moving: boolean;
  hpMul: number; // depth scaling
  dmgMul: number;
  maxHp: number;
  /** Index into the floor's spawn list, so kills can be remembered between visits. */
  spawnIndex?: number;
}

export type EnemyEvent = { type: 'rise' } | { type: 'windup' } | { type: 'shoot'; x: number; z: number; tx: number; tz: number; damage: number; proj: ProjectileKind } | { type: 'hit'; damage: number; fromX: number; fromZ: number };

export const hpScale = (depth: number): number => 1 + 0.1 * (depth - 1);
export const dmgScale = (depth: number): number => 1 + 0.05 * (depth - 1);

export function createEnemy(kind: EnemyKind, x: number, z: number, depth = 1): Enemy {
  const e = {
    kind, spawnX: x, spawnZ: z, x, z, yaw: 0, hp: 0, state: 'dormant' as EnemyState, stateTime: 0,
    radius: ENEMY_DEFS[kind].radius, speedMul: 1, flash: 0, kx: 0, kz: 0, path: [], repath: 0, walkPhase: 0,
    moving: false, hpMul: hpScale(depth), dmgMul: dmgScale(depth), maxHp: 0,
  };
  resetEnemy(e);
  return e;
}

export function resetEnemy(e: Enemy): void {
  const d = ENEMY_DEFS[e.kind];
  e.x = e.spawnX;
  e.z = e.spawnZ;
  e.maxHp = Math.round(d.hp * e.hpMul);
  e.hp = e.maxHp;
  e.state = 'dormant';
  e.stateTime = 0;
  e.flash = 0;
  e.kx = e.kz = 0;
  e.path = [];
  e.repath = 0;
  e.speedMul = 0.9 + Math.random() * 0.2;
  e.yaw = Math.random() * Math.PI * 2;
  e.moving = false;
}

function setState(e: Enemy, s: EnemyState): void {
  e.state = s;
  e.stateTime = 0;
}

/** Targets in combat.ts only check hp/position; enemies can be hit once awake and alive. */
export function isHittable(e: Enemy): boolean {
  return e.state !== 'dormant' && e.state !== 'dead';
}

/** Applies player damage. Returns true if this killed the enemy. */
export function damageEnemy(e: Enemy, amount: number, fromX: number, fromZ: number): boolean {
  if (e.state === 'dormant' || e.state === 'dead') return false;
  const d = ENEMY_DEFS[e.kind];
  e.hp -= amount;
  e.flash = 0.2;
  const dx = e.x - fromX, dz = e.z - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  e.kx = (dx / len) * 3.2;
  e.kz = (dz / len) * 3.2;
  if (e.hp <= 0) {
    setState(e, 'dead');
    return true;
  }
  if (e.state !== 'rising' && !(d.superArmor && e.state === 'windup')) setState(e, 'stagger');
  return false;
}

function faceToward(e: Enemy, tx: number, tz: number, dt: number, rate: number): void {
  const want = Math.atan2(-(tx - e.x), -(tz - e.z));
  let diff = want - e.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const step = rate * dt;
  e.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
}

function moveToward(e: Enemy, tx: number, tz: number, speed: number, dt: number, solids: Solids): void {
  const dx = tx - e.x, dz = tz - e.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  e.x += (dx / len) * speed * dt;
  e.z += (dz / len) * speed * dt;
  pushOutCircle(e, e.radius, solids.near(e.x, e.z));
}

export function stepEnemy(
  e: Enemy,
  px: number,
  pz: number,
  playerAlive: boolean,
  dt: number,
  nav: NavGrid,
  solids: Solids,
): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  const d = ENEMY_DEFS[e.kind];
  e.stateTime += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.moving = false;

  // Knockback decays and respects walls.
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) {
    e.x += e.kx * dt;
    e.z += e.kz * dt;
    pushOutCircle(e, e.radius, solids.near(e.x, e.z));
    const decay = Math.exp(-9 * dt);
    e.kx *= decay;
    e.kz *= decay;
  }

  const dist = Math.hypot(px - e.x, pz - e.z);

  switch (e.state) {
    case 'dormant':
      if (playerAlive && dist < d.trigger && (dist < 2.2 || lineClear(nav, e.x, e.z, px, pz))) {
        setState(e, 'rising');
        events.push({ type: 'rise' });
      }
      break;
    case 'rising':
      // Turn towards the player while getting up (a lying corpse waits until it is half upright).
      if (playerAlive && (e.kind === 'skeleton' || e.stateTime > d.riseTime * 0.45)) faceToward(e, px, pz, dt, e.kind === 'skeleton' ? 6 : 3);
      if (e.stateTime >= d.riseTime) setState(e, 'chase');
      break;
    case 'stagger':
      if (e.stateTime >= d.staggerTime) setState(e, 'chase');
      break;
    case 'chase': {
      if (!playerAlive) break;
      faceToward(e, px, pz, dt, 6);
      if (d.range !== undefined && lineClear(nav, e.x, e.z, px, pz) && dist <= d.range) {
        // In range with a clear shot: back away if crowded, otherwise draw and loose.
        if (dist < (d.keepAway ?? 5) && e.stateTime < 1.2) {
          moveToward(e, e.x + (e.x - px), e.z + (e.z - pz), d.speed * e.speedMul * 0.9, dt, solids);
          e.moving = true;
          e.walkPhase += dt * d.speed * e.speedMul * 3.2;
        } else if (e.stateTime > 0.35) {
          setState(e, 'windup');
          events.push({ type: 'windup' });
        }
        break;
      }
      if (dist <= d.reach) {
        setState(e, 'windup');
        events.push({ type: 'windup' });
        break;
      }
      let tx = px, tz = pz;
      if (!lineClear(nav, e.x, e.z, px, pz)) {
        e.repath -= dt;
        if ((e.repath <= 0 || e.path.length === 0) && pathBudget > 0) {
          pathBudget--;
          e.path = findPath(nav, e.x, e.z, px, pz);
          e.repath = 0.4;
        }
        // Drop waypoints we've reached.
        while (e.path.length && Math.hypot(e.path[0].x - e.x, e.path[0].z - e.z) < 0.35) e.path.shift();
        if (e.path.length) {
          tx = e.path[0].x;
          tz = e.path[0].z;
          faceToward(e, tx, tz, dt, 6);
        }
      } else {
        e.path = [];
      }
      moveToward(e, tx, tz, d.speed * e.speedMul, dt, solids);
      e.moving = true;
      e.walkPhase += dt * d.speed * e.speedMul * 3.2;
      break;
    }
    case 'windup':
      faceToward(e, px, pz, dt, d.range !== undefined ? 3.5 : 2.5);
      if (e.stateTime >= d.windup) {
        if (d.range !== undefined) {
          if (playerAlive) events.push({ type: 'shoot', x: e.x, z: e.z, tx: px, tz: pz, damage: Math.round(d.damage * e.dmgMul), proj: d.projectile ?? 'arrow' });
        } else if (playerAlive && dist <= d.reach + 0.35) events.push({ type: 'hit', damage: Math.round(d.damage * e.dmgMul), fromX: e.x, fromZ: e.z });
        setState(e, 'recover');
      }
      break;
    case 'recover':
      if (e.stateTime >= d.recover) setState(e, 'chase');
      break;
    case 'dead':
      break;
  }
  return events;
}

/** Keeps awake enemies from stacking on each other. */
export function separateEnemies(list: Enemy[]): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.state === 'dormant' || a.state === 'dead' || b.state === 'dormant' || b.state === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push;
      b.x += (dx / d) * push; b.z += (dz / d) * push;
    }
  }
}

/** Wakes an enemy straight into the rising animation (used for summons). */
export function forceRise(e: Enemy): void {
  setState(e, 'rising');
}
