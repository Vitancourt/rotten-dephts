import * as THREE from 'three';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { audioProbe, initAudio, setMusicMode, setMusicVolume, setVolume, sfx } from './core/audio';
import { PLAYER_RADIUS, rectSolids, stepPlayer, withExtras, type PlayerState, type Solids } from './sim/movement';
import { blockIncoming, createCombat, inGuardArc, isGuarding, stepCombat, stepGuard, stepSprint, type Target } from './sim/combat';
import { createVitals, damagePlayer, stepVitals } from './sim/player';
import { buildNav, type NavGrid } from './sim/nav';
import {
  beginEnemyTick, createEnemy, damageEnemy, ENEMY_DEFS, forceRise, isHittable, separateEnemies, stepEnemy, type Enemy,
} from './sim/enemy';
import { canMove, createIntro, gateOpenness, skipIntro, startIntro, stepIntro, cageSolids, type CageSolids } from './sim/intro';
import { FloorSolids, floorBounds, generateFloor, hasCage, TILE, toTile, type Floor } from './sim/floorgen';
import { hashSeed, mulberry32 } from './sim/rng';
import { createInventory, addToBackpack, assignQuick, clearQuick, equip, findItem, MAX_FLASKS, removeFromBackpack, unequip, useQuick } from './sim/inventory';
import { dieAndDrop, nextMarker, recoverMarker, type Marker } from './sim/death';
import { newSave } from './sim/save';
import { levelCost, tryLevelUp, xpReward } from './sim/progression';
import { computeDerived, mitigate, type Levels } from './sim/stats';
import { genItem, RARITY_COLOR } from './sim/items';
import { HEAL_FRACTION, newDropId, rollBossDrops, rollEnemyDrops, scatter, type Drop } from './sim/loot';
import { bossActive, bossHittable, bossTier, createBoss, damageBoss, stepBoss, type Boss, type BossEvent } from './sim/boss';
import { randInt } from './sim/rng';
import { eraseSave, loadSave, writeSave } from './save/storage';
import { blendToTorchGuard, poseBelt, poseHand, poseOffhand, poseShield } from './render/swing';
import { createEnemyView, updateEnemyView, type EnemyView } from './render/enemies';
import { createBossView, disposeBossView, updateBossView, type BossView } from './render/boss';
import { buildShieldMesh, buildWeaponMesh } from './render/weapons';
import { Arm, buildHand, type HandRig } from './render/hands';
import { LootView } from './render/loot';
import { MarkerView } from './render/marker';
import { FloorView } from './render/floorView';
import { createRenderer, createScene, enableShadows, EYE_HEIGHT } from './render/scene';
import { PostFx } from './render/post';
import { createMinimap } from './ui/minimap';
import { createShopUi } from './ui/shop';
import { MERCHANT_RADIUS } from './render/merchant';
import { buyFlask, buyItem, stockFor, type BuyResult, type ShopSales, type Stock } from './sim/shop';
import { createDust } from './render/dust';
import { ArrowView } from './render/arrows';
import { createArrow, stepArrows, type Arrow } from './sim/projectile';
import { QualityGovernor } from './render/quality';
import { createExplored, revealAround } from './sim/explore';
import { createHud, type QuickHud } from './ui/hud';
import { createFpsCounter } from './ui/fps';
import { createInventoryUi, type InvView } from './ui/inventory';
import { Effects } from './render/particles';
import { Floaters } from './ui/floaters';
import { loadSettings } from './ui/settings';
import { createMenu } from './ui/menu';

const MOUSE_SENS = 0.0022;
const CULL_DIST = 55; // enemies farther than this are not animated or drawn
const STRIDE_WALK = 1.9;
const STRIDE_SPRINT = 2.6;
const DEATH_TIME = 3.6;
const PICKUP_GOLD = 1.1;
const PICKUP_ITEM = 1.8;
const MARKER_REACH = 2.2;
const STAIRS_REACH = 2.6;
const CAGE_REACH = 3.2;
const MERCHANT_REACH = 3;
const AUTOSAVE_EVERY = 8;
const FADE_TIME = 0.45;

// ---------------------------------------------------------------- setup
const renderer = createRenderer();
const overlay = document.getElementById('overlay')!;
const input = new Input(renderer.domElement, overlay);
window.addEventListener('beforeunload', () => persist());
// Esc closes the inventory tab; with no mouse capture to resume, that lands on the pause menu.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && input.menuOpen) {
    setMenu(false);
    menu.showMain();
    input.syncOverlay();
  }
});
const { scene, camera, hand, updateHand, setShadows } = createScene();
const post = new PostFx(renderer, scene, camera);
const hud = createHud();
const minimap = createMinimap();
let explored: Uint8Array = new Uint8Array(0);
let lastRevealTile = -1;
const tickFps = createFpsCounter();
const crosshair = document.getElementById('crosshair')!;
const effects = new Effects(scene);
const floaters = new Floaters();
const tmpV = new THREE.Vector3();
const settings = loadSettings();
const dust = createDust();
scene.add(dust.points);
/** Applies a quality tier (see render/quality.ts) on top of the user's low-graphics setting. */
function applyTier(tier: number): void {
  const t = settings.lowGfx ? 3 : tier;
  post.setBloom(t < 1);
  post.enabled = t < 2;
  setShadows(t >= 3 ? 0 : t >= 1 ? 512 : 1024);
  dust.points.visible = t < 3;
  renderer.setPixelRatio(t >= 2 ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
}
const quality = new QualityGovernor(applyTier);
function applySettings(): void {
  setVolume(settings.volume);
  setMusicVolume(settings.music);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  applyTier(quality.tier);
}
const menu = createMenu(overlay, {
  settings,
  onSettingsChange: applySettings,
  onPlay: () => {
    initAudio();
    input.lock();
  },
  onNewGame: () => {
    eraseSave();
    window.removeEventListener('beforeunload', persist);
    location.reload();
  },
});
input.onUnlock = () => menu.showMain();
applySettings();
const rng = mulberry32((Date.now() & 0xffffffff) >>> 0);

// ---------------------------------------------------------------- run state (persisted)
const loaded = loadSave();
const inv = loaded?.inv ?? createInventory(rng);
const levels: Levels = loaded?.levels ?? { vit: 0, end: 0, str: 0 };
let floorNo = loaded?.floor ?? 1;
let marker: Marker | null = loaded?.marker ?? null;
let deaths = loaded?.deaths ?? 0;
const runSeed = loaded?.seed ?? (Date.now() & 0x7fffffff);
let checkpoint = loaded?.checkpoint ?? 1;
const bosses: number[] = loaded?.bosses ?? [];
const looted: Record<string, number[]> = loaded?.looted ?? {};
const killed: Record<string, number[]> = loaded?.killed ?? {};
const shopSales: Record<string, ShopSales> = loaded?.shop ?? {};
let shopStock: Stock | null = null;

function persist(): void {
  const data = newSave(runSeed, inv);
  data.floor = floorNo;
  data.checkpoint = checkpoint;
  data.bosses = bosses;
  data.levels = levels;
  data.marker = marker;
  data.deaths = deaths;
  data.looted = looted;
  data.killed = killed;
  data.shop = shopSales;
  writeSave(data);
}

// ---------------------------------------------------------------- live state
const player: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0 };
let vitals = createVitals();
let combat = createCombat();
let derived = computeDerived(inv.equipped, levels);
const intro = createIntro();
let shake = 0;
let deadTimer = 0;
let started = false;
let autosaveTimer = 0;
let stepAccum = 0;
let lastRender = performance.now() / 1000;

// Floor-scoped state, rebuilt by loadFloor().
let floor!: Floor;
let nav!: NavGrid;
let closedWorld!: Solids;
let openWorld!: Solids;
let cage: CageSolids | null = null;
let floorView: FloorView | null = null;
let enemies: Enemy[] = [];
let enemyViews: EnemyView[] = [];
let drops: Drop[] = [];
let arrows: Arrow[] = [];
let boss: Boss | null = null;
let bossView: BossView | null = null;
let gateCur = 0; // stairs gate openness, animated
const entityGroup = new THREE.Group();
scene.add(entityGroup);
const lootView = new LootView(scene);
const markerView = new MarkerView(scene);
const arrowView = new ArrowView(scene);

// Transition between floors.
let fade: { phase: 'out' | 'in'; t: number; then: () => void } | null = null;

// ---------------------------------------------------------------- held items
const swingProxy = new THREE.Group();
camera.add(swingProxy);
let weaponMesh: THREE.Object3D | null = null;
let weaponShownId: string | null = '';
let shieldMesh: THREE.Object3D | null = null;
let shieldShownId: string | null = '';

// Hands and arms. The torch can be held in either hand, so it carries one of each.
const rightArm = new Arm(camera, false);
const leftArm = new Arm(camera, true);
const GRIP_Y = 0.2; // where a hand sits on the torch's stick
const torchHandR = buildHand(false);
const torchHandL = buildHand(true);
for (const h of [torchHandR, torchHandL]) {
  h.group.position.set(0, GRIP_Y, 0);
  hand.add(h.group);
}
const fistHand = buildHand(false); // bare right hand, when no weapon is equipped
swingProxy.add(fistHand.group);
const idleHandL = buildHand(true); // empty left hand, resting
const idleHolder = new THREE.Group();
idleHolder.add(idleHandL.group);
camera.add(idleHolder);
let weaponHand: HandRig | null = null;
let shieldHand: HandRig | null = null;

function syncHeld(): void {
  const w = inv.equipped.weapon;
  const id = w?.id ?? null;
  if (id === weaponShownId) return;
  weaponShownId = id;
  if (weaponMesh) {
    camera.remove(weaponMesh);
    weaponMesh = null;
  }
  if (w && w.base !== 'Torch') {
    weaponMesh = buildWeaponMesh(w);
    weaponHand = buildHand(false);
    weaponHand.group.position.set(0, w.base === 'Mace' || w.base === 'Battle Axe' ? 0.16 : 0.08, 0);
    weaponHand.group.scale.setScalar(1 / 0.8); // cancel the weapon model's 80% scale (hands bring their own size)
    weaponMesh.add(weaponHand.group);
    camera.add(weaponMesh);
  } else {
    weaponHand = null;
  }
}

function syncShield(): void {
  const sh = inv.equipped.offhand;
  const id = sh?.id ?? null;
  if (id === shieldShownId) return;
  shieldShownId = id;
  if (shieldMesh) {
    camera.remove(shieldMesh);
    shieldMesh = null;
  }
  if (sh) {
    shieldMesh = buildShieldMesh(sh);
    shieldHand = buildHand(true);
    shieldHand.group.position.set(0, -0.1, 0.07); // gripping a handle on the back of the shield
    shieldMesh.add(shieldHand.group);
    camera.add(shieldMesh);
  } else {
    shieldHand = null;
  }
}

function recompute(): void {
  derived = computeDerived(inv.equipped, levels);
  vitals.maxHp = derived.maxHp;
  vitals.hp = Math.min(vitals.hp, vitals.maxHp);
  combat.maxStamina = derived.maxStamina;
  combat.stamina = Math.min(combat.stamina, combat.maxStamina);
  combat.regen = derived.staminaRegen;
  syncHeld();
  syncShield();
}

// ---------------------------------------------------------------- floors
function clearFloor(): void {
  floorView?.dispose();
  floorView = null;
  for (const v of enemyViews) v.rig.group.removeFromParent();
  enemyViews = [];
  enemies = [];
  arrows = [];
  drops = [];
  if (bossView) disposeBossView(bossView);
  bossView = null;
  boss = null;
  lootView.clear();
  floaters.clear();
}

function arrivalSpot(f: Floor): { x: number; z: number } {
  const open = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < f.w && ty < f.h && f.tiles[ty * f.w + tx] === 1;
  for (const [dx, dz] of [[0, 2.6], [0, -2.6], [2.6, 0], [-2.6, 0]]) {
    const x = f.start.x + dx, z = f.start.z + dz;
    const tx = toTile(x), tz = toTile(z);
    if (open(tx, tz) && open(tx + 1, tz) && open(tx - 1, tz) && open(tx, tz + 1) && open(tx, tz - 1)) return { x, z };
  }
  return { x: f.start.x, z: f.start.z };
}

/** Builds floor `depth`. `how`: 'intro' wakes you in the cage, 'arrive' puts you beside the cage or start. */
function loadFloor(depth: number, how: 'intro' | 'arrive' | 'up'): void {
  clearFloor();
  floorNo = depth;
  floor = generateFloor(runSeed, depth);
  const base = new FloorSolids(floor);
  cage = hasCage(depth) ? cageSolids(floor.start.x, floor.start.z) : null;
  // Pathfinding treats the whole cage (gate included) as solid so nobody plans a route through its corner.
  nav = buildNav(floorBounds(floor), cage ? withExtras(base, cage.closed) : base, PLAYER_RADIUS + 0.1);

  floorView = new FloorView(floor);
  scene.add(floorView.group);
  explored = createExplored(floor);
  lastRevealTile = -1;
  minimap.setFloor(floor, explored);
  quality.resetWarmup();

  closedWorld = cage ? withExtras(base, cage.closed) : base;
  openWorld = cage ? withExtras(base, cage.open) : base;

  const dead = new Set(killed[depth] ?? []);
  enemies = [];
  floor.spawns.forEach((s, i) => {
    if (dead.has(i)) return;
    const e = createEnemy(s.kind, s.x, s.z, depth);
    e.spawnIndex = i;
    enemies.push(e);
  });
  enemyViews = enemies.map((e) => createEnemyView(entityGroup, e));
  enableShadows(entityGroup);
  shopStock = floor.merchant ? stockFor(runSeed, depth) : null;

  if (floor.isBossFloor && floor.boss && !bosses.includes(depth)) {
    boss = createBoss(depth, floor.boss.x, floor.boss.z);
    bossView = createBossView(entityGroup, boss);
    enableShadows(entityGroup);
  }

  const taken = new Set(looted[depth] ?? []);
  floor.loot.forEach((spot, i) => {
    if (taken.has(i)) return;
    const r = mulberry32(hashSeed(runSeed, depth, 77, i));
    if (spot.kind === 'heal') drops.push({ id: newDropId(), x: spot.x, z: spot.z, heal: HEAL_FRACTION, spot: i });
    else if (spot.kind === 'gold') drops.push({ id: newDropId(), x: spot.x, z: spot.z, gold: Math.round(randInt(r, 8, 20) * (1 + 0.25 * (depth - 1))), spot: i });
    else drops.push({ id: newDropId(), x: spot.x, z: spot.z, item: genItem(r, depth), spot: i });
  });

  if (how === 'intro' && cage) {
    player.x = floor.start.x;
    player.z = floor.start.z;
    startIntro(intro);
  } else if (how === 'up') {
    // Coming back up: stand a little way in front of this floor's way down, facing into the room.
    const st = floor.stairs;
    player.x = st.frontX + st.nx * 1.4;
    player.z = st.frontZ + st.nz * 1.4;
    skipIntro(intro);
  } else {
    const a = how === 'arrive' ? arrivalSpot(floor) : { x: floor.start.x, z: floor.start.z };
    player.x = a.x;
    player.z = a.z;
    skipIntro(intro);
  }
  player.yaw = how === 'up' ? Math.atan2(-floor.stairs.nx, -floor.stairs.nz) : 0;
  player.pitch = 0;

  gateCur = stairsUnlocked() ? 1 : 0;
  floorView.setGate(gateCur);
  if (marker && marker.floor === depth) markerView.place(marker.x, marker.z);
  else markerView.hide();
}

const stairsUnlocked = (): boolean => !floor.isBossFloor || bosses.includes(floor.depth);

function beginTransition(then: () => void): void {
  if (!fade) fade = { phase: 'out', t: 0, then };
}

function descend(): void {
  sfx.stairs();
  beginTransition(() => {
    loadFloor(floorNo + 1, 'arrive');
    if (hasCage(floorNo)) {
      checkpoint = floorNo;
      vitals.hp = vitals.maxHp;
      hud.message(`Depth ${floorNo} — a cage stands here. You can rest.`, 4000);
    } else {
      hud.message(`Depth ${floorNo}`, 2500);
    }
    persist();
  });
}

function ascend(): void {
  sfx.stairs();
  beginTransition(() => {
    loadFloor(floorNo - 1, 'up');
    hud.message(`Depth ${floorNo}`, 2500);
    persist();
  });
}

function respawn(): void {
  for (const k of Object.keys(killed)) delete killed[k]; // the dead walk again after you fall
  vitals = createVitals();
  combat = createCombat();
  deadTimer = 0;
  shake = 0;
  loadFloor(checkpoint, 'intro');
  recompute();
  hud.setDeath(0);
  hud.message('You wake in the cage once more…', 4000);
}

// ---------------------------------------------------------------- inventory UI
const nearCage = (): boolean =>
  !!cage && intro.phase === 'free' && Math.hypot(player.x - floor.start.x, player.z - floor.start.z) < CAGE_REACH;

const invView = (): InvView => ({ inv, derived, levels, canLevel: nearCage(), levelCost: levelCost(levels), depth: floorNo });
const invUi = createInventoryUi({
  equip: (id) => { if (equip(inv, id)) { sfx.equip(); recompute(); refreshUi(); persist(); } },
  unequip: (slot) => { if (unequip(inv, slot)) { sfx.equip(); recompute(); refreshUi(); persist(); } },
  drop: (id) => {
    const it = removeFromBackpack(inv, id);
    if (!it) return;
    drops.push({ id: newDropId(), x: player.x - Math.sin(player.yaw) * 0.9, z: player.z - Math.cos(player.yaw) * 0.9, item: it });
    refreshUi();
    persist();
  },
  assignQuick: (slot, ref) => { assignQuick(inv, slot, ref); sfx.equip(); refreshUi(); persist(); },
  clearQuick: (slot) => { clearQuick(inv, slot); refreshUi(); persist(); },
  levelUp: (stat) => {
    if (!nearCage() || !tryLevelUp(inv, levels, stat)) return;
    sfx.levelUp();
    recompute();
    refreshUi();
    persist();
  },
});
function refreshUi(): void {
  invUi.refresh(invView());
}

const salesFor = (d: number): ShopSales => (shopSales[d] ??= { flasks: 0, items: [] });
const shopView = () => ({ depth: floorNo, gold: inv.gold, stock: shopStock!, sales: salesFor(floorNo) });
const BUY_NOTE: Record<BuyResult, string> = { ok: '', gold: 'Not enough gold', full: 'No room to carry that', soldout: 'Sold out' };
function afterBuy(res: BuyResult): void {
  if (res === 'ok') {
    sfx.coin();
    recompute();
    persist();
  } else {
    hud.message(BUY_NOTE[res], 1500);
  }
  refreshUi();
  shopUi.refresh(shopView());
  shopUi.note(BUY_NOTE[res]);
}
const shopUi = createShopUi({
  buyFlask: () => afterBuy(buyFlask(inv, shopStock!, salesFor(floorNo))),
  buyItem: (id) => afterBuy(buyItem(inv, shopStock!, salesFor(floorNo), id)),
  close: () => setMenu(false),
});
function openShop(): void {
  if (!shopStock) return;
  input.menuOpen = true;
  shopUi.open(shopView());
  document.exitPointerLock();
  input.syncOverlay();
}

function setMenu(open: boolean): void {
  input.menuOpen = open;
  if (open) {
    invUi.open(invView());
    document.exitPointerLock();
  } else {
    invUi.close();
    shopUi.close();
    input.clearPresses(); // Q/E/F hit while the menu was open must not fire afterwards
    input.lock(); // if the browser refuses, the pause menu shows instead
  }
  input.syncOverlay();
}

// ---------------------------------------------------------------- gameplay
function onEnemyKilled(e: Enemy): void {
  if (e.spawnIndex !== undefined) (killed[floorNo] ??= []).push(e.spawnIndex);
  sfx.enemyDie();
  effects.death(e.x, e.z);
  inv.xp += xpReward(ENEMY_DEFS[e.kind].xp, floorNo);
  drops.push(...scatter(rng, e.x, e.z, rollEnemyDrops(rng, e.kind, floorNo)));
}

function nearestItemDrop(): Drop | null {
  let best: Drop | null = null;
  let bd = PICKUP_ITEM;
  for (const d of drops) {
    if (!d.item) continue;
    const dist = Math.hypot(d.x - player.x, d.z - player.z);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}

function markSpotTaken(d: Drop): void {
  if (d.spot === undefined) return;
  (looted[floorNo] ??= []).push(d.spot);
}

/** Every hit on the player goes through here: a raised guard absorbs frontal blows, then armour applies. */
function hurtPlayer(raw: number, fromX: number, fromZ: number, heavy = false): void {
  if (vitals.dead || vitals.invuln > 0) return;
  let dmg = raw;
  let blocked = false;
  if (inGuardArc(player.x, player.z, player.yaw, fromX, fromZ)) {
    const r = blockIncoming(combat, raw, derived.blockPct);
    dmg = r.damage;
    blocked = r.blocked;
    if (r.broken) {
      sfx.guardBreak();
      hud.message('Your guard breaks!', 1500);
    }
  }
  if (!damagePlayer(vitals, mitigate(dmg, derived.defense), blocked)) return;
  if (blocked) {
    sfx.block();
    shake = Math.max(shake, 0.3);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    effects.hit(player.x + fx * 0.9, 1.3, player.z + fz * 0.9);
    floaters.spawn(player.x + fx * 1.2, 1.7, player.z + fz * 1.2, `Blocked ${Math.round(derived.blockPct)}%`, '#9ec3d8');
  } else {
    sfx.playerHurt();
    shake = Math.max(shake, heavy ? 1 : 0.8);
  }
}

const now = (): number => performance.now() / 1000;
let quickCooldown = 0;

function useQuickSlot(slot: number): void {
  const r = useQuick(inv, slot, vitals.hp >= vitals.maxHp);
  if (r.kind === 'drank' || r.kind === 'equipped') quickCooldown = now() + 0.5; // only real uses cool down
  switch (r.kind) {
    case 'drank':
      vitals.hp = Math.min(vitals.maxHp, vitals.hp + vitals.maxHp * r.heal);
      sfx.heal();
      effects.pickup(player.x, 1.2, player.z, 0xff6a6a);
      hud.message(`+${Math.round(vitals.maxHp * r.heal)} health`, 1200);
      break;
    case 'equipped':
      recompute();
      sfx.equip();
      hud.message(`Equipped ${r.item.name}`, 1500);
      break;
    case 'full-health': hud.message('Already at full health', 1200); break;
    case 'no-flasks': hud.message('No flasks left', 1200); break;
    case 'missing': hud.message('You are not carrying that', 1500); break;
    case 'already-equipped':
    case 'empty':
      break;
  }
  if (r.kind === 'drank' || r.kind === 'equipped') {
    refreshUi();
    persist();
  }
}

function quickHud(): QuickHud[] {
  return ['Q', 'E'].map((key, i) => {
    const q = inv.quick[i];
    if (!q) return { key, label: '—', color: '#4a4030', dim: true };
    if (q.type === 'flask') return { key, label: 'Flask', color: '#d8584a', count: inv.flasks, dim: inv.flasks <= 0 };
    const it = findItem(inv, q.id);
    if (!it) return { key, label: '?', color: '#7a4a3a', dim: true };
    const equipped = inv.equipped[it.slot]?.id === it.id;
    return { key, label: it.base.length > 10 ? it.base.slice(0, 9) + '…' : it.base, color: RARITY_COLOR[it.rarity], dim: equipped };
  });
}

function playerInArena(): boolean {
  if (!floor.isBossFloor) return false;
  const r = floor.rooms[floor.stairsRoom];
  return player.x > r.x * TILE && player.x < (r.x + r.w) * TILE && player.z > r.y * TILE && player.z < (r.y + r.h) * TILE;
}

function onBossEvents(events: BossEvent[]): void {
  if (!boss) return;
  for (const ev of events) {
    if (ev.type === 'wake') {
      sfx.bossRoar();
      shake = Math.max(shake, 0.6);
      hud.message(boss.def.name, 3500);
    } else if (ev.type === 'windup') {
      sfx.bossWindup();
    } else if (ev.type === 'hit') {
      sfx.bossSlam();
      effects.dust(player.x, player.z, 18);
      shake = Math.max(shake, 0.7);
      hurtPlayer(ev.damage, ev.fromX, ev.fromZ, true);
    } else if (ev.type === 'summon') {
      sfx.bossRoar();
      hud.message('The guardian calls its servants!', 2500);
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = createEnemy('skeleton', boss.x + Math.cos(a) * 3, boss.z + Math.sin(a) * 3, floorNo);
        forceRise(e);
        enemies.push(e);
        enemyViews.push(createEnemyView(entityGroup, e));
    enableShadows(entityGroup);
      }
    } else if (ev.type === 'die') {
      onBossKilled(boss);
    }
  }
}

function onBossKilled(b: Boss): void {
  sfx.bossDie();
  effects.death(b.x, b.z, true);
  const tier = bossTier(b.depth);
  inv.xp += Math.round(b.def.xp * (1 + 0.25 * tier));
  drops.push(...scatter(rng, b.x, b.z, rollBossDrops(rng, b.depth)));
  if (!bosses.includes(b.depth)) bosses.push(b.depth);
  hud.message('The guardian falls. The way down is open.', 5000);
  persist();
}

function update(dt: number): void {
  const look = input.consumeLook();
  const wantMenu = input.consumePress('KeyI') || input.consumePress('Tab');
  if (wantMenu && (input.locked || input.menuOpen) && !vitals.dead && !fade) setMenu(!input.menuOpen);
  if (!input.locked || input.menuOpen) return; // paused or in a menu
  if (!started) {
    started = true;
    menu.setStarted(true);
    if (!loaded) hud.message('You wake in a cage. The dungeon is silent… and rotten.', 4000);
  }

  // Floor transition fade.
  if (fade) {
    fade.t += dt / FADE_TIME;
    if (fade.phase === 'out' && fade.t >= 1) {
      fade.then();
      fade = { phase: 'in', t: 0, then: () => {} };
    } else if (fade.phase === 'in' && fade.t >= 1) {
      fade = null;
    }
  }
  const frozen = !!fade && fade.phase === 'out';

  if (!vitals.dead && !frozen) {
    player.yaw -= look.x * MOUSE_SENS * settings.sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - look.y * MOUSE_SENS * settings.sensitivity));
  }

  const prevPhase = intro.phase;
  stepIntro(intro, dt);
  if (prevPhase === 'caged' && intro.phase === 'opening') {
    sfx.creak();
    hud.message('The cage creaks open…', 3000);
  }

  const mobile = canMove(intro) && !vitals.dead && !frozen;
  stepGuard(combat, input.blocking && mobile, dt);
  const guarding = combat.guard > 0.3;
  const world = intro.phase === 'free' ? openWorld : closedWorld;
  if (mobile) {
    const px0 = player.x, pz0 = player.z;
    const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const side = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const sprinting = stepSprint(combat, !guarding && (input.down('ShiftLeft') || input.down('ShiftRight')) && (fwd !== 0 || side !== 0), dt);
    stepPlayer(
      player,
      {
        forward: fwd,
        strafe: side,
        sprint: sprinting,
        speedMul: derived.speedMul * (guarding ? 0.6 : 1),
      },
      dt,
      world,
    );
    stepAccum += Math.hypot(player.x - px0, player.z - pz0);
    const stride = sprinting ? STRIDE_SPRINT : STRIDE_WALK;
    if (stepAccum >= stride) {
      stepAccum = 0;
      sfx.step();
    }
  }

  // Combat.
  const before = combat.phase;
  const targets: Target[] = enemies.filter(isHittable);
  if (boss && bossHittable(boss)) targets.push(boss);
  const hits = stepCombat(combat, input.attacking && mobile, dt, player.x, player.z, player.yaw, derived.weapon, targets);
  if (before === 'idle' && combat.phase === 'windup') sfx.swing();
  for (const t of hits) {
    sfx.hitEnemy();
    shake = Math.max(shake, 0.35);
    const isBoss = !!boss && t === boss;
    effects.hit(t.x, isBoss ? 2 : 1.1, t.z);
    floaters.spawn(t.x, isBoss ? 3.4 : 1.9, t.z, String(Math.round(derived.weapon.damage)));
    if (isBoss) onBossEvents(damageBoss(boss!, derived.weapon.damage));
    else if (damageEnemy(t as Enemy, derived.weapon.damage, player.x, player.z)) onEnemyKilled(t as Enemy);
  }

  // Enemies.
  beginEnemyTick();
  for (const e of enemies) {
    for (const ev of stepEnemy(e, player.x, player.z, !vitals.dead, dt, nav, world)) {
      if (ev.type === 'rise') sfx.rise();
      else if (ev.type === 'windup') sfx.enemyWindup();
      else if (ev.type === 'shoot') {
        arrows.push(createArrow(ev.x, ev.z, ev.tx, ev.tz, ev.damage, ev.proj));
        if (ev.proj === 'fireball') sfx.fireball();
        else sfx.bow();
      } else hurtPlayer(ev.damage, ev.fromX, ev.fromZ);
    }
  }
  separateEnemies(enemies);
  const spent: Arrow[] = [];
  for (const h of stepArrows(arrows, dt, world, player.x, player.z, !vitals.dead, spent)) hurtPlayer(h.damage, h.fromX, h.fromZ);
  for (const m of spent) {
    if (m.kind !== 'fireball') continue;
    effects.hit(m.x, 1.2, m.z);
    effects.pickup(m.x, 1.2, m.z, 0xff7a20);
    sfx.boom();
  }
  if (boss && !frozen) {
    onBossEvents(stepBoss(boss, player.x, player.z, !vitals.dead, playerInArena(), dt, nav, world));
    if (bossActive(boss)) {
      const dx = player.x - boss.x, dz = player.z - boss.z;
      const min = boss.radius + PLAYER_RADIUS;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-6) {
        player.x += (dx / d) * (min - d);
        player.z += (dz / d) * (min - d);
      }
    }
  }
  const fighting = !!boss && bossActive(boss) && !vitals.dead;
  setMusicMode(fighting ? 'boss' : 'explore');
  hud.setBoss(fighting ? boss!.def.name : null, boss ? boss.hp / boss.maxHp : 0);
  if (stairsUnlocked() && gateCur < 1) gateCur = Math.min(1, gateCur + dt / 2.5);
  for (const e of enemies) {
    if (e.state === 'dormant' || e.state === 'dead' || e.state === 'rising') continue;
    const dx = player.x - e.x, dz = player.z - e.z;
    const min = e.radius + PLAYER_RADIUS;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-6) {
      player.x += (dx / d) * (min - d);
      player.z += (dz / d) * (min - d);
    }
  }

  if (floor.merchant) {
    const dx = player.x - floor.merchant.x, dz = player.z - floor.merchant.z;
    const min = MERCHANT_RADIUS + PLAYER_RADIUS;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-6) {
      player.x += (dx / d) * (min - d);
      player.z += (dz / d) * (min - d);
    }
  }

  // Pickups: gold is automatic. Everything else is an E interaction, nearest-purpose first.
  let changed = false;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.gold !== undefined && !vitals.dead && Math.hypot(d.x - player.x, d.z - player.z) < PICKUP_GOLD) {
      inv.gold += d.gold;
      effects.pickup(d.x, 0.5, d.z, 0xffd24a);
      markSpotTaken(d);
      drops.splice(i, 1);
      sfx.coin();
      changed = true;
    }
  }

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.heal !== undefined && !vitals.dead && inv.flasks < MAX_FLASKS && Math.hypot(d.x - player.x, d.z - player.z) < PICKUP_GOLD) {
      inv.flasks++;
      effects.pickup(d.x, 0.5, d.z, 0xff6a6a);
      markSpotTaken(d);
      drops.splice(i, 1);
      sfx.heal();
      hud.message('Health flask collected', 1500);
      changed = true;
    }
  }

  const alive = !vitals.dead && !frozen && intro.phase === 'free';
  const pressedE = input.consumePress('KeyF'); // interact
  for (const [slot, code] of [[0, 'KeyQ'], [1, 'KeyE']] as const) {
    if (input.consumePress(code) && alive && now() >= quickCooldown) useQuickSlot(slot);
  }
  const nearItem = alive ? nearestItemDrop() : null;
  const nearMarker = alive && marker && marker.floor === floorNo && Math.hypot(marker.x - player.x, marker.z - player.z) < MARKER_REACH;
  const nearStairs = alive && Math.hypot(floor.stairs.frontX - player.x, floor.stairs.frontZ - player.z) < STAIRS_REACH;
  const nearCageNow = alive && nearCage();
  // Merchant and up stairs share a corner: whichever you stand closer to wins the prompt.
  const dUp = floor.upStairs ? Math.hypot(floor.upStairs.frontX - player.x, floor.upStairs.frontZ - player.z) : Infinity;
  const dMerchant = floor.merchant ? Math.hypot(floor.merchant.x - player.x, floor.merchant.z - player.z) : Infinity;
  const nearUp = alive && dUp < STAIRS_REACH && dUp <= dMerchant;
  const nearMerchant = alive && dMerchant < MERCHANT_REACH && dMerchant < dUp;

  if (nearMarker && marker) {
    hud.prompt('[F] Recover your lost belongings');
    if (pressedE) {
      recoverMarker(inv, marker);
      effects.pickup(marker.x, 0.8, marker.z, 0x7fd0ff);
      marker = null;
      markerView.hide();
      recompute();
      sfx.recover();
      hud.message('You recover what you lost.', 3000);
      changed = true;
    }
  } else if (nearItem) {
    hud.prompt(`[F] Pick up <span style="color:${RARITY_COLOR[nearItem.item!.rarity]}">${nearItem.item!.name}</span>`);
    if (pressedE) {
      if (addToBackpack(inv, nearItem.item!)) {
        markSpotTaken(nearItem);
        drops.splice(drops.indexOf(nearItem), 1);
        sfx.equip();
        changed = true;
      } else {
        hud.message('Your backpack is full.', 1800);
      }
    }
  } else if (nearStairs) {
    if (stairsUnlocked()) {
      hud.prompt('[F] Descend');
      if (pressedE) descend();
    } else {
      hud.prompt('<span style="color:#c9776a">The way down is sealed. Defeat the guardian.</span>');
    }
  } else if (nearMerchant) {
    hud.prompt('[F] Trade with the merchant');
    if (pressedE) openShop();
  } else if (nearUp) {
    hud.prompt(`[F] Climb back to depth ${floorNo - 1}`);
    if (pressedE) ascend();
  } else if (nearCageNow) {
    hud.prompt('[F] Rest at the cage');
    if (pressedE) {
      vitals.hp = vitals.maxHp;
      combat.stamina = combat.maxStamina;
      sfx.recover();
      hud.message('You rest. Spend your xp to grow stronger.', 3000);
      persist();
      setMenu(true);
    }
  } else {
    hud.prompt(null);
  }
  if (changed) {
    refreshUi();
    persist();
  }
  autosaveTimer += dt;
  if (autosaveTimer >= AUTOSAVE_EVERY) {
    autosaveTimer = 0;
    persist();
  }

  stepVitals(vitals, dt);
  shake = Math.max(0, shake - dt * 2.5);

  if (vitals.dead) {
    if (deadTimer === 0) {
      sfx.death();
      marker = nextMarker(marker, dieAndDrop(inv, floorNo, player.x, player.z, rng));
      deaths++;
      recompute();
      if (marker && marker.floor === floorNo) markerView.place(marker.x, marker.z);
      refreshUi();
      persist();
    }
    deadTimer += dt;
    hud.setDeath(Math.min(1, deadTimer / 1.2));
    if (deadTimer >= DEATH_TIME) respawn();
  }
}

function render(): void {
  const now = performance.now() / 1000;
  const deadK = Math.min(1, deadTimer / 0.8);
  const jx = (Math.random() - 0.5) * shake * 0.06;
  const jy = (Math.random() - 0.5) * shake * 0.06;
  camera.position.set(player.x + jx, EYE_HEIGHT * (1 - 0.75 * deadK) + jy, player.z);
  camera.rotation.set(player.pitch + jy * 0.5, player.yaw + jx * 0.5, deadK * 0.9);
  updateHand(now);

  const torchIsWeapon = !weaponMesh && inv.equipped.weapon !== null;
  const swinger: THREE.Object3D = torchIsWeapon ? hand : weaponMesh ?? swingProxy;
  poseHand(swinger, combat, derived.weapon);
  if (!torchIsWeapon) {
    if (shieldMesh) poseBelt(hand, now); // a shield fills the off-hand, so the torch hangs at your belt
    else poseOffhand(hand, now);
  }
  if (shieldMesh) poseShield(shieldMesh, combat.guard, now);
  else if (combat.guard > 0) blendToTorchGuard(hand, combat.guard); // no shield: raise the torch
  crosshair.classList.toggle('guard', isGuarding(combat));

  // Which hand holds what.
  const fists = inv.equipped.weapon === null;
  torchHandR.group.visible = torchIsWeapon;
  fistHand.group.visible = fists;
  torchHandL.group.visible = !torchIsWeapon && !shieldMesh;
  idleHandL.group.visible = torchIsWeapon && !shieldMesh;
  // An empty left hand rests low and brings itself up to brace when you guard.
  idleHolder.position.set(-0.46 + combat.guard * 0.2, -0.5 + combat.guard * 0.18 + Math.sin(now * 1.6) * 0.004, -0.5);
  idleHolder.rotation.set(-0.25, 0.25, 0.2);
  rightArm.update(camera, torchIsWeapon ? torchHandR.wrist : weaponHand ? weaponHand.wrist : fists ? fistHand.wrist : null);
  leftArm.update(camera, shieldHand ? shieldHand.wrist : !torchIsWeapon ? torchHandL.wrist : idleHandL.wrist);

  hud.setVitals(vitals.hp, vitals.maxHp, combat.stamina, combat.maxStamina);
  hud.setHurt(vitals.hurt);
  hud.setCounts(inv.gold, inv.xp, floorNo);
  const tileNow = toTile(player.z) * 1000 + toTile(player.x);
  if (tileNow !== lastRevealTile) {
    lastRevealTile = tileNow;
    if (revealAround(floor, explored, player.x, player.z)) minimap.invalidate();
  }
  minimap.draw(player.x, player.z, player.yaw);
  hud.setQuick(quickHud());
  hud.setFade(fade ? (fade.phase === 'out' ? Math.min(1, fade.t) : Math.max(0, 1 - fade.t)) : 0);

  if (floorView) {
    floorView.update(now, player.x, player.z);
    floorView.setGate(gateCur);
    floorView.cage?.setOpen(gateOpenness(intro));
  }
  for (const v of enemyViews) {
    const near = (v.enemy.x - player.x) ** 2 + (v.enemy.z - player.z) ** 2 < CULL_DIST * CULL_DIST;
    v.rig.group.visible = near;
    if (near) updateEnemyView(v, now);
  }
  if (bossView) updateBossView(bossView, now);
  markerView.update(now);
  if (marker && marker.floor === floorNo) {
    const dx = marker.x - player.x, dz = marker.z - player.z;
    const rel = Math.atan2(-dx, -dz) - player.yaw;
    hud.setCompass(-rel, `Lost belongings · ${Math.round(Math.hypot(dx, dz))}m`);
  } else if (marker) {
    hud.setCompass(null, `Lost belongings on floor ${marker.floor}`);
  } else {
    hud.setCompass(null, null);
  }
  lootView.sync(drops);
  lootView.update(now);
  const frameDt = Math.min(0.1, now - lastRender);
  lastRender = now;
  effects.update(frameDt);
  floaters.update(frameDt, camera, tmpV);
  arrowView.sync(arrows, now);
  dust.update(now, player.x, player.z);
  post.render(now, scene, camera);
  quality.frame(frameDt * 1000);
  tickFps();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- go
recompute();
loadFloor(floorNo, loaded ? 'arrive' : 'intro');
startLoop(update, render);

// Dev-only handle for debugging and automated tests.
if (import.meta.env.DEV) {
  (window as unknown as { __dbg: unknown }).__dbg = {
    player, THREE, inv, levels, bosses, persist, recompute, refreshUi,
    enemies: () => enemies, drops: () => drops, floor: () => floor, floorNo: () => floorNo,
    marker: () => marker, vitals: () => vitals, derived: () => derived, intro, checkpoint: () => checkpoint,
    quality, boss: () => boss, audioProbe, setMusicMode, setMusicVolume, nav: () => nav, input, effects, hurt: hurtPlayer, combat: () => combat, go: (d: number) => loadFloor(d, 'arrive'), rectSolids, TILE, renderer, scene, update, render,
  };
}
