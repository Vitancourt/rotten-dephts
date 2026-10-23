import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng';
import { addToBackpack, assignQuick, clearQuick, createInventory, equip, FLASK_HEAL, STARTER_FLASKS, useQuick } from '../src/sim/inventory';
import { genItem } from '../src/sim/items';
import { dieAndDrop, hasLoot, recoverMarker } from '../src/sim/death';
import { newSave, parseSave, serializeSave } from '../src/sim/save';

const fresh = () => createInventory(mulberry32(5));

test('you start with a flask on Q', () => {
  const inv = fresh();
  assert.equal(inv.flasks, STARTER_FLASKS);
  assert.deepEqual(inv.quick, [{ type: 'flask' }, null]);
});

test('a flask heals and is spent; it is not wasted at full health', () => {
  const inv = fresh();
  assert.deepEqual(useQuick(inv, 0, true), { kind: 'full-health' });
  assert.equal(inv.flasks, 1, 'not consumed at full health');
  assert.deepEqual(useQuick(inv, 0, false), { kind: 'drank', heal: FLASK_HEAL });
  assert.equal(inv.flasks, 0);
  assert.deepEqual(useQuick(inv, 0, false), { kind: 'no-flasks' });
  assert.deepEqual(useQuick(inv, 1, false), { kind: 'empty' });
});

test('a gear slot swaps that item in and keeps working afterwards', () => {
  const r = mulberry32(8);
  const inv = fresh();
  const a = genItem(r, 2, { slot: 'weapon' }), b = genItem(r, 2, { slot: 'weapon' });
  addToBackpack(inv, a); addToBackpack(inv, b);
  assignQuick(inv, 0, { type: 'item', id: a.id });
  assignQuick(inv, 1, { type: 'item', id: b.id });
  assert.equal((useQuick(inv, 0, false) as { kind: string }).kind, 'equipped');
  assert.equal(inv.equipped.weapon?.id, a.id);
  assert.equal(useQuick(inv, 0, false).kind, 'already-equipped');
  assert.equal(useQuick(inv, 1, false).kind, 'equipped');
  assert.equal(inv.equipped.weapon?.id, b.id, 'second slot swaps to the other weapon');
  assert.equal(useQuick(inv, 0, false).kind, 'equipped', 'and back again');
});

test('the same thing is never in both slots, and slots can be cleared', () => {
  const inv = fresh();
  assignQuick(inv, 1, { type: 'flask' });
  assert.deepEqual(inv.quick, [null, { type: 'flask' }]);
  clearQuick(inv, 1);
  assert.deepEqual(inv.quick, [null, null]);
});

test('a slot pointing at gear you no longer carry reports it as missing', () => {
  const inv = fresh();
  const w = genItem(mulberry32(1), 1, { slot: 'weapon' });
  assignQuick(inv, 0, { type: 'item', id: w.id });
  assert.equal(useQuick(inv, 0, false).kind, 'missing');
});

test('flasks are dropped on death, one is restocked, and recovery returns them', () => {
  const r = mulberry32(3);
  const inv = fresh();
  assert.equal(hasLoot(inv), false, 'the starter flask alone is not worth a marker');
  inv.flasks = 4;
  assert.equal(hasLoot(inv), true);
  const m = dieAndDrop(inv, 2, 1, 1, r)!;
  assert.equal(m.flasks, 4);
  assert.equal(inv.flasks, STARTER_FLASKS);
  recoverMarker(inv, m);
  assert.equal(inv.flasks, STARTER_FLASKS + 4);
});

test('equipping via quick slot and old saves without the new fields still load', () => {
  const inv = fresh();
  const save = newSave(1, inv);
  const raw = JSON.parse(serializeSave(save));
  delete raw.inv.flasks; delete raw.inv.quick;
  const back = parseSave(JSON.stringify(raw))!;
  assert.equal(back.inv.flasks, 0);
  assert.deepEqual(back.inv.quick, [null, null]);
  void equip;
});

test('sprinting drains stamina, locks out at zero, and resumes after regeneration', async () => {
  const { createCombat, stepSprint, SPRINT_RESUME } = await import('../src/sim/combat');
  const c = createCombat();
  assert.equal(stepSprint(c, false, 1), false);
  assert.equal(c.stamina, 100);
  assert.equal(stepSprint(c, true, 1), true);
  assert.ok(c.stamina < 100);
  for (let i = 0; i < 200; i++) stepSprint(c, true, 0.1);
  assert.equal(c.stamina, 0);
  assert.equal(stepSprint(c, true, 0.1), false, 'cannot sprint while exhausted');
  c.stamina = SPRINT_RESUME - 1;
  assert.equal(stepSprint(c, true, 0.1), false, 'still locked below the resume threshold');
  c.stamina = SPRINT_RESUME;
  assert.equal(stepSprint(c, true, 0.1), true);
});
