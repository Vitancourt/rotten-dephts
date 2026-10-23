import * as THREE from 'three';
import { createFire, type Fire } from './fire';
import { surfaceMaterial } from './textures';
import type { TorchSpot } from '../sim/floorgen';

const woodMat = surfaceMaterial('wood', 0x4b3622);
const charMat = surfaceMaterial('wood', 0x1a120c);
const ironMat = surfaceMaterial('metal', 0x3a3632, { rough: 0.8, metalness: 0.7 });
const stickGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10);
const headGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.12, 10);
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
    // Bracket, stick and head are static: one instanced mesh per part for the whole floor.
    const bodies = [
      { geo: bracketGeo, mat: ironMat, at: (o: THREE.Object3D) => o.position.set(0, 0, 0), rx: 0 },
      { geo: stickGeo, mat: woodMat, at: (o: THREE.Object3D) => o.position.set(0, 0.2, 0.08), rx: 0.35 },
      { geo: headGeo, mat: charMat, at: (o: THREE.Object3D) => o.position.set(0, 0.44, 0.17), rx: 0.35 },
    ].map((b) => ({ ...b, mesh: new THREE.InstancedMesh(b.geo, b.mat, spots.length) }));
    const anchor = new THREE.Object3D(), local = new THREE.Object3D();
    anchor.add(local);
    spots.forEach((s, i) => {
      anchor.position.set(s.x, 1.8, s.z);
      anchor.rotation.y = Math.atan2(s.nx, s.nz); // local +Z points into the room
      for (const b of bodies) {
        b.at(local);
        local.rotation.x = b.rx;
        anchor.updateMatrixWorld(true);
        b.mesh.setMatrixAt(i, local.matrixWorld);
      }
      const g = new THREE.Group();
      g.position.copy(anchor.position);
      g.rotation.y = anchor.rotation.y;
      const fire = createFire(1, 0);
      fire.object.position.set(0, 0.5, 0.2);
      g.add(fire.object);
      this.group.add(g);
      this.walls.push({ fire, x: s.x + s.nx * 0.2, z: s.z + s.nz * 0.2, y: 2.4, phase: Math.random() * 100, group: g });
    });
    for (const b of bodies) {
      b.mesh.computeBoundingSphere();
      b.mesh.userData.keep = true; // geometry is module-level and shared across floors
      this.group.add(b.mesh);
    }
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xffb070, 0, 15, 1.5);
      this.lights.push(l);
      this.group.add(l);
    }
    this.order = [...this.walls];
  }

  update(t: number, px: number, pz: number): void {
    const d2 = (w: Wall) => (w.x - px) ** 2 + (w.z - pz) ** 2;
    this.order.sort((a, b) => d2(a) - d2(b));
    for (const w of this.walls) {
      const near = d2(w) < 26 * 26;
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
      l.intensity = 7 * (1 + n * 0.08);
    });
  }
}
