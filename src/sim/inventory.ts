// Backpack, equipment and currency. Pure logic.
import type { Rng } from './rng';
import { SLOTS, starterTorch, type Item, type Slot } from './items';
import type { Equipped } from './stats';

export const BACKPACK_CAP = 24;

/** What a quick slot (Q / E) points at. */
export type QuickRef = { type: 'flask' } | { type: 'item'; id: string };

export interface Inventory {
  gold: number;
  xp: number;
  backpack: Item[];
  equipped: Equipped;
  /** Health flasks carried. */
  flasks: number;
  /** Two hotkey slots, bound to Q and E. */
  quick: (QuickRef | null)[];
}

export const MAX_FLASKS = 9;
/** Flasks you always wake up with (so a death never leaves you without one). */
export const STARTER_FLASKS = 1;
/** Fraction of max health a flask restores. */
export const FLASK_HEAL = 0.3;

export function emptyEquipped(): Equipped {
  return { weapon: null, offhand: null, head: null, chest: null, legs: null, accessory: null };
}

export function createInventory(r: Rng): Inventory {
  const eq = emptyEquipped();
  eq.weapon = starterTorch(r);
  return { gold: 0, xp: 0, backpack: [], equipped: eq, flasks: STARTER_FLASKS, quick: [{ type: 'flask' }, null] };
}

export function addToBackpack(inv: Inventory, item: Item): boolean {
  if (inv.backpack.length >= BACKPACK_CAP) return false;
  inv.backpack.push(item);
  return true;
}

export function removeFromBackpack(inv: Inventory, id: string): Item | null {
  const i = inv.backpack.findIndex((x) => x.id === id);
  return i < 0 ? null : inv.backpack.splice(i, 1)[0];
}

/** Equips a backpack item; whatever was in the slot goes back to the backpack. */
export function equip(inv: Inventory, id: string): boolean {
  const item = removeFromBackpack(inv, id);
  if (!item) return false;
  const old = inv.equipped[item.slot];
  inv.equipped[item.slot] = item;
  if (old) inv.backpack.push(old); // always fits: we just freed a slot
  return true;
}

export function unequip(inv: Inventory, slot: Slot): boolean {
  const item = inv.equipped[slot];
  if (!item || inv.backpack.length >= BACKPACK_CAP) return false;
  inv.equipped[slot] = null;
  inv.backpack.push(item);
  return true;
}

export function allItems(inv: Inventory): Item[] {
  return [...SLOTS.map((s) => inv.equipped[s]).filter((x): x is Item => !!x), ...inv.backpack];
}

export function findItem(inv: Inventory, id: string): Item | null {
  return allItems(inv).find((i) => i.id === id) ?? null;
}

/** Puts a ref in a quick slot. The same ref never sits in both slots. */
export function assignQuick(inv: Inventory, slot: number, ref: QuickRef): void {
  const same = (a: QuickRef | null) => !!a && a.type === ref.type && (a.type === 'flask' || (ref.type === 'item' && a.id === ref.id));
  inv.quick = inv.quick.map((q, i) => (i !== slot && same(q) ? null : q));
  inv.quick[slot] = ref;
}

export function clearQuick(inv: Inventory, slot: number): void {
  inv.quick[slot] = null;
}

export type QuickResult =
  | { kind: 'empty' }
  | { kind: 'missing' } // the slot points at gear you don't currently have (e.g. it is in a marker)
  | { kind: 'no-flasks' }
  | { kind: 'full-health' }
  | { kind: 'already-equipped'; item: Item }
  | { kind: 'drank'; heal: number }
  | { kind: 'equipped'; item: Item };

/** Triggers a quick slot. A flask is only spent if it would actually heal. */
export function useQuick(inv: Inventory, slot: number, healthFull: boolean): QuickResult {
  const q = inv.quick[slot];
  if (!q) return { kind: 'empty' };
  if (q.type === 'flask') {
    if (inv.flasks <= 0) return { kind: 'no-flasks' };
    if (healthFull) return { kind: 'full-health' };
    inv.flasks--;
    return { kind: 'drank', heal: FLASK_HEAL };
  }
  const item = findItem(inv, q.id);
  if (!item) return { kind: 'missing' };
  if (inv.equipped[item.slot]?.id === item.id) return { kind: 'already-equipped', item };
  return equip(inv, item.id) ? { kind: 'equipped', item } : { kind: 'missing' };
}
