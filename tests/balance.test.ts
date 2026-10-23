import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng';
import { createInventory } from '../src/sim/inventory';
import { computeDerived, mitigate } from '../src/sim/stats';
import { ENEMY_DEFS, dmgScale, hpScale } from '../src/sim/enemy';
import { BOSS_DEFS } from '../src/sim/boss';
import { genItem } from '../src/sim/items';
import { levelCost } from '../src/sim/progression';

// These tests pin down the fairness targets, not exact numbers: if a tweak breaks the
// feel of the first floors they fail loudly.

const starter = () => computeDerived(createInventory(mulberry32(1)).equipped, { vit: 0, end: 0, str: 0 });
const swingTime = (w: { windup: number; strike: number; recover: number }) => w.windup + w.strike + w.recover;

test('starter torch kills a skeleton in about 3 hits and a zombie in about 7', () => {
  const w = starter().weapon;
  const hitsFor = (hp: number) => Math.ceil(hp / w.damage);
  assert.ok(hitsFor(ENEMY_DEFS.skeleton.hp) <= 4);
  assert.ok(hitsFor(ENEMY_DEFS.zombie.hp) <= 8);
});

test('trading blows toe-to-toe is survivable at depth 1 but costs real health', () => {
  const w = starter().weapon;
  const ttk = (hp: number) => Math.ceil(hp / w.damage) * swingTime(w);
  for (const kind of ['skeleton', 'zombie'] as const) {
    const d = ENEMY_DEFS[kind];
    const cycle = d.windup + d.recover;
    const taken = Math.floor(ttk(d.hp) / cycle) * d.damage; // never dodging: the worst case
    assert.ok(taken < 100, `${kind}: standing still costs ${taken} hp, which would kill an undamaged player`);
    assert.ok(taken >= 0);
  }
});

test('enemies grow stronger with depth, gently enough to stay fair', () => {
  assert.equal(hpScale(1), 1);
  assert.ok(hpScale(5) > hpScale(1));
  assert.ok(hpScale(10) < 3, 'hp scaling stays under 3x by depth 10');
  assert.ok(dmgScale(10) < 2.5);
});

test('three bosses hits take most of a fresh health bar, but not all of it', () => {
  for (const def of Object.values(BOSS_DEFS)) {
    const worst = Math.max(...def.attacks.map((a) => a.damage));
    assert.ok(worst >= 24 && worst < 50, `${def.name}: heaviest attack ${worst}`);
    assert.ok(3 * worst >= 80, 'three heavy hits are deadly');
    assert.ok(mitigate(worst, 20) < worst, 'armour helps');
  }
});

test('good gear is a real upgrade without trivialising the game', () => {
  const r = mulberry32(99);
  const base = starter().weapon.damage;
  for (const depth of [1, 3, 6]) {
    let best = 0;
    for (let i = 0; i < 200; i++) {
      const it = genItem(r, depth, { slot: 'weapon' });
      best = Math.max(best, (it.stats.damage ?? 0));
    }
    assert.ok(best > base, `depth ${depth}: best weapon ${best} should beat the torch ${base}`);
    assert.ok(best < base * 6, `depth ${depth}: best weapon ${best} is absurd`);
  }
});

test('xp costs rise steadily', () => {
  const costs = [0, 1, 2, 5, 10].map((n) => levelCost({ vit: n, end: 0, str: 0 }));
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
});
