import * as THREE from 'three';
import { CAGE } from '../sim/intro';

const iron = new THREE.MeshStandardMaterial({ color: 0x2d2a27, roughness: 0.7, metalness: 0.6, flatShading: true });
const rust = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 1, flatShading: true });

const H = 2.3;
const BAR = 0.025;

function bar(x: number, z: number, mat = iron): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(BAR, BAR, H, 5), mat);
  m.position.set(x, H / 2, z);
  return m;
}

function rail(len: number, y: number, along: 'x' | 'z'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.06, 0.06, along === 'z' ? len : 0.06), rust);
  m.position.y = y;
  return m;
}

export interface Cage {
  group: THREE.Group;
  setOpen(t: number): void;
}

export function buildCage(): Cage {
  const group = new THREE.Group();
  const w = CAGE.maxX - CAGE.minX;
  const d = CAGE.maxZ - CAGE.minZ;
  const cx = (CAGE.minX + CAGE.maxX) / 2;
  const cz = (CAGE.minZ + CAGE.maxZ) / 2;

  // Fixed sides: west, east, south.
  for (let i = 0; i <= 12; i++) {
    const z = CAGE.minZ + (d * i) / 12;
    group.add(bar(CAGE.minX, z), bar(CAGE.maxX, z));
  }
  for (let i = 1; i < 12; i++) group.add(bar(CAGE.minX + (w * i) / 12, CAGE.maxZ));
  for (const y of [0.05, 1.1, H - 0.03]) {
    const west = rail(d, y, 'z'); west.position.set(CAGE.minX, y, cz);
    const east = rail(d, y, 'z'); east.position.set(CAGE.maxX, y, cz);
    const south = rail(w, y, 'x'); south.position.set(cx, y, CAGE.maxZ);
    group.add(west, east, south);
  }
  // Roof bars.
  for (let i = 0; i <= 6; i++) {
    const r = rail(d, H, 'z');
    r.position.set(CAGE.minX + (w * i) / 6, H, cz);
    group.add(r);
  }

  // Gate on the north side, hinged at its west edge.
  const gate = new THREE.Group();
  gate.position.set(CAGE.minX, 0, CAGE.minZ);
  for (let i = 0; i <= 12; i++) {
    const b = bar((w * i) / 12, 0);
    gate.add(b);
  }
  for (const y of [0.05, 1.1, H - 0.03]) {
    const r = rail(w, y, 'x');
    r.position.set(w / 2, y, 0);
    gate.add(r);
  }
  group.add(gate);

  return {
    group,
    setOpen(t) {
      const e = 1 - (1 - t) * (1 - t);
      gate.rotation.y = e * 1.75; // swings outward (towards -Z)
    },
  };
}
