// Grid pathfinding over a Solids world. Pure logic.
import type { Rect, Solids } from './movement';

export interface NavGrid {
  minX: number;
  minZ: number;
  cell: number;
  w: number;
  h: number;
  blocked: Uint8Array;
}

export function buildNav(bounds: Rect, solids: Solids, inflate: number, cell = 0.5): NavGrid {
  const w = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const blocked = new Uint8Array(w * h);
  for (let gz = 0; gz < h; gz++) {
    for (let gx = 0; gx < w; gx++) {
      const cx = bounds.minX + (gx + 0.5) * cell;
      const cz = bounds.minZ + (gz + 0.5) * cell;
      for (const r of solids.near(cx, cz)) {
        if (cx > r.minX - inflate && cx < r.maxX + inflate && cz > r.minZ - inflate && cz < r.maxZ + inflate) {
          blocked[gz * w + gx] = 1;
          break;
        }
      }
    }
  }
  return { minX: bounds.minX, minZ: bounds.minZ, cell, w, h, blocked };
}

function toCell(n: NavGrid, x: number, z: number): [number, number] {
  return [
    Math.max(0, Math.min(n.w - 1, Math.floor((x - n.minX) / n.cell))),
    Math.max(0, Math.min(n.h - 1, Math.floor((z - n.minZ) / n.cell))),
  ];
}

function isBlockedAt(n: NavGrid, x: number, z: number): boolean {
  const [gx, gz] = toCell(n, x, z);
  return n.blocked[gz * n.w + gx] === 1;
}

/** True if the straight segment crosses no blocked cell. */
export function lineClear(n: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / (n.cell * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isBlockedAt(n, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** Nearest unblocked cell to (gx, gz), searched in expanding rings. */
function nearestOpen(n: NavGrid, gx: number, gz: number): [number, number] | null {
  if (!n.blocked[gz * n.w + gx]) return [gx, gz];
  for (let r = 1; r < 8; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = gx + dx, z = gz + dz;
        if (x < 0 || z < 0 || x >= n.w || z >= n.h) continue;
        if (!n.blocked[z * n.w + x]) return [x, z];
      }
    }
  }
  return null;
}

// Scratch buffers reused between searches; a stamp avoids clearing them each time.
let cap = 0;
let g: Float32Array, f: Float32Array;
let from: Int32Array, stamp: Int32Array, closedStamp: Int32Array;
let curStamp = 0;
let heap: number[] = [];

function ensure(N: number): void {
  if (N <= cap) return;
  cap = N;
  g = new Float32Array(N);
  f = new Float32Array(N);
  from = new Int32Array(N);
  stamp = new Int32Array(N);
  closedStamp = new Int32Array(N);
  curStamp = 0;
}

function push(i: number): void {
  heap.push(i);
  let c = heap.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (f[heap[p]] <= f[heap[c]]) break;
    [heap[p], heap[c]] = [heap[c], heap[p]];
    c = p;
  }
}

function pop(): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let c = 0;
    for (;;) {
      const l = 2 * c + 1, r = l + 1;
      let m = c;
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
      if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
      if (m === c) break;
      [heap[m], heap[c]] = [heap[c], heap[m]];
      c = m;
    }
  }
  return top;
}

/** A* with 8-way movement. Returns world-space waypoints (excluding the start), or [] if none. */
export function findPath(n: NavGrid, sx: number, sz: number, ex: number, ez: number): { x: number; z: number }[] {
  const s0 = toCell(n, sx, sz);
  const e0 = toCell(n, ex, ez);
  const s = nearestOpen(n, s0[0], s0[1]);
  const e = nearestOpen(n, e0[0], e0[1]);
  if (!s || !e) return [];

  const N = n.w * n.h;
  ensure(N);
  curStamp++;
  heap = [];
  const idx = (x: number, z: number) => z * n.w + x;
  const heur = (x: number, z: number) => {
    const dx = Math.abs(x - e[0]), dz = Math.abs(z - e[1]);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };

  const start = idx(s[0], s[1]);
  const goal = idx(e[0], e[1]);
  g[start] = 0;
  f[start] = heur(s[0], s[1]);
  from[start] = -1;
  stamp[start] = curStamp;
  push(start);

  let found = false;
  while (heap.length) {
    const cur = pop();
    if (closedStamp[cur] === curStamp) continue;
    closedStamp[cur] = curStamp;
    if (cur === goal) { found = true; break; }
    const cx = cur % n.w, cz = (cur / n.w) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n.w || nz >= n.h) continue;
        const ni = idx(nx, nz);
        if (n.blocked[ni] || closedStamp[ni] === curStamp) continue;
        // No diagonal corner cutting.
        if (dx && dz && (n.blocked[idx(cx + dx, cz)] || n.blocked[idx(cx, cz + dz)])) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (stamp[ni] !== curStamp || ng < g[ni]) {
          stamp[ni] = curStamp;
          g[ni] = ng;
          from[ni] = cur;
          f[ni] = ng + heur(nx, nz);
          push(ni);
        }
      }
    }
  }

  if (!found) return [];
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  return cells.slice(1).map((c) => ({
    x: n.minX + ((c % n.w) + 0.5) * n.cell,
    z: n.minZ + (((c / n.w) | 0) + 0.5) * n.cell,
  }));
}
