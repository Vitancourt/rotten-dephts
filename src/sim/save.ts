// Versioned save format. Pure logic: storage.ts does the actual localStorage I/O.
import type { Marker } from './death';
import type { Inventory } from './inventory';
import type { Levels } from './stats';
import type { ShopSales } from './shop';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  seed: number;
  floor: number;
  checkpoint: number; // floor whose cage you respawn at
  bosses: number[]; // floors whose boss is dead
  inv: Inventory;
  levels: Levels;
  marker: Marker | null;
  deaths: number;
  /** Loot spots already taken, by floor. */
  looted: Record<string, number[]>;
  /** Enemies already killed on each floor (by spawn index); cleared when you die. */
  killed: Record<string, number[]>;
  /** What has been bought from each floor's merchant. */
  shop: Record<string, ShopSales>;
}

export function newSave(seed: number, inv: Inventory): SaveData {
  return { version: SAVE_VERSION, seed, floor: 1, checkpoint: 1, bosses: [], inv, levels: { vit: 0, end: 0, str: 0 }, marker: null, deaths: 0, looted: {}, killed: {}, shop: {} };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Returns the parsed save or null if it is missing, corrupt or from an incompatible version. */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SaveData;
    if (d.version !== SAVE_VERSION) return null;
    if (!isNum(d.seed) || !isNum(d.floor) || !isNum(d.checkpoint) || !Array.isArray(d.bosses)) return null;
    if (!d.inv || !isNum(d.inv.gold) || !isNum(d.inv.xp) || !Array.isArray(d.inv.backpack) || !d.inv.equipped) return null;
    if (!d.levels || !isNum(d.levels.vit) || !isNum(d.levels.end) || !isNum(d.levels.str)) return null;
    if (d.marker && (!isNum(d.marker.x) || !isNum(d.marker.z) || !isNum(d.marker.floor))) return null;
    d.inv.equipped.offhand ??= null;
    if (d.marker) d.marker.equipped.offhand ??= null;
    d.inv.flasks = isNum(d.inv.flasks) ? d.inv.flasks : 0;
    d.inv.quick = Array.isArray(d.inv.quick) && d.inv.quick.length === 2 ? d.inv.quick : [null, null];
    if (d.marker) d.marker.flasks = isNum(d.marker.flasks) ? d.marker.flasks : 0;
    d.looted = d.looted && typeof d.looted === 'object' ? d.looted : {};
    d.killed = d.killed && typeof d.killed === 'object' ? d.killed : {};
    d.shop = d.shop && typeof d.shop === 'object' ? d.shop : {};
    return d;
  } catch {
    return null;
  }
}

export const serializeSave = (d: SaveData): string => JSON.stringify(d);
