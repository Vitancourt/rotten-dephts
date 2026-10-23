import test from 'node:test';
import assert from 'node:assert/strict';
import { FloorSolids, floorBounds, generateFloor, hasCage, isBossDepth, TILE, toTile, type Floor } from '../src/sim/floorgen';
import { buildNav, findPath } from '../src/sim/nav';

const open = (f: Floor, x: number, y: number) => f.tiles[y * f.w + x] === 1;

function flood(f: Floor): number {
  const seen = new Set<number>();
  const q = [toTile(f.start.z) * f.w + toTile(f.start.x)];
  seen.add(q[0]);
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % f.w, y = (q[i] / f.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * f.w + nx;
      if (open(f, nx, ny) && !seen.has(ni)) { seen.add(ni); q.push(ni); }
    }
  }
  return seen.size;
}

test('every seed and depth yields a fully connected floor', () => {
  for (let seed = 1; seed <= 150; seed++) {
    for (const depth of [1, 2, 3, 4, 7, 8]) {
      const f = generateFloor(seed, depth);
      const total = f.tiles.reduce((a, b) => a + b, 0);
      assert.equal(flood(f), total, `seed ${seed} depth ${depth} has unreachable floor`);
    }
  }
});

test('generation is deterministic per (seed, depth) and differs between depths', () => {
  const a = generateFloor(1234, 3), b = generateFloor(1234, 3), c = generateFloor(1234, 4);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.deepEqual(a.spawns, b.spawns);
  assert.notDeepEqual(Array.from(a.tiles), Array.from(c.tiles));
});

test('stairs face an open tile and are reachable; start is open', () => {
  for (let seed = 1; seed <= 80; seed++) {
    for (const depth of [1, 2, 5, 6]) {
      const f = generateFloor(seed, depth);
      assert.ok(open(f, toTile(f.start.x), toTile(f.start.z)));
      assert.ok(!open(f, f.stairs.tx, f.stairs.ty), 'stairs sit in a wall tile');
      assert.ok(open(f, toTile(f.stairs.frontX), toTile(f.stairs.frontZ)), 'stairs front is open floor');
    }
  }
});

test('boss floors are every 2nd depth, have a big arena and no ordinary spawns inside it', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(isBossDepth), [false, true, false, true, false, true]);
  assert.deepEqual([1, 2, 3, 4, 5].map(hasCage), [true, false, true, false, true]);
  for (let seed = 1; seed <= 60; seed++) {
    const f = generateFloor(seed, 2);
    assert.ok(f.isBossFloor && f.boss);
    const r = f.rooms[f.stairsRoom];
    assert.ok(r.w >= 8 && r.h >= 8, 'arena at least 8x8');
    for (const s of f.spawns) {
      const inside = s.x > r.x * TILE && s.x < (r.x + r.w) * TILE && s.z > r.y * TILE && s.z < (r.y + r.h) * TILE;
      assert.ok(!inside, 'no regular enemies in the arena');
    }
    assert.equal(generateFloor(seed, 1).boss, null);
  }
});

test('spawns and loot are on open tiles and every spawn is reachable by the nav grid', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const f = generateFloor(seed, 3);
    const nav = buildNav(floorBounds(f), new FloorSolids(f), 0.45);
    for (const s of f.spawns) {
      assert.ok(open(f, toTile(s.x), toTile(s.z)), 'spawn on floor');
      assert.ok(findPath(nav, f.start.x, f.start.z, s.x, s.z).length > 0, `seed ${seed}: spawn unreachable by A*`);
    }
    for (const l of f.loot) assert.ok(open(f, toTile(l.x), toTile(l.z)));
    assert.ok(findPath(nav, f.start.x, f.start.z, f.stairs.frontX, f.stairs.frontZ).length > 0, 'stairs reachable');
  }
});

test('deeper floors hold more enemies on average', () => {
  const avg = (depth: number) => {
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) n += generateFloor(seed, depth).spawns.length;
    return n / 60;
  };
  assert.ok(avg(7) > avg(1), `depth 7 (${avg(7).toFixed(1)}) should exceed depth 1 (${avg(1).toFixed(1)})`);
});

test('FloorSolids only reports wall tiles and keeps start inside open space', () => {
  const f = generateFloor(9, 1);
  const s = new FloorSolids(f);
  const walls = s.near(f.start.x, f.start.z);
  for (const r of walls) assert.ok(r.maxX - r.minX === TILE);
  assert.ok(walls.every((r) => !(f.start.x > r.minX && f.start.x < r.maxX && f.start.z > r.minZ && f.start.z < r.maxZ)));
});
