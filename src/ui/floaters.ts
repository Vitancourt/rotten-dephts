import type * as THREE from 'three';

interface Floater { el: HTMLDivElement; x: number; y: number; z: number; t: number }

/** Damage numbers that rise from a point in the world. */
export class Floaters {
  private list: Floater[] = [];
  private root = document.createElement('div');

  constructor() {
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9';
    document.body.appendChild(this.root);
  }

  spawn(x: number, y: number, z: number, text: string, color = '#ffd27a'): void {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;left:0;top:0;color:${color};font:bold 20px monospace;text-shadow:0 0 4px #000,0 0 2px #000;will-change:transform,opacity`;
    this.root.appendChild(el);
    this.list.push({ el, x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, t: 0 });
  }

  update(dt: number, camera: THREE.PerspectiveCamera, v: THREE.Vector3): void {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      if (f.t > 0.9) {
        f.el.remove();
        this.list.splice(i, 1);
        continue;
      }
      v.set(f.x, f.y + f.t * 0.9, f.z).project(camera);
      if (v.z > 1) {
        f.el.style.opacity = '0';
        continue;
      }
      f.el.style.opacity = String(Math.min(1, (0.9 - f.t) * 2.5));
      f.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    }
  }

  clear(): void {
    for (const f of this.list) f.el.remove();
    this.list = [];
  }
}
