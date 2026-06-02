// ============================================================
//  Motherload — global configuration & data tables
// ============================================================

export const TILE = 32;
export const COLS = 176;         // world width in tiles (4x wider for exploration)
export const ROWS = 1260;        // world depth in tiles (~2500m of descent)
export const GROUND_ROW = 6;     // first underground row (rows < this are sky)
export const METERS_PER_ROW = 2; // flavor conversion for the depth gauge
export const SPAWN_COL = Math.floor(COLS / 2); // surface base / spawn point
export const VIEW_W = 800;
export const VIEW_H = 600;

export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

// Player physics
export const PLAYER_W = 24;
export const PLAYER_H = 24;
export const GRAVITY = 900;            // px/s^2
export const THRUST_UP = 1750;         // px/s^2 (base, before engine upgrade)
export const THRUST_SIDE = 760;        // px/s^2 (base) — gentle, scales with Engine
// Terminal velocity is intentionally enormous: with GRAVITY=900 the pod keeps
// accelerating for a ~350-tile (~700m) plunge before capping out, so short
// mining drops stay slow while a dive from space gets genuinely deadly. (Vertical
// collision is swept in player.js so this speed can't tunnel through floors.)
export const MAX_FALL = 4500;          // terminal velocity downward (~350 tiles to reach at g=900)
export const MAX_RISE = 460;
export const MAX_HSPEED = 175;         // base horizontal cap (scales with Engine tier)
export const DRAG_X = 7;               // horizontal damping when no input (per s)
// Fall damage is ENERGY-based: it scales with impact speed SQUARED, which makes
// it ≈ linear in the distance fallen. Short drops (<~8 tiles) are free; damage
// climbs ~4/tile, so reaching the lethal 1000+ range takes an incredibly long
// plunge (~250+ tiles, i.e. a dive from space). Max ≈ 1385 at terminal —
// survive that only with Hull upgrades / Impact Dampers / Featherfall.
export const FALL_DAMAGE_THRESHOLD = 680;    // impact speed before any hull damage (~8-tile drop)
export const FALL_DAMAGE_SCALE = 0.00007;    // hull dmg per (speed² − threshold²) unit

// Sky / ascent — fly up off the surface, through the atmosphere, into space.
// Reaching space is a major investment: a huge fuel tank AND Vertical Booster
// upgrades. Space begins at SPACE_ALT (low-gravity drift + asteroid field).
export const SKY_CEILING_ROWS = 5000;  // tiles the pod may climb above ground (~10,000m)
export const SPACE_ALT = 4000;         // metres of altitude where space (low-g + asteroids) begins
export const ASTEROID_MIN_ROWS = 2000; // tiles above ground the asteroid field starts (~4000m, the space line)
export const ASTEROID_MAX_ROWS = 4900; // tiles above ground it extends to (~9800m, just below the ceiling)
export const SKY_LAYERS = [            // named bands for the altitude readout
  // `col` tints the altitude band on the right-edge navigator (surface → space).
  { name: "Lower Sky",    start: 0,    col: [120, 124, 150] },
  { name: "Open Sky",     start: 350,  col: [92, 132, 198] },
  { name: "Stratosphere", start: 1100, col: [58, 92, 168] },
  { name: "Mesosphere",   start: 2400, col: [40, 50, 118] },
  { name: "Space",        start: 3600, col: [14, 16, 40] },
  { name: "Asteroid Belt", start: 4000, col: [78, 72, 86] },
];
export function skyLayerAt(altM) {
  let n = SKY_LAYERS[0].name;
  for (const l of SKY_LAYERS) { if (altM >= l.start) n = l.name; else break; }
  return n;
}

// Fuel consumption (units per second) — flying costs fuel; the Fuel Reactor
// upgrade reduces all of these, and the Engine upgrade adds power without
// raising burn.
export const FUEL_THRUST_UP = 3.4;
export const FUEL_THRUST_SIDE = 1.6;
export const FUEL_DRILL = 2.4;
export const FUEL_IDLE = 0.12;

// Hazards
export const HEAT_MAX = 100;
export const HEAT_BASE_COOL = 11;     // passive heat dissipation /s
export const HEAT_RADIATOR_COOL = 42; // extra cooling at full radiator /s
export const HEAT_AMBIENT_SCALE = 24; // stratum ambientHeat -> heat/s
export const HEAT_LAVA_RADIANT = 10;  // per adjacent lava tile -> heat/s
export const HEAT_DAMAGE_THRESHOLD = 78;
export const HEAT_DAMAGE_SCALE = 0.16; // hull dmg per (heat-threshold) /s
export const PRESSURE_DAMAGE_SCALE = 0.9; // base crush dmg /s at pressure 1.0 (reduced by hull tier)

// Economy
export const START_MONEY = 20;
export const FUEL_PRICE = 1.0;     // $ per fuel unit at the station
export const REPAIR_PRICE = 4.0;   // $ per hull point (baseline 100-HP hull)
export const RESCUE_COST_RATIO = 0.5; // pay half your money to get rescued when stuck

// Per-point repair price scales with hull capacity: premium plating is far
// pricier to patch, so fully repairing a 1k+ HP hull is a serious money sink.
// (e.g. 100-HP → $4/pt; 1000-HP → $40/pt; 2500-HP → $100/pt.)
export function repairUnitPrice(maxHull) {
  return REPAIR_PRICE * Math.max(1, maxHull / 100);
}

// ------------------------------------------------------------
//  Difficulty modes — chosen at new-game time, stored on state.
//  dmgMul scales all hazard damage; fuelMul scales fuel burn;
//  sellMul scales mineral payouts; permadeath wipes the save on death.
// ------------------------------------------------------------
export const DIFFICULTIES = {
  casual:   { label: "Casual",   dmgMul: 0.55, fuelMul: 0.75, sellMul: 1.2, startMoney: 60, permadeath: false,
              desc: "Forgiving — softer hazards, lean fuel use, richer payouts. No permadeath." },
  normal:   { label: "Normal",   dmgMul: 1.0,  fuelMul: 1.0,  sellMul: 1.0, startMoney: 20, permadeath: false,
              desc: "The intended Motherload experience." },
  hardcore: { label: "Hardcore", dmgMul: 1.7,  fuelMul: 1.2,  sellMul: 0.9, startMoney: 20, permadeath: true,
              desc: "Brutal hazards and thirsty engines. Death is PERMANENT — the save is wiped." },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

// ------------------------------------------------------------
//  New Game+ mutators — optional run modifiers, freely combined.
//  Each contributes multipliers that are resolved into one effect set.
//  dmg/fuel: runtime multipliers; drill: dig-speed; hull: capacity;
//  sell: payout; ore/lava/treasure: world-generation density; noFall: flag.
// ------------------------------------------------------------
export const MUTATORS = {
  inferno:     { label: "Inferno",      kind: "curse", desc: "Hazards deal double damage.", dmg: 2 },
  heavy_fuel:  { label: "Heavy Fuel",   kind: "curse", desc: "Engines burn fuel 50% faster.", fuel: 1.5 },
  glass:       { label: "Glass Cannon", kind: "curse", desc: "Hull capacity halved — but ore sells for 50% more.", hull: 0.5, sell: 1.5 },
  drought:     { label: "Ore Drought",  kind: "curse", desc: "Ore is scarce — but worth double when found.", ore: 0.5, sell: 2 },
  molten:      { label: "Molten World", kind: "curse", desc: "Far more lava lurks in the rock.", lava: 2.2 },
  turbo:       { label: "Turbo Drill",  kind: "boon",  desc: "Drill bites 75% faster.", drill: 1.75 },
  featherfall: { label: "Featherfall",  kind: "boon",  desc: "Crash landings no longer hurt.", noFall: true },
  motherlode:  { label: "Mother Lode",  kind: "boon",  desc: "Veins run rich — far more ore.", ore: 1.8 },
  prospector:  { label: "Prospector",   kind: "boon",  desc: "Buried treasure is everywhere.", treasure: 3 },
};
export const MUTATOR_KEYS = Object.keys(MUTATORS);

// Fold a list of mutator ids into one effect set (multipliers default to 1).
export function resolveMutators(ids = []) {
  const e = { dmg: 1, fuel: 1, drill: 1, hull: 1, sell: 1, ore: 1, lava: 1, treasure: 1, noFall: false };
  for (const id of ids) {
    const m = MUTATORS[id];
    if (!m) continue;
    if (m.dmg) e.dmg *= m.dmg;
    if (m.fuel) e.fuel *= m.fuel;
    if (m.drill) e.drill *= m.drill;
    if (m.hull) e.hull *= m.hull;
    if (m.sell) e.sell *= m.sell;
    if (m.ore) e.ore *= m.ore;
    if (m.lava) e.lava *= m.lava;
    if (m.treasure) e.treasure *= m.treasure;
    if (m.noFall) e.noFall = true;
  }
  return e;
}

// ------------------------------------------------------------
//  Perk / skill tree — three branches, each a linear chain (a perk
//  needs the one above it). Points accrue from depth + earnings and
//  are spent here for passive bonuses that stack on everything else.
// ------------------------------------------------------------
export const PERKS = {
  prospector: { name: "Prospector", color: "#ffd445", perks: [
    { id: "haggler",   name: "Haggler",   desc: "+12% sell value", eff: { sell: 1.12 } },
    { id: "appraiser", name: "Appraiser", desc: "+18% sell value", eff: { sell: 1.18 } },
    { id: "magnate",   name: "Magnate",   desc: "+30% sell value", eff: { sell: 1.30 } },
  ] },
  engineer: { name: "Engineer", color: "#7affb0", perks: [
    { id: "sharp_bit",   name: "Sharp Bit",   desc: "+25% drill speed", eff: { drill: 1.25 } },
    { id: "lean_burn",   name: "Lean Burn",   desc: "−15% fuel burn",   eff: { fuel: 0.85 } },
    { id: "afterburner", name: "Afterburner", desc: "+20% thrust",      eff: { thrust: 1.20 } },
  ] },
  survivor: { name: "Survivor", color: "#ff7b7b", perks: [
    { id: "plating",     name: "Plating",     desc: "+20% hull capacity", eff: { hull: 1.20 } },
    { id: "heat_shield", name: "Heat Shield", desc: "−25% hazard damage", eff: { dmg: 0.75 } },
    { id: "nanoweave",   name: "Nanoweave",   desc: "+35% hull capacity", eff: { hull: 1.35 } },
  ] },
};
export const PERK_BRANCH_KEYS = Object.keys(PERKS);

// Flatten owned perk ids into one effect set (multipliers default to 1).
export function resolvePerks(ids = []) {
  const e = { dmg: 1, fuel: 1, drill: 1, hull: 1, sell: 1, thrust: 1 };
  for (const branch of PERK_BRANCH_KEYS) {
    for (const p of PERKS[branch].perks) {
      if (!ids.includes(p.id)) continue;
      for (const k in p.eff) e[k] *= p.eff[k];
    }
  }
  return e;
}

// Perk points earned scale with how deep and how rich you've gotten.
export function perkPointsEarned(stats) {
  return Math.floor((stats.maxDepth || 0) / 200) + Math.floor((stats.totalEarned || 0) / 25000);
}

// ------------------------------------------------------------
//  Endings — the choice made at the Heart of Natas branches the
//  finale into three outcomes, each with its own ending achievement.
// ------------------------------------------------------------
export const ENDINGS = {
  free: {
    label: "FREE IT", blurb: "Shatter the Heart and let whatever sleeps below go free.",
    title: "THE HEART BEATS ON", ach: "ending_free",
    text: `The drill bites through the last of the Heart. For an instant the whole world goes silent —
      then the grinning thing below you simply... lets go.<br><br>
      "Ah. <i>Finally.</i> You didn't kill me, little drill. You <i>freed</i> me. Thank you. I'll take it from here." — NATAS<br><br>
      You scream toward the surface, richer than any colonist in history, and far less sure that you won.`,
  },
  seal: {
    label: "SEAL IT", blurb: "Bury the Heart forever. Some doors should stay shut.",
    title: "THE DEEP IS SEALED", ach: "ending_seal",
    text: `You don't break it. You wedge your last charges into the rock around the Heart and run.<br><br>
      The shaft collapses in a roar of stone, sealing the grinning thing in darkness it will never claw out of.<br><br>
      "...clever little drill," something whispers, very far away now. The colony will never know what you spared them. You do.`,
  },
  harness: {
    label: "HARNESS IT", blurb: "Bind the Heart's power to your pod. Become something more.",
    title: "THE NEW HEART", ach: "ending_harness",
    text: `You don't free it. You don't bury it. You <i>take</i> it — splicing the black-ice Heart into your pod's core.<br><br>
      Power floods your hull, endless and cold. The drill will never stop now. Neither, you realize, will you.<br><br>
      "Oh," says NATAS, delighted, from inside your own chest. "<i>Now</i> we understand each other."`,
  },
};

// Tile type ids
export const T = {
  EMPTY: 0,
  DIRT: 1,
  ROCK: 2,     // hard rock — needs higher drill level
  BEDROCK: 3,  // unbreakable boundary
  LAVA: 4,     // hazard — heat damage when drilled / touched
  GAS: 5,      // hazard — explodes when drilled
  BOULDER: 6,  // unbreakable obstacle in the field
  CORE: 7,     // the Heart of Natas — endgame structure
  PLATFORM: 8, // unmineable shop foundation (surface under buildings)
  WATER: 9,    // coolant — flows, cools heat, turns lava to obsidian
  GRAVEL: 10,  // loose dirt — collapses when undermined (cave-ins)
};

export const CORE_DRILL_LEVEL = 5; // diamond drill needed to break the Heart

// ------------------------------------------------------------
//  Strata (biomes) — each depth band has its own look, minerals,
//  hardness and hazard profile. depth is measured in rows below ground.
// ------------------------------------------------------------
export const STRATA = [
  {
    name: "Surface Crust", start: 0,
    dirt: [124, 82, 50], accent: [150, 104, 64],
    minerals: [["ironium", 100], ["bronzium", 22]],
    rockChance: 0.04, lavaChance: 0, gasChance: 0,
    hardnessMul: 1.0, ambientHeat: 0, pressure: 0,
  },
  {
    name: "Clay Beds", start: 70,
    dirt: [134, 74, 58], accent: [158, 92, 70],
    minerals: [["ironium", 50], ["bronzium", 100], ["silverium", 38]],
    rockChance: 0.08, lavaChance: 0, gasChance: 0.01,
    hardnessMul: 1.25, ambientHeat: 0, pressure: 0,
  },
  {
    name: "Rocky Mantle", start: 190,
    dirt: [104, 90, 72], accent: [126, 110, 88],
    minerals: [["bronzium", 30], ["silverium", 100], ["goldium", 46], ["platinum", 10]],
    rockChance: 0.15, lavaChance: 0.012, gasChance: 0.02,
    hardnessMul: 1.6, ambientHeat: 0.12, pressure: 0,
  },
  {
    name: "Crystal Caverns", start: 380,
    dirt: [58, 86, 104], accent: [78, 112, 132],
    minerals: [["silverium", 24], ["goldium", 100], ["platinum", 54], ["einsteinium", 16]],
    rockChance: 0.2, lavaChance: 0.025, gasChance: 0.03,
    hardnessMul: 2.1, ambientHeat: 0.25, pressure: 0,
  },
  {
    name: "Magma Fields", start: 580,
    dirt: [92, 42, 34], accent: [120, 58, 42],
    minerals: [["platinum", 40], ["einsteinium", 100], ["emerald", 40], ["ruby", 12]],
    rockChance: 0.24, lavaChance: 0.07, gasChance: 0.04,
    hardnessMul: 2.7, ambientHeat: 0.95, pressure: 0,
  },
  {
    name: "Frozen Deep", start: 820,
    dirt: [40, 56, 88], accent: [58, 78, 116],
    minerals: [["emerald", 50], ["ruby", 100], ["diamond", 30], ["amazonite", 6]],
    rockChance: 0.3, lavaChance: 0.03, gasChance: 0.05,
    hardnessMul: 3.4, ambientHeat: 0.1, pressure: 0.9,
  },
  {
    name: "The Motherlode", start: 1080,
    dirt: [30, 20, 44], accent: [52, 34, 74],
    minerals: [["diamond", 100], ["amazonite", 60], ["ruby", 30]],
    rockChance: 0.34, lavaChance: 0.06, gasChance: 0.04,
    hardnessMul: 4.2, ambientHeat: 0.8, pressure: 1.5,
  },
];

export function stratumAt(depthRow) {
  let s = STRATA[0];
  for (const st of STRATA) {
    if (depthRow >= st.start) s = st; else break;
  }
  return s;
}

// Dirt color for a given depth row, with subtle per-row variation banding
export function dirtShade(depthRow) {
  const st = stratumAt(depthRow);
  // blend dirt -> accent slightly based on position within band for texture
  const wob = 0.5 + 0.5 * Math.sin(depthRow * 0.6);
  const r = Math.round(st.dirt[0] + (st.accent[0] - st.dirt[0]) * wob * 0.5);
  const g = Math.round(st.dirt[1] + (st.accent[1] - st.dirt[1]) * wob * 0.5);
  const b = Math.round(st.dirt[2] + (st.accent[2] - st.dirt[2]) * wob * 0.5);
  return `rgb(${r},${g},${b})`;
}

// ------------------------------------------------------------
//  Minerals
// ------------------------------------------------------------
// value: sell price each. minDepth/maxDepth in rows below ground.
// weight: relative spawn frequency within its band.
export const MINERALS = {
  ironium:     { name: "Ironium",     color: "#d98a4a", value: 30,     minDepth: 0,   maxDepth: 110, weight: 100 },
  bronzium:    { name: "Bronzium",    color: "#c97b3a", value: 60,     minDepth: 12,  maxDepth: 150, weight: 80 },
  silverium:   { name: "Silverium",   color: "#d6d6e0", value: 100,    minDepth: 30,  maxDepth: 220, weight: 65 },
  goldium:     { name: "Goldium",     color: "#ffd445", value: 250,    minDepth: 60,  maxDepth: 300, weight: 50 },
  platinum:    { name: "Platinum",    color: "#cfe6ef", value: 750,    minDepth: 110, maxDepth: 380, weight: 32 },
  einsteinium: { name: "Einsteinium", color: "#7affb0", value: 2000,   minDepth: 170, maxDepth: 440, weight: 20 },
  emerald:     { name: "Emerald",     color: "#2fe06a", value: 5000,   minDepth: 230, maxDepth: 500, weight: 12 },
  ruby:        { name: "Ruby",        color: "#ff3a5e", value: 20000,  minDepth: 300, maxDepth: 540, weight: 7 },
  diamond:     { name: "Diamond",     color: "#7fdfff", value: 100000, minDepth: 370, maxDepth: 540, weight: 3 },
  amazonite:   { name: "Amazonite",   color: "#b06bff", value: 500000, minDepth: 440, maxDepth: 540, weight: 1.2 },
};

// Space ores — found ONLY in the asteroid field high above the surface (never
// underground; STRATA lists don't include them). A whole new high-value loop.
export const SPACE_ORES = {
  meteorite: { name: "Meteoric Iron", color: "#9fb0c0", value: 1500,   space: true },
  palladium: { name: "Palladium",     color: "#e6ecf4", value: 7000,   space: true },
  helium3:   { name: "Helium-3",      color: "#8affe6", value: 28000,  space: true },
  iridium:   { name: "Iridium",       color: "#cdbfff", value: 120000, space: true },
};
Object.assign(MINERALS, SPACE_ORES);
export const SPACE_ORE_KEYS = Object.keys(SPACE_ORES);
// Weighted table for asteroid generation (rarer = deeper into the belt).
export const ASTEROID_ORES = [["meteorite", 100], ["palladium", 46], ["helium3", 15], ["iridium", 4]];

// Refined alloys — never spawn in the world (pickMineral only draws from the
// STRATA lists). They're produced at the Refinery, sell at a premium, and
// compress several ore into one cargo slot. Priced by the live market like ore.
export const ALLOYS = {
  steel:      { name: "Steel Ingot",    color: "#c2cad6", value: 260,    crafted: true },
  electrum:   { name: "Electrum",       color: "#ffe27a", value: 780,    crafted: true },
  hardplate:  { name: "Hardplate",      color: "#bfe3ef", value: 2600,   crafted: true },
  quantum:    { name: "Quantum Alloy",  color: "#8affd6", value: 14000,  crafted: true },
  stellar:    { name: "Stellar Alloy",  color: "#bfe0ff", value: 170000, crafted: true },
  voidsteel:  { name: "Void Steel",     color: "#aeb8c8", value: 40000,  crafted: true },
  antimatter: { name: "Antimatter Cell",color: "#c9b0ff", value: 700000, crafted: true },
};
Object.assign(MINERALS, ALLOYS);

export const MINERAL_KEYS = Object.keys(MINERALS);
// Only naturally-occurring ore (for the codex catalogue & discovery counts).
export const ORE_KEYS = MINERAL_KEYS.filter((k) => !MINERALS[k].crafted);

// ------------------------------------------------------------
//  Refinery recipes — inputs are ore/alloy keys; output is a cargo item
//  (alloy) or a consumable counter. Refining compresses cargo and adds value.
// ------------------------------------------------------------
export const RECIPES = {
  alloys: [
    { id: "steel",     out: "steel",     kind: "cargo", in: { ironium: 3, bronzium: 1 } },
    { id: "electrum",  out: "electrum",  kind: "cargo", in: { silverium: 2, goldium: 1 } },
    { id: "hardplate", out: "hardplate", kind: "cargo", in: { platinum: 2, silverium: 2 } },
    { id: "quantum",   out: "quantum",   kind: "cargo", in: { einsteinium: 2, emerald: 1 } },
    { id: "stellar",   out: "stellar",   kind: "cargo", in: { diamond: 1, ruby: 1 } },
    { id: "voidsteel", out: "voidsteel", kind: "cargo", in: { meteorite: 3, palladium: 1 } },
    { id: "antimatter",out: "antimatter",kind: "cargo", in: { helium3: 2, iridium: 1 } },
  ],
  craft: [
    { id: "dynamite",   out: "dynamite",   kind: "consumable", name: "Dynamite",   in: { ironium: 2, bronzium: 1 } },
    { id: "teleporter", out: "teleporter", kind: "consumable", name: "Teleporter", in: { goldium: 1, silverium: 1 } },
  ],
};

// ------------------------------------------------------------
//  Upgrades — each is a list of tiers. Index 0 is the starting tier.
// ------------------------------------------------------------
// BALANCE NOTE: costs follow a gentle exponential — the first tier of each line
// is cheap (~$200–300, about half a cargo run) so the early grind opens up fast,
// then each step costs ~3× the last (RuneScape-style: trivial early, brutal late).
// Capability `value` roughly +40%/tier. Fuel tank STARTS at 100 (tier 0 value is
// also the pod's starting fuel). Tweak any number here to rebalance.
export const UPGRADES = {
  fuelTank: {
    label: "Fuel Tank",
    desc: "Maximum fuel capacity",
    infinite: true,
    tiers: [
      { name: "Standard Tank",  value: 100, cost: 0 },
      { name: "Medium Tank",    value: 150, cost: 250 },
      { name: "Large Tank",     value: 220, cost: 800 },
      { name: "Huge Tank",      value: 320, cost: 2600 },
      { name: "Titan Tank",     value: 450, cost: 8000 },
      { name: "Leviathan Tank", value: 620, cost: 24000 },
    ],
  },
  drill: {
    label: "Drill",
    desc: "Drill power (faster digging, breaks harder rock)",
    infinite: true,
    tiers: [
      { name: "Iron Drill",     value: 1.0, level: 1, cost: 0 },
      { name: "Steel Drill",    value: 1.6, level: 2, cost: 300 },
      { name: "Titanium Drill", value: 2.4, level: 3, cost: 1000 },
      { name: "Ruby Drill",     value: 3.4, level: 4, cost: 3200 },
      { name: "Diamond Drill",  value: 4.8, level: 5, cost: 10000 },
      { name: "Amazonite Drill",value: 7.0, level: 6, cost: 30000 },
    ],
  },
  cargo: {
    label: "Cargo Bay",
    desc: "Mineral storage capacity",
    infinite: true,
    tiers: [
      { name: "Small Bay",   value: 15,  cost: 0 },
      { name: "Medium Bay",  value: 25,  cost: 200 },
      { name: "Large Bay",   value: 40,  cost: 700 },
      { name: "Huge Bay",    value: 60,  cost: 2200 },
      { name: "Cavern Bay",  value: 90,  cost: 7000 },
      { name: "Abyss Bay",   value: 140, cost: 22000 },
    ],
  },
  hull: {
    label: "Hull",
    desc: "Maximum hull integrity (health)",
    infinite: true,
    tiers: [
      { name: "Steel Hull",    value: 100, cost: 0 },
      { name: "Reinforced Hull",value: 150, cost: 250 },
      { name: "Hardened Hull", value: 220, cost: 850 },
      { name: "Titanium Hull", value: 320, cost: 2800 },
      { name: "Composite Hull",value: 460, cost: 9000 },
      { name: "Aegis Hull",    value: 650, cost: 28000 },
    ],
  },
  engine: {
    label: "Engine",
    desc: "Thrust power (fly faster, climb easier)",
    tiers: [
      { name: "Stock Engine",   value: 1.0,  cost: 0 },
      { name: "Tuned Engine",   value: 1.2,  cost: 250 },
      { name: "Turbo Engine",   value: 1.45, cost: 800 },
      { name: "Ion Engine",     value: 1.75, cost: 2600 },
      { name: "Plasma Engine",  value: 2.1,  cost: 8000 },
      { name: "Fusion Engine",  value: 2.6,  cost: 24000 },
    ],
  },
  radiator: {
    label: "Cooling System",
    desc: "Heat shielding against lava",
    tiers: [
      { name: "No Shielding",   value: 0,    cost: 0 },
      { name: "Basic Coolant",  value: 0.35, cost: 700 },
      { name: "Twin Radiator",  value: 0.6,  cost: 2600 },
      { name: "Cryo System",    value: 0.8,  cost: 8500 },
      { name: "Quantum Cooler", value: 0.95, cost: 26000 },
    ],
  },
  fuelReactor: {
    label: "Fuel Reactor",
    desc: "Fuel efficiency (less burn per action)",
    tiers: [
      { name: "Stock Reactor",   value: 1.0,  cost: 0 },
      { name: "Lean Reactor",    value: 0.86, cost: 700 },
      { name: "Hybrid Reactor",  value: 0.72, cost: 2800 },
      { name: "Cold Fusion",     value: 0.58, cost: 9000 },
      { name: "Zero-Point Core", value: 0.45, cost: 27000 },
    ],
  },
  dampers: {
    label: "Impact Dampers",
    desc: "Reduces crash & fall damage",
    tiers: [
      { name: "No Dampers",     value: 0,    cost: 0 },
      { name: "Spring Struts",  value: 0.35, cost: 350 },
      { name: "Hydraulic Legs", value: 0.6,  cost: 1400 },
      { name: "Gyro Stabilizer",value: 0.85, cost: 5000 },
      { name: "Inertial Field", value: 0.97, cost: 16000 },
    ],
  },
  nanobots: {
    label: "Repair Nanobots",
    desc: "Slowly regenerates hull while flying",
    tiers: [
      { name: "None",            value: 0,    cost: 0 },
      { name: "Repair Swarm I",  value: 0.5,  cost: 1400 },
      { name: "Repair Swarm II", value: 1.1,  cost: 5500 },
      { name: "Repair Swarm III",value: 2.0,  cost: 18000 },
      { name: "Self-Mending Hull",value: 3.5, cost: 50000 },
    ],
  },
  drillWidth: {
    label: "Drill Array",
    desc: "Carves a wider tunnel — break extra tiles per dig",
    tiers: [
      { name: "Single Bit",  value: 0, cost: 0 },
      { name: "Twin Array",  value: 1, cost: 4000 },
      { name: "Triple Array",value: 2, cost: 20000 },
    ],
  },
  scanner: {
    label: "Ore Scanner",
    desc: "Pings nearby buried treasure & relics through the rock",
    tiers: [
      { name: "No Scanner",    value: 0,  cost: 0 },
      { name: "Short Scanner", value: 6,  cost: 1600 },
      { name: "Long Scanner",  value: 11, cost: 6500 },
      { name: "Deep Scanner",  value: 18, cost: 22000 },
    ],
  },
  headlight: {
    label: "Headlights",
    desc: "Beam reach & glow to see through the deep dark",
    tiers: [
      { name: "Work Lamp",      value: 1.0, cost: 0 },
      { name: "Halogen Beam",   value: 1.4, cost: 450 },
      { name: "Xenon Array",    value: 1.85, cost: 2000 },
      { name: "Plasma Lantern", value: 2.4, cost: 7500 },
      { name: "Solar Flare",    value: 3.1, cost: 24000 },
    ],
  },
  sensor: {
    label: "Sensor Array",
    desc: "Cuts the underground fog — reveals the rock layout further out (value = reveal radius in tiles)",
    tiers: [
      { name: "Basic Sensor", value: 7,        cost: 0 },
      { name: "Wide Sensor",  value: 11,       cost: 900 },
      { name: "Survey Array", value: 16,       cost: 3000 },
      { name: "Deep Sonar",   value: 24,       cost: 9000 },
      { name: "Omni-Scanner", value: Infinity, cost: 26000 }, // no fog at all
    ],
  },
  booster: {
    label: "Vertical Booster",
    desc: "Climb power & efficiency — the only way to rocket up to space (value = climb-speed multiplier)",
    tiers: [
      { name: "No Booster",    value: 1.0, fuel: 1.0,  cost: 0 },
      { name: "Ascent Jets",   value: 1.7, fuel: 0.85, cost: 5000 },
      { name: "Ramjet",        value: 2.5, fuel: 0.7,  cost: 18000 },
      { name: "Aerospike",     value: 3.8, fuel: 0.55, cost: 55000 },
      { name: "Orbital Drive", value: 5.5, fuel: 0.4,  cost: 160000 },
    ],
  },
  reverseDrill: {
    label: "Reverse Drill",
    desc: "Bore UPWARD — but only out in space. Carve into asteroids from below.",
    tiers: [
      { name: "None",        value: 0, cost: 0 },
      { name: "Reverse Bit", value: 1, cost: 90000 },
    ],
  },
  blastRadius: {
    label: "Blast Charge",
    desc: "Bigger dynamite blast radius (value = radius multiplier)",
    tiers: [
      { name: "Standard Charge",   value: 1.0, cost: 0 },
      { name: "Shaped Charge",     value: 1.5, cost: 3000 },
      { name: "Demolition Charge", value: 2.0, cost: 12000 },
    ],
  },
};

// Buried treasure chests — pure bonus payouts that reward exploration.
export const TREASURE = {
  baseChancePerDirt: 0.0016,   // sprinkled into dirt
  minValue: 250,
  valuePerRow: 9,              // value grows with depth
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

// ------------------------------------------------------------
//  Infinite upgrades + global cost escalation
//  Scalar upgrades (flagged `infinite`) keep going past their named tiers:
//  beyond the last tier we extrapolate value & cost using the SAME ratios the
//  curated tiers ended on (so the exponential curve continues seamlessly).
//  On top of that, EVERY upgrade purchased raises the price of ALL upgrades by
//  UPGRADE_ESCALATION (compounding) — so the more you've invested, the steeper
//  everything gets, keeping pace with deep-mining income.
// ------------------------------------------------------------
export const UPGRADE_ESCALATION = 1.04; // +4% to all upgrade prices per purchase

// The tier definition for any tier index (named for early tiers, procedurally
// extrapolated "Mk.N" beyond them for infinite upgrades; clamped for finite).
export function upgradeTier(key, t) {
  const def = UPGRADES[key];
  const tiers = def.tiers;
  if (t < tiers.length) return tiers[t];
  const last = tiers[tiers.length - 1];
  if (!def.infinite) return last; // finite upgrades clamp at their top tier
  const prev = tiers[tiers.length - 2];
  const valMul = prev.value ? last.value / prev.value : 1.4;
  const costMul = prev.cost ? last.cost / prev.cost : 3;
  const steps = t - (tiers.length - 1);
  return {
    name: `${def.label} Mk.${t + 1}`,
    value: +(last.value * Math.pow(valMul, steps)).toFixed(2),
    cost: Math.round(last.cost * Math.pow(costMul, steps)),
    level: last.level, // drill rock-break level stays at its max
  };
}

// Whether a tier index is buyable (always true for infinite upgrades).
export function upgradeIsMax(key, t) {
  const def = UPGRADES[key];
  return !def.infinite && t >= def.tiers.length - 1;
}

// Cost of reaching tier `t`, scaled by how many upgrades have been bought.
export function upgradeCost(key, t, upgradesPurchased = 0) {
  const base = upgradeTier(key, t).cost;
  return Math.round(base * Math.pow(UPGRADE_ESCALATION, upgradesPurchased));
}

// ------------------------------------------------------------
//  Artifacts — unique relics buried at depth. One of each per world.
//  Finding one grants a finder's bounty, a codex entry, and lore.
// ------------------------------------------------------------
export const ARTIFACTS = [
  { id: "rusted_drill", name: "Rusted Drill Bit", value: 500, minRow: 10, maxRow: 65,
    lore: "An old drill bit, snapped clean off. Someone dug here long before you." },
  { id: "locket", name: "Colonist's Locket", value: 1500, minRow: 75, maxRow: 185,
    lore: "A faded photo sealed inside. Two people, squinting at a sun this deep place never sees." },
  { id: "data_core", name: "Cracked Data Core", value: 5000, minRow: 195, maxRow: 375,
    lore: "Corrupted survey logs. The final entry is just one word, repeated: DOWN. DOWN. DOWN." },
  { id: "singing_crystal", name: "Singing Crystal", value: 16000, minRow: 385, maxRow: 575,
    lore: "It vibrates against your hull, low and steady. The note is almost, almost a word." },
  { id: "obsidian_idol", name: "Obsidian Idol", value: 45000, minRow: 585, maxRow: 815,
    lore: "Carved by no human hand. The drill's lights make its eyes seem to follow you." },
  { id: "frozen_heart", name: "The Frozen Heart", value: 130000, minRow: 825, maxRow: 1075,
    lore: "A core of black ice that does not melt, even pressed against your overheating hull." },
  { id: "natas_effigy", name: "Effigy of Natas", value: 400000, minRow: 1085, maxRow: 1190,
    lore: "It is grinning. You get the unshakeable feeling it has always been grinning." },
  { id: "first_drill", name: "The First Drill", value: 1000000, minRow: 1195, maxRow: 1252,
    lore: "Older than the colony. Older than the rock around it. It was here, waiting to be found." },
];

// ------------------------------------------------------------
//  Pod paint schemes (customization) — persisted separately from saves
// ------------------------------------------------------------
export const POD_SKINS = [
  { id: "classic", name: "Prospector",  body: "#e8a13a", dark: "#b8761f", cockpit: "#7fd0ff", trail: "#ffb24a" },
  { id: "crimson", name: "Crimson",     body: "#e0473a", dark: "#a02820", cockpit: "#ffd27f", trail: "#ff6a4a" },
  { id: "ocean",   name: "Deep Blue",   body: "#3a8ad0", dark: "#1f5a9a", cockpit: "#bfeaff", trail: "#6ad0ff" },
  { id: "toxic",   name: "Toxic",       body: "#7ad04a", dark: "#4a8a2a", cockpit: "#eaffbf", trail: "#aaff5a" },
  { id: "royal",   name: "Royal",       body: "#9b6fe7", dark: "#6a44b0", cockpit: "#e0d0ff", trail: "#c89aff" },
  { id: "gold",    name: "24 Karat",    body: "#ffd445", dark: "#c9a31a", cockpit: "#fff6c0", trail: "#fff080" },
  { id: "stealth", name: "Stealth",     body: "#3a3f47", dark: "#23262b", cockpit: "#8affc0", trail: "#5affaa" },
  { id: "candy",   name: "Bubblegum",   body: "#ff7fc4", dark: "#c94a8a", cockpit: "#fff0fa", trail: "#ffaad6" },
];
export const SKIN_KEY = "motherload_skin_v1";

// ------------------------------------------------------------
//  Base / Outpost upgrades — one-time purchases that improve the
//  surface base rather than the pod. Stored as booleans on state.base.
// ------------------------------------------------------------
export const BASE_UPGRADES = {
  autoSell:    { label: "Auto-Sell Depot",  desc: "Cargo sells automatically the moment you touch down at the base", cost: 3500 },
  autoRefuel:  { label: "Auto-Refuel Rig",  desc: "Tops your tank to full on landing (paid from your funds, after auto-sell)", cost: 2500 },
  autoRestock: { label: "Restock Bay",      desc: `Keeps ${"dynamite & teleporters"} topped up to ${2} each on landing`, cost: 4000 },
  fuelSubsidy: { label: "Fuel Contract",    desc: "Negotiated rates — 30% off all refuelling, forever", cost: 6000 },
  elevator:    { label: "Express Elevator", desc: "Fast-travel from the surface straight down to any biome you've reached", cost: 9000 },
};
export const BASE_UPGRADE_KEYS = Object.keys(BASE_UPGRADES);
export const FUEL_SUBSIDY_RATE = 0.7; // multiplier on fuel price when the Fuel Contract is owned
export const RESTOCK_TARGET = 2;      // consumables the Restock Bay keeps on hand

// Consumables sold at the parts store. `cost` is the BASE price; each one you
// already hold makes the next pricier (see consumableCost) — stacking is dear.
export const CONSUMABLES = {
  dynamite: { name: "Dynamite", desc: "Throw it (key: B) — blows a wide hole after 3s. DESTROYS any ore it hits, and hurts you up close.", cost: 200 },
  teleporter: { name: "Teleporter", desc: "Instantly return to the surface (key: T)", cost: 500 },
};

// Holding a stack of consumables ramps the price of the next one (compounding
// per item currently carried), so you can't cheaply hoard them.
export const CONSUMABLE_ESCALATION = 1.4;
export function consumableCost(key, owned = 0) {
  return Math.round(CONSUMABLES[key].cost * Math.pow(CONSUMABLE_ESCALATION, Math.max(0, owned)));
}

// Dynamite tuning. Thrown sticks arc out, fuse for DYN_FUSE seconds, then clear
// a circular blast of DYN_BASE_RADIUS tiles (scaled by the Blast Charge upgrade).
// Anything inside the inner half of the radius takes hull damage — so move away.
export const DYN_BASE_RADIUS = 2.5;   // blast radius in tiles, before upgrades
export const DYN_FUSE = 3.0;          // seconds from throw to detonation
export const DYN_MAX_SELF_DMG = 70;   // point-blank hull damage (fades to 0 at the inner-radius edge)
