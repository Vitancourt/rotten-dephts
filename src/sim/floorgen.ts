// Seeded room-and-corridor floor generator. Pure logic: no Three.js or DOM imports.
import { hashSeed, mulberry32, pick, randInt, shuffle, type Rng } from './rng';
import type { Rect, Solids } from './movement';
import type { EnemyKind } from './enemy';

export const TILE = 2; // metres per tile
export const MAP_W = 44;
export const MAP_H = 44;
export const WALL_H = 3.2;

export interface Room { x: number; y: number; w: number; h: number }
export interface Spawn { kind: EnemyKind; x: number; z: number }
export interface LootSpot { x: number; z: number; kind: 'gold' | 'item' | 'heal' }
/** A torch on a wall face; (nx, nz) points from the wall into the open space. */
export interface TorchSpot { x: number; z: number; nx: number; nz: number }

/** A wall tile holding a staircase, and where the player stands to use it. (nx, nz) points into the room. */
export interface StairsInfo { tx: number; ty: number; nx: number; nz: number; frontX: number; frontZ: number }
/** Where the merchant stands; (nx, nz) is the way he faces. */
export interface MerchantSpot { x: number; z: number; nx: number; nz: number }

export interface Floor {
  depth: number;
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array; // 1 = open, 0 = wall
  rooms: Room[];
  startRoom: number;
  stairsRoom: number;
  isBossFloor: boolean;
  start: { x: number; z: number };
  /** Wall tile holding the stairs, and where the player stands to use them. */
  stairs: StairsInfo;
  /** Stairs back up, in the start room (none on floor 1). */
  upStairs: StairsInfo | null;
  /** A merchant by the up stairs (none on floor 1). */
  merchant: MerchantSpot | null;
  boss: { x: number; z: number } | null;
  spawns: Spawn[];
  loot: LootSpot[];
  torches: TorchSpot[];
}

export const isBossDepth = (depth: number): boolean => depth > 0 && depth % 2 === 0;
/** Cages (checkpoints) stand at the start of odd floors. */
export const hasCage = (depth: number): boolean => depth % 2 === 1;

export const tileCenter = (t: number): number => (t + 0.5) * TILE;
export const toTile = (v: number): number => Math.floor(v / TILE);

const open = (f: { tiles: Uint8Array; w: number; h: number }, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < f.w && y < f.h && f.tiles[y * f.w + x] === 1;

const overlaps = (a: Room, b: Room, m: number): boolean =>
  !(a.x + a.w + m <= b.x || b.x + b.w + m <= a.x || a.y + a.h + m <= b.y || b.y + b.h + m <= a.y);

const center = (r: Room): [number, number] => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];

function carveRoom(t: Uint8Array, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) t[y * MAP_W + x] = 1;
}

function carveCorridor(t: Uint8Array, a: [number, number], b: [number, number], horizFirst: boolean): void {
  const [ax, ay] = a, [bx, by] = b;
  const hline = (y: number, x0: number, x1: number) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t[y * MAP_W + x] = 1; };
  const vline = (x: number, y0: number, y1: number) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) t[y * MAP_W + x] = 1; };
  if (horizFirst) { hline(ay, ax, bx); vline(bx, ay, by); } else { vline(ax, ay, by); hline(by, ax, bx); }
}

function bfs(t: Uint8Array, sx: number, sy: number): Int32Array {
  const dist = new Int32Array(MAP_W * MAP_H).fill(-1);
  const q = [sy * MAP_W + sx];
  dist[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % MAP_W, y = (c / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (t[ni] === 1 && dist[ni] < 0) { dist[ni] = dist[c] + 1; q.push(ni); }
    }
  }
  return dist;
}

function connected(t: Uint8Array, sx: number, sy: number): boolean {
  const dist = bfs(t, sx, sy);
  for (let i = 0; i < t.length; i++) if (t[i] === 1 && dist[i] < 0) return false;
  return true;
}

/** An open tile whose 8 neighbours are all open (so nothing spawns hugging a wall). */
function interiorTile(f: { tiles: Uint8Array; w: number; h: number }, r: Room, rng: Rng): [number, number] | null {
  const cands: [number, number][] = [];
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!open(f, x + dx, y + dy)) { ok = false; break; }
      if (ok) cands.push([x, y]);
    }
  }
  return cands.length ? pick(rng, cands) : null;
}

function attempt(seed: number, depth: number): Floor | null {
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const rooms: Room[] = [];
  const target = randInt(rng, 8, 11);
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = randInt(rng, 4, 9), h = randInt(rng, 4, 9);
    const r: Room = { x: randInt(rng, 2, MAP_W - 2 - w), y: randInt(rng, 2, MAP_H - 2 - h), w, h };
    if (rooms.some((o) => overlaps(r, o, 2))) continue;
    rooms.push(r);
    carveRoom(tiles, r);
  }
  if (rooms.length < 6) return null;

  // Minimum spanning tree over room centres, plus a couple of loops.
  const dist = (a: Room, b: Room) => { const [ax, ay] = center(a), [bx, by] = center(b); return Math.abs(ax - bx) + Math.abs(ay - by); };
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.has(j)) continue;
      const d = dist(rooms[i], rooms[j]);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    edges.push(best!);
    inTree.add(best![1]);
  }
  const have = new Set(edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  for (let k = 0; k < 2; k++) {
    const a = randInt(rng, 0, rooms.length - 1), b = randInt(rng, 0, rooms.length - 1);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a !== b && !have.has(key)) { have.add(key); edges.push([a, b]); }
  }
  for (const [a, b] of edges) carveCorridor(tiles, center(rooms[a]), center(rooms[b]), rng() < 0.5);

  const startRoom = randInt(rng, 0, rooms.length - 1);
  const [sx, sy] = center(rooms[startRoom]);
  if (!connected(tiles, sx, sy)) return null;

  // Stairs room: the farthest room from the start by walking distance.
  const isBoss = isBossDepth(depth);
  let d0 = bfs(tiles, sx, sy);
  let stairsRoom = -1, far = -1;
  rooms.forEach((r, i) => {
    if (i === startRoom) return;
    const [cx, cy] = center(r);
    const d = d0[cy * MAP_W + cx];
    if (d > far) { far = d; stairsRoom = i; }
  });
  if (stairsRoom < 0) return null;

  if (isBoss) {
    // The arena must be roomy: grow the stairs room to at least 8x8 around its centre.
    const r = rooms[stairsRoom];
    const [cx, cy] = center(r);
    const nw = Math.max(r.w, 8), nh = Math.max(r.h, 8);
    const nx = Math.max(1, Math.min(MAP_W - 1 - nw, cx - (nw >> 1)));
    const ny = Math.max(1, Math.min(MAP_H - 1 - nh, cy - (nh >> 1)));
    const grown: Room = { x: nx, y: ny, w: nw, h: nh };
    if (rooms.some((o, i) => i !== stairsRoom && overlaps(grown, o, 0))) return null; // would merge with another room
    rooms[stairsRoom] = grown;
    carveRoom(tiles, grown);
    d0 = bfs(tiles, sx, sy);
  }

  // Pillars in big rooms (never in the start room or arena), keeping everything connected.
  rooms.forEach((r, i) => {
    if (i === startRoom || i === stairsRoom || r.w < 7 || r.h < 7) return;
    for (let k = 0; k < randInt(rng, 1, 3); k++) {
      const x = randInt(rng, r.x + 2, r.x + r.w - 3), y = randInt(rng, r.y + 2, r.y + r.h - 3);
      const idx = y * MAP_W + x;
      if (tiles[idx] !== 1) continue;
      tiles[idx] = 0;
      if (!connected(tiles, sx, sy)) tiles[idx] = 1;
    }
  });

  const f = { tiles, w: MAP_W, h: MAP_H };

  // Stairs: a wall tile on a room's perimeter, three walls wide and backed by wall.
  const sr = rooms[stairsRoom];
  type Cand = { tx: number; ty: number; nx: number; nz: number };
  const wallAt = (x: number, y: number) => x >= 1 && y >= 1 && x < MAP_W - 1 && y < MAP_H - 1 && !open(f, x, y);
  const stairSpots = (room: Room): Cand[] => {
    const cands: Cand[] = [];
    for (let x = room.x; x < room.x + room.w; x++) {
      cands.push({ tx: x, ty: room.y - 1, nx: 0, nz: 1 });
      cands.push({ tx: x, ty: room.y + room.h, nx: 0, nz: -1 });
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      cands.push({ tx: room.x - 1, ty: y, nx: 1, nz: 0 });
      cands.push({ tx: room.x + room.w, ty: y, nx: -1, nz: 0 });
    }
    const [cx, cy] = center(room);
    return cands
      .filter((c) => {
        const lx = c.nz !== 0 ? 1 : 0, ly = c.nx !== 0 ? 1 : 0; // lateral direction
        return wallAt(c.tx, c.ty) && wallAt(c.tx + lx, c.ty + ly) && wallAt(c.tx - lx, c.ty - ly)
          && wallAt(c.tx - c.nx, c.ty - c.nz) && open(f, c.tx + c.nx, c.ty + c.nz);
      })
      // Prefer the wall middle.
      .sort((a, b) => (Math.abs(a.tx - cx) + Math.abs(a.ty - cy)) - (Math.abs(b.tx - cx) + Math.abs(b.ty - cy)));
  };
  const toStairs = (c: Cand): StairsInfo => ({ tx: c.tx, ty: c.ty, nx: c.nx, nz: c.nz, frontX: tileCenter(c.tx + c.nx), frontZ: tileCenter(c.ty + c.nz) });
  const good = stairSpots(sr);
  if (!good.length) return null;
  const stairs = toStairs(good[0]);

  // The way back up (and the merchant waiting beside it) lives in the start room.
  let upStairs: StairsInfo | null = null;
  let merchant: MerchantSpot | null = null;
  if (depth >= 2) {
    const up = stairSpots(rooms[startRoom]);
    if (!up.length) return null;
    upStairs = toStairs(up[0]);
    // Stand a couple of tiles off to the side of the stairs, outside the cage's footprint, facing the room.
    const sRoom = rooms[startRoom];
    const [rcx, rcy] = center(sRoom);
    let bestD = Infinity;
    for (let y = sRoom.y; y < sRoom.y + sRoom.h; y++) {
      for (let x = sRoom.x; x < sRoom.x + sRoom.w; x++) {
        if (!open(f, x, y)) continue;
        const mx = tileCenter(x), mz = tileCenter(y);
        if (Math.hypot(mx - tileCenter(rcx), mz - tileCenter(rcy)) < 3.8) continue; // cage and its walkway
        if (Math.hypot(mx - upStairs.frontX, mz - upStairs.frontZ) < 1.9) continue; // keep the stairs clear
        const d = Math.hypot(mx - upStairs.frontX, mz - upStairs.frontZ);
        if (d < bestD) { bestD = d; merchant = { x: mx, z: mz, nx: 0, nz: 0 }; }
      }
    }
    if (!merchant) return null;
    const dx = tileCenter(rcx) - merchant.x, dz = tileCenter(rcy) - merchant.z;
    const len = Math.hypot(dx, dz) || 1;
    merchant.nx = dx / len;
    merchant.nz = dz / len;
  }

  const start = { x: tileCenter(sx), z: tileCenter(sy) };
  const near = (x: number, z: number, r: number) => Math.hypot(x - start.x, z - start.z) < r;
  const inAnyRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  // Enemies: scaled by room size and depth; none in the start room; the boss owns the arena.
  const spawns: Spawn[] = [];
  const zombieChance = Math.min(0.5, 0.25 + 0.05 * depth);
  const archerChance = Math.min(0.14, 0.06 + 0.01 * depth);
  const mageChance = Math.min(0.1, 0.03 + 0.01 * depth);
  const kind = (): EnemyKind => {
    const r = rng();
    return r < zombieChance ? 'zombie' : r < zombieChance + archerChance ? 'archer' : r < zombieChance + archerChance + mageChance ? 'mage' : 'skeleton';
  };
  rooms.forEach((r, i) => {
    if (i === startRoom || (isBoss && i === stairsRoom)) return;
    // Early floors are sparse; density ramps up with depth.
    const per = depth === 1 ? 26 : depth === 2 ? 20 : 16;
    const base = Math.round((r.w * r.h) / per) + (depth >= 3 ? 1 : 0);
    const n = Math.max(1, Math.min(7, Math.round(base * (1 + 0.08 * (depth - 1)))));
    const used = new Set<string>();
    for (let k = 0; k < n; k++) {
      const t = interiorTile(f, r, rng);
      if (!t) break;
      const key = t.join(',');
      if (used.has(key)) continue;
      used.add(key);
      const x = tileCenter(t[0]) + (rng() - 0.5) * 0.8, z = tileCenter(t[1]) + (rng() - 0.5) * 0.8;
      if (near(x, z, 9)) continue;
      spawns.push({ kind: kind(), x, z });
    }
  });
  // A sleeper in some corridors.
  for (const [a, b] of edges) {
    if (rng() > (depth === 1 ? 0.2 : 0.35)) continue;
    const [ax, ay] = center(rooms[a]), [bx, by] = center(rooms[b]);
    const mx = Math.round((ax + bx) / 2), my = Math.round((ay + by) / 2);
    for (const [x, y] of [[mx, ay], [bx, my], [ax, my], [mx, by]]) {
      if (open(f, x, y) && !inAnyRoom(x, y) && !near(tileCenter(x), tileCenter(y), 12)) {
        spawns.push({ kind: 'skeleton', x: tileCenter(x), z: tileCenter(y) });
        break;
      }
    }
  }

  // Loose loot in side rooms.
  const loot: LootSpot[] = [];
  rooms.forEach((r, i) => {
    if (i === startRoom || (isBoss && i === stairsRoom)) return;
    for (const k of ['gold', 'item', 'heal'] as const) {
      if (rng() > (k === 'gold' ? 0.45 : k === 'item' ? 0.3 : 0.25)) continue;
      const t = interiorTile(f, r, rng);
      if (t) loot.push({ x: tileCenter(t[0]), z: tileCenter(t[1]), kind: k });
    }
  });

  // Torches: spaced along wall faces, with a minimum per room.
  const torches: TorchSpot[] = [];
  const faces: TorchSpot[] = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (open(f, x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!open(f, x + dx, y + dy)) continue;
        // Keep both stairs walls and their neighbours clear.
        if (Math.abs(x - stairs.tx) <= 1 && Math.abs(y - stairs.ty) <= 1) continue;
        if (upStairs && Math.abs(x - upStairs.tx) <= 1 && Math.abs(y - upStairs.ty) <= 1) continue;
        faces.push({ x: tileCenter(x) + dx * (TILE / 2 + 0.1), z: tileCenter(y) + dy * (TILE / 2 + 0.1), nx: dx, nz: dy });
      }
    }
  }
  shuffle(rng, faces);
  for (const c of faces) if (torches.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > 8)) torches.push(c);
  rooms.forEach((r) => {
    const rx0 = r.x * TILE - 2, rx1 = (r.x + r.w) * TILE + 2, rz0 = r.y * TILE - 2, rz1 = (r.y + r.h) * TILE + 2;
    const inside = (t: TorchSpot) => t.x > rx0 && t.x < rx1 && t.z > rz0 && t.z < rz1;
    let count = torches.filter(inside).length;
    for (const c of faces) {
      if (count >= 3) break;
      if (inside(c) && torches.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > 3.5)) { torches.push(c); count++; }
    }
  });

  const boss = isBoss ? { x: tileCenter(Math.floor(sr.x + sr.w / 2)), z: tileCenter(Math.floor(sr.y + sr.h / 2)) } : null;

  return { depth, seed, w: MAP_W, h: MAP_H, tiles, rooms, startRoom, stairsRoom, isBossFloor: isBoss, start, stairs, upStairs, merchant, boss, spawns, loot, torches };
}

/** Deterministic: the same (runSeed, depth) always yields the same floor. */
export function generateFloor(runSeed: number, depth: number): Floor {
  for (let i = 0; i < 60; i++) {
    const f = attempt(hashSeed(runSeed, depth, i), depth);
    if (f) return f;
  }
  throw new Error(`floor generation failed for seed ${runSeed} depth ${depth}`);
}

/** Tile-grid collision: only the wall tiles around a point are turned into rects. */
export class FloorSolids implements Solids {
  private cache = new Map<number, Rect>();
  constructor(private f: Floor) {}

  private rect(tx: number, ty: number): Rect {
    const key = ty * 1000 + tx;
    let r = this.cache.get(key);
    if (!r) {
      r = { minX: tx * TILE, maxX: (tx + 1) * TILE, minZ: ty * TILE, maxZ: (ty + 1) * TILE };
      this.cache.set(key, r);
    }
    return r;
  }

  near(x: number, z: number): Rect[] {
    const tx = toTile(x), ty = toTile(z);
    const out: Rect[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!open(this.f, nx, ny)) out.push(this.rect(nx, ny));
      }
    }
    return out;
  }
}

export const floorBounds = (f: Floor): Rect => ({ minX: 0, maxX: f.w * TILE, minZ: 0, maxZ: f.h * TILE });
