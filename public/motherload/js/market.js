// ============================================================
//  Market — a living mineral economy. Each mineral's price drifts
//  on a mean-reverting random walk, dumping a big haul floods the
//  market and depresses that mineral's price (which recovers over
//  time), and occasional surges/crashes shake things up. Prices are
//  stored as a multiplier on each mineral's base value.
// ============================================================
import { MINERALS, MINERAL_KEYS } from "./config.js?v=40";

function rngFrom(seed) {
  let a = (seed ^ 0x85ebca6b) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const MARKET_MIN = 0.5;
export const MARKET_MAX = 1.85;
const STEP = 4.5;          // seconds between price ticks
const REVERT = 0.05;       // pull toward fair value (1.0) each tick
const NOISE = 0.045;       // random walk magnitude per tick

export class MarketManager {
  constructor(seed = 1) {
    this.rng = rngFrom((seed | 0) || 1);
    this.mult = {};
    this.prev = {};
    for (const k of MINERAL_KEYS) {
      const m = 0.85 + this.rng() * 0.3; // seed a spread of starting prices
      this.mult[k] = m;
      this.prev[k] = m;
    }
    this.t = 0;
    this.event = null;       // { key, kind: 'surge'|'crash', tLeft }
    this.onEvent = null;     // (mineralName, kind) => {}  (game wires a toast)
  }

  unitPrice(key) {
    return Math.max(1, Math.round(MINERALS[key].value * (this.mult[key] ?? 1)));
  }

  // % deviation from fair value, rounded — for display ("+24%", "-12%").
  deviation(key) { return Math.round(((this.mult[key] ?? 1) - 1) * 100); }

  trend(key) {
    const d = (this.mult[key] ?? 1) - (this.prev[key] ?? 1);
    return d > 0.008 ? "up" : d < -0.008 ? "down" : "flat";
  }

  update(dt) {
    this.t += dt;
    if (this.event) {
      this.event.tLeft -= dt;
      if (this.event.tLeft <= 0) this.event = null;
    }
    if (this.t < STEP) return;
    this.t = 0;
    for (const k of MINERAL_KEYS) this.prev[k] = this.mult[k];
    for (const k of MINERAL_KEYS) {
      const m = this.mult[k];
      const revert = (1 - m) * REVERT;
      const noise = (this.rng() * 2 - 1) * NOISE;
      this.mult[k] = clamp(m + revert + noise, MARKET_MIN, MARKET_MAX);
    }
    this._maybeEvent();
  }

  _maybeEvent() {
    if (this.event) return;
    if (this.rng() > 0.12) return; // ~12% chance per tick
    const key = MINERAL_KEYS[(this.rng() * MINERAL_KEYS.length) | 0];
    const surge = this.rng() < 0.55;
    if (surge) this.mult[key] = clamp(this.mult[key] * (1.35 + this.rng() * 0.35), MARKET_MIN, MARKET_MAX);
    else this.mult[key] = clamp(this.mult[key] * (0.55 + this.rng() * 0.2), MARKET_MIN, MARKET_MAX);
    this.event = { key, kind: surge ? "surge" : "crash", tLeft: 8 };
    if (this.onEvent) this.onEvent(MINERALS[key].name, surge ? "surge" : "crash");
  }

  // Selling floods the market: depress this mineral's price by the haul size.
  // Returns the gross paid at the price in effect at sale time.
  registerSale(key, count) {
    const gross = this.unitPrice(key) * count;
    const drop = Math.min(0.45, count * 0.014);
    this.mult[key] = Math.max(MARKET_MIN, this.mult[key] * (1 - drop));
    return gross;
  }

  serialize() { return { mult: this.mult, t: this.t }; }
  load(data) {
    if (!data || !data.mult) return;
    for (const k of MINERAL_KEYS) {
      if (typeof data.mult[k] === "number") { this.mult[k] = data.mult[k]; this.prev[k] = data.mult[k]; }
    }
    this.t = data.t || 0;
  }
}
