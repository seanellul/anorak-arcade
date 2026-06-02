// ============================================================
//  World — tile grid generation, queries, and drilling
// ============================================================
import {
  TILE, COLS, ROWS, GROUND_ROW, T, MINERALS, MINERAL_KEYS, dirtShade,
  stratumAt, ARTIFACTS, TREASURE,
  ASTEROID_MIN_ROWS, ASTEROID_MAX_ROWS, ASTEROID_ORES,
} from "./config.js?v=49";
import { BUILDINGS } from "./shops.js?v=49";

// Small seeded RNG so worlds are reproducible per seed (helps testing/saves)
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class World {
  constructor(seed = (Math.random() * 1e9) | 0, gen = {}) {
    this.seed = seed >>> 0;
    // New Game+ generation multipliers (ore/lava/treasure density).
    this.gen = { ore: gen.ore || 1, lava: gen.lava || 1, treasure: gen.treasure || 1 };
    this.cols = COLS;
    this.rows = ROWS;
    // tiles: type id;  mineral: mineral key or null;  hardness: drill cost
    this.type = new Uint8Array(COLS * ROWS);
    this.mineral = new Array(COLS * ROWS).fill(null);
    this.hardness = new Float32Array(COLS * ROWS);
    this.artifact = new Array(COLS * ROWS).fill(null); // artifact id per tile
    this.treasure = new Float32Array(COLS * ROWS);      // treasure $ value per tile (0 = none)
    this.cleared = new Set(); // tile indices dug out (for save/load)
    // Sky / asteroid tiles live above the grid (negative rows), stored sparsely.
    this.skyType = new Map();     // idx -> tile type
    this.skyMineral = new Map();  // idx -> ore key
    this.skyHardness = new Map(); // idx -> drill cost
    this.skyCleared = new Set();  // idx of mined asteroid tiles (for save/load)
    this.generate();
    this.generateAsteroids();
  }

  idx(c, r) { return r * COLS + c; }
  inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  getType(c, r) {
    // Above the world (negative rows): asteroid tile if present, else open sky.
    // Side walls and the floor stay solid bedrock.
    if (r < 0) {
      if (c < 0 || c >= COLS) return T.BEDROCK;
      const k = r * COLS + c;
      return this.skyType.has(k) ? this.skyType.get(k) : T.EMPTY;
    }
    if (!this.inBounds(c, r)) return T.BEDROCK;
    return this.type[this.idx(c, r)];
  }
  getMineral(c, r) {
    if (r < 0) return (c >= 0 && c < COLS) ? (this.skyMineral.get(r * COLS + c) ?? null) : null;
    if (!this.inBounds(c, r)) return null;
    return this.mineral[this.idx(c, r)];
  }
  getArtifact(c, r) {
    if (!this.inBounds(c, r)) return null;
    return this.artifact[this.idx(c, r)];
  }
  getTreasure(c, r) {
    if (!this.inBounds(c, r)) return 0;
    return this.treasure[this.idx(c, r)];
  }
  getHardness(c, r) {
    if (r < 0) return this.skyHardness.get(r * COLS + c) ?? Infinity;
    if (!this.inBounds(c, r)) return Infinity;
    return this.hardness[this.idx(c, r)];
  }

  isSolid(c, r) {
    const t = this.getType(c, r);
    return t !== T.EMPTY;
  }
  // Solid AND something the drill can ever remove
  isDrillable(c, r) {
    const t = this.getType(c, r);
    return t === T.DIRT || t === T.ROCK || t === T.LAVA || t === T.GAS || t === T.CORE
      || t === T.WATER || t === T.GRAVEL;
  }
  isBlocking(c, r) {
    // Tiles that physically stop the pod. Fluids & gas (LAVA/WATER/GAS) do NOT
    // block — you fly through them and take damage via contact checks. Letting
    // them block caused the pod to be ejected (flung upward) whenever flowing
    // lava/gas seeped into its tile.
    const t = this.getType(c, r);
    return t !== T.EMPTY && t !== T.LAVA && t !== T.GAS && t !== T.WATER;
  }

  clearTile(c, r) {
    if (r < 0) { // asteroid tile
      if (c < 0 || c >= COLS) return;
      const k = r * COLS + c;
      if (!this.skyType.has(k)) return;
      this.skyType.delete(k); this.skyMineral.delete(k); this.skyHardness.delete(k);
      this.skyCleared.add(k);
      return;
    }
    if (!this.inBounds(c, r)) return;
    const i = this.idx(c, r);
    if (this.type[i] === T.EMPTY) return;
    this.type[i] = T.EMPTY;
    this.mineral[i] = null;
    this.artifact[i] = null;
    this.treasure[i] = 0;
    this.hardness[i] = 0;
    this.cleared.add(i);
  }

  // Re-apply mined asteroid tiles after regenerating from seed (save/load).
  applySkyCleared(keys) {
    for (const k of keys) {
      this.skyType.delete(k); this.skyMineral.delete(k); this.skyHardness.delete(k);
      this.skyCleared.add(k);
    }
  }

  // Re-apply a saved list of cleared tile indices after regenerating from seed
  applyCleared(indices) {
    for (const i of indices) {
      this.type[i] = T.EMPTY;
      this.mineral[i] = null;
      this.artifact[i] = null;
      this.treasure[i] = 0;
      this.hardness[i] = 0;
      this.cleared.add(i);
    }
  }

  // Move a tile's full contents to a new index, leaving the source empty.
  _moveTile(from, to) {
    this.type[to] = this.type[from];
    this.mineral[to] = this.mineral[from];
    this.artifact[to] = this.artifact[from];
    this.treasure[to] = this.treasure[from];
    this.hardness[to] = this.hardness[from];
    this.type[from] = T.EMPTY;
    this.mineral[from] = null;
    this.artifact[from] = null;
    this.treasure[from] = 0;
    this.hardness[from] = 0;
  }

  // One cellular step over a region: liquids flow down & spread, gravel falls,
  // gas rises, and water touching lava turns it to obsidian. Mass-conserving.
  // Returns true if anything changed. `onCrush(c,r)` fires when gravel/liquid
  // moves into a tile (so the game can damage the pod if it's there).
  simulate(c0, r0, c1, r1, onCrush) {
    c0 = Math.max(1, c0); c1 = Math.min(COLS - 2, c1);
    r0 = Math.max(GROUND_ROW, r0); r1 = Math.min(ROWS - 2, r1);
    const moved = this._simMoved || (this._simMoved = new Set());
    moved.clear();
    let changed = false;

    // fall / spread / rise (bottom-up so a falling tile isn't re-processed)
    for (let r = r1; r >= r0; r--) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (moved.has(i)) continue;
        const t = this.type[i];

        if (t === T.LAVA || t === T.WATER) {
          const bi = i + COLS;
          if (this.type[bi] === T.EMPTY && !moved.has(bi)) {
            this._moveTile(i, bi); moved.add(bi); changed = true;
            if (onCrush) onCrush(c, r + 1, t);
            continue;
          }
          const order = Math.random() < 0.5 ? [-1, 1] : [1, -1];
          let did = false;
          for (const d of order) {
            const ni = i + d;
            if (this.type[ni] === T.EMPTY && !moved.has(ni)) {
              this._moveTile(i, ni); moved.add(ni); changed = true; did = true;
              if (onCrush) onCrush(c + d, r, t);
              break;
            }
          }
          if (did) continue;
        } else if (t === T.GRAVEL) {
          const bi = i + COLS;
          if (this.type[bi] === T.EMPTY && !moved.has(bi)) {
            this._moveTile(i, bi); moved.add(bi); changed = true;
            if (onCrush) onCrush(c, r + 1, t);
            continue;
          }
        } else if (t === T.GAS) {
          const ai = i - COLS;
          if (r - 1 >= GROUND_ROW && this.type[ai] === T.EMPTY && !moved.has(ai)) {
            this._moveTile(i, ai); moved.add(ai); changed = true; continue;
          }
        }
      }
    }

    // reactions: lava touching water solidifies into obsidian rock
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (this.type[i] !== T.LAVA) continue;
        const neigh = [i - 1, i + 1, i - COLS, i + COLS];
        for (const ni of neigh) {
          if (this.type[ni] === T.WATER) {
            this.type[i] = T.ROCK; this.hardness[i] = 4; this.mineral[i] = null;
            this.type[ni] = T.EMPTY; this.mineral[ni] = null; this.hardness[ni] = 0;
            changed = true;
            break;
          }
        }
      }
    }
    return changed;
  }

  generate() {
    const rng = makeRng(this.seed);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = this.idx(c, r);

        // Sky above ground
        if (r < GROUND_ROW) {
          this.type[i] = T.EMPTY;
          this.mineral[i] = null;
          this.hardness[i] = 0;
          continue;
        }

        // Boundaries: bedrock walls + floor
        if (c === 0 || c === COLS - 1 || r === ROWS - 1) {
          this.type[i] = T.BEDROCK;
          this.hardness[i] = Infinity;
          continue;
        }

        const depth = r - GROUND_ROW; // 0 at surface
        const st = stratumAt(depth);
        const local = depth - st.start; // depth within the current stratum

        // Base dirt — hardness driven by stratum, gentle gradient within band
        this.type[i] = T.DIRT;
        this.hardness[i] = st.hardnessMul * (0.55 + local * 0.0008);

        const roll = rng();

        // Hard rock — chance from stratum; a real obstacle gated by drill level
        let acc = st.rockChance;
        if (roll < acc) {
          this.type[i] = T.ROCK;
          this.hardness[i] = st.hardnessMul * (3.0 + local * 0.004);
          this.mineral[i] = null;
          continue;
        }

        // Unbreakable boulders (rare, not in the very top band)
        acc += 0.012;
        if (depth > 14 && roll < acc) {
          this.type[i] = T.BOULDER;
          this.hardness[i] = Infinity;
          continue;
        }

        // Lava pockets
        acc += st.lavaChance * this.gen.lava;
        if (st.lavaChance > 0 && roll < acc) {
          this.type[i] = T.LAVA;
          this.hardness[i] = st.hardnessMul * (0.9 + local * 0.0006);
          continue;
        }

        // Gas pockets
        acc += st.gasChance;
        if (st.gasChance > 0 && roll < acc) {
          this.type[i] = T.GAS;
          this.hardness[i] = st.hardnessMul * (0.6 + local * 0.0004);
          continue;
        }

        // Coolant/water pockets — wet (Clay) & icy (Frozen) biomes
        const waterChance = st.name === "Frozen Deep" ? 0.045
          : st.name === "Clay Beds" ? 0.02
          : st.name === "Crystal Caverns" ? 0.015 : 0;
        acc += waterChance;
        if (waterChance > 0 && roll < acc) {
          this.type[i] = T.WATER;
          this.hardness[i] = 0.6;
          continue;
        }

        // Loose ground (gravel) — collapses when undermined; commoner deeper
        if (rng() < 0.05 + Math.min(0.12, depth * 0.00012)) {
          this.type[i] = T.GRAVEL; // keeps dirt hardness; may still hold minerals below
        }

        // Minerals inside dirt — scarce near the surface, richer the deeper you dig
        const mineralChance = (0.055 + Math.min(0.20, depth * 0.00038)) * this.gen.ore;
        if (rng() < mineralChance) {
          const m = this.pickMineral(st, rng);
          if (m) this.mineral[i] = m;
        } else if (depth > 8 && rng() < TREASURE.baseChancePerDirt * this.gen.treasure) {
          // Buried treasure chest — bonus payout, value grows with depth
          this.treasure[i] = TREASURE.minValue + depth * TREASURE.valuePerRow
            + Math.floor(rng() * depth * TREASURE.valuePerRow);
        }
      }
    }

    this.carveCaverns(rng);
    this.placeArtifacts(rng);
    this.buildCoreChamber();
    this.buildShopPlatforms();
  }

  // Make the surface row beneath each shop permanently solid (unmineable),
  // so the player can never dig away a building's floor and lose access to it.
  buildShopPlatforms() {
    for (const b of BUILDINGS) {
      for (let c = b.col - 1; c <= b.col + b.width + 1; c++) {
        if (c <= 0 || c >= COLS - 1) continue;
        const i = this.idx(c, GROUND_ROW);
        this.type[i] = T.PLATFORM;
        this.hardness[i] = Infinity;
        this.mineral[i] = null;
        this.artifact[i] = null;
      }
    }
  }

  // The endgame: a great chamber at the bottom housing the Heart of Natas.
  buildCoreChamber() {
    const cc = Math.floor(COLS / 2);
    const cr = ROWS - 12;            // near the very bottom
    const rx = 9, ry = 6;
    // Carve the chamber
    for (let dr = -ry; dr <= ry; dr++) {
      for (let dc = -rx; dc <= rx; dc++) {
        const c = cc + dc, r = cr + dr;
        if (c <= 0 || c >= COLS - 1 || r >= ROWS - 1 || r < GROUND_ROW) continue;
        if ((dc * dc) / (rx * rx) + (dr * dr) / (ry * ry) > 1) continue;
        const i = this.idx(c, r);
        this.type[i] = T.EMPTY;
        this.mineral[i] = null;
        this.artifact[i] = null;
        this.hardness[i] = 0;
      }
    }
    // The Heart — a 3x3 block of CORE tiles at the chamber center
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const i = this.idx(cc + dc, cr + dr);
        this.type[i] = T.CORE;
        this.hardness[i] = 16;
        this.mineral[i] = null;
        this.artifact[i] = null;
      }
    }
    this.coreCenter = { c: cc, r: cr };
  }

  // Place exactly one of each artifact in a dirt tile within its depth band.
  placeArtifacts(rng) {
    for (const a of ARTIFACTS) {
      let placed = false;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        const r = GROUND_ROW + a.minRow + Math.floor(rng() * (a.maxRow - a.minRow));
        const c = 2 + Math.floor(rng() * (COLS - 4));
        if (this.getType(c, r) === T.DIRT) {
          const i = this.idx(c, r);
          this.artifact[i] = a.id;
          this.mineral[i] = null; // artifact takes the slot
          placed = true;
        }
      }
    }
  }

  // Carve open caverns in the deeper strata; magma strata get lava lakes.
  carveCaverns(rng) {
    const firstCavernRow = GROUND_ROW + 190; // start at Rocky Mantle
    const count = Math.floor((ROWS - firstCavernRow) / 70);
    for (let k = 0; k < count; k++) {
      const cr = firstCavernRow + Math.floor(rng() * (ROWS - firstCavernRow - 20));
      const cc = 4 + Math.floor(rng() * (COLS - 8));
      const rx = 3 + Math.floor(rng() * 4);
      const ry = 2 + Math.floor(rng() * 3);
      const st = stratumAt(cr - GROUND_ROW);
      const lake = st.lavaChance > 0.04 && rng() < 0.55; // magma-ish caverns pool lava
      for (let dr = -ry; dr <= ry; dr++) {
        for (let dc = -rx; dc <= rx; dc++) {
          const c = cc + dc, r = cr + dr;
          if (c <= 0 || c >= COLS - 1 || r >= ROWS - 1 || r < GROUND_ROW) continue;
          // ellipse test
          if ((dc * dc) / (rx * rx) + (dr * dr) / (ry * ry) > 1) continue;
          if (this.getType(c, r) === T.BOULDER) continue;
          const i = this.idx(c, r);
          // pool lava in the bottom two rows of magma caverns
          if (lake && dr >= ry - 1) {
            this.type[i] = T.LAVA;
            this.hardness[i] = st.hardnessMul * 0.9;
            this.mineral[i] = null;
          } else {
            this.type[i] = T.EMPTY;
            this.mineral[i] = null;
            this.hardness[i] = 0;
          }
        }
      }
    }
  }

  pickMineral(st, rng) {
    const candidates = st.minerals;
    let total = 0;
    for (const [, w] of candidates) total += w;
    if (!total) return null;
    let r = rng() * total;
    for (const [key, w] of candidates) {
      r -= w;
      if (r <= 0) return key;
    }
    return candidates[candidates.length - 1][0];
  }

  // Scatter mineable asteroid clusters through the sky band (negative rows).
  // Deterministic per seed so save/load regenerates the same field.
  generateAsteroids() {
    const rng = makeRng((this.seed ^ 0x5a17ed) >>> 0);
    const span = ASTEROID_MAX_ROWS - ASTEROID_MIN_ROWS;
    const N = 150;
    for (let a = 0; a < N; a++) {
      const cc = 2 + Math.floor(rng() * (COLS - 4));
      const rr = -(ASTEROID_MIN_ROWS + Math.floor(rng() * span)); // negative row
      const rad = 2 + Math.floor(rng() * 4);                       // 2..5 tiles
      const oreChance = 0.16 + rng() * 0.14;
      const depthFrac = (-rr - ASTEROID_MIN_ROWS) / span;          // 0..1, higher = rarer ore
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad + rng() * rad * 1.5) continue; // noisy circle
          const c = cc + dx, r = rr + dy;
          if (c < 1 || c >= COLS - 1) continue;
          const k = r * COLS + c;
          if (this.skyType.has(k)) continue;
          this.skyType.set(k, T.ROCK);
          this.skyHardness.set(k, 3 + rng() * 4);
          if (rng() < oreChance) this.skyMineral.set(k, this._pickAsteroidOre(rng, depthFrac));
        }
      }
    }
  }

  _pickAsteroidOre(rng, depthFrac) {
    // Weight the rarer ores up the higher into the belt you are.
    let total = 0;
    const weights = ASTEROID_ORES.map(([key, w], i) => {
      const adj = w * (1 + (i >= 2 ? depthFrac * 2.2 : -depthFrac * 0.4));
      total += Math.max(0.5, adj);
      return Math.max(0.5, adj);
    });
    let x = rng() * total;
    for (let i = 0; i < ASTEROID_ORES.length; i++) { x -= weights[i]; if (x <= 0) return ASTEROID_ORES[i][0]; }
    return ASTEROID_ORES[0][0];
  }

  // Drill level needed to break a rock tile (scales with depth/hardness)
  rockDrillLevelRequired(c, r) {
    const h = this.getHardness(c, r);
    if (h < 5) return 2;
    if (h < 9) return 3;
    if (h < 16) return 4;
    if (h < 28) return 5;
    return 6;
  }
}

// Color lookup for rendering a tile
export function tileColor(world, c, r) {
  const t = world.getType(c, r);
  switch (t) {
    case T.EMPTY:   return null;
    case T.DIRT:    return dirtShade(r - GROUND_ROW);
    case T.ROCK:    return "#6b6b73";
    case T.BEDROCK: return "#2a2a30";
    case T.LAVA:    return "#ff6a1a";
    case T.GAS:     return "#7fae3a";
    case T.BOULDER: return "#4a4a52";
    case T.CORE:    return "#b02a6a";
    case T.PLATFORM:return "#5a5660";
    case T.WATER:   return "#2a6abf";
    case T.GRAVEL:  return dirtShade(r - GROUND_ROW);
    default:        return "#000";
  }
}

export { TILE };
