import * as THREE from 'three';
import { buildRig, type Rig } from './enemies';
import { INTRO_TIME, bossActive, type AttackDef, type Boss, type BossKind } from '../sim/boss';

const TINT: Record<BossKind, number> = { colossus: 0x9a8f78, abomination: 0x56693f, warden: 0x3a3f4a };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const metal = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.6, metalness: 0.6, flatShading: true });
const glowRed = new THREE.MeshBasicMaterial({ color: 0xff3a1a });

export interface BossView {
  boss: Boss;
  rig: Rig;
  telegraph: THREE.Mesh;
  telegraphAttack: AttackDef | null;
}

function decorate(kind: BossKind, rig: Rig): void {
  const add = (m: THREE.Mesh) => rig.body.add(m);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    return m;
  };
  if (kind === 'colossus') {
    // Great horns and a huge bone club in the right hand.
    add(box(0.07, 0.3, 0.07, metal, -0.15, 1.9, 0, 0.5));
    add(box(0.07, 0.3, 0.07, metal, 0.15, 1.9, 0, -0.5));
    rig.armR.add(box(0.12, 1.1, 0.12, metal, 0, -1.0, -0.05), box(0.3, 0.3, 0.3, metal, 0, -1.6, -0.05));
  } else if (kind === 'warden') {
    // Crown and a tall greatsword.
    for (let i = -2; i <= 2; i++) add(box(0.05, 0.14, 0.05, metal, i * 0.055, 1.9 + (i % 2 ? 0 : 0.05), 0));
    rig.armR.add(box(0.1, 1.6, 0.03, metal, 0, -1.2, -0.05), box(0.4, 0.06, 0.1, metal, 0, -0.5, -0.05));
    add(box(0.55, 0.12, 0.35, metal, 0, 1.55, 0)); // pauldrons
  } else {
    // Abomination: swollen, with glowing sores.
    for (const [x, y] of [[-0.18, 1.3], [0.2, 1.1], [0.0, 1.45]]) add(box(0.14, 0.14, 0.05, glowRed, x, y, -0.2));
  }
}

export function createBossView(parent: THREE.Object3D, boss: Boss): BossView {
  const rig = buildRig(boss.kind === 'abomination' ? 'zombie' : 'skeleton');
  const tint = new THREE.Color(TINT[boss.kind]);
  for (const m of rig.mats) m.color.lerp(tint, 0.55);
  decorate(boss.kind, rig);
  rig.group.scale.setScalar(boss.def.scale);
  parent.add(rig.group);

  const telegraph = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.position.y = 0.04;
  telegraph.visible = false;
  parent.add(telegraph);
  return { boss, rig, telegraph, telegraphAttack: null };
}

/** Builds the warning shape for an attack. Position and facing are applied every frame by placeTelegraph. */
function shapeTelegraph(v: BossView, a: AttackDef): void {
  const b = v.boss;
  v.telegraph.geometry.dispose();
  switch (a.shape) {
    case 'cleave':
      v.telegraph.geometry = new THREE.CircleGeometry(a.reach, 28, -a.param / 2, a.param); // sector pointing along local +X
      break;
    case 'slam':
      v.telegraph.geometry = new THREE.CircleGeometry(a.param, 32);
      break;
    case 'quake':
      v.telegraph.geometry = new THREE.CircleGeometry(a.param, 40);
      break;
    case 'charge':
      v.telegraph.geometry = new THREE.PlaneGeometry(b.radius * 2 + 0.4, a.reach); // lane along local +Y
      break;
  }
}

function placeTelegraph(v: BossView, a: AttackDef): void {
  const b = v.boss;
  const t = v.telegraph;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  // After rotation.x = -PI/2, local (x, y) maps to world (x, -z): a local angle psi points along world (cos psi, -sin psi).
  switch (a.shape) {
    case 'cleave':
      t.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + b.yaw);
      t.position.set(b.x, 0.04, b.z);
      break;
    case 'slam':
      t.rotation.set(-Math.PI / 2, 0, 0);
      t.position.set(b.x + fx * a.reach, 0.04, b.z + fz * a.reach);
      break;
    case 'quake':
      t.rotation.set(-Math.PI / 2, 0, 0);
      t.position.set(b.x, 0.04, b.z);
      break;
    case 'charge':
      t.rotation.set(-Math.PI / 2, 0, b.yaw);
      t.position.set(b.x + (fx * a.reach) / 2, 0.04, b.z + (fz * a.reach) / 2);
      break;
  }
}

export function updateBossView(v: BossView, t: number): void {
  const b = v.boss;
  const g = v.rig.group;
  const rig = v.rig;
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.yaw;
  g.visible = true;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  const rest = 0.15;
  let armL = rest, armR = rest, leg = 0;

  switch (b.state) {
    case 'dormant':
      rig.body.rotation.x = 0.45;
      rig.body.position.y = -0.55;
      armL = armR = 0.5;
      break;
    case 'intro': {
      const p = clamp01(b.stateTime / INTRO_TIME);
      rig.body.rotation.x = lerp(0.45, -0.25, Math.sin(p * Math.PI * 0.5));
      rig.body.position.y = lerp(-0.55, 0, p);
      armL = armR = lerp(0.5, 2.9, Math.sin(p * Math.PI)); // roar
      rig.body.rotation.z = Math.sin(t * 40) * 0.03 * p;
      break;
    }
    case 'chase':
      leg = 0.7;
      armL = rest + Math.sin(b.walkPhase) * 0.4;
      armR = rest - Math.sin(b.walkPhase) * 0.4;
      break;
    case 'windup': {
      const a = b.attack!;
      const k = clamp01(b.stateTime / (a.windup / (b.enraged ? 1.25 : 1)));
      if (a.shape === 'charge') {
        rig.body.rotation.x = -0.5 * k; // crouch forward
        armL = armR = lerp(rest, -0.8, k);
      } else if (a.shape === 'cleave') {
        armR = lerp(rest, 2.2, k * k);
        armL = lerp(rest, 1.2, k);
        rig.body.rotation.z = -0.35 * k;
      } else {
        armL = armR = lerp(rest, 3.0, k * k); // overhead
        rig.body.rotation.x = 0.2 * k;
      }
      break;
    }
    case 'strike': {
      const a = b.attack!;
      if (a.shape === 'charge') {
        leg = 0.9;
        rig.body.rotation.x = -0.6;
        armL = armR = -0.9;
      } else if (a.shape === 'cleave') {
        armR = 0.6; armL = 0.9;
        rig.body.rotation.z = 0.3;
      } else {
        armL = armR = 0.5;
        rig.body.rotation.x = -0.35;
      }
      break;
    }
    case 'recover':
      armL = armR = lerp(0.6, rest, clamp01(b.stateTime / b.attack!.recover));
      break;
    case 'dead': {
      const k = clamp01(b.stateTime / 1.2);
      rig.body.rotation.x = lerp(0, Math.PI / 2, k * k);
      rig.body.position.y = lerp(0, 0.2, k);
      armL = armR = lerp(rest, 0.5, k);
      g.visible = b.stateTime < 9;
      break;
    }
  }
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.legL.rotation.x = Math.sin(b.walkPhase) * leg;
  rig.legR.rotation.x = -Math.sin(b.walkPhase) * leg;

  const flash = b.flash > 0 ? 0.8 : 0;
  for (const m of rig.mats) m.emissive.setRGB(flash, flash * 0.1, flash * 0.05);

  // Red ground warning while an attack winds up.
  const tele = v.telegraph;
  if (bossActive(b) && b.state === 'windup' && b.attack) {
    if (v.telegraphAttack !== b.attack) {
      shapeTelegraph(v, b.attack);
      v.telegraphAttack = b.attack;
    }
    placeTelegraph(v, b.attack);
    const k = clamp01(b.stateTime / (b.attack.windup / (b.enraged ? 1.25 : 1)));
    tele.visible = true;
    (tele.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.35 * k + Math.sin(t * 20) * 0.04 * k;
  } else if (b.state === 'strike' && b.attack && b.attack.shape !== 'charge') {
    tele.visible = true;
    (tele.material as THREE.MeshBasicMaterial).opacity = 0.7;
  } else {
    tele.visible = false;
    v.telegraphAttack = null;
  }
}

export function disposeBossView(v: BossView): void {
  v.rig.group.removeFromParent();
  v.telegraph.removeFromParent();
  v.telegraph.geometry.dispose();
}
