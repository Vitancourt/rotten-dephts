import test from 'node:test';
import assert from 'node:assert/strict';
import { attackCovers, bossHittable, bossKindFor, bossTier, createBoss, damageBoss, stepBoss, BOSS_DEFS, INTRO_TIME } from '../src/sim/boss';
import { buildNav } from '../src/sim/nav';
import { rectSolids } from '../src/sim/movement';

const arena = rectSolids([
  { minX: -20, maxX: 20, minZ: -21, maxZ: -20 }, { minX: -20, maxX: 20, minZ: 20, maxZ: 21 },
  { minX: -21, maxX: -20, minZ: -20, maxZ: 20 }, { minX: 20, maxX: 21, minZ: -20, maxZ: 20 },
]);
const nav = buildNav({ minX: -21, maxX: 21, minZ: -21, maxZ: 21 }, arena, 0.45);

const run = (b: ReturnType<typeof createBoss>, px: number, pz: number, secs: number, inArena = true) => {
  const events: string[] = [];
  const hits: number[] = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    for (const e of stepBoss(b, px, pz, true, inArena, 1 / 60, nav, arena, () => 0)) {
      events.push(e.type);
      if (e.type === 'hit') hits.push(e.damage);
    }
  }
  return { events, hits };
};

test('boss kinds cycle with depth and scale up per tier', () => {
  assert.deepEqual([2, 4, 6, 8].map(bossKindFor), ['colossus', 'abomination', 'warden', 'colossus']);
  assert.equal(bossTier(2), 0);
  assert.ok(createBoss(8, 0, 0).maxHp > createBoss(2, 0, 0).maxHp);
});

test('boss sleeps until the player enters the arena, then roars before it can be hurt', () => {
  const b = createBoss(2, 0, 0);
  assert.equal(run(b, 10, 10, 2, false).events.length, 0);
  assert.equal(b.state, 'dormant');
  assert.equal(damageBoss(b, 50).length, 0);
  assert.equal(b.hp, b.maxHp, 'invulnerable while dormant');
  const r = run(b, 10, 10, 0.1);
  assert.deepEqual(r.events, ['wake']);
  assert.equal(bossHittable(b), false, 'invulnerable during the roar');
  run(b, 10, 10, INTRO_TIME + 0.1);
  assert.equal(bossHittable(b), true);
});

test('attacks are telegraphed: windup first, damage only if the player stays in the zone', () => {
  // Player adjacent: some attack starts, with a windup event before any hit.
  const b = createBoss(2, 0, 0);
  const stay = run(b, 0, -2, 6);
  assert.ok(stay.events.indexOf('windup') >= 0 && stay.events.indexOf('windup') < stay.events.indexOf('hit'));
  assert.ok(stay.hits.every((d) => d > 0));
  // Player stands far outside every attack's reach for the whole time: never hit.
  const c = createBoss(2, 0, 0);
  c.state = 'chase';
  const far = run(c, 0, 15, 0.8);
  assert.equal(far.hits.length, 0);
});

test('shapes: cleave is a cone, slam a circle ahead, quake a ring around the boss', () => {
  const b = createBoss(2, 0, 0);
  b.yaw = 0; // faces -Z
  const [cleave, slam] = BOSS_DEFS.colossus.attacks;
  assert.equal(attackCovers(b, cleave, 0, -2), true);
  assert.equal(attackCovers(b, cleave, 0, 2), false, 'behind is safe');
  assert.equal(attackCovers(b, cleave, 0, -9), false, 'too far');
  assert.equal(attackCovers(b, slam, 0, -2.6), true);
  assert.equal(attackCovers(b, slam, 0, 1.5), false);
  const quake = BOSS_DEFS.abomination.attacks[1];
  assert.equal(attackCovers(b, quake, 3, 0), true);
  assert.equal(attackCovers(b, quake, 7, 0), false);
});

test('at half health the boss enrages once and summons help; death is reported once', () => {
  const b = createBoss(2, 0, 0);
  b.state = 'chase';
  const ev1 = damageBoss(b, b.maxHp * 0.55);
  assert.deepEqual(ev1.map((e) => e.type), ['summon']);
  assert.equal(b.enraged, true);
  assert.deepEqual(damageBoss(b, 1).map((e) => e.type), []);
  const die = damageBoss(b, b.maxHp);
  assert.deepEqual(die.map((e) => e.type), ['die']);
  assert.equal(b.state, 'dead');
  assert.deepEqual(damageBoss(b, 10), [], 'cannot die twice');
});

test('a charging boss crosses the arena and hits a player in its path', () => {
  const b = createBoss(2, 0, 10);
  b.state = 'chase';
  b.yaw = 0; // faces -Z, towards the player at z=-4
  const r = run(b, 0, -4, 5);
  assert.ok(r.events.includes('windup'));
  assert.ok(r.hits.length >= 1, 'the player standing in the way is hit');
});
