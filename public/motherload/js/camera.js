// ============================================================
//  Camera — follows the player, clamped to world bounds
// ============================================================
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, TILE, SKY_CEILING_ROWS } from "./config.js?v=51";

// How far above the world the camera may rise — a little beyond the pod's
// open-sky ceiling so it stays centred even at the very top.
const SKY_MIN_Y = -((SKY_CEILING_ROWS + 25) * TILE);

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    // current viewport size in world pixels (updated on resize)
    this.viewW = VIEW_W;
    this.viewH = VIEW_H;
  }

  follow(target, instant = false, dt = 1 / 60) {
    const maxX = Math.max(0, WORLD_W - this.viewW);
    const maxY = Math.max(0, WORLD_H - this.viewH);
    // Frame-rate-independent exponential smoothing. `rem` = fraction of the gap
    // still left one second later (smaller = snappier). Driving it off dt keeps
    // the feel identical regardless of frame timing, killing timing stutter.
    const ease = (rem) => (instant ? 1 : 1 - Math.pow(rem, dt));

    // Lookahead: bias the camera toward travel direction. Eased gently so
    // velocity spikes (e.g. each tile drop while drilling) don't jerk it.
    const laX = clamp((target.vx || 0) * 0.32, -120, 120);
    const laY = clamp((target.vy || 0) * 0.16, -80, 120);
    const laK = ease(0.006);
    this._laX = (this._laX || 0) + (laX - (this._laX || 0)) * laK;
    this._laY = (this._laY || 0) + (laY - (this._laY || 0)) * laK;

    const tx = clamp(target.centerX + this._laX - this.viewW / 2, 0, maxX);
    // Lower bound is the open sky (negative) so the camera follows the pod up.
    const ty = clamp(target.centerY + this._laY - this.viewH / 2, SKY_MIN_Y, maxY);
    if (instant) { this.x = tx; this.y = ty; return; }
    // Horizontal stays snappy; vertical lags a touch more so it glides smoothly
    // over the tile-by-tile drops when drilling straight down.
    this.x += (tx - this.x) * ease(0.000002);
    this.y += (ty - this.y) * ease(0.0015);
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
