import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MerchantSpot } from '../sim/floorgen';
import { createFire, type Fire } from './fire';
import { roundedBox } from './geo';
import { surfaceMaterial } from './textures';

/** Merges loose parts into one mesh per material (same idea as the enemy rigs). */
function fuse(...ms: THREE.Mesh[]): THREE.Mesh[] {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of ms) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    m.geometry.dispose();
    by.set(m.material as THREE.Material, [...(by.get(m.material as THREE.Material) ?? []), g]);
  }
  return [...by].map(([mat, gs]) => new THREE.Mesh(mergeGeometries(gs, false), mat));
}


const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

export const MERCHANT_RADIUS = 0.55;

export class MerchantView {
  readonly group = new THREE.Group();
  private head = new THREE.Group();
  private fire: Fire;
  private baseYaw: number;
  private phase = Math.random() * 10;

  /** A hooded trader with a heavy pack and a lantern, standing beside a crate of wares. Faces -Z locally. */
  constructor(spot: MerchantSpot) {
    const robe = surfaceMaterial('cloth', 0x5b3a2e);
    const trim = surfaceMaterial('leather', 0x2d2018);
    const skin = surfaceMaterial('leather', 0x8a6a52);
    const wood = surfaceMaterial('wood', 0x5b4128);
    const iron = surfaceMaterial('metal', 0x3a3632, { metalness: 0.7, rough: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xc02a2a, emissive: 0x801010, emissiveIntensity: 0.7, roughness: 0.2 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0b0806 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

    const body = fuse(
      part(new THREE.CylinderGeometry(0.2, 0.36, 1.2, 14), robe, 0, 0.6, 0),
      part(new THREE.SphereGeometry(0.22, 12, 10), robe, 0, 1.25, 0, 1.25, 0.7, 0.95),
      part(new THREE.CylinderGeometry(0.205, 0.215, 0.07, 14), trim, 0, 0.95, 0),
      part(new THREE.BoxGeometry(0.05, 0.9, 0.02), trim, 0, 0.62, -0.28),
      part(new THREE.BoxGeometry(0.4, 0.5, 0.24), trim, 0, 1.05, 0.3), // pack
      part(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10).rotateZ(Math.PI / 2), wood, 0, 1.38, 0.3), // bedroll
      part(new THREE.CapsuleGeometry(0.05, 0.4, 4, 8).rotateX(Math.PI / 2.4), robe, -0.24, 1.1, -0.2), // left arm, forward
      part(new THREE.CapsuleGeometry(0.05, 0.4, 4, 8).rotateX(Math.PI / 2.4), robe, 0.24, 1.1, -0.2),
      part(new THREE.SphereGeometry(0.055, 8, 8), skin, -0.24, 1.0, -0.42), part(new THREE.SphereGeometry(0.055, 8, 8), skin, 0.24, 1.0, -0.42),
    );
    this.group.add(...body);

    // Hood and shadowed face; the head group turns to watch the player.
    this.head.position.set(0, 1.5, 0);
    this.head.add(...fuse(
      part(new THREE.SphereGeometry(0.2, 14, 12), robe, 0, 0, 0, 1, 1.1, 1.05),
      part(new THREE.ConeGeometry(0.17, 0.3, 12), robe, 0, 0.17, 0.08, 1, 1, 1),
    ));
    this.head.add(part(new THREE.SphereGeometry(0.13, 10, 8), dark, 0, -0.01, -0.11, 1, 1.05, 0.8));
    this.head.add(part(new THREE.SphereGeometry(0.012, 6, 6), glow, -0.045, 0.0, -0.205), part(new THREE.SphereGeometry(0.012, 6, 6), glow, 0.045, 0.0, -0.205));
    this.group.add(this.head);

    // Lantern in the left hand.
    const lantern = new THREE.Group();
    lantern.position.set(-0.28, 0.82, -0.42);
    lantern.add(...fuse(part(roundedBox(0.09, 0.12, 0.09), iron, 0, 0, 0), part(new THREE.ConeGeometry(0.06, 0.05, 6), iron, 0, 0.085, 0)));
    lantern.add(part(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xffc877 }), 0, 0, 0));
    this.fire = createFire(0.6, 0);
    this.fire.object.position.set(0, -0.03, 0);
    lantern.add(this.fire.object);
    this.group.add(lantern);

    // A crate of wares beside him.
    const crate = new THREE.Group();
    crate.position.set(0.85, 0, -0.1);
    crate.rotation.y = -0.4;
    crate.add(...fuse(
      part(roundedBox(0.7, 0.45, 0.5), wood, 0, 0.225, 0),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), glass, -0.2, 0.55, 0.05), part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), glass, -0.05, 0.55, -0.08),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), glass, 0.1, 0.55, 0.06),
      part(roundedBox(0.2, 0.14, 0.14), trim, 0.24, 0.52, -0.05),
    ));
    this.group.add(crate);

    this.group.position.set(spot.x, 0, spot.z);
    this.baseYaw = Math.atan2(-spot.nx, -spot.nz);
    this.group.rotation.y = this.baseYaw;
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material instanceof THREE.MeshBasicMaterial)) m.castShadow = m.receiveShadow = true; });
  }

  update(t: number, px: number, pz: number): void {
    this.fire.update(t + this.phase);
    this.group.position.y = Math.sin(t * 1.4 + this.phase) * 0.008;
    // Turn the head (not the body) towards a nearby player.
    const dx = px - this.group.position.x, dz = pz - this.group.position.z;
    const near = dx * dx + dz * dz < 36;
    const want = near ? Math.atan2(-dx, -dz) - this.baseYaw : 0;
    const diff = Math.atan2(Math.sin(want), Math.cos(want));
    const target = Math.max(-1.1, Math.min(1.1, diff));
    this.head.rotation.y += (target - this.head.rotation.y) * 0.08;
  }
}
