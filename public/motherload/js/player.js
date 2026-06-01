// ============================================================
//  Player — the mining pod: physics, drilling, fuel, cargo, hull
// ============================================================
import {
  TILE, COLS, ROWS, GROUND_ROW, T, SPAWN_COL,
  PLAYER_W, PLAYER_H, GRAVITY, THRUST_UP, THRUST_SIDE,
  MAX_FALL, MAX_RISE, MAX_HSPEED, DRAG_X, SKY_CEILING_ROWS,
  FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_SCALE,
  FUEL_THRUST_UP, FUEL_THRUST_SIDE, FUEL_DRILL, FUEL_IDLE,
  MINERALS, UPGRADES, upgradeTier, ARTIFACTS, stratumAt, CORE_DRILL_LEVEL,
  HEAT_MAX, HEAT_BASE_COOL, HEAT_RADIATOR_COOL, HEAT_AMBIENT_SCALE,
  HEAT_LAVA_RADIANT, HEAT_DAMAGE_THRESHOLD, HEAT_DAMAGE_SCALE,
  PRESSURE_DAMAGE_SCALE,
} from "./config.js?v=40";

export class Player {
  constructor(world) {
    this.world = world;
    this.x = SPAWN_COL * TILE + (TILE - PLAYER_W) / 2;
    this.y = GROUND_ROW * TILE - PLAYER_H - 0.5; // rest on the surface (top of first dirt row)
    this.vx = 0;
    this.vy = 0;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
    this.facing = 1; // -1 left, 1 right
    this.onGround = false;
    this.diffDmg = 1;  // difficulty hazard-damage multiplier (set by game)
    this.diffFuel = 1; // difficulty fuel-burn multiplier (set by game)
    this.drillSpeedMul = 1;    // NG+ turbo-drill multiplier
    this.noFallDamage = false; // NG+ featherfall
    this.hullMul = 1;          // NG+ hull-capacity multiplier (glass cannon)
    this.thrustMul = 1;        // perk thrust multiplier

    // Upgrade tiers (index into UPGRADES[*].tiers)
    this.tier = {
      fuelTank: 0, drill: 0, cargo: 0, hull: 0, engine: 0, radiator: 0,
      fuelReactor: 0, dampers: 0, nanobots: 0, drillWidth: 0, scanner: 0,
      headlight: 0, sensor: 0,
    };

    // Resources
    this.maxFuel = UPGRADES.fuelTank.tiers[0].value;
    this.fuel = this.maxFuel;
    this.maxHull = UPGRADES.hull.tiers[0].value;
    this.hull = this.maxHull;
    this.cargoMax = UPGRADES.cargo.tiers[0].value;
    this.cargo = {}; // mineralKey -> count

    // Consumables
    this.dynamite = 0;
    this.teleporters = 0;

    // Drilling state
    this.drillTarget = null;  // {c, r}
    this.drillProgress = 0;   // 0..1
    this.drilling = false;
    this.heat = 0;            // builds in lava, cools otherwise

    // FX hooks (assigned by game)
    this.onParticles = null;  // (x,y,color,count)=>{}
    this.onToast = null;      // (msg, kind)=>{}
    this.onMineralCollected = null;
    this.onArtifactFound = null; // (artifactObj)=>{}
    this.onCoreBreak = null;     // () => {}  win trigger
    this.onSfx = null;           // (name)=>{}
    this.onTreasure = null;      // (value, x, y)=>{}
  }

  // -------- derived stats from upgrades --------
  get drillPower() { return upgradeTier("drill", this.tier.drill).value; }
  get drillLevel() { return upgradeTier("drill", this.tier.drill).level; }
  get engineMult() { return upgradeTier("engine", this.tier.engine).value; }
  get radiatorResist() { return upgradeTier("radiator", this.tier.radiator).value; }
  get fuelMult() { return upgradeTier("fuelReactor", this.tier.fuelReactor).value; }
  get damperResist() { return upgradeTier("dampers", this.tier.dampers).value; }
  get nanobotRate() { return upgradeTier("nanobots", this.tier.nanobots).value; }
  get drillExtra() { return upgradeTier("drillWidth", this.tier.drillWidth).value; }
  get scanRange() { return upgradeTier("scanner", this.tier.scanner).value; }
  get headlightRange() { return upgradeTier("headlight", this.tier.headlight || 0).value; }
  get sensorRange() { return upgradeTier("sensor", this.tier.sensor || 0).value; }

  get cargoCount() {
    let n = 0;
    for (const k in this.cargo) n += this.cargo[k];
    return n;
  }
  get cargoValue() {
    let v = 0;
    for (const k in this.cargo) v += this.cargo[k] * MINERALS[k].value;
    return v;
  }
  get cargoFull() { return this.cargoCount >= this.cargoMax; }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  get depthRow() {
    return Math.max(0, (this.centerY / TILE) - GROUND_ROW);
  }
  get depthMeters() {
    return Math.round(this.depthRow * 2); // ~2m per tile, arbitrary flavor
  }
  // Signed: positive below ground, negative when flying up above the surface.
  get depthSignedMeters() {
    return Math.round((this.centerY / TILE - GROUND_ROW) * 2);
  }

  applyUpgrade(key, tier) {
    this.tier[key] = tier;
    if (key === "fuelTank") {
      this.maxFuel = upgradeTier("fuelTank", tier).value;
    } else if (key === "hull") {
      const prev = this.maxHull;
      this.maxHull = Math.round(upgradeTier("hull", tier).value * (this.hullMul || 1));
      this.hull += this.maxHull - prev; // bonus added immediately
    } else if (key === "cargo") {
      this.cargoMax = upgradeTier("cargo", tier).value;
    }
  }

  // Recompute capacities from current tiers (used when loading a save)
  recomputeFromTiers() {
    this.maxFuel = upgradeTier("fuelTank", this.tier.fuelTank).value;
    this.maxHull = Math.round(upgradeTier("hull", this.tier.hull).value * (this.hullMul || 1));
    this.cargoMax = upgradeTier("cargo", this.tier.cargo).value;
  }

  addMineral(key) {
    if (this.cargoFull) return false;
    this.cargo[key] = (this.cargo[key] || 0) + 1;
    return true;
  }

  damage(amount, reason) {
    if (amount <= 0) return;
    amount *= this.diffDmg || 1; // difficulty hazard scaling
    this.hull = Math.max(0, this.hull - amount);
    this._sinceDamage = 0; // pause nanobot regen
  }

  // ============================================================
  //  Update
  // ============================================================
  update(dt, input, paused) {
    if (paused) return;

    const world = this.world;
    const outOfFuel = this.fuel <= 0;

    // Contact hazards from flowing liquids / cave-ins (checked pre-collision,
    // catching the frame a liquid or gravel flows into the pod's tile).
    this.checkContact(dt);

    // ----- Input intent -----
    const wantUp = input.down("up") && !outOfFuel;
    const wantLeft = input.down("left");
    const wantRight = input.down("right");
    const wantDown = input.down("down");

    // ----- Horizontal thrust -----
    let ax = 0;
    const tMul = this.thrustMul || 1;
    if (wantLeft && !wantRight) { ax = -THRUST_SIDE * this.engineMult * tMul; this.facing = -1; }
    else if (wantRight && !wantLeft) { ax = THRUST_SIDE * this.engineMult * tMul; this.facing = 1; }

    const horizThrusting = ax !== 0 && !outOfFuel;
    if (!horizThrusting) ax = 0;

    this.vx += ax * dt;
    // Horizontal drag when not actively thrusting
    if (!horizThrusting) {
      const sign = Math.sign(this.vx);
      this.vx -= sign * Math.min(Math.abs(this.vx), DRAG_X * 60 * dt);
    }
    const hCap = MAX_HSPEED * this.engineMult; // Engine upgrade raises top speed
    this.vx = clamp(this.vx, -hCap, hCap);

    // ----- Vertical: gravity + up thrust -----
    this.vy += GRAVITY * dt;
    let upThrusting = false;
    if (wantUp) {
      this.vy -= THRUST_UP * this.engineMult * (this.thrustMul || 1) * dt;
      upThrusting = true;
    }
    this.vy = clamp(this.vy, -MAX_RISE, MAX_FALL);

    // ----- Fuel burn (reduced by Fuel Reactor) -----
    let burn = FUEL_IDLE;
    if (upThrusting) burn += FUEL_THRUST_UP;
    if (horizThrusting) burn += FUEL_THRUST_SIDE;
    // Reserve mode: below 5% the engine sips fuel, giving you a forgiving limp home
    const reserve = this.fuel <= this.maxFuel * 0.05 ? 0.55 : 1;
    this.fuel = Math.max(0, this.fuel - burn * this.fuelMult * reserve * (this.diffFuel || 1) * dt);

    // ----- Move + collide (drilling handled on contact) -----
    this.moveAndCollide(dt, { wantLeft, wantRight, wantDown }, input);

    // ----- Heat & pressure (environmental hazards) -----
    this.updateHazards(dt);

    // Clamp into world bounds (safety). The top is open sky — climb up to the
    // sky ceiling (space); only the floor is a hard limit below.
    this.x = clamp(this.x, TILE, (COLS - 1) * TILE - this.w);
    this.y = clamp(this.y, -SKY_CEILING_ROWS * TILE, (ROWS - 1) * TILE - this.h);
  }

  moveAndCollide(dt, intent, input) {
    const world = this.world;

    // ---- Horizontal axis ----
    const prevVx = this.vx;
    this.x += this.vx * dt;
    let hitWall = this.resolveAxis("x");

    // ---- Vertical axis ----
    const prevVy = this.vy;
    this.y += this.vy * dt;
    const wasOnGround = this.onGround;
    this.onGround = false;
    let hitFloor = this.resolveAxis("y");

    // Fall damage on hard landings (reduced by Impact Dampers; off with Featherfall)
    if (hitFloor && prevVy > FALL_DAMAGE_THRESHOLD && !this.noFallDamage) {
      const dmg = (prevVy - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_SCALE * (1 - this.damperResist);
      this.damage(dmg, "impact");
      if (this.onParticles) this.onParticles(this.centerX, this.y + this.h, "#caa", 10);
      if (dmg > 4 && this.onToast) this.onToast(`Crash! -${Math.round(dmg)} hull`, "bad");
    }

    // ---- Drilling: decide a target based on contact + intent ----
    this.updateDrilling(dt, intent, input);
  }

  // Contact with tiles the pod's body overlaps — being engulfed by flowing
  // lava or buried by a cave-in (caught the frame it flows in, pre-collision).
  checkContact(dt) {
    const w = this.world;
    const left = Math.floor(this.x / TILE);
    const right = Math.floor((this.x + this.w - 1) / TILE);
    const top = Math.floor(this.y / TILE);
    const bottom = Math.floor((this.y + this.h - 1) / TILE);
    let inLava = false, inGravel = false;
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        const t = w.getType(c, r);
        if (t === T.LAVA) inLava = true;
        else if (t === T.GRAVEL) inGravel = true;
      }
    }
    if (inLava) {
      this.damage(Math.max(8, 42 * (1 - this.radiatorResist)) * dt, "lava");
      this.heat = Math.min(100, this.heat + 60 * dt);
      if (this.onSfx && !this._lavaSfxT) { this.onSfx("lava"); this._lavaSfxT = 0.4; }
      this._lavaSfxT = Math.max(0, (this._lavaSfxT || 0) - dt);
      if (this.onParticles && Math.random() < 0.5) this.onParticles(this.centerX, this.centerY, "#ff7a1a", 3);
    } else {
      this._lavaSfxT = 0;
    }
    if (inGravel) {
      this.damage(14 * dt, "crush");
      if (this.onParticles && Math.random() < 0.4) this.onParticles(this.centerX, this.centerY, "#a8794d", 2);
    }
  }

  // Environmental hazards: heat build-up (depth + nearby lava) and deep pressure.
  updateHazards(dt) {
    const world = this.world;
    const depthRow = this.depthRow;
    const st = stratumAt(depthRow);

    // Count adjacent lava (radiant heat) and water (radiant cooling)
    const col = Math.floor(this.centerX / TILE);
    const row = Math.floor(this.centerY / TILE);
    let lavaNear = 0, waterNear = 0;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        const tt = world.getType(c, r);
        if (tt === T.LAVA) lavaNear++;
        else if (tt === T.WATER) waterNear++;
      }
    }

    const heatIn = st.ambientHeat * HEAT_AMBIENT_SCALE + lavaNear * HEAT_LAVA_RADIANT;
    const heatOut = HEAT_BASE_COOL + this.radiatorResist * HEAT_RADIATOR_COOL + waterNear * 8;
    this.heat = Math.max(0, Math.min(HEAT_MAX, this.heat + (heatIn - heatOut) * dt));

    // Overheating damages the hull
    if (this.heat > HEAT_DAMAGE_THRESHOLD) {
      const dmg = (this.heat - HEAT_DAMAGE_THRESHOLD) * HEAT_DAMAGE_SCALE * dt;
      this.damage(dmg, "heat");
      this._heatWarnT = (this._heatWarnT || 0) + dt;
      if (this._heatWarnT > 1.2) {
        this._heatWarnT = 0;
        if (this.onToast) this.onToast("OVERHEATING! Hull melting — get a Cooling System", "bad");
      }
    }

    // Deep pressure: a slow crush mitigated by hull tier (better hull = more resistant)
    if (st.pressure > 0) {
      const resist = 1 / (1 + this.tier.hull * 0.6); // higher hull tier -> less crush
      const dmg = st.pressure * PRESSURE_DAMAGE_SCALE * resist * dt;
      this.damage(dmg, "pressure");
      this._pressWarnT = (this._pressWarnT || 0) + dt;
      if (this._pressWarnT > 2.5 && resist > 0.5) {
        this._pressWarnT = 0;
        if (this.onToast) this.onToast("Crushing pressure — upgrade your Hull", "bad");
      }
    }

    // Repair Nanobots — slow hull regen when not actively taking damage
    this._sinceDamage = (this._sinceDamage || 0) + dt;
    if (this.nanobotRate > 0 && this._sinceDamage > 1.2 && this.hull < this.maxHull) {
      this.hull = Math.min(this.maxHull, this.hull + this.nanobotRate * dt);
    }
  }

  // Resolve collisions on one axis against solid tiles.
  // Returns true if a collision stopped motion on that axis.
  resolveAxis(axis) {
    const world = this.world;
    let collided = false;

    const left = Math.floor(this.x / TILE);
    const right = Math.floor((this.x + this.w - 0.001) / TILE);
    const top = Math.floor(this.y / TILE);
    const bottom = Math.floor((this.y + this.h - 0.001) / TILE);

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (!world.isBlocking(c, r)) continue;
        // AABB overlap with this tile
        const tx = c * TILE, ty = r * TILE;
        if (this.x < tx + TILE && this.x + this.w > tx &&
            this.y < ty + TILE && this.y + this.h > ty) {
          if (axis === "x") {
            if (this.vx > 0) { this.x = tx - this.w; }
            else if (this.vx < 0) { this.x = tx + TILE; }
            this.vx = 0;
            collided = true;
          } else {
            if (this.vy > 0) { this.y = ty - this.h; this.onGround = true; }
            else if (this.vy < 0) { this.y = ty + TILE; }
            this.vy = 0;
            collided = true;
          }
        }
      }
    }
    return collided;
  }

  // Determine which tile (if any) we are drilling, advance progress, break it.
  updateDrilling(dt, intent, input) {
    const world = this.world;
    const cx = this.centerX, cy = this.centerY;
    const col = Math.floor(cx / TILE);
    const row = Math.floor(cy / TILE);

    let target = null;
    let dir = null;

    // Priority: down drilling (most common), then the pressed horizontal dir.
    if (intent.wantDown) {
      const below = { c: col, r: Math.floor((this.y + this.h + 1) / TILE) };
      if (world.isDrillable(below.c, below.r) && this.isAligned("down", below)) {
        target = below; dir = "down";
      }
    }
    if (!target && intent.wantLeft) {
      const lft = { c: Math.floor((this.x - 1) / TILE), r: row };
      if (world.isDrillable(lft.c, lft.r) && this.isAligned("left", lft)) {
        target = lft; dir = "left";
      }
    }
    if (!target && intent.wantRight) {
      const rgt = { c: Math.floor((this.x + this.w + 1) / TILE), r: row };
      if (world.isDrillable(rgt.c, rgt.r) && this.isAligned("right", rgt)) {
        target = rgt; dir = "right";
      }
    }

    if (!target) {
      this.drilling = false;
      this.drillTarget = null;
      this.drillProgress = 0;
      return;
    }

    // Rock gating: drill level must be high enough
    if (world.getType(target.c, target.r) === T.ROCK) {
      const need = world.rockDrillLevelRequired(target.c, target.r);
      if (this.drillLevel < need) {
        this.drilling = false;
        this.drillTarget = null;
        this.drillProgress = 0;
        if (input.justPressed(dir) && this.onToast) {
          this.onToast(`Drill too weak for this rock (need Lv.${need})`, "bad");
        }
        return;
      }
    }

    // The Heart of Natas requires a Diamond Drill (Lv.5) or better
    if (world.getType(target.c, target.r) === T.CORE) {
      if (this.drillLevel < CORE_DRILL_LEVEL) {
        this.drilling = false;
        this.drillTarget = null;
        this.drillProgress = 0;
        if (input.justPressed(dir) && this.onToast) {
          this.onToast(`The Heart is impossibly hard — you need a Diamond Drill`, "bad");
        }
        return;
      }
    }

    // New target resets progress
    if (!this.drillTarget || this.drillTarget.c !== target.c || this.drillTarget.r !== target.r) {
      this.drillTarget = target;
      this.drillProgress = 0;
    }

    this.drilling = true;
    this.facing = dir === "left" ? -1 : dir === "right" ? 1 : this.facing;

    // Fuel cost while drilling (reduced by Fuel Reactor)
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - FUEL_DRILL * this.fuelMult * (this.diffFuel || 1) * dt);
    } else {
      // No fuel = no drilling
      this.drilling = false;
      return;
    }

    // Advance progress: power / hardness per second
    const hardness = Math.max(0.1, world.getHardness(target.c, target.r));
    const rate = this.drillPower * (this.drillSpeedMul || 1) / hardness; // tiles per second
    this.drillProgress += rate * dt;

    // Drill particles
    if (this.onParticles && Math.random() < 0.6) {
      const px = target.c * TILE + TILE / 2;
      const py = target.r * TILE + TILE / 2;
      this.onParticles(px, py, "#a8794d", 1);
    }

    if (this.drillProgress >= 1) {
      this.breakTile(target.c, target.r);
      if (this.drillExtra > 0) this.breakExtras(target, dir);
      this.drillProgress = 0;
      this.drillTarget = null;
    }
  }

  // Wide-drill: break tiles perpendicular to the dig direction (Drill Array upgrade)
  breakExtras(target, dir) {
    const n = this.drillExtra;
    const perps = (dir === "down" || dir === "up")
      ? [[-1, 0], [1, 0]]   // horizontal neighbours when digging vertically
      : [[0, -1], [0, 1]];  // vertical neighbours when digging horizontally
    for (const [dx, dy] of perps) {
      for (let k = 1; k <= n; k++) {
        const c = target.c + dx * k, r = target.r + dy * k;
        const t = this.world.getType(c, r);
        if (t === T.CORE || t === T.BOULDER || t === T.BEDROCK || t === T.EMPTY) break;
        this.breakTile(c, r);
      }
    }
  }

  // Is the player lined up well enough to drill this neighbor?
  isAligned(dir, tile) {
    const cx = this.centerX, cy = this.centerY;
    if (dir === "down" || dir === "up") {
      const tileCenterX = tile.c * TILE + TILE / 2;
      return Math.abs(cx - tileCenterX) < TILE * 0.55;
    } else {
      const tileCenterY = tile.r * TILE + TILE / 2;
      return Math.abs(cy - tileCenterY) < TILE * 0.55;
    }
  }

  breakTile(c, r) {
    const world = this.world;
    const type = world.getType(c, r);
    const mineral = world.getMineral(c, r);
    const artifactId = world.getArtifact(c, r);
    const treasure = world.getTreasure(c, r);
    const px = c * TILE + TILE / 2;
    const py = r * TILE + TILE / 2;

    if (type === T.LAVA) {
      const dmg = Math.max(3, 22 * (1 - this.radiatorResist));
      this.damage(dmg, "lava");
      this.heat = Math.min(100, this.heat + 40 * (1 - this.radiatorResist));
      if (this.onParticles) this.onParticles(px, py, "#ff7a1a", 14);
      if (this.onSfx) this.onSfx("lava");
      if (this.onToast) this.onToast(`Lava! -${Math.round(dmg)} hull`, "bad");
    } else if (type === T.GAS) {
      // Chain reaction: ignite connected gas pockets
      const n = this.igniteGas(c, r);
      const dmg = Math.min(70, 14 + n * 6);
      this.damage(dmg, "gas");
      this.vy -= 200 + n * 18; // explosive knockback
      if (this.onParticles) this.onParticles(px, py, "#cfe06a", 12 + n * 4);
      if (this.onSfx) this.onSfx("explosion");
      if (this.onToast) this.onToast(`Gas explosion!${n > 1 ? ` (chain x${n})` : ""} -${Math.round(dmg)} hull`, "bad");
    }

    // The Heart of Natas — breaking the center wins the game
    if (type === T.CORE) {
      if (this.onParticles) this.onParticles(px, py, "#ff3a8a", 30);
      const core = world.coreCenter;
      if (core && c === core.c && r === core.r && this.onCoreBreak) {
        world.clearTile(c, r);
        this.onCoreBreak();
        return;
      }
    }

    // Artifact (always recovered — does not use cargo space)
    if (artifactId) {
      const a = ARTIFACTS.find((x) => x.id === artifactId);
      if (a && this.onArtifactFound) this.onArtifactFound(a);
      if (this.onParticles) this.onParticles(px, py, "#ffdf6a", 26);
    }

    // Buried treasure — instant bonus payout
    if (treasure > 0 && this.onTreasure) {
      this.onTreasure(Math.round(treasure), px, py);
    }

    // Collect mineral
    if (mineral) {
      if (!this.cargoFull) {
        this.addMineral(mineral);
        if (this.onMineralCollected) this.onMineralCollected(mineral, px, py);
      } else {
        if (this.onToast) this.onToast("Cargo full!", "bad");
      }
    } else if (!artifactId) {
      if (this.onParticles) this.onParticles(px, py, "#8a6a45", 5);
    }

    world.clearTile(c, r);
  }

  // Flood-fill ignite connected gas tiles. Returns number detonated (incl. origin).
  igniteGas(c0, r0) {
    const world = this.world;
    const stack = [[c0, r0]];
    let count = 0;
    while (stack.length && count < 30) {
      const [c, r] = stack.pop();
      if (world.getType(c, r) !== T.GAS) continue;
      world.clearTile(c, r);
      count++;
      if (this.onParticles) this.onParticles(c * TILE + TILE / 2, r * TILE + TILE / 2, "#cfe06a", 6);
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return Math.max(1, count);
  }

  // Dynamite: clear a 3x3 area around the tile below/in front of the pod
  useDynamite() {
    if (this.dynamite <= 0) {
      if (this.onToast) this.onToast("No dynamite", "bad");
      return false;
    }
    this.dynamite--;
    const col = Math.floor(this.centerX / TILE);
    const row = Math.floor((this.y + this.h + TILE) / TILE);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc, r = row + dr;
        if (this.world.getType(c, r) === T.BEDROCK || this.world.getType(c, r) === T.BOULDER) continue;
        const m = this.world.getMineral(c, r);
        if (m && !this.cargoFull) { this.addMineral(m); if (this.onMineralCollected) this.onMineralCollected(m); }
        this.world.clearTile(c, r);
      }
    }
    if (this.onParticles) this.onParticles(col * TILE + TILE / 2, row * TILE + TILE / 2, "#ffcf3f", 30);
    if (this.onSfx) this.onSfx("explosion");
    if (this.onToast) this.onToast("Boom!", "good");
    return true;
  }

  useTeleporter() {
    if (this.teleporters <= 0) {
      if (this.onToast) this.onToast("No teleporter", "bad");
      return false;
    }
    this.teleporters--;
    this.x = SPAWN_COL * TILE + (TILE - this.w) / 2;
    this.y = GROUND_ROW * TILE - this.h - 0.5;
    this.vx = 0; this.vy = 0;
    if (this.onToast) this.onToast("Teleported to surface!", "good");
    return true;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
