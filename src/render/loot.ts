import * as THREE from 'three';
import type { Drop } from '../sim/loot';
import { RARITY_COLOR, rarityIndex } from '../sim/items';

const coinMat = new THREE.MeshStandardMaterial({ color: 0xe2b93b, roughness: 0.3, metalness: 0.9, emissive: 0x6a4a00, emissiveIntensity: 0.5 });
const flaskGeo = new THREE.LatheGeometry(
  [[0.001, 0], [0.085, 0.01], [0.115, 0.06], [0.115, 0.14], [0.07, 0.22], [0.04, 0.27], [0.042, 0.34], [0.001, 0.34]].map(([x, y]) => new THREE.Vector2(x, y)),
  16,
);

function beam(color: string): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  m.position.y = 1.1;
  return m;
}

function buildDrop(d: Drop): THREE.Group {
  const g = new THREE.Group();
  if (d.gold !== undefined) {
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 18), coinMat);
      c.position.set((i % 2) * 0.12 - 0.06, 0.03 + i * 0.03, (i >> 1) * 0.1 - 0.05);
      c.rotation.z = (i - 1.5) * 0.15;
      g.add(c);
    }
    g.add(beam('#e2b93b'));
    (g.children[g.children.length - 1] as THREE.Mesh).scale.set(0.5, 0.6, 0.5);
  } else if (d.heal !== undefined) {
    const glass = new THREE.MeshStandardMaterial({ color: 0xc02a2a, emissive: 0x801010, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1 });
    const flask = new THREE.Mesh(flaskGeo, glass);
    flask.position.y = 0.16;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 }));
    neck.position.y = 0.52;
    const grp = new THREE.Group();
    grp.name = 'gem';
    grp.add(flask, neck);
    grp.position.y = 0;
    g.add(grp);
    g.add(beam('#d83a3a'));
  } else if (d.item) {
    const color = RARITY_COLOR[d.item.rarity];
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.3, flatShading: true }),
    );
    gem.scale.set(0.8, 1.35, 0.8);
    gem.position.y = 0.45;
    gem.name = 'gem';
    g.add(gem);
    if (rarityIndex(d.item.rarity) >= 1) g.add(beam(color));
  }
  return g;
}

/** Keeps meshes in sync with the sim's list of ground pickups. */
export class LootView {
  private views = new Map<number, THREE.Group>();
  constructor(private scene: THREE.Scene) {}

  sync(drops: Drop[]): void {
    const live = new Set<number>();
    for (const d of drops) {
      live.add(d.id);
      if (!this.views.has(d.id)) {
        const g = buildDrop(d);
        g.position.set(d.x, 0, d.z);
        this.scene.add(g);
        this.views.set(d.id, g);
      }
    }
    for (const [id, g] of this.views) {
      if (!live.has(id)) {
        this.scene.remove(g);
        this.views.delete(id);
      }
    }
  }

  clear(): void {
    this.sync([]);
  }

  update(t: number): void {
    for (const g of this.views.values()) {
      const gem = g.getObjectByName('gem');
      if (gem) {
        gem.rotation.y = t * 1.8;
        const base = gem.type === 'Group' ? 0.1 : 0.45;
        gem.position.y = base + Math.sin(t * 2.4 + g.position.x) * 0.06;
      } else {
        g.rotation.y = t * 0.8;
      }
    }
  }
}
