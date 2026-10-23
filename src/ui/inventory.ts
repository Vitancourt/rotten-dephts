import { BACKPACK_CAP, findItem, type Inventory, type QuickRef } from '../sim/inventory';
import { RARITY_COLOR, SLOTS, SLOT_LABEL, STAT_LABEL, type Item, type Slot, type Stats } from '../sim/items';
import type { Derived, Levels } from '../sim/stats';

export interface InvView {
  inv: Inventory;
  derived: Derived;
  levels: Levels;
  /** Level-ups are only allowed at a checkpoint cage. */
  canLevel: boolean;
  levelCost: number;
  depth: number;
}

export interface InvHandlers {
  equip(id: string): void;
  unequip(slot: Slot): void;
  drop(id: string): void;
  levelUp(stat: keyof Levels): void;
  assignQuick(slot: number, ref: QuickRef): void;
  clearQuick(slot: number): void;
}

export interface InventoryUi {
  open(v: InvView): void;
  close(): void;
  isOpen(): boolean;
  refresh(v: InvView): void;
}

const CSS = `
#inv{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:30;font:14px monospace;color:#cdbf9f;user-select:none}
#inv.open{display:flex}
#inv .panel{width:min(880px,96vw);max-height:92vh;overflow:auto;background:#14110e;border:2px solid #5a4a30;padding:16px 20px;box-shadow:0 0 40px #000}
#inv h2{margin:0 0 10px;font:bold 20px serif;letter-spacing:.12em;color:#d8c9a6;display:flex;justify-content:space-between}
#inv .cols{display:grid;grid-template-columns:260px 1fr 190px;gap:18px}
#inv h3{margin:0 0 8px;font-size:12px;letter-spacing:.15em;color:#8c7c5a;text-transform:uppercase}
#inv .slot{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px 8px;border:1px solid #3a3020;background:#1b1713;min-height:34px;cursor:pointer}
#inv .slot:hover{background:#241e17}
#inv .slot .lbl{width:68px;color:#7a6c4e;font-size:11px;text-transform:uppercase}
#inv .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
#inv .cell{aspect-ratio:1;border:2px solid #3a3020;background:#1b1713;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;cursor:pointer;padding:2px;line-height:1.1}
#inv .cell:hover{background:#2a2218}
#inv .cell.empty{cursor:default;opacity:.4}
#inv .stat{display:flex;justify-content:space-between;margin-bottom:4px}
#inv .lv{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
#inv button{background:#2a2218;color:#d8c9a6;border:1px solid #5a4a30;padding:2px 8px;font:inherit;cursor:pointer}
#inv button:disabled{opacity:.3;cursor:default}
#inv .hint{margin-top:10px;font-size:11px;color:#7a6c4e}
#invtip{position:fixed;z-index:40;pointer-events:none;background:#0d0b09;border:1px solid #5a4a30;padding:8px 10px;font:13px monospace;color:#cdbf9f;min-width:170px;display:none;box-shadow:0 0 16px #000}
#invtip .up{color:#6fd36a}#invtip .down{color:#e25a4a}
`;

const abbr = (it: Item): string => it.base.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3);

export function createInventoryUi(h: InvHandlers): InventoryUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'inv';
  document.body.appendChild(root);
  const tip = document.createElement('div');
  tip.id = 'invtip';
  document.body.appendChild(tip);

  let isOpen = false;
  let hover: QuickRef | null = null;
  // Hover an item (or the flask) and press Q or E to bind it to that quick slot.
  window.addEventListener('keydown', (e) => {
    if (!isOpen || !hover || e.repeat) return;
    const slot = e.code === 'KeyQ' ? 0 : e.code === 'KeyE' ? 1 : -1;
    if (slot < 0) return;
    h.assignQuick(slot, hover);
  });
  const hoverOn = (ref: QuickRef | null) => { hover = ref; };

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  function tooltip(it: Item, vs: Item | null): string {
    const lines: string[] = [];
    lines.push(`<div style="color:${RARITY_COLOR[it.rarity]};font-weight:bold">${it.name}</div>`);
    lines.push(`<div style="color:#7a6c4e;margin-bottom:4px">${it.rarity} ${SLOT_LABEL[it.slot].toLowerCase()}</div>`);
    for (const k of Object.keys(STAT_LABEL) as (keyof Stats)[]) {
      const v = it.stats[k];
      if (v === undefined) continue;
      let diff = '';
      if (vs && vs !== it) {
        const d = v - (vs.stats[k] ?? 0);
        if (d !== 0) diff = ` <span class="${d > 0 ? 'up' : 'down'}">(${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))})</span>`;
      }
      lines.push(`<div>${STAT_LABEL[k]}: ${v > 0 ? '+' : ''}${fmt(v)}${diff}</div>`);
    }
    if (it.weapon) {
      const w = it.weapon;
      lines.push(`<div style="color:#8c7c5a;margin-top:4px">Reach ${w.reach.toFixed(1)}m · Swing ${(w.windup + w.strike + w.recover).toFixed(2)}s · ${w.staminaCost} stamina</div>`);
    }
    return lines.join('');
  }

  function showTip(e: MouseEvent, html: string): void {
    tip.innerHTML = html;
    tip.style.display = 'block';
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => (tip.style.display = 'none');

  function render(v: InvView): void {
    const { inv, derived: d, levels: lv } = v;
    root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h2><span>EQUIPMENT</span><span style="font:13px monospace;letter-spacing:0">Depth ${v.depth} · <span style="color:#e2b93b">${inv.gold} gold</span> · <span style="color:#7fd0ff">${inv.xp} xp</span></span></h2>`;
    const cols = document.createElement('div');
    cols.className = 'cols';

    // Equipped slots.
    const left = document.createElement('div');
    left.innerHTML = '<h3>Equipped</h3>';
    for (const s of SLOTS) {
      const it = inv.equipped[s];
      const row = document.createElement('div');
      row.className = 'slot';
      row.innerHTML = `<span class="lbl">${SLOT_LABEL[s]}</span><span style="color:${it ? RARITY_COLOR[it.rarity] : '#4a4030'}">${it ? it.name : '— empty —'}</span>`;
      if (it) {
        row.onclick = () => h.unequip(s);
        row.onmousemove = (e) => { hoverOn({ type: 'item', id: it.id }); showTip(e, tooltip(it, null) + '<div style="color:#7a6c4e;margin-top:4px">Click: unequip · Q / E: bind to quick slot</div>'); };
        row.onmouseleave = () => { hoverOn(null); hideTip(); };
      }
      left.appendChild(row);
    }
    // Consumables and quick slots.
    const flaskRow = document.createElement('div');
    flaskRow.className = 'slot';
    flaskRow.style.marginTop = '12px';
    flaskRow.innerHTML = `<span class="lbl">Flasks</span><span style="color:#d8584a">Health Flask ×${inv.flasks}</span>`;
    flaskRow.onmousemove = (e) => { hoverOn({ type: 'flask' }); showTip(e, '<div style="color:#d8584a;font-weight:bold">Health Flask</div><div>Restores 30% health</div><div style="color:#7a6c4e;margin-top:4px">Q / E: bind to quick slot</div>'); };
    flaskRow.onmouseleave = () => { hoverOn(null); hideTip(); };
    left.appendChild(flaskRow);
    const qh = document.createElement('h3');
    qh.style.marginTop = '12px';
    qh.textContent = 'Quick slots';
    left.appendChild(qh);
    ['Q', 'E'].forEach((key, i) => {
      const ref = inv.quick[i];
      let label = '— empty —', color = '#4a4030';
      if (ref?.type === 'flask') { label = `Health Flask ×${inv.flasks}`; color = '#d8584a'; }
      else if (ref?.type === 'item') {
        const it = findItem(inv, ref.id);
        label = it ? it.name : '(not carried)';
        color = it ? RARITY_COLOR[it.rarity] : '#7a4a3a';
      }
      const row = document.createElement('div');
      row.className = 'slot';
      row.innerHTML = `<span class="lbl" style="color:#d8c9a6">[ ${key} ]</span><span style="color:${color}">${label}</span>`;
      row.oncontextmenu = (e) => { e.preventDefault(); h.clearQuick(i); };
      row.title = 'Right-click to clear';
      left.appendChild(row);
    });
    cols.appendChild(left);

    // Backpack.
    const mid = document.createElement('div');
    mid.innerHTML = `<h3>Backpack (${inv.backpack.length}/${BACKPACK_CAP})</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (let i = 0; i < BACKPACK_CAP; i++) {
      const it = inv.backpack[i];
      const c = document.createElement('div');
      c.className = 'cell' + (it ? '' : ' empty');
      if (it) {
        c.style.borderColor = RARITY_COLOR[it.rarity];
        c.style.color = RARITY_COLOR[it.rarity];
        c.textContent = abbr(it);
        c.onclick = () => h.equip(it.id);
        c.oncontextmenu = (e) => {
          e.preventDefault();
          hideTip();
          h.drop(it.id);
        };
        c.onmousemove = (e) => {
          hoverOn({ type: 'item', id: it.id });
          showTip(e, tooltip(it, inv.equipped[it.slot]) + '<div style="color:#7a6c4e;margin-top:4px">Click: equip · Right-click: drop · Q / E: bind to quick slot</div>');
        };
        c.onmouseleave = () => { hoverOn(null); hideTip(); };
      }
      grid.appendChild(c);
    }
    mid.appendChild(grid);
    cols.appendChild(mid);

    // Stats and levels.
    const right = document.createElement('div');
    const dmg = Math.round(d.weapon.damage);
    right.innerHTML = `<h3>Stats</h3>
      <div class="stat"><span>Health</span><span>${d.maxHp}</span></div>
      <div class="stat"><span>Stamina</span><span>${d.maxStamina}</span></div>
      <div class="stat"><span>Damage</span><span>${dmg}</span></div>
      <div class="stat"><span>Defense</span><span>${d.defense}</span></div>
      <div class="stat"><span>Speed</span><span>${Math.round(d.speedMul * 100)}%</span></div>
      <div class="stat"><span>Block</span><span>${d.blockPct}%${d.blockSource === 'torch' ? ' (torch)' : ''}</span></div>
      <h3 style="margin-top:14px">Level up</h3>`;
    const names: [keyof Levels, string][] = [['vit', 'Vitality'], ['end', 'Endurance'], ['str', 'Strength']];
    for (const [k, label] of names) {
      const row = document.createElement('div');
      row.className = 'lv';
      row.innerHTML = `<span>${label} ${lv[k]}</span>`;
      const b = document.createElement('button');
      b.textContent = `+ ${v.levelCost}xp`;
      b.disabled = !v.canLevel || inv.xp < v.levelCost;
      b.onclick = () => h.levelUp(k);
      row.appendChild(b);
      right.appendChild(row);
    }
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent = v.canLevel ? 'Spend xp at the cage.' : 'Rest at a cage to spend xp.';
    right.appendChild(note);
    cols.appendChild(right);

    panel.appendChild(cols);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'I / Tab: close · hover an item and press Q or E to bind it · right-click a quick slot to clear';
    panel.appendChild(hint);
    root.appendChild(panel);
  }

  return {
    open(v) {
      isOpen = true;
      render(v);
      root.classList.add('open');
    },
    close() {
      isOpen = false;
      hover = null;
      root.classList.remove('open');
      hideTip();
    },
    isOpen: () => isOpen,
    refresh(v) {
      if (isOpen) render(v);
    },
  };
}
