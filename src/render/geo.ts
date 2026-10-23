import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A box with softened edges so lighting catches them; radius scales with the thinnest side. */
export function roundedBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(0.03, Math.min(w, h, d) * 0.3);
  return new RoundedBoxGeometry(w, h, d, 2, r);
}
