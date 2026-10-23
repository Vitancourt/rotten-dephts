import { TILE, type Floor } from '../sim/floorgen';

const PX = 4; // canvas pixels per tile

export interface Minimap {
  /** Starts a fresh map for a floor; `seen` is the live discovered-tile array (see sim/explore). */
  setFloor(f: Floor, seen: Uint8Array): void;
  /** Call when `seen` changed so the map layer is redrawn. */
  invalidate(): void;
  draw(x: number, z: number, yaw: number): void;
  show(on: boolean): void;
}

/** Top-right map that only shows what the player has discovered. */
export function createMinimap(): Minimap {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:44px;right:14px;z-index:9;border:1px solid #5a4a30;background:rgba(0,0,0,.55);pointer-events:none;image-rendering:pixelated';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  let floor: Floor | null = null;
  let seen: Uint8Array | null = null;
  let dirty = true;

  function bake(): void {
    if (!floor || !seen) return;
    lctx.clearRect(0, 0, layer.width, layer.height);
    const st = floor.stairs;
    for (let y = 0; y < floor.h; y++) {
      for (let x = 0; x < floor.w; x++) {
        const i = y * floor.w + x;
        if (!seen[i]) continue;
        const isStairs = x === st.tx && y === st.ty;
        const isUp = !!floor.upStairs && x === floor.upStairs.tx && y === floor.upStairs.ty;
        lctx.fillStyle = isStairs ? '#d9b84a' : isUp ? '#8fc4ff' : floor.tiles[i] ? '#5d6b80' : '#222834';
        lctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    // The merchant shows as a green dot once his corner has been seen.
    const m = floor.merchant;
    if (m && seen[Math.floor(m.z / TILE) * floor.w + Math.floor(m.x / TILE)]) {
      lctx.fillStyle = '#6fd36a';
      lctx.fillRect((m.x / TILE) * PX - 1, (m.z / TILE) * PX - 1, 3, 3);
    }
    dirty = false;
  }

  return {
    setFloor(f, s) {
      floor = f;
      seen = s;
      canvas.width = layer.width = f.w * PX;
      canvas.height = layer.height = f.h * PX;
      dirty = true;
    },
    invalidate() { dirty = true; },
    draw(x, z, yaw) {
      if (!floor) return;
      if (dirty) bake();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
      // Player arrow; forward is (-sin yaw, -cos yaw) in world x/z, which maps straight onto the canvas.
      const px = (x / TILE) * PX, pz = (z / TILE) * PX;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      ctx.fillStyle = '#ff9a4d';
      ctx.beginPath();
      ctx.moveTo(px + fx * 5, pz + fz * 5);
      ctx.lineTo(px - fx * 3 - fz * 3, pz - fz * 3 + fx * 3);
      ctx.lineTo(px - fx * 3 + fz * 3, pz - fz * 3 - fx * 3);
      ctx.closePath();
      ctx.fill();
    },
    show(on) { canvas.style.display = on ? 'block' : 'none'; },
  };
}
