// ============================================================
//  Input — keyboard state tracking
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered, cleared each frame after read
    this.padKeys = new Set();   // held directions coming from a gamepad
    this._onKeyDown = (e) => this.handleDown(e);
    this._onKeyUp = (e) => this.handleUp(e);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  // Gamepad integration: set held directional keys, and pulse one-shot actions
  setPad(state) {
    this.padKeys.clear();
    for (const k in state) if (state[k]) this.padKeys.add(k);
  }
  pulse(k) { this.pressed.add(k); }

  handleDown(e) {
    const k = this.normalize(e);
    if (k == null) return;
    // Prevent page scroll / focus-cycling for game keys
    if (["up", "down", "left", "right", "space", "cargo"].includes(k)) e.preventDefault();
    if (!this.keys.has(k)) this.pressed.add(k);
    this.keys.add(k);
  }

  handleUp(e) {
    const k = this.normalize(e);
    if (k == null) return;
    this.keys.delete(k);
  }

  normalize(e) {
    switch (e.code) {
      case "ArrowUp": case "KeyW": return "up";
      case "ArrowDown": case "KeyS": return "down";
      case "ArrowLeft": case "KeyA": return "left";
      case "ArrowRight": case "KeyD": return "right";
      case "Space": return "space";
      case "Enter": return "enter";
      case "KeyE": return "interact";
      case "Escape": return "escape";
      case "KeyB": return "dynamite";
      case "KeyT": return "teleport";
      case "KeyR": return "rescue";
      case "KeyC": return "codex";
      case "KeyM": return "map";
      case "KeyP": return "mute";
      case "Tab": return "cargo";
      default: return null;
    }
  }

  down(k) { return this.keys.has(k) || this.padKeys.has(k); }

  // True only on the frame the key went down
  justPressed(k) { return this.pressed.has(k); }

  // Call at the end of each frame
  endFrame() { this.pressed.clear(); }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
