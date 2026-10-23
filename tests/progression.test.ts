import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng';
import { createInventory } from '../src/sim/inventory';
import { levelCost, tryLevelUp, xpReward } from '../src/sim/progression';
import { computeDerived, mitigate } from '../src/sim/stats';

test('level-ups cost more each time and need enough xp', () => {
  const inv = createInventory(mulberry32(1));
  const lv = { vit: 0, end: 0, str: 0 };
  assert.equal(levelCost(lv), 20);
  assert.equal(tryLevelUp(inv, lv, 'vit'), false);
  inv.xp = 100;
  assert.equal(tryLevelUp(inv, lv, 'vit'), true);
  assert.equal(inv.xp, 80);
  assert.equal(levelCost(lv), 32);
  assert.equal(tryLevelUp(inv, lv, 'str'), true);
  assert.equal(inv.xp, 48);
  assert.deepEqual(lv, { vit: 1, end: 0, str: 1 });
});

test('levels raise derived stats', () => {
  const inv = createInventory(mulberry32(2));
  const base = computeDerived(inv.equipped, { vit: 0, end: 0, str: 0 });
  const lvl = computeDerived(inv.equipped, { vit: 3, end: 2, str: 4 });
  assert.equal(lvl.maxHp, base.maxHp + 30);
  assert.equal(lvl.maxStamina, base.maxStamina + 12);
  assert.equal(lvl.weapon.damage, base.weapon.damage + 8);
});

test('armour reduces damage with diminishing returns but never to zero', () => {
  assert.equal(mitigate(20, 0), 20);
  assert.ok(mitigate(20, 20) < 20);
  assert.ok(mitigate(20, 200) >= 1);
  assert.ok(mitigate(20, 40) > mitigate(20, 80));
});

test('xp rewards scale with depth', () => {
  assert.equal(xpReward(10, 1), 10);
  assert.ok(xpReward(10, 5) > xpReward(10, 1));
});
