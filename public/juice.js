// Anorak Arcade — shared "juice" toolkit: audio + particle/float/shake FX + helpers.
// Keeps game-feel consistent across prototypes. Each game owns its canvas/ctx and
// drives the FX layer from its own loop.
(function () {
  const J = {};

  // ---------------- audio ----------------
  J._ac = null;
  J.unlock = function () {
    if (!J._ac) { try { J._ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (J._ac && J._ac.state === 'suspended') J._ac.resume();
    return J._ac;
  };
  // single tone with a soft attack/decay envelope
  J.tone = function (freq, dur, type, gain, when) {
    const ac = J._ac; if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), v = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(gain || 0.06, t + 0.012);
    v.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.15));
    o.connect(v); v.connect(ac.destination);
    o.start(t); o.stop(t + (dur || 0.15) + 0.02);
  };
  // ascending (or descending) run of notes — the "resolution" sparkle
  J.chord = function (base, n, opts) {
    opts = opts || {};
    const step = opts.step || 1.18, dur = opts.dur || 0.17, type = opts.type || 'triangle',
          g = opts.gain || 0.06, sp = opts.spacing || 0.045;
    for (let i = 0; i < n; i++) J.tone(base * Math.pow(step, i), dur, type, g, i * sp);
  };
  // quick helpers
  J.sfx = {
    tick(f) { J.tone(f || 420, 0.04, 'square', 0.03); },
    blip(f) { J.tone(f || 660, 0.08, 'triangle', 0.05); },
    bad()   { J.tone(150, 0.22, 'sawtooth', 0.07); },
    dead()  { J.tone(140, 0.6, 'sawtooth', 0.11); J.tone(70, 0.9, 'sine', 0.09, 0.05); },
    up(f)   { J.tone(f || 520, 0.12, 'sine', 0.06); J.tone((f || 520) * 1.5, 0.16, 'triangle', 0.06, 0.07); },
  };

  // ---------------- FX layer (particles / floaters / rings / shake) ----------------
  J.layer = function () {
    const parts = [], floats = [], rings = []; let shakeMag = 0;
    return {
      shake(m) { shakeMag = Math.max(shakeMag, m); },
      get shakeMag() { return shakeMag; },
      burst(x, y, color, n, o) {
        o = o || {}; n = n || 10;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, sp = (o.spread || 3) * (0.4 + Math.random());
          parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
            life: 1, decay: o.decay || 0.04, r: o.r || (2 + Math.random() * 2),
            color, grav: o.grav == null ? 0.12 : o.grav });
        }
      },
      float(x, y, text, color, o) {
        o = o || {};
        floats.push({ x, y, text, color: color || '#fff', life: 1, decay: o.decay || 0.016,
          vy: o.vy || -0.6, size: o.size || 22, sub: o.sub || null });
      },
      ring(x, y, color, maxR, o) {
        o = o || {};
        rings.push({ x, y, r: o.r0 || 8, maxR: maxR || 60, life: 1, decay: o.decay || 0.05, color, lw: o.lw || 3 });
      },
      update(dt) {
        const k = Math.max(0, Math.min(3, dt / 16.7));
        shakeMag *= Math.pow(0.86, k); if (shakeMag < 0.3) shakeMag = 0;
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * k; p.y += p.vy * k; p.vy += p.grav * k; p.life -= p.decay * k; if (p.life <= 0) parts.splice(i, 1); }
        for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.y += f.vy * k; f.life -= f.decay * k; if (f.life <= 0) floats.splice(i, 1); }
        for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.r += (r.maxR - r.r) * 0.18 * k; r.life -= r.decay * k; if (r.life <= 0) rings.splice(i, 1); }
      },
      // call inside the (optionally shake-translated) world transform
      render(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const r of rings) { if (r.r <= 0) continue; ctx.globalAlpha = Math.max(0, r.life) * 0.6; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over';
        for (const p of parts) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
        ctx.globalAlpha = 1;
        for (const f of floats) {
          ctx.globalAlpha = Math.max(0, Math.min(1, f.life)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = f.color; ctx.font = 'bold ' + f.size + 'px ui-monospace,monospace'; ctx.fillText(f.text, f.x, f.y);
          if (f.sub) { ctx.fillStyle = '#e7ecf5'; ctx.font = 'bold ' + Math.round(f.size * 0.52) + 'px ui-monospace,monospace'; ctx.fillText(f.sub, f.x, f.y + f.size * 0.78); }
        }
        ctx.globalAlpha = 1; ctx.restore();
      }
    };
  };

  // ---------------- vignette (danger / pressure tint at the edges) ----------------
  J.vignette = function (ctx, W, H, intensity, color) {
    if (intensity <= 0) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, (color || 'rgba(255,40,60,A)').replace('A', Math.min(0.6, intensity).toFixed(3)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };

  window.Juice = J;
})();
