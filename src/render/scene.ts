import * as THREE from 'three';
import { createFire, type Fire } from './fire';
import { surfaceMaterial } from './textures';

export const EYE_HEIGHT = 1.6;

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.prepend(renderer.domElement);
  return renderer;
}

interface FlameLight { light: THREE.PointLight; fire: Fire; base: number; phase: number }

const woodMat = surfaceMaterial('wood', 0x4b3622);
const charMat = surfaceMaterial('wood', 0x1a120c);

/** The player's hand torch: a stick, a charred head, animated fire and a light. */
function makeHandTorch(flames: FlameLight[]): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), woodMat);
  stick.position.y = 0.25;
  g.add(stick);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.12, 10), charMat);
  head.position.y = 0.54;
  g.add(head);
  const fire = createFire();
  fire.object.position.y = 0.58;
  g.add(fire.object);
  const light = new THREE.PointLight(0xffb070, 13, 16, 1.4);
  light.position.y = 0.65;
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.15;
  light.shadow.camera.far = 16;
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.03;
  light.shadow.radius = 4;
  g.add(light);
  flames.push({ light, fire, base: 13, phase: Math.random() * 100 });
  return g;
}

/** Lets everything under `root` cast and receive the hand torch's shadows. */
export function enableShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.material instanceof THREE.MeshBasicMaterial) return;
    m.castShadow = m.receiveShadow = true;
  });
}

export function createScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hand: THREE.Group;
  updateHand: (t: number) => void;
  /** Hand-torch shadow map size; 0 turns shadows off. */
  setShadows: (size: number) => void;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0810);
  scene.fog = new THREE.FogExp2(0x0a0810, 0.045);
  scene.add(new THREE.AmbientLight(0x6a7a9a, 1.1));

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const flames: FlameLight[] = [];
  const hand = makeHandTorch(flames);
  camera.add(hand);

  const updateHand = (t: number) => {
    for (const f of flames) {
      const n = Math.sin(t * 9 + f.phase) * 0.5 + Math.sin(t * 23 + f.phase * 1.7) * 0.5;
      f.light.intensity = f.base * (1 + n * 0.08);
      f.fire.update(t);
    }
  };
  const handLight = flames[0].light;
  const setShadows = (size: number) => {
    handLight.castShadow = size > 0;
    if (size > 0 && handLight.shadow.mapSize.x !== size) {
      handLight.shadow.mapSize.set(size, size);
      handLight.shadow.map?.dispose();
      handLight.shadow.map = null;
    }
  };
  return { scene, camera, hand, updateHand, setShadows };
}
