import * as THREE from 'three';
import type { Arrow, ProjectileKind } from '../sim/projectile';
import { surfaceMaterial } from './textures';

const FLIGHT_HEIGHT = 1.35;
const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd8c79a, emissive: 0x4a3418, emissiveIntensity: 0.9, roughness: 0.8 });
const tipMat = surfaceMaterial('metal', 0xa9adb3, { rough: 0.6, metalness: 0.8 });
const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6).rotateX(Math.PI / 2);
const tipGeo = new THREE.ConeGeometry(0.03, 0.12, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.45);
const fletchGeo = new THREE.BoxGeometry(0.1, 0.004, 0.1).translate(0, 0, 0.36);

function buildArrow(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(tipGeo, tipMat), new THREE.Mesh(fletchGeo, shaftMat));
  return g;
}

const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd48a, fog: false });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const coreGeo = new THREE.SphereGeometry(0.13, 12, 10);
const glowGeo = new THREE.SphereGeometry(0.22, 12, 10);

/** A ball of fire: a hot core inside an additive glow (the bloom pass does the rest). */
function buildFireball(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(glowGeo, glowMat));
  return g;
}

/** Draws the sim's missiles in flight; arrows point along -Z like everything else. */
export class ArrowView {
  private pools: Record<ProjectileKind, THREE.Group[]> = { arrow: [], fireball: [] };
  constructor(private parent: THREE.Object3D) {}

  sync(missiles: Arrow[], t: number): void {
    const used: Record<ProjectileKind, number> = { arrow: 0, fireball: 0 };
    for (const m of missiles) {
      const pool = this.pools[m.kind];
      let g = pool[used[m.kind]];
      if (!g) {
        g = m.kind === 'arrow' ? buildArrow() : buildFireball();
        this.parent.add(g);
        pool.push(g);
      }
      used[m.kind]++;
      g.visible = true;
      g.position.set(m.x, FLIGHT_HEIGHT, m.z);
      if (m.kind === 'arrow') g.rotation.y = Math.atan2(-m.vx, -m.vz);
      else g.scale.setScalar(1 + Math.sin(t * 30 + m.x * 7) * 0.12);
    }
    for (const kind of ['arrow', 'fireball'] as const) this.pools[kind].forEach((g, i) => { if (i >= used[kind]) g.visible = false; });
  }
}
