import * as THREE from 'three';
import { TILE, WALL_H, type Floor } from '../sim/floorgen';
import { mulberry32 } from '../sim/rng';
import { crackTexture, mossTexture, stoneMaterialFor } from './textures';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let postMat: THREE.MeshStandardMaterial | null = null;
let lintelMat: THREE.MeshStandardMaterial | null = null;
let braceMat: THREE.MeshStandardMaterial | null = null;

function decalMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/**
 * Wall dressing: stone arches where corridors enter rooms, plus crack and moss decals on wall faces.
 * Everything is seeded from the floor so it stays the same between visits.
 */
export function buildDecor(f: Floor): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(f.seed ^ 0x51ed);
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.tiles[y * f.w + x] === 1;
  const inRoom = (x: number, y: number) => f.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  // Wall faces that look into open space.
  const faces: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (open(x, y)) continue;
      for (const [dx, dy] of DIRS) if (open(x + dx, y + dy)) faces.push({ x: (x + 0.5) * TILE + dx * (TILE / 2), z: (y + 0.5) * TILE + dy * (TILE / 2), nx: dx, nz: dy });
    }
  }

  const decals = (tex: THREE.Texture, chance: number, size: [number, number], yRange: [number, number]) => {
    const picked = faces.filter(() => rnd() < chance);
    if (!picked.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), decalMaterial(tex), picked.length);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    picked.forEach((fc, i) => {
      const w = size[0] + rnd() * (size[1] - size[0]);
      const h = w * (0.9 + rnd() * 0.6);
      const y = yRange[0] + rnd() * (yRange[1] - yRange[0]);
      const side = (rnd() - 0.5) * (TILE - w * 0.6);
      // Slide along the face tangent (perpendicular to the normal in the floor plane).
      p.set(fc.x + -fc.nz * side + fc.nx * 0.012, y, fc.z + fc.nx * side + fc.nz * 0.012);
      q.setFromEuler(e.set(0, Math.atan2(fc.nx, fc.nz), (rnd() - 0.5) * 0.4));
      m.compose(p, q, sc.set(w, h, 1));
      mesh.setMatrixAt(i, m);
    });
    g.add(mesh);
  };
  decals(crackTexture(), 0.09, [0.9, 1.7], [1.2, 2.4]);
  decals(mossTexture(), 0.07, [1.0, 1.8], [0.5, 1.1]);

  // Arches: a corridor tile walled on both sides that opens straight into a room.
  postMat ??= stoneMaterialFor(0.34, 2.5);
  lintelMat ??= stoneMaterialFor(TILE, 0.7);
  braceMat ??= stoneMaterialFor(0.5, 0.5);
  const postGeo = new THREE.BoxGeometry(0.34, 2.5, 0.5);
  const lintelGeo = new THREE.BoxGeometry(TILE + 0.1, WALL_H - 2.5, 0.5);
  const braceGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const arches: { x: number; z: number; rot: number }[] = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (!open(x, y) || inRoom(x, y)) continue;
      for (const [dx, dy] of DIRS) {
        if (!inRoom(x + dx, y + dy) || open(x + dy, y + dx) || open(x - dy, y - dx)) continue;
        arches.push({ x: (x + 0.5) * TILE + dx * (TILE / 2), z: (y + 0.5) * TILE + dy * (TILE / 2), rot: Math.atan2(dx, dy) });
      }
    }
  }
  if (arches.length) {
    // One instanced mesh per piece type: [geometry, material, local x, local y, local roll].
    const pieces: [THREE.BufferGeometry, THREE.Material, number, number, number][] = [
      [postGeo, postMat, -(TILE / 2 - 0.15), 1.25, 0], [postGeo, postMat, TILE / 2 - 0.15, 1.25, 0],
      [lintelGeo, lintelMat, 0, 2.5 + (WALL_H - 2.5) / 2, 0],
      [braceGeo, braceMat, -(TILE / 2 - 0.45), 2.3, Math.PI / 4], [braceGeo, braceMat, TILE / 2 - 0.45, 2.3, Math.PI / 4],
    ];
    const byGeo = new Map<THREE.BufferGeometry, THREE.InstancedMesh>();
    const counts = new Map<THREE.BufferGeometry, number>();
    for (const [geo] of pieces) counts.set(geo, (counts.get(geo) ?? 0) + arches.length);
    for (const [geo, mat] of pieces) {
      if (byGeo.has(geo)) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, counts.get(geo)!);
      mesh.castShadow = mesh.receiveShadow = true;
      byGeo.set(geo, mesh);
      counts.set(geo, 0);
    }
    const anchor = new THREE.Object3D(), local = new THREE.Object3D();
    anchor.add(local);
    for (const a of arches) {
      anchor.position.set(a.x, 0, a.z);
      anchor.rotation.y = a.rot;
      for (const [geo, , px, py, rz] of pieces) {
        local.position.set(px, py, 0);
        local.rotation.z = rz;
        anchor.updateMatrixWorld(true);
        const i = counts.get(geo)!;
        byGeo.get(geo)!.setMatrixAt(i, local.matrixWorld);
        counts.set(geo, i + 1);
      }
    }
    for (const mesh of byGeo.values()) { mesh.computeBoundingSphere(); g.add(mesh); }
  }
  return g;
}
