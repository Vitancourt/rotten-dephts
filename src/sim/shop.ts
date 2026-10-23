// The wandering merchant's stock and buying rules. Pure logic.
import { SLOTS, genItem, rarityIndex, type Item, type Rarity, type Slot } from './items';
import { MAX_FLASKS, addToBackpack, type Inventory } from './inventory';
import { hashSeed, mulberry32, shuffle } from './rng';

/** Merchants wait in the start room of every floor from this depth on. */
export const MERCHANT_FIRST_DEPTH = 2;
export const hasMerchant = (depth: number): boolean => depth >= MERCHANT_FIRST_DEPTH;

export interface ShopEntry { id: string; item: Item; price: number }
export interface Stock {
  flasks: number; // flasks on offer (before any bought)
  flaskPrice: number;
  items: ShopEntry[];
}
/** What has already been bought from one merchant. */
export interface ShopSales { flasks: number; items: string[] }

const BASE_PRICE: Record<Rarity, number> = { common: 35, uncommon: 80, rare: 170, epic: 380 };

export const flaskPrice = (depth: number): number => 25 + 3 * depth;
export const itemPrice = (rarity: Rarity, depth: number): number => Math.round(BASE_PRICE[rarity] * (1 + 0.12 * (depth - 1)));

/**
 * The merchant of a floor. The first one has a small shelf (2 flasks, 2 items, nothing above uncommon);
 * deeper ones stock more and better: higher minimum rarity, a guaranteed upgrade on the last item,
 * and loot that scales with depth like everything else.
 */
export function stockFor(runSeed: number, depth: number): Stock {
  const rank = depth - MERCHANT_FIRST_DEPTH; // 0 for the first merchant
  const flasks = Math.min(5, 2 + Math.floor(rank / 2));
  const count = Math.min(6, 2 + Math.floor(rank / 2));
  const minRarity: Rarity = depth >= 7 ? 'rare' : depth >= 4 ? 'uncommon' : 'common';
  const order: Slot[] = [...SLOTS];
  shuffle(mulberry32(hashSeed(runSeed, depth, 4242)), order);
  const items: ShopEntry[] = [];
  for (let i = 0; i < count; i++) {
    const r = mulberry32(hashSeed(runSeed, depth, 4243, i));
    const upgrade = rank > 0 && i === count - 1; // the showpiece
    let item = genItem(r, depth, { slot: order[i % order.length], minRarity: upgrade ? (depth >= 7 ? 'epic' : 'rare') : minRarity });
    // The first merchant never sells above uncommon.
    if (rank === 0 && rarityIndex(item.rarity) > 1) item = genItem(mulberry32(hashSeed(runSeed, depth, 4244, i)), 1, { slot: order[i % order.length] });
    items.push({ id: item.id, item, price: itemPrice(item.rarity, depth) });
  }
  return { flasks, flaskPrice: flaskPrice(depth), items };
}

export type BuyResult = 'ok' | 'gold' | 'full' | 'soldout';

export const flasksLeft = (stock: Stock, sales: ShopSales): number => stock.flasks - sales.flasks;

export function buyFlask(inv: Inventory, stock: Stock, sales: ShopSales): BuyResult {
  if (flasksLeft(stock, sales) <= 0) return 'soldout';
  if (inv.gold < stock.flaskPrice) return 'gold';
  if (inv.flasks >= MAX_FLASKS) return 'full';
  inv.gold -= stock.flaskPrice;
  inv.flasks++;
  sales.flasks++;
  return 'ok';
}

export function buyItem(inv: Inventory, stock: Stock, sales: ShopSales, id: string): BuyResult {
  const entry = stock.items.find((e) => e.id === id);
  if (!entry || sales.items.includes(id)) return 'soldout';
  if (inv.gold < entry.price) return 'gold';
  if (!addToBackpack(inv, entry.item)) return 'full';
  inv.gold -= entry.price;
  sales.items.push(id);
  return 'ok';
}
