// Anorak Arcade integration for Ecotone (NOT part of the game source).
//  1. Desktop-only gate: Ecotone is keyboard-controlled, so block touch phones.
//  2. Playtime tracking: report active play time to the shared leaderboard tracker.
// Owned by the arcade; re-injected by tools/sync-ecotone.sh on each rebuild.
(function () {
  var narrow = window.matchMedia('(max-width:820px)').matches;
  var touchOnly = window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(pointer:fine)').matches;

  if (narrow || touchOnly) {
    function gate() {
      if (document.getElementById('aa-gate')) return;
      var o = document.createElement('div');
      o.id = 'aa-gate';
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(600px 500px at 50% 30%,#11402a,#091d14 70%);' +
        'color:#e7ecf5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
        'padding:34px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
      o.innerHTML =
        '<div style="width:30px;height:30px;border-radius:6px;background:#7fc24a;transform:rotate(45deg);box-shadow:0 0 28px #7fc24a;margin-bottom:22px"></div>' +
        '<div style="font-size:13px;letter-spacing:.32em;color:#7fc24a;margin-bottom:10px">ECOTONE</div>' +
        '<div style="font-size:22px;font-weight:700;margin-bottom:12px">Desktop only — for now</div>' +
        '<div style="color:#9fb0c9;max-width:330px;line-height:1.6;font-size:14px">Ecotone is played with a keyboard, so it isn’t ready for phones yet. Open the arcade on a computer to step into the wild.</div>' +
        '<a href="../index.html" style="margin-top:24px;background:#7fc24a;color:#08160d;font-weight:700;letter-spacing:.1em;padding:12px 24px;border-radius:9px;text-decoration:none">← Back to arcade</a>';
      document.body.appendChild(o);
    }
    if (document.body) gate(); else document.addEventListener('DOMContentLoaded', gate);
    return;
  }

  // ---- playtime tracking (desktop) ----
  // Ecotone has no score, so we only report active time: tab visible + recent input.
  var lastInput = 0;
  ['keydown', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true });
  });
  var last = Date.now();
  setInterval(function () {
    var now = Date.now(), dt = now - last; last = now;
    if (dt < 0 || dt > 4000) return;                  // backgrounded / throttled tick
    if (document.visibilityState !== 'visible') return;
    if (now - lastInput > 30000) return;              // idle — not actively playing
    if (window.GameStats) window.GameStats.ping('ECOTONE', dt);
  }, 1000);
})();
