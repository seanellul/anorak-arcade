// Anorak Arcade integration for Motherload (NOT part of the game source).
//  1. Desktop-only gate: Motherload needs a keyboard/gamepad, so block touch phones.
//  2. Playtime tracking: report active run time to the shared leaderboard tracker.
// This file is owned by the arcade and is preserved across `tools/sync-motherload.sh`.
(function () {
  var narrow = window.matchMedia('(max-width:820px)').matches;
  var touchOnly = window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(pointer:fine)').matches;

  if (narrow || touchOnly) {
    // ---- desktop-only gate ----
    function gate() {
      if (document.getElementById('aa-gate')) return;
      var o = document.createElement('div');
      o.id = 'aa-gate';
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(600px 500px at 50% 30%,#1c1408,#0a0e14 70%);' +
        'color:#e7ecf5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
        'padding:34px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
      o.innerHTML =
        '<div style="width:30px;height:30px;border-radius:6px;background:#e8a13a;transform:rotate(45deg);box-shadow:0 0 28px #e8a13a;margin-bottom:22px"></div>' +
        '<div style="font-size:13px;letter-spacing:.32em;color:#e8a13a;margin-bottom:10px">MOTHERLOAD</div>' +
        '<div style="font-size:22px;font-weight:700;margin-bottom:12px">Desktop only — for now</div>' +
        '<div style="color:#9fb0c9;max-width:330px;line-height:1.6;font-size:14px">Motherload needs a keyboard or gamepad, so it isn’t playable on phones yet. Open the arcade on a computer to dig in.</div>' +
        '<a href="../index.html" style="margin-top:24px;background:#e8a13a;color:#1a0d06;font-weight:700;letter-spacing:.1em;padding:12px 24px;border-radius:9px;text-decoration:none">← Back to arcade</a>';
      document.body.appendChild(o);
    }
    if (document.body) gate(); else document.addEventListener('DOMContentLoaded', gate);
    return; // don't run the playtime tracker — it isn't playable here
  }

  // ---- playtime tracking + high score (desktop) ----
  // Time: count active run time (HUD visible, tab focused).
  // Score: submit max depth reached (metres) when a run ends (game-over or victory).
  var last = Date.now();
  var submitted = false;
  function runEnded() {
    var go = document.getElementById('gameover-screen'), win = document.getElementById('victory-screen');
    var goV = go && !go.classList.contains('hidden');
    var winV = win && !win.classList.contains('hidden');
    return goV || winV;
  }
  setInterval(function () {
    var now = Date.now(), dt = now - last; last = now;

    // score: on the transition into a game-over / victory screen, submit max depth once
    if (window.GameStats) {
      if (runEnded()) {
        if (!submitted) {
          submitted = true;
          var g = window.__game;
          var depth = (g && g.state && g.state.stats && g.state.stats.maxDepth) || 0;
          if (depth > 0) window.GameStats.submitScore('MOTHERLOAD', Math.round(depth));
        }
      } else {
        submitted = false; // back in a run / menu — arm for the next ending
      }
    }

    // time: only while actively playing
    if (dt < 0 || dt > 4000) return;                 // backgrounded / throttled tick — don't count
    if (document.visibilityState !== 'visible') return;
    var hud = document.getElementById('hud');
    if (hud && !hud.classList.contains('hidden') && window.GameStats) {
      window.GameStats.ping('MOTHERLOAD', dt);
    }
  }, 1000);
})();
