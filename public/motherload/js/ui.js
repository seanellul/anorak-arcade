// ============================================================
//  UI — DOM-based HUD, toasts, prompts, and shop modals
// ============================================================
import { UPGRADES, UPGRADE_KEYS, CONSUMABLES, consumableCost, MINERALS, MINERAL_KEYS, ORE_KEYS, RECIPES, BASE_UPGRADES, BASE_UPGRADE_KEYS, STRATA, PERKS, PERK_BRANCH_KEYS, FUEL_PRICE, REPAIR_PRICE, repairUnitPrice, stratumAt, skyLayerAt, upgradeTier, upgradeCost, upgradeIsMax, UPGRADE_ESCALATION, GROUND_ROW, TILE, MAX_RISE, FUEL_THRUST_UP, FUEL_IDLE } from "./config.js?v=51";
import * as Shop from "./shops.js?v=51";
import { CAMPAIGN } from "./missions.js?v=51";
import { ARTIFACTS, ENDINGS } from "./config.js?v=51";

const el = (id) => document.getElementById(id);

// "1h 23m" / "7m 05s" — for end-of-run stat readouts.
function fmtTime(secs) {
  secs = Math.floor(secs || 0);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(secs % 60).padStart(2, "0")}s`;
}

export const UI = {
  refs: {},
  game: null,

  init(game) {
    this.game = game;
    this.refs = {
      hud: el("hud"),
      fuelFill: el("fuel-fill"), fuelText: el("fuel-text"), fuelHome: el("fuel-home"),
      hullFill: el("hull-fill"), hullText: el("hull-text"),
      heatGauge: el("heat-gauge"), heatFill: el("heat-fill"),
      cargoFill: el("cargo-fill"), cargoText: el("cargo-text"),
      moneyText: el("money-text"), depthText: el("depth-text"), depthLabel: el("depth-label"),
      prompt: el("prompt"),
      objective: el("objective"),
      objTitle: el("obj-title"), objFill: el("obj-fill"), objProgress: el("obj-progress"),
      lore: el("lore"), loreText: el("lore-text"),
      toasts: el("toast-container"),
      startScreen: el("start-screen"),
      continueBtn: el("continue-btn"),
      modal: el("modal"),
      modalTitle: el("modal-title"),
      modalBody: el("modal-body"),
      gameover: el("gameover-screen"),
      gameoverReason: el("gameover-reason"),
      gameoverStats: el("gameover-stats"),
      victory: el("victory-screen"),
      victoryText: el("victory-text"),
      victoryStats: el("victory-stats"),
    };

    el("modal-close").addEventListener("click", () => this.game.closeShop());
  },

  // ---------------- HUD ----------------
  updateHUD(state) {
    const p = state.player;
    const fpct = p.fuel / p.maxFuel;
    this.refs.fuelFill.style.width = `${fpct * 100}%`;
    this.refs.fuelFill.classList.toggle("crit", fpct <= 0.1);

    // Fuel-to-home: a ⌂ tick marks the fuel a straight climb to the surface
    // costs from here (booster/reactor/difficulty aware, ×1.35 for the
    // not-a-straight-shaft reality). The bar turns amber once you dip below it.
    const depthPx = Math.max(0, p.y - GROUND_ROW * TILE);
    const homeFuel = (depthPx / (MAX_RISE * p.riseMult)) *
      (FUEL_IDLE + FUEL_THRUST_UP * p.climbFuelMult) * p.fuelMult * (p.diffFuel || 1) * 1.35;
    const showHome = depthPx > TILE * 12 && homeFuel > 2;
    if (this.refs.fuelHome) {
      this.refs.fuelHome.classList.toggle("hidden", !showHome);
      if (showHome) this.refs.fuelHome.style.left = `${Math.min(98, (homeFuel / p.maxFuel) * 100)}%`;
    }
    this.refs.fuelFill.classList.toggle("below-home", showHome && p.fuel < homeFuel && fpct > 0.1);
    this.refs.fuelText.textContent = `${Math.ceil(p.fuel)}/${p.maxFuel}`;
    this.refs.hullFill.style.width = `${(p.hull / p.maxHull) * 100}%`;
    this.refs.hullText.textContent = `${Math.ceil(p.hull)}/${p.maxHull}`;
    // Heat gauge — dims when cold, glows when dangerously hot
    const heatPct = Math.min(100, p.heat);
    this.refs.heatFill.style.width = `${heatPct}%`;
    this.refs.heatGauge.classList.toggle("cool", p.heat < 5);
    this.refs.heatGauge.classList.toggle("hot", p.heat > 70);
    this.refs.cargoFill.style.width = `${(p.cargoCount / p.cargoMax) * 100}%`;
    this.refs.cargoText.textContent = `${p.cargoCount}/${p.cargoMax}`;
    this.refs.moneyText.textContent = state.money.toLocaleString();
    // Below ground: DEPTH + biome. Above the surface: HEIGHT + the atmospheric
    // layer you're climbing through (positive metres either way).
    const sd = p.depthSignedMeters;
    if (sd < -1) { // genuinely airborne (resting on the surface reads ~-1m)
      if (this.refs.depthLabel) this.refs.depthLabel.textContent = "HEIGHT";
      this.refs.depthText.textContent = `${-sd}m · ${skyLayerAt(-sd)}`;
    } else {
      if (this.refs.depthLabel) this.refs.depthLabel.textContent = "DEPTH";
      this.refs.depthText.textContent = `${Math.max(0, sd)}m · ${stratumAt(p.depthRow).name}`;
    }

    // Low fuel / hull warning tint
    this.refs.fuelText.style.color = p.fuel / p.maxFuel < 0.2 ? "#ff6a6a" : "";
    this.refs.hullText.style.color = p.hull / p.maxHull < 0.25 ? "#ff6a6a" : "";
  },

  showHUD(show) {
    this.refs.hud.classList.toggle("hidden", !show);
    this.refs.objective.classList.toggle("hidden", !show);
  },

  // ---------------- Objective tracker ----------------
  updateObjective(state) {
    const mm = state.missions;
    if (!mm) { this.refs.objective.classList.add("hidden"); return; }
    const m = mm.current;
    if (!m) {
      // Campaign complete
      this.refs.objTitle.textContent = mm.endgameUnlocked ? "Reach the Motherlode core" : "All missions complete";
      this.refs.objFill.style.width = "100%";
      this.refs.objProgress.textContent = mm.side ? this.sideText(mm.side) : "Campaign complete";
      return;
    }
    const p = mm.progressOf(m, state);
    this.refs.objTitle.textContent = m.title;
    this.refs.objFill.style.width = `${Math.min(100, (p.cur / p.max) * 100)}%`;
    let prog = p.text;
    if (mm.side) prog += "  ·  " + this.sideText(mm.side);
    this.refs.objProgress.textContent = prog;
  },
  sideText(side) {
    return `Contract: ${side.progress}/${side.count} ${MINERALS[side.mineral].name}`;
  },

  // ---------------- Lore transmission ----------------
  showLore(text) {
    const head = this.refs.lore.querySelector(".lore-head");
    if (head) { head.textContent = "◇ INCOMING TRANSMISSION ◇"; head.style.color = ""; }
    this.refs.loreText.textContent = text;
    this.refs.lore.classList.remove("hidden");
    clearTimeout(this._loreT);
    this._loreT = setTimeout(() => this.refs.lore.classList.add("hidden"), 6500);
  },

  // A radio transmission from a named NPC (recurring cast).
  showRadio(name, color, text) {
    const head = this.refs.lore.querySelector(".lore-head");
    if (head) { head.textContent = `◇ ${name} ◇`; head.style.color = color; }
    this.refs.loreText.textContent = text;
    this.refs.lore.classList.remove("hidden");
    clearTimeout(this._loreT);
    this._loreT = setTimeout(() => this.refs.lore.classList.add("hidden"), 6000);
  },

  // Is a transmission/lore banner currently showing?
  isLoreVisible() { return !this.refs.lore.classList.contains("hidden"); },

  // Dismiss the current transmission/lore banner early.
  hideLore() { clearTimeout(this._loreT); this.refs.lore.classList.add("hidden"); },

  // ---------------- Prompt ----------------
  showPrompt(html) {
    this.refs.prompt.innerHTML = html;
    this.refs.prompt.classList.remove("hidden");
  },
  hidePrompt() { this.refs.prompt.classList.add("hidden"); },

  // ---------------- Toasts ----------------
  toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.textContent = msg;
    this.refs.toasts.appendChild(t);
    // Cap the stack — when events pile up, the oldest toasts make way.
    while (this.refs.toasts.children.length > 4) this.refs.toasts.firstChild.remove();
    setTimeout(() => {
      t.style.transition = "opacity 0.3s";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, 1800);
  },

  // ---------------- Screens ----------------
  showStart(hasSave) {
    this.refs.startScreen.classList.remove("hidden");
    this.refs.continueBtn.classList.toggle("hidden", !hasSave);
  },
  hideStart() { this.refs.startScreen.classList.add("hidden"); },

  showGameOver(state, reason) {
    const st = state.stats;
    this.refs.gameoverReason.textContent = reason;
    this.refs.gameoverStats.innerHTML = `
      <div>Max depth reached: <b>${st.maxDepth} m</b></div>
      <div>Total earned: <b>$${st.totalEarned.toLocaleString()}</b></div>
      <div>Final balance: <b>$${state.money.toLocaleString()}</b></div>
      <div>Tiles dug: <b>${(st.tilesDug || 0).toLocaleString()}</b> &nbsp;·&nbsp; Ore mined: <b>${(st.oresMined || 0).toLocaleString()}</b></div>
      <div>Time on the clock: <b>${fmtTime(st.playTime)}</b> &nbsp;·&nbsp; Best combo: <b>x${st.bestCombo || 0}</b></div>
    `;
    this.refs.gameover.classList.remove("hidden");
  },
  hideGameOver() { this.refs.gameover.classList.add("hidden"); },

  showVictory(state, ending = "free") {
    const cx = state.codex || { artifacts: [] };
    const e = ENDINGS[ending] || ENDINGS.free;
    const titleEl = el("victory-title");
    if (titleEl) titleEl.textContent = e.title;
    this.refs.victoryText.innerHTML = e.text;
    const st = state.stats;
    this.refs.victoryStats.innerHTML = `
      <div>Depth conquered: <b>${st.maxDepth} m</b></div>
      <div>Fortune amassed: <b>$${st.totalEarned.toLocaleString()}</b></div>
      <div>Relics recovered: <b>${cx.artifacts.length}/8</b></div>
      <div>Tiles dug: <b>${(st.tilesDug || 0).toLocaleString()}</b> &nbsp;·&nbsp; Ore mined: <b>${(st.oresMined || 0).toLocaleString()}</b></div>
      <div>Time on the clock: <b>${fmtTime(st.playTime)}</b> &nbsp;·&nbsp; Best combo: <b>x${st.bestCombo || 0}</b></div>`;
    this.refs.victory.classList.remove("hidden");
  },
  hideVictory() { this.refs.victory.classList.add("hidden"); },

  // ---------------- Shop modals ----------------
  openShop(state, building) {
    this.refs.modalTitle.textContent = building.name;
    this.renderShop(state, building);
    this.refs.modal.classList.remove("hidden");
  },
  closeShop() { this.refs.modal.classList.add("hidden"); },
  isShopOpen() { return !this.refs.modal.classList.contains("hidden"); },

  openCodex(state) {
    this.refs.modalTitle.textContent = "Codex";
    this.renderCodex(state, this.refs.modalBody);
    this.refs.modal.classList.remove("hidden");
  },

  renderCodex(state, body) {
    const cx = state.codex || { minerals: [], artifacts: [] };
    const catalogued = cx.minerals.filter((k) => ORE_KEYS.includes(k)).length;
    let html = `<div class="sell-summary">Minerals catalogued: <b>${catalogued}/${ORE_KEYS.length}</b> &nbsp;·&nbsp; Relics recovered: <b>${cx.artifacts.length}/${ARTIFACTS.length}</b></div>`;

    // Minerals
    html += `<div class="sell-summary" style="margin-top:8px">— Minerals —</div><div class="codex-grid">`;
    for (const key of ORE_KEYS) {
      const m = MINERALS[key];
      const found = cx.minerals.includes(key);
      html += `<div class="codex-cell ${found ? "" : "locked"}">
        <span class="swatch" style="background:${found ? m.color : "#333"}"></span>
        ${found ? m.name : "???"} <span class="codex-val">${found ? "$" + m.value.toLocaleString() : ""}</span>
      </div>`;
    }
    html += `</div>`;

    // Artifacts
    html += `<div class="sell-summary" style="margin-top:12px">— Relics —</div><div class="codex-relics">`;
    for (const a of ARTIFACTS) {
      const found = cx.artifacts.includes(a.id);
      html += `<div class="codex-relic ${found ? "" : "locked"}">
        <div class="cr-head">${found ? "✦ " + a.name : "✦ ??? — undiscovered relic"} ${found ? `<span class="codex-val">$${a.value.toLocaleString()}</span>` : ""}</div>
        ${found ? `<div class="cr-lore">${a.lore}</div>` : ""}
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  },

  // ---------------- Records / achievements ----------------
  renderRecords(ach, list, body) {
    const r = ach.records;
    const unlockedN = ach.unlockedCount();
    let html = `<div class="records-stats">
      <div><span>Deepest dig</span><b>${(r.deepest || 0).toLocaleString()} m</b></div>
      <div><span>Richest balance</span><b>$${(r.richest || 0).toLocaleString()}</b></div>
      <div><span>Best single run</span><b>$${(r.bestRun || 0).toLocaleString()}</b></div>
      <div><span>Runs started</span><b>${r.runs || 0}</b></div>
      <div><span>Pods lost</span><b>${r.deaths || 0}</b></div>
      <div><span>Achievements</span><b>${unlockedN}/${list.length}</b></div>
    </div>`;
    html += `<div class="ach-grid">`;
    for (const a of list) {
      const got = !!ach.unlocked[a.id];
      html += `<div class="ach-cell ${got ? "got" : "locked"}">
        <div class="ach-icon">${got ? a.icon : "🔒"}</div>
        <div class="ach-info"><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  },

  // ---------------- Settings / accessibility ----------------
  renderSettings(game, body) {
    const s = game.settings;
    body.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "settings-list";

    // Master volume slider
    const volRow = document.createElement("div");
    volRow.className = "set-row";
    volRow.innerHTML = `<span class="set-label">Master Volume</span>`;
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.value = Math.round(s.volume * 100);
    slider.className = "set-slider";
    const volVal = document.createElement("span"); volVal.className = "set-val"; volVal.textContent = `${Math.round(s.volume * 100)}%`;
    slider.addEventListener("input", () => {
      volVal.textContent = `${slider.value}%`;
      game.setSetting("volume", slider.value / 100);
      if (game.audio) game.audio.sfx("ui");
    });
    volRow.appendChild(slider); volRow.appendChild(volVal);
    wrap.appendChild(volRow);

    // Toggles
    const toggles = [
      { key: "shake", label: "Screen Shake", desc: "Camera shake on impacts & explosions" },
      { key: "reduceMotion", label: "Reduced Motion", desc: "Disables shake, slow-mo & cinematic letterbox" },
      { key: "colorblind", label: "Colourblind Ore Markers", desc: "Labels each ore with a 2-letter code" },
    ];
    for (const t of toggles) {
      const row = document.createElement("div");
      row.className = "set-row";
      row.innerHTML = `<span class="set-label">${t.label}<span class="set-desc">${t.desc}</span></span>`;
      const btn = document.createElement("button");
      const setBtn = () => { btn.textContent = s[t.key] ? "ON" : "OFF"; btn.className = "set-toggle " + (s[t.key] ? "on" : "off"); };
      setBtn();
      btn.addEventListener("click", () => { game.setSetting(t.key, !s[t.key]); setBtn(); });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
    body.appendChild(wrap);
  },

  // ---------------- Perk / skill tree ----------------
  renderSkills(game, body, pointsEl) {
    const s = game.state;
    const avail = game.perkPointsAvailable();
    if (pointsEl) pointsEl.innerHTML = `Perk points: <b style="color:var(--accent)">${avail}</b> available &nbsp;·&nbsp; earned from depth &amp; earnings`;
    body.innerHTML = "";
    const cols = document.createElement("div");
    cols.className = "skill-cols";
    for (const bKey of PERK_BRANCH_KEYS) {
      const branch = PERKS[bKey];
      const col = document.createElement("div");
      col.className = "skill-col";
      col.style.setProperty("--bc", branch.color);
      col.innerHTML = `<div class="skill-branch" style="color:${branch.color}">${branch.name}</div>`;
      branch.perks.forEach((perk, i) => {
        const owned = s.perks.includes(perk.id);
        const prereqMet = i === 0 || s.perks.includes(branch.perks[i - 1].id);
        const canBuy = !owned && prereqMet && avail > 0;
        const node = document.createElement("button");
        node.className = `skill-node ${owned ? "owned" : prereqMet ? "" : "locked"}`;
        node.style.setProperty("--bc", branch.color);
        node.disabled = !canBuy;
        node.innerHTML = `<div class="sk-name">${owned ? "✓ " : ""}${perk.name}</div><div class="sk-desc">${perk.desc}</div>`;
        node.addEventListener("click", () => {
          const r = game.buyPerk(perk.id);
          this.flash(r, "buy");
          if (r.ok) { this.celebrate("LEARNED!", branch.color); if (game.audio) game.audio.sfx("buy"); }
          this.renderSkills(game, body, pointsEl);
        });
        col.appendChild(node);
        if (i < branch.perks.length - 1) {
          const link = document.createElement("div");
          link.className = "skill-link" + (owned ? " on" : "");
          col.appendChild(link);
        }
      });
      cols.appendChild(col);
    }
    body.appendChild(cols);
  },

  renderShop(state, building) {
    const body = this.refs.modalBody;
    body.innerHTML = "";
    switch (building.id) {
      case "fuel":    this.renderFuel(state, body); break;
      case "sell":    this.renderSell(state, body); break;
      case "repair":  this.renderRepair(state, body); break;
      case "upgrade": this.renderUpgrades(state, body); break;
      case "save":    this.renderSave(state, body); break;
      case "mission": this.renderMissions(state, body); break;
      case "refine":  this.renderRefine(state, body); break;
      case "outpost": this.renderOutpost(state, body); break;
    }
  },

  _refresh(state, building) { this.renderShop(state, building); this.updateHUD(state); },

  // ---- Fuel ----
  renderFuel(state, body) {
    const p = state.player;
    const price = Shop.fuelPrice(state);
    const need = p.maxFuel - p.fuel;
    const fullCost = Math.ceil(need * price);
    const subsidy = state.base && state.base.fuelSubsidy;
    body.innerHTML = `
      <div class="sell-summary">
        Fuel: <b>${Math.ceil(p.fuel)} / ${p.maxFuel}</b> &nbsp;·&nbsp; Price: $${price.toFixed(2)}/unit${subsidy ? ' <span style="color:#4ce78f">(contract −30%)</span>' : ""}
      </div>`;
    const row = this.shopRow(
      "Fill Tank", `Refill to full (${Math.ceil(need)} units)`,
      need <= 0 ? "FULL" : `$${fullCost.toLocaleString()}`,
      need > 0 && state.money > 0,
      () => { this.flash(Shop.buyFullFuel(state)); this._refresh(state, { id: "fuel" }); }
    );
    body.appendChild(row);
    const row10 = this.shopRow(
      "Buy 10 units", "Top up a little",
      `$${Math.ceil(10 * price)}`,
      need > 0 && state.money >= price,
      () => { this.flash(Shop.buyFuel(state, 10)); this._refresh(state, { id: "fuel" }); }
    );
    body.appendChild(row10);
  },

  // ---- Sell ----
  renderSell(state, body) {
    const p = state.player;
    if (p.cargoCount === 0) {
      body.innerHTML = `<div class="empty-note">Your cargo bay is empty. Go dig up some minerals!</div>`;
      return;
    }
    const market = state.market;
    // Displayed prices include the same difficulty/mutator/perk multiplier the
    // sale itself applies — what you see is what you're paid.
    const sellMul = state.sellMul != null ? state.sellMul : 1;
    const locked = state.locked || (state.locked = {});
    body.innerHTML = "";
    const list = document.createElement("div");
    list.className = "mineral-list";
    let total = 0, sellable = 0, anyLocked = false;
    for (const key in p.cargo) {
      const count = p.cargo[key];
      if (!count) continue;
      const m = MINERALS[key];
      const unit = Math.round((market ? market.unitPrice(key) : m.value) * sellMul);
      const v = count * unit;
      const isLocked = !!locked[key];
      if (isLocked) anyLocked = true;
      else { total += v; sellable += count; }
      const trend = market ? market.trend(key) : "flat";
      const dev = market ? market.deviation(key) : 0;
      const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "▬";
      const tcolor = trend === "up" ? "#4ce78f" : trend === "down" ? "#e76a6a" : "#8a8a9a";
      const devStr = `${dev > 0 ? "+" : ""}${dev}%`;
      const row = document.createElement("div");
      row.className = "ml-row" + (isLocked ? " ml-locked" : "");
      row.innerHTML = `<span><span class="swatch" style="background:${m.color}"></span>${count}x ${m.name} <span style="opacity:.6">@ $${unit.toLocaleString()}</span></span><span><span style="color:${tcolor};font-size:.85em">${arrow} ${devStr}</span> &nbsp; $${v.toLocaleString()}</span>`;
      // 🔒 reserve this ore for refinery recipes (skipped by Sell Everything & auto-sell)
      const lockBtn = document.createElement("button");
      lockBtn.className = "mini-btn" + (isLocked ? " on" : "");
      lockBtn.textContent = isLocked ? "🔒" : "🔓";
      lockBtn.title = isLocked
        ? "Locked — kept by Sell Everything & auto-sell. Click to unlock."
        : "Lock — reserve for refinery recipes";
      lockBtn.addEventListener("click", () => {
        if (locked[key]) delete locked[key]; else locked[key] = true;
        if (this.game && this.game.audio) this.game.audio.sfx("ui");
        this._refresh(state, { id: "sell" });
      });
      const sellBtn = document.createElement("button");
      sellBtn.className = "mini-btn sell";
      sellBtn.textContent = "SELL";
      sellBtn.title = `Sell all ${m.name}`;
      sellBtn.addEventListener("click", () => {
        this.flash(Shop.sellStack(state, key), "sell");
        this._refresh(state, { id: "sell" });
      });
      row.appendChild(lockBtn);
      row.appendChild(sellBtn);
      list.appendChild(row);
    }
    body.appendChild(list);
    const sum = document.createElement("div");
    sum.className = "sell-summary";
    sum.innerHTML = `Market total: <span class="sell-total">$${total.toLocaleString()}</span>` +
      (anyLocked ? ` <span style="opacity:.6">(🔒 locked cargo excluded)</span>` : "");
    body.appendChild(sum);
    const row = this.shopRow(
      "Sell Everything", `${sellable} unlocked item${sellable === 1 ? "" : "s"} in cargo`,
      `$${total.toLocaleString()}`, sellable > 0,
      () => { this.doSell(state); this._refresh(state, { id: "sell" }); },
      false, "SELL"
    );
    body.appendChild(row);
  },

  // ---- Refinery ----
  renderRefine(state, body) {
    const p = state.player;
    const market = state.market;
    const inStr = (recipe) =>
      Object.entries(recipe.in).map(([k, n]) => {
        const have = p.cargo[k] || 0;
        const short = have < n;
        return `<span style="color:${short ? "#e76a6a" : "#cfcfda"}">${have}/${n} ${MINERALS[k].name}</span>`;
      }).join(" + ");

    body.innerHTML = `<div class="sell-summary">Convert raw ore into high-value alloys (and free up cargo), or craft gear from minerals.</div>
      <div class="sell-summary" style="margin-top:6px">— Alloys —</div>`;

    for (const r of RECIPES.alloys) {
      const out = MINERALS[r.out];
      const have = Shop.canRefine(p, r);
      const unit = market ? market.unitPrice(r.out) : out.value;
      const owned = p.cargo[r.out] || 0;
      const row = this.shopRow(
        `<span class="swatch" style="background:${out.color}"></span>${out.name}${owned ? ` (×${owned})` : ""}`,
        `${inStr(r)} → 1`,
        `$${unit.toLocaleString()}`, have,
        () => { this.flash(Shop.refine(state, r.id)); this._refresh(state, { id: "refine" }); },
        false, "REFINE"
      );
      body.appendChild(row);
    }

    const div = document.createElement("div");
    div.innerHTML = `<div class="sell-summary" style="margin-top:12px">— Craft Gear —</div>`;
    body.appendChild(div);
    for (const r of RECIPES.craft) {
      const have = Shop.canRefine(p, r);
      const owned = r.out === "dynamite" ? p.dynamite : p.teleporters;
      const row = this.shopRow(
        `${r.name} (have ${owned})`,
        `${inStr(r)} → 1`,
        "", have,
        () => { this.flash(Shop.refine(state, r.id)); this._refresh(state, { id: "refine" }); },
        false, "CRAFT"
      );
      body.appendChild(row);
    }
  },

  // ---- Outpost (base upgrades + express elevator) ----
  renderOutpost(state, body) {
    const base = state.base || (state.base = {});
    body.innerHTML = `<div class="sell-summary">Permanent improvements to your surface base.</div>`;
    for (const key of BASE_UPGRADE_KEYS) {
      const def = BASE_UPGRADES[key];
      const owned = !!base[key];
      const row = this.shopRow(
        `${def.label}${owned ? " ✓" : ""}`, def.desc,
        owned ? "OWNED" : `$${def.cost.toLocaleString()}`,
        !owned && state.money >= def.cost,
        () => {
          const r = Shop.buyBaseUpgrade(state, key);
          this.flash(r, "buy");
          if (r.ok) this.celebrate("INSTALLED!", "#3ad0c0");
          this._refresh(state, { id: "outpost" });
        },
        false, owned ? "✓ OWNED" : "BUY"
      );
      body.appendChild(row);
    }

    // Express Elevator destinations
    const head = document.createElement("div");
    head.innerHTML = `<div class="sell-summary" style="margin-top:12px">— Express Elevator —</div>`;
    body.appendChild(head);
    if (!base.elevator) {
      const note = document.createElement("div");
      note.innerHTML = `<div class="empty-note">Install the Express Elevator above to fast-travel to biomes you've reached.</div>`;
      body.appendChild(note);
      return;
    }
    const maxRow = (state.stats.maxDepth || 0) / 2;
    body.appendChild(this.shopRow(
      "Surface Base", "Return to the surface", "", true,
      () => { this.game.elevatorTo(-1); }, false, "GO"
    ));
    STRATA.forEach((st, i) => {
      if (i === 0 || st.start > maxRow) return; // only biomes you've reached
      body.appendChild(this.shopRow(
        st.name, `Descend to ~${(st.start * 2).toLocaleString()}m deep`, "", true,
        () => { this.game.elevatorTo(i); }, false, "GO"
      ));
    });

    // Launch Pad — unlocks only after reaching space the hard way.
    const lp = document.createElement("div");
    lp.innerHTML = `<div class="sell-summary" style="margin-top:12px">— 🚀 Launch Pad —</div>`;
    body.appendChild(lp);
    if (!state.reachedSpace) {
      const note = document.createElement("div");
      note.innerHTML = `<div class="empty-note">Locked. Rocket up to space under your own thrust at least once to commission the launch pad.</div>`;
      body.appendChild(note);
    } else {
      body.appendChild(this.shopRow(
        "Asteroid Belt", "Blast straight up to the asteroid belt", "", true,
        () => { this.game.launchToOrbit(); }, false, "LAUNCH"
      ));
    }
  },

  // ---- Repair ----
  renderRepair(state, body) {
    const p = state.player;
    const need = p.maxHull - p.hull;
    const unit = repairUnitPrice(p.maxHull);
    const fullCost = Math.ceil(need * unit);
    body.innerHTML = `
      <div class="sell-summary">
        Hull: <b>${Math.ceil(p.hull)} / ${p.maxHull}</b> &nbsp;·&nbsp; Price: $${unit.toLocaleString(undefined, { maximumFractionDigits: 2 })}/point
      </div>`;
    const row = this.shopRow(
      "Full Repair", need <= 0 ? "Hull already pristine" : `Restore ${Math.ceil(need)} hull`,
      need <= 0 ? "FULL" : `$${fullCost.toLocaleString()}`,
      need > 0 && state.money > 0,
      () => { this.flash(Shop.repairFull(state)); this._refresh(state, { id: "repair" }); },
      false, "REPAIR"
    );
    body.appendChild(row);
  },

  // ---- Upgrades ----
  renderUpgrades(state, body) {
    const p = state.player;
    const bought = state.upgradesPurchased || 0;
    // Header explains the escalating market.
    if (bought > 0) {
      const mult = Math.pow(UPGRADE_ESCALATION, bought);
      const head = document.createElement("div");
      head.innerHTML = `<div class="sell-summary">${bought} upgrade${bought === 1 ? "" : "s"} installed · all prices ×${mult.toFixed(2)}</div>`;
      body.appendChild(head);
    }
    // Ship part upgrades
    for (const key of UPGRADE_KEYS) {
      const def = UPGRADES[key];
      const cur = p.tier[key];
      const isMax = upgradeIsMax(key, cur);
      const curTier = upgradeTier(key, cur);
      const nextTier = isMax ? null : upgradeTier(key, cur + 1);
      const cost = isMax ? 0 : upgradeCost(key, cur + 1, bought);
      const desc = isMax
        ? `${def.desc} · MAXED (${curTier.name})`
        : `${def.desc} · ${curTier.name} → ${nextTier.name}`;
      const price = isMax ? "MAX" : `$${cost.toLocaleString()}`;
      const canBuy = !isMax && state.money >= cost;
      const row = this.shopRow(
        `${def.label} (Lv.${cur + 1}${isMax ? "" : "→" + (cur + 2)})`, desc, price, canBuy,
        () => {
          const res = Shop.buyUpgrade(state, key);
          this.flash(res, "buy");
          if (res.ok) { this.celebrate("UPGRADED!", "#4ce78f"); if (this.game.flagUpgrade) this.game.flagUpgrade(); }
          this._refresh(state, { id: "upgrade" });
        },
        isMax
      );
      body.appendChild(row);
    }
    // Consumables
    const div = document.createElement("div");
    div.innerHTML = `<div class="sell-summary" style="margin-top:14px">— Consumables —</div>`;
    body.appendChild(div);
    for (const key in CONSUMABLES) {
      const def = CONSUMABLES[key];
      const owned = key === "dynamite" ? p.dynamite : p.teleporters;
      const cost = consumableCost(key, owned); // climbs with how many you hold
      const row = this.shopRow(
        `${def.name} (have ${owned})`, def.desc, `$${cost.toLocaleString()}`, state.money >= cost,
        () => { this.flash(Shop.buyConsumable(state, key)); this._refresh(state, { id: "upgrade" }); }
      );
      body.appendChild(row);
    }
  },

  // ---- Mission Board ----
  renderMissions(state, body) {
    const mm = state.missions;
    const m = mm.current;

    // Current campaign objective
    let html = `<div class="sell-summary">Campaign · Mission ${Math.min(mm.index + 1, CAMPAIGN.length)} of ${CAMPAIGN.length}</div>`;
    if (m) {
      const p = mm.progressOf(m, state);
      html += `
        <div class="mission-card">
          <div class="name">${m.title}</div>
          <div class="desc">${m.brief}</div>
          <div class="obj-bar" style="margin-top:8px"><div class="obj-fill" style="width:${Math.min(100,(p.cur/p.max)*100)}%"></div></div>
          <div class="desc" style="margin-top:4px">${p.text} &nbsp;·&nbsp; Reward: <span style="color:var(--good)">$${m.reward.toLocaleString()}</span></div>
        </div>`;
    } else {
      html += `<div class="mission-card"><div class="name">Campaign Complete</div><div class="desc">${mm.endgameUnlocked ? "The Motherlode core lies at the very bottom. Descend and end this." : "You have done all that was asked."}</div></div>`;
    }
    body.innerHTML = html;

    // Side contract
    const sideWrap = document.createElement("div");
    sideWrap.innerHTML = `<div class="sell-summary" style="margin-top:12px">— Side Contract —</div>`;
    body.appendChild(sideWrap);
    if (mm.side) {
      const s = mm.side;
      const row = this.shopRow(
        `Deliver ${s.count}x ${MINERALS[s.mineral].name}`,
        `Progress ${s.progress}/${s.count} · Reward $${s.reward.toLocaleString()}`,
        "ABANDON", true,
        () => { mm.abandonSide(); this._refresh(state, { id: "mission" }); }
      );
      row.querySelector(".buy-btn").textContent = "DROP";
      body.appendChild(row);
    } else {
      const row = this.shopRow(
        "Take a Contract", "Accept a randomly offered delivery job for bonus cash", "ACCEPT", true,
        () => { mm.offerSide(); this._refresh(state, { id: "mission" }); }
      );
      row.querySelector(".buy-btn").textContent = "TAKE";
      body.appendChild(row);
    }

    // Lore log
    if (mm.loreLog.length) {
      const lore = document.createElement("div");
      let lh = `<div class="sell-summary" style="margin-top:12px">— Recovered Transmissions —</div><div class="lore-log">`;
      for (const e of mm.loreLog) lh += `<div class="lore-entry"><b>${e.title}</b><br>${e.text}</div>`;
      lh += `</div>`;
      lore.innerHTML = lh;
      body.appendChild(lore);
    }
    UI.updateObjective(state);
  },

  // ---- Save ----
  renderSave(state, body) {
    body.innerHTML = `<div class="sell-summary">Save your progress so you can continue later.</div>`;
    const row = this.shopRow(
      "Save Game", "Store current progress in this browser", "FREE", true,
      () => { this.game.save(); this.flash({ ok: true, msg: "Game saved!" }); }
    );
    body.appendChild(row);
    const row2 = this.shopRow(
      "Save & Quit to Menu", "Save and return to the title screen", "", true,
      () => { this.game.save(); this.game.quitToMenu(); }
    );
    body.appendChild(row2);
  },

  // Generic shop row builder. `btnText` overrides the default action label.
  shopRow(name, desc, price, enabled, onClick, isMax = false, btnText = null) {
    const row = document.createElement("div");
    row.className = "shop-row";
    row.innerHTML = `
      <div class="info">
        <div class="name">${name}</div>
        <div class="desc">${desc}</div>
      </div>
      <div class="price ${enabled || isMax ? "" : "cant"}">${price}</div>
    `;
    const btn = document.createElement("button");
    btn.className = "buy-btn" + (isMax ? " max" : "");
    btn.textContent = isMax ? "MAX" : (btnText || (price === "FREE" || price === "" ? "OK" : "BUY"));
    btn.disabled = !enabled;
    btn.addEventListener("click", onClick);
    row.appendChild(btn);
    return row;
  },

  flash(result, sound) {
    if (!result) return;
    this.toast(result.msg, result.ok ? "good" : "bad");
    const a = this.game && this.game.audio;
    if (a) a.sfx(result.ok ? (sound || "buy") : "ui");
  },

  // Big animated reward popup over the shop
  celebrate(text, color = "#6fdc6f") {
    const el = this.refs.celebrate || (this.refs.celebrate = document.getElementById("celebrate"));
    el.textContent = text;
    el.style.color = color;
    el.classList.remove("hidden");
    el.style.animation = "none";
    void el.offsetWidth; // reflow to restart animation
    el.style.animation = "";
    clearTimeout(this._celebrateT);
    this._celebrateT = setTimeout(() => el.classList.add("hidden"), 950);
  },

  // Sell with a satisfying ka-ching that scales with the haul
  doSell(state) {
    const res = Shop.sellAll(state);
    if (res.ok) {
      this.celebrate(`+$${res.total.toLocaleString()}`);
      const a = this.game && this.game.audio;
      if (a) {
        const stacks = Math.min(6, 1 + Math.floor(Math.log10(Math.max(1, res.total))));
        for (let i = 0; i < stacks; i++) setTimeout(() => a.sfx("sell"), i * 70);
      }
      this.toast(res.msg, "good");
    } else {
      this.flash(res);
    }
    return res;
  },
};
