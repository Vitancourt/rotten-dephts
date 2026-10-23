import * as THREE from 'three';

function noisy(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Flagstones for a 2m x 2m tile (a 2x2 pattern of slabs). */
export function makeFloorTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a443d';
  ctx.fillRect(0, 0, S, S);
  const shades = ['#4d473f', '#443f38', '#51493f', '#3f3b35'];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = shades[(i * 3 + j * 5) % 4];
      ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
    }
  }
  ctx.strokeStyle = '#1c1915';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath();
  ctx.moveTo(128, 0); ctx.lineTo(128, S); ctx.moveTo(0, 128); ctx.lineTo(S, 128);
  ctx.stroke();
  noisy(ctx, S, S, 26, 11);
  return finish(c);
}

/** Brick courses for a 2m wide x 3.2m tall wall face. */
export function makeWallTexture(): THREE.CanvasTexture {
  const W = 256, H = 410;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(0, 0, W, H);
  const rows = 16, rh = H / rows;
  let s = 7;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 32 : 0;
    for (let x = -64 + off; x < W; x += 64) {
      const l = 52 + rnd() * 18;
      ctx.fillStyle = `rgb(${l + 14},${l + 8},${l})`;
      ctx.fillRect(x + 2, r * rh + 2, 60, rh - 4);
    }
  }
  noisy(ctx, W, H, 30, 23);
  return finish(c);
}

let floorTex: THREE.CanvasTexture | null = null;
let wallTex: THREE.CanvasTexture | null = null;
export const floorTexture = (): THREE.CanvasTexture => (floorTex ??= makeFloorTexture());
export const wallTexture = (): THREE.CanvasTexture => (wallTex ??= makeWallTexture());
