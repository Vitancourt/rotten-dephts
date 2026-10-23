import { STAT_LABEL, RARITY_COLOR, type Item, type Stats } from '../sim/items';
import { flasksLeft, type ShopSales, type Stock } from '../sim/shop';

export interface ShopView {
  depth: number;
  gold: number;
  stock: Stock;
  sales: ShopSales;
}

export interface ShopHandlers {
  buyFlask(): void;
  buyItem(id: string): void;
  close(): void;
}

export interface ShopUi {
  open(v: ShopView): void;
  close(): void;
  isOpen(): boolean;
  refresh(v: ShopView): void;
  /** Shows a short line under the title (e.g. "Your backpack is full"). */
  note(text: string): void;
}

const CSS = `
#shop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:30;font:14px monospace;color:#cdbf9f;user-select:none}
#shop.open{display:flex}
#shop .panel{width:min(620px,96vw);max-height:92vh;overflow:auto;background:#14110e;border:2px solid #5a4a30;padding:16px 20px;box-shadow:0 0 40px #000}
#shop h2{margin:0 0 4px;font:bold 20px serif;letter-spacing:.12em;color:#d8c9a6;display:flex;justify-content:space-between}
#shop .sub{font-size:12px;color:#8c7c5a;margin-bottom:12px;min-height:1.2em}
#shop .row{display:flex;align-items:center;gap:12px;padding:8px 10px;margin-bottom:6px;border:1px solid #3a3020;background:#1b1713}
#shop .row .info{flex:1}
#shop .row .name{font-weight:bold}
#shop .row .stats{font-size:12px;color:#9a8b6a;margin-top:2px}
#shop .row .price{color:#e2b93b;min-width:64px;text-align:right}
#shop .row.sold{opacity:.35}
#shop button{background:#2a2218;color:#d8c9a6;border:1px solid #5a4a30;padding:4px 12px;font:inherit;cursor:pointer}
#shop button:disabled{opacity:.3;cursor:default}
#shop .hint{margin-top:10px;font-size:11px;color:#7a6c4e}
`;

const statLine = (it: Item): string =>
  (Object.entries(it.stats) as [keyof Stats, number][]).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${STAT_LABEL[k]}`).join(' · ');

export function createShopUi(h: ShopHandlers): ShopUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'shop';
  document.body.appendChild(root);
  let noteText = '';
  let last: ShopView | null = null;

  function render(v: ShopView): void {
    last = v;
    const left = flasksLeft(v.stock, v.sales);
    const rows = v.stock.items.map((e) => {
      const sold = v.sales.items.includes(e.id);
      return `<div class="row ${sold ? 'sold' : ''}"><div class="info"><div class="name" style="color:${RARITY_COLOR[e.item.rarity]}">${e.item.name}</div><div class="stats">${e.item.slot} · ${statLine(e.item)}</div></div><div class="price">${sold ? 'Sold' : `${e.price}g`}</div><button data-item="${e.id}" ${sold || v.gold < e.price ? 'disabled' : ''}>Buy</button></div>`;
    });
    root.innerHTML = `<div class="panel"><h2><span>Wandering Merchant</span><span style="color:#e2b93b">${v.gold}g</span></h2>
      <div class="sub">Depth ${v.depth}${noteText ? ` — ${noteText}` : ''}</div>
      <div class="row ${left <= 0 ? 'sold' : ''}"><div class="info"><div class="name" style="color:#d86a6a">Health Flask</div><div class="stats">Restores 30% health · ${left > 0 ? `${left} left` : 'sold out'}</div></div><div class="price">${v.stock.flaskPrice}g</div><button data-flask ${left <= 0 || v.gold < v.stock.flaskPrice ? 'disabled' : ''}>Buy</button></div>
      ${rows.join('')}
      <div class="hint">Stock changes with every floor you descend. [Esc] / [Tab] to leave.</div>
      <div style="text-align:right;margin-top:8px"><button data-close>Leave</button></div></div>`;
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t || (t as HTMLButtonElement).disabled) return;
    if (t.hasAttribute('data-flask')) h.buyFlask();
    else if (t.dataset.item) h.buyItem(t.dataset.item);
    else if (t.hasAttribute('data-close')) h.close();
  });

  return {
    open(v) { noteText = ''; render(v); root.classList.add('open'); },
    close() { root.classList.remove('open'); },
    isOpen: () => root.classList.contains('open'),
    refresh(v) { if (root.classList.contains('open')) render(v); },
    note(text) { noteText = text; if (last) render(last); },
  };
}
