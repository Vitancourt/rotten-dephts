import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng';
import { addToBackpack, createInventory, equip } from '../src/sim/inventory';
import { genItem } from '../src/sim/items';
import { dieAndDrop, hasLoot, nextMarker, recoverMarker } from '../src/sim/death';
import { newSave, parseSave, serializeSave } from '../src/sim/save';

const rng = () => mulberry32(42);

function geared() {
  const r = rng();
  const inv = createInventory(r);
  inv.gold = 120;
  inv.xp = 55;
  const sword = genItem(r, 2, { slot: 'weapon' });
  const helm = genItem(r, 2, { slot: 'head' });
  const ring = genItem(r, 2, { slot: 'accessory' });
  addToBackpack(inv, sword); addToBackpack(inv, helm); addToBackpack(inv, ring);
  equip(inv, sword.id); equip(inv, helm.id);
  return { r, inv, sword, helm, ring };
}

test('dying drops everything into the marker and leaves only a torch', () => {
  const { r, inv, sword, helm, ring } = geared();
  const m = dieAndDrop(inv, 3, 10, -4, r)!;
  assert.equal(m.gold, 120);
  assert.equal(m.xp, 55);
  assert.equal(m.floor, 3);
  assert.equal(m.equipped.weapon?.id, sword.id);
  assert.equal(m.equipped.head?.id, helm.id);
  assert.deepEqual(m.backpack.map((i) => i.id), [ring.id].concat(m.backpack.filter((i) => i.base === 'Torch').map((i) => i.id)));
  assert.equal(inv.gold, 0);
  assert.equal(inv.xp, 0);
  assert.equal(inv.backpack.length, 0);
  assert.equal(inv.equipped.weapon?.base, 'Torch');
  assert.equal(inv.equipped.head, null);
});

test('recovering restores gold, xp and gear', () => {
  const { r, inv, sword, helm, ring } = geared();
  const m = dieAndDrop(inv, 1, 0, 0, r)!;
  recoverMarker(inv, m);
  assert.equal(inv.gold, 120);
  assert.equal(inv.xp, 55);
  assert.equal(inv.equipped.weapon?.id, sword.id);
  assert.equal(inv.equipped.head?.id, helm.id);
  assert.ok(inv.backpack.some((i) => i.id === ring.id));
  // The spare torch from the old backpack comes back too; nothing is destroyed.
  assert.ok(inv.backpack.length >= 1);
});

test('dying empty-handed leaves no marker (an older one would survive)', () => {
  const r = rng();
  const inv = createInventory(r);
  assert.equal(hasLoot(inv), false);
  assert.equal(dieAndDrop(inv, 1, 0, 0, r), null);
  assert.equal(inv.equipped.weapon?.base, 'Torch');
});

test('a second death replaces the first marker (old loot is lost)', () => {
  const { r, inv } = geared();
  const first = dieAndDrop(inv, 2, 1, 1, r)!;
  inv.gold = 7; // picked up a little on the way back
  const second = dieAndDrop(inv, 2, 5, 5, r)!;
  const marker = nextMarker(first, second)!;
  assert.equal(marker.gold, 7);
  assert.equal(marker.x, 5);
});

test('dying with nothing keeps the older marker', () => {
  const { r, inv } = geared();
  const first = dieAndDrop(inv, 2, 1, 1, r)!;
  const second = dieAndDrop(inv, 2, 9, 9, r); // only the starter torch this time
  assert.equal(nextMarker(first, second), first);
});

test('saves round-trip and reject garbage or other versions', () => {
  const { inv } = geared();
  const save = newSave(99, inv);
  save.floor = 4;
  const back = parseSave(serializeSave(save))!;
  assert.equal(back.floor, 4);
  assert.equal(back.inv.gold, 120);
  assert.equal(parseSave('nope'), null);
  assert.equal(parseSave(null), null);
  assert.equal(parseSave(JSON.stringify({ ...save, version: 999 })), null);
  assert.equal(parseSave(JSON.stringify({ ...save, inv: null })), null);
});
