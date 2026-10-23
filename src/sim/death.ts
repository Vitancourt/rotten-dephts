// Soulslike death: drop everything as a single recoverable marker. Pure logic.
import { allItems, emptyEquipped, STARTER_FLASKS, type Inventory } from './inventory';
import { SLOTS, starterTorch, type Item } from './items';
import type { Equipped } from './stats';
import type { Rng } from './rng';

export interface Marker {
  floor: number;
  x: number;
  z: number;
  gold: number;
  xp: number;
  flasks: number;
  equipped: Equipped;
  backpack: Item[];
}

export const isStarterTorch = (i: Item | null): boolean => !!i && i.base === 'Torch' && i.rarity === 'common';

/** Is there anything worth leaving a marker for? (The starter torch alone is not.) */
export function hasLoot(inv: Inventory): boolean {
  return inv.gold > 0 || inv.xp > 0 || inv.flasks > STARTER_FLASKS || allItems(inv).some((i) => !isStarterTorch(i));
}

/**
 * Strips the inventory (leaving a fresh starter torch) and returns the marker that now holds it.
 * Returns null, leaving the inventory untouched except for the torch reset, if there was nothing to drop;
 * the caller then keeps any older marker.
 */
export function dieAndDrop(inv: Inventory, floor: number, x: number, z: number, rng: Rng): Marker | null {
  const worth = hasLoot(inv);
  const marker: Marker = {
    floor, x, z, gold: inv.gold, xp: inv.xp, flasks: inv.flasks,
    equipped: { ...inv.equipped }, backpack: [...inv.backpack],
  };
  inv.gold = 0;
  inv.xp = 0;
  inv.flasks = STARTER_FLASKS;
  inv.backpack = [];
  inv.equipped = emptyEquipped();
  inv.equipped.weapon = starterTorch(rng);
  return worth ? marker : null;
}

/** Gives a marker's contents back. Equipped gear returns to its slot; displaced non-starter gear goes to the backpack. */
export function recoverMarker(inv: Inventory, m: Marker): void {
  inv.gold += m.gold;
  inv.xp += m.xp;
  inv.flasks += m.flasks;
  for (const s of SLOTS) {
    const back = m.equipped[s];
    if (!back) continue;
    const cur = inv.equipped[s];
    if (cur && !isStarterTorch(cur)) inv.backpack.push(cur);
    if (isStarterTorch(back) && isStarterTorch(cur)) continue; // two torches: keep the one in hand
    inv.equipped[s] = back;
  }
  // Marker items go in regardless of the usual capacity: nothing the player earned is destroyed on retrieval.
  inv.backpack.push(...m.backpack);
}

/** Single-marker rule: a new marker replaces the old one (whose loot is lost); no new marker keeps the old. */
export function nextMarker(old: Marker | null, created: Marker | null): Marker | null {
  return created ?? old;
}
