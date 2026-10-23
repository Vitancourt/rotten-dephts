import * as THREE from 'three';

const VERT = `
attribute vec4 aColor;
attribute float aSize;
varying vec4 vC;
void main() {
  vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vC.rgb, vC.a * a);
}`;

/** A fixed pool of soft round particles updated on the CPU. */
export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private base: Float32Array; // base size
  private grav: Float32Array;
  private next = 0;

  constructor(parent: THREE.Object3D, capacity: number, additive: boolean) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.base = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, life: number, size = 0.1, gravity = 6): void {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * s * (1 - up * 0.5), up * s, Math.sin(a) * s * (1 - up * 0.5)], i * 3);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
      this.base[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.col.set([c.r, c.g, c.b, 1], i * 4);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const y = this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (y < 0.03) {
        this.pos[i * 3 + 1] = 0.03;
        this.vel[i * 3 + 1] = 0;
        this.vel[i * 3] *= 0.8;
        this.vel[i * 3 + 2] *= 0.8;
      } else this.pos[i * 3 + 1] = y;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 4 + 3] = k;
      this.size[i] = this.base[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/** Ready-made effects built from two pools: glowing sparks and ordinary dust/blood. */
export class Effects {
  private glow: Particles;
  private matter: Particles;

  constructor(parent: THREE.Object3D) {
    this.glow = new Particles(parent, 300, true);
    this.matter = new Particles(parent, 500, false);
  }

  hit(x: number, y: number, z: number): void {
    this.glow.burst(x, y, z, 0xffb04a, 9, 3.2, 0.35, 0.07, 9);
    this.matter.burst(x, y, z, 0x7a1612, 7, 2.2, 0.55, 0.09, 8);
  }

  death(x: number, z: number, big = false): void {
    this.matter.burst(x, 0.9, z, 0x8a8478, big ? 60 : 22, big ? 4 : 2.4, big ? 1.6 : 1.0, big ? 0.35 : 0.2, 1.5);
    this.matter.burst(x, 0.6, z, 0xcfc6aa, big ? 24 : 8, 3, 0.9, 0.09, 9);
  }

  dust(x: number, z: number, count = 24): void {
    this.matter.burst(x, 0.15, z, 0x8a8478, count, 3.2, 0.9, 0.22, 0.5);
  }

  pickup(x: number, y: number, z: number, color: number): void {
    this.glow.burst(x, y, z, color, 12, 1.8, 0.7, 0.08, -1);
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.matter.update(dt);
  }
}
