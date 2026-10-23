import * as THREE from 'three';
import { createFire, type Fire } from './fire';
import type { TorchSpot } from '../sim/floorgen';

const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 1, flatShading: true });
const charMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, flatShading: true });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.6 });
const stickGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6);
const headGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.12, 6);
const bracketGeo = new THREE.BoxGeometry(0.1, 0.05, 0.16);

interface Wall { fire: Fire; x: number; z: number; y: number; phase: number; group: THREE.Group }

/**
 * Wall torches look lit everywhere, but only the few nearest the camera cast real light.
 * That keeps the shader's light count fixed (no recompiles) and cheap.
 */
export class TorchField {
  readonly group = new THREE.Group();
  private walls: Wall[] = [];
  private lights: THREE.PointLight[] = [];
  private order: Wall[] = [];

  constructor(spots: TorchSpot[], lightCount = 6) {
    for (const s of spots) {
      const g = new THREE.Group();
      g.position.set(s.x, 1.8, s.z);
      g.rotation.y = Math.atan2(s.nx, s.nz); // local +Z points into the room
      const bracket = new THREE.Mesh(bracketGeo, ironMat);
      const stick = new THREE.Mesh(stickGeo, woodMat);
      stick.rotation.x = 0.35;
      stick.position.set(0, 0.2, 0.08);
      const head = new THREE.Mesh(headGeo, charMat);
      head.rotation.x = 0.35;
      head.position.set(0, 0.44, 0.17);
      const fire = createFire();
      fire.object.position.set(0, 0.5, 0.2);
      g.add(bracket, stick, head, fire.object);
      this.group.add(g);
      this.walls.push({ fire, x: s.x + s.nx * 0.2, z: s.z + s.nz * 0.2, y: 2.4, phase: Math.random() * 100, group: g });
    }
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xff9a4d, 0, 15, 1.5);
      this.lights.push(l);
      this.group.add(l);
    }
    this.order = [...this.walls];
  }

  update(t: number, px: number, pz: number): void {
    const d2 = (w: Wall) => (w.x - px) ** 2 + (w.z - pz) ** 2;
    this.order.sort((a, b) => d2(a) - d2(b));
    for (const w of this.walls) {
      const near = d2(w) < 35 * 35;
      w.group.visible = near;
      if (near) w.fire.update(t + w.phase);
    }
    this.lights.forEach((l, i) => {
      const w = this.order[i];
      if (!w || d2(w) > 22 * 22) {
        l.intensity = 0;
        return;
      }
      l.position.set(w.x, w.y, w.z);
      const n = Math.sin((t + w.phase) * 9) * 0.5 + Math.sin((t + w.phase) * 23) * 0.5;
      l.intensity = 11 * (1 + n * 0.08);
    });
  }
}
