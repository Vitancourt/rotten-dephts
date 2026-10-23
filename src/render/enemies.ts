import * as THREE from 'three';
import { ENEMY_DEFS, type Enemy, type EnemyKind } from '../sim/enemy';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox } from './geo';
import { surfaceMaterial, type SurfaceKind } from './textures';

export interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  /** Archers: the arrow shown nocked while they draw. */
  nock?: THREE.Object3D;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(roundedBox(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function pivot(x: number, y: number, z: number, ...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(...kids);
  return g;
}

const eyeGreen = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
const eyeAmber = new THREE.MeshBasicMaterial({ color: 0xff8a1a });

const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
const cap = (r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sz = 1) => part(new THREE.CapsuleGeometry(r, len, 4, 10), mat, x, y, z, sx, 1, sz);
const ball = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => part(new THREE.SphereGeometry(r, 12, 10), mat, x, y, z, sx, sy, sz);

/** A curved rib: an open torus arc whose gap faces the front (-Z), baked into place at height y. */
function rib(y: number, r: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.TorusGeometry(r, 0.013, 6, 16, 4.4);
  geo.scale(1, 0.8, 1);
  geo.rotateZ(5.65);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, mat);
}

/**
 * Bakes small parts into one mesh per material, so a limb or torso costs a draw call or two
 * instead of one per part. Parts keep their own position/scale/rotation.
 */
function fuse(...ms: THREE.Mesh[]): THREE.Mesh[] {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of ms) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    m.geometry.dispose();
    const mat = m.material as THREE.Material;
    by.set(mat, [...(by.get(mat) ?? []), g]);
  }
  return [...by].map(([mat, gs]) => new THREE.Mesh(mergeGeometries(gs, false), mat));
}

/** Model faces -Z with feet at y = 0. */
/** `gear` gives skeletons their shield and axe; bosses carry their own weapons. */
export function buildRig(kind: EnemyKind, gear = true): Rig {
  const skeleton = kind !== 'zombie';
  const archer = kind === 'archer';
  const mage = kind === 'mage';
  const mk = (surface: SurfaceKind, color: number, metalness = 0) => surfaceMaterial(surface, color, { rough: 0.95, metalness });
  const bone = mk(skeleton ? 'bone' : 'leather', archer ? 0xb9b092 : mage ? 0xaaa68c : skeleton ? 0x9c9a62 : 0x5e6f4b);
  const cloth = mk('cloth', skeleton ? 0x6e6552 : 0x2f382b);
  const dark = mk('leather', skeleton ? 0x2a2620 : 0x4d5a3d);
  const mats = [bone, cloth, dark];
  const s = skeleton ? 1 : 1.12;
  const eyeMat = archer ? eyeAmber : skeleton ? eyeGreen : eyeRed;
  let nock: THREE.Object3D | undefined;

  const body = new THREE.Group();
  let legL: THREE.Group, legR: THREE.Group, armL: THREE.Group, armR: THREE.Group;
  const parts: THREE.Object3D[] = [];

  if (skeleton) {
    const leg = (x: number) => pivot(x, 0.85, 0, ...fuse(cap(0.045, 0.32, bone, 0, -0.22), ball(0.052, bone, 0, -0.42), cap(0.034, 0.3, bone, 0, -0.62), box(0.08, 0.04, 0.17, bone, 0, -0.82, -0.04)));
    legL = leg(-0.13);
    legR = leg(0.13);
    const arm = (x: number) => pivot(x, 1.42, 0, ...fuse(ball(0.05, bone), cap(0.03, 0.22, bone, 0, -0.18), ball(0.036, bone, 0, -0.34), cap(0.025, 0.2, bone, 0, -0.47), ball(0.036, bone, 0, -0.62)));
    armL = arm(-0.28);
    armR = arm(0.28);
    parts.push(...fuse(
      ball(0.13, bone, 0, 0.9, 0, 1.3, 0.6, 0.85),
      ...[-0.15, -0.09, -0.03, 0.03, 0.09, 0.15].map((x, i) => part(new THREE.ConeGeometry(0.017, 0.14 + (i % 3) * 0.05, 5).rotateX(Math.PI), bone, x, 0.76 - (i % 3) * 0.02, -0.02 + Math.abs(x) * -0.2)),
      cap(0.024, 0.45, bone, 0, 1.17, 0.05),
      part(new THREE.CylinderGeometry(0.115, 0.13, 0.46, 12), dark, 0, 1.22, 0.01),
      rib(1.38, 0.15, bone), rib(1.3, 0.16, bone), rib(1.22, 0.165, bone), rib(1.14, 0.155, bone), rib(1.06, 0.14, bone),
      box(0.035, 0.34, 0.025, bone, 0, 1.22, -0.13),
      part(new THREE.CylinderGeometry(0.028, 0.03, 0.1, 8), bone, 0, 1.52),
      ball(0.12, bone, 0, 1.66, 0, 1, 1.1, 1.05),
      box(0.14, 0.05, 0.11, bone, 0, 1.55, -0.04),
      ball(0.034, dark, -0.05, 1.68, -0.1), ball(0.034, dark, 0.05, 1.68, -0.1),
      ball(0.016, eyeMat, -0.05, 1.68, -0.118), ball(0.016, eyeMat, 0.05, 1.68, -0.118),
      box(0.03, 0.04, 0.02, dark, 0, 1.63, -0.12),
    ));
    if (gear && !archer && !mage) {
      // Notched axe in the right hand, spiked slab of a shield on the left forearm.
      const haft = mk('wood', 0x4a3622);
      const iron = mk('metal', 0x6f6a5c, 0.6);
      armR.add(...fuse(box(0.035, 0.8, 0.035, haft, 0, -0.78, -0.03), box(0.03, 0.2, 0.17, iron, 0, -1.12, -0.12), box(0.04, 0.06, 0.05, iron, 0, -1.2, 0.0)));
      const slab = mk('wood', 0x3c342c);
      const spikes: THREE.Mesh[] = [box(0.05, 0.78, 0.3, slab, -0.11, -0.42, -0.05)];
      for (let i = 0; i < 4; i++) spikes.push(part(new THREE.ConeGeometry(0.04, 0.2, 5), iron, -0.2, -0.12 - i * 0.18, -0.12 + (i % 2) * 0.1, 1, 1, 1));
      spikes.forEach((m, i) => { if (i) m.rotation.z = Math.PI / 2; });
      armL.add(...fuse(...spikes));
    }
    if (archer) {
      // Scavenged plate, a tattered cloak, a quiver, and a recurve bow in the left hand.
      const plate = mk('metal', 0x5c6168, 0.7);
      const capeMat = mk('cloth', 0x4c5864);
      const wood = mk('wood', 0x6b3f22);
      const fletch = mk('cloth', 0xc9c0a0);
      mats.push(plate, capeMat);
      const front = new THREE.CylinderGeometry(0.19, 0.16, 0.34, 12, 1, true, Math.PI / 2, Math.PI);
      parts.push(...fuse(
        part(front, plate, 0, 1.24, 0),
        ball(0.085, plate, -0.27, 1.47, 0, 1.25, 0.7, 1.1), ball(0.085, plate, 0.27, 1.47, 0, 1.25, 0.7, 1.1),
        ball(0.085, plate, -0.28, 1.4, 0, 1.2, 0.55, 1.05), ball(0.085, plate, 0.28, 1.4, 0, 1.2, 0.55, 1.05),
        box(0.1, 0.17, 0.02, plate, -0.1, 0.8, -0.13), box(0.1, 0.17, 0.02, plate, 0.1, 0.8, -0.13),
        box(0.4, 0.6, 0.02, capeMat, 0.04, 1.2, 0.17), box(0.12, 0.3, 0.02, capeMat, 0.2, 0.78, 0.17), box(0.1, 0.22, 0.02, capeMat, -0.12, 0.8, 0.17),
        part(new THREE.CylinderGeometry(0.05, 0.045, 0.4, 8), dark, 0.1, 1.34, 0.2),
        part(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), wood, 0.08, 1.6, 0.2), part(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), wood, 0.12, 1.6, 0.19),
        part(new THREE.BoxGeometry(0.03, 0.06, 0.01), fletch, 0.08, 1.7, 0.2), part(new THREE.BoxGeometry(0.03, 0.06, 0.01), fletch, 0.12, 1.69, 0.19),
      ));
      for (const leg of [legL, legR]) leg.add(...fuse(part(new THREE.CylinderGeometry(0.052, 0.046, 0.3, 8), plate, 0, -0.62), ball(0.058, plate, 0, -0.42, 0.02)));
      armR.add(...fuse(part(new THREE.CylinderGeometry(0.036, 0.034, 0.14, 8), plate, 0, -0.5)));
      // Bow: limbs curve back towards the archer, string between the tips; the vertical axis is the arm's local Z.
      const pts = Array.from({ length: 9 }, (_, i) => { const z = (i / 4 - 1) * 0.5; return new THREE.Vector3(0, -0.62 + 0.16 * (z / 0.5) ** 2, z); });
      const stringGeo = new THREE.CylinderGeometry(0.004, 0.004, 1.0, 4).rotateX(Math.PI / 2).translate(0, -0.46, 0);
      armL.add(...fuse(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.014, 5), wood), new THREE.Mesh(stringGeo, fletch)));
      const arrow = new THREE.Group();
      arrow.add(...fuse(
        part(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 5), wood, 0, -0.81, 0),
        part(new THREE.ConeGeometry(0.02, 0.07, 5).rotateX(Math.PI), plate, 0, -1.2, 0),
        part(new THREE.BoxGeometry(0.03, 0.06, 0.004), fletch, 0, -0.48, 0), part(new THREE.BoxGeometry(0.004, 0.06, 0.03), fletch, 0, -0.48, 0),
      ));
      arrow.visible = false;
      armL.add(arrow);
      nock = arrow;
    }
    if (mage) {
      // Hooded, tattered violet robes; a spiked staff in the right hand; a ball of fire gathered in the left.
      const robe = mk('cloth', 0x3b2a55);
      const trim = mk('cloth', 0x24182f);
      const wood = mk('wood', 0x2a2420);
      const iron = mk('metal', 0x5a5650, 0.6);
      mats.push(robe, trim);
      const tatters = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const len = 0.24 + ((i * 37) % 5) * 0.05;
        const m = part(new THREE.BoxGeometry(0.1, len, 0.015), i % 2 ? robe : trim, Math.sin(a) * 0.25, 0.58 - len / 2, Math.cos(a) * 0.21);
        m.rotation.y = a;
        return m;
      });
      parts.push(...fuse(
        part(new THREE.CylinderGeometry(0.14, 0.27, 0.5, 12), robe, 0, 0.83, 0),
        ...tatters,
        ball(0.2, robe, 0, 1.46, 0.02, 1.35, 0.5, 0.9),
        box(0.07, 0.5, 0.02, trim, 0, 0.85, -0.2),
        ball(0.155, robe, 0, 1.68, 0.05, 1.1, 1.15, 1.1),
        part(new THREE.ConeGeometry(0.1, 0.24, 10), robe, 0, 1.83, 0.1),
      ));
      const staff: THREE.Mesh[] = [
        part(new THREE.CylinderGeometry(0.018, 0.022, 1.95, 8), wood, 0, -0.46, -0.07),
        part(new THREE.TorusGeometry(0.07, 0.012, 6, 12), iron, 0, 0.5, -0.07),
        ball(0.035, bone, 0, 0.5, -0.07),
        part(new THREE.ConeGeometry(0.02, 0.14, 5), iron, 0, -1.45, -0.07),
      ];
      for (let i = -2; i <= 2; i++) {
        const c = part(new THREE.ConeGeometry(0.013, 0.2 - Math.abs(i) * 0.03, 5), iron, i * 0.045, 0.66 - Math.abs(i) * 0.02, -0.07);
        c.rotation.z = -i * 0.3;
        staff.push(c);
      }
      armR.add(...fuse(...staff));
      const orb = new THREE.Group();
      orb.position.set(0, -0.8, 0);
      orb.add(
        new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc26a, fog: false })),
        new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
      );
      orb.visible = false;
      armL.add(orb);
      nock = orb;
    }
  } else {
    const leg = (x: number) => pivot(x, 0.85, 0, ...fuse(cap(0.075, 0.55, cloth, 0, -0.4), box(0.12, 0.06, 0.22, dark, 0, -0.82, -0.05)));
    legL = leg(-0.14);
    legR = leg(0.14);
    const arm = (x: number) => pivot(x, 1.42, 0, ...fuse(ball(0.085, cloth), cap(0.065, 0.46, bone, 0, -0.33), ball(0.075, bone, 0, -0.68)));
    armL = arm(-0.336);
    armR = arm(0.336);
    const head = new THREE.Group();
    head.position.set(0.03, 1.62, -0.02);
    head.rotation.z = 0.18;
    head.add(...fuse(ball(0.135, bone, 0, 0, 0, 1, 1.05, 1.02), box(0.14, 0.05, 0.12, dark, 0, -0.1, -0.04), ball(0.02, eyeMat, -0.05, 0.02, -0.125), ball(0.02, eyeMat, 0.07, -0.01, -0.125)));
    parts.push(...fuse(
      cap(0.2, 0.34, cloth, 0, 1.18, 0, 1, 0.78),
      ball(0.17, cloth, 0, 0.92, 0, 1.1, 0.8, 0.9),
      part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), bone, 0, 1.5),
      box(0.12, 0.3, 0.02, cloth, -0.12, 0.74, -0.1), box(0.1, 0.24, 0.02, cloth, 0.1, 0.76, -0.1), box(0.09, 0.2, 0.02, cloth, 0.0, 0.78, 0.12),
    ), head);
  }

  body.add(legL, legR, ...parts, armL, armR);
  body.scale.setScalar(s);
  const group = new THREE.Group();
  group.add(body);
  return { group, body, armL, armR, legL, legR, mats, nock };
}

export interface EnemyView {
  enemy: Enemy;
  rig: Rig;
}

export function createEnemyView(parent: THREE.Object3D, enemy: Enemy): EnemyView {
  const rig = buildRig(enemy.kind);
  parent.add(rig.group);
  return { enemy, rig };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** A lying corpse is shifted so its hips sit on the spawn point; it then rises without sliding. */
const LIE_SHIFT = 0.95;

export function updateEnemyView(v: EnemyView, t: number): void {
  const { enemy: e, rig } = v;
  const d = ENEMY_DEFS[e.kind];
  const skeleton = e.kind !== 'zombie';
  const archer = e.kind === 'archer';
  const mage = e.kind === 'mage';
  const g = rig.group;
  g.position.set(e.x, 0, e.z);
  g.rotation.y = e.yaw;

  // Defaults (standing).
  g.visible = true;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  const restArm = skeleton ? 0.12 : 1.35;
  let armL = restArm, armR = restArm, legSwing = 0;

  const p = clamp01(e.stateTime / (e.state === 'rising' ? d.riseTime : 1));

  switch (e.state) {
    case 'dormant':
      if (skeleton) {
        // Standing watch: a slow sway, arms hanging.
        rig.body.rotation.z = Math.sin(t * 1.1 + e.spawnX) * 0.025;
        rig.body.rotation.x = Math.sin(t * 0.7 + e.spawnZ) * 0.02;
        armL = armR = restArm + Math.sin(t * 1.3 + e.spawnX) * 0.04;
      } else {
        // Corpse lying on its back.
        rig.body.rotation.x = Math.PI / 2;
        rig.body.position.set(0, 0.2, -LIE_SHIFT);
        armL = armR = 0.3;
      }
      break;
    case 'rising':
      if (skeleton) {
        // Snaps alert: head back, arms flung up, then forward into the chase.
        const k = Math.sin(p * Math.PI);
        rig.body.rotation.x = -0.3 * k;
        armL = lerp(restArm, 1.6, k);
        armR = lerp(restArm, 2.2, k);
      } else {
        const k = p * p * (3 - 2 * p);
        rig.body.rotation.x = lerp(Math.PI / 2, 0, k);
        rig.body.position.y = lerp(0.2, 0, k);
        rig.body.position.z = lerp(-LIE_SHIFT, 0, k);
        armL = armR = lerp(0.3, restArm, k);
      }
      break;
    case 'chase':
      legSwing = 0.7;
      if (skeleton) { const sw = 0.5 * clamp01(e.stateTime / 0.3); armL = restArm + Math.sin(e.walkPhase) * sw; armR = restArm - Math.sin(e.walkPhase) * sw; }
      else { armL = restArm + Math.sin(e.walkPhase * 0.5) * 0.12; armR = restArm - Math.sin(e.walkPhase * 0.5) * 0.12; rig.body.rotation.z = Math.sin(e.walkPhase) * 0.05; }
      break;
    case 'windup': {
      const k = clamp01(e.stateTime / d.windup);
      armR = lerp(restArm, 2.7, k * k);
      if (!skeleton) armL = lerp(restArm, 2.5, k * k);
      rig.body.rotation.x = -0.15 * k;
      break;
    }
    case 'recover': {
      const k = clamp01(e.stateTime / 0.18);
      const back = clamp01((e.stateTime - 0.18) / (d.recover - 0.18));
      armR = lerp(lerp(2.7, 0.4, k), restArm, back);
      if (!skeleton) armL = lerp(lerp(2.5, 0.5, k), restArm, back);
      rig.body.rotation.x = lerp(0.2, 0, back) * (1 - back);
      break;
    }
    case 'stagger':
      rig.body.rotation.x = -0.35 * Math.sin(clamp01(e.stateTime / d.staggerTime) * Math.PI);
      armL = armR = 0.6;
      break;
    case 'dead': {
      const k = clamp01(e.stateTime / 0.55);
      rig.body.rotation.x = lerp(0, Math.PI / 2, k * k);
      rig.body.position.y = lerp(0, 0.2, k);
      rig.body.position.z = lerp(0, -LIE_SHIFT, k);
      armL = armR = lerp(restArm, 0.4, k);
      const sink = clamp01((e.stateTime - 6) / 3);
      rig.body.position.y -= sink * 0.9;
      g.visible = sink < 1;
      break;
    }
  }

  if (archer && e.state !== 'dead' && e.state !== 'stagger') {
    // Bow arm held out front; the draw arm hangs, then hauls back while drawing.
    armL = 1.42 + (e.state === 'windup' ? 0.14 * clamp01(e.stateTime / d.windup) : 0);
    armR = 0.3;
    if (e.state === 'chase') armR = 0.3 + Math.sin(e.walkPhase) * 0.14;
    else if (e.state === 'windup') armR = lerp(0.3, 1.2, clamp01(e.stateTime / d.windup));
    else if (e.state === 'recover') armR = lerp(1.2, 0.3, clamp01(e.stateTime / 0.4));
  }
  if (mage && e.state !== 'dead' && e.state !== 'stagger') {
    // Staff planted in the right hand; the left gathers fire, then flings it.
    const k = clamp01(e.stateTime / d.windup);
    armL = 0.35;
    armR = 0.12;
    if (e.state === 'chase') armR = 0.12 + Math.sin(e.walkPhase) * 0.04;
    else if (e.state === 'windup') { armL = lerp(0.35, 1.45, k); armR = 0.12 - 0.1 * k; rig.body.rotation.x = -0.1 * k; }
    else if (e.state === 'recover') armL = lerp(1.9, 0.35, clamp01(e.stateTime / 0.6));
  }
  if (rig.nock) {
    rig.nock.visible = e.state === 'windup';
    if (mage) rig.nock.scale.setScalar(0.3 + 0.7 * clamp01(e.stateTime / d.windup) + Math.sin(t * 25) * 0.06);
  }
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.legL.rotation.x = Math.sin(e.walkPhase) * legSwing;
  rig.legR.rotation.x = -Math.sin(e.walkPhase) * legSwing;

  const flash = e.flash > 0 ? 0.9 : 0;
  for (const m of rig.mats) {
    m.emissive.setRGB(flash, flash * 0.1, flash * 0.05);
  }
  void t;
}
