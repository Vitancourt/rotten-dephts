// Cage intro: the player starts locked in a cage that creaks open. Pure logic.
import type { Rect } from './movement';

export type IntroPhase = 'caged' | 'opening' | 'free';

export interface Intro {
  phase: IntroPhase;
  t: number;
}

export const CAGED_TIME = 2.2;
export const OPEN_TIME = 1.6;

// Cage footprint, relative to its centre. The gate is on the north (-Z) side.
export const CAGE = { minX: -1.2, maxX: 1.2, minZ: -1.2, maxZ: 1.2 };

const B = 0.08; // bar-wall thickness

export interface CageSolids {
  closed: Rect[];
  /** Once the gate is open only the three solid sides remain. */
  open: Rect[];
}

export function cageSolids(cx: number, cz: number): CageSolids {
  const c = { minX: cx + CAGE.minX, maxX: cx + CAGE.maxX, minZ: cz + CAGE.minZ, maxZ: cz + CAGE.maxZ };
  const open: Rect[] = [
    { minX: c.minX - B, maxX: c.minX + B, minZ: c.minZ, maxZ: c.maxZ },
    { minX: c.maxX - B, maxX: c.maxX + B, minZ: c.minZ, maxZ: c.maxZ },
    { minX: c.minX, maxX: c.maxX, minZ: c.maxZ - B, maxZ: c.maxZ + B },
  ];
  const gate: Rect = { minX: c.minX, maxX: c.maxX, minZ: c.minZ - B, maxZ: c.minZ + B };
  return { closed: [...open, gate], open };
}

export function createIntro(): Intro {
  return { phase: 'caged', t: 0 };
}

export function stepIntro(i: Intro, dt: number): 'opened' | null {
  i.t += dt;
  if (i.phase === 'caged' && i.t >= CAGED_TIME) {
    i.phase = 'opening';
    i.t = 0;
  } else if (i.phase === 'opening' && i.t >= OPEN_TIME) {
    i.phase = 'free';
    i.t = 0;
    return 'opened';
  }
  return null;
}

/** 0 = shut, 1 = fully open. */
export function gateOpenness(i: Intro): number {
  if (i.phase === 'caged') return 0;
  if (i.phase === 'opening') return Math.min(1, i.t / OPEN_TIME);
  return 1;
}

export function canMove(i: Intro): boolean {
  return i.phase === 'free';
}

export function startIntro(i: Intro): void {
  i.phase = 'caged';
  i.t = 0;
}

export function skipIntro(i: Intro): void {
  i.phase = 'free';
  i.t = 0;
}
