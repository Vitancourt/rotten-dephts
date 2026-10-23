const STEP = 1 / 60;
const MAX_FRAME = 0.25;

/** Fixed-timestep update with a variable-rate render. */
export function startLoop(update: (dt: number) => void, render: (alpha: number) => void): void {
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render(acc / STEP);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
