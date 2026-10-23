// Boss AI: telegraphed attacks, an enrage phase and guaranteed rewards. Pure logic.
import { PLAYER_RADIUS, pushOutCircle, type Solids } from './movement';
import { findPath, lineClear, type NavGrid } from './nav';

export type BossKind = 'colossus' | 'abomination' | 'warden';
export type AttackShape = 'cleave' | 'slam' | 'quake' | 'charge';
export type BossState = 'dormant' | 'intro' | 'chase' | 'windup' | 'strike' | 'recover' | 'dead';

export interface AttackDef {
  name: string;
  shape: AttackShape;
  windup: number;
  recover: number;
  minRange: number; // boss picks this attack when the player is within [min, max]
  maxRange: number;
  damage: number;
  /** cleave: arc in radians; slam/quake: blast radius. */
  param: number;
  /** cleave: reach; slam: distance of the blast centre ahead; charge: dash length. */
  reach: number;
  weight: number;
}

export interface BossDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  scale: number;
  xp: number;
  attacks: AttackDef[];
}

export const BOSS_DEFS: Record<BossKind, BossDef> = {
  colossus: {
    name: 'The Bone Colossus', hp: 360, speed: 2.2, radius: 0.95, scale: 2.2, xp: 120,
    attacks: [
      { name: 'Cleave', shape: 'cleave', windup: 0.9, recover: 0.9, minRange: 0, maxRange: 3.4, damage: 28, param: 2.4, reach: 3.3, weight: 3 },
      { name: 'Slam', shape: 'slam', windup: 1.25, recover: 1.1, minRange: 0, maxRange: 4.2, damage: 38, param: 2.2, reach: 2.6, weight: 2 },
      { name: 'Charge', shape: 'charge', windup: 0.85, recover: 1.3, minRange: 5, maxRange: 14, damage: 30, param: 0, reach: 9, weight: 3 },
    ],
  },
  abomination: {
    name: 'The Rot Abomination', hp: 520, speed: 1.7, radius: 1.05, scale: 2.4, xp: 160,
    attacks: [
      { name: 'Smash', shape: 'cleave', windup: 1.1, recover: 1.1, minRange: 0, maxRange: 3.8, damage: 44, param: 1.6, reach: 3.7, weight: 3 },
      { name: 'Quake', shape: 'quake', windup: 1.45, recover: 1.3, minRange: 0, maxRange: 5, damage: 32, param: 4.6, reach: 0, weight: 2 },
      { name: 'Lunge', shape: 'charge', windup: 0.95, recover: 1.4, minRange: 4, maxRange: 9, damage: 36, param: 0, reach: 5.5, weight: 2 },
    ],
  },
  warden: {
    name: 'The Grave Warden', hp: 440, speed: 2.9, radius: 0.9, scale: 2.1, xp: 200,
    attacks: [
      { name: 'Slash', shape: 'cleave', windup: 0.55, recover: 0.6, minRange: 0, maxRange: 3.2, damage: 24, param: 2.0, reach: 3.1, weight: 4 },
      { name: 'Slam', shape: 'slam', windup: 1.0, recover: 1.0, minRange: 0, maxRange: 4, damage: 34, param: 2.0, reach: 2.6, weight: 2 },
      { name: 'Rush', shape: 'charge', windup: 0.7, recover: 1.1, minRange: 4.5, maxRange: 13, damage: 28, param: 0, reach: 10, weight: 3 },
    ],
  },
};

const KINDS: BossKind[] = ['colossus', 'abomination', 'warden'];
export const bossTier = (depth: number): number => Math.max(0, depth / 2 - 1);
export const bossKindFor = (depth: number): BossKind => KINDS[(Math.max(1, depth / 2) - 1) % KINDS.length];

export interface Boss {
  kind: BossKind;
  def: BossDef;
  depth: number;
  x: number;
  z: number;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  dmgMul: number;
  state: BossState;
  stateTime: number;
  attack: AttackDef | null;
  cooldown: number;
  enraged: boolean;
  flash: number;
  hitDone: boolean;
  dashLeft: number;
  path: { x: number; z: number }[];
  repath: number;
  walkPhase: number;
  moving: boolean;
}

export type BossEvent =
  | { type: 'wake' }
  | { type: 'windup'; attack: AttackDef }
  | { type: 'hit'; damage: number; fromX: number; fromZ: number }
  | { type: 'summon' }
  | { type: 'die' };

export const INTRO_TIME = 1.8;
const STRIKE_TIME = 0.18;
const DASH_SPEED = 14;

export function createBoss(depth: number, x: number, z: number): Boss {
  const kind = bossKindFor(depth);
  const def = BOSS_DEFS[kind];
  const tier = bossTier(depth);
  const maxHp = Math.round(def.hp * (1 + 0.4 * tier));
  return {
    kind, def, depth, x, z, yaw: 0, radius: def.radius, hp: maxHp, maxHp, dmgMul: 1 + 0.12 * tier,
    state: 'dormant', stateTime: 0, attack: null, cooldown: 0, enraged: false, flash: 0, hitDone: false,
    dashLeft: 0, path: [], repath: 0, walkPhase: 0, moving: false,
  };
}

const set = (b: Boss, s: BossState) => { b.state = s; b.stateTime = 0; };

/** Can the player damage the boss right now? */
export const bossHittable = (b: Boss): boolean => b.state !== 'dormant' && b.state !== 'intro' && b.state !== 'dead';
export const bossActive = (b: Boss): boolean => b.state !== 'dormant' && b.state !== 'dead';

export function damageBoss(b: Boss, amount: number): BossEvent[] {
  if (!bossHittable(b)) return [];
  const ev: BossEvent[] = [];
  b.hp -= amount;
  b.flash = 0.15;
  if (b.hp <= 0) {
    b.hp = 0;
    set(b, 'dead');
    ev.push({ type: 'die' });
    return ev;
  }
  if (!b.enraged && b.hp <= b.maxHp * 0.5) {
    b.enraged = true;
    ev.push({ type: 'summon' });
  }
  return ev;
}

function faceToward(b: Boss, tx: number, tz: number, dt: number, rate: number): void {
  const want = Math.atan2(-(tx - b.x), -(tz - b.z));
  const diff = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
  const step = rate * dt;
  b.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
}

/** Does the attack's danger zone cover the player right now? */
export function attackCovers(b: Boss, a: AttackDef, px: number, pz: number): boolean {
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  switch (a.shape) {
    case 'cleave': {
      const dx = px - b.x, dz = pz - b.z;
      const d = Math.hypot(dx, dz);
      if (d > a.reach + PLAYER_RADIUS) return false;
      if (d < 1e-6) return true;
      return Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) <= a.param / 2;
    }
    case 'slam':
      return Math.hypot(px - (b.x + fx * a.reach), pz - (b.z + fz * a.reach)) <= a.param + PLAYER_RADIUS;
    case 'quake':
      return Math.hypot(px - b.x, pz - b.z) <= a.param + PLAYER_RADIUS;
    case 'charge':
      return Math.hypot(px - b.x, pz - b.z) <= b.radius + PLAYER_RADIUS + 0.2;
  }
}

function chooseAttack(b: Boss, dist: number, r: () => number): AttackDef | null {
  const ok = b.def.attacks.filter((a) => dist >= a.minRange && dist <= a.maxRange);
  if (!ok.length) return null;
  const total = ok.reduce((s, a) => s + a.weight, 0);
  let x = r() * total;
  for (const a of ok) {
    if ((x -= a.weight) < 0) return a;
  }
  return ok[ok.length - 1];
}

export function stepBoss(
  b: Boss, px: number, pz: number, playerAlive: boolean, playerInArena: boolean, dt: number,
  nav: NavGrid, solids: Solids, r: () => number = Math.random,
): BossEvent[] {
  const ev: BossEvent[] = [];
  b.stateTime += dt;
  b.flash = Math.max(0, b.flash - dt);
  b.cooldown -= dt;
  b.moving = false;
  const rage = b.enraged ? 1.25 : 1;
  const dist = Math.hypot(px - b.x, pz - b.z);

  switch (b.state) {
    case 'dormant':
      if (playerAlive && playerInArena) {
        set(b, 'intro');
        ev.push({ type: 'wake' });
      }
      break;
    case 'intro':
      faceToward(b, px, pz, dt, 4);
      if (b.stateTime >= INTRO_TIME) { set(b, 'chase'); b.cooldown = 0.6; }
      break;
    case 'chase': {
      if (!playerAlive) break;
      faceToward(b, px, pz, dt, 3.2);
      if (b.cooldown <= 0) {
        const a = chooseAttack(b, dist, r);
        if (a) {
          b.attack = a;
          b.hitDone = false;
          set(b, 'windup');
          ev.push({ type: 'windup', attack: a });
          break;
        }
      }
      if (dist > b.radius + PLAYER_RADIUS + 0.3) {
        let tx = px, tz = pz;
        if (!lineClear(nav, b.x, b.z, px, pz)) {
          b.repath -= dt;
          if (b.repath <= 0 || !b.path.length) { b.path = findPath(nav, b.x, b.z, px, pz); b.repath = 0.5; }
          while (b.path.length && Math.hypot(b.path[0].x - b.x, b.path[0].z - b.z) < 0.5) b.path.shift();
          if (b.path.length) { tx = b.path[0].x; tz = b.path[0].z; }
        } else b.path = [];
        const dx = tx - b.x, dz = tz - b.z, len = Math.hypot(dx, dz) || 1;
        b.x += (dx / len) * b.def.speed * rage * dt;
        b.z += (dz / len) * b.def.speed * rage * dt;
        pushOutCircle(b, b.radius, solids.near(b.x, b.z));
        b.moving = true;
        b.walkPhase += dt * b.def.speed * rage * 2.4;
      }
      break;
    }
    case 'windup': {
      const a = b.attack!;
      const total = a.windup / rage;
      if (b.stateTime < total * 0.7) faceToward(b, px, pz, dt, 2.4); // then the aim is locked: dodge!
      if (b.stateTime >= total) {
        set(b, 'strike');
        b.dashLeft = a.shape === 'charge' ? a.reach : 0;
        if (a.shape !== 'charge' && playerAlive && attackCovers(b, a, px, pz)) {
          b.hitDone = true;
          ev.push({ type: 'hit', damage: Math.round(a.damage * b.dmgMul), fromX: b.x, fromZ: b.z });
        }
      }
      break;
    }
    case 'strike': {
      const a = b.attack!;
      if (a.shape === 'charge') {
        const step = Math.min(b.dashLeft, DASH_SPEED * dt);
        const ox = b.x, oz = b.z;
        b.x += -Math.sin(b.yaw) * step;
        b.z += -Math.cos(b.yaw) * step;
        pushOutCircle(b, b.radius, solids.near(b.x, b.z));
        b.dashLeft -= step;
        if (!b.hitDone && playerAlive && attackCovers(b, a, px, pz)) {
          b.hitDone = true;
          ev.push({ type: 'hit', damage: Math.round(a.damage * b.dmgMul), fromX: b.x, fromZ: b.z });
        }
        if (b.dashLeft <= 1e-6 || Math.hypot(b.x - ox, b.z - oz) < step * 0.3) set(b, 'recover');
      } else if (b.stateTime >= STRIKE_TIME) {
        set(b, 'recover');
      }
      break;
    }
    case 'recover':
      if (b.stateTime >= b.attack!.recover / rage) { set(b, 'chase'); b.cooldown = 0.45 / rage; }
      break;
    case 'dead':
      break;
  }
  return ev;
}
