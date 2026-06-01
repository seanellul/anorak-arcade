// ============================================================
//  NavManager — keyboard & gamepad navigation for all menus,
//  plus gamepad control during gameplay.
// ============================================================

// Overlays that can be navigated, in top-most-first priority order.
const OVERLAY_IDS = [
  "howto-screen", "about-screen",
  "garage-screen", "records-screen", "settings-screen", "skills-screen", "mutators-screen", "modal", "pause-screen",
  "ending-choice", "gameover-screen", "victory-screen", "start-screen",
];

export class NavManager {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.lastContainer = null;
    this.gp = {}; // previous gamepad button edge states
    window.addEventListener("keydown", (e) => this.onKey(e), true); // capture phase
  }

  activeContainer() {
    for (const id of OVERLAY_IDS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains("hidden") && el.offsetParent !== null) return el;
    }
    return null;
  }

  items(container) {
    return [...container.querySelectorAll("button, .skin-card")]
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }

  // Where the highlight starts when a menu opens: the element marked
  // data-nav-default (e.g. START MINING) rather than the first button,
  // so opening a screen doesn't land the cursor on a difficulty toggle.
  defaultIndex(c) {
    if (!c) return 0;
    const items = this.items(c);
    const di = items.findIndex((el) => el.hasAttribute("data-nav-default"));
    return di >= 0 ? di : 0;
  }

  // Called every frame: keep the highlight in sync, poll the gamepad.
  update() {
    const c = this.activeContainer();
    if (c !== this.lastContainer) {
      if (this.lastContainer) this.clearHighlight(this.lastContainer);
      this.index = this.defaultIndex(c);
      this.lastContainer = c;
    }
    if (c) this.highlight(c);
    this.pollGamepad(!!c);
  }

  clearHighlight(c) {
    c.querySelectorAll(".nav-selected").forEach((el) => el.classList.remove("nav-selected"));
  }

  highlight(c) {
    const items = this.items(c);
    if (!items.length) return;
    this.index = Math.max(0, Math.min(this.index, items.length - 1));
    items.forEach((el, i) => el.classList.toggle("nav-selected", i === this.index));
    const target = items[this.index];
    if (target && document.activeElement !== target) {
      try { target.focus({ preventScroll: true }); } catch {}
    }
  }

  move(delta) {
    const c = this.activeContainer();
    if (!c) return;
    const items = this.items(c);
    if (!items.length) return;
    this.index = (this.index + delta + items.length) % items.length;
    this.highlight(c);
    if (this.game.audio) this.game.audio.sfx("ui");
  }

  activate() {
    const c = this.activeContainer();
    if (!c) return;
    const items = this.items(c);
    const el = items[Math.min(this.index, items.length - 1)];
    if (el) el.click();
    // The view may re-render; re-sync shortly after.
    setTimeout(() => { const nc = this.activeContainer(); if (nc) this.highlight(nc); }, 0);
  }

  back() {
    const c = this.activeContainer();
    if (!c) return;
    const close = c.querySelector("#modal-close, #garage-close, #records-close, #settings-close, #skills-close, #mutators-close, #resume-btn");
    if (close) close.click();
  }

  onKey(e) {
    if (!this.activeContainer()) return; // gameplay — let the game's Input handle it
    // Let text fields (e.g. the seed input) receive all keys normally.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const code = e.code;
    const next = ["ArrowDown", "KeyS", "ArrowRight", "KeyD"].includes(code);
    const prev = ["ArrowUp", "KeyW", "ArrowLeft", "KeyA"].includes(code);
    const act = ["Enter", "KeyE", "Space"].includes(code);
    const back = code === "Escape";
    if (!(next || prev || act || back)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // keep these keys away from gameplay Input
    if (next) this.move(1);
    else if (prev) this.move(-1);
    else if (act) this.activate();
    else if (back) this.back();
  }

  // ---------------- gamepad ----------------
  pollGamepad(menuOpen) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p) { gp = p; break; }
    if (!gp) { if (this.game.input) this.game.input.setPad({}); return; }

    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dir = {
      up: b(12) || ay < -0.45,
      down: b(13) || ay > 0.45,
      left: b(14) || ax < -0.45,
      right: b(15) || ax > 0.45,
    };
    const a = b(0), bb = b(1), x = b(2), y = b(3), start = b(9);
    const edge = (name, val) => { const was = this.gp[name]; this.gp[name] = val; return val && !was; };

    if (menuOpen) {
      this.game.input.setPad({}); // no movement while in menus
      if (edge("up", dir.up || dir.left)) this.move(-1);
      if (edge("dn", dir.down || dir.right)) this.move(1);
      if (edge("a", a)) this.activate();
      if (edge("b", bb)) this.back();
      edge("start", start);
    } else {
      // Gameplay: d-pad / left stick drive the pod, face buttons = actions
      this.game.input.setPad({ up: dir.up, down: dir.down, left: dir.left, right: dir.right });
      if (edge("a", a)) this.game.input.pulse("interact");
      if (edge("x", x)) this.game.input.pulse("dynamite");
      if (edge("y", y)) this.game.input.pulse("teleport");
      if (edge("b", bb)) this.game.input.pulse("rescue");
      if (edge("start", start)) this.game.input.pulse("escape");
      this.gp.up = this.gp.dn = false; // reset menu edges
    }
  }
}
