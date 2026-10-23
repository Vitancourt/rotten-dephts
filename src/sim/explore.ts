// Which tiles of a floor the player has seen. Pure logic: the minimap only draws this.
import { toTile, type Floor } from './floorgen';

export const SIGHT_RADIUS = 7; // tiles

/** One flag per tile: 1 = discovered. */
export const createExplored = (f: Floor): Uint8Array => new Uint8Array(f.w * f.h);

const isOpen = (f: Floor, x: number, y: number): boolean => x >= 0 && y >= 0 && x < f.w && y < f.h && f.tiles[y * f.w + x] === 1;

/** True when no wall tile lies strictly between the two tiles (grid walk, endpoints excluded). */
function clearLine(f: Floor, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    if (!isOpen(f, x, y)) return false;
  }
  return true;
}

/**
 * Marks every open tile within sight of (px, pz) as discovered, along with the walls touching it
 * so rooms get outlines. Returns true if anything new was revealed.
 */
export function revealAround(f: Floor, seen: Uint8Array, px: number, pz: number, radius = SIGHT_RADIUS): boolean {
  const cx = toTile(px), cy = toTile(pz);
  let changed = false;
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
    const i = y * f.w + x;
    if (!seen[i]) { seen[i] = 1; changed = true; }
  };
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!isOpen(f, x, y) || (x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      if (!clearLine(f, cx, cy, x, y)) continue;
      mark(x, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isOpen(f, x + dx, y + dy)) mark(x + dx, y + dy);
    }
  }
  return changed;
}
