// ============================================================
//  Buildings & shop transactions
// ============================================================
import {
  TILE, COLS, GROUND_ROW, SPAWN_COL, UPGRADES, UPGRADE_KEYS, CONSUMABLES,
  FUEL_PRICE, REPAIR_PRICE, MINERALS, RECIPES, BASE_UPGRADES, FUEL_SUBSIDY_RATE, DIFFICULTIES,
  upgradeTier, upgradeCost, upgradeIsMax,
} from "./config.js?v=43";

// Effective fuel price after any owned base subsidies.
export function fuelPrice(state) {
  return FUEL_PRICE * (state.base && state.base.fuelSubsidy ? FUEL_SUBSIDY_RATE : 1);
}

// Surface buildings, clustered as a "base" centered on the spawn column so
// they're reachable no matter how wide the world is. Each occupies a
// horizontal span (in tile columns) on the ground line.
// Two groups with a diggable gap in the middle, where the player spawns.
const B0 = SPAWN_COL - 18;
export const BUILDINGS = [
  { id: "fuel",    name: "Fuel Station",  color: "#e7b13a", col: B0 + 0,  width: 4 },
  { id: "sell",    name: "Mineral Depot", color: "#3aa3e7", col: B0 + 5,  width: 4 },
  { id: "repair",  name: "Repair Bay",    color: "#e74c4c", col: B0 + 10, width: 4 },
  // --- spawn gap (diggable) around SPAWN_COL ---
  { id: "upgrade", name: "Ship Upgrades", color: "#4ce78f", col: B0 + 22, width: 5 },
  { id: "mission", name: "Mission Board", color: "#e7c93a", col: B0 + 29, width: 5 },
  { id: "save",    name: "Save Station",  color: "#9b6fe7", col: B0 + 36, width: 3 },
  { id: "refine",  name: "Refinery",      color: "#e78f3a", col: B0 + 41, width: 5 },
  { id: "outpost", name: "Outpost",       color: "#3ad0c0", col: B0 + 47, width: 5 },
];

// Which building (if any) is the player currently standing over on the surface?
export function buildingAt(player) {
  // Only when at/near the surface
  const row = Math.floor(player.centerY / TILE);
  if (row > GROUND_ROW + 0.5) return null;
  const col = player.centerX / TILE;
  for (const b of BUILDINGS) {
    if (col >= b.col && col <= b.col + b.width) return b;
  }
  return null;
}

// ---------------- Transactions ----------------

export function buyFuel(state, units) {
  const player = state.player;
  const price = fuelPrice(state);
  const need = player.maxFuel - player.fuel;
  units = Math.min(units, need);
  if (units <= 0) return { ok: false, msg: "Tank already full" };
  const cost = Math.ceil(units * price);
  if (state.money < cost) {
    // buy as much as affordable
    const affordable = Math.floor(state.money / price);
    if (affordable <= 0) return { ok: false, msg: "Not enough money" };
    units = affordable;
  }
  const finalCost = Math.ceil(units * price);
  state.money -= finalCost;
  player.fuel = Math.min(player.maxFuel, player.fuel + units);
  return { ok: true, msg: `Refueled +${Math.round(units)} for $${finalCost}` };
}

export function buyFullFuel(state) {
  const player = state.player;
  return buyFuel(state, player.maxFuel - player.fuel);
}

export function repairHull(state, points) {
  const player = state.player;
  const need = player.maxHull - player.hull;
  points = Math.min(points, need);
  if (points <= 0) return { ok: false, msg: "Hull already full" };
  let cost = Math.ceil(points * REPAIR_PRICE);
  if (state.money < cost) {
    const affordable = Math.floor(state.money / REPAIR_PRICE);
    if (affordable <= 0) return { ok: false, msg: "Not enough money" };
    points = affordable;
    cost = Math.ceil(points * REPAIR_PRICE);
  }
  state.money -= cost;
  player.hull = Math.min(player.maxHull, player.hull + points);
  return { ok: true, msg: `Repaired +${Math.round(points)} hull for $${cost}` };
}

export function repairFull(state) {
  const player = state.player;
  return repairHull(state, player.maxHull - player.hull);
}

export function sellAll(state) {
  const player = state.player;
  if (player.cargoCount === 0) return { ok: false, msg: "Nothing to sell" };
  const market = state.market;
  const sellMul = state.sellMul != null ? state.sellMul
    : ((state.difficulty && DIFFICULTIES[state.difficulty] && DIFFICULTIES[state.difficulty].sellMul) || 1);
  let total = 0;
  const lines = [];
  for (const key in player.cargo) {
    const count = player.cargo[key];
    if (count <= 0) continue;
    // Live market price, scaled by the difficulty payout multiplier.
    const v = Math.round((market ? market.registerSale(key, count) : count * MINERALS[key].value) * sellMul);
    total += v;
    lines.push(`${count}x ${MINERALS[key].name}`);
  }
  state.money += total;
  player.cargo = {};
  state.stats.totalEarned += total;
  return { ok: true, msg: `Sold for $${total.toLocaleString()}`, total, lines };
}

export function buyUpgrade(state, key) {
  const player = state.player;
  const def = UPGRADES[key];
  const cur = player.tier[key];
  const next = cur + 1;
  if (upgradeIsMax(key, cur)) return { ok: false, msg: "Already max tier" };
  const cost = upgradeCost(key, next, state.upgradesPurchased || 0);
  if (state.money < cost) return { ok: false, msg: "Not enough money" };
  state.money -= cost;
  player.applyUpgrade(key, next);
  // Each purchase escalates the price of ALL upgrades.
  state.upgradesPurchased = (state.upgradesPurchased || 0) + 1;
  return { ok: true, msg: `${def.label}: ${upgradeTier(key, next).name}` };
}

export function buyConsumable(state, key) {
  const def = CONSUMABLES[key];
  if (state.money < def.cost) return { ok: false, msg: "Not enough money" };
  state.money -= def.cost;
  if (key === "dynamite") state.player.dynamite++;
  if (key === "teleporter") state.player.teleporters++;
  return { ok: true, msg: `Bought ${def.name}` };
}

// Restock Bay (Outpost): top each consumable up to `target`, buying the
// shortfall from the player's funds (stops when money runs out).
export function autoRestock(state, target) {
  const p = state.player;
  const before = state.money;
  let bought = 0;
  const have = (key) => (key === "dynamite" ? p.dynamite : p.teleporters);
  for (const key in CONSUMABLES) {
    while (have(key) < target) {
      if (!buyConsumable(state, key).ok) break; // out of money
      bought++;
    }
  }
  return { bought, spent: before - state.money };
}

// ---------------- Refinery ----------------

export function findRecipe(id) {
  return RECIPES.alloys.find((r) => r.id === id) || RECIPES.craft.find((r) => r.id === id) || null;
}

// Does the player's cargo hold all inputs for one batch of this recipe?
export function canRefine(player, recipe) {
  for (const k in recipe.in) {
    if ((player.cargo[k] || 0) < recipe.in[k]) return false;
  }
  return true;
}

export function refine(state, id) {
  const player = state.player;
  const recipe = findRecipe(id);
  if (!recipe) return { ok: false, msg: "Unknown recipe" };
  if (!canRefine(player, recipe)) return { ok: false, msg: "Not enough materials" };
  // Consume the inputs.
  for (const k in recipe.in) {
    player.cargo[k] -= recipe.in[k];
    if (player.cargo[k] <= 0) delete player.cargo[k];
  }
  // Produce the output.
  if (recipe.kind === "consumable") {
    if (recipe.out === "dynamite") player.dynamite++;
    else if (recipe.out === "teleporter") player.teleporters++;
    return { ok: true, msg: `Crafted ${recipe.name || MINERALS[recipe.out]?.name || recipe.out}` };
  }
  // Cargo alloy — fits because refining is net cargo-negative.
  player.cargo[recipe.out] = (player.cargo[recipe.out] || 0) + 1;
  return { ok: true, msg: `Refined 1x ${MINERALS[recipe.out].name}` };
}

// ---------------- Outpost (base upgrades) ----------------

export function buyBaseUpgrade(state, key) {
  const def = BASE_UPGRADES[key];
  if (!def) return { ok: false, msg: "Unknown upgrade" };
  if (!state.base) state.base = {};
  if (state.base[key]) return { ok: false, msg: "Already installed" };
  if (state.money < def.cost) return { ok: false, msg: "Not enough money" };
  state.money -= def.cost;
  state.base[key] = true;
  return { ok: true, msg: `${def.label} installed` };
}
