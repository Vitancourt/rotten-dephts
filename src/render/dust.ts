import * as THREE from 'three';

const COUNT = 140;
const R = 7; // half-size of the box of air around the camera

/** Slow drifting motes in the torchlight. Stored in world space, wrapped around the camera. */
export function createDust(): { points: THREE.Points; update: (t: number, cx: number, cz: number) => void } {
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT * 3; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.022, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const wrap = (v: number, c: number) => c + ((((v - c + R) % (2 * R)) + 2 * R) % (2 * R)) - R;
  return {
    points,
    update(t, cx, cz) {
      for (let i = 0; i < COUNT; i++) {
        const sx = seed[i * 3] * 2 * R * 4, sy = seed[i * 3 + 1], sz = seed[i * 3 + 2] * 2 * R * 4;
        pos[i * 3] = wrap(sx + Math.sin(t * 0.15 + sy * 9) * 0.6, cx);
        pos[i * 3 + 1] = 0.3 + sy * 2.6 + Math.sin(t * 0.3 + sx) * 0.15;
        pos[i * 3 + 2] = wrap(sz + Math.cos(t * 0.13 + sy * 7) * 0.6, cz);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
