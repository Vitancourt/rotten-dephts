// Item model and seeded generator. Pure logic.
import { pick, randInt, type Rng } from './rng';

export type Slot = 'weapon' | 'offhand' | 'head' | 'chest' | 'legs' | 'accessory';
export const SLOTS: Slot[] = ['weapon', 'offhand', 'head', 'chest', 'legs', 'accessory'];
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: 'Weapon', offhand: 'Off-hand', head: 'Head', chest: 'Chest', legs: 'Legs', accessory: 'Accessory',
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8b2a4', uncommon: '#5fbf5a', rare: '#4d8dff', epic: '#b45cff',
};
const RARITY_MUL: Record<Rarity, number> = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.7 };
const AFFIX_COUNT: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };

export interface Stats {
  damage: number;
  defense: number;
  maxHp: number;
  maxStamina: number;
  speed: number; // percent move speed
  block: number; // percent of damage a raised shield absorbs
}
export const STAT_LABEL: Record<keyof Stats, string> = {
  damage: 'Damage', defense: 'Defense', maxHp: 'Health', maxStamina: 'Stamina', speed: 'Move speed %', block: 'Block %',
};

export interface WeaponStats {
  reach: number;
  arc: number;
  windup: number;
  strike: number;
  recover: number;
  staminaCost: number;
}

export interface Item {
  id: string;
  slot: Slot;
  rarity: Rarity;
  base: string;
  name: string;
  stats: Partial<Stats>;
  weapon?: WeaponStats;
}

interface Base {
  name: string;
  slot: Slot;
  stats: Partial<Stats>;
  weapon?: WeaponStats;
  droppable?: boolean;
}

export const BASES: Base[] = [
  { name: 'Torch', slot: 'weapon', stats: { damage: 12 }, weapon: { reach: 1.9, arc: 1.5, windup: 0.2, strike: 0.12, recover: 0.32, staminaCost: 18 }, droppable: false },
  { name: 'Dagger', slot: 'weapon', stats: { damage: 9 }, weapon: { reach: 1.5, arc: 1.2, windup: 0.13, strike: 0.09, recover: 0.22, staminaCost: 10 } },
  { name: 'Shortsword', slot: 'weapon', stats: { damage: 15 }, weapon: { reach: 1.95, arc: 1.5, windup: 0.2, strike: 0.12, recover: 0.3, staminaCost: 16 } },
  { name: 'Mace', slot: 'weapon', stats: { damage: 22 }, weapon: { reach: 1.85, arc: 1.3, windup: 0.32, strike: 0.14, recover: 0.42, staminaCost: 24 } },
  { name: 'Battle Axe', slot: 'weapon', stats: { damage: 27 }, weapon: { reach: 2.0, arc: 1.7, windup: 0.4, strike: 0.15, recover: 0.52, staminaCost: 30 } },
  { name: 'Buckler', slot: 'offhand', stats: { block: 28, defense: 1 } },
  { name: 'Round Shield', slot: 'offhand', stats: { block: 38, defense: 2 } },
  { name: 'Kite Shield', slot: 'offhand', stats: { block: 48, defense: 3, speed: -2 } },
  { name: 'Tower Shield', slot: 'offhand', stats: { block: 58, defense: 4, speed: -5 } },
  { name: 'Rusted Helm', slot: 'head', stats: { defense: 3 } },
  { name: 'Leather Hood', slot: 'head', stats: { defense: 2, maxStamina: 5 } },
  { name: 'Tattered Tunic', slot: 'chest', stats: { defense: 4 } },
  { name: 'Chainmail', slot: 'chest', stats: { defense: 8, speed: -2 } },
  { name: 'Worn Greaves', slot: 'legs', stats: { defense: 3 } },
  { name: 'Leather Leggings', slot: 'legs', stats: { defense: 2, speed: 2 } },
  { name: 'Bone Ring', slot: 'accessory', stats: { maxHp: 10 } },
  { name: 'Iron Amulet', slot: 'accessory', stats: { maxStamina: 12 } },
  { name: 'Wolf Charm', slot: 'accessory', stats: { speed: 4 } },
];

const ADJECTIVES: Record<Rarity, string[]> = {
  common: ['Rusty', 'Worn', 'Crude', 'Old'],
  uncommon: ['Sturdy', 'Keen', 'Hardened', 'Sound'],
  rare: ['Grim', 'Forged', 'Savage', 'Runed'],
  epic: ['Cursed', 'Ancient', 'Dread', 'Hallowed'],
};

type Affix = { stat: keyof Stats; lo: number; hi: number };
const AFFIXES: Affix[] = [
  { stat: 'maxHp', lo: 6, hi: 14 },
  { stat: 'maxStamina', lo: 6, hi: 12 },
  { stat: 'damage', lo: 1, hi: 4 },
  { stat: 'defense', lo: 1, hi: 3 },
  { stat: 'speed', lo: 2, hi: 5 },
];

/** No guard ever absorbs more than this share of a hit. */
export const MAX_BLOCK = 75;

export const depthScale = (depth: number): number => 1 + 0.08 * (depth - 1);

function newId(r: Rng): string {
  return Math.floor(r() * 1e9).toString(36) + Math.floor(r() * 1e9).toString(36);
}

export function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

export function rollRarity(r: Rng, depth: number, min: Rarity = 'common'): Rarity {
  const w = [Math.max(20, 62 - 4 * depth), 28, 8 + 2 * depth, 1 + depth];
  const total = w.reduce((a, b) => a + b, 0);
  let x = r() * total;
  let idx = 0;
  for (; idx < w.length - 1; idx++) {
    if (x < w[idx]) break;
    x -= w[idx];
  }
  return RARITY_ORDER[Math.max(idx, rarityIndex(min))];
}

export interface GenOpts {
  slot?: Slot;
  minRarity?: Rarity;
}

export function genItem(r: Rng, depth: number, opts: GenOpts = {}): Item {
  const pool = BASES.filter((b) => b.droppable !== false && (!opts.slot || b.slot === opts.slot));
  const base = pick(r, pool);
  const rarity = rollRarity(r, depth, opts.minRarity);
  const mul = RARITY_MUL[rarity] * depthScale(depth);
  const stats: Partial<Stats> = {};
  for (const [k, v] of Object.entries(base.stats) as [keyof Stats, number][]) {
    // Block is a percentage with a hard ceiling, so rarity and depth only nudge it.
    const m = k === 'block' ? 1 + (mul - 1) * 0.4 : mul;
    stats[k] = Math.round(v * m * 10) / 10;
    if (k !== 'damage') stats[k] = Math.round(stats[k]!);
    if (k === 'block') stats[k] = Math.min(MAX_BLOCK, stats[k]!);
  }
  // Rolled affixes (distinct stats).
  const used = new Set<keyof Stats>();
  for (let i = 0; i < AFFIX_COUNT[rarity]; i++) {
    const a = pick(r, AFFIXES.filter((x) => !used.has(x.stat)));
    used.add(a.stat);
    stats[a.stat] = (stats[a.stat] ?? 0) + Math.round(randInt(r, a.lo, a.hi) * depthScale(depth));
  }
  return {
    id: newId(r),
    slot: base.slot,
    rarity,
    base: base.name,
    name: `${pick(r, ADJECTIVES[rarity])} ${base.name}`,
    stats,
    weapon: base.weapon ? { ...base.weapon } : undefined,
  };
}

/** The torch the player always starts (and restarts) with. */
export function starterTorch(r: Rng): Item {
  const b = BASES[0];
  return { id: newId(r), slot: 'weapon', rarity: 'common', base: b.name, name: 'Torch', stats: { ...b.stats }, weapon: { ...b.weapon! } };
}
