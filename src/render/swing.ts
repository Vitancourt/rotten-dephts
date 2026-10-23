import * as THREE from 'three';
import { phaseProgress, type CombatState, type Weapon } from '../sim/combat';

interface Pose { pos: THREE.Vector3; rot: THREE.Euler }

const REST: Pose = { pos: new THREE.Vector3(0.34, -0.44, -0.6), rot: new THREE.Euler(-0.25, 0, -0.12) };
const WINDUP: Pose = { pos: new THREE.Vector3(0.5, -0.2, -0.4), rot: new THREE.Euler(0.7, -0.2, -0.55) };
const STRIKE: Pose = { pos: new THREE.Vector3(-0.25, -0.5, -0.95), rot: new THREE.Euler(-1.35, 0.3, 0.7) };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

function blend(hand: THREE.Object3D, a: Pose, b: Pose, t: number): void {
  hand.position.set(lerp(a.pos.x, b.pos.x, t), lerp(a.pos.y, b.pos.y, t), lerp(a.pos.z, b.pos.z, t));
  hand.rotation.set(lerp(a.rot.x, b.rot.x, t), lerp(a.rot.y, b.rot.y, t), lerp(a.rot.z, b.rot.z, t));
}

const OFFHAND: Pose = { pos: new THREE.Vector3(-0.42, -0.44, -0.6), rot: new THREE.Euler(-0.2, 0, 0.15) };

/** Holds a torch (or any item) steady in the left hand with a slight sway. */
export function poseOffhand(obj: THREE.Object3D, t: number): void {
  obj.position.set(OFFHAND.pos.x, OFFHAND.pos.y + Math.sin(t * 1.7) * 0.006, OFFHAND.pos.z);
  obj.rotation.set(OFFHAND.rot.x + Math.sin(t * 1.3) * 0.01, OFFHAND.rot.y, OFFHAND.rot.z);
}

/** Poses the held weapon for the current swing phase. */
export function poseHand(hand: THREE.Object3D, c: CombatState, w: Weapon): void {
  const p = phaseProgress(c, w);
  if (c.phase === 'windup') blend(hand, REST, WINDUP, easeOut(p));
  else if (c.phase === 'strike') blend(hand, WINDUP, STRIKE, easeIn(p));
  else if (c.phase === 'recover') blend(hand, STRIKE, REST, easeOut(p));
  else blend(hand, REST, REST, 0);
}

const SHIELD_REST: Pose = { pos: new THREE.Vector3(-0.46, -0.3, -0.78), rot: new THREE.Euler(0.12, 0.55, 0.1) };
const SHIELD_GUARD: Pose = { pos: new THREE.Vector3(-0.14, -0.3, -0.66), rot: new THREE.Euler(0.05, 0.12, 0) };
const TORCH_GUARD: Pose = { pos: new THREE.Vector3(-0.12, -0.32, -0.56), rot: new THREE.Euler(-0.5, 0, -0.75) };
const BELT: Pose = { pos: new THREE.Vector3(-0.62, -0.98, -0.4), rot: new THREE.Euler(0, 0, 0.35) };

/** Shield in the left hand: resting at the side, or raised in front of you as `guard` goes 0 -> 1. */
export function poseShield(obj: THREE.Object3D, guard: number, t: number): void {
  const k = Math.min(1, guard);
  blend(obj, SHIELD_REST, SHIELD_GUARD, k);
  if (k < 0.01) obj.position.y += Math.sin(t * 1.5) * 0.004;
}

/** A torch carried at the belt (its light still shines) while a shield fills the off-hand. */
export function poseBelt(obj: THREE.Object3D, t: number): void {
  obj.position.set(BELT.pos.x, BELT.pos.y + Math.sin(t * 1.9) * 0.01, BELT.pos.z);
  obj.rotation.set(BELT.rot.x, BELT.rot.y, BELT.rot.z);
}

/** Moves an already-posed object toward the torch-guard pose by `k` (0..1). */
export function blendToTorchGuard(obj: THREE.Object3D, k: number): void {
  const t = Math.min(1, k);
  obj.position.set(lerp(obj.position.x, TORCH_GUARD.pos.x, t), lerp(obj.position.y, TORCH_GUARD.pos.y, t), lerp(obj.position.z, TORCH_GUARD.pos.z, t));
  obj.rotation.set(lerp(obj.rotation.x, TORCH_GUARD.rot.x, t), lerp(obj.rotation.y, TORCH_GUARD.rot.y, t), lerp(obj.rotation.z, TORCH_GUARD.rot.z, t));
}
