import * as THREE from 'three';
import { roundedBox } from './geo';
import { surfaceMaterial } from './textures';

const leather = surfaceMaterial('leather', 0x8a6040);
const knuckle = surfaceMaterial('leather', 0xa6785a);
const cuffMat = surfaceMaterial('leather', 0x4a382a);
const sleeve = surfaceMaterial('cloth', 0x6a5e50);

for (const m of [leather, knuckle, cuffMat, sleeve]) m.normalScale.set(0.3, 0.3);

export interface HandRig {
  group: THREE.Group;
  /** Where the forearm connects, in the hand's own space. */
  wrist: THREE.Object3D;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(roundedBox(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * A gloved fist gripping something that runs along the local Y axis. The back of the hand faces +Z
 * (towards the player), the fingers curl round the front, and the wrist is at the bottom.
 */
export function buildHand(left: boolean): HandRig {
  const g = new THREE.Group();
  g.scale.setScalar(1.4); // chunky, readable hands
  g.add(box(0.1, 0.1, 0.05, leather, 0, 0, 0.045)); // back of the hand
  for (let i = 0; i < 4; i++) g.add(box(0.1, 0.024, 0.06, i % 2 ? knuckle : leather, 0, -0.036 + i * 0.026, -0.03)); // fingers
  g.add(box(0.1, 0.02, 0.02, knuckle, 0, 0.056, 0.02)); // knuckle ridge
  const thumbX = left ? 0.055 : -0.055;
  const thumb = box(0.03, 0.06, 0.035, leather, thumbX, 0.01, -0.035);
  thumb.rotation.z = left ? -0.25 : 0.25;
  g.add(thumb);
  g.add(box(0.115, 0.05, 0.115, cuffMat, 0, -0.085, 0.03)); // glove cuff
  const wrist = new THREE.Object3D();
  wrist.position.set(0, -0.11, 0.03);
  g.add(wrist);
  return { group: g, wrist };
}

const UP = new THREE.Vector3(0, 1, 0);
const wp = new THREE.Vector3();
const dir = new THREE.Vector3();

/**
 * A forearm from a fixed shoulder point (in camera space) to wherever the hand currently is.
 * Because it follows the hand, swings and guards stretch and bend it like a real arm.
 */
export class Arm {
  private mesh: THREE.Mesh;
  private shoulder: THREE.Vector3;

  constructor(camera: THREE.Object3D, left: boolean) {
    this.shoulder = new THREE.Vector3(left ? -0.5 : 0.5, -0.78, 0.15);
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 1, 8), sleeve);
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** `wrist` is the hand's wrist anchor, or null to hide the arm. Call after the camera has been placed. */
  update(camera: THREE.Camera, wrist: THREE.Object3D | null): void {
    if (!wrist) {
      this.mesh.visible = false;
      return;
    }
    camera.updateMatrixWorld(true);
    wrist.getWorldPosition(wp);
    camera.worldToLocal(wp); // now in camera space, where the arm lives
    dir.copy(wp).sub(this.shoulder);
    const len = dir.length();
    if (len < 1e-4) return;
    this.mesh.visible = true;
    this.mesh.position.copy(this.shoulder).addScaledVector(dir, 0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
    this.mesh.scale.set(1, len, 1);
  }
}
