// Derives player stats from equipment and levels. Pure logic.
import type { Weapon } from './combat';
import type { Item, Slot } from './items';
import { MAX_BLOCK, SLOTS } from './items';

export interface Levels { vit: number; end: number; str: number }

export interface Derived {
  maxHp: number;
  maxStamina: number;
  staminaRegen: number;
  defense: number;
  speedMul: number;
  weapon: Weapon;
  /** Percent of a frontal hit absorbed while guarding. */
  blockPct: number;
  blockSource: 'shield' | 'torch';
}

/** With no shield you can still raise the torch: it absorbs a little. */
export const TORCH_BLOCK = 20;

export const FISTS: Weapon = {
  damage: 4, reach: 1.4, arc: 1.3, windup: 0.18, strike: 0.1, recover: 0.28, staminaCost: 10,
};

export type Equipped = Record<Slot, Item | null>;

export function computeDerived(eq: Equipped, lv: Levels): Derived {
  let damage = lv.str * 2;
  let defense = 0, hp = 0, stam = 0, speed = 0;
  for (const s of SLOTS) {
    const st = eq[s]?.stats;
    if (!st) continue;
    damage += st.damage ?? 0;
    defense += st.defense ?? 0;
    hp += st.maxHp ?? 0;
    stam += st.maxStamina ?? 0;
    speed += st.speed ?? 0;
  }
  const w = eq.weapon?.weapon;
  const shield = eq.offhand;
  return {
    blockPct: shield ? Math.min(MAX_BLOCK, shield.stats.block ?? 0) : TORCH_BLOCK,
    blockSource: shield ? 'shield' : 'torch',
    maxHp: 100 + lv.vit * 10 + hp,
    maxStamina: 100 + lv.end * 6 + stam,
    staminaRegen: 28 + lv.end * 1.5,
    defense,
    speedMul: Math.max(0.6, 1 + speed / 100),
    weapon: w ? { damage: Math.max(1, damage), ...w } : { ...FISTS, damage: Math.max(1, damage + FISTS.damage) },
  };
}

/** Damage after armour: diminishing returns, never zero. */
export function mitigate(amount: number, defense: number): number {
  return Math.max(1, Math.round((amount * 40) / (40 + defense)));
}
