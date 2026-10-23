// XP spending. Pure logic.
import type { Inventory } from './inventory';
import type { Levels } from './stats';

export const totalLevels = (lv: Levels): number => lv.vit + lv.end + lv.str;

/** Each level costs more than the last, whichever stat it goes into. */
export const levelCost = (lv: Levels): number => 20 + 12 * totalLevels(lv);

/** Spends XP on a stat. Returns false if the player can't afford it. */
export function tryLevelUp(inv: Inventory, lv: Levels, stat: keyof Levels): boolean {
  const cost = levelCost(lv);
  if (inv.xp < cost) return false;
  inv.xp -= cost;
  lv[stat]++;
  return true;
}

/** XP an enemy is worth at a given depth. */
export const xpReward = (base: number, depth: number): number => Math.round(base * (1 + 0.15 * (depth - 1)));
