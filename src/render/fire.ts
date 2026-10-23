import * as THREE from 'three';

function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  // Teardrop-ish: radial gradient squashed horizontally, centred low.
  ctx.translate(32, 84);
  ctx.scale(1, 1.55);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(-32, -84, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const outerTex = gradientTexture([[0, 'rgba(255,170,60,0.95)'], [0.5, 'rgba(255,90,10,0.55)'], [1, 'rgba(120,20,0,0)']]);
const midTex = gradientTexture([[0, 'rgba(255,230,120,1)'], [0.55, 'rgba(255,160,40,0.7)'], [1, 'rgba(255,100,0,0)']]);
const coreTex = gradientTexture([[0, 'rgba(255,255,230,1)'], [0.5, 'rgba(255,240,170,0.6)'], [1, 'rgba(255,200,80,0)']]);
const emberTex = gradientTexture([[0, 'rgba(255,220,140,1)'], [0.4, 'rgba(255,120,20,0.7)'], [1, 'rgba(255,60,0,0)']]);

function sprite(tex: THREE.Texture, w: number, h: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    transparent: true,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(w, h, 1);
  return s;
}

export interface Fire {
  object: THREE.Group;
  update(t: number): void;
}

const EMBERS = 4;

/** Layered additive billboards with flicker, plus rising embers. Origin is the base of the flame. */
export function createFire(size = 1, emberCount = EMBERS): Fire {
  const object = new THREE.Group();
  const layers = [
    { s: sprite(outerTex, 0.2 * size, 0.34 * size), seed: 0, y: 0.1 },
    { s: sprite(midTex, 0.14 * size, 0.26 * size), seed: 1.7, y: 0.09 },
    { s: sprite(coreTex, 0.07 * size, 0.15 * size), seed: 3.1, y: 0.06 },
  ];
  for (const l of layers) {
    object.add(l.s);
  }
  const embers = Array.from({ length: emberCount }, (_, i) => {
    const s = sprite(emberTex, 0.025 * size, 0.04 * size);
    object.add(s);
    return { s, offset: i / emberCount, seed: Math.random() * 10 };
  });

  const base = layers.map((l) => l.s.scale.clone());

  return {
    object,
    update(t) {
      layers.forEach((l, i) => {
        const n = Math.sin(t * (11 + i * 4) + l.seed) * 0.5 + Math.sin(t * (27 + i * 7) + l.seed * 2.3) * 0.5;
        const m = Math.sin(t * (6 + i * 2) + l.seed * 1.3);
        l.s.scale.set(base[i].x * (1 + n * 0.12), base[i].y * (1 + n * 0.28), 1);
        l.s.position.set(m * 0.012 * size, l.y * size + n * 0.012 * size, 0);
        l.s.material.opacity = 0.85 + n * 0.15;
      });
      for (const e of embers) {
        const p = (t * 0.55 + e.offset) % 1;
        e.s.position.set(
          Math.sin(t * 3 + e.seed + p * 6) * 0.05 * size * p,
          (0.18 + p * 0.5) * size,
          Math.cos(t * 2.3 + e.seed) * 0.03 * size * p,
        );
        e.s.material.opacity = (1 - p) * 0.9;
        const k = 1 - p * 0.6;
        e.s.scale.set(0.025 * size * k, 0.04 * size * k, 1);
      }
    },
  };
}
