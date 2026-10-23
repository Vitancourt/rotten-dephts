import test from 'node:test';
import assert from 'node:assert/strict';
import { buyFlask, buyItem, flasksLeft, stockFor, type ShopSales } from '../src/sim/shop';
import { createInventory, BACKPACK_CAP, MAX_FLASKS } from '../src/sim/inventory';
import { rarityIndex } from '../src/sim/items';
import { hpScale, dmgScale } from '../src/sim/enemy';
import { depthScale } from '../src/sim/items';
import { generateFloor, TILE, toTile } from '../src/sim/floorgen';
import { mulberry32 } from '../src/sim/rng';

const fresh = () => ({ inv: createInventory(mulberry32(1)), sales: { flasks: 0, items: [] } as ShopSales });

test('the first merchant has a small, modest shelf; deeper ones stock more and better', () => {
  const first = stockFor(123, 2);
  assert.equal(first.flasks, 2);
  assert.equal(first.items.length, 2);
  assert.ok(first.items.every((e) => rarityIndex(e.item.rarity) <= 1), 'nothing above uncommon at the first merchant');
  const deep = stockFor(123, 8);
  assert.ok(deep.items.length > first.items.length);
  assert.ok(deep.flasks > first.flasks);
  assert.ok(deep.items.every((e) => rarityIndex(e.item.rarity) >= 2), 'deep merchants sell rare or better');
  assert.ok(deep.items.some((e) => e.price > first.items[0].price), 'and charge for it');
});

test('stock is the same every visit', () => {
  assert.deepEqual(stockFor(9, 5), stockFor(9, 5));
});

test('buying spends gold, hands over the goods and each item sells once', () => {
  const stock = stockFor(5, 3);
  const { inv, sales } = fresh();
  assert.equal(buyFlask(inv, stock, sales), 'gold');
  inv.gold = 1000;
  const flasks = inv.flasks;
  assert.equal(buyFlask(inv, stock, sales), 'ok');
  assert.equal(inv.flasks, flasks + 1);
  assert.equal(inv.gold, 1000 - stock.flaskPrice);
  const e = stock.items[0];
  assert.equal(buyItem(inv, stock, sales, e.id), 'ok');
  assert.ok(inv.backpack.some((i) => i.id === e.id));
  assert.equal(buyItem(inv, stock, sales, e.id), 'soldout');
  while (flasksLeft(stock, sales) > 0) { inv.flasks = 0; buyFlask(inv, stock, sales); }
  assert.equal(buyFlask(inv, stock, sales), 'soldout');
});

test('a full backpack or full flask belt refuses the sale without taking gold', () => {
  const stock = stockFor(5, 3);
  const { inv, sales } = fresh();
  inv.gold = 1000;
  inv.flasks = MAX_FLASKS;
  assert.equal(buyFlask(inv, stock, sales), 'full');
  while (inv.backpack.length < BACKPACK_CAP) inv.backpack.push({ ...stock.items[0].item, id: `x${inv.backpack.length}` });
  assert.equal(buyItem(inv, stock, sales, stock.items[1].id), 'full');
  assert.equal(inv.gold, 1000);
});

test('monsters gain 10% life and 5% damage per floor; loot 5% better', () => {
  assert.equal(hpScale(3), 1.2);
  assert.equal(dmgScale(3), 1.1);
  assert.ok(Math.abs(depthScale(3) - 1.1) < 1e-9);
});

test('every floor below the first has stairs up and a merchant beside them, clear of the cage', () => {
  for (let seed = 1; seed <= 60; seed++) {
    assert.equal(generateFloor(seed, 1).upStairs, null);
    for (const depth of [2, 3, 4, 7]) {
      const f = generateFloor(seed, depth);
      assert.ok(f.upStairs && f.merchant, `seed ${seed} depth ${depth}`);
      const u = f.upStairs!;
      assert.equal(f.tiles[u.ty * f.w + u.tx], 0, 'stairs sit in a wall');
      assert.equal(f.tiles[toTile(u.frontZ) * f.w + toTile(u.frontX)], 1, 'and open onto the room');
      const m = f.merchant!;
      assert.equal(f.tiles[toTile(m.z) * f.w + toTile(m.x)], 1);
      assert.ok(Math.hypot(m.x - f.start.x, m.z - f.start.z) >= 3.7, 'merchant stays out of the cage');
      assert.ok(Math.hypot(m.x - u.frontX, m.z - u.frontZ) >= 1.8, 'and off the stair landing');
      assert.ok(f.spawns.every((s) => Math.hypot(s.x - m.x, s.z - m.z) > TILE), 'no monsters on the merchant');
    }
  }
});
