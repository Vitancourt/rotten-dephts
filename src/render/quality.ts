/**
 * Watches frame times and steps graphics quality down until the game holds ~60 fps.
 * Tiers only go down on their own (no flip-flopping); the low-graphics setting forces the last one.
 *   0 full   1 no bloom, smaller shadow map   2 no post-processing, lower resolution   3 no shadows
 */
export const MAX_TIER = 3;

const WINDOW = 90; // frames per measurement
const BUDGET_MS = 18.5; // average above this = below ~54 fps
const WARMUP = 150; // frames to ignore after start or a floor change (shader compiles, texture uploads)

export class QualityGovernor {
  tier = 0;
  private samples: number[] = [];
  private warm = WARMUP;
  private strikes = 0;

  constructor(private apply: (tier: number) => void) {}

  /** Call after anything that causes a one-off hitch (loading a floor). */
  resetWarmup(): void {
    this.warm = WARMUP;
    this.samples.length = 0;
    this.strikes = 0;
  }

  frame(dtMs: number): void {
    if (this.tier >= MAX_TIER) return;
    if (this.warm > 0) { this.warm--; return; }
    if (dtMs > 100) return; // tab switch or pause, not a rendering cost
    this.samples.push(dtMs);
    if (this.samples.length < WINDOW) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    this.strikes = avg > BUDGET_MS ? this.strikes + 1 : 0;
    if (this.strikes >= 2) {
      this.strikes = 0;
      this.set(this.tier + 1);
      this.warm = 60;
    }
  }

  set(tier: number): void {
    this.tier = Math.max(0, Math.min(MAX_TIER, tier));
    this.apply(this.tier);
  }
}
