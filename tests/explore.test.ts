import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplored, revealAround } from '../src/sim/explore';
import { generateFloor, toTile } from '../src/sim/floorgen';

test('nothing is discovered until the player looks around', () => {
  const f = generateFloor(5, 1);
  assert.equal(createExplored(f).reduce((a, b) => a + b, 0), 0);
});

test('revealing marks the start tile, is idempotent, and never reveals everything at once', () => {
  const f = generateFloor(5, 1);
  const seen = createExplored(f);
  assert.equal(revealAround(f, seen, f.start.x, f.start.z), true);
  assert.equal(seen[toTile(f.start.z) * f.w + toTile(f.start.x)], 1);
  assert.equal(revealAround(f, seen, f.start.x, f.start.z), false);
  const open = f.tiles.reduce((a, b) => a + b, 0);
  let seenOpen = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i] && f.tiles[i] === 1) seenOpen++;
  assert.ok(seenOpen > 0 && seenOpen < open, 'a single spot should see part of the floor only');
});

test('walls block sight: no open tile beyond a closed wall is revealed from far away', () => {
  const f = generateFloor(9, 2);
  const seen = createExplored(f);
  revealAround(f, seen, f.start.x, f.start.z, 3);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    if (seen[y * f.w + x] && f.tiles[y * f.w + x] === 1) {
      assert.ok((x - toTile(f.start.x)) ** 2 + (y - toTile(f.start.z)) ** 2 <= 9, 'revealed a tile outside the radius');
    }
  }
});
