import * as THREE from 'three';
import { RARITY_COLOR, rarityIndex, type Item } from '../sim/items';
import { roundedBox } from './geo';
import { surfaceMaterial } from './textures';

const steel = surfaceMaterial('metal', 0x9aa1aa, { rough: 0.7, metalness: 0.85 });
const wood = surfaceMaterial('wood', 0x6a4a2c);
const leather = surfaceMaterial('leather', 0x3a281c);

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(roundedBox(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Held weapon model, grip at the origin, pointing +Y. Not used for the torch (see scene.ts). */
export function buildWeaponMesh(item: Item): THREE.Group {
  const g = new THREE.Group();
  // Rare+ weapons glow faintly in their rarity colour.
  const blade = steel.clone();
  if (rarityIndex(item.rarity) >= 2) {
    blade.emissive = new THREE.Color(RARITY_COLOR[item.rarity]);
    blade.emissiveIntensity = 0.12;
  }
  switch (item.base) {
    case 'Dagger':
      g.add(box(0.035, 0.14, 0.035, leather, 0, 0.07, 0), box(0.12, 0.025, 0.04, steel, 0, 0.15, 0), box(0.05, 0.34, 0.015, blade, 0, 0.33, 0));
      break;
    case 'Shortsword':
      g.add(box(0.04, 0.2, 0.04, leather, 0, 0.1, 0), box(0.22, 0.04, 0.06, steel, 0, 0.22, 0), box(0.07, 0.7, 0.018, blade, 0, 0.59, 0));
      break;
    case 'Mace':
      g.add(box(0.05, 0.65, 0.05, wood, 0, 0.32, 0), box(0.2, 0.2, 0.2, blade, 0, 0.74, 0), box(0.06, 0.06, 0.32, steel, 0, 0.74, 0), box(0.32, 0.06, 0.06, steel, 0, 0.74, 0));
      break;
    case 'Battle Axe':
      g.add(box(0.05, 0.85, 0.05, wood, 0, 0.42, 0), box(0.04, 0.3, 0.3, blade, 0, 0.72, -0.15), box(0.06, 0.1, 0.07, steel, 0, 0.88, 0));
      break;
    default:
      g.add(box(0.05, 0.5, 0.05, wood, 0, 0.25, 0));
  }
  g.scale.setScalar(0.8);
  return g;
}

const woodShield = surfaceMaterial('wood', 0x6a4a2c);

/**
 * A shield held in the left hand. Centred on the origin; its face points away from the player (-Z)
 * so the camera sees the back of it. Rare+ shields get a glowing rim.
 */
export function buildShieldMesh(item: Item): THREE.Group {
  const g = new THREE.Group();
  const rim = steel.clone();
  if (rarityIndex(item.rarity) >= 1) {
    rim.emissive = new THREE.Color(RARITY_COLOR[item.rarity]);
    rim.emissiveIntensity = rarityIndex(item.rarity) >= 2 ? 0.3 : 0.12;
  }
  const disc = (r: number) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 18), woodShield);
    body.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 22), rim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), rim);
    boss.position.z = -0.04;
    g.add(body, ring, boss);
  };
  const slab = (w: number, h: number) => {
    g.add(box(w, h, 0.05, woodShield), box(w + 0.04, 0.04, 0.07, rim, 0, h / 2), box(w + 0.04, 0.04, 0.07, rim, 0, -h / 2),
      box(0.04, h, 0.07, rim, -w / 2), box(0.04, h, 0.07, rim, w / 2), box(0.12, 0.12, 0.05, rim, 0, 0.04, -0.04));
  };
  switch (item.base) {
    case 'Buckler': disc(0.19); break;
    case 'Round Shield': disc(0.29); break;
    case 'Kite Shield': slab(0.4, 0.62); break;
    default: slab(0.52, 0.82); // Tower Shield
  }
  return g;
}
