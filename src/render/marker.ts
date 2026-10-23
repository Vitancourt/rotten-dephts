import * as THREE from 'three';

const bone = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.9, flatShading: true });

/** Where the player fell: bones, a soul-blue beam and a light. Hidden until placed. */
export class MarkerView {
  readonly group = new THREE.Group();
  private light = new THREE.PointLight(0x6fc8ff, 0, 9, 1.6);
  private beam: THREE.Mesh;
  private orb: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), bone);
    body.position.y = 0.08;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), bone);
    skull.position.set(0, 0.14, -0.55);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.3, 4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.position.y = 2;
    this.orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, fog: false }));
    this.orb.position.y = 0.9;
    this.light.position.y = 1;
    this.group.add(body, skull, this.beam, this.orb, this.light);
    this.group.visible = false;
    scene.add(this.group);
  }

  place(x: number, z: number): void {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.light.intensity = 0;
  }

  update(t: number): void {
    if (!this.group.visible) return;
    this.orb.rotation.y = t * 2;
    this.orb.position.y = 0.9 + Math.sin(t * 2.2) * 0.12;
    this.light.intensity = 9 + Math.sin(t * 3) * 1.5;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 2.5) * 0.06;
  }
}
