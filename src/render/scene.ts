import * as THREE from 'three';
import { createFire, type Fire } from './fire';

export const EYE_HEIGHT = 1.6;

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.prepend(renderer.domElement);
  return renderer;
}

interface FlameLight { light: THREE.PointLight; fire: Fire; base: number; phase: number }

const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 1, flatShading: true });
const charMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, flatShading: true });

/** The player's hand torch: a stick, a charred head, animated fire and a light. */
function makeHandTorch(flames: FlameLight[]): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), woodMat);
  stick.position.y = 0.25;
  g.add(stick);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.12, 6), charMat);
  head.position.y = 0.54;
  g.add(head);
  const fire = createFire();
  fire.object.position.y = 0.58;
  g.add(fire.object);
  const light = new THREE.PointLight(0xff9a4d, 17, 16, 1.4);
  light.position.y = 0.65;
  g.add(light);
  flames.push({ light, fire, base: 17, phase: Math.random() * 100 });
  return g;
}

export function createScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hand: THREE.Group;
  updateHand: (t: number) => void;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0810);
  scene.fog = new THREE.FogExp2(0x0a0810, 0.045);
  scene.add(new THREE.AmbientLight(0x4a4a60, 0.9));

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
  return { scene, camera, hand, updateHand };
}
