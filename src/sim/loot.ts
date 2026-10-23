// Drop tables and world pickups. Pure logic.
import { genItem, type Item, type Rarity } from './items';
import { randInt, type Rng } from './rng';
import type { EnemyKind } from './enemy';
import { FLASK_HEAL } from './inventory';

export const HEAL_FRACTION = FLASK_HEAL;

export interface Drop {
  id: number;
  x: number;
  z: number;
  gold?: number;
  item?: Item;
  /** Fraction of max health restored on pickup (a health flask). */
  heal?: number;
  /** Index into the floor's loot spots, so picked-up spots stay empty. */
  spot?: number;
}

const GOLD: Record<EnemyKind, [number, number]> = { skeleton: [3, 8], archer: [4, 10], mage: [5, 12], zombie: [6, 14] };
const HEAL_CHANCE: Record<EnemyKind, number> = { skeleton: 0.14, archer: 0.18, mage: 0.22, zombie: 0.25 };
const ITEM_CHANCE: Record<EnemyKind, number> = { skeleton: 0.3, archer: 0.38, mage: 0.45, zombie: 0.5 };

export interface Loot { gold: number; items: Item[]; heal?: boolean }

export function rollEnemyDrops(r: Rng, kind: EnemyKind, depth: number): Loot {
  const [lo, hi] = GOLD[kind];
  const gold = Math.round(randInt(r, lo, hi) * (1 + 0.25 * (depth - 1)));
  const items = r() < ITEM_CHANCE[kind] ? [genItem(r, depth)] : [];
  return { gold, items, heal: r() < HEAL_CHANCE[kind] };
}

export function rollBossDrops(r: Rng, depth: number): Loot {
  const items = [genItem(r, depth, { minRarity: 'rare' }), genItem(r, depth, { minRarity: 'uncommon' })];
  return { gold: Math.round(randInt(r, 60, 100) * (1 + 0.3 * (depth - 1))), items };
}

let nextDropId = 1;
export const newDropId = (): number => nextDropId++;

/** Scatters loot around a point as world pickups. */
export function scatter(r: Rng, x: number, z: number, loot: Loot): Drop[] {
  const out: Drop[] = [];
  const spot = () => ({ x: x + (r() - 0.5) * 1.4, z: z + (r() - 0.5) * 1.4 });
  if (loot.gold > 0) out.push({ id: newDropId(), ...spot(), gold: loot.gold });
  if (loot.heal) out.push({ id: newDropId(), ...spot(), heal: HEAL_FRACTION });
  for (const item of loot.items) out.push({ id: newDropId(), ...spot(), item });
  return out;
}

export type { Rarity };
