/** HUD: health + stamina bars, damage flash, centre message and death screen. */
export interface Hud {
  setVitals(hp: number, maxHp: number, stamina: number, maxStamina: number): void;
  setHurt(strength: number): void;
  message(text: string, ms?: number): void;
  setDeath(strength: number): void;
  setCounts(gold: number, xp: number, depth: number): void;
  prompt(html: string | null): void;
  setCompass(angle: number | null, label: string | null): void;
  setBoss(name: string | null, frac: number): void;
  setFade(strength: number): void;
  setQuick(slots: QuickHud[]): void;
}

export interface QuickHud {
  key: string;
  label: string;
  color: string;
  count?: number;
  dim: boolean; // nothing to use right now
}

function bar(bottom: number, color: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:16px;bottom:${bottom}px;width:240px;height:12px;background:rgba(0,0,0,.55);border:1px solid #5a4a30;pointer-events:none;z-index:10`;
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%;width:100%;background:${color}`;
  wrap.appendChild(fill);
  document.body.appendChild(wrap);
  return fill;
}

function layer(css: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;pointer-events:none;${css}`;
  document.body.appendChild(el);
  return el;
}

export function createHud(): Hud {
  const hp = bar(34, '#a8302a');
  const st = bar(16, '#7aa63a');
  const hurt = layer('z-index:8;opacity:0;background:radial-gradient(ellipse at center,rgba(120,0,0,0) 35%,rgba(150,0,0,.75) 100%)');
  const death = layer(
    'z-index:20;opacity:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;color:#9b1c1c;font:bold 64px serif;letter-spacing:.15em',
  );
  death.textContent = 'YOU DIED';
  const msg = layer(
    'z-index:12;top:18%;bottom:auto;text-align:center;color:#d8c9a6;font:20px serif;letter-spacing:.08em;opacity:0;transition:opacity .6s;text-shadow:0 0 8px #000',
  );
  const counts = layer('z-index:10;top:8px;left:auto;right:14px;bottom:auto;text-align:right;color:#c9b99a;font:13px monospace;text-shadow:0 0 4px #000');
  const prompt = layer('z-index:11;top:62%;bottom:auto;text-align:center;font:15px monospace;color:#e8dcc0;text-shadow:0 0 6px #000');
  const compass = layer('z-index:10;top:34px;bottom:auto;left:50%;right:auto;width:200px;margin-left:-100px;text-align:center;font:12px monospace;color:#7fd0ff;display:none');
  compass.innerHTML = '<div id="cmp-arrow" style="font-size:26px;line-height:1">▲</div><div id="cmp-label"></div>';
  const bossWrap = layer('z-index:10;top:auto;bottom:46px;left:50%;right:auto;width:520px;margin-left:-260px;display:none');
  bossWrap.innerHTML = '<div id="boss-name" style="text-align:center;font:16px serif;letter-spacing:.2em;color:#d8c9a6;margin-bottom:4px;text-shadow:0 0 6px #000"></div><div style="height:12px;background:rgba(0,0,0,.65);border:1px solid #6a2a2a"><div id="boss-fill" style="height:100%;width:100%;background:#8a1f1f"></div></div>';
  const quick = layer('z-index:10;top:auto;left:auto;right:16px;bottom:16px;display:flex;gap:8px;justify-content:flex-end');
  const quickEls = [0, 1].map(() => {
    const el = document.createElement('div');
    el.style.cssText = 'width:74px;height:50px;border:2px solid #5a4a30;background:rgba(0,0,0,.6);color:#c9b99a;font:11px monospace;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;position:relative';
    quick.appendChild(el);
    return el;
  });
  const fade = layer('z-index:25;opacity:0;background:#000');
  let timer = 0;

  return {
    setVitals(h, mh, s, ms) {
      hp.style.width = `${(h / mh) * 100}%`;
      st.style.width = `${(s / ms) * 100}%`;
    },
    setHurt(v) {
      hurt.style.opacity = String(v);
    },
    message(text, ms = 3500) {
      msg.textContent = text;
      msg.style.opacity = '1';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (msg.style.opacity = '0'), ms);
    },
    setDeath(v) {
      death.style.opacity = String(v);
    },
    setCounts(gold, xp, depth) {
      counts.innerHTML = `Depth ${depth}<br><span style="color:#e2b93b">${gold} gold</span> · <span style="color:#7fd0ff">${xp} xp</span>`;
    },
    prompt(html) {
      prompt.innerHTML = html ?? '';
    },
    setCompass(angle, label) {
      compass.style.display = label === null ? 'none' : 'block';
      if (label === null) return;
      const arrow = compass.querySelector('#cmp-arrow') as HTMLElement;
      arrow.style.visibility = angle === null ? 'hidden' : 'visible';
      arrow.style.transform = `rotate(${angle ?? 0}rad)`;
      (compass.querySelector('#cmp-label') as HTMLElement).textContent = label;
    },
    setQuick(slots) {
      slots.forEach((q, i) => {
        const el = quickEls[i];
        el.style.opacity = q.dim ? '0.45' : '1';
        el.style.borderColor = q.color;
        el.innerHTML = `<span style="position:absolute;top:1px;left:4px;color:#8c7c5a">${q.key}</span><span style="color:${q.color}">${q.label}</span>${q.count !== undefined ? `<span>×${q.count}</span>` : ''}`;
      });
    },
    setFade(v) {
      fade.style.opacity = String(v);
    },
    setBoss(name, frac) {
      bossWrap.style.display = name ? 'block' : 'none';
      if (!name) return;
      (bossWrap.querySelector('#boss-name') as HTMLElement).textContent = name;
      (bossWrap.querySelector('#boss-fill') as HTMLElement).style.width = `${Math.max(0, frac) * 100}%`;
    },
  };
}
