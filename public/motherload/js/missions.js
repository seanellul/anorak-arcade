// ============================================================
//  Missions — the campaign spine + repeatable side contracts
// ============================================================
import { MINERALS } from "./config.js?v=50";

// Main story campaign. Completing one unlocks the next.
// types: "collect" (gather N of a mineral), "depth" (reach D meters)
export const CAMPAIGN = [
  { id: "m1", title: "First Contact", type: "collect", mineral: "ironium", count: 5, reward: 200,
    brief: "Welcome to the dig, pilot. Bring up 5 Ironium and prove that drill spins.",
    lore: null },
  { id: "m2", title: "Going Under", type: "depth", meters: 200, reward: 450,
    brief: "Descend to 200m. The real ore sleeps beneath the crust.",
    lore: "WEAK SIGNAL ◇ \"...is someone up there? ...so long since the drills stopped...\"" },
  { id: "m3", title: "Silver Tongues", type: "collect", mineral: "silverium", count: 8, reward: 1200,
    brief: "The exchange is paying well for Silverium. Haul up 8 loads.",
    lore: null },
  { id: "m4", title: "The Mantle", type: "depth", meters: 500, reward: 2400,
    brief: "Reach 500m, down into the Rocky Mantle. Watch for the first lava.",
    lore: "TRANSMISSION ◇ \"It was here before the colony. Before the planet cooled. It is patient.\"" },
  { id: "m5", title: "Gold Fever", type: "collect", mineral: "goldium", count: 6, reward: 4000,
    brief: "Six Goldium. The investors upstairs are getting greedy.",
    lore: null },
  { id: "m6", title: "Crystal Heart", type: "depth", meters: 900, reward: 8000,
    brief: "Push to 900m — the Crystal Caverns. They say the crystals sing down there.",
    lore: "TRANSMISSION ◇ \"The crystals hum at night. They are singing to something underneath. Don't listen.\"" },
  { id: "m7", title: "Into the Fire", type: "depth", meters: 1300, reward: 16000,
    brief: "Brave the Magma Fields at 1300m. Buy a Cooling System first — I mean it.",
    lore: null },
  { id: "m8", title: "Element 99", type: "collect", mineral: "einsteinium", count: 4, reward: 32000,
    brief: "Four loads of Einsteinium, pulled straight from the fire.",
    lore: null },
  { id: "m9", title: "Frozen Whispers", type: "depth", meters: 1900, reward: 65000,
    brief: "Descend to 1900m, the Frozen Deep. The readings make no sense down here.",
    lore: "TRANSMISSION ◇ \"It is not a god. It is older. It remembers when this world was warm.\" — N." },
  { id: "m10", title: "The Motherlode", type: "depth", meters: 2300, reward: 150000,
    brief: "Reach 2300m. Whatever is calling from the bottom... go and find it.",
    lore: "DIRECT FEED ◇ \"You hear me now, don't you? Good. Keep digging, little drill. I have waited so long.\" — NATAS" },
];

// Templates for repeatable side contracts (procedurally offered)
const SIDE_TEMPLATES = [
  { mineral: "ironium", count: 12, reward: 350 },
  { mineral: "bronzium", count: 10, reward: 700 },
  { mineral: "silverium", count: 10, reward: 1400 },
  { mineral: "goldium", count: 8, reward: 3000 },
  { mineral: "platinum", count: 6, reward: 7500 },
  { mineral: "einsteinium", count: 5, reward: 18000 },
  { mineral: "emerald", count: 4, reward: 40000 },
  { mineral: "ruby", count: 3, reward: 90000 },
];

export class MissionManager {
  constructor() {
    this.index = 0;          // campaign mission index
    this.collectCount = 0;   // progress for the current collect mission
    this.completed = [];     // ids of finished campaign missions
    this.loreLog = [];       // unlocked transmissions
    this.side = null;        // current side contract {mineral,count,reward,progress}
    this.sideDone = 0;
    this.endgameUnlocked = false;

    // callbacks (assigned by game)
    this.onComplete = null;  // (mission, next) => {}
    this.onLore = null;      // (loreText, title) => {}
    this.onSideComplete = null;
  }

  get current() { return this.index < CAMPAIGN.length ? CAMPAIGN[this.index] : null; }
  get campaignDone() { return this.index >= CAMPAIGN.length; }

  // ---- progress hooks ----
  onCollect(key) {
    const m = this.current;
    if (m && m.type === "collect" && m.mineral === key) {
      this.collectCount++;
      this._checkCampaign();
    }
    if (this.side && this.side.mineral === key) {
      this.side.progress++;
      if (this.side.progress >= this.side.count) this._completeSide();
    }
  }

  onDepth(maxMeters) {
    const m = this.current;
    if (m && m.type === "depth" && maxMeters >= m.meters) {
      this._checkCampaign(maxMeters);
    }
  }

  progressOf(m, state) {
    if (!m) return { cur: 0, max: 1, text: "" };
    if (m.type === "collect") {
      return { cur: this.collectCount, max: m.count,
               text: `${this.collectCount}/${m.count} ${MINERALS[m.mineral].name}` };
    }
    const d = state ? state.stats.maxDepth : 0;
    return { cur: Math.min(d, m.meters), max: m.meters, text: `${Math.min(d, m.meters)}/${m.meters} m` };
  }

  _checkCampaign(maxMeters) {
    const m = this.current;
    if (!m) return;
    const done = m.type === "collect"
      ? this.collectCount >= m.count
      : (maxMeters || 0) >= m.meters;
    if (done) this._completeCampaign(m);
  }

  _completeCampaign(m) {
    this.completed.push(m.id);
    if (m.lore) {
      this.loreLog.push({ title: m.title, text: m.lore });
      if (this.onLore) this.onLore(m.lore, m.title);
    }
    this.index++;
    this.collectCount = 0;
    if (this.campaignDone) this.endgameUnlocked = true;
    if (this.onComplete) this.onComplete(m, this.current, m.reward);
  }

  // ---- side contracts ----
  offerSide(rng = Math.random) {
    if (this.side) return this.side;
    const t = SIDE_TEMPLATES[Math.floor(rng() * SIDE_TEMPLATES.length)];
    this.side = { ...t, progress: 0 };
    return this.side;
  }
  abandonSide() { this.side = null; }
  _completeSide() {
    const reward = this.side.reward;
    this.sideDone++;
    if (this.onSideComplete) this.onSideComplete(this.side, reward);
    this.side = null;
  }

  // ---- save / load ----
  serialize() {
    return {
      index: this.index, collectCount: this.collectCount,
      completed: this.completed, loreLog: this.loreLog,
      side: this.side, sideDone: this.sideDone,
      endgameUnlocked: this.endgameUnlocked,
    };
  }
  static deserialize(data) {
    const m = new MissionManager();
    if (data) {
      m.index = data.index || 0;
      m.collectCount = data.collectCount || 0;
      m.completed = data.completed || [];
      m.loreLog = data.loreLog || [];
      m.side = data.side || null;
      m.sideDone = data.sideDone || 0;
      m.endgameUnlocked = !!data.endgameUnlocked;
    }
    return m;
  }
}
