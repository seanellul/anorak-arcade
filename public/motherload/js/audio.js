// ============================================================
//  Audio — Web Audio API synthesizer (no asset files)
// ============================================================

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.4;
    this._drillOn = false;
    this._thrustOn = false;
    this._noiseBuf = null;
    this._lastAlarm = 0;
  }

  // Must be called from a user gesture (e.g. the START button).
  init() {
    if (this.ctx) { this.ctx.resume && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
    this._noiseBuf = this._makeNoise();
    this._buildLoops();
    this._buildMusic();
  }

  setEnabled(b) {
    this.enabled = b;
    if (this.master) this.master.gain.setTargetAtTime(b ? this.volume : 0, this.ctx.currentTime, 0.05);
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- looping engines (drill + thrust) ----------
  _buildLoops() {
    const ctx = this.ctx;

    // Drill: gritty low sawtooth + bandpassed noise
    const drillGain = ctx.createGain(); drillGain.gain.value = 0; drillGain.connect(this.master);
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 65;
    const og = ctx.createGain(); og.gain.value = 0.4; osc.connect(og); og.connect(drillGain);
    const noise = ctx.createBufferSource(); noise.buffer = this._noiseBuf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.5; noise.connect(bp); bp.connect(ng); ng.connect(drillGain);
    // wobble LFO
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
    const lfoG = ctx.createGain(); lfoG.gain.value = 14; lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.start(); noise.start(); lfo.start();
    this._drill = { gain: drillGain };

    // Thrust: filtered noise whoosh
    const thrGain = ctx.createGain(); thrGain.gain.value = 0; thrGain.connect(this.master);
    const tnoise = ctx.createBufferSource(); tnoise.buffer = this._noiseBuf; tnoise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
    tnoise.connect(lp); lp.connect(thrGain); tnoise.start();
    this._thrust = { gain: thrGain };
  }

  setDrill(on) {
    if (!this.ctx || !this._drill) return;
    if (on === this._drillOn) return;
    this._drillOn = on;
    this._drill.gain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.03);
  }
  setThrust(on) {
    if (!this.ctx || !this._thrust) return;
    if (on === this._thrustOn) return;
    this._thrustOn = on;
    this._thrust.gain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.04);
  }

  // ---------- biome-reactive music ----------
  // Each biome owns a soft consonant chord-pad. A shared "bus" gain swells the
  // music in with depth (silent near the surface); setBiome crossfades between
  // pads so the score morphs as you descend. Sine triads keep it musical, not
  // a beating hum.
  _buildMusic() {
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.master);
    this._padBus = bus;
    this._pads = {};
    const CHORDS = {
      "Clay Beds":       [110.0, 164.81, 220.0],   // A minor-ish, mellow
      "Rocky Mantle":    [98.0, 146.83, 196.0],    // G, darker
      "Crystal Caverns": [130.81, 196.0, 261.63],  // C major, bright
      "Magma Fields":    [82.41, 110.0, 155.56],   // E + tense tritone
      "Frozen Deep":     [146.83, 220.0, 293.66],  // D, cold & airy
      "The Motherlode":  [65.41, 98.0, 130.81],    // low C, ominous
    };
    for (const name in CHORDS) {
      const pg = ctx.createGain(); pg.gain.value = 0; pg.connect(bus);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.connect(pg);
      for (const f of CHORDS[name]) {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        o.detune.value = (Math.random() * 8 - 4);
        const og = ctx.createGain(); og.gain.value = 0.33;
        o.connect(og); og.connect(lp); o.start();
      }
      this._pads[name] = pg;
    }
    this._curBiome = null;
  }

  // Depth drives the overall music volume (swells in past ~200m).
  setDepth(meters) {
    if (!this.ctx || !this._padBus) return;
    const t = Math.max(0, Math.min(1, (meters - 200) / 800));
    this._padBus.gain.setTargetAtTime(0.055 * t, this.ctx.currentTime, 0.8);
  }

  // Crossfade to the current biome's pad (no-op if unchanged).
  setBiome(name) {
    if (!this.ctx || !this._pads || name === this._curBiome) return;
    this._curBiome = name;
    for (const k in this._pads) {
      this._pads[k].gain.setTargetAtTime(k === name ? 1 : 0, this.ctx.currentTime, 1.4);
    }
  }

  // Occasional biome-flavoured ambient one-shots (very quiet).
  ambientTick(dt, name) {
    if (!this.ctx) return;
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT > 0) return;
    this._ambT = 4 + Math.random() * 6;
    const t = this.ctx.currentTime;
    switch (name) {
      case "Clay Beds":
      case "Crystal Caverns": // water drip
        this._tone(820 + Math.random() * 500, "sine", t, 0.004, 0.13, 0.05, 280); break;
      case "Magma Fields":
      case "The Motherlode": // lava bubble + low groan
        this._noiseBurst(t, 0.35, 0.045, 320, 80);
        this._tone(68, "sine", t, 0.06, 0.5, 0.045, 48); break;
      case "Frozen Deep": // ice creak
        this._tone(1300, "sawtooth", t, 0.02, 0.22, 0.03, 680); break;
      case "Rocky Mantle": // distant rockfall rumble
        this._noiseBurst(t, 0.5, 0.04, 200, 55); break;
    }
  }

  // ---------- one-shot SFX ----------
  _env(node, gainNode, t0, attack, decay, peak = 1) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.start(t0); node.stop(t0 + attack + decay + 0.02);
  }
  _tone(freq, type, t0, attack, decay, peak, slideTo) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + attack + decay);
    const g = this.ctx.createGain(); o.connect(g); g.connect(this.master);
    this._env(o, g, t0, attack, decay, peak);
  }
  _noiseBurst(t0, dur, peak, filterFreq, sweepTo) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    n.connect(f); f.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.start(t0); n.stop(t0 + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case "pickup":
        this._tone(660, "sine", t, 0.01, 0.1, 0.25, 1180); break;
      case "sell":
        this._tone(880, "square", t, 0.005, 0.08, 0.16);
        this._tone(1320, "square", t + 0.09, 0.005, 0.1, 0.16); break;
      case "ui":
        this._tone(420, "square", t, 0.002, 0.05, 0.12); break;
      case "buy":
        this._tone(520, "triangle", t, 0.005, 0.07, 0.18, 780); break;
      case "explosion":
        this._noiseBurst(t, 0.45, 0.5, 1200, 80);
        this._tone(120, "sawtooth", t, 0.01, 0.4, 0.3, 40); break;
      case "lava":
        this._noiseBurst(t, 0.3, 0.3, 600, 120); break;
      case "alarm":
        this._tone(880, "square", t, 0.01, 0.12, 0.2);
        this._tone(880, "square", t + 0.18, 0.01, 0.12, 0.2); break;
      case "artifact":
        [523, 659, 784, 1047].forEach((f, i) =>
          this._tone(f, "triangle", t + i * 0.09, 0.01, 0.22, 0.18)); break;
      case "mission":
        [523, 659, 784].forEach((f, i) =>
          this._tone(f, "square", t + i * 0.11, 0.01, 0.18, 0.18)); break;
      case "win":
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this._tone(f, "triangle", t + i * 0.14, 0.01, 0.4, 0.2)); break;
      case "death":
        this._tone(220, "sawtooth", t, 0.02, 0.7, 0.3, 55);
        this._noiseBurst(t, 0.6, 0.3, 800, 60); break;
    }
  }

  // throttled alarm for low fuel / hull
  alarm() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastAlarm < 1.1) return;
    this._lastAlarm = now;
    this.sfx("alarm");
  }
}
