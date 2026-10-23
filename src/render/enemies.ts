import * as THREE from 'three';
import { ENEMY_DEFS, type Enemy, type EnemyKind } from '../sim/enemy';

export interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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

/** Model faces -Z with feet at y = 0. */
export function buildRig(kind: EnemyKind): Rig {
  const skeleton = kind === 'skeleton';
  const mk = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const bone = mk(skeleton ? 0xa89f88 : 0x5e6f4b);
  const cloth = mk(skeleton ? 0x6e6552 : 0x2f382b);
  const dark = mk(skeleton ? 0x2a2620 : 0x4d5a3d);
  const mats = [bone, cloth, dark];
  const s = skeleton ? 1 : 1.12;

  const body = new THREE.Group();
  const legL = pivot(-0.13, 0.85, 0, box(0.11, 0.85, 0.11, skeleton ? bone : cloth, 0, -0.42, 0));
  const legR = pivot(0.13, 0.85, 0, box(0.11, 0.85, 0.11, skeleton ? bone : cloth, 0, -0.42, 0));
  const pelvis = box(0.36, 0.16, 0.2, skeleton ? bone : cloth, 0, 0.9, 0);
  const torso = skeleton
    ? new THREE.Group().add(box(0.36, 0.5, 0.22, dark, 0, 1.22, 0), box(0.4, 0.07, 0.26, bone, 0, 1.38, 0), box(0.4, 0.07, 0.26, bone, 0, 1.22, 0), box(0.4, 0.07, 0.26, bone, 0, 1.06, 0))
    : box(0.5, 0.62, 0.3, cloth, 0, 1.2, 0);
  const head = skeleton ? box(0.24, 0.26, 0.26, bone, 0, 1.65, 0) : box(0.26, 0.28, 0.27, bone, 0.03, 1.62, -0.02);
  head.rotation.z = skeleton ? 0 : 0.18;
  const eyeMat = skeleton ? eyeGreen : eyeRed;
  const eyes = [box(0.05, 0.04, 0.02, eyeMat, -0.06, 1.67, -0.135), box(0.05, 0.04, 0.02, eyeMat, 0.06, 1.67, -0.135)];
  if (!skeleton) eyes.forEach((e) => { e.position.x += 0.03; e.position.y -= 0.03; e.rotation.z = 0.18; });

  const armGeo = skeleton ? [0.09, 0.62, 0.09] : [0.14, 0.66, 0.14];
  const armL = pivot(-0.28 * (skeleton ? 1 : 1.2), 1.42, 0, box(armGeo[0], armGeo[1], armGeo[2], skeleton ? bone : bone, 0, -armGeo[1] / 2, 0));
  const armR = pivot(0.28 * (skeleton ? 1 : 1.2), 1.42, 0, box(armGeo[0], armGeo[1], armGeo[2], skeleton ? bone : bone, 0, -armGeo[1] / 2, 0));
  if (skeleton) {
    // Rusted sword in the right hand.
    const blade = box(0.05, 0.75, 0.02, mk(0x6c5a48), 0, -0.9, -0.04);
    const guard = box(0.18, 0.04, 0.05, mk(0x3a2e22), 0, -0.55, -0.04);
    armR.add(blade, guard);
  }

  body.add(legL, legR, pelvis, torso, head, ...eyes, armL, armR);
  body.scale.setScalar(s);
  const group = new THREE.Group();
  group.add(body);
  return { group, body, armL, armR, legL, legR, mats };
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

export function updateEnemyView(v: EnemyView, t: number): void {
  const { enemy: e, rig } = v;
  const d = ENEMY_DEFS[e.kind];
  const skeleton = e.kind === 'skeleton';
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
      if (skeleton) g.visible = false;
      else {
        // Corpse lying on its back.
        rig.body.rotation.x = Math.PI / 2;
        rig.body.position.y = 0.2;
        armL = armR = 0.3;
      }
      break;
    case 'rising':
      if (skeleton) {
        rig.body.position.y = lerp(-1.9, 0, p * p * (3 - 2 * p));
        rig.body.rotation.z = Math.sin(p * 18) * 0.08 * (1 - p);
        armL = armR = lerp(2.6, restArm, p);
      } else {
        const k = p * p * (3 - 2 * p);
        rig.body.rotation.x = lerp(Math.PI / 2, 0, k);
        rig.body.position.y = lerp(0.2, 0, k);
        armL = armR = lerp(0.3, restArm, k);
      }
      break;
    case 'chase':
      legSwing = 0.7;
      if (skeleton) { armL = restArm + Math.sin(e.walkPhase) * 0.5; armR = restArm - Math.sin(e.walkPhase) * 0.5; }
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
      armL = armR = lerp(restArm, 0.4, k);
      const sink = clamp01((e.stateTime - 6) / 3);
      rig.body.position.y -= sink * 0.9;
      g.visible = sink < 1;
      break;
    }
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
