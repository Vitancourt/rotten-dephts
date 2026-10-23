// Pure melee combat rules. No Three.js or DOM imports (see AGENTS.md).

export interface Weapon {
  damage: number;
  reach: number; // metres from the player's centre
  arc: number; // total arc in radians
  windup: number; // seconds
  strike: number;
  recover: number;
  staminaCost: number;
}

export type SwingPhase = 'idle' | 'windup' | 'strike' | 'recover';

export interface CombatState {
  stamina: number;
  maxStamina: number;
  phase: SwingPhase;
  phaseTime: number;
  sinceStaminaUse: number;
  regen: number;
  /** 0..1: how far the guard is raised. */
  guard: number;
  /** Seconds left that the guard is broken (can neither block nor swing). */
  guardBroken: number;
}

export interface Target {
  x: number;
  z: number;
  radius: number;
  hp: number;
}

export const STAMINA_REGEN = 28; // default, per second
export const STAMINA_DELAY = 0.7; // seconds before regen starts

export function createCombat(): CombatState {
  return { stamina: 100, maxStamina: 100, phase: 'idle', phaseTime: 0, sinceStaminaUse: 99, regen: STAMINA_REGEN, guard: 0, guardBroken: 0 };
}

/** 0..1 progress through the current phase. */
export function phaseProgress(c: CombatState, w: Weapon): number {
  const d = c.phase === 'windup' ? w.windup : c.phase === 'strike' ? w.strike : c.phase === 'recover' ? w.recover : 1;
  return Math.min(c.phaseTime / d, 1);
}

/**
 * Advances the swing. Returns the targets hit this step (only non-empty on the frame the strike begins).
 * yaw 0 faces -Z, matching sim/movement.ts.
 */
export function stepCombat(
  c: CombatState,
  wantsSwing: boolean,
  dt: number,
  px: number,
  pz: number,
  yaw: number,
  w: Weapon,
  targets: Target[],
): Target[] {
  const hits: Target[] = [];

  c.sinceStaminaUse += dt;
  if (c.phase === 'idle' && c.sinceStaminaUse > STAMINA_DELAY) {
    c.stamina = Math.min(c.maxStamina, c.stamina + c.regen * dt);
  }

  if (c.phase === 'idle') {
    if (wantsSwing && c.guard < 0.2 && c.guardBroken <= 0 && c.stamina >= w.staminaCost) {
      c.stamina -= w.staminaCost;
      c.sinceStaminaUse = 0;
      c.phase = 'windup';
      c.phaseTime = 0;
    }
    return hits;
  }

  c.phaseTime += dt;
  if (c.phase === 'windup' && c.phaseTime >= w.windup) {
    c.phase = 'strike';
    c.phaseTime = 0;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (const t of targets) {
      if (t.hp <= 0) continue;
      const dx = t.x - px;
      const dz = t.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > w.reach + t.radius) continue;
      if (dist > 1e-6) {
        const cos = (dx * fx + dz * fz) / dist;
        // Widen the cone for close targets so grazing a body still counts.
        const slack = Math.atan2(t.radius, dist);
        if (Math.acos(Math.max(-1, Math.min(1, cos))) > w.arc / 2 + slack) continue;
      }
      hits.push(t);
    }
  } else if (c.phase === 'strike' && c.phaseTime >= w.strike) {
    c.phase = 'recover';
    c.phaseTime = 0;
  } else if (c.phase === 'recover' && c.phaseTime >= w.recover) {
    c.phase = 'idle';
    c.phaseTime = 0;
  }
  return hits;
}

// ---------------------------------------------------------------- guarding

export const GUARD_RAISE = 8; // per second: the guard is up in ~0.125s
export const GUARD_LOWER = 10;
export const GUARD_UP_AT = 0.6; // guard value at which hits are actually blocked
export const BLOCK_STAMINA = 0.5; // stamina spent per point of incoming damage
export const GUARD_BREAK_TIME = 1.0;
export const GUARD_ARC = 1.45; // half-angle (radians) in front of you that the guard covers

/** Raises or lowers the guard. You can only start guarding between swings. */
export function stepGuard(c: CombatState, wantsGuard: boolean, dt: number): void {
  c.guardBroken = Math.max(0, c.guardBroken - dt);
  const can = wantsGuard && c.guardBroken <= 0 && c.phase === 'idle';
  c.guard = can ? Math.min(1, c.guard + GUARD_RAISE * dt) : Math.max(0, c.guard - GUARD_LOWER * dt);
  if (c.guard > 0.2) c.sinceStaminaUse = 0; // no stamina regeneration behind a raised guard
}

export const isGuarding = (c: CombatState): boolean => c.guard >= GUARD_UP_AT;

/** Is a point in the arc your guard covers (in front of you)? yaw 0 faces -Z. */
export function inGuardArc(px: number, pz: number, yaw: number, ax: number, az: number): boolean {
  const dx = ax - px, dz = az - pz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const cos = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
  return Math.acos(Math.max(-1, Math.min(1, cos))) <= GUARD_ARC;
}

export interface BlockResult {
  /** Damage left after the guard (before armour). */
  damage: number;
  blocked: boolean;
  broken: boolean;
}

/**
 * Applies the raised guard to an incoming frontal hit. Blocking costs stamina in proportion to the hit;
 * if you can't pay, the guard breaks and the full blow lands.
 */
export function blockIncoming(c: CombatState, raw: number, blockPct: number): BlockResult {
  if (!isGuarding(c)) return { damage: raw, blocked: false, broken: false };
  const cost = raw * BLOCK_STAMINA;
  if (c.stamina >= cost) {
    c.stamina -= cost;
    c.sinceStaminaUse = 0;
    return { damage: raw * (1 - blockPct / 100), blocked: true, broken: false };
  }
  c.stamina = 0;
  c.guard = 0;
  c.guardBroken = GUARD_BREAK_TIME;
  c.sinceStaminaUse = 0;
  return { damage: raw, blocked: false, broken: true };
}
