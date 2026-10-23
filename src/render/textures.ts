import * as THREE from 'three';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Tileable value noise, summed over octaves; roughly 0..1. */
function makeNoise(w: number, h: number, seed: number, cell: number, octaves: number, cellY = cell): Float32Array {
  const out = new Float32Array(w * h);
  const rnd = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = Math.max(2, Math.round(w / cell)), gy = Math.max(2, Math.round(h / cellY));
    const grid = new Float32Array(gx * gy);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * gy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % gy) * gx + (x0 % gx)], b = grid[(y0 % gy) * gx + ((x0 + 1) % gx)];
        const c = grid[((y0 + 1) % gy) * gx + (x0 % gx)], d = grid[((y0 + 1) % gy) * gx + ((x0 + 1) % gx)];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy);
      }
    }
    total += amp;
    amp *= 0.5;
    cell = Math.max(2, cell / 2);
    cellY = Math.max(2, cellY / 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface StoneSpec {
  w: number;
  h: number;
  rows: number;
  /** Block width range as a fraction of the texture width. */
  minBlock: number;
  maxBlock: number;
  /** Per-row height jitter, 0 = uniform courses. */
  rowJitter: number;
  tint: [number, number, number];
  mortar: [number, number, number];
  seed: number;
  /** Bevel size in pixels, and how strongly the surface is pitted. */
  bevel: number;
  pits: number;
}

interface StoneMaps { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }

/** Course-laid ashlar: a height field drives colour, normals and roughness together. */
function makeStone(spec: StoneSpec): StoneMaps {
  const { w, h } = spec;
  const rnd = rng(spec.seed);
  const height = new Float32Array(w * h);
  const color = new Float32Array(w * h * 3);
  const gap = new Float32Array(w * h);
  const fbm = makeNoise(w, h, spec.seed + 1, 48, 4);
  const grain = makeNoise(w, h, spec.seed + 2, 6, 2);
  const cracks = makeNoise(w, h, spec.seed + 3, 24, 3);

  // Row heights that sum to the texture height so the pattern tiles.
  const rh: number[] = [];
  for (let r = 0; r < spec.rows; r++) rh.push(1 + (rnd() - 0.5) * spec.rowJitter);
  const rhSum = rh.reduce((a, b) => a + b, 0);
  let y0 = 0;
  for (let r = 0; r < spec.rows; r++) {
    const y1 = r === spec.rows - 1 ? h : Math.round(y0 + (rh[r] / rhSum) * h);
    // Block widths for this course, wrapping at the right edge.
    const widths: number[] = [];
    let left = 1;
    while (left > 0.001) {
      let bw = spec.minBlock + rnd() * (spec.maxBlock - spec.minBlock);
      if (left - bw < spec.minBlock) bw = left;
      widths.push(bw);
      left -= bw;
    }
    let x0 = Math.round(rnd() * w);
    for (const bw of widths) {
      const px = Math.max(4, Math.round(bw * w));
      const shade = 0.72 + rnd() * 0.5;
      const warm = (rnd() - 0.5) * 0.08;
      const base = 0.55 + rnd() * 0.3;
      const tilt = (rnd() - 0.5) * 0.25;
      const bx0 = x0, bx1 = x0 + px;
      for (let y = y0; y < y1; y++) {
        for (let xi = bx0; xi < bx1; xi++) {
          const x = ((xi % w) + w) % w;
          const i = y * w + x;
          const d = Math.min(xi - bx0, bx1 - 1 - xi, y - y0, y1 - 1 - y);
          // Chipped, rounded block edges: the noise pushes the edge line around.
          const edge = d + (fbm[i] - 0.5) * spec.bevel * 1.6 + (grain[i] - 0.5) * 2;
          const rise = smooth(1.5, spec.bevel, edge);
          const face = base + tilt * ((xi - bx0) / px - 0.5) + (fbm[i] - 0.5) * 0.25;
          const pit = spec.pits * smooth(0.62, 0.8, 1 - grain[i]) + spec.pits * 0.8 * smooth(0.6, 0.75, cracks[i]);
          height[i] = rise * (face - pit) * 0.9;
          gap[i] = 1 - rise;
          const lum = shade * (0.55 + 0.45 * rise) * (0.82 + (fbm[i] - 0.5) * 0.5 + (grain[i] - 0.5) * 0.35) * (1 - pit * 0.6);
          const m = spec.mortar, t = spec.tint;
          color[i * 3] = (t[0] + warm) * lum * rise + m[0] * (1 - rise);
          color[i * 3 + 1] = t[1] * lum * rise + m[1] * (1 - rise);
          color[i * 3 + 2] = (t[2] - warm) * lum * rise + m[2] * (1 - rise);
        }
      }
      x0 += px;
    }
    y0 = y1;
  }

  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  for (const c of [colorCanvas, normalCanvas, roughCanvas]) { c.width = w; c.height = h; }
  const cImg = new ImageData(w, h), nImg = new ImageData(w, h), rImg = new ImageData(w, h);
  const strength = 2.2;
  const H = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      nImg.data[o] = (-dx * inv * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = (dy * inv * 0.5 + 0.5) * 255; // canvas y runs down, texture v runs up
      nImg.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
      cImg.data[o] = Math.min(255, color[i * 3]);
      cImg.data[o + 1] = Math.min(255, color[i * 3 + 1]);
      cImg.data[o + 2] = Math.min(255, color[i * 3 + 2]);
      cImg.data[o + 3] = 255;
      const r = 0.85 + (grain[i] - 0.5) * 0.35 + gap[i] * 0.25 - height[i] * 0.1;
      const rv = Math.min(1, Math.max(0, r)) * 255;
      rImg.data[o] = rImg.data[o + 1] = rImg.data[o + 2] = rv;
      rImg.data[o + 3] = 255;
    }
  }
  colorCanvas.getContext('2d')!.putImageData(cImg, 0, 0);
  normalCanvas.getContext('2d')!.putImageData(nImg, 0, 0);
  roughCanvas.getContext('2d')!.putImageData(rImg, 0, 0);

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(colorCanvas, true), normalMap: tex(normalCanvas, false), roughnessMap: tex(roughCanvas, false) };
}

/** Blue-grey ashlar for a 2m wide x 3.2m tall wall face. */
export function makeWallMaps(): StoneMaps {
  return makeStone({
    w: 512, h: 820, rows: 8, minBlock: 0.28, maxBlock: 0.5, rowJitter: 0.35,
    tint: [92, 100, 114], mortar: [14, 15, 18], seed: 7, bevel: 14, pits: 0.12,
  });
}

/** Flagstones for a 2m x 2m tile. */
export function makeFloorMaps(): StoneMaps {
  return makeStone({
    w: 512, h: 512, rows: 3, minBlock: 0.4, maxBlock: 0.7, rowJitter: 0.5,
    tint: [88, 95, 108], mortar: [12, 13, 16], seed: 11, bevel: 12, pits: 0.1,
  });
}

let wallMaps: StoneMaps | null = null;
let floorMaps: StoneMaps | null = null;
export const wallTexture = (): THREE.CanvasTexture => wallSet().map;
export const wallSet = (): StoneMaps => (wallMaps ??= makeWallMaps());
export const floorSet = (): StoneMaps => (floorMaps ??= makeFloorMaps());

export type SurfaceKind = 'wood' | 'metal' | 'bone' | 'cloth' | 'leather';

/** Fine grain (albedo detail, normals, roughness) for props, weapons and creatures. */
export function makeSurface(kind: SurfaceKind): StoneMaps {
  const S = 128;
  const seed = 40 + kind.length * 7;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const shade = new Float32Array(S * S);
  const n1 = makeNoise(S, S, seed, kind === 'wood' ? 8 : 12, 3, kind === 'wood' ? 64 : 12);
  const n2 = makeNoise(S, S, seed + 1, kind === 'metal' ? 4 : 6, 2, kind === 'metal' ? 40 : 6);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let h = n1[i], r = 0.8, l = 0.8 + n1[i] * 0.35;
      switch (kind) {
        case 'wood': h = n1[i] * 0.7 + n2[i] * 0.3; r = 0.85 + n2[i] * 0.15; break;
        case 'metal': h = n2[i] * 0.5 + n1[i] * 0.2; r = 0.35 + n1[i] * 0.45; l = 0.75 + n1[i] * 0.3 - (n2[i] > 0.72 ? 0.25 : 0); break;
        case 'bone': h = smooth(0.6, 0.8, n2[i]) * -0.5 + n1[i]; r = 0.75 + n2[i] * 0.2; l = 0.85 + n1[i] * 0.2 - smooth(0.62, 0.8, n2[i]) * 0.3; break;
        case 'cloth': h = (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2)) * 0.18 + n1[i] * 0.5; r = 0.95; l = 0.75 + n1[i] * 0.3 + Math.sin(x * Math.PI / 2) * 0.05; break;
        case 'leather': h = Math.abs(n1[i] - 0.5) * 1.4 + n2[i] * 0.2; r = 0.6 + n2[i] * 0.3; l = 0.8 + (n1[i] - 0.5) * 0.4; break;
      }
      height[i] = h; rough[i] = r; shade[i] = l;
    }
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cc = mk(), nc = mk(), rc = mk();
  const cImg = new ImageData(S, S), nImg = new ImageData(S, S), rImg = new ImageData(S, S);
  const H = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  const strength = kind === 'cloth' ? 2.5 : 3.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      nImg.data[o] = (-dx * inv * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
      nImg.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
      cImg.data[o] = cImg.data[o + 1] = cImg.data[o + 2] = Math.min(1, shade[i]) * 255;
      cImg.data[o + 3] = 255;
      rImg.data[o] = rImg.data[o + 1] = rImg.data[o + 2] = Math.min(1, rough[i]) * 255;
      rImg.data[o + 3] = 255;
    }
  }
  cc.getContext('2d')!.putImageData(cImg, 0, 0);
  nc.getContext('2d')!.putImageData(nImg, 0, 0);
  rc.getContext('2d')!.putImageData(rImg, 0, 0);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(cc, true), normalMap: tex(nc, false), roughnessMap: tex(rc, false) };
}

const surfaces = new Map<SurfaceKind, StoneMaps>();
const surfaceSet = (k: SurfaceKind): StoneMaps => {
  let s = surfaces.get(k);
  if (!s) surfaces.set(k, (s = makeSurface(k)));
  return s;
};

/** A lit material with fine procedural grain; `rough` scales the roughness map. */
export function surfaceMaterial(kind: SurfaceKind, color: number, opts: { rough?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    ...surfaceSet(kind),
    color,
    roughness: opts.rough ?? 1,
    metalness: opts.metalness ?? 0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
}

/** Transparent decal: a branching crack, dark with a faint lit edge. */
export function makeCrackTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = rng(91);
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      const nx = x + Math.cos(ang) * 5, ny = y + Math.sin(ang) * 5;
      ctx.strokeStyle = 'rgba(160,170,190,0.25)'; ctx.lineWidth = w + 1.6;
      ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(nx + 1, ny + 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(6,6,8,0.95)'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny;
      ang += (rnd() - 0.5) * 0.9;
      w = Math.max(0.6, w * 0.97);
      if (depth < 3 && rnd() < 0.07) branch(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7), Math.floor(len * 0.5), w * 0.7, depth + 1);
      if (x < 4 || y < 4 || x > S - 4 || y > S - 4) break;
    }
  };
  branch(S * 0.5, 6, Math.PI / 2 + (rnd() - 0.5) * 0.6, 48, 3.2, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Transparent decal: mossy patches, thicker towards the bottom. */
export function makeMossTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = rng(77);
  for (let i = 0; i < 420; i++) {
    const y = S * (1 - Math.pow(rnd(), 1.8));
    const x = S * (0.5 + (rnd() - 0.5) * (0.35 + 0.65 * (y / S)));
    const r = 3 + rnd() * 12 * (0.4 + y / S);
    const g = 70 + rnd() * 50;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${40 + rnd() * 20},${g},${30 + rnd() * 15},0.85)`);
    gr.addColorStop(1, 'rgba(30,60,25,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let crackTex: THREE.CanvasTexture | null = null;
let mossTex: THREE.CanvasTexture | null = null;
export const crackTexture = (): THREE.CanvasTexture => (crackTex ??= makeCrackTexture());
export const mossTexture = (): THREE.CanvasTexture => (mossTex ??= makeMossTexture());

/** The wall stone maps with a UV window so small blocks (posts, lintels) show stone at wall scale. */
export function stoneMaterialFor(w: number, h: number): THREE.MeshStandardMaterial {
  const set = wallSet();
  const fit = (t: THREE.CanvasTexture) => {
    const c = t.clone();
    c.repeat.set(w / 2, h / 3.2);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({ map: fit(set.map), normalMap: fit(set.normalMap), roughnessMap: fit(set.roughnessMap), roughness: 1 });
}
