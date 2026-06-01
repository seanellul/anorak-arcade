// ============================================================
//  Weather — surface atmosphere: clear skies, overcast, Mars
//  dust storms and night meteor showers. Drives a sky tint, a
//  blown-particle field and a gentle wind that nudges the pod
//  while it's near the surface. Purely surface-side; underground
//  is unaffected.
// ============================================================

// Small self-contained PRNG (mulberry32) so a seed gives a
// reproducible weather sequence per world.
function rngFrom(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// type -> behaviour. skyDim darkens daylight; tint is an additive
// haze colour over the sky; wind is the peak horizontal force.
export const WEATHER_TYPES = {
  // wind is peak horizontal force (px/s^2). The pod's drag is a constant
  // ~420 px/s^2 decel, so only the dust storm (above that) actually shoves the
  // pod; cloudy/meteor winds are gentle enough to read as visual-only.
  clear:  { label: "Clear skies",   weight: 42, skyDim: 0.0,  tint: null,           wind: 8 },
  cloudy: { label: "Overcast",      weight: 26, skyDim: 0.34, tint: [78, 66, 84],   wind: 70 },
  dust:   { label: "Dust storm",    weight: 22, skyDim: 0.52, tint: [156, 92, 54],  wind: 520 },
  meteor: { label: "Meteor shower", weight: 10, skyDim: 0.08, tint: [40, 30, 64],   wind: 18 },
};

export class WeatherManager {
  constructor(seed = 1) {
    this.rng = rngFrom((seed | 0) || 1);
    this.type = "clear";
    this.def = WEATHER_TYPES.clear;
    this.t = 0;
    this.duration = 16 + this.rng() * 14;
    this.intensity = 0;     // eased 0..1 trapezoid over the spell
    this.wind = 0;          // eased current horizontal force (signed)
    this.windDir = this.rng() < 0.5 ? -1 : 1;
    this.onChange = null;   // (def, type) => {}  (game wires a toast)
  }

  _pick() {
    // Weighted choice, biased to not immediately repeat the same spell.
    let total = 0;
    for (const k in WEATHER_TYPES) total += k === this.type ? WEATHER_TYPES[k].weight * 0.3 : WEATHER_TYPES[k].weight;
    let roll = this.rng() * total;
    for (const k in WEATHER_TYPES) {
      const w = k === this.type ? WEATHER_TYPES[k].weight * 0.3 : WEATHER_TYPES[k].weight;
      if ((roll -= w) <= 0) return k;
    }
    return "clear";
  }

  // Force a specific spell (used by tests / scripted events).
  set(type, intensity = 1) {
    if (!WEATHER_TYPES[type]) return;
    this.type = type;
    this.def = WEATHER_TYPES[type];
    this.intensity = intensity;
    this.t = (this.duration || 30) * 0.5;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.duration) {
      const prev = this.type;
      this.t = 0;
      this.type = this._pick();
      this.def = WEATHER_TYPES[this.type];
      this.windDir = this.rng() < 0.5 ? -1 : 1;
      this.duration = (this.type === "clear" ? 14 + this.rng() * 18 : 24 + this.rng() * 30);
      if (this.type !== prev && this.type !== "clear" && this.onChange) this.onChange(this.def, this.type);
    }
    // Trapezoid intensity: ramp in, hold, ramp out near the end of the spell.
    const ramp = 5;
    let target;
    if (this.t < ramp) target = this.t / ramp;
    else if (this.t > this.duration - ramp) target = Math.max(0, (this.duration - this.t) / ramp);
    else target = 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 4);
    const windTarget = this.def.wind * this.windDir * this.intensity;
    this.wind += (windTarget - this.wind) * Math.min(1, dt * 2);
  }

  // Horizontal force (px/s^2) applied to the pod while near the surface.
  windForce() { return this.wind; }

  // Daylight dimming factor (0..1) so storms darken the sky.
  dim() { return 1 - this.def.skyDim * this.intensity; }

  // Additive sky haze over the sky region.
  drawSkyTint(ctx, VW, VH, horizon) {
    const a = this.intensity;
    if (a < 0.02 || !this.def.tint) return;
    const [r, g, b] = this.def.tint;
    const strength = (this.type === "dust" ? 0.5 : this.type === "cloudy" ? 0.4 : 0.28) * a;
    ctx.fillStyle = `rgba(${r},${g},${b},${strength.toFixed(3)})`;
    ctx.fillRect(-30, -30, VW + 60, Math.max(horizon, 0) + 60);
  }

  // Blown particle field. Drawn over the surface scene; fades below the
  // horizon so it reads as weather in the sky/over the base, not underground.
  drawParticles(ctx, t, VW, VH, horizon) {
    const a = this.intensity;
    if (a < 0.04) return;
    if (this.type === "dust") this._drawDust(ctx, t, VW, VH, horizon, a);
    else if (this.type === "cloudy") this._drawDust(ctx, t, VW, VH, horizon, a * 0.25);
    else if (this.type === "meteor") this._drawMeteors(ctx, t, VW, VH, horizon, a);
  }

  _drawDust(ctx, t, VW, VH, horizon, a) {
    // Streaks of sand blown horizontally by the wind; wrap-field so they tile.
    const n = Math.round(130 * a);
    const speed = 260 + Math.abs(this.wind) * 2.6;
    const dir = this.windDir || 1;
    const FW = VW + 280, FH = VH + 80;
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const baseY = (i * 137.5) % FH - 40;
      const fade = baseY < horizon ? 1 : Math.max(0, 1 - (baseY - horizon) / 260);
      if (fade <= 0.02) continue;
      const drift = (i * 53.1) % 90;
      const x = ((i * 211.7 + t * (speed + drift) * dir) % FW + FW) % FW - 140;
      const len = 14 + (i % 6) * 7;
      const al = (0.08 + 0.22 * a) * fade;
      const c = 210 - (i % 4) * 20;
      ctx.strokeStyle = `rgba(${c},${(c * 0.62) | 0},${(c * 0.4) | 0},${al.toFixed(3)})`;
      ctx.lineWidth = 1 + (i % 3 === 0 ? 1.2 : 0);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + len * dir, baseY + 2.5);
      ctx.stroke();
    }
  }

  _drawMeteors(ctx, t, VW, VH, horizon, a) {
    ctx.lineCap = "round";
    const count = 7;
    for (let i = 0; i < count; i++) {
      // Each meteor recurs on its own period; phase 0..1 sweeps it across.
      const period = 2.6 + (i % 4) * 1.3;
      const phase = ((t / period) + i * 0.137) % 1;
      if (phase > 0.5) continue; // visible only on the first half of its cycle
      const p = phase / 0.5;
      const startX = ((i * 311.3) % (VW + 200)) - 100;
      const x = startX + p * 260;
      const y = (i * 97.7) % Math.max(60, horizon * 0.85) + p * 200;
      const len = 26 + (i % 3) * 12;
      const al = a * (1 - p) * 0.9;
      const grad = ctx.createLinearGradient(x, y, x - len, y - len * 0.7);
      grad.addColorStop(0, `rgba(255,240,210,${al.toFixed(3)})`);
      grad.addColorStop(1, "rgba(255,180,120,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y - len * 0.7);
      ctx.stroke();
    }
  }
}
