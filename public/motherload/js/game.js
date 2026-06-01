// ============================================================
//  Game — state machine, main loop, rendering, save/load
// ============================================================
import {
  TILE, COLS, ROWS, GROUND_ROW, VIEW_W, VIEW_H, WORLD_W, WORLD_H,
  T, MINERALS, START_MONEY, FUEL_PRICE, stratumAt, STRATA, SPAWN_COL, SPACE_ALT, ASTEROID_MIN_ROWS,
  POD_SKINS, SKIN_KEY, DIFFICULTIES, DIFFICULTY_KEYS,
  MUTATORS, MUTATOR_KEYS, resolveMutators,
  PERKS, PERK_BRANCH_KEYS, resolvePerks, perkPointsEarned,
  ENDINGS, RESTOCK_TARGET,
} from "./config.js?v=47";
import { World, tileColor } from "./world.js?v=47";
import { Player } from "./player.js?v=47";
import { Camera } from "./camera.js?v=47";
import { Input } from "./input.js?v=47";
import { UI } from "./ui.js?v=47";
import { BUILDINGS, buildingAt, sellAll, buyFullFuel, autoRestock } from "./shops.js?v=47";
import { MissionManager } from "./missions.js?v=47";
import { AudioManager } from "./audio.js?v=47";
import { NavManager } from "./nav.js?v=47";
import { WeatherManager } from "./weather.js?v=47";
import { MarketManager } from "./market.js?v=47";
import { AchievementManager, ACHIEVEMENTS } from "./achievements.js?v=47";
import { RadioManager } from "./radio.js?v=47";

const SAVE_KEY = "motherload_save_v1";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = new Input();
    this.camera = new Camera();
    this.audio = new AudioManager();
    this.flashAmount = 0;
    this._prevHull = 0;
    this.particles = [];
    this.floaters = [];     // floating value/damage text
    this.hitStop = 0;       // brief freeze-frame on impactful events
    this.cine = null;       // active cinematic moment (letterbox + slow-mo + title)
    this.comboCount = 0;    // ore mined in quick succession
    this.comboTimer = 0;
    this.mode = "menu"; // menu | playing | shop | paused | gameover | won
    this.activeBuilding = null;
    this.lastTime = 0;
    this.state = null;
    this.accumBlink = 0;
    this.shakeAmount = 0;
    this.skin = this.loadSkin();
    this.settings = this.loadSettings();
    this.applySettings();

    // Persistent achievements + personal bests (survive across runs/deaths)
    this.achievements = new AchievementManager();
    this.achievements.onUnlock = (a) => {
      UI.toast(`🏆 Achievement: ${a.name}`, "good");
      this.audio.sfx("artifact");
    };

    UI.init(this);
    this.nav = new NavManager(this);
    this.bindButtons();
    UI.showStart(this.hasSave());

    // Responsive viewport + fullscreen support
    this.root = document.getElementById("game-root");
    this.stage = document.getElementById("stage");
    this.viewW = VIEW_W;
    this.viewH = VIEW_H;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("fullscreenchange", () => this.resize());
    document.addEventListener("webkitfullscreenchange", () => this.resize());
    // Fullscreen must be requested synchronously from the gesture, so handle F here
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyF") { e.preventDefault(); this.toggleFullscreen(); }
    });
    // Click/tap a transmission to dismiss it early.
    const loreEl = document.getElementById("lore");
    if (loreEl) loreEl.addEventListener("click", () => this.skipTransmission());
    // Friendly nudge when a controller shows up.
    window.addEventListener("gamepadconnected", () => UI.toast("🎮 Controller connected", "good"));

    requestAnimationFrame((t) => this.loop(t));
  }

  bindButtons() {
    const startMining = () => {
      this.audio.init();
      const seedStr = document.getElementById("seed-input").value.trim();
      this.newGame(seedFromInput(seedStr), this.selectedDifficulty);
    };
    document.getElementById("start-btn").addEventListener("click", () => {
      this.audio.init();
      // First-time players get the How-to-Play screen before their first dig.
      let seen = false;
      try { seen = !!localStorage.getItem("motherload_howto_v1"); } catch {}
      if (!seen) { try { localStorage.setItem("motherload_howto_v1", "1"); } catch {} this.openHowTo(); return; }
      startMining();
    });
    document.getElementById("howto-btn").addEventListener("click", () => { this.audio.init(); this.openHowTo(); });
    document.getElementById("howto-back").addEventListener("click", () => this.closeHowTo());
    document.getElementById("howto-start").addEventListener("click", () => { this.closeHowTo(); startMining(); });
    document.getElementById("about-btn").addEventListener("click", () => this.openAbout());
    document.getElementById("about-back").addEventListener("click", () => this.closeAbout());
    document.getElementById("continue-btn").addEventListener("click", () => { this.audio.init(); this.loadGame(); });
    document.getElementById("restart-btn").addEventListener("click", () => { UI.hideGameOver(); this.newGame(); });
    document.getElementById("victory-btn").addEventListener("click", () => { UI.hideVictory(); this.openMutators(); });
    const goLoad = document.getElementById("gameover-load-btn");
    if (goLoad) goLoad.addEventListener("click", () => { UI.hideGameOver(); this.loadGame(); });
    document.getElementById("mutators-btn").addEventListener("click", () => { this.audio.init(); this.openMutators(); });
    document.getElementById("mutators-close").addEventListener("click", () => this.closeMutators());
    document.getElementById("mutators-start").addEventListener("click", () => {
      this.audio.init();
      this.closeMutators();
      const seedStr = document.getElementById("seed-input").value.trim();
      this.newGame(seedFromInput(seedStr), this.selectedDifficulty, [...this.selectedMutators]);
    });
    this._bindSetup();
    const muteBtn = document.getElementById("mute-btn");
    muteBtn.addEventListener("click", () => this.toggleMute());
    document.getElementById("fs-btn").addEventListener("click", () => this.toggleFullscreen());
    document.getElementById("garage-btn").addEventListener("click", () => { this.audio.init(); this.openGarage(); });
    document.getElementById("garage-close").addEventListener("click", () => this.closeGarage());
    document.getElementById("records-btn").addEventListener("click", () => this.openRecords());
    document.getElementById("records-close").addEventListener("click", () => this.closeRecords());
    document.getElementById("settings-btn").addEventListener("click", () => this.openSettings());
    document.getElementById("settings-close").addEventListener("click", () => this.closeSettings());
    document.getElementById("pause-settings-btn").addEventListener("click", () => this.openSettings());
    document.getElementById("resume-btn").addEventListener("click", () => this.resumeGame());
    document.getElementById("pause-skills-btn").addEventListener("click", () => this.openSkills());
    document.getElementById("skills-close").addEventListener("click", () => this.closeSkills());
    document.getElementById("pause-save-btn").addEventListener("click", () => { this.save(); UI.toast("Game saved!", "good"); });
    document.getElementById("pause-quit-btn").addEventListener("click", () => { this.save(); this.resumeGame(); this.quitToMenu(); });
  }

  // New-game setup: difficulty buttons + seed field on the start screen.
  _bindSetup() {
    this.selectedDifficulty = "normal";
    this.selectedMutators = new Set();
    const desc = document.getElementById("diff-desc");
    const seedInput = document.getElementById("seed-input");
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedDifficulty = btn.dataset.diff;
        if (desc) desc.textContent = DIFFICULTIES[this.selectedDifficulty].desc;
      });
    });
    const dailyBtn = document.getElementById("daily-btn");
    if (dailyBtn) dailyBtn.addEventListener("click", () => { if (seedInput) seedInput.value = dailySeed(); });
    const randBtn = document.getElementById("random-seed-btn");
    if (randBtn) randBtn.addEventListener("click", () => { if (seedInput) seedInput.value = ((Math.random() * 1e9) | 0).toString(); });
  }

  // ---------------- customization (pod skin) ----------------
  loadSkin() {
    let id = null;
    try { id = localStorage.getItem(SKIN_KEY); } catch {}
    return POD_SKINS.find((s) => s.id === id) || POD_SKINS[0];
  }
  setSkin(id) {
    const sk = POD_SKINS.find((s) => s.id === id);
    if (!sk) return;
    this.skin = sk;
    try { localStorage.setItem(SKIN_KEY, id); } catch {}
    // little reactive pop on the pod if in-game
    if (this.state) this.spawnParticles(this.state.player.centerX, this.state.player.centerY, sk.trail, 14);
    this.audio.sfx("ui");
  }

  openGarage() {
    const grid = document.getElementById("skin-grid");
    grid.innerHTML = "";
    for (const sk of POD_SKINS) {
      const card = document.createElement("div");
      card.className = "skin-card" + (sk.id === this.skin.id ? " selected" : "");
      card.innerHTML = `<div class="skin-pod" style="background:${sk.body};border-bottom:5px solid ${sk.dark}"></div><div class="skin-name">${sk.name}</div>`;
      card.addEventListener("click", () => {
        this.setSkin(sk.id);
        this.drawGaragePreview();
        grid.querySelectorAll(".skin-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });
      grid.appendChild(card);
    }
    this.drawGaragePreview();
    document.getElementById("garage-screen").classList.remove("hidden");
  }
  closeGarage() { document.getElementById("garage-screen").classList.add("hidden"); }

  openRecords() {
    UI.renderRecords(this.achievements, ACHIEVEMENTS, document.getElementById("records-body"));
    document.getElementById("records-screen").classList.remove("hidden");
  }
  closeRecords() { document.getElementById("records-screen").classList.add("hidden"); }

  openHowTo() { document.getElementById("howto-screen").classList.remove("hidden"); }
  closeHowTo() { document.getElementById("howto-screen").classList.add("hidden"); }
  openAbout() { document.getElementById("about-screen").classList.remove("hidden"); }
  closeAbout() { document.getElementById("about-screen").classList.add("hidden"); }

  // ---------------- settings / accessibility ----------------
  loadSettings() {
    const def = { volume: 0.4, shake: true, reduceMotion: false, colorblind: false };
    try {
      const d = JSON.parse(localStorage.getItem("motherload_settings_v1"));
      if (d) return { ...def, ...d };
    } catch {}
    return def;
  }
  saveSettings() {
    try { localStorage.setItem("motherload_settings_v1", JSON.stringify(this.settings)); } catch {}
  }
  applySettings() {
    if (this.audio) this.audio.setVolume(this.settings.volume);
  }
  setSetting(key, value) {
    this.settings[key] = value;
    this.applySettings();
    this.saveSettings();
  }
  openSettings() {
    this.audio.init();
    UI.renderSettings(this, document.getElementById("settings-body"));
    document.getElementById("settings-screen").classList.remove("hidden");
  }
  closeSettings() { document.getElementById("settings-screen").classList.add("hidden"); }

  openSkills() {
    UI.renderSkills(this, document.getElementById("skills-body"), document.getElementById("skills-points"));
    document.getElementById("skills-screen").classList.remove("hidden");
  }
  closeSkills() { document.getElementById("skills-screen").classList.add("hidden"); }

  openMutators() {
    if (!this.selectedMutators) this.selectedMutators = new Set();
    this._renderMutators();
    document.getElementById("mutators-screen").classList.remove("hidden");
  }
  closeMutators() { document.getElementById("mutators-screen").classList.add("hidden"); }
  _renderMutators() {
    const body = document.getElementById("mutators-body");
    body.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "mut-grid";
    for (const id of MUTATOR_KEYS) {
      const m = MUTATORS[id];
      const on = this.selectedMutators.has(id);
      const chip = document.createElement("button");
      chip.className = `mut-chip ${m.kind} ${on ? "on" : ""}`;
      chip.innerHTML = `<div class="mut-name">${m.kind === "boon" ? "✦" : "☠"} ${m.label}</div><div class="mut-desc">${m.desc}</div>`;
      chip.addEventListener("click", () => {
        if (this.selectedMutators.has(id)) this.selectedMutators.delete(id);
        else this.selectedMutators.add(id);
        this._renderMutators();
      });
      grid.appendChild(chip);
    }
    body.appendChild(grid);
  }

  drawGaragePreview() {
    const cv = document.getElementById("garage-preview");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    const sk = this.skin;
    const w = 72, h = 72, x = cv.width / 2 - w / 2, y = cv.height / 2 - h / 2 - 8;
    // thruster glow
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = sk.trail;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + h); ctx.lineTo(x + w - 12, y + h); ctx.lineTo(x + w / 2, y + h + 32);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // body
    ctx.fillStyle = sk.body;
    roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.fillStyle = sk.dark;
    ctx.fillRect(x, y + h - 14, w, 14);
    // cockpit
    ctx.fillStyle = sk.cockpit;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.42, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2a3a4a"; ctx.lineWidth = 2; ctx.stroke();
    // drill
    ctx.fillStyle = "#cfcfcf";
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 12, y + h); ctx.lineTo(x + w / 2 + 12, y + h); ctx.lineTo(x + w / 2, y + h + 18);
    ctx.closePath(); ctx.fill();
    // outline
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  }

  // ---------------- pause ----------------
  pauseGame() {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.audio.setDrill(false); this.audio.setThrust(false);
    const s = this.state;
    const diffLabel = DIFFICULTIES[this.difficulty || "normal"].label;
    document.getElementById("pause-stats").innerHTML =
      `<div>Depth: <b>${s.player.depthMeters} m</b></div>` +
      `<div>Balance: <b>$${s.money.toLocaleString()}</b></div>` +
      `<div>Cargo: <b>${s.player.cargoCount}/${s.player.cargoMax}</b></div>` +
      `<div>Mode: <b>${diffLabel}</b> &nbsp;·&nbsp; Seed: <b>${s.world.seed}</b></div>`;
    document.getElementById("pause-screen").classList.remove("hidden");
  }
  resumeGame() {
    document.getElementById("pause-screen").classList.add("hidden");
    if (this.mode === "paused") this.mode = "playing";
  }

  // ---------------- fullscreen + responsive viewport ----------------
  isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  // Match the render viewport to the window's aspect ratio (fills the screen,
  // no distortion) and size #game-root to the canvas display rect so every
  // overlay stays anchored to the play area.
  resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    const viewH = VIEW_H;                       // fixed design height
    let viewW = Math.round(viewH * (cw / ch));  // width follows the aspect ratio
    viewW = Math.max(800, Math.min(WORLD_W, viewW));
    this.viewW = viewW;
    this.viewH = viewH;
    this.camera.viewW = viewW;
    this.camera.viewH = viewH;
    // Internal render resolution
    this.canvas.width = viewW;
    this.canvas.height = viewH;
    // Display size: largest rect that fits the window, preserving aspect.
    const scale = Math.min(cw / viewW, ch / viewH);
    const dispW = Math.round(viewW * scale), dispH = Math.round(viewH * scale);
    // Size the stage to the play area; the canvas fills it (CSS 100%) and the
    // full-viewport #game-root flex-centres it. Overlays anchor to the stage.
    if (this.stage) {
      this.stage.style.width = `${dispW}px`;
      this.stage.style.height = `${dispH}px`;
    }
    if (this.state) this.camera.follow(this.state.player, true);
    const btn = document.getElementById("fs-btn");
    if (btn) btn.textContent = this.isFullscreen() ? "⤡" : "⛶";
  }

  toggleFullscreen() {
    if (this.isFullscreen()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => {});
    }
  }

  toggleMute() {
    this.audio.init();
    const on = this.audio.toggle();
    const btn = document.getElementById("mute-btn");
    btn.textContent = on ? "♪" : "✕";
    btn.classList.toggle("muted", !on);
    if (on) this.audio.sfx("ui");
  }

  // ---------------- lifecycle ----------------
  newGame(seed, difficulty = this.difficulty || this.selectedDifficulty || "normal",
          mutators = this.selectedMutators ? [...this.selectedMutators] : []) {
    mutators = mutators.filter((m) => MUTATORS[m]);
    const mut = resolveMutators(mutators);
    const world = new World(seed, { ore: mut.ore, lava: mut.lava, treasure: mut.treasure });
    const player = new Player(world);
    this.wirePlayer(player);
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "normal";
    const diff = DIFFICULTIES[this.difficulty];
    // Base modifiers = difficulty × mutators; perks multiply on top (applyModifiers).
    player._baseDmg = diff.dmgMul * mut.dmg;
    player._baseFuel = diff.fuelMul * mut.fuel;
    player._baseDrill = mut.drill;
    player._baseHull = mut.hull;
    player.noFallDamage = mut.noFall;
    this.mutators = mutators;
    this.state = {
      world, player,
      money: diff.startMoney,
      difficulty: this.difficulty,
      mutators,
      perks: [],
      upgradesPurchased: 0,
      _baseSell: diff.sellMul * mut.sell,
      sellMul: diff.sellMul * mut.sell,
      stats: { maxDepth: 0, totalEarned: 0 },
      missions: new MissionManager(),
      codex: { minerals: [], artifacts: [] },
      base: {},
    };
    this.applyModifiers();
    player.hull = player.maxHull; // fresh pod starts full
    this.wireMissions();
    this._setupWeather(world.seed);
    this._hints = {};
    this._fuelWarn = {};
    this.stranded = false;
    this._milestones = new Set();
    this._regions = new Set([0]); // surface crust known from the start
    this._gaugeFlashT = 0;
    this._gaugeScale = null;      // navigator scale (eased); inits on first draw
    this._prevHull = player.hull;
    this.particles = [];
    this.floaters = [];
    this.camera.follow(player, true);
    this.mode = "playing";
    this.achievements.recordRun();
    UI.hideStart();
    UI.hideGameOver();
    UI.hideVictory();
    UI.closeShop();
    UI.showHUD(true);
    UI.updateHUD(this.state);
    UI.updateObjective(this.state);
    UI.toast(`${DIFFICULTIES[this.difficulty].label} · Seed ${world.seed}`, this.difficulty === "hardcore" ? "bad" : "good");
    if (mutators.length) UI.toast(`☣ Mutators: ${mutators.map((m) => MUTATORS[m].label).join(", ")}`, "good");
    UI.toast("Dig down to find minerals. Sell them up top!", "good");
    const m0 = this.state.missions.current;
    if (m0) UI.toast(`MISSION: ${m0.title}`, "good");
    this._maybeOnboard();
  }

  // First-run guided tutorial — a short sequence of tips, shown only once ever.
  _maybeOnboard() {
    let done = false;
    try { done = !!localStorage.getItem("motherload_onboarded"); } catch {}
    if (done) return;
    try { localStorage.setItem("motherload_onboarded", "1"); } catch {}
    const tips = [
      [3200, "⛏ Hold DOWN to drill straight into the dirt beneath you."],
      [8200, "💎 Minerals fill your cargo — fly UP and press E at the Mineral Depot to sell."],
      [13200, "⛽ Always keep enough FUEL to climb home. Refuel at the Fuel Station."],
      [18200, "🗺 Press M for the tunnel map · C for the codex · ESC to pause. Good luck!"],
    ];
    for (const [ms, msg] of tips) {
      setTimeout(() => { if (this.mode === "playing") UI.toast(msg, "good"); }, ms);
    }
  }

  wirePlayer(player) {
    player.onParticles = (x, y, color, count) => this.spawnParticles(x, y, color, count);
    player.onToast = (msg, kind) => UI.toast(msg, kind);
    player.onMineralCollected = (key, x, y) => {
      const m = MINERALS[key];
      const px = x ?? player.centerX, py = y ?? player.centerY;
      if (this.state) {
        if (this.state.missions) this.state.missions.onCollect(key);
        const cx = this.state.codex;
        if (cx && !cx.minerals.includes(key)) {
          cx.minerals.push(key);
          UI.toast(`✦ New mineral discovered: ${m.name}`, "good");
          this.spawnFloater(px, py, m.name.toUpperCase(), m.color, { size: 16, life: 1.3 });
        }
      }
      // Combo: chaining ore quickly builds a multiplier feel
      this.comboCount = (this.comboTimer > 0 ? this.comboCount : 0) + 1;
      this.comboTimer = 1.2;
      // Floating value, scaled & coloured by mineral
      const big = m.value >= 2000;
      this.spawnFloater(px, py, `+$${m.value.toLocaleString()}`, m.color, {
        size: big ? 20 : 13 + Math.min(7, Math.log10(m.value) * 2),
        life: big ? 1.4 : 1.0,
      });
      if (this.comboCount >= 3) {
        this.spawnFloater(px + 14, py - 14, `x${this.comboCount}`, "#ffe08a", { size: 12, life: 0.8 });
      }
      // Particle burst + shake/freeze scale with value
      const burst = Math.min(26, 6 + Math.floor(Math.log10(m.value) * 5));
      this.spawnParticles(px, py, m.color, burst);
      this.audio.sfx("pickup");
      if (big) { this.shake(7); this.freeze(0.05); this.spawnParticles(px, py, "#fff", 10); }
    };
    player.onArtifactFound = (a) => {
      const s = this.state;
      if (!s) return;
      s.money += a.value;
      s.stats.totalEarned += a.value;
      if (!s.codex.artifacts.includes(a.id)) s.codex.artifacts.push(a.id);
      UI.toast(`✦ ARTIFACT: ${a.name}  +$${a.value.toLocaleString()}`, "good");
      UI.showLore(`${a.name} — ${a.lore}`);
      this.audio.sfx("artifact");
      this.shake(10);
      // Let the relic's lore land, then Old Pell chimes in.
      setTimeout(() => { if (this.radio && this.mode === "playing") this.radio.transmit("prospector"); }, 7200);
    };
    player.onCoreBreak = () => this.showEndingChoice();
    player.onSfx = (name) => this.audio.sfx(name);
    player.onTreasure = (value, x, y) => {
      const s = this.state;
      if (!s) return;
      s.money += value;
      s.stats.totalEarned += value;
      UI.toast(`✦ TREASURE! +$${value.toLocaleString()}`, "good");
      this.spawnFloater(x, y, `TREASURE +$${value.toLocaleString()}`, "#ffd445", { size: 18, life: 1.5 });
      this.spawnParticles(x, y, "#ffd445", 24);
      this.spawnParticles(x, y, "#fff", 10);
      this.audio.sfx("artifact");
      this.shake(8); this.freeze(0.06);
    };
  }

  // The Heart breaks → pause everything and present the branching choice.
  showEndingChoice() {
    this.mode = "won";
    this.audio.setDrill(false); this.audio.setThrust(false);
    this.audio.sfx("artifact");
    this.shake(24);
    UI.hidePrompt();
    UI.showHUD(false);
    // Dramatic cinematic before the choice appears.
    this.cinematic({ title: "THE HEART SPLITS", sub: "something ancient stirs below", dur: 3.0, slowmo: 0.25, color: "#ff5da0" });
    const opts = document.getElementById("ending-options");
    opts.innerHTML = "";
    for (const id of Object.keys(ENDINGS)) {
      const e = ENDINGS[id];
      const btn = document.createElement("button");
      btn.className = "big-btn ending-btn";
      btn.innerHTML = `${e.label}<span class="ending-blurb">${e.blurb}</span>`;
      btn.addEventListener("click", () => this.chooseEnding(id));
      opts.appendChild(btn);
    }
    // Reveal the choice once the cinematic has played out.
    setTimeout(() => {
      if (this.mode === "won") document.getElementById("ending-choice").classList.remove("hidden");
    }, 2600);
  }

  chooseEnding(id) {
    document.getElementById("ending-choice").classList.add("hidden");
    this.achievements.unlock(ENDINGS[id].ach);
    this.winGame(id);
  }

  winGame(ending = "free") {
    this.mode = "won";
    this.audio.setDrill(false); this.audio.setThrust(false);
    this.audio.sfx("win");
    UI.hidePrompt();
    UI.showHUD(false);
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    UI.showVictory(this.state, ending);
  }

  wireMissions() {
    const mm = this.state.missions;
    mm.onComplete = (mission, next, reward) => {
      this.state.money += reward;
      this.state.stats.totalEarned += reward;
      UI.toast(`✦ MISSION COMPLETE: ${mission.title}  +$${reward.toLocaleString()}`, "good");
      this.audio.sfx("mission");
      if (next) setTimeout(() => UI.toast(`NEW MISSION: ${next.title}`, "good"), 1400);
      if (mm.endgameUnlocked) this.onEndgameUnlocked();
      UI.updateObjective(this.state);
    };
    mm.onLore = (text) => UI.showLore(text);
    mm.onSideComplete = (side, reward) => {
      this.state.money += reward;
      this.state.stats.totalEarned += reward;
      UI.toast(`✦ CONTRACT FILLED  +$${reward.toLocaleString()}`, "good");
      UI.updateObjective(this.state);
    };
  }

  _setupWeather(seed) {
    this.weather = new WeatherManager(seed);
    this.weather.onChange = (def) => {
      const icon = this.weather.type === "dust" ? "🌪" : this.weather.type === "meteor" ? "☄" : "☁";
      UI.toast(`${icon} ${def.label} moving in`, this.weather.type === "dust" ? "bad" : "good");
    };
    // Living mineral market — prices drift, react to sales, and spike/crash.
    this.market = new MarketManager(seed);
    this.market.onEvent = (name, kind) => {
      UI.toast(kind === "surge" ? `📈 ${name} demand surge — prices up!` : `📉 ${name} market crash — prices down`,
        kind === "surge" ? "good" : "bad");
    };
    if (this.state) this.state.market = this.market;

    // Radio cast — recurring NPC transmissions over the run.
    if (!this.radio) {
      this.radio = new RadioManager();
      this.radio.onMessage = (m) => { UI.showRadio(m.name, m.color, m.text); this.audio.sfx("ui"); };
    }
    this.radio.reset();
    this._earnTier = 0;
    // Mission Control opens the run after a short beat.
    setTimeout(() => { if (this.mode === "playing") this.radio.transmit("control"); }, 1600);
  }

  // Dismiss the on-screen transmission/lore banner early and let the next
  // queued radio line follow after a short beat. No-op if nothing is showing.
  skipTransmission() {
    if (!UI.isLoreVisible()) return false;
    UI.hideLore();
    if (this.radio) this.radio.timer = Math.min(this.radio.timer, 0.25);
    return true;
  }

  // Recompute live modifiers = (difficulty×mutator base) × perks. Called on
  // new game, load, and whenever a perk is purchased.
  applyModifiers() {
    const s = this.state;
    if (!s) return;
    const p = s.player;
    const perk = resolvePerks(s.perks || []);
    p.diffDmg = (p._baseDmg ?? 1) * perk.dmg;
    p.diffFuel = (p._baseFuel ?? 1) * perk.fuel;
    p.drillSpeedMul = (p._baseDrill ?? 1) * perk.drill;
    p.hullMul = (p._baseHull ?? 1) * perk.hull;
    p.thrustMul = perk.thrust;
    s.sellMul = (s._baseSell ?? 1) * perk.sell;
    p.recomputeFromTiers();
    if (p.hull > p.maxHull) p.hull = p.maxHull;
  }

  // Perk points: earned from depth+earnings, minus those already spent.
  perkPointsAvailable() {
    const s = this.state;
    if (!s) return 0;
    return Math.max(0, perkPointsEarned(s.stats) - (s.perks ? s.perks.length : 0));
  }

  buyPerk(id) {
    const s = this.state;
    if (!s) return { ok: false };
    // Locate the perk and check its branch prerequisite (the one above it).
    for (const b of PERK_BRANCH_KEYS) {
      const list = PERKS[b].perks;
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) continue;
      if (s.perks.includes(id)) return { ok: false, msg: "Already learned" };
      if (i > 0 && !s.perks.includes(list[i - 1].id)) return { ok: false, msg: `Requires ${list[i - 1].name} first` };
      if (this.perkPointsAvailable() <= 0) return { ok: false, msg: "No perk points" };
      s.perks.push(id);
      this.applyModifiers();
      return { ok: true, msg: `Learned ${list[i].name}` };
    }
    return { ok: false };
  }

  // Express Elevator (Outpost perk): drop the pod into a freshly-carved safe
  // pocket at the base column, at the surface (i < 0) or a discovered biome.
  elevatorTo(i) {
    const s = this.state;
    if (!s || !s.base || !s.base.elevator) return;
    const p = s.player, w = s.world;
    const row = i < 0 ? GROUND_ROW : GROUND_ROW + STRATA[i].start + 2;
    const col = SPAWN_COL;
    for (let r = row - 1; r <= row + 3; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (c < 1 || c >= COLS - 1 || r < GROUND_ROW || r >= ROWS - 1) continue;
        if (w.getType(c, r) !== T.BEDROCK) w.clearTile(c, r);
      }
    }
    p.x = col * TILE + (TILE - p.w) / 2;
    p.y = row * TILE - p.h - 0.5;
    p.vx = 0; p.vy = 0;
    this.camera.follow(p, true);
    UI.closeShop();
    this.mode = "playing";
    UI.toast(`🛗 Express Elevator → ${i < 0 ? "Surface" : STRATA[i].name}`, "good");
    this.audio.sfx("mission");
  }

  // Outpost Launch Pad — fast-travel straight up to the asteroid belt.
  // Only unlocks once the pilot has reached space under their own thrust.
  launchToOrbit() {
    const s = this.state;
    if (!s || !s.reachedSpace) return;
    const p = s.player, w = s.world;
    // Arrive at the belt's lower edge — comfortably in space (low-g) and high
    // enough to drift among the asteroids. Clear a docking pocket so we never
    // materialise inside solid rock (which would crush the pod instantly).
    const row = -(ASTEROID_MIN_ROWS + 8); // ~1016m, just inside the belt
    const col = SPAWN_COL;
    for (let r = row - 1; r <= row + 2; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (c < 0 || c >= COLS) continue;
        if (w.getType(c, r) !== T.EMPTY) w.clearTile(c, r);
      }
    }
    p.x = col * TILE + (TILE - p.w) / 2;
    p.y = row * TILE;
    p.vx = 0; p.vy = 0;
    this.camera.follow(p, true);
    UI.closeShop();
    this.mode = "playing";
    UI.toast("🚀 Launched to orbit — mind the drift!", "good");
    this.audio.sfx("mission");
  }

  onEndgameUnlocked() {
    // Fires once the campaign is complete: the Heart of Natas (T.CORE) is now
    // drillable at the very bottom — drill into it to trigger the ending choice.
    UI.toast("The Motherlode awaits at the very bottom...", "good");
  }

  quitToMenu() {
    this.mode = "menu";
    UI.closeShop();
    UI.showHUD(false);
    UI.hidePrompt();
    UI.showStart(this.hasSave());
  }

  // ---------------- save / load ----------------
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  save() {
    if (!this.state) return;
    const { world, player, money, stats } = this.state;
    const data = {
      seed: world.seed,
      cleared: Array.from(world.cleared),
      skyCleared: Array.from(world.skyCleared),
      reachedSpace: !!this.state.reachedSpace,
      money, stats,
      missions: this.state.missions ? this.state.missions.serialize() : null,
      codex: this.state.codex,
      player: {
        x: player.x, y: player.y, fuel: player.fuel, hull: player.hull,
        tier: player.tier, cargo: player.cargo,
        dynamite: player.dynamite, teleporters: player.teleporters,
      },
      market: this.market ? this.market.serialize() : null,
      base: this.state.base || {},
      difficulty: this.difficulty || "normal",
      mutators: this.state.mutators || [],
      perks: this.state.perks || [],
      upgradesPurchased: this.state.upgradesPurchased || 0,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      UI.showStart && (document.getElementById("continue-btn").classList.remove("hidden"));
    } catch (e) {
      UI.toast("Save failed (storage)", "bad");
    }
  }

  loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { data = null; }
    if (!data) { this.newGame(); return; }

    const mutators = (data.mutators || []).filter((m) => MUTATORS[m]);
    const mut = resolveMutators(mutators);
    const world = new World(data.seed, { ore: mut.ore, lava: mut.lava, treasure: mut.treasure });
    world.applyCleared(data.cleared || []);
    world.applySkyCleared(data.skyCleared || []);
    const player = new Player(world);
    this.wirePlayer(player);
    this.difficulty = DIFFICULTIES[data.difficulty] ? data.difficulty : "normal";
    const diff = DIFFICULTIES[this.difficulty];
    player._baseDmg = diff.dmgMul * mut.dmg;
    player._baseFuel = diff.fuelMul * mut.fuel;
    player._baseDrill = mut.drill;
    player._baseHull = mut.hull;
    player.noFallDamage = mut.noFall;
    this.mutators = mutators;
    Object.assign(player.tier, data.player.tier);
    player.x = data.player.x;
    player.y = data.player.y;
    player.fuel = data.player.fuel;
    player.hull = data.player.hull;
    player.cargo = data.player.cargo || {};
    player.dynamite = data.player.dynamite || 0;
    player.teleporters = data.player.teleporters || 0;

    this.state = {
      world, player,
      money: data.money ?? START_MONEY,
      stats: data.stats ?? { maxDepth: 0, totalEarned: 0 },
      missions: MissionManager.deserialize(data.missions),
      codex: data.codex ?? { minerals: [], artifacts: [] },
      base: data.base ?? {},
      difficulty: this.difficulty,
      mutators,
      perks: (data.perks || []),
      upgradesPurchased: data.upgradesPurchased || 0,
      reachedSpace: !!data.reachedSpace,
      _baseSell: diff.sellMul * mut.sell,
      sellMul: diff.sellMul * mut.sell,
    };
    this.applyModifiers(); // also runs recomputeFromTiers + clamps hull
    this.wireMissions();
    this._setupWeather(world.seed);
    this.market.load(data.market);
    this._hints = {};
    this._fuelWarn = {};
    this.stranded = false;
    this._gaugeFlashT = 0;
    this._gaugeScale = null;
    // Pre-mark regions/milestones already reached so they don't re-announce
    this._regions = new Set([0]);
    this._milestones = new Set();
    const maxRows = this.state.stats.maxDepth / 2;
    STRATA.forEach((st, i) => { if (maxRows >= st.start) this._regions.add(i); });
    [250, 500, 1000, 1500, 2000, 2500].forEach((m) => { if (this.state.stats.maxDepth >= m) this._milestones.add(m); });
    this._prevHull = player.hull;
    this.particles = [];
    this.floaters = [];
    this.camera.follow(player, true);
    this.mode = "playing";
    UI.hideStart();
    UI.hideGameOver();
    UI.closeShop();
    UI.showHUD(true);
    UI.updateHUD(this.state);
    UI.updateObjective(this.state);
    UI.toast("Game loaded", "good");
  }

  // ---------------- main loop ----------------
  loop(t) {
    const dt = Math.min(0.033, (t - this.lastTime) / 1000 || 0);
    this.lastTime = t;
    this.accumBlink += dt;

    // Menu/gamepad navigation runs before the sim so input is fresh this frame
    this.nav.update();

    // Cinematic moments slow the world down while the overlay plays out.
    let worldDt = dt;
    if (this.cine) {
      this.cine.t += dt;
      worldDt = dt * this.cine.slowmo;
      if (this.cine.t >= this.cine.dur) this.cine = null;
    }

    // Hit-stop: briefly freeze the simulation for impact (juice), keep rendering
    if (this.hitStop > 0) {
      this.hitStop -= dt;
    } else {
      this.update(worldDt);
    }
    this.render();

    this.input.endFrame();
    requestAnimationFrame((nt) => this.loop(nt));
  }

  // Freeze-frame for `secs` seconds — call on impactful moments
  freeze(secs) { this.hitStop = Math.max(this.hitStop, secs); }

  // Start a cinematic moment: letterbox bars slide in, the world slows, and an
  // optional title/subtitle card fades over the action.
  cinematic(opts = {}) {
    const reduce = this.settings && this.settings.reduceMotion;
    this.cine = {
      t: 0,
      dur: opts.dur ?? 2.4,
      slowmo: reduce ? 1 : (opts.slowmo ?? 0.4), // no time-dilation under reduced motion
      reduce,
      title: opts.title || "",
      sub: opts.sub || "",
      color: opts.color || "#ffe9b0",
    };
  }

  // Draw the cinematic overlay (letterbox + title) in screen space.
  drawCinematic(ctx) {
    const c = this.cine;
    if (!c) return;
    const VW = this.viewW, VH = this.viewH;
    const p = c.t / c.dur;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const lb = clamp01(Math.min(p / 0.18, (1 - p) / 0.22));      // letterbox ease in/out
    const ta = clamp01(Math.min((p - 0.08) / 0.18, (1 - p) / 0.28)); // title fade
    const barH = (c.reduce ? 0 : VH * 0.14) * lb;
    if (barH > 0) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VW, barH);
      ctx.fillRect(0, VH - barH, VW, barH);
    }
    if (c.title && ta > 0.01) {
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.textAlign = "center";
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.color; ctx.shadowBlur = 24;
      ctx.font = "bold 44px 'Courier New', monospace";
      ctx.fillText(c.title, VW / 2, VH / 2);
      if (c.sub) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = ta * 0.85;
        ctx.fillStyle = "#cfcfda";
        ctx.font = "16px 'Courier New', monospace";
        ctx.fillText(c.sub, VW / 2, VH / 2 + 34);
      }
      ctx.restore();
    }
  }

  // Visual confirmation when an upgrade is bought (pod sparkles on return)
  flagUpgrade() {
    if (!this.state) return;
    const p = this.state.player;
    this.spawnParticles(p.centerX, p.centerY, "#7affb0", 18);
    this.spawnParticles(p.centerX, p.centerY, "#fff", 8);
    this.audio.sfx("buy");
  }

  // ---------------- floating text ----------------
  spawnFloater(x, y, text, color = "#fff", opts = {}) {
    if (this.floaters.length > 60) this.floaters.shift();
    this.floaters.push({
      x, y, text, color,
      vy: opts.vy ?? -42,
      life: opts.life ?? 1.0,
      maxLife: opts.life ?? 1.0,
      size: opts.size ?? 14,
      bold: opts.bold ?? true,
    });
  }
  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.y += f.vy * dt;
      f.vy *= 0.92;
      f.life -= dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }
  drawFloaters(ctx, cam) {
    for (const f of this.floaters) {
      const t = f.life / f.maxLife;
      const alpha = t > 0.7 ? (1 - t) / 0.3 : Math.min(1, t / 0.3);
      const pop = t > 0.8 ? 1 + (t - 0.8) * 2.5 : 1; // slight pop-in
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.font = `${f.bold ? "bold " : ""}${Math.round(f.size * pop)}px 'Courier New', monospace`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(f.text, f.x - cam.x, f.y - cam.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  // Celebrate crossing depth milestones
  checkDepthMilestone(depth) {
    const marks = [250, 500, 1000, 1500, 2000, 2500];
    const seen = this._milestones || (this._milestones = new Set());
    for (const m of marks) {
      if (depth >= m && !seen.has(m)) {
        seen.add(m);
        const p = this.state.player;
        UI.toast(`◆ New depth record: ${m}m`, "good");
        this.spawnFloater(p.centerX, p.y - 10, `${m}m`, "#7fdfff", { size: 22, life: 1.4, vy: -30 });
        this.spawnParticles(p.centerX, p.centerY, "#7fdfff", 16);
        this.shake(6);
        this.audio.sfx("mission");
        if (this.radio) this.radio.transmit("rival");
      }
    }
  }

  // Reveal a new biome band on the navigator the first time you reach it
  checkRegionDiscovery() {
    const seen = this._regions || (this._regions = new Set());
    const maxRows = this.state.stats.maxDepth / 2;
    for (let i = 0; i < STRATA.length; i++) {
      if (maxRows >= STRATA[i].start && !seen.has(i)) {
        seen.add(i);
        if (i === 0) continue; // surface crust isn't a "discovery"
        this._lastRegion = i;
        this._gaugeFlashT = 1;
        UI.toast(`◆ New region discovered: ${STRATA[i].name}`, "good");
        this.audio.sfx("artifact");
        const p = this.state.player;
        this.spawnFloater(p.centerX, p.y - 8, STRATA[i].name.toUpperCase(), "#9fe8ff", { size: 18, life: 1.6, vy: -28 });
        this.cinematic({ title: STRATA[i].name, sub: `— ${STRATA[i].start * 2}m down —`, dur: 2.6, slowmo: 0.55, color: rgbStr(STRATA[i].accent) });
        if (this.radio) this.radio.transmit("control");
      }
    }
  }

  update(dt) {
    if (!this.state) return;
    const { player, state } = this;
    const s = this.state;

    // Stop looping engine sounds whenever we're not actively flying
    if (this.mode !== "playing") { this.audio.setDrill(false); this.audio.setThrust(false); }

    // Global hotkeys (work in any mode)
    if (this.input.justPressed("mute")) this.toggleMute();

    // Skip the current transmission (Space) — see also the click handler.
    if (this.input.justPressed("space")) this.skipTransmission();

    if (this.mode === "shop") {
      if (this.input.justPressed("escape") || this.input.justPressed("interact") ||
          (this.codexOpen && this.input.justPressed("codex"))) {
        this.closeShop();
      }
      return; // paused
    }

    if (this.mode === "paused") {
      if (this.input.justPressed("escape")) this.resumeGame();
      return;
    }

    if (this.mode !== "playing") return;

    // Pause (ESC) while playing
    if (this.input.justPressed("escape")) { this.pauseGame(); return; }

    // Consumables
    if (this.input.justPressed("dynamite")) s.player.useDynamite();
    if (this.input.justPressed("teleport")) s.player.useTeleporter();

    // Codex
    if (this.input.justPressed("codex")) { this.openCodex(); return; }

    // Tunnel minimap toggle (M)
    if (this.input.justPressed("map")) this.showMap = !this.showMap;

    // Player physics + drilling
    const p = s.player;
    s.player.update(dt, this.input, false);

    // ----- Surface weather + living market -----
    this.weather.update(dt);
    this.market.update(dt);

    // ----- Achievements & personal bests (slow tick) -----
    this._achAccum = (this._achAccum || 0) + dt;
    if (this._achAccum >= 1) {
      this._achAccum = 0;
      this.achievements.check(this);
      // The Buyer hails you each time lifetime earnings cross a new tier.
      const tiers = [1, 50000, 200000, 1000000, 5000000];
      while (this._earnTier < tiers.length && s.stats.totalEarned >= tiers[this._earnTier]) {
        this._earnTier++;
        this.radio.transmit("buyer");
      }
    }

    // ----- Radio transmissions queue -----
    this.radio.update(dt);
    // Wind nudges the pod while it's at/near the surface; tapers off below.
    if (p.depthRow < 12 && !p.onGround) {
      p.vx += this.weather.windForce() * (1 - p.depthRow / 12) * dt;
    }

    // Reaching space the first time unlocks the Outpost launch pad.
    if (!s.reachedSpace && p.altitudeMeters >= SPACE_ALT) {
      s.reachedSpace = true;
      UI.toast("🚀 SPACE REACHED — the Outpost can now launch you to the asteroid belt!", "good");
      this.audio.sfx("win");
      this.cinematic({ title: "ORBIT REACHED", sub: "the asteroid belt awaits", dur: 3.0, slowmo: 0.5, color: "#8affe6" });
      this.achievements.unlock("astronaut");
    }

    // ----- Tile simulation: flowing liquids, cave-ins, rising gas -----
    // Anchored to the pod with a generous margin (covers more than the view)
    // so nearby liquids/gravel always simulate smoothly.
    this._simAccum = (this._simAccum || 0) + dt;
    if (this._simAccum >= 0.09) {
      this._simAccum = 0;
      const pc = Math.floor(p.centerX / TILE), pr = Math.floor(p.centerY / TILE);
      s.world.simulate(pc - 28, pr - 24, pc + 28, pr + 24);
    }

    // ----- Audio + juice feedback -----
    this.audio.setDrill(p.drilling);
    const up = this.input.down("up"), lf = this.input.down("left"), rt = this.input.down("right");
    const thrusting = (up || lf || rt) && p.fuel > 0;
    this.audio.setThrust(thrusting);
    this.audio.setDepth(p.depthMeters);
    // Biome-reactive music + ambience
    const biomeName = stratumAt(p.depthRow).name;
    this.audio.setBiome(biomeName);
    if (p.depthRow > 2) this.audio.ambientTick(dt, biomeName);

    // Thruster exhaust trails (tinted by the pod's paint scheme)
    if (thrusting) {
      const trail = (this.skin || POD_SKINS[0]).trail;
      const cx = p.centerX, by = p.y + p.h;
      if (up) this.spawnJet(cx, by, 0, 1, trail, 2, 130, 0.5, 2.4, 0.4);
      if (lf && !rt) this.spawnJet(p.x + p.w, p.centerY, 1, 0, trail, 1, 110, 0.45, 2, 0.35);
      if (rt && !lf) this.spawnJet(p.x, p.centerY, -1, 0, trail, 1, 110, 0.45, 2, 0.35);
    }
    // Drill sparks at the active drill target
    if (p.drilling && p.drillTarget && Math.random() < 0.7) {
      const tx = p.drillTarget.c * TILE + TILE / 2, ty = p.drillTarget.r * TILE + TILE / 2;
      const hard = s.world.getType(p.drillTarget.c, p.drillTarget.r);
      const sparkCol = (hard === T.ROCK || hard === T.CORE) ? "#ffe9a8" : "#c89a5a";
      this.spawnJet(tx, ty, p.centerX - tx, p.centerY - ty, sparkCol, 2, 70, 1.2, 2, 0.35);
    }
    // Landing dust + thud on touchdown
    if (!this._prevOnGround && p.onGround && (this._prevVy || 0) > 160) {
      const v = this._prevVy;
      this.spawnJet(p.centerX, p.y + p.h, -1, -0.2, "#b59a78", 5, 60, 0.8, 2.6, 0.4);
      this.spawnJet(p.centerX, p.y + p.h, 1, -0.2, "#b59a78", 5, 60, 0.8, 2.6, 0.4);
      this.shake(Math.min(5, v / 90));
    }
    this._prevOnGround = p.onGround;
    this._prevVy = p.vy;
    // Damage flash + shake + floater when hull drops
    const hullDrop = this._prevHull - p.hull;
    if (hullDrop > 0.4) {
      this.flashAmount = Math.min(1, this.flashAmount + hullDrop / 18);
      this.shake(Math.min(12, hullDrop * 1.2));
      if (hullDrop > 3) {
        this.spawnFloater(p.centerX, p.y, `-${Math.round(hullDrop)}`, "#ff5d5d", { size: 16 });
        this.freeze(Math.min(0.08, hullDrop / 250)); // impact freeze on big hits
      }
    }
    this._prevHull = p.hull;

    // Combo decay
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboCount = 0; }

    // ----- Low-fuel warnings (escalating at 10% and 5%) -----
    const fp = p.fuel / p.maxFuel;
    const fw = this._fuelWarn || (this._fuelWarn = {});
    if (fp > 0.12) fw.w10 = false;
    if (fp > 0.07) fw.w5 = false;
    if (p.fuel > 0 && fp <= 0.1 && !fw.w10) {
      fw.w10 = true; UI.toast("⚠ FUEL LOW (10%) — start heading back up", "bad"); this.audio.alarm();
    }
    if (p.fuel > 0 && fp <= 0.05 && !fw.w5) {
      fw.w5 = true; UI.toast("⚠ FUEL CRITICAL (5%)! Limp to safety", "bad"); this.audio.alarm();
    }
    if (fp < 0.15 && p.fuel > 0 || p.hull / p.maxHull < 0.2) this.audio.alarm();

    // Onboarding hints (first-time only)
    const h = this._hints || (this._hints = {});
    if (!h.sell && p.cargoCount >= 4 && p.depthMeters < 30) {
      h.sell = true;
      UI.toast("Tip: fly to the blue Mineral Depot and press E to sell your haul", "good");
    }
    if (!h.fuel && p.fuel / p.maxFuel < 0.35 && p.depthMeters > 80) {
      h.fuel = true;
      UI.toast("Tip: keep enough fuel to climb back — or buy a Teleporter", "good");
    }
    if (!h.cargoFull && p.cargoFull) {
      h.cargoFull = true;
      UI.toast("Cargo full! Head up and sell before digging more", "bad");
    }

    // Camera
    this.camera.follow(s.player, false, dt);

    // Particles + floaters
    this.updateParticles(dt);
    this.updateFloaters(dt);

    // Stats + mission depth tracking + depth milestones
    const prevMax = s.stats.maxDepth;
    s.stats.maxDepth = Math.max(s.stats.maxDepth, s.player.depthMeters);
    if (s.missions) {
      s.missions.onDepth(s.stats.maxDepth);
      if (s.stats.maxDepth !== prevMax) UI.updateObjective(s);
    }
    if (s.stats.maxDepth !== prevMax) { this.checkDepthMilestone(s.stats.maxDepth); this.checkRegionDiscovery(); }
    if (this._gaugeFlashT > 0) this._gaugeFlashT = Math.max(0, this._gaugeFlashT - dt * 0.8);

    // ----- Building & rescue prompts (out-of-fuel never freezes the game) -----
    this.activeBuilding = (s.player.onGround) ? buildingAt(s.player) : null;

    // Outpost perks, applied on touchdown at the base (auto-sell first so the
    // proceeds can pay for the refuel & restock that follow).
    if (s.base && this.activeBuilding) {
      if (s.base.autoSell && p.cargoCount > 0) {
        const res = sellAll(s);
        if (res.ok) { UI.toast(`🪙 Auto-sold: +$${res.total.toLocaleString()}`, "good"); this.audio.sfx("sell"); }
      }
      // Gate on a ≥1-unit gap so the idle-burn drip doesn't nibble $1/frame.
      if (s.base.autoRefuel && p.maxFuel - p.fuel >= 1 && s.money > 0) {
        const wasLow = p.fuel < p.maxFuel * 0.5;
        const res = buyFullFuel(s);
        if (res.ok && wasLow) { UI.toast("⛽ Auto-refuelled", "good"); this.audio.sfx("buy"); }
      }
      if (s.base.autoRestock) {
        const res = autoRestock(s, RESTOCK_TARGET);
        if (res.bought > 0) { UI.toast(`🧰 Restocked ${res.bought} item${res.bought === 1 ? "" : "s"} ($${res.spent.toLocaleString()})`, "good"); this.audio.sfx("buy"); }
      }
    }
    const atRest = p.onGround && Math.abs(p.vx) < 8 && Math.abs(p.vy) < 8;
    const onFuelStation = this.activeBuilding && this.activeBuilding.id === "fuel";
    // Stranded = no fuel, come to rest, and can't simply refuel where you are
    this.stranded = p.fuel <= 0 && atRest && !(onFuelStation && s.money >= FUEL_PRICE);
    const rescueCost = this.rescueCost();

    // Inputs: E enters a building, R calls a rescue when stranded
    if (this.activeBuilding && (this.input.justPressed("interact") || this.input.justPressed("enter"))) {
      this.openShop(this.activeBuilding);
      return;
    }
    if (this.stranded && this.input.justPressed("rescue")) { this.doRescue(); return; }

    // Prompt text
    if (this.activeBuilding && this.stranded) {
      UI.showPrompt(`<b>E</b> · ${this.activeBuilding.name} &nbsp;·&nbsp; <b>R</b> · Rescue ($${rescueCost.toLocaleString()})`);
    } else if (this.activeBuilding) {
      UI.showPrompt(`<b>E</b> · Enter ${this.activeBuilding.name}`);
    } else if (this.stranded) {
      UI.showPrompt(`<b>⛽ OUT OF FUEL</b> — press <b>R</b> for rescue ($${rescueCost.toLocaleString()}), lifts you to the surface`);
    } else {
      UI.hidePrompt();
    }

    // HUD
    UI.updateHUD(s);

    // Death check (only the hull can truly end a run; fuel is always recoverable)
    if (p.hull <= 0) this.gameOver("Your pod was crushed. The drill goes silent.");
  }

  // Rescue price scales with how far the pod is from the Fuel Station
  // (mostly depth), and is capped at your balance so it's always affordable.
  rescueCost() {
    const s = this.state;
    if (!s) return 0;
    const p = s.player;
    const fuel = BUILDINGS.find((b) => b.id === "fuel");
    const fuelCol = fuel.col + fuel.width / 2;
    const horiz = Math.abs(p.centerX / TILE - fuelCol) * 2; // ~2m per tile
    const dist = Math.hypot(horiz, p.depthMeters);          // metres from the station
    const cost = Math.ceil(40 + dist * 6);
    return Math.min(s.money, cost);
  }

  doRescue() {
    const s = this.state, p = s.player;
    const cost = this.rescueCost();
    s.money -= cost;
    p.fuel = Math.max(p.fuel, p.maxFuel * 0.4);
    // Drop the pod right at the Fuel Depot so it can top up immediately
    const fuel = BUILDINGS.find((b) => b.id === "fuel");
    const fuelCenter = fuel.col + fuel.width / 2;
    p.x = fuelCenter * TILE - p.w / 2;
    p.y = GROUND_ROW * TILE - p.h - 0.5;
    p.vx = 0; p.vy = 0;
    this.stranded = false;
    this._fuelWarn = {};
    this.camera.follow(p, true);
    UI.hidePrompt();
    this.spawnParticles(p.centerX, p.centerY, "#7fdfff", 18);
    UI.toast(cost > 0 ? `Rescued for $${cost.toLocaleString()} — dropped at the Fuel Depot` : "Emergency rescue — dropped at the Fuel Depot", "good");
    this.audio.sfx("buy");
  }

  gameOver(reason) {
    this.mode = "gameover";
    this.achievements.check(this);   // catch any last-moment unlocks
    this.achievements.recordDeath();
    this.audio.setDrill(false); this.audio.setThrust(false);
    this.audio.sfx("death");
    this.shake(20);
    UI.hidePrompt();
    UI.showHUD(false);
    // Cinematic death beat — freeze on the wreck, then reveal the screen.
    this.cinematic({ title: "POD LOST", sub: reason, dur: 2.0, slowmo: 0.2, color: "#ff5a5a" });
    const permadeath = DIFFICULTIES[this.difficulty || "normal"].permadeath;
    const loadBtn = document.getElementById("gameover-load-btn");
    if (permadeath) {
      try { localStorage.removeItem(SAVE_KEY); } catch {}
      if (loadBtn) loadBtn.classList.add("hidden");
    } else if (loadBtn) {
      loadBtn.classList.toggle("hidden", !this.hasSave());
    }
    const finalReason = permadeath ? reason + "  —  HARDCORE: save wiped." : reason;
    setTimeout(() => { if (this.mode === "gameover") UI.showGameOver(this.state, finalReason); }, 1500);
  }

  // ---------------- shops ----------------
  openShop(building) {
    this.activeBuilding = building;
    this.mode = "shop";
    UI.hidePrompt();
    UI.openShop(this.state, building);
  }
  closeShop() {
    this.mode = "playing";
    this.codexOpen = false;
    UI.closeShop();
  }

  openCodex() {
    this.codexOpen = true;
    this.mode = "shop";
    UI.hidePrompt();
    UI.openCodex(this.state);
  }

  // ---------------- screen shake ----------------
  shake(amount) {
    if (this.settings && (!this.settings.shake || this.settings.reduceMotion)) return;
    this.shakeAmount = Math.min(24, this.shakeAmount + amount);
  }

  // Directional jet/spark emitter (exhaust trails, sparks)
  spawnJet(x, y, dirX, dirY, color, count, speed = 90, spread = 0.5, size = 2.5, life = 0.5) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 500) break;
      const baseA = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const sp = speed * (0.5 + Math.random());
      this.particles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(baseA) * sp,
        vy: Math.sin(baseA) * sp,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        color,
        size: size * (0.6 + Math.random() * 0.8),
        grav: 60,
      });
    }
  }

  // ---------------- particles ----------------
  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 400) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 110;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += (p.grav != null ? p.grav : 300) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // ---------------- rendering ----------------
  render() {
    const ctx = this.ctx;
    const VW = this.viewW, VH = this.viewH;
    if (!this.state) { ctx.clearRect(0, 0, VW, VH); return; }
    const cam = this.camera;
    const { world, player } = this.state;

    // Apply screen shake
    ctx.save();
    if (this.shakeAmount > 0.3) {
      const a = this.shakeAmount;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.shakeAmount *= 0.86;
    } else {
      this.shakeAmount = 0;
    }

    // Sky / underground background gradient based on camera depth
    this.drawBackground(ctx, cam);

    // Floating asteroids (above the world, in the sky/space band)
    this.drawAsteroids(ctx, world, cam);

    // Visible tile range
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((cam.x + VW) / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((cam.y + VH) / TILE));

    // Tiles
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        this.drawTile(ctx, world, c, r, cam);
      }
    }

    // Buildings (surface)
    this.drawBuildings(ctx, cam);

    // Drill target highlight
    if (player.drilling && player.drillTarget) {
      this.drawDrillProgress(ctx, player, cam);
    }

    // Player
    this.drawPlayer(ctx, player, cam);

    // Particles
    this.drawParticles(ctx, cam);

    // Floating value/damage text (above world, below vignette)
    this.drawFloaters(ctx, cam);

    // Surface weather (blowing dust / meteors) — only when the surface is in view
    if (this.weather) {
      const horizonY = GROUND_ROW * TILE - cam.y;
      if (horizonY > -80) this.weather.drawParticles(ctx, this.accumBlink, VW, VH, horizonY);
    }

    // Heat vignette
    if (player.heat > 5) this.drawHeat(ctx, player.heat);

    // Cave darkness + dynamic lighting (headlight beam, lava glow)
    this.drawDarkness(ctx, player, world, cam);

    // Fog of war — hide the rock layout beyond the Sensor Array's reach
    this.drawFog(ctx, player, cam);

    // Damage flash (red pulse)
    if (this.flashAmount > 0.02) {
      ctx.fillStyle = `rgba(255,30,30,${this.flashAmount * 0.4})`;
      ctx.fillRect(-30, -30, VW + 60, VH + 60);
      this.flashAmount *= 0.88;
    } else {
      this.flashAmount = 0;
    }

    ctx.restore(); // end screen shake transform

    // Depth gauge drawn outside the shake transform so it stays steady
    this.drawDepthGauge(ctx, player);

    // Tunnel minimap (toggled with M)
    if (this.showMap) this.drawMinimap(ctx);

    // Cinematic letterbox + title card sits above everything
    this.drawCinematic(ctx);
  }

  // A toggleable local map of the dug tunnel network around the pod.
  drawMinimap(ctx) {
    const s = this.state;
    if (!s) return;
    const w = s.world, p = s.player;
    const cell = 3, winC = 60, winR = 44;
    const panelW = winC * cell, panelH = winR * cell;
    const px = this.viewW - panelW - 26, py = 70;
    // panel backdrop + frame
    ctx.fillStyle = "rgba(8,6,12,0.82)";
    ctx.fillRect(px - 4, py - 4, panelW + 8, panelH + 8);
    ctx.strokeStyle = "rgba(255,179,71,0.5)"; ctx.lineWidth = 1;
    ctx.strokeRect(px - 4.5, py - 4.5, panelW + 9, panelH + 9);
    const pc = Math.floor(p.centerX / TILE), pr = Math.floor(p.centerY / TILE);
    const c0 = pc - (winC >> 1), r0 = pr - (winR >> 1);
    for (let y = 0; y < winR; y++) {
      for (let x = 0; x < winC; x++) {
        const c = c0 + x, r = r0 + y;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (r < GROUND_ROW) continue; // sky — leave backdrop
        const t = w.type[w.idx(c, r)];
        let col;
        if (t === T.EMPTY) col = "rgba(120,150,170,0.55)";   // dug tunnel / cavern
        else if (t === T.LAVA) col = "#ff7a3a";
        else if (t === T.WATER) col = "#3a7ad0";
        else col = "rgba(72,56,46,0.65)";                    // solid rock/dirt
        ctx.fillStyle = col;
        ctx.fillRect(px + x * cell, py + y * cell, cell, cell);
      }
    }
    // surface buildings
    for (const b of BUILDINGS) {
      const bx = Math.floor(b.col + b.width / 2) - c0, by = GROUND_ROW - r0;
      if (bx >= 0 && bx < winC && by >= 0 && by < winR) {
        ctx.fillStyle = b.color;
        ctx.fillRect(px + bx * cell - 1, py + by * cell - 3, 2, 3);
      }
    }
    // player marker (always centred)
    const mx = px + (winC >> 1) * cell + cell / 2, my = py + (winR >> 1) * cell + cell / 2;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(mx, my, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();
    // label
    ctx.fillStyle = "rgba(255,179,71,0.85)";
    ctx.font = "9px 'Courier New', monospace"; ctx.textAlign = "left";
    ctx.fillText("TUNNEL MAP — M", px - 4, py - 9);
    ctx.textAlign = "start";
  }

  // Vertical strata navigator on the right edge. The scale spans ONLY the
  // regions you've discovered, so the discovered biomes always fill the bar —
  // masking how much world remains below. It "zooms out" as you find more.
  drawDepthGauge(ctx, player) {
    const x = this.viewW - 16, y = 56, h = this.viewH - 110, w = 9;
    const totalRows = ROWS - GROUND_ROW;
    const maxRows = this.state.stats.maxDepth / 2;
    const flash = this._gaugeFlashT || 0;

    // Deepest discovered region → the bar maps 0..(end of that region).
    let deepest = 0;
    if (this._regions) for (const i of this._regions) if (i > deepest) deepest = i;
    const fullyDiscovered = deepest >= STRATA.length - 1;
    const targetScale = fullyDiscovered ? totalRows : STRATA[deepest + 1].start;
    // Eased scale so newly-revealed regions smoothly zoom the navigator out.
    if (this._gaugeScale == null) this._gaugeScale = targetScale;
    this._gaugeScale += (targetScale - this._gaugeScale) * 0.1;
    const scale = Math.max(1, this._gaugeScale);
    const rowToY = (rows) => y + Math.min(1, Math.max(0, rows / scale)) * h;

    // Discovered biome bands
    for (let i = 0; i <= deepest && i < STRATA.length; i++) {
      const st = STRATA[i];
      const next = STRATA[i + 1];
      const top = rowToY(st.start);
      const bot = rowToY(next ? next.start : totalRows);
      const d = st.dirt;
      ctx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
      ctx.fillRect(x, top, w, Math.max(1, bot - top));
      if (flash > 0 && i === this._lastRegion) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 * flash})`;
        ctx.fillRect(x, top, w, Math.max(1, bot - top));
      }
    }
    // frame
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    // explored-frontier tick
    const my = rowToY(maxRows);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.moveTo(x - 3, my); ctx.lineTo(x + w + 3, my); ctx.stroke();
    // bottom of the bar: the core (once found) or a faint "unknown below" hint
    if (fullyDiscovered) {
      ctx.fillStyle = "#ff3a8a";
      ctx.fillRect(x - 2, y + h - 2, w + 4, 4);
    } else {
      const cy = y + h + 7 + Math.sin(this.accumBlink * 3) * 2;
      ctx.fillStyle = "rgba(150,140,160,0.5)";
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 5, cy); ctx.lineTo(x + w / 2 + 5, cy); ctx.lineTo(x + w / 2, cy + 6);
      ctx.closePath(); ctx.fill();
    }
    // player marker
    const py = rowToY(player.depthRow);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x - 5, py); ctx.lineTo(x - 11, py - 4); ctx.lineTo(x - 11, py + 4);
    ctx.closePath(); ctx.fill();
  }

  // Rich atmospheric Mars sky with a slow day/night cycle. Parallax factors are
  // gentle and use FIXED wrap dimensions so nothing whooshes or resizes.
  drawSky(ctx, cam, VW, VH) {
    const groundY = GROUND_ROW * TILE - cam.y;
    const horizon = Math.max(70, groundY);
    const t = this.accumBlink;

    // Altitude factor: 0 at the surface → 1 once the view climbs into space.
    const spaceAltPx = (SPACE_ALT / 2) * TILE;
    const camAbove = GROUND_ROW * TILE - (cam.y + VH / 2);
    const space = Math.max(0, Math.min(1, camAbove / spaceAltPx));
    const atmo = 1 - space; // how much atmosphere (clouds/mountains/haze) is left

    // ---- time of day (full cycle every CYCLE seconds) ----
    const CYCLE = 500;
    const ang = ((t % CYCLE) / CYCLE) * Math.PI * 2; // sun's orbital angle
    const sunAlt = Math.cos(ang);                    // +1 noon, -1 midnight
    const daylight = smooth01((sunAlt + 0.15) / 0.4); // 0 night .. 1 full day
    const dusk = Math.max(0, 1 - Math.abs(sunAlt) / 0.5); // glow near horizon

    // ---- sky gradient, darkening toward space-black as you ascend ----
    const SPACE_COL = [3, 4, 12];
    const top = mix(mix([14, 10, 32], [60, 44, 98], daylight), SPACE_COL, space);
    const midC = mix(mix([30, 20, 52], [150, 92, 100], daylight), SPACE_COL, space * 0.9);
    let hor = mix([66, 42, 62], [214, 156, 112], daylight);
    hor = mix(hor, [255, 150, 78], dusk * 0.6);
    hor = mix(hor, SPACE_COL, space * 0.78);
    const g = ctx.createLinearGradient(0, -20, 0, horizon);
    g.addColorStop(0, rgbStr(top));
    g.addColorStop(0.5, rgbStr(midC));
    g.addColorStop(1, rgbStr(hor));
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, VW + 60, VH + 60);

    // ---- stars: revealed at night OR up in space (even by day) ----
    const starA = Math.max((1 - daylight) * 0.9, space * 0.95);
    if (starA > 0.02) {
      const FW = VW + 200, FH = VH * 0.55; // fixed wrap dimensions
      for (let i = 0; i < 90; i++) {
        const bx = (i * 149.3) % FW, by = (i * 83.7) % FH;
        const sx = mod(bx - cam.x * 0.03, FW) - 100;
        const sy = mod(by - cam.y * 0.02, FH);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
        const sz = i % 9 === 0 ? 2 : 1;
        ctx.fillStyle = `rgba(255,245,230,${(starA * tw).toFixed(2)})`;
        ctx.fillRect(sx, sy, sz, sz);
      }
    }

    // ---- sun & moon on a slow arc (barely affected by camera) ----
    const cxB = VW / 2 - cam.x * 0.02;
    const arcW = VW * 0.52, arcH = horizon * 0.95;
    const sunX = cxB - Math.sin(ang) * arcW, sunY = horizon - Math.cos(ang) * arcH;
    const mAng = ang + Math.PI;
    const moonX = cxB - Math.sin(mAng) * arcW, moonY = horizon - Math.cos(mAng) * arcH;
    // draw whichever is lower first so the rising one sits in front
    if (sunY < moonY) { this.drawMoon(ctx, moonX, moonY); this.drawSun(ctx, sunX, sunY, t); }
    else { this.drawSun(ctx, sunX, sunY, t); this.drawMoon(ctx, moonX, moonY); }

    // ---- cloud layer you physically rise up through (world-anchored) ----
    if (atmo > 0.02) this.drawClouds(ctx, cam, VW, VH, t, atmo);

    // ---- atmosphere-only scenery: fades out as you reach space ----
    ctx.save();
    ctx.globalAlpha = atmo;
    // drifting low dust haze near the horizon
    for (let i = 0; i < 4; i++) {
      const cw = 150 + i * 48;
      const cx = mod(t * (5 + i * 2) + i * 360 - cam.x * 0.05, VW + cw * 2 + 200) - cw - 100;
      const cy = horizon * (0.42 + i * 0.1);
      ctx.fillStyle = `rgba(${190 - i * 20},${130 - i * 14},${115 - i * 10},${(0.06 + daylight * 0.05).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, 15 + i * 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    // layered parallax mountains (heights stable per range)
    this.drawRange(ctx, VW, horizon, cam.x * 0.06, 78, 360, rgbStr(mix([48, 34, 56], [104, 78, 92], daylight * 0.5)), 1.3);
    this.drawRange(ctx, VW, horizon, cam.x * 0.14, 122, 250, rgbStr(mix([28, 18, 36], [66, 46, 60], daylight * 0.4)), 4.7);
    // warm haze right at the horizon
    const hz = ctx.createLinearGradient(0, horizon - 60, 0, horizon);
    hz.addColorStop(0, "rgba(255,180,110,0)");
    hz.addColorStop(1, `rgba(255,180,110,${(0.12 + dusk * 0.18).toFixed(2)})`);
    ctx.fillStyle = hz;
    ctx.fillRect(-30, horizon - 60, VW + 60, 60);
    ctx.restore();

    // ---- weather haze over the whole sky (overcast / dust storm tint) ----
    if (this.weather) this.weather.drawSkyTint(ctx, VW, VH, horizon);
  }

  // Floating asteroids in the sky/space band (negative rows, sparse sky map).
  // Beveled space rock with glinting embedded space-ore.
  drawAsteroids(ctx, world, cam) {
    if (cam.y > GROUND_ROW * TILE) return; // no sky in view → nothing up there
    const VW = this.viewW, VH = this.viewH;
    for (const [k, type] of world.skyType) {
      const r = Math.floor(k / COLS), c = k - r * COLS;
      const sx = c * TILE - cam.x, sy = r * TILE - cam.y;
      if (sx < -TILE || sx > VW || sy < -TILE || sy > VH) continue;
      // rock body + bevel
      ctx.fillStyle = "#6c6f79";
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(sx, sy, TILE, 3);
      ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.fillRect(sx, sy + TILE - 4, TILE, 4);
      const sd = (c * 73856093) ^ (r * 19349663);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(sx + 5 + (sd & 7), sy + 6 + ((sd >> 3) & 9), 3, 3);
      ctx.fillRect(sx + 17 + ((sd >> 6) & 7), sy + 18 + ((sd >> 9) & 7), 2, 2);
      // embedded ore gem
      const mineral = world.skyMineral.get(k);
      if (mineral) {
        const m = MINERALS[mineral];
        const cx = sx + TILE / 2, cy = sy + TILE / 2, rad = TILE * 0.26;
        const pulse = 0.7 + 0.3 * Math.sin(this.accumBlink * 3 + c * 0.7 + r * 0.5);
        ctx.globalAlpha = 0.2 * pulse; ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(cx, cy, rad * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy); ctx.lineTo(cx, cy + rad); ctx.lineTo(cx - rad, cy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(cx - rad * 0.35, cy - rad * 0.4, 2, 2);
        if (this.settings && this.settings.colorblind) {
          ctx.font = "bold 11px 'Courier New', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.lineWidth = 3; ctx.strokeText(m.name.slice(0, 2), cx, cy);
          ctx.fillStyle = "#fff"; ctx.fillText(m.name.slice(0, 2), cx, cy);
          ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
        }
      }
    }
  }

  // A band of puffy clouds at real altitudes — anchored in world space so the
  // pod flies up THROUGH them. Fades out as the atmosphere thins toward space.
  drawClouds(ctx, cam, VW, VH, t, atmo) {
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const altRows = 22 + ((i * 13) % 60);           // ~44m..164m up
      const cy = (GROUND_ROW * TILE - altRows * TILE) - cam.y; // vertical parallax 1.0
      if (cy < -60 || cy > VH + 60) continue;
      const cw = 70 + ((i * 41) % 110);
      const cx = mod(i * 257 + t * (5 + (i % 4) * 3) - cam.x * 0.7, VW + 600) - 300;
      ctx.fillStyle = `rgba(232,228,240,${(0.16 * atmo).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, 14 + (i % 3) * 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + cw * 0.55, cy - 5, cw * 0.6, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - cw * 0.5, cy + 3, cw * 0.5, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawSun(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(255,196,120,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + t * 0.05;
      const r1 = 24 + 4 * Math.sin(t * 1.5 + i);
      const r2 = 44 + 8 * Math.sin(t + i);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
    const sg = ctx.createRadialGradient(0, 0, 6, 0, 0, 90);
    sg.addColorStop(0, "rgba(255,228,160,0.95)");
    sg.addColorStop(0.35, "rgba(255,170,90,0.35)");
    sg.addColorStop(1, "rgba(255,150,80,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(-90, -90, 180, 180);
    const disc = ctx.createRadialGradient(-4, -4, 2, 0, 0, 19);
    disc.addColorStop(0, "#fff3d6");
    disc.addColorStop(1, "#ffce86");
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawMoon(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
    halo.addColorStop(0, "rgba(200,205,230,0.3)");
    halo.addColorStop(1, "rgba(200,205,230,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-34, -34, 68, 68);
    ctx.fillStyle = "#c8cbe0";
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(150,150,175,0.6)";
    ctx.beginPath(); ctx.arc(3, -2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-3, 3, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-1, -4, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Parallax mountain silhouette. Peak heights are keyed to a stable WORLD
  // index so ridges translate as they scroll instead of morphing/resizing.
  drawRange(ctx, VW, baseY, scroll, height, period, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-period, baseY + 6);
    const k0 = Math.floor((scroll - period) / period);
    const k1 = Math.ceil((scroll + VW + period) / period);
    for (let k = k0; k <= k1; k++) {
      const cx = k * period - scroll;
      const peak = height * (0.45 + 0.55 * Math.abs(Math.sin(k * 1.7 + seed)));
      ctx.lineTo(cx - period * 0.5, baseY + 6); // valley
      ctx.lineTo(cx, baseY - peak);             // peak
    }
    ctx.lineTo(VW + period, baseY + 6);
    ctx.closePath();
    ctx.fill();
  }

  drawBackground(ctx, cam) {
    const VW = this.viewW, VH = this.viewH;
    const topRow = cam.y / TILE;
    if (topRow < GROUND_ROW) {
      this.drawSky(ctx, cam, VW, VH);
    } else {
      // ---- underground: stratum-tinted dark + parallax rock silhouettes ----
      const centerDepth = (cam.y + VH / 2) / TILE - GROUND_ROW;
      const st = stratumAt(Math.max(0, centerDepth));
      const d = st.dirt;
      ctx.fillStyle = `rgb(${(d[0]*0.16)|0},${(d[1]*0.16)|0},${(d[2]*0.16)|0})`;
      ctx.fillRect(-30, -30, VW + 60, VH + 60);
      // parallax rock silhouettes (seen through dug tunnels) — horizontal scroll
      ctx.fillStyle = `rgba(${(d[0]*0.3)|0},${(d[1]*0.3)|0},${(d[2]*0.3)|0},0.55)`;
      const baseY = VH * 0.58;
      const px = -((cam.x * 0.4) % 240);
      for (let i = -1; i * 240 + px < VW + 240; i++) {
        const bx = i * 240 + px;
        const bh = 60 + (Math.abs((i * 67) % 80));
        ctx.beginPath();
        ctx.moveTo(bx, VH);
        ctx.lineTo(bx, baseY - bh * 0.4);
        ctx.lineTo(bx + 60, baseY - bh);
        ctx.lineTo(bx + 120, baseY - bh * 0.5);
        ctx.lineTo(bx + 180, baseY - bh);
        ctx.lineTo(bx + 240, baseY - bh * 0.4);
        ctx.lineTo(bx + 240, VH);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Dark tint for dug-out tunnels, by depth row
  tunnelBg(depthRow) {
    const st = stratumAt(Math.max(0, depthRow));
    const d = st.dirt;
    return `rgb(${(d[0]*0.3)|0},${(d[1]*0.3)|0},${(d[2]*0.3)|0})`;
  }

  drawTile(ctx, world, c, r, cam) {
    const type = world.getType(c, r);
    const sx = c * TILE - cam.x;
    const sy = r * TILE - cam.y;

    if (type === T.EMPTY) {
      // Dug tunnel backdrop (below ground) vs sky (above)
      if (r >= GROUND_ROW) {
        ctx.fillStyle = this.tunnelBg(r - GROUND_ROW);
        ctx.fillRect(sx, sy, TILE, TILE);
      }
      return;
    }

    const color = tileColor(world, c, r);
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, TILE, TILE);

    // Beveled, textured tiles for a chunky modern look
    if (type === T.DIRT || type === T.ROCK || type === T.BOULDER || type === T.PLATFORM || type === T.GRAVEL) {
      // top & left highlight
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(sx, sy, TILE, 3);
      ctx.fillRect(sx, sy, 3, TILE);
      // bottom & right shadow
      ctx.fillStyle = "rgba(0,0,0,0.26)";
      ctx.fillRect(sx, sy + TILE - 3, TILE, 3);
      ctx.fillRect(sx + TILE - 3, sy, 3, TILE);
      // deterministic grain speckles
      if (type === T.DIRT) {
        const seed = (c * 73856093) ^ (r * 19349663);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(sx + 6 + (seed & 7), sy + 8 + ((seed >> 3) & 7), 3, 3);
        ctx.fillRect(sx + 16 + ((seed >> 6) & 7), sy + 18 + ((seed >> 9) & 5), 2, 2);
      } else if (type === T.GRAVEL) {
        // loose pebbles — denser, lighter speckle pattern to read as collapsible
        const seed = (c * 73856093) ^ (r * 19349663);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let k = 0; k < 5; k++) {
          ctx.fillRect(sx + 4 + ((seed >> (k * 3)) & 23), sy + 4 + ((seed >> (k * 2 + 1)) & 23), 3, 3);
        }
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(sx + 5 + (seed & 15), sy + 6 + ((seed >> 4) & 15), 2, 2);
      }
    }

    if (type === T.WATER) {
      // translucent coolant with a gentle surface shimmer
      const f = 0.5 + 0.5 * Math.sin(this.accumBlink * 3 + c * 0.8 + r * 0.4);
      ctx.fillStyle = `rgba(90,170,255,${(0.32 + f * 0.18).toFixed(2)})`;
      ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = "rgba(200,230,255,0.35)";
      ctx.fillRect(sx + 3, sy + 3 + f * 2, TILE - 6, 2);
    }

    if (type === T.LAVA) {
      // glowing flicker
      const f = 0.5 + 0.5 * Math.sin(this.accumBlink * 6 + c * 1.3 + r);
      ctx.fillStyle = `rgba(255,${120 + f * 80 | 0},0,0.5)`;
      ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
    }
    if (type === T.GAS) {
      ctx.fillStyle = "rgba(180,255,120,0.35)";
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE / 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (type === T.CORE) {
      const f = 0.5 + 0.5 * Math.sin(this.accumBlink * 3 + c + r);
      ctx.save();
      ctx.shadowColor = "#ff2a7a";
      ctx.shadowBlur = 14 * f;
      ctx.fillStyle = `rgba(255,${40 + f * 40 | 0},${120 + f * 40 | 0},0.9)`;
      ctx.fillRect(sx + 5, sy + 5, TILE - 10, TILE - 10);
      ctx.restore();
    }

    // Artifact — pulsing golden relic
    const artifact = world.getArtifact(c, r);
    if (artifact) {
      const cx = sx + TILE / 2, cy = sy + TILE / 2;
      const pulse = 0.6 + 0.4 * Math.sin(this.accumBlink * 4 + c + r);
      ctx.save();
      ctx.shadowColor = "#ffdf6a";
      ctx.shadowBlur = 10 * pulse;
      ctx.fillStyle = "#ffdf6a";
      ctx.translate(cx, cy);
      // four-point star
      const R = TILE * 0.3, rI = TILE * 0.12;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (Math.PI / 4) * k - Math.PI / 2;
        const rad = k % 2 === 0 ? R : rI;
        ctx[k === 0 ? "moveTo" : "lineTo"](Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    // Buried treasure — revealed when close, or anywhere within scanner range
    const treasureVal = world.getTreasure(c, r);
    if (treasureVal > 0) {
      const p = this.state.player;
      const pc = p.centerX / TILE, pr = p.centerY / TILE;
      const dist = Math.hypot(c + 0.5 - pc, r + 0.5 - pr);
      const reveal = Math.max(2.5, p.scanRange);
      if (dist <= reveal) {
        const cx = sx + TILE / 2, cy = sy + TILE / 2, sz = TILE * 0.3;
        const pulse = 0.6 + 0.4 * Math.sin(this.accumBlink * 4 + c + r);
        ctx.globalAlpha = 0.55 * pulse;
        ctx.strokeStyle = "#ffd445";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.42 * (0.85 + 0.25 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#7a4a1a";
        ctx.fillRect(cx - sz, cy - sz * 0.7, sz * 2, sz * 1.4);
        ctx.fillStyle = "#ffd445";
        ctx.fillRect(cx - sz, cy - 2, sz * 2, 4);
        ctx.fillStyle = "#3a2410";
        ctx.fillRect(cx - 2, cy - 3, 4, 6);
      }
      return;
    }

    // Mineral gem — glowing, faceted, value-scaled
    const mineral = world.getMineral(c, r);
    if (mineral) {
      const m = MINERALS[mineral];
      const cx = sx + TILE / 2, cy = sy + TILE / 2;
      const rad = TILE * 0.27;
      const tier = Math.max(1, Math.log10(m.value)); // ~1.5..5.7
      const pulse = 0.7 + 0.3 * Math.sin(this.accumBlink * 3 + c * 0.7 + r * 0.5);
      // glow halo (cheap; brighter for valuable ore)
      ctx.globalAlpha = (0.10 + Math.min(0.22, tier * 0.04)) * pulse;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * (1.6 + Math.min(1.4, tier * 0.22)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // gem body
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy);
      ctx.lineTo(cx, cy + rad); ctx.lineTo(cx - rad, cy);
      ctx.closePath();
      ctx.fill();
      // top facet highlight
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy);
      ctx.lineTo(cx, cy); ctx.lineTo(cx - rad, cy);
      ctx.closePath();
      ctx.fill();
      // outline + sparkle
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy);
      ctx.lineTo(cx, cy + rad); ctx.lineTo(cx - rad, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(cx - rad * 0.35, cy - rad * 0.4, 2, 2);
      // Accessibility: a high-contrast 2-letter marker so ore is told apart by
      // more than colour. The first two letters are unique across all ores.
      if (this.settings && this.settings.colorblind) {
        const mark = m.name.slice(0, 2);
        ctx.font = "bold 11px 'Courier New', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.lineWidth = 3;
        ctx.strokeText(mark, cx, cy);
        ctx.fillStyle = "#fff";
        ctx.fillText(mark, cx, cy);
        ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      }
    }
  }

  drawBuildings(ctx, cam) {
    const groundY = GROUND_ROW * TILE - cam.y;
    // ground line accent (behind buildings)
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, groundY - 1, this.viewW, 2);

    for (const b of BUILDINGS) {
      const w = b.width * TILE;
      const x = b.col * TILE - cam.x;
      if (x + w < -20 || x > this.viewW + 20) continue;
      const h = TILE * 2.6;
      const y = groundY - h;
      const active = this.activeBuilding && this.activeBuilding.id === b.id;
      const pulse = 0.5 + 0.5 * Math.sin(this.accumBlink * 5);

      // soft ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, groundY + 3, w * 0.55, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // body with vertical gradient
      const bg = ctx.createLinearGradient(0, y, 0, y + h);
      bg.addColorStop(0, active ? "#4c3e2d" : "#3e3225");
      bg.addColorStop(1, active ? "#2a2016" : "#221a12");
      ctx.fillStyle = bg;
      roundRect(ctx, x, y, w, h, 4); ctx.fill();

      // colored side pillars
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y + 10, 3, h - 12);
      ctx.fillRect(x + w - 3, y + 10, 3, h - 12);
      // roof trim
      ctx.fillRect(x + 2, y + 2, w - 4, 4);

      // glowing sign board
      const signH = 22;
      ctx.fillStyle = "#15100a";
      ctx.fillRect(x + 3, y + 7, w - 6, signH);
      ctx.save();
      if (active) { ctx.shadowColor = b.color; ctx.shadowBlur = 7 + pulse * 8; }
      ctx.strokeStyle = b.color; ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 8, w - 8, signH - 2);
      ctx.fillStyle = b.color;
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.name.toUpperCase(), x + w / 2, y + 8 + signH / 2 + 3);
      ctx.restore();
      ctx.textAlign = "left";

      // lit window row
      const winY = y + signH + 16;
      const nW = Math.max(2, Math.floor(w / 24));
      const gap = w / (nW + 1);
      for (let i = 0; i < nW; i++) {
        const wx = x + gap * (i + 1) - 6;
        const lit = (i + b.col) % 4 !== 0;
        if (lit) {
          ctx.fillStyle = "rgba(255,200,120,0.16)";
          ctx.fillRect(wx - 3, winY - 3, 18, 18); // glow
        }
        ctx.fillStyle = lit ? "#ffd27a" : "#2a3a4a";
        ctx.fillRect(wx, winY, 12, 11);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(wx + 5, winY, 2, 11); // mullion
      }

      // doorway with warm light spill
      const dW = 22, dH = 30, dx = x + w / 2 - dW / 2, dy = groundY - dH;
      ctx.fillStyle = "#0d0805";
      ctx.fillRect(dx, dy, dW, dH);
      const dg = ctx.createLinearGradient(0, dy, 0, dy + dH);
      dg.addColorStop(0, "rgba(255,200,120,0.5)");
      dg.addColorStop(1, "rgba(255,200,120,0.04)");
      ctx.fillStyle = dg;
      ctx.fillRect(dx + 2, dy + 3, dW - 4, dH - 3);
      ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
      ctx.strokeRect(dx, dy, dW, dH);

      // foundation
      ctx.fillStyle = "#2a2018";
      ctx.fillRect(x - 2, groundY - 4, w + 4, 5);

      // antenna + blinking beacon
      const antX = x + w - 11;
      ctx.strokeStyle = "#5a5a5a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(antX, y + 2); ctx.lineTo(antX, y - 13); ctx.stroke();
      const beaconOn = Math.sin(this.accumBlink * 4 + b.col) > 0;
      ctx.save();
      if (beaconOn) { ctx.shadowColor = "#ff5a5a"; ctx.shadowBlur = 8; }
      ctx.fillStyle = beaconOn ? "#ff6a6a" : "#5a2020";
      ctx.beginPath(); ctx.arc(antX, y - 14, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // active outline glow + bobbing arrow
      if (active) {
        ctx.save();
        ctx.shadowColor = b.color; ctx.shadowBlur = 12 + pulse * 14;
        ctx.strokeStyle = b.color; ctx.lineWidth = 2.5;
        roundRect(ctx, x, y, w, h, 4); ctx.stroke();
        ctx.restore();
        const ay = y - 24 - pulse * 6;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 8, ay); ctx.lineTo(x + w / 2 + 8, ay); ctx.lineTo(x + w / 2, ay + 12);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  drawDrillProgress(ctx, player, cam) {
    const t = player.drillTarget;
    const sx = t.c * TILE - cam.x, sy = t.r * TILE - cam.y;
    const cx = sx + TILE / 2, cy = sy + TILE / 2;
    const prog = player.drillProgress;

    // Per-tile seeded RNG so the fracture pattern is stable (grows, doesn't jitter).
    let seed = (((t.c + 1) * 73856093) ^ ((t.r + 1) * 19349663)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    // Jagged cracks radiating from the centre; more of them appear and they
    // lengthen as the rock breaks down. (Always loops MAX so the RNG — and thus
    // the pattern — stays deterministic regardless of how many are shown.)
    const MAX = 6;
    const shown = 1 + Math.floor(prog * (MAX - 1));
    ctx.lineCap = "round";
    for (let i = 0; i < MAX; i++) {
      const ang0 = (i / MAX) * Math.PI * 2 + (rnd() - 0.5);
      const reach = TILE * (0.16 + 0.30 * prog) * (0.7 + rnd() * 0.6);
      const lw = 0.8 + rnd() * 1.6;
      const pts = [[cx + Math.cos(ang0) * 2, cy + Math.sin(ang0) * 2]];
      let ang = ang0;
      for (let sgmt = 1; sgmt <= 3; sgmt++) {
        ang += (rnd() - 0.5);
        const r = (reach * sgmt) / 3;
        pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
      }
      if (i >= shown) continue; // only the cracks revealed so far
      ctx.strokeStyle = `rgba(15,9,5,${(0.4 + 0.5 * prog).toFixed(2)})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
    }

    // Chipped-out flecks accumulating near the bite (separate stable stream).
    let s2 = (seed ^ 0x9e3779b9) >>> 0;
    const rnd2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
    const chips = Math.floor(prog * 7);
    ctx.fillStyle = `rgba(0,0,0,${(0.25 + 0.4 * prog).toFixed(2)})`;
    for (let i = 0; i < chips; i++) {
      const a = rnd2() * Math.PI * 2, d = rnd2() * TILE * 0.32, sz = 1 + rnd2() * 2.2;
      ctx.fillRect(cx + Math.cos(a) * d - sz / 2, cy + Math.sin(a) * d - sz / 2, sz, sz);
    }

    // Subtle progress ring for precise "about to break" feedback.
    ctx.strokeStyle = `rgba(255,207,63,${(0.45 + 0.4 * prog).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.34, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  }

  drawPlayer(ctx, player, cam) {
    const x = player.x - cam.x;
    const y = player.y - cam.y;
    const w = player.w, h = player.h;
    const cx = x + w / 2, cy = y + h / 2;

    // Lean into horizontal movement for a responsive feel
    const tilt = clampN((player.vx / (175 * player.engineMult)) * 0.2, -0.22, 0.22);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.translate(-cx, -cy);

    // Thruster flames
    const blink = (Math.sin(this.accumBlink * 30) + 1) / 2;
    if (this.input.down("up") && player.fuel > 0) {
      ctx.fillStyle = `rgba(255,${150 + blink * 80 | 0},40,0.9)`;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + h);
      ctx.lineTo(x + w - 4, y + h);
      ctx.lineTo(cx, y + h + 10 + blink * 8);
      ctx.closePath();
      ctx.fill();
    }
    if (this.input.down("left") && !this.input.down("right") && player.fuel > 0) {
      ctx.fillStyle = "rgba(255,180,60,0.85)";
      ctx.beginPath();
      ctx.moveTo(x + w, y + 5); ctx.lineTo(x + w, y + h - 5); ctx.lineTo(x + w + 9, cy); ctx.closePath(); ctx.fill();
    }
    if (this.input.down("right") && !this.input.down("left") && player.fuel > 0) {
      ctx.fillStyle = "rgba(255,180,60,0.85)";
      ctx.beginPath();
      ctx.moveTo(x, y + 5); ctx.lineTo(x, y + h - 5); ctx.lineTo(x - 9, cy); ctx.closePath(); ctx.fill();
    }

    // Body (uses the selected paint scheme)
    const skin = this.skin || POD_SKINS[0];
    ctx.fillStyle = skin.body;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = skin.dark;
    ctx.fillRect(x, y + h - 6, w, 6);

    // Cockpit
    ctx.fillStyle = skin.cockpit;
    ctx.beginPath();
    ctx.arc(cx + player.facing * 2, y + h * 0.42, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a3a4a";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drill — colour & size reflect the drill tier (visible upgrades)
    const spin = player.drilling ? Math.sin(this.accumBlink * 40) : 0;
    const DRILL_COLORS = ["#9a9a9a", "#d2d2d2", "#dfe7ef", "#ff9aa8", "#9fe8ff", "#c9a3ff"];
    const dlvl = player.tier.drill || 0;
    ctx.fillStyle = DRILL_COLORS[dlvl] || "#cfcfcf";
    const nub = 6 + dlvl * 1.4; // longer drill at higher tiers
    if (player.drillTarget && player.drillTarget.r > Math.floor(player.centerY / TILE)) {
      // drilling down
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + h);
      ctx.lineTo(cx + 6, y + h);
      ctx.lineTo(cx, y + h + nub + 3 + spin * 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // default downward drill nub
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + h - 1);
      ctx.lineTo(cx + 5, y + h - 1);
      ctx.lineTo(cx, y + h + nub);
      ctx.closePath();
      ctx.fill();
    }
    // side drill indicator
    if (player.drilling && player.drillTarget &&
        player.drillTarget.r === Math.floor(player.centerY / TILE)) {
      const dir = player.facing;
      ctx.beginPath();
      ctx.moveTo(x + (dir > 0 ? w : 0), cy - 5);
      ctx.lineTo(x + (dir > 0 ? w : 0), cy + 5);
      ctx.lineTo(x + (dir > 0 ? w + 8 + spin * 2 : -8 - spin * 2), cy);
      ctx.closePath();
      ctx.fill();
    }

    // outline
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();

    ctx.restore(); // end pod tilt transform
  }

  drawParticles(ctx, cam) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawHeat(ctx, heat) {
    const VW = this.viewW, VH = this.viewH;
    const a = Math.min(0.5, heat / 200);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.75);
    g.addColorStop(0, "rgba(255,60,0,0)");
    g.addColorStop(1, `rgba(255,40,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  // A soft white radial sprite, built once. We stamp it (scaled) to carve light
  // holes out of the darkness mask — far cheaper than a gradient per light.
  _ensureLightSprite() {
    if (this._lightSprite) return;
    const R = 128;
    const s = document.createElement("canvas");
    s.width = s.height = R * 2;
    const sc = s.getContext("2d");
    const g = sc.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.82)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    sc.fillStyle = g;
    sc.fillRect(0, 0, R * 2, R * 2);
    this._lightSprite = s;
  }

  _ensureLightCanvas() {
    if (this._lightCv && this._lightCv.width === this.viewW && this._lightCv.height === this.viewH) return;
    this._lightCv = document.createElement("canvas");
    this._lightCv.width = this.viewW;
    this._lightCv.height = this.viewH;
    this._lightCtx = this._lightCv.getContext("2d");
  }

  _stamp(lc, x, y, radius, intensity) {
    lc.globalAlpha = intensity;
    lc.drawImage(this._lightSprite, x - radius, y - radius, radius * 2, radius * 2);
    lc.globalAlpha = 1;
  }

  // Cave darkness that deepens with descent. Light sources (pod headlight,
  // lava, surface base lamps) punch visibility back out of the dark by erasing
  // an offscreen mask, which is then composited over the rendered scene.
  drawDarkness(ctx, player, world, cam) {
    const VW = this.viewW, VH = this.viewH;
    const depth = player.depthMeters;
    // Ramps from first light loss (~90m) toward near-pitch black in the deep.
    const dark = Math.min(0.92, Math.max(0, (depth - 90) / 1000));
    if (dark <= 0.02) return;

    this._ensureLightSprite();
    this._ensureLightCanvas();
    const lc = this._lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, VW, VH);
    lc.fillStyle = `rgba(5,3,10,${dark})`;
    lc.fillRect(0, 0, VW, VH);

    // Erase darkness where light falls.
    lc.globalCompositeOperation = "destination-out";

    const px = player.centerX - cam.x;
    const py = player.centerY - cam.y;
    const range = player.headlightRange;

    // Ambient glow pool around the pod — keeps the immediate surroundings
    // (and the tile you're drilling) readable in any direction.
    this._stamp(lc, px, py, 78 * range, 0.96);

    // Directional beam. Aims at the drill target while digging, otherwise
    // along the facing direction — classic spotlight sweep.
    let ang = player.facing < 0 ? Math.PI : 0;
    if (player.drilling && player.drillTarget) {
      const tx = player.drillTarget.c * TILE + TILE / 2 - cam.x;
      const ty = player.drillTarget.r * TILE + TILE / 2 - cam.y;
      ang = Math.atan2(ty - py, tx - px);
    }
    const coneLen = 240 * range, coneHalf = 92 * range;
    lc.save();
    lc.translate(px, py);
    lc.rotate(ang);
    const cg = lc.createLinearGradient(0, 0, coneLen, 0);
    cg.addColorStop(0, "rgba(255,255,255,1)");
    cg.addColorStop(0.6, "rgba(255,255,255,0.5)");
    cg.addColorStop(1, "rgba(255,255,255,0)");
    lc.fillStyle = cg;
    lc.beginPath();
    lc.moveTo(0, -10);
    lc.lineTo(coneLen, -coneHalf);
    lc.lineTo(coneLen, coneHalf);
    lc.lineTo(0, 10);
    lc.closePath();
    lc.fill();
    lc.restore();

    // Lava self-illuminates and casts a glow into nearby dark.
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((cam.x + VW) / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((cam.y + VH) / TILE));
    const flick = 0.78 + 0.08 * Math.sin(this.accumBlink * 6);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (world.type[world.idx(c, r)] === T.LAVA) {
          const lx = c * TILE + TILE / 2 - cam.x;
          const ly = r * TILE + TILE / 2 - cam.y;
          this._stamp(lc, lx, ly, 44, flick);
        }
      }
    }

    lc.globalCompositeOperation = "source-over";
    ctx.drawImage(this._lightCv, 0, 0);
  }

  // Fog of war: an opaque murk hides the rock layout beyond the pod's Sensor
  // Array reveal radius (soft-edged). The surface is always clear, and the top
  // sensor tier (radius = Infinity) removes the fog entirely.
  drawFog(ctx, player, cam) {
    if (!this.state) return;
    const sensorTiles = player.sensorRange;
    if (!isFinite(sensorTiles)) return;          // Omni-Scanner: no fog anywhere
    const VW = this.viewW, VH = this.viewH;
    const radius = sensorTiles * TILE;           // pod's sensor reveal radius
    this._ensureLightSprite();
    this._ensureLightCanvas();
    const lc = this._lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, VW, VH);
    lc.fillStyle = "rgba(9,11,18,0.93)";         // unscanned-rock murk
    lc.fillRect(0, 0, VW, VH);

    lc.globalCompositeOperation = "destination-out";
    // 1) The pod's sensor reveal (soft circle), wherever it is.
    this._stamp(lc, player.centerX - cam.x, player.centerY - cam.y, radius, 1);
    // 2) "Surface light": the sky plus the top SURFACE_DEPTH tiles of ground are
    //    permanently discovered across the full width, fading softly into the
    //    fog below. You dig past it to uncover the rest.
    const SURFACE_DEPTH = 4;            // tiles of ground lit from the surface
    const fade = TILE * 1.5;
    const groundY = GROUND_ROW * TILE - cam.y;
    const bandBottom = groundY + SURFACE_DEPTH * TILE;
    if (bandBottom - fade > 0) { lc.fillStyle = "#fff"; lc.fillRect(0, 0, VW, bandBottom - fade); }
    if (bandBottom > 0) {
      const top = Math.max(0, bandBottom - fade);
      const grad = lc.createLinearGradient(0, top, 0, bandBottom);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      lc.fillStyle = grad;
      lc.fillRect(0, top, VW, bandBottom - top);
    }

    lc.globalCompositeOperation = "source-over";
    ctx.drawImage(this._lightCv, 0, 0);
  }
}

function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function mod(a, n) { return ((a % n) + n) % n; }

// Today's shared seed (YYYYMMDD) — everyone gets the same world each day.
function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
// Turn a seed field into a uint32: blank → random, digits → number, text → FNV-1a hash.
function seedFromInput(str) {
  if (!str) return (Math.random() * 1e9) | 0;
  if (/^\d+$/.test(str)) return parseInt(str, 10) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function mix(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgbStr(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
