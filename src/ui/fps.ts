/** Small FPS readout in the top-left corner, refreshed twice a second. */
export function createFpsCounter(): () => void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:8px;left:10px;color:#c9b99a;font:12px monospace;opacity:.8;pointer-events:none;z-index:10';
  el.textContent = 'FPS --';
  document.body.appendChild(el);

  let frames = 0;
  let last = performance.now();
  return () => {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      el.textContent = `FPS ${Math.round((frames * 1000) / (now - last))}`;
      frames = 0;
      last = now;
    }
  };
}
