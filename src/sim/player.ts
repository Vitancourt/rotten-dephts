// Player vitals. Pure logic.

export interface Vitals {
  hp: number;
  maxHp: number;
  dead: boolean;
  invuln: number; // seconds of post-hit invulnerability left
  hurt: number; // 0..1 hit-flash strength, decays
}

export const HURT_INVULN = 0.5;

export function createVitals(): Vitals {
  return { hp: 100, maxHp: 100, dead: false, invuln: 0, hurt: 0 };
}

/** Returns true if the damage landed. */
export function damagePlayer(v: Vitals, amount: number, quiet = false): boolean {
  if (v.dead || v.invuln > 0) return false;
  v.hp = Math.max(0, v.hp - amount);
  v.invuln = HURT_INVULN;
  v.hurt = quiet ? 0.25 : 1; // a blocked hit barely flashes
  if (v.hp === 0) v.dead = true;
  return true;
}

export function stepVitals(v: Vitals, dt: number): void {
  v.invuln = Math.max(0, v.invuln - dt);
  v.hurt = Math.max(0, v.hurt - dt * 2.2);
}
