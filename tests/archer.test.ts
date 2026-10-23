import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, stepEnemy, ENEMY_DEFS, type EnemyEvent } from '../src/sim/enemy';
import { createArrow, stepArrows } from '../src/sim/projectile';
import { rectSolids } from '../src/sim/movement';
import { buildNav } from '../src/sim/nav';
import { generateFloor } from '../src/sim/floorgen';

const open = rectSolids([]);
const nav = buildNav({ minX: 0, maxX: 60, minZ: 0, maxZ: 60 }, open, 0.4);

test('an archer wakes, stops at range and looses an arrow after its draw time', () => {
  const e = createEnemy('archer', 10, 10);
  const events: EnemyEvent[] = [];
  for (let t = 0; t < 8 && !events.some((x) => x.type === 'shoot'); t += 1 / 60) events.push(...stepEnemy(e, 10, 18, true, 1 / 60, nav, open));
  const shot = events.find((x) => x.type === 'shoot');
  assert.ok(shot && shot.type === 'shoot', 'archer should shoot');
  assert.equal(shot.damage, ENEMY_DEFS.archer.damage);
  assert.ok(Math.hypot(e.x - 10, e.z - 18) > 5, 'archer keeps its distance instead of closing in');
});

test('an archer too close backs away rather than shooting point blank', () => {
  const e = createEnemy('archer', 10, 10);
  e.state = 'chase';
  const start = Math.hypot(e.x - 10, e.z - 12);
  for (let i = 0; i < 40; i++) stepEnemy(e, 10, 12, true, 1 / 60, nav, open);
  assert.ok(Math.hypot(e.x - 10, e.z - 12) > start, 'moved away from the player');
});

test('arrows fly straight, hit the player once, and stop at walls', () => {
  const hit = createArrow(0, 0, 10, 0, 9);
  assert.equal(stepArrows([hit], 0.1, open, 50, 50, true).length, 0, 'far from the player: no hit');
  const list = [createArrow(0, 0, 10, 0, 9)];
  let hits = 0;
  for (let i = 0; i < 120; i++) hits += stepArrows(list, 1 / 60, open, 10, 0, true).length;
  assert.equal(hits, 1);
  assert.equal(list.length, 0);

  const wall = rectSolids([{ minX: 4, maxX: 5, minZ: -2, maxZ: 2 }]);
  const blocked = [createArrow(0, 0, 10, 0, 9)];
  let h2 = 0;
  for (let i = 0; i < 120; i++) h2 += stepArrows(blocked, 1 / 60, wall, 10, 0, true).length;
  assert.equal(h2, 0, 'wall absorbs the arrow');
});

test('archers show up on generated floors, mixed in with the other monsters', () => {
  let archers = 0, total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const f = generateFloor(seed, 3);
    for (const s of f.spawns) { total++; if (s.kind === 'archer') archers++; }
  }
  assert.ok(archers > 0 && archers < total * 0.5, `archers ${archers}/${total}`);
});

test('a mage hurls slow, hard-hitting fireballs that the player can outrun', () => {
  const e = createEnemy('mage', 10, 10);
  const events: EnemyEvent[] = [];
  for (let t = 0; t < 8 && !events.some((x) => x.type === 'shoot'); t += 1 / 60) events.push(...stepEnemy(e, 10, 19, true, 1 / 60, nav, open));
  const shot = events.find((x) => x.type === 'shoot');
  assert.ok(shot && shot.type === 'shoot');
  assert.equal(shot.proj, 'fireball');
  assert.ok(shot.damage > ENEMY_DEFS.archer.damage, 'fireballs hit harder than arrows');
  const ball = createArrow(10, 10, 10, 30, shot.damage, 'fireball');
  const arrow = createArrow(10, 10, 10, 30, 9);
  assert.ok(Math.hypot(ball.vx, ball.vz) < Math.hypot(arrow.vx, arrow.vz), 'and fly slower');
  assert.ok(Math.hypot(ball.vx, ball.vz) < 5.4, 'slower than a sprinting player');
});

test('fireballs report where they burst', () => {
  const wall = rectSolids([{ minX: 4, maxX: 5, minZ: -2, maxZ: 2 }]);
  const list = [createArrow(0, 0, 10, 0, 15, 'fireball')];
  const ended: ReturnType<typeof createArrow>[] = [];
  for (let i = 0; i < 240 && list.length; i++) stepArrows(list, 1 / 60, wall, 50, 50, true, ended);
  assert.equal(ended.length, 1);
  assert.ok(ended[0].x >= 3.5 && ended[0].x <= 5.5);
});
