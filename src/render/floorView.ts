import * as THREE from 'three';
import { TILE, WALL_H, hasCage, type Floor } from '../sim/floorgen';
import { mulberry32, randRange } from '../sim/rng';
import { buildCage, type Cage } from './cage';
import { TorchField } from './torches';
import { floorTexture, wallTexture } from './textures';

const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6aa, roughness: 0.9, flatShading: true });
const rotMat = new THREE.MeshStandardMaterial({ color: 0x2a3322, roughness: 1, flatShading: true });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x2d2a27, roughness: 0.6, metalness: 0.6, flatShading: true });

export class FloorView {
  readonly group = new THREE.Group();
  readonly cage: Cage | null;
  private torches: TorchField;
  private gate = new THREE.Group();
  private gateOpen = 0;

  constructor(private f: Floor) {
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.tiles[y * f.w + x] === 1;
    const g = this.group;

    // Floor and ceiling: one quad per open tile (the stairs pit gets a floor too, a little lower).
    const quad = new THREE.PlaneGeometry(TILE, TILE);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 1, color: 0x8a8580 });
    let openCount = 0;
    for (let i = 0; i < f.tiles.length; i++) openCount += f.tiles[i];
    const floors = new THREE.InstancedMesh(quad, floorMat, openCount);
    const ceils = new THREE.InstancedMesh(quad, ceilMat, openCount);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!open(x, y)) continue;
        m.makeRotationX(-Math.PI / 2).setPosition((x + 0.5) * TILE, 0, (y + 0.5) * TILE);
        floors.setMatrixAt(n, m);
        m.makeRotationX(Math.PI / 2).setPosition((x + 0.5) * TILE, WALL_H, (y + 0.5) * TILE);
        ceils.setMatrixAt(n, m);
        n++;
      }
    }
    g.add(floors, ceils);

    // Walls: only tiles that touch open space are drawn. The stairs tile stays hollow.
    const stairsKey = f.stairs.ty * f.w + f.stairs.tx;
    const wallTiles: [number, number][] = [];
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (open(x, y) || y * f.w + x === stairsKey) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) { touches = true; break; }
        if (touches) wallTiles.push([x, y]);
      }
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 1 });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), wallMat, wallTiles.length);
    const rnd = mulberry32(f.seed);
    const col = new THREE.Color();
    wallTiles.forEach(([x, y], i) => {
      m.makeTranslation((x + 0.5) * TILE, WALL_H / 2, (y + 0.5) * TILE);
      walls.setMatrixAt(i, m);
      col.setScalar(0.8 + rnd() * 0.3);
      walls.setColorAt(i, col);
    });
    g.add(walls);

    this.buildStairs();
    this.torches = new TorchField(f.torches);
    g.add(this.torches.group);
    this.addDecor(rnd);

    if (hasCage(f.depth)) {
      this.cage = buildCage();
      this.cage.group.position.set(f.start.x, 0, f.start.z);
      g.add(this.cage.group);
    } else {
      this.cage = null;
    }
  }

  private buildStairs(): void {
    const { stairs: s } = this.f;
    const cx = (s.tx + 0.5) * TILE, cz = (s.ty + 0.5) * TILE;
    const holder = new THREE.Group();
    holder.position.set(cx, 0, cz);
    holder.rotation.y = Math.atan2(s.nx, s.nz); // local +Z faces into the room
    const stone = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 1 });

    // Steps descend away from the room (towards local -Z) and fade to black.
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const shade = 0.55 * (1 - i / steps) ** 1.5;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(shade * 0.7, shade * 0.62, shade * 0.52) });
      const w = TILE - 0.1, d = (TILE - 0.1) / steps;
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mat);
      top.position.set(0, -0.3 * (i + 1), TILE / 2 - d * (i + 0.5) - 0.05);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(shade * 0.3, shade * 0.27, shade * 0.22) }));
      riser.position.set(0, -0.3 * (i + 1) + 0.15, TILE / 2 - d * i - 0.05);
      holder.add(top, riser);
    }
    const voidBox = new THREE.Mesh(new THREE.BoxGeometry(TILE, 4, 0.05), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    voidBox.position.set(0, -1, -TILE / 2 + 0.03);
    holder.add(voidBox);

    // Stone frame: posts and lintel at the face of the opening.
    const post = new THREE.BoxGeometry(0.25, 2.6, 0.3);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(post, stone);
      p.position.set(sx * (TILE / 2 - 0.1), 1.3, TILE / 2 - 0.05);
      holder.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(TILE, WALL_H - 2.6, 0.5), stone);
    lintel.position.set(0, 2.6 + (WALL_H - 2.6) / 2, TILE / 2 - 0.15);
    holder.add(lintel);

    // Portcullis, raised when the way is open.
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.7, 5), ironMat);
      bar.position.set(-0.75 + i * 0.25, 1.35, 0);
      this.gate.add(bar);
    }
    for (const y of [0.4, 1.3, 2.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.05), ironMat);
      rail.position.set(0, y, 0);
      this.gate.add(rail);
    }
    this.gate.position.set(0, 0, TILE / 2 - 0.2);
    holder.add(this.gate);
    this.group.add(holder);
  }

  private addDecor(rnd: () => number): void {
    const f = this.f;
    const items: { x: number; z: number; y: number; len: number; rx: number; ry: number; rz: number }[] = [];
    const bit = (x: number, z: number, y = 0.03) =>
      items.push({ x, z, y, len: 0.15 + rnd() * 0.3, rx: (rnd() - 0.5) * 0.4, ry: rnd() * Math.PI, rz: (rnd() - 0.5) * 0.4 });
    for (const s of f.spawns) {
      if (s.kind !== 'skeleton') continue;
      for (let i = 0; i < 16; i++) bit(s.x + (rnd() - 0.5) * 1.1, s.z + (rnd() - 0.5) * 1.1, 0.03 + rnd() * 0.12);
    }
    for (let i = 0; i < 120; i++) {
      const r = f.rooms[Math.floor(rnd() * f.rooms.length)];
      bit((r.x + 0.5 + rnd() * (r.w - 1)) * TILE, (r.y + 0.5 + rnd() * (r.h - 1)) * TILE);
    }
    const bones = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.045), boneMat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    items.forEach((b, i) => {
      e.set(b.rx, b.ry, b.rz);
      q.setFromEuler(e);
      m.compose(p.set(b.x, b.y, b.z), q, sc.set(b.len, 1, 1));
      bones.setMatrixAt(i, m);
    });
    this.group.add(bones);

    // Rot stains.
    const stainGeo = new THREE.CircleGeometry(1, 9);
    const stains = new THREE.InstancedMesh(stainGeo, rotMat, 40);
    for (let i = 0; i < 40; i++) {
      const r = f.rooms[Math.floor(rnd() * f.rooms.length)];
      const s = randRange(rnd, 0.4, 1.2);
      m.compose(
        p.set((r.x + 0.5 + rnd() * (r.w - 1)) * TILE, 0.012, (r.y + 0.5 + rnd() * (r.h - 1)) * TILE),
        q.setFromEuler(e.set(-Math.PI / 2, 0, 0)),
        sc.set(s, s, 1),
      );
      stains.setMatrixAt(i, m);
    }
    this.group.add(stains);
  }

  /** 0 = sealed, 1 = open. */
  setGate(open: number): void {
    this.gateOpen = open;
    this.gate.position.y = open * 2.6;
  }

  get gateProgress(): number {
    return this.gateOpen;
  }

  update(t: number, px: number, pz: number): void {
    this.torches.update(t, px, pz);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !mesh.userData.keep) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) for (const mm of Array.isArray(mat) ? mat : [mat]) mm.dispose();
      (o as THREE.InstancedMesh).dispose?.();
    });
  }
}
