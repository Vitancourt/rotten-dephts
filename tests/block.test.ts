import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng';
import { BLOCK_STAMINA, blockIncoming, createCombat, GUARD_BREAK_TIME, inGuardArc, isGuarding, stepCombat, stepGuard } from '../src/sim/combat';
import { BASES, genItem, MAX_BLOCK, SLOTS } from '../src/sim/items';
import { addToBackpack, createInventory, equip } from '../src/sim/inventory';
import { computeDerived, FISTS, TORCH_BLOCK } from '../src/sim/stats';
import { damagePlayer, createVitals } from '../src/sim/player';
import { newSave, parseSave, serializeSave } from '../src/sim/save';
import { dieAndDrop, recoverMarker } from '../src/sim/death';

const raised = () => { const c = createCombat(); for (let i = 0; i < 30; i++) stepGuard(c, true, 1 / 60); return c; };

test('the guard takes a moment to raise and drops quickly', () => {
  const c = createCombat();
  stepGuard(c, true, 1 / 60);
  assert.equal(isGuarding(c), false, 'not instant');
  for (let i = 0; i < 10; i++) stepGuard(c, true, 1 / 60);
  assert.equal(isGuarding(c), true);
  for (let i = 0; i < 12; i++) stepGuard(c, false, 1 / 60);
  assert.equal(isGuarding(c), false);
});

test('blocking absorbs the shield percentage and spends stamina', () => {
  const c = raised();
  const before = c.stamina;
  const r = blockIncoming(c, 40, 50);
  assert.deepEqual({ blocked: r.blocked, broken: r.broken, damage: r.damage }, { blocked: true, broken: false, damage: 20 });
  assert.equal(c.stamina, before - 40 * BLOCK_STAMINA);
});

test('with the guard down nothing is absorbed', () => {
  const c = createCombat();
  const r = blockIncoming(c, 40, 50);
  assert.equal(r.damage, 40);
  assert.equal(r.blocked, false);
});

test('running out of stamina breaks the guard: the full hit lands and you are stunned briefly', () => {
  const c = raised();
  c.stamina = 5;
  const r = blockIncoming(c, 40, 50);
  assert.deepEqual({ blocked: r.blocked, broken: r.broken, damage: r.damage }, { blocked: false, broken: true, damage: 40 });
  assert.equal(c.stamina, 0);
  assert.equal(c.guardBroken, GUARD_BREAK_TIME);
  for (let i = 0; i < 30; i++) stepGuard(c, true, 1 / 60);
  assert.equal(isGuarding(c), false, 'cannot re-raise while broken');
  for (let i = 0; i < 40; i++) stepGuard(c, true, 1 / 60);
  assert.equal(isGuarding(c), true, 'recovers after the stun');
});

test('you cannot swing while guarding, and cannot start a guard mid-swing', () => {
  const w = { ...FISTS, damage: 10 };
  const c = raised();
  stepCombat(c, true, 1 / 60, 0, 0, 0, w, []);
  assert.equal(c.phase, 'idle', 'guard up: swing refused');
  const d = createCombat();
  stepCombat(d, true, 1 / 60, 0, 0, 0, w, []);
  assert.equal(d.phase, 'windup');
  stepGuard(d, true, 1 / 60);
  assert.equal(d.guard, 0, 'mid-swing: the guard stays down');
});

test('stamina does not regenerate behind a raised guard', () => {
  const c = raised();
  c.stamina = 40;
  for (let i = 0; i < 120; i++) { stepGuard(c, true, 1 / 60); stepCombat(c, false, 1 / 60, 0, 0, 0, FISTS, []); }
  assert.equal(c.stamina, 40);
  for (let i = 0; i < 120; i++) { stepGuard(c, false, 1 / 60); stepCombat(c, false, 1 / 60, 0, 0, 0, FISTS, []); }
  assert.ok(c.stamina > 40, 'regenerates once the guard is down');
});

test('the guard only covers the front', () => {
  // yaw 0 faces -Z
  assert.equal(inGuardArc(0, 0, 0, 0, -3), true, 'ahead');
  assert.equal(inGuardArc(0, 0, 0, 2, -2), true, '45 degrees');
  assert.equal(inGuardArc(0, 0, 0, 3, 0), false, 'beside you');
  assert.equal(inGuardArc(0, 0, 0, 0, 3), false, 'behind you');
});

test('shields exist as off-hand gear; the torch blocks a little when no shield is held', () => {
  assert.ok(SLOTS.includes('offhand'));
  const shields = BASES.filter((b) => b.slot === 'offhand');
  assert.ok(shields.length >= 3 && shields.every((b) => (b.stats.block ?? 0) > 0));
  const inv = createInventory(mulberry32(1));
  const bare = computeDerived(inv.equipped, { vit: 0, end: 0, str: 0 });
  assert.equal(bare.blockPct, TORCH_BLOCK);
  assert.equal(bare.blockSource, 'torch');

  const r = mulberry32(4);
  let shield = genItem(r, 1, { slot: 'offhand' });
  addToBackpack(inv, shield);
  equip(inv, shield.id);
  const d = computeDerived(inv.equipped, { vit: 0, end: 0, str: 0 });
  assert.equal(d.blockSource, 'shield');
  assert.ok(d.blockPct > TORCH_BLOCK, `a shield (${d.blockPct}%) beats the torch (${TORCH_BLOCK}%)`);
  assert.ok(d.blockPct <= MAX_BLOCK);
});

test('shield block never exceeds the ceiling at any depth or rarity', () => {
  const r = mulberry32(77);
  for (let i = 0; i < 400; i++) {
    const s = genItem(r, 1 + (i % 12), { slot: 'offhand', minRarity: i % 3 === 0 ? 'epic' : 'common' });
    assert.ok((s.stats.block ?? 0) > 0 && (s.stats.block ?? 0) <= MAX_BLOCK, `${s.name}: ${s.stats.block}`);
  }
});

test('a blocked hit barely flashes the screen; an unblocked one fully does', () => {
  const a = createVitals(), b = createVitals();
  damagePlayer(a, 5, true);
  damagePlayer(b, 5, false);
  assert.ok(a.hurt < b.hurt);
});

test('off-hand gear survives death, recovery and old saves without the slot', () => {
  const r = mulberry32(9);
  const inv = createInventory(r);
  const shield = genItem(r, 2, { slot: 'offhand' });
  addToBackpack(inv, shield);
  equip(inv, shield.id);
  const m = dieAndDrop(inv, 1, 0, 0, r)!;
  assert.equal(m.equipped.offhand?.id, shield.id);
  assert.equal(inv.equipped.offhand, null);
  recoverMarker(inv, m);
  assert.equal(inv.equipped.offhand?.id, shield.id);

  const raw = JSON.parse(serializeSave(newSave(1, createInventory(r))));
  delete raw.inv.equipped.offhand;
  assert.equal(parseSave(JSON.stringify(raw))!.inv.equipped.offhand, null);
});
