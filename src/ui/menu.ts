import { mountSettings, type Settings } from './settings';

export interface MenuHandlers {
  /** Called by Start Game / Resume: take pointer lock and (re)start audio. */
  onPlay(): void;
  onNewGame(): void;
  settings: Settings;
  onSettingsChange(s: Settings): void;
}

export interface Menu {
  /** After the first start the main button reads "Resume". */
  setStarted(started: boolean): void;
  /** Return to the main screen (used each time the menu reappears). */
  showMain(): void;
}

const CSS = `
#menu{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:340px;max-width:92vw;color:#b9a98a;text-align:center;cursor:default}
#menu h1{margin:0 0 4px;font:bold 54px serif;letter-spacing:.18em;color:#d8c9a6;text-shadow:0 0 18px #000,0 0 40px #5a1a10}
#menu .sub{margin:0 0 22px;font-size:12px;letter-spacing:.3em;color:#7a6c4e;text-transform:uppercase}
#menu button.m{width:300px;padding:11px 0;background:rgba(20,16,12,.85);color:#d8c9a6;border:1px solid #5a4a30;font:16px serif;letter-spacing:.2em;text-transform:uppercase;cursor:pointer}
#menu button.m:hover,#menu button.m:focus-visible{background:#2d2418;border-color:#a8893c;color:#fff2cf;outline:none}
#menu button.m.primary{border-color:#a8893c;font-size:18px}
#menu button.m.danger{border-color:#4a2a24;color:#a8786c;margin-top:14px;font-size:13px}
#menu h2{margin:0 0 14px;font:bold 26px serif;letter-spacing:.2em;color:#d8c9a6}
#menu table{border-collapse:collapse;text-align:left;margin-bottom:18px;font-size:14px}
#menu td{padding:6px 14px;border-bottom:1px solid #2a2218}
#menu td.k{white-space:nowrap}
#menu kbd{display:inline-block;min-width:22px;padding:2px 7px;margin-right:4px;border:1px solid #6a5a38;border-bottom-width:3px;border-radius:4px;background:#1b1610;color:#f0e2bc;font:12px monospace;text-align:center}
#menu .hint{margin-top:10px;font-size:11px;color:#6a5c40}
`;

const CONTROLS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Mouse'], 'Look around'],
  [['Shift'], 'Sprint (hold)'],
  [['Left click'], 'Attack with your weapon (hold to keep swinging)'],
  [['Right click'], 'Block (hold): a shield absorbs most damage from the front, a bare torch only a little. Costs stamina'],
  [['F'], 'Interact: pick up items, recover your belongings, descend stairs, rest at a cage'],
  [['Q'], 'Quick slot 1 (starts as a health flask)'],
  [['E'], 'Quick slot 2'],
  [['I', 'Tab'], 'Equipment, quick-slot binding and level-up'],
  [['Esc'], 'Pause menu'],
];

export function createMenu(host: HTMLElement, h: MenuHandlers): Menu {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'menu';
  host.appendChild(root);

  let started = false;
  let view: 'main' | 'options' | 'controls' = 'main';

  const button = (label: string, cls: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = `m ${cls}`.trim();
    b.textContent = label;
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    return b;
  };

  function render(): void {
    root.innerHTML = '';
    if (view === 'main') {
      root.innerHTML = '<h1>Rotten Depths</h1><div class="sub">a descent into the dead</div>';
      root.append(
        button(started ? 'Resume' : 'Start Game', 'primary', h.onPlay),
        button('Options', '', () => go('options')),
        button('Controls', '', () => go('controls')),
        button('New Game', 'danger', () => {
          if (confirm('Erase your save and start over?')) h.onNewGame();
        }),
      );
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = started ? 'Press Esc any time to return here.' : 'Your progress is saved automatically in this browser.';
      root.appendChild(hint);
    } else if (view === 'options') {
      root.innerHTML = '<h2>Options</h2>';
      mountSettings(root, h.settings, h.onSettingsChange);
      root.appendChild(button('Back', '', () => go('main')));
      (root.lastChild as HTMLElement).style.marginTop = '16px';
    } else {
      root.innerHTML = '<h2>Controls</h2>';
      const table = document.createElement('table');
      for (const [keys, what] of CONTROLS) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="k">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</td><td>${what}</td>`;
        table.appendChild(tr);
      }
      root.appendChild(table);
      root.appendChild(button('Back', '', () => go('main')));
    }
  }

  function go(v: typeof view): void {
    view = v;
    render();
  }

  // Esc steps back out of a sub-screen (the browser only delivers it while the pointer is free).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && view !== 'main' && !host.classList.contains('hidden')) go('main');
  });

  render();
  return {
    setStarted(s) {
      started = s;
      if (view === 'main') render();
    },
    showMain() {
      go('main');
    },
  };
}
