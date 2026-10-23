export interface Settings {
  sensitivity: number; // multiplier
  volume: number; // 0..1 (everything)
  music: number; // 0..1
  fov: number; // degrees
  lowGfx: boolean;
}

const KEY = 'rotten-depths-settings';
export const DEFAULTS: Settings = { sensitivity: 1, volume: 0.7, music: 0.6, fov: 75, lowGfx: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* use defaults */ }
  return { ...DEFAULTS };
}

function save(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

/** Adds sliders to the pause overlay. Clicks inside do not resume the game. */
export function mountSettings(host: HTMLElement, s: Settings, onChange: (s: Settings) => void): void {
  const box = document.createElement('div');
  box.style.cssText = 'margin-top:18px;padding:12px 16px;border:1px solid #4a3d28;background:rgba(0,0,0,.45);font-size:13px;text-align:left;cursor:default';
  box.addEventListener('click', (e) => e.stopPropagation());

  const row = (label: string, el: HTMLElement, value: HTMLElement) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:10px;margin:6px 0';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.width = '110px';
    r.append(l, el, value);
    box.appendChild(r);
  };
  const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) => {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(get());
    const out = document.createElement('span');
    out.style.width = '44px';
    out.textContent = fmt(get());
    input.oninput = () => {
      set(parseFloat(input.value));
      out.textContent = fmt(get());
      save(s);
      onChange(s);
    };
    row(label, input, out);
  };

  slider('Mouse sens', 0.3, 2.5, 0.05, () => s.sensitivity, (v) => (s.sensitivity = v), (v) => `${v.toFixed(2)}x`);
  slider('Volume', 0, 1, 0.05, () => s.volume, (v) => (s.volume = v), (v) => `${Math.round(v * 100)}%`);
  slider('Music', 0, 1, 0.05, () => s.music, (v) => (s.music = v), (v) => `${Math.round(v * 100)}%`);
  slider('Field of view', 60, 100, 1, () => s.fov, (v) => (s.fov = v), (v) => `${v}°`);

  const low = document.createElement('input');
  low.type = 'checkbox';
  low.checked = s.lowGfx;
  low.onchange = () => {
    s.lowGfx = low.checked;
    save(s);
    onChange(s);
  };
  const note = document.createElement('span');
  note.textContent = 'faster on weak GPUs';
  note.style.opacity = '.6';
  row('Low graphics', low, note);

  host.appendChild(box);
}
