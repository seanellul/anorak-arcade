// ============================================================
//  Achievements & Records — persistent across runs (separate
//  localStorage key from the save, so they survive death/new games).
//  Achievements are state-checkable predicates evaluated each tick;
//  records track lifetime personal bests.
// ============================================================
import { ORE_KEYS, ALLOYS, ARTIFACTS, SPACE_ORE_KEYS } from "./config.js?v=49";

const PROGRESS_KEY = "motherload_progress_v1";
const ALLOY_KEYS = Object.keys(ALLOYS);

// Each cond(ctx) -> bool, where ctx = { state, game }.
export const ACHIEVEMENTS = [
  { id: "first_strike", icon: "⛏", name: "First Strike", desc: "Sell your first haul of minerals.",
    cond: (c) => c.state.stats.totalEarned > 0 },
  { id: "prospector", icon: "💰", name: "Prospector", desc: "Earn $50,000 in a single run.",
    cond: (c) => c.state.stats.totalEarned >= 50000 },
  { id: "deep_diver", icon: "🔽", name: "Deep Diver", desc: "Descend to 500m.",
    cond: (c) => c.state.stats.maxDepth >= 500 },
  { id: "the_abyss", icon: "🕳", name: "Into the Abyss", desc: "Descend to 1,500m.",
    cond: (c) => c.state.stats.maxDepth >= 1500 },
  { id: "the_core", icon: "❤", name: "Heart of the World", desc: "Reach the Motherlode at the very bottom.",
    cond: (c) => c.state.stats.maxDepth >= 2150 },
  { id: "rockhound", icon: "🪨", name: "Rockhound", desc: "Catalogue every natural ore.",
    cond: (c) => ORE_KEYS.every((k) => (c.state.codex.minerals || []).includes(k)) },
  { id: "relic_hunter", icon: "🏺", name: "Relic Hunter", desc: "Recover all 8 ancient relics.",
    cond: (c) => (c.state.codex.artifacts || []).length >= ARTIFACTS.length },
  { id: "millionaire", icon: "🤑", name: "Millionaire", desc: "Hold $1,000,000 at once.",
    cond: (c) => c.state.money >= 1000000 },
  { id: "smelter", icon: "🔥", name: "Master Smelter", desc: "Refine a raw ore into an alloy.",
    cond: (c) => ALLOY_KEYS.some((k) => (c.state.player.cargo[k] || 0) > 0) },
  { id: "storm_rider", icon: "🌪", name: "Storm Rider", desc: "Be caught out in a full dust storm.",
    cond: (c) => c.game.weather && c.game.weather.type === "dust" && c.game.weather.intensity > 0.5 },
  { id: "maxed_out", icon: "⚙", name: "Fully Tuned", desc: "Install 15 ship upgrades.",
    cond: (c) => (c.state.upgradesPurchased || 0) >= 15 },
  { id: "hardcore_legend", icon: "💀", name: "Hardcore Legend", desc: "Reach 1,000m in Hardcore mode.",
    cond: (c) => c.state.difficulty === "hardcore" && c.state.stats.maxDepth >= 1000 },
  { id: "astronaut", icon: "🚀", name: "Astronaut", desc: "Rocket all the way up to space.", cond: () => false },
  { id: "void_miner", icon: "☄", name: "Void Miner", desc: "Mine ore from an asteroid.",
    cond: (c) => SPACE_ORE_KEYS.some((k) => (c.state.player.cargo[k] || 0) > 0) },
  // Ending achievements — granted directly when you make the choice (cond never auto-fires).
  { id: "ending_free",    icon: "👁", name: "Liberator", desc: "Free the Heart of Natas.",     cond: () => false },
  { id: "ending_seal",    icon: "🔒", name: "Warden",    desc: "Seal the Heart of Natas away.", cond: () => false },
  { id: "ending_harness", icon: "⚡", name: "Ascendant", desc: "Harness the Heart of Natas.",   cond: () => false },
];

const DEFAULT_RECORDS = { deepest: 0, richest: 0, bestRun: 0, runs: 0, deaths: 0 };

export class AchievementManager {
  constructor() {
    this.unlocked = {};
    this.records = { ...DEFAULT_RECORDS };
    this.onUnlock = null; // (ach) => {}
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (d) {
        this.unlocked = d.unlocked || {};
        this.records = { ...DEFAULT_RECORDS, ...(d.records || {}) };
      }
    } catch {}
  }

  save() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ unlocked: this.unlocked, records: this.records }));
    } catch {}
  }

  unlockedCount() { return Object.keys(this.unlocked).length; }

  // Grant an achievement directly (used for choice-driven ending unlocks).
  unlock(id) {
    if (this.unlocked[id]) return;
    this.unlocked[id] = Date.now();
    this.save();
    this._mirrorToSteam(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a && this.onUnlock) this.onUnlock(a);
  }

  // In the desktop/Steam build a preload exposes window.steamAPI; the in-game
  // achievement ID doubles as the Steam achievement API name. No-op in the
  // browser (the object simply isn't there).
  _mirrorToSteam(id) {
    try {
      if (typeof window !== "undefined" && window.steamAPI && window.steamAPI.unlockAchievement) {
        window.steamAPI.unlockAchievement(id);
      }
    } catch {}
  }

  // Evaluate predicates + roll personal bests. Called on a slow tick.
  check(game) {
    if (!game.state) return;
    const ctx = { state: game.state, game };
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked[a.id]) continue;
      let ok = false;
      try { ok = a.cond(ctx); } catch { ok = false; }
      if (ok) {
        this.unlocked[a.id] = Date.now();
        changed = true;
        this._mirrorToSteam(a.id);
        if (this.onUnlock) this.onUnlock(a);
      }
    }
    // Personal bests
    const s = game.state;
    const r = this.records;
    if (s.stats.maxDepth > r.deepest) { r.deepest = s.stats.maxDepth; changed = true; }
    if (s.money > r.richest) { r.richest = s.money; changed = true; }
    if (s.stats.totalEarned > r.bestRun) { r.bestRun = s.stats.totalEarned; changed = true; }
    if (changed) this.save();
  }

  recordRun() { this.records.runs++; this.save(); }
  recordDeath() { this.records.deaths++; this.save(); }
}
